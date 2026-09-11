"""
SPP Cushing Electricity-Stress Factor Engine v3
================================================

Research goal
-------------
Build a defensible, no-lookahead electricity-stress factor from Southwest
Power Pool (SPP) RTBM LMP-by-bus data, then test whether that factor has
predictive relationship with oil-market targets.

IMPORTANT
---------
This engine does NOT assume electricity congestion equals pipeline pumping.
It treats SPP prices/congestion as a candidate regional industrial/grid factor
whose relationship with Cushing oil activity must be empirically validated.

Official SPP RTBM bus fields supported:
    GMTIntervalEnd, Pnode, LMP, MEC, MCC, MLC

Main v3 upgrades
----------------
1. Historical daily-file URL support.
2. Candidate PNode discovery by researcher-supplied keywords.
3. Robust no-lookahead median/MAD anomaly scores.
4. Data-quality diagnostics and LMP component residual checks.
5. Multi-node regional breadth + tail-stress aggregation.
6. Event clustering so consecutive 5-minute spikes count as one episode.
7. Daily research-factor export.
8. Oil-target forward-return IC / event study.
9. Circular-shift permutation p-values to reduce false alpha excitement.
10. Synthetic mechanical + economic-validation demos.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from io import BytesIO, StringIO
from pathlib import Path
from typing import Iterable, Optional, Sequence
from urllib.parse import quote
from urllib.request import Request, urlopen

import json
import math

import numpy as np
import pandas as pd


SPP_DOWNLOAD_BASE = "https://portal.spp.org/file-browser-api/download"
SPP_RTBM_BUS_ENDPOINT = "rtbm-lmp-by-bus"

LATEST_URL = (
    f"{SPP_DOWNLOAD_BASE}/{SPP_RTBM_BUS_ENDPOINT}"
    "?path=%2FRTBM-LMP-B-latestInterval.csv"
)

OFFICIAL_COLUMNS = {"GMTIntervalEnd", "Pnode", "LMP", "MEC", "MCC", "MLC"}

NORMALIZED_COLUMNS = [
    "timestamp",
    "node_id",
    "lmp_usd",
    "energy_component_usd",
    "congestion_component_usd",
    "loss_component_usd",
]


@dataclass(frozen=True)
class StressConfig:
    # 12 hours of 5-minute data by default.
    window: int = 144
    min_history: int = 72

    # Component anomaly mapping.
    z_floor: float = 1.0
    z_ceiling: float = 5.0

    # Per-node score gates.
    stress_threshold: float = 70.0
    extreme_threshold: float = 90.0

    # Consecutive intervals inside this gap are one event episode.
    event_gap_minutes: int = 15

    # Component weights.
    w_mcc: float = 0.55
    w_lmp: float = 0.25
    w_share: float = 0.20

    # Regional aggregation weights.
    regional_w_median: float = 0.45
    regional_w_p90: float = 0.30
    regional_w_breadth: float = 0.25

    # Data-quality tolerances.
    component_residual_tolerance: float = 0.05


@dataclass(frozen=True)
class ValidationConfig:
    horizons: tuple[int, ...] = (1, 2, 3, 5)
    event_quantile: float = 0.90
    permutations: int = 500
    random_seed: int = 7
    min_rows: int = 20


def build_spp_daily_url(date: str | pd.Timestamp) -> str:
    """
    Build the official daily-file URL pattern used by SPP/gridstatus:
      /YYYY/MM/By_Day/RTBM-LMP-DAILY-B-YYYYMMDD.csv
    """
    dt = pd.Timestamp(date)
    path = (
        f"/{dt:%Y}/{dt:%m}/By_Day/"
        f"RTBM-LMP-DAILY-B-{dt:%Y%m%d}.csv"
    )
    return f"{SPP_DOWNLOAD_BASE}/{SPP_RTBM_BUS_ENDPOINT}?path={quote(path, safe='')}"


def _download_csv(url: str, timeout: int = 45) -> pd.DataFrame:
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 quant-research/3.0"})
    with urlopen(req, timeout=timeout) as response:
        payload = response.read()
    return pd.read_csv(BytesIO(payload))


def fetch_latest_spp_rtbm_bus(timeout: int = 45) -> pd.DataFrame:
    return _download_csv(LATEST_URL, timeout=timeout)


def fetch_spp_rtbm_bus_daily(
    start: str | pd.Timestamp,
    end: Optional[str | pd.Timestamp] = None,
    timeout: int = 45,
    ignore_missing: bool = True,
) -> pd.DataFrame:
    """
    Download daily SPP RTBM bus files for [start, end], inclusive.
    Designed for historical research.
    """
    start_ts = pd.Timestamp(start).normalize()
    end_ts = pd.Timestamp(end if end is not None else start).normalize()

    if end_ts < start_ts:
        raise ValueError("end must be on or after start")

    frames = []
    errors = []
    for dt in pd.date_range(start_ts, end_ts, freq="D"):
        url = build_spp_daily_url(dt)
        try:
            frames.append(_download_csv(url, timeout=timeout))
        except Exception as exc:
            errors.append((str(dt.date()), str(exc)))
            if not ignore_missing:
                raise

    if not frames:
        raise RuntimeError(f"No SPP files downloaded. Errors={errors[:5]}")

    out = pd.concat(frames, ignore_index=True)
    out.attrs["download_errors"] = errors
    return out


def normalize_spp_schema(raw: pd.DataFrame) -> pd.DataFrame:
    df = raw.copy()
    df.columns = [str(c).strip() for c in df.columns]

    if OFFICIAL_COLUMNS.issubset(df.columns):
        out = pd.DataFrame(
            {
                "timestamp": pd.to_datetime(
                    df["GMTIntervalEnd"], utc=True, errors="coerce"
                ),
                "node_id": df["Pnode"].astype(str).str.strip(),
                "lmp_usd": pd.to_numeric(df["LMP"], errors="coerce"),
                "energy_component_usd": pd.to_numeric(df["MEC"], errors="coerce"),
                "congestion_component_usd": pd.to_numeric(df["MCC"], errors="coerce"),
                "loss_component_usd": pd.to_numeric(df["MLC"], errors="coerce"),
            }
        )
    elif set(NORMALIZED_COLUMNS).issubset(df.columns):
        out = df[NORMALIZED_COLUMNS].copy()
        out["timestamp"] = pd.to_datetime(out["timestamp"], utc=True, errors="coerce")
        out["node_id"] = out["node_id"].astype(str).str.strip()
        for c in NORMALIZED_COLUMNS[2:]:
            out[c] = pd.to_numeric(out[c], errors="coerce")
    else:
        raise ValueError(
            "Unrecognized schema. Expected official SPP fields "
            f"{sorted(OFFICIAL_COLUMNS)} or normalized fields {NORMALIZED_COLUMNS}."
        )

    out = out.dropna(subset=NORMALIZED_COLUMNS).copy()
    out["component_sum_usd"] = (
        out["energy_component_usd"]
        + out["congestion_component_usd"]
        + out["loss_component_usd"]
    )
    out["component_residual_usd"] = out["lmp_usd"] - out["component_sum_usd"]

    return (
        out.sort_values(["node_id", "timestamp"])
        .drop_duplicates(["node_id", "timestamp"], keep="last")
        .reset_index(drop=True)
    )


def discover_node_candidates(
    raw_or_normalized: pd.DataFrame,
    keywords: Sequence[str],
    max_results: int = 100,
) -> pd.DataFrame:
    """
    Search PNode IDs by substrings such as:
        CUSH, BRISTOW, GREENWOOD, TIGER, SHELL

    This is discovery only. A matching name is not proof that a bus measures
    a specific pipeline or storage facility.
    """
    df = normalize_spp_schema(raw_or_normalized)
    keys = [str(k).strip().upper() for k in keywords if str(k).strip()]
    if not keys:
        raise ValueError("At least one non-empty keyword is required")

    nodes = pd.Series(df["node_id"].drop_duplicates().sort_values(), name="node_id")
    mask = nodes.str.upper().apply(lambda x: any(k in x for k in keys))
    hits = nodes[mask].head(max_results).to_frame()
    hits["matched_keywords"] = hits["node_id"].str.upper().apply(
        lambda x: ",".join(k for k in keys if k in x)
    )
    return hits.reset_index(drop=True)


def filter_nodes(
    raw_or_normalized: pd.DataFrame,
    node_ids: Optional[Iterable[str]],
) -> pd.DataFrame:
    df = normalize_spp_schema(raw_or_normalized)
    if not node_ids:
        return df

    wanted = {str(x).strip() for x in node_ids if str(x).strip()}
    out = df[df["node_id"].isin(wanted)].copy()
    if out.empty:
        raise ValueError(f"Requested PNodes not found: {sorted(wanted)}")
    return out.reset_index(drop=True)


def data_quality_report(
    raw_or_normalized: pd.DataFrame,
    config: StressConfig = StressConfig(),
) -> dict:
    df = normalize_spp_schema(raw_or_normalized)

    per_node = []
    for node, x in df.groupby("node_id"):
        x = x.sort_values("timestamp")
        diffs = x["timestamp"].diff().dropna().dt.total_seconds() / 60.0
        expected_5m_share = float(np.mean(np.isclose(diffs, 5.0))) if len(diffs) else np.nan
        bad_residual_share = float(
            (x["component_residual_usd"].abs() > config.component_residual_tolerance).mean()
        )
        per_node.append(
            {
                "node_id": node,
                "rows": int(len(x)),
                "start": str(x["timestamp"].min()),
                "end": str(x["timestamp"].max()),
                "five_minute_continuity_share": expected_5m_share,
                "bad_component_residual_share": bad_residual_share,
                "max_abs_component_residual": float(
                    x["component_residual_usd"].abs().max()
                ),
            }
        )

    return {
        "rows": int(len(df)),
        "nodes": int(df["node_id"].nunique()),
        "duplicate_node_timestamps": int(
            df.duplicated(["node_id", "timestamp"]).sum()
        ),
        "per_node": per_node,
    }


def _rolling_robust_location_scale(
    series: pd.Series,
    window: int,
    min_history: int,
) -> tuple[pd.Series, pd.Series]:
    """
    Prior-only rolling median and robust MAD scale.
    Current observation is excluded via shift(1).
    """
    h = series.astype(float).shift(1)
    median = h.rolling(window, min_periods=min_history).median()

    # Rolling MAD needs an apply because dispersion is relative to each
    # window's own median.
    mad = h.rolling(window, min_periods=min_history).apply(
        lambda a: np.median(np.abs(a - np.median(a))),
        raw=True,
    )
    robust_scale = 1.4826 * mad

    # Fall back to prior rolling standard deviation when MAD degenerates.
    std = h.rolling(window, min_periods=min_history).std(ddof=1)
    scale = robust_scale.where(robust_scale > 1e-12, std)
    scale = scale.replace(0.0, np.nan)
    return median, scale


def _robust_abs_z(
    series: pd.Series,
    window: int,
    min_history: int,
    transform_abs: bool = False,
) -> pd.Series:
    x = series.astype(float).abs() if transform_abs else series.astype(float)
    median, scale = _rolling_robust_location_scale(x, window, min_history)
    return (x - median).abs() / scale


def _z_to_score(z: pd.Series, floor: float, ceiling: float) -> pd.Series:
    if ceiling <= floor:
        raise ValueError("z_ceiling must be greater than z_floor")
    return (((z - floor) / (ceiling - floor)) * 100.0).clip(0.0, 100.0)


def analyze_node_stress(
    raw_or_normalized: pd.DataFrame,
    config: StressConfig = StressConfig(),
) -> pd.DataFrame:
    """
    Calculate no-lookahead robust stress features per PNode.
    """
    if not np.isclose(config.w_mcc + config.w_lmp + config.w_share, 1.0):
        raise ValueError("Node component weights must sum to 1")

    df = normalize_spp_schema(raw_or_normalized)
    outputs = []

    for node, x in df.groupby("node_id", sort=False):
        x = x.sort_values("timestamp").copy()

        x["abs_congestion_usd"] = x["congestion_component_usd"].abs()
        x["congestion_share"] = (
            x["abs_congestion_usd"] / x["lmp_usd"].abs().clip(lower=1.0)
        )

        x["mcc_robust_z"] = _robust_abs_z(
            x["congestion_component_usd"],
            config.window,
            config.min_history,
            transform_abs=True,
        )
        x["lmp_robust_z"] = _robust_abs_z(
            x["lmp_usd"],
            config.window,
            config.min_history,
            transform_abs=False,
        )
        x["share_robust_z"] = _robust_abs_z(
            x["congestion_share"],
            config.window,
            config.min_history,
            transform_abs=False,
        )

        mcc_s = _z_to_score(x["mcc_robust_z"], config.z_floor, config.z_ceiling)
        lmp_s = _z_to_score(x["lmp_robust_z"], config.z_floor, config.z_ceiling)
        share_s = _z_to_score(x["share_robust_z"], config.z_floor, config.z_ceiling)

        x["history_ready"] = (
            x["mcc_robust_z"].notna()
            & x["lmp_robust_z"].notna()
            & x["share_robust_z"].notna()
        )

        x["node_stress_score"] = (
            config.w_mcc * mcc_s.fillna(0.0)
            + config.w_lmp * lmp_s.fillna(0.0)
            + config.w_share * share_s.fillna(0.0)
        )

        # Residual sanity gate: malformed component decomposition should not
        # create a tradable event.
        x["component_quality_ok"] = (
            x["component_residual_usd"].abs()
            <= config.component_residual_tolerance
        )

        x["node_stress_flag"] = (
            x["history_ready"]
            & x["component_quality_ok"]
            & (x["node_stress_score"] >= config.stress_threshold)
        )
        x["node_extreme_flag"] = (
            x["history_ready"]
            & x["component_quality_ok"]
            & (x["node_stress_score"] >= config.extreme_threshold)
        )

        outputs.append(x)

    return (
        pd.concat(outputs, ignore_index=True)
        .sort_values(["timestamp", "node_id"])
        .reset_index(drop=True)
    )


def aggregate_regional_factor(
    analyzed: pd.DataFrame,
    config: StressConfig = StressConfig(),
) -> pd.DataFrame:
    """
    Combine multiple PNodes.

    regional score =
        45% cross-sectional median node stress
        30% 90th percentile node stress
        25% breadth of nodes above the node stress gate

    This makes one noisy node less dominant while preserving local tail stress.
    """
    if not np.isclose(
        config.regional_w_median
        + config.regional_w_p90
        + config.regional_w_breadth,
        1.0,
    ):
        raise ValueError("Regional weights must sum to 1")

    required = {
        "timestamp",
        "node_id",
        "node_stress_score",
        "node_stress_flag",
        "node_extreme_flag",
        "history_ready",
    }
    missing = required - set(analyzed.columns)
    if missing:
        raise ValueError(f"Missing analyzed columns: {sorted(missing)}")

    def q90(s: pd.Series) -> float:
        return float(s.quantile(0.90))

    agg = (
        analyzed.groupby("timestamp", as_index=False)
        .agg(
            median_node_stress=("node_stress_score", "median"),
            p90_node_stress=("node_stress_score", q90),
            max_node_stress=("node_stress_score", "max"),
            stressed_node_share=("node_stress_flag", "mean"),
            extreme_node_share=("node_extreme_flag", "mean"),
            nodes_observed=("node_id", "nunique"),
            nodes_ready=("history_ready", "sum"),
        )
        .sort_values("timestamp")
        .reset_index(drop=True)
    )

    agg["regional_stress_score"] = (
        config.regional_w_median * agg["median_node_stress"]
        + config.regional_w_p90 * agg["p90_node_stress"]
        + config.regional_w_breadth * 100.0 * agg["stressed_node_share"]
    )

    return agg


def cluster_stress_events(
    regional: pd.DataFrame,
    threshold: float = 70.0,
    gap_minutes: int = 15,
) -> pd.DataFrame:
    """
    Collapse consecutive stress intervals into episodes.
    """
    x = regional.sort_values("timestamp").copy()
    active = x[x["regional_stress_score"] >= threshold].copy()

    if active.empty:
        return pd.DataFrame(
            columns=[
                "event_id",
                "start",
                "end",
                "intervals",
                "duration_minutes",
                "peak_score",
                "mean_score",
                "peak_breadth",
            ]
        )

    gap = active["timestamp"].diff().dt.total_seconds().div(60.0)
    active["event_id"] = ((gap.isna()) | (gap > gap_minutes)).cumsum()

    events = (
        active.groupby("event_id", as_index=False)
        .agg(
            start=("timestamp", "min"),
            end=("timestamp", "max"),
            intervals=("timestamp", "size"),
            peak_score=("regional_stress_score", "max"),
            mean_score=("regional_stress_score", "mean"),
            peak_breadth=("stressed_node_share", "max"),
        )
    )
    events["duration_minutes"] = (
        (events["end"] - events["start"]).dt.total_seconds() / 60.0 + 5.0
    )
    return events[
        [
            "event_id",
            "start",
            "end",
            "intervals",
            "duration_minutes",
            "peak_score",
            "mean_score",
            "peak_breadth",
        ]
    ]


def build_daily_factor(
    regional: pd.DataFrame,
    events: Optional[pd.DataFrame] = None,
) -> pd.DataFrame:
    """
    Convert 5-minute regional series into a daily research factor.
    """
    x = regional.copy()
    x["date"] = x["timestamp"].dt.floor("D")

    daily = (
        x.groupby("date", as_index=False)
        .agg(
            stress_mean=("regional_stress_score", "mean"),
            stress_median=("regional_stress_score", "median"),
            stress_max=("regional_stress_score", "max"),
            breadth_mean=("stressed_node_share", "mean"),
            breadth_max=("stressed_node_share", "max"),
            extreme_breadth_max=("extreme_node_share", "max"),
            observations=("timestamp", "size"),
        )
    )

    if events is not None and not events.empty:
        ev = events.copy()
        ev["date"] = ev["start"].dt.floor("D")
        ev_daily = (
            ev.groupby("date", as_index=False)
            .agg(
                event_count=("event_id", "size"),
                event_minutes=("duration_minutes", "sum"),
                event_peak=("peak_score", "max"),
            )
        )
        daily = daily.merge(ev_daily, on="date", how="left")
    else:
        daily["event_count"] = 0
        daily["event_minutes"] = 0.0
        daily["event_peak"] = 0.0

    for c in ["event_count", "event_minutes", "event_peak"]:
        daily[c] = daily[c].fillna(0)

    # Composite daily factor emphasizes sustained and peak stress.
    daily["cushing_power_factor"] = (
        0.35 * daily["stress_mean"]
        + 0.35 * daily["stress_max"]
        + 0.20 * 100.0 * daily["breadth_mean"]
        + 0.10 * daily["event_peak"]
    ).clip(0.0, 100.0)

    return daily.sort_values("date").reset_index(drop=True)


def _spearman(a: pd.Series, b: pd.Series) -> float:
    z = pd.concat([a, b], axis=1).dropna()
    if len(z) < 3:
        return np.nan
    return float(z.iloc[:, 0].rank().corr(z.iloc[:, 1].rank()))


def _circular_shift_pvalue(
    factor: np.ndarray,
    target: np.ndarray,
    observed_ic: float,
    permutations: int,
    seed: int,
) -> float:
    """
    Circularly shift the target series instead of shuffling individual rows.
    This keeps much more of the target's serial structure intact.
    """
    if len(factor) < 4 or not np.isfinite(observed_ic):
        return np.nan

    rng = np.random.default_rng(seed)
    n = len(factor)
    valid_shifts = np.arange(1, n)
    sims = []

    for _ in range(permutations):
        shift = int(rng.choice(valid_shifts))
        shifted = np.roll(target, shift)
        sim = _spearman(pd.Series(factor), pd.Series(shifted))
        if np.isfinite(sim):
            sims.append(sim)

    if not sims:
        return np.nan

    sims = np.asarray(sims)
    return float((1 + np.sum(np.abs(sims) >= abs(observed_ic))) / (len(sims) + 1))


def validate_against_oil(
    daily_factor: pd.DataFrame,
    oil_prices: pd.DataFrame,
    price_col: str = "price",
    date_col: str = "date",
    factor_col: str = "cushing_power_factor",
    config: ValidationConfig = ValidationConfig(),
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Validate predictive relationship against daily oil prices.

    Returns
    -------
    summary:
        IC, permutation p-value, event vs unconditional forward returns.
    aligned:
        factor/price/forward-return rows used in research.

    NOTE:
        Statistical relationship is not causal proof.
    """
    f = daily_factor[["date", factor_col]].copy()
    f["date"] = pd.to_datetime(f["date"], utc=True, errors="coerce").dt.floor("D")

    p = oil_prices[[date_col, price_col]].copy()
    p["date"] = pd.to_datetime(p[date_col], utc=True, errors="coerce").dt.floor("D")
    p["price"] = pd.to_numeric(p[price_col], errors="coerce")
    p = p[["date", "price"]].dropna().sort_values("date")

    aligned = (
        f.merge(p, on="date", how="inner")
        .sort_values("date")
        .drop_duplicates("date")
        .reset_index(drop=True)
    )

    if len(aligned) < config.min_rows:
        raise ValueError(
            f"Need at least {config.min_rows} overlapping daily rows; got {len(aligned)}"
        )

    event_gate = float(aligned[factor_col].quantile(config.event_quantile))
    aligned["high_stress_event"] = aligned[factor_col] >= event_gate

    rows = []
    for h in config.horizons:
        col = f"fwd_return_{h}d"
        aligned[col] = aligned["price"].shift(-h) / aligned["price"] - 1.0

        sample = aligned[[factor_col, col, "high_stress_event"]].dropna()
        ic = _spearman(sample[factor_col], sample[col])

        pvalue = _circular_shift_pvalue(
            sample[factor_col].to_numpy(),
            sample[col].to_numpy(),
            ic,
            config.permutations,
            config.random_seed + h,
        )

        event_ret = sample.loc[sample["high_stress_event"], col]
        all_ret = sample[col]

        rows.append(
            {
                "horizon_days": int(h),
                "rows": int(len(sample)),
                "spearman_ic": ic,
                "circular_shift_pvalue": pvalue,
                "event_threshold": event_gate,
                "event_count": int(sample["high_stress_event"].sum()),
                "event_mean_fwd_return": float(event_ret.mean()) if len(event_ret) else np.nan,
                "unconditional_mean_fwd_return": float(all_ret.mean()),
                "event_minus_unconditional": (
                    float(event_ret.mean() - all_ret.mean())
                    if len(event_ret)
                    else np.nan
                ),
            }
        )

    return pd.DataFrame(rows), aligned


def save_research_bundle(
    out_dir: str | Path,
    analyzed_nodes: pd.DataFrame,
    regional: pd.DataFrame,
    events: pd.DataFrame,
    daily_factor: pd.DataFrame,
    quality: dict,
    validation_summary: Optional[pd.DataFrame] = None,
) -> Path:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    analyzed_nodes.to_csv(out / "node_stress.csv", index=False)
    regional.to_csv(out / "regional_stress.csv", index=False)
    events.to_csv(out / "events.csv", index=False)
    daily_factor.to_csv(out / "daily_factor.csv", index=False)

    if validation_summary is not None:
        validation_summary.to_csv(out / "oil_validation.csv", index=False)

    with (out / "quality_report.json").open("w", encoding="utf-8") as f:
        json.dump(quality, f, indent=2)

    return out


# ---------------------------------------------------------------------------
# Synthetic research validation
# ---------------------------------------------------------------------------

def make_synthetic_multinode_data(
    days: int = 40,
    nodes: int = 4,
    seed: int = 11,
) -> tuple[pd.DataFrame, pd.DatetimeIndex]:
    """
    Generate realistic-ish 5-minute multi-node data and inject recurring
    cross-node stress episodes.

    Used only to test mechanics.
    """
    rng = np.random.default_rng(seed)
    n = days * 288
    ts = pd.date_range("2026-01-01", periods=n, freq="5min", tz="UTC")

    # Inject one cross-node episode on selected days.
    episode_days = np.array([5, 9, 14, 20, 27, 33, 37])
    episode_starts = episode_days * 288 + 150
    # Keep only episodes that fit completely inside the requested sample.
    episode_starts = episode_starts[episode_starts + 5 <= n]

    frames = []
    for j in range(nodes):
        mec = 30 + rng.normal(0, 1.2, n)
        mlc = 0.4 + rng.normal(0, 0.08, n)
        mcc = 3.0 + rng.normal(0, 0.8, n)

        for start in episode_starts:
            width = 5
            # Slight node heterogeneity but all nodes participate.
            shock = np.array([8, 14, 22, 15, 8], dtype=float) * (1 + 0.08 * j)
            mcc[start:start + width] += shock

        lmp = mec + mcc + mlc
        frames.append(
            pd.DataFrame(
                {
                    "timestamp": ts,
                    "node_id": f"SYN_NODE_{j+1}",
                    "lmp_usd": lmp,
                    "energy_component_usd": mec,
                    "congestion_component_usd": mcc,
                    "loss_component_usd": mlc,
                }
            )
        )

    episode_times = ts[episode_starts]
    return pd.concat(frames, ignore_index=True), episode_times


def make_synthetic_oil_prices_from_factor(
    daily_factor: pd.DataFrame,
    seed: int = 22,
    effect_scale: float = -0.010,
) -> pd.DataFrame:
    """
    Synthetic oil price path where today's high electricity-stress factor
    predicts a next-day return effect.

    This intentionally creates a relationship so the validation machinery
    can be tested end-to-end.
    """
    rng = np.random.default_rng(seed)
    x = daily_factor.sort_values("date").reset_index(drop=True).copy()
    z = (
        x["cushing_power_factor"]
        - x["cushing_power_factor"].rolling(10, min_periods=5).mean()
    )
    denom = x["cushing_power_factor"].rolling(10, min_periods=5).std(ddof=1)
    z = (z / denom.replace(0, np.nan)).fillna(0.0).clip(-3, 3)

    returns = rng.normal(0.0003, 0.004, len(x))
    # factor[t] affects oil return from t -> t+1
    for t in range(len(x) - 1):
        returns[t + 1] += effect_scale * max(z.iloc[t], 0.0)

    price = 75.0 * np.cumprod(1.0 + returns)

    return pd.DataFrame({"date": x["date"], "price": price})


def demo() -> None:
    print("=== SPP Cushing Electricity-Stress Factor v3 ===")
    print("No claim that grid stress == pumping. Validation required.\n")

    cfg = StressConfig(window=72, min_history=36)
    raw, episode_times = make_synthetic_multinode_data(days=40, nodes=4)
    quality = data_quality_report(raw, cfg)
    analyzed = analyze_node_stress(raw, cfg)
    regional = aggregate_regional_factor(analyzed, cfg)
    events = cluster_stress_events(
        regional,
        threshold=cfg.stress_threshold,
        gap_minutes=cfg.event_gap_minutes,
    )
    daily = build_daily_factor(regional, events)

    oil = make_synthetic_oil_prices_from_factor(daily)
    vcfg = ValidationConfig(
        horizons=(1, 2, 3, 5),
        permutations=200,
        min_rows=20,
    )
    validation, _ = validate_against_oil(daily, oil, config=vcfg)

    print(f"Rows: {quality['rows']:,}")
    print(f"Nodes: {quality['nodes']}")
    print(f"Injected stress episodes: {len(episode_times)}")
    print(f"Detected event episodes: {len(events)}")
    print("\nValidation on deliberately linked synthetic oil series:")
    print(validation.to_string(index=False))

    print("\nFirst detected events:")
    print(events.head(10).to_string(index=False))


if __name__ == "__main__":
    demo()
