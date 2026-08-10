# ADR MAR-596 — populate DASH readers only from facts the export already proves

**Status:** Accepted (F14 addendum below resolves the hold)
**Date:** 2026-08-10
**Related:** MAR-555, MAR-569, MAR-578, MAR-582, MAR-583, MAR-593, DASH ADR 0008, DASH ADR 0013

## Context

The 2026-08-10 attended run imported an MCP-planned agent into DASH and found
four contract surfaces with no useful producer on that path:

- AI steps did not carry the provider-neutral `default_model_level` DASH reads;
- the connection inventory existed, but `agent_dom.connection_requirements`
  did not tell DASH which real Connect flow it could launch;
- `agent.display_name` was absent, leaving the machine slug in the UI; and
- `agent_dom.panel` was absent, so the workspace had no authored layout.

F4's model-level mapping is already merged through MAR-583. MAR-578 and
MAR-555 merged strict inputs for requirements and panels, but their absent
defaults still require every caller to reconstruct facts the exporter already
has. MAR-596 closes that producer gap without adding execution, network access,
credentials, or a second contract.

## Decision

`export_build_brief` emits the following deterministic defaults:

1. `agent.display_name` is the human-readable form of the final machine slug.
   Separators become spaces, the first ordinary word is capitalised, and common
   technical acronyms remain uppercase. A supplied `agent_name` therefore keeps
   one stable identity while DASH receives readable copy.
2. An absent `agent_panel` becomes one version-1 `metrics` section containing
   only `dash_fact` sources: run count, last-run time, and last-run verdict. An
   explicit authored panel still replaces the default verbatim.
3. An absent `connection_requirements` block is derived only from the emitted
   `agent_dom.connections` inventory. A requirement is emitted when that same
   connection is `dash_managed` and its field/provider combination maps to a
   connector kind DASH has actually built (`google_oauth_broker` or `api_key`).
   Agent-managed, external, and unknown-flow connections remain inventory-only.
4. MAR-583's `model_tier` mapping remains the sole source of
   `default_model_level`; deterministic steps continue to omit it.

Explicit panel/requirement inputs win. The existing v1 requirement join remains
mandatory, and it now checks the derived or explicit declaration against the
actual emitted Agent DOM connection ids.

## Why the panel default is now grounded

MAR-555 declined deriving a `report` from `output_location` because a location
is not an artifact role. That refusal remains correct. The new default avoids
the disputed inference entirely: `run_count`, `last_run_at`, and
`last_run_verdict` are closed DASH facts, attributed and computed by DASH. The
panel names no artifact, file, path, destination, URL, or agent-authored value.

This supersedes MAR-555's blanket omission while preserving its security and
truthfulness boundary. A future artifact panel still requires the build to
declare real artifact roles.

## Why requirements are narrower than the connection inventory

`agent_dom.connections` answers what the agent can reach and who owns the
credential. `connection_requirements` answers what button DASH can honestly put
beside it. Those are not interchangeable. Derivation therefore starts from the
already-emitted Agent DOM connection, requires `dash_managed`, and accepts only
the closed connector vocabulary. If no real flow qualifies, the requirements
block stays absent rather than becoming an empty object or a dead button.

## F14 boundary (as filed) — superseded by the addendum below

This decision did not synthesize a model-provider connection. MAR-593 owned the
fleet-level connection model and had no coordinator relay when this work began.
Emitting a provider, secret field, or ownership shape before that decision would
have created the cross-repository contract it is supposed to follow. F14 was
held and recorded as such in Linear and the state packet.

## F14 addendum (2026-08-10) — the hold is resolved

MAR-593 is decided and merged (DASH PR #126, DASH ADR 0013): the manifest does
**not** change. An agent declares connections exactly as MAR-569/MAR-582
already specify, and DASH resolves them against fleet-level connections that
exist without any agent. The coordinator relayed this on PR #183: F14's
remaining fix is template-level, not schema-level — an emitted agent with an
AI-backed step should declare a model-provider connection in MAR-582's
existing `AgentDomConnection` shape.

### Decision

`export_build_brief` declares one additional `agent_dom.connections[]` entry,
`aiProviderConnection` in `src/lib/observabilityContract.ts`, when all three
hold:

1. at least one route step is AI-backed (`model_tier !== "none"`);
2. the caller's `llm_provider` is `"anthropic"` or `"openrouter"` — DASH's own
   `AI_PROVIDER_IDS` spelling (`lib/ai/providers.ts`), pinned by value in
   `src/lib/dashBrokerCatalog.ts`, checked against orchestratedash master
   `5ad6d70`. `"deterministic_first"` is the caller explicitly declining a
   provider (its own option copy already says so) and produces no connection,
   the same reading `buildCredentialManifest` already gives it. `"openai"` is
   in DASH's vocabulary but has no MCP-side selection path yet — narrow drift,
   the safe direction;
3. `dash_broker_available` is `true` — the same MAR-494 signal every other
   `dash_managed` connection is gated on, since DASH's AI-key vault only
   exists where DASH is present.

The connection is `dash_managed`, downgraded to `agent_managed` on a `remote`
runtime by the same ADR 0006 rule (`ownershipForRuntime`) every other
`dash_managed` connection already obeys, and carries exactly one `secret`
field with **no** `technical.environment_name`. That omission is deliberate,
not an oversight: orchestratedash's `resolveCredentialTarget`
(`lib/connection-credentials.ts`) refuses `brokered_provider_delivery` when a
`secret` field recognised as an AI-provider key also declares an environment
name — the broker holds the key and answers on the agent's behalf, and never
hands it back as an env var. Declaring one would silently break the exact flow
this decision exists to enable.

Because the new connection is appended to the array `derivedConnectionRequirements`
(MAR-578) already scans, it automatically produces a matching v1
`connection_requirements` entry — `connector_kind: "api_key"`, joined by
`connection_id` to the emitted connection — through the identical, already-proven
join mechanism Gmail uses. No new derivation logic, no schema change.

### Why gated on `dash_broker_available` and not a separate signal

MAR-582's AI-key vault is a DASH-native capability, not something DASH brokers
selectively per service (unlike `dashBrokersConnection`'s narrower question for
OAuth-style integrations). But the vault still only exists where DASH itself
is running, so reusing the existing "is DASH present" assertion is the honest
answer rather than inventing a second flag that means the same thing.

### Evidence boundary

Proof runs through `export_build_brief`'s public surface — `tests/tools/dashBrokerRoundTrip.test.ts`'s
`MAR-596/F14` suite and `tests/tools/observabilityManifest.test.ts`'s
attended support-mail fixture — validated against DASH's pinned schema, and
`tests/lib/dashBrokerCatalog.test.ts` pins `AI_PROVIDER_IDS` by value. This is
reproducible contract proof, not installed-runtime proof: no claim is made
that an installed DASH rendered an `AiKeyConnectionView` card from this
output. Portfolio `pnpm verify` (including `dash:schema:check`) is green.

## Evidence boundary

The proof covers the exact attended support-mail goal and validates the emitted
manifest against the pinned DASH v2 schema, including the requirement-to-
connection join. Portfolio `pnpm verify` also runs the live sibling-DASH schema
parity check. This is reproducible contract proof, not installed-runtime proof:
no claim is made that an installed DASH rendered the panel or completed a real
connection flow in this session.
