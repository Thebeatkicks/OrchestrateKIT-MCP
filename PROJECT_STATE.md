# OrchestrateKit MCP project state

Updated: 2026-08-01

Portfolio sequence and estimates: [`docs/PORTFOLIO_ROADMAP_2026-08-01.md`](docs/PORTFOLIO_ROADMAP_2026-08-01.md).

## Outcome

The MCP is now a credible deterministic planner and DASH build-brief exporter. Manifest v2 is merged, the 2026-07-28 protocol revision is served, and the next work is standards conformance and explicit public-runner policy rather than rebuilding the export path.

## Current wave

1. Add protocol conformance fixtures to CI (MAR-459).
2. Make public runner eligibility explicit and fail closed (MAR-460).
3. Keep manifest-v2 export compatible with the now-proven DASH handoff.
4. Evaluate MCP Apps for rich plan/build cards, then MCP Tasks for DASH-as-server orchestration.

`MAR-426`, `MAR-427`, and `MAR-448` are implemented and reconciled in Linear. MAR-455 and MAR-456 are the immediate MCP prerequisites for News Scout; MAR-459 and MAR-460 own the post-demo standards/policy work. Exact lifecycle evidence is indexed in `.orchestrate/state.json`.

## Product direction

The valuable distinction is not another chat wrapper. The MCP should turn fuzzy intent into an inspectable, portable agent contract: constraints, permissions, gates, deterministic artifact, and evidence-ready handoff. Rich UI should expose that contract without weakening its deterministic core.
