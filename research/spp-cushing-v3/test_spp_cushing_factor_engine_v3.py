import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import spp_cushing_factor_engine_v3 as engine


def test_daily_url_pattern():
    url = engine.build_spp_daily_url("2026-09-10")
    assert "rtbm-lmp-by-bus" in url
    assert "RTBM-LMP-DAILY-B-20260910.csv" in url


def test_schema_and_component_identity():
    raw = pd.DataFrame(
        {
            "GMTIntervalEnd": ["2026-09-10T00:05:00Z"],
            "Pnode": ["CUSH_TEST"],
            "LMP": [34.5],
            "MEC": [30.2],
            "MCC": [3.8],
            "MLC": [0.5],
        }
    )
    out = engine.normalize_spp_schema(raw)
    assert out.loc[0, "node_id"] == "CUSH_TEST"
    assert np.isclose(out.loc[0, "component_residual_usd"], 0.0)


def test_node_discovery():
    raw, _ = engine.make_synthetic_multinode_data(days=2, nodes=4)
    hits = engine.discover_node_candidates(raw, ["SYN_NODE_2", "NODE_4"])
    assert set(hits["node_id"]) == {"SYN_NODE_2", "SYN_NODE_4"}


def test_no_lookahead_node_score():
    raw, _ = engine.make_synthetic_multinode_data(days=3, nodes=1)
    cfg = engine.StressConfig(window=48, min_history=24)
    base = engine.analyze_node_stress(raw, cfg)

    changed = raw.copy()
    cutoff = 500
    mask = changed.reset_index().index >= cutoff
    changed.loc[mask, "congestion_component_usd"] *= 50
    changed.loc[mask, "lmp_usd"] = (
        changed.loc[mask, "energy_component_usd"]
        + changed.loc[mask, "congestion_component_usd"]
        + changed.loc[mask, "loss_component_usd"]
    )
    alt = engine.analyze_node_stress(changed, cfg)

    a = base.loc[:cutoff-1, "node_stress_score"].to_numpy()
    b = alt.loc[:cutoff-1, "node_stress_score"].to_numpy()
    assert np.allclose(a, b, equal_nan=True)


def test_quality_gate_blocks_bad_component_row():
    raw, _ = engine.make_synthetic_multinode_data(days=2, nodes=1)
    cfg = engine.StressConfig(window=24, min_history=12)
    raw = raw.reset_index(drop=True)

    # Create huge apparent stress but deliberately break LMP decomposition.
    i = 400
    raw.loc[i, "congestion_component_usd"] = 500.0
    raw.loc[i, "lmp_usd"] = 30.0  # inconsistent by hundreds of dollars

    out = engine.analyze_node_stress(raw, cfg)
    assert out.loc[i, "component_quality_ok"] == False
    assert out.loc[i, "node_stress_flag"] == False


def test_event_clustering():
    ts = pd.date_range("2026-01-01", periods=8, freq="5min", tz="UTC")
    regional = pd.DataFrame(
        {
            "timestamp": ts,
            "regional_stress_score": [0, 80, 85, 0, 0, 75, 80, 0],
            "stressed_node_share": [0, .5, .75, 0, 0, .5, .5, 0],
        }
    )
    events = engine.cluster_stress_events(regional, threshold=70, gap_minutes=10)
    assert len(events) == 2
    assert events.loc[0, "intervals"] == 2
    assert events.loc[1, "intervals"] == 2


def test_multinode_synthetic_detects_injected_episodes():
    raw, injected = engine.make_synthetic_multinode_data(days=40, nodes=4)
    cfg = engine.StressConfig(window=72, min_history=36)
    analyzed = engine.analyze_node_stress(raw, cfg)
    regional = engine.aggregate_regional_factor(analyzed, cfg)
    events = engine.cluster_stress_events(
        regional, threshold=cfg.stress_threshold, gap_minutes=cfg.event_gap_minutes
    )

    # Every injected episode should have a detected event within 20 minutes.
    detected_starts = pd.to_datetime(events["start"], utc=True)
    for t in injected:
        nearest = np.min(np.abs((detected_starts - t).dt.total_seconds()))
        assert nearest <= 20 * 60


def test_economic_validation_finds_deliberate_link():
    raw, _ = engine.make_synthetic_multinode_data(days=50, nodes=4)
    cfg = engine.StressConfig(window=72, min_history=36)
    analyzed = engine.analyze_node_stress(raw, cfg)
    regional = engine.aggregate_regional_factor(analyzed, cfg)
    events = engine.cluster_stress_events(
        regional, threshold=cfg.stress_threshold, gap_minutes=cfg.event_gap_minutes
    )
    daily = engine.build_daily_factor(regional, events)
    oil = engine.make_synthetic_oil_prices_from_factor(
        daily, effect_scale=-0.02
    )

    vcfg = engine.ValidationConfig(
        horizons=(1,),
        permutations=300,
        min_rows=20,
        random_seed=123,
    )
    summary, _ = engine.validate_against_oil(daily, oil, config=vcfg)

    ic = float(summary.loc[0, "spearman_ic"])
    p = float(summary.loc[0, "circular_shift_pvalue"])
    assert ic < -0.25
    assert p < 0.10


def test_null_control_not_forced_to_significant():
    raw, _ = engine.make_synthetic_multinode_data(days=50, nodes=4)
    cfg = engine.StressConfig(window=72, min_history=36)
    analyzed = engine.analyze_node_stress(raw, cfg)
    regional = engine.aggregate_regional_factor(analyzed, cfg)
    events = engine.cluster_stress_events(
        regional, threshold=cfg.stress_threshold, gap_minutes=cfg.event_gap_minutes
    )
    daily = engine.build_daily_factor(regional, events)

    rng = np.random.default_rng(999)
    returns = rng.normal(0, 0.005, len(daily))
    oil = pd.DataFrame(
        {
            "date": daily["date"],
            "price": 75 * np.cumprod(1 + returns),
        }
    )

    vcfg = engine.ValidationConfig(
        horizons=(1,),
        permutations=200,
        min_rows=20,
        random_seed=321,
    )
    summary, _ = engine.validate_against_oil(daily, oil, config=vcfg)
    p = float(summary.loc[0, "circular_shift_pvalue"])

    # We only require that the null example is not suspiciously extreme.
    assert p > 0.02


if __name__ == "__main__":
    tests = [
        test_daily_url_pattern,
        test_schema_and_component_identity,
        test_node_discovery,
        test_no_lookahead_node_score,
        test_quality_gate_blocks_bad_component_row,
        test_event_clustering,
        test_multinode_synthetic_detects_injected_episodes,
        test_economic_validation_finds_deliberate_link,
        test_null_control_not_forced_to_significant,
    ]

    failures = []
    for t in tests:
        try:
            t()
            print(f"PASS  {t.__name__}")
        except Exception as exc:
            failures.append((t.__name__, repr(exc)))
            print(f"FAIL  {t.__name__}: {exc!r}")

    if failures:
        print("\nFAILURES:")
        for name, err in failures:
            print(f"- {name}: {err}")
        raise SystemExit(1)

    print(f"\nALL TESTS PASSED ({len(tests)}/{len(tests)})")
