# OrchestrateKit MCP project state

Updated: 2026-08-01

Portfolio sequence and estimates: [`docs/PORTFOLIO_ROADMAP_2026-08-01.md`](docs/PORTFOLIO_ROADMAP_2026-08-01.md).

## Outcome

The MCP is now a credible deterministic planner and DASH build-brief exporter. Manifest v2 is merged, the 2026-07-28 protocol revision is served, anonymous public-feed goals take a proven zero-credential RSS/Atom/GET path, and computer-on/local-output goals now recommend the local runtime instead of paid self-hosting. The next immediate work is the News Scout build proof itself (MAR-457, owned by DASH).

## Current wave

1. MAR-455: proven — anonymous public feeds route to RSS/Atom/GET with explicit `network: read` and no credential-bearing connection.
2. MAR-456: proven — a computer-on goal whose output is a local file recommends the local scheduled runtime, not paid self-hosting; `hosting_and_monitoring` and the `build_surface` question round agree. The scheduled_trigger/cadence manifest-export drift with MAR-457 is resolved by ADR (`docs/ADR-MAR-456-scheduled-trigger-manifest-export.md`); implementation is tracked separately as MAR-463.
3. Keep manifest-v2 export compatible with the now-proven DASH handoff and MAR-457 News Scout.
4. After the useful loop is proven, run MAR-459 conformance and MAR-460 public-runner policy, then evaluate MCP Apps and MCP Tasks.

`MAR-426`, `MAR-427`, `MAR-448`, `MAR-455`, and `MAR-456` are implemented and reconciled in Linear. MAR-463 (manifest-export cadence gating) is the follow-up MAR-456 left planned. MAR-459 and MAR-460 own the post-demo standards/policy work. Exact lifecycle evidence is indexed in `.orchestrate/state.json`.

## Product direction

The valuable distinction is not another chat wrapper. The MCP should turn fuzzy intent into an inspectable, portable agent contract: constraints, permissions, gates, deterministic artifact, and evidence-ready handoff. Rich UI should expose that contract without weakening its deterministic core.
