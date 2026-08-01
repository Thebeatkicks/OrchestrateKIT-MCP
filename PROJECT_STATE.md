# OrchestrateKit MCP project state

Updated: 2026-08-01

Portfolio sequence and estimates: [`docs/PORTFOLIO_ROADMAP_2026-08-01.md`](docs/PORTFOLIO_ROADMAP_2026-08-01.md).

## Outcome

The MCP is now a credible deterministic planner and DASH build-brief exporter. Manifest v2 is merged, the 2026-07-28 protocol revision is served, anonymous public-feed goals take a proven zero-credential RSS/Atom/GET path, computer-on/local-output goals recommend the local runtime instead of paid self-hosting, and `export_build_brief` now gates `scheduled_trigger` out of the exported manifest until a build's cadence is explicitly enabled. The next immediate work is the News Scout build proof itself (MAR-457, owned by DASH), which can now consume this repo's manifest without a false-positive drift score.

## Current wave

1. MAR-455: proven — anonymous public feeds route to RSS/Atom/GET with explicit `network: read` and no credential-bearing connection.
2. MAR-456: proven — a computer-on goal whose output is a local file recommends the local scheduled runtime, not paid self-hosting; `hosting_and_monitoring` and the `build_surface` question round agree.
3. MAR-463: proven — `export_build_brief` accepts an explicit `cadence_enabled` signal; absent/false excludes `scheduled_trigger` from `agent_manifest.planned_route` and falls `agent_dom.trigger` back to manual, per `docs/ADR-MAR-456-scheduled-trigger-manifest-export.md`. `plan_workflow`'s `recommended_route` is unaffected — it stays the full-agent description. DASH-side consumption of the field remains a separate, not-yet-filed companion ticket.
4. Keep manifest-v2 export compatible with the now-proven DASH handoff and MAR-457 News Scout.
5. After the useful loop is proven, run MAR-459 conformance and MAR-460 public-runner policy, then evaluate MCP Apps and MCP Tasks.

`MAR-426`, `MAR-427`, `MAR-448`, `MAR-455`, `MAR-456`, and `MAR-463` are implemented and reconciled in Linear. MAR-459 and MAR-460 own the post-demo standards/policy work. Exact lifecycle evidence is indexed in `.orchestrate/state.json`.

## Product direction

The valuable distinction is not another chat wrapper. The MCP should turn fuzzy intent into an inspectable, portable agent contract: constraints, permissions, gates, deterministic artifact, and evidence-ready handoff. Rich UI should expose that contract without weakening its deterministic core.
