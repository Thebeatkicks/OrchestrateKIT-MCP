# OrchestrateKit MCP project state

Updated: 2026-08-01

Portfolio sequence and estimates: [`docs/PORTFOLIO_ROADMAP_2026-08-01.md`](docs/PORTFOLIO_ROADMAP_2026-08-01.md).

## Outcome

The MCP is now a credible deterministic planner and DASH build-brief exporter. Manifest v2 is merged, the 2026-07-28 protocol revision is served, and the next work is standards conformance and explicit public-runner policy rather than rebuilding the export path.

## Current wave

1. MAR-455: route anonymous public feeds to RSS/GET rather than paid Firecrawl.
2. MAR-456: prefer the proven local DASH runner for a computer-on goal rather than paid self-hosting.
3. Keep manifest-v2 export compatible with the now-proven DASH handoff and MAR-457 News Scout.
4. After the useful loop is proven, run MAR-459 conformance and MAR-460 public-runner policy, then evaluate MCP Apps and MCP Tasks.

`MAR-426`, `MAR-427`, and `MAR-448` are implemented and reconciled in Linear. MAR-455 and MAR-456 are the immediate MCP prerequisites for News Scout; MAR-459 and MAR-460 own the post-demo standards/policy work. Exact lifecycle evidence is indexed in `.orchestrate/state.json`.

## Product direction

The valuable distinction is not another chat wrapper. The MCP should turn fuzzy intent into an inspectable, portable agent contract: constraints, permissions, gates, deterministic artifact, and evidence-ready handoff. Rich UI should expose that contract without weakening its deterministic core.
