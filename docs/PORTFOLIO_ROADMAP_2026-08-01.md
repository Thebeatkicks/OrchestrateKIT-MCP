# Orchestrate portfolio roadmap

Decision date: 2026-08-01

Owner: Henrik

This is the execution index for MCP, DASH, LAB, and the public site. It records
intent and sequencing; Git, Linear, ADRs, and runtime evidence retain their
separate authority as defined in each repository's `AGENTS.md` and
`.orchestrate/state.json`.

## Product thesis

Orchestrate should be the inspectable path from an agent idea to a running,
governed agent:

1. MCP turns intent into a deterministic build contract.
2. DASH installs, connects, runs, and explains the agent.
3. LAB learns from repeated evidence and proves whether fixes improve outcomes.
4. The site shows the real artifact and its evidence, not generic automation
   promises.

The durable differentiator is an **evidence ledger**. Every meaningful claim
moves through `planned -> merged -> proven`, with the proof visible to people and
machines.

## Non-negotiable promotion rule

- **Planned:** intent exists in Linear or a roadmap.
- **Merged:** implementation commit is reachable from the repository's evidence
  branch.
- **Proven:** the named proof ran against the relevant boundary. Unit tests do
  not prove an installed desktop journey.

Git is implementation truth. Linear is intent and coordination. ADRs are
decision truth. Tests, installed runs, and the LAB database are evidence. State
packets are indexes and may never overrule those sources.

## Wave 0 - regain installed truth (proven 2026-08-01)

Exit condition: a clean Windows machine can accept the MCP handoff, add the
existing sample, start it, show runner-hosted telemetry, produce an artifact,
show the verdict, and stop gracefully.

- DASH MAR-451: exact runner build/protocol identity.
- DASH MAR-452: authenticated graceful shutdown; no hard process termination.
- DASH MAR-453: record pending handoff before consent and expire it honestly.
- DASH MAR-454: mandatory packaged Windows shell proof in CI.
- Re-run the proof after one Windows restart removes pre-graceful orphan runners. **Passed.**
- Reconcile MAR-383, MAR-384, MAR-426, MAR-428, MAR-429, MAR-432, MAR-433, MAR-448, and MAR-450 in Linear
  with commit evidence. Installed proof obligations remain attached to MAR-454.

Current state: frozen and proven. DASH implementation commit `05201e7` and state
promotion `bf28d2b` are on `master`. Direct `pnpm verify` passed 51 test files,
843 tests, and the real Windows/Electron journey: renderer/preload, exact runner
build and protocol, pending-before-consent handoff, a fresh runner-hosted run in
Runs, compliant verdict, digest artifact, confirmed process exit, and bounded
Windows cleanup.

After Git-evidence reconciliation, LAB Chief's remaining top implementation
questions are MAR-363 (record the full journey), MAR-380 (scope the optional
Agent DOM control/handoff epic), and MAR-421 (approval delivery). MAR-363 stays
open because its own control sheet still lacks the final recording. MAR-380 and
MAR-421 should be re-scoped against this roadmap instead of being allowed to
block already-merged foundations.

Linear reconciliation was applied on 2026-08-01: 15 issues received evidence
comments before moving to Done. The exact audit batch is in
[`LINEAR_RECONCILIATION_2026-08-01.md`](LINEAR_RECONCILIATION_2026-08-01.md).

## Wave 1 - the shortest real agent loop (2-4 engineering days)

Deliver MAR-457 by hardening and extending MAR-423 into **AI News Scout**. This is not a new demo branch.
It is the existing no-terminal sample path with a useful public-RSS agent:

- choose/edit sources and cadence;
- show live steps and source citations;
- save a digest artifact with a stable URL/id;
- show grounded/completed/failed verdicts and recoveries;
- render a narrow `network: read` permission receipt;
- preserve the run as installed-product evidence.

News Scout intentionally requires no OAuth. It isolates agent communication,
telemetry, artifacts, and verdict UX before connector complexity is introduced.
MAR-455 must first route public feeds to anonymous RSS/GET instead of paid
Firecrawl, and MAR-456 must prefer the proven local DASH runner for a
computer-on goal.

## Wave 2 - connections as capabilities (5-8 engineering days for internal MVP)

DASH implements ADR 0002's permission broker under MAR-458, with MAR-446
retained for BYO Google client onboarding:

- separate DASH identity from connector grants;
- keep provider tokens on DASH's trusted side;
- expose typed, allowlisted operations rather than raw tokens;
- begin with Gmail read/search and a local draft artifact;
- add provider-side draft creation only when the broker has no send operation;
- put native OAuth and authenticated MCP servers behind the same permission-card
  and audit model while naming the actual token custodian.

This fixes the current gap: MAR-446's system-browser/PKCE/vault flow is sound,
but the agent currently receives a general short-lived access token. The Google
client is also DASH-owned and compiled in; BYO-client onboarding is not shipped.

Public Gmail availability has an external lead time. Google's review is commonly
measured in weeks, and restricted scopes can require an annual third-party CASA
assessment when data is stored on or transmitted through servers. Internal test
users can proceed while review is pending, with explicit seven-day grant expiry
in Testing mode.

## Wave 3 - MCP standards and portable agent UI (2-4 engineering days)

- MAR-459: pin a protocol conformance matrix in CI for both supported revisions.
- MAR-460: make public-runner eligibility explicit and fail closed.
- Evaluate MCP Apps for rendering the same plan/build/evidence cards in clients.
- Evaluate MCP Tasks for long-running DASH-as-server work after the runner proof
  and cancellation semantics are stable.
- Define a connector capability profile so MCP servers cannot silently widen an
  agent's approved operation set.

Do not quote an undefined lifecycle coverage percentage. Track named journeys
and exact proof obligations instead.

## Wave 4 - make LAB a learning system (2-4 engineering days)

P0 is evidence reconciliation, not more dashboards:

- verify Git implementation before Chief promotes stale Linear findings;
- keep Trading Bot paused;
- prove the adversarial invoice-payment corpus contract with a fresh scored evaluation (MAR-461);
- expose health for last real session, accepted findings, promoted issues, and
  later proven fixes;
- resume one narrow project only when input -> finding -> issue -> merged fix ->
  later improvement is visible as a causal chain.

The Git-evidence filter and invoice human-approval contract are implemented in
the current working tree. The next gate is a fresh LAB run that produces a useful
finding and either promotes it or records a reason not to.

## Public trust surface (1-2 engineering days, parallel after Wave 0)

- Canonical direction: dark editorial evidence ledger; warm cream is an
  alternate light theme, not a competing brand.
- Replace `production-ready` and `battle-tested` with named proof.
- Primary CTA: the live no-login planning path. Secondary CTA: inspect the
  exported build brief/evidence.
- Verify 375 px, 768 px, and 1280 px layouts and publish only after Text Mirror,
  build, and visual checks are green.
- Deploy and record the live proof under MAR-462.

The product/design briefs, safer homepage copy, dark default, and evidence-led
social card are implemented locally on the existing web branch and are not yet
published.

## Estimate to a coherent beta

These ranges are hands-on solo engineering estimates, not promises about third
party review queues:

| Milestone | Engineering time | Elapsed dependency |
| --- | ---: | --- |
| Wave 0 installed proof | Complete | Proven 2026-08-01 |
| AI News Scout proof | 2-4 days | None after Wave 0 |
| Permission broker + internal Gmail MVP | 5-8 days | Test-user consent |
| MCP conformance and runner policy | 2-4 days | Standards validation |
| LAB causal flywheel proof | 2-4 days | Fresh representative sessions |
| Site trust/visual release | 1-2 days | Deployment decision |

With focused solo execution, a strong internal beta is approximately **3-4
weeks**. A public Gmail-capable beta is approximately **6-12 weeks elapsed**
because Google verification and any required independent security assessment are
outside the engineering critical path. A useful public beta should not wait for
Gmail: News Scout, MCP planning, installed evidence, and non-OAuth connectors can
ship first.

## Next decision gate

Wave 0 is frozen and Linear is reconciled. Run News Scout as the first build
brief. Keep provider OAuth behind the permission-
broker boundary. Do not resume Trading Bot before LAB can show a complete
evidence chain.
