# SPP Cushing Electricity-Stress Factor Engine v3

This is a research engine, not a finished trading strategy.

## What changed from v2

- Uses official SPP RTBM bus schema (`GMTIntervalEnd`, `Pnode`, `LMP`, `MEC`, `MCC`, `MLC`).
- Supports SPP historical **daily bus files**.
- Can search PNode IDs by keywords instead of inventing a Cushing node.
- Uses **prior-only rolling median/MAD** robust anomaly scores.
- Rejects rows where LMP does not approximately equal MEC + MCC + MLC.
- Aggregates multiple nearby PNodes with median stress, tail stress, and breadth.
- Clusters consecutive spikes into one stress event.
- Builds a daily `cushing_power_factor` from 0 to 100.
- Validates against oil prices with:
  - forward-return Spearman IC,
  - high-stress event study,
  - circular-shift permutation p-values.

## Recommended real-data research sequence

1. Download 30-90 days of SPP daily RTBM bus files.
2. Run `discover_node_candidates()` with terms such as:
   `CUSH`, `BRISTOW`, `GREENWOOD`, `TIGER`, `SHELL`.
3. Verify candidate nodes independently before calling them "Cushing-area".
4. Run node stress -> regional factor -> daily factor.
5. Join against oil targets:
   - CL futures / WTI spot,
   - Cushing inventory changes,
   - prompt spreads (M1-M2),
   - crack spreads or pipeline/storage proxies.
6. Treat statistical significance as exploratory until it survives:
   - walk-forward periods,
   - multiple-testing correction,
   - regime splits,
   - realistic publication delays.

## Important interpretation

A high SPP congestion or LMP anomaly is **grid stress**. It is not direct evidence
that oil pipelines are pumping harder. The oil relationship must be demonstrated.
