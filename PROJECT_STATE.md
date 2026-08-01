# OrchestrateKit MCP project state

Updated: 2026-08-01

Portfolio sequence and estimates: [`docs/PORTFOLIO_ROADMAP_2026-08-01.md`](docs/PORTFOLIO_ROADMAP_2026-08-01.md).

## Outcome

The MCP is now a credible deterministic planner and DASH build-brief exporter. Manifest v2 is merged, the 2026-07-28 protocol revision is served, and anonymous public-feed goals now take a proven zero-credential RSS/Atom/GET path. The next immediate work is local-runner selection for computer-on goals before the News Scout build proof.

## Current wave

1. MAR-455: proven — anonymous public feeds route to RSS/Atom/GET with explicit `network: read` and no credential-bearing connection.
2. MAR-456: prefer the proven local DASH runner for a computer-on goal rather than paid self-hosting.
3. Keep manifest-v2 export compatible with the now-proven DASH handoff and MAR-457 News Scout.
4. After the useful loop is proven, run MAR-459 conformance and MAR-460 public-runner policy, then evaluate MCP Apps and MCP Tasks.

`MAR-426`, `MAR-427`, `MAR-448`, and `MAR-455` are implemented and reconciled in Linear. MAR-456 remains the immediate MCP prerequisite for the MAR-457 News Scout build proof; MAR-459 and MAR-460 own the post-demo standards/policy work. Exact lifecycle evidence is indexed in `.orchestrate/state.json`.

## Product direction

The valuable distinction is not another chat wrapper. The MCP should turn fuzzy intent into an inspectable, portable agent contract: constraints, permissions, gates, deterministic artifact, and evidence-ready handoff. Rich UI should expose that contract without weakening its deterministic core.
