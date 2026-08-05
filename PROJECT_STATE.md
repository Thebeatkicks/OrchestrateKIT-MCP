# OrchestrateKit MCP project state

Updated: 2026-08-05

Portfolio sequence and estimates: [`docs/PORTFOLIO_ROADMAP_2026-08-01.md`](docs/PORTFOLIO_ROADMAP_2026-08-01.md).

## Outcome

The MCP is now a credible deterministic planner and DASH build-brief exporter. Manifest v2 is merged, the 2026-07-28 protocol revision is served, anonymous public-feed goals take a proven zero-credential RSS/Atom/GET path, computer-on/local-output goals recommend the local runtime instead of paid self-hosting, `export_build_brief` gates `scheduled_trigger` out of the exported manifest until a build's cadence is explicitly enabled, the served protocol revisions are pinned as named CI evidence, and public-runner eligibility fails closed. The post-demo standards wave (MAR-459/460) is closed. Current work is MAR-481's remote-runtime epic: `export_build_brief` gains a deploy section for the self-hosted/remote path (MAR-486, PR open, human-gated merge pending).

## Current wave

1. MAR-455: proven — anonymous public feeds route to RSS/Atom/GET with explicit `network: read` and no credential-bearing connection.
2. MAR-456: proven — a computer-on goal whose output is a local file recommends the local scheduled runtime, not paid self-hosting; `hosting_and_monitoring` and the `build_surface` question round agree.
3. MAR-463: proven — `export_build_brief` accepts an explicit `cadence_enabled` signal; absent/false excludes `scheduled_trigger` from `agent_manifest.planned_route` and falls `agent_dom.trigger` back to manual, per `docs/ADR-MAR-456-scheduled-trigger-manifest-export.md`. `plan_workflow`'s `recommended_route` is unaffected — it stays the full-agent description. DASH-side consumption of the field remains a separate, not-yet-filed companion ticket (now filed as the DASH cadence_enabled companion, see below).
4. MAR-460: proven — public-runner eligibility is explicit and fails closed. `src/lib/runnerEligibility.ts` judges seven capability dimensions against a declared posture (`attended` < `unattended` < `public`), and absent evidence never collapses into negative evidence: nothing said scores `unproven` → `needs_evidence`, while a negative record scores `refuted` → `ineligible`. No profile, an empty one, or a malformed one all fail closed, and reachability is recorded without ever feeding the decision. `export_build_brief` exports the decision plus per-dimension evidence.
5. MAR-459: proven — the six protocol revisions OrchestrateMCP serves are pinned as named CI evidence. [`docs/PROTOCOL_CONFORMANCE.md`](docs/PROTOCOL_CONFORMANCE.md) publishes one explicit cell per revision × behavior, and `scripts/conformance-matrix.ts` fails CI when a supported revision drifts, when a pinned cell has no executing fixture, when a pinned fixture fails, or when the document falls out of sync with its source. A behavior with no fixture is a third state — never rendered as conformant and never as failing — which is how MCP Apps and MCP Tasks are declared rather than omitted.
6. MAR-486: PR open (human-gated, not yet merged) — `export_build_brief`'s §9 gains a deploy section for the self-hosted/remote path (`agent_dom.locations.runtime.kind === "remote"`): process contract (start command, env expectations, where run evidence lands from `output_location`) plus the ADR 0006 option-1 credential honesty sentence. No new manifest field, per ADR 0006. A remote runtime now also downgrades any would-be `dash_managed` connection ownership to `agent_managed` in `buildAgentManifest` — a manifest asking for both is refused at DASH import, and the emitter must not produce what the importer refuses. Presence (remote) and absence (local, client_session) fixtures both pinned in `tests/tools/observabilityManifest.test.ts`.
7. Keep manifest-v2 export compatible with the now-proven DASH handoff and MAR-457 News Scout.
8. With the core matrix green, MCP Apps card rendering and MCP Tasks for long-running DASH-as-server work are the next standards questions; both are declared not-pinned in the matrix today.

`MAR-426`, `MAR-427`, `MAR-448`, `MAR-455`, `MAR-456`, `MAR-459`, `MAR-460`, and `MAR-463` are implemented, merged, and reconciled in Linear. MAR-486 is implemented and PR'd, awaiting Henrik's human-gated merge. The post-demo standards wave is closed; the next standards questions are MCP Apps and MCP Tasks, both declared not-pinned in the conformance matrix. Exact lifecycle evidence is indexed in `.orchestrate/state.json`.

## Product direction

The valuable distinction is not another chat wrapper. The MCP should turn fuzzy intent into an inspectable, portable agent contract: constraints, permissions, gates, deterministic artifact, and evidence-ready handoff. Rich UI should expose that contract without weakening its deterministic core.
