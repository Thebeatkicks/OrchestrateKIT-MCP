# ADR MAR-596 — populate DASH readers only from facts the export already proves

**Status:** Accepted
**Date:** 2026-08-10
**Related:** MAR-555, MAR-569, MAR-578, MAR-583, MAR-593, DASH ADR 0008
**Holds:** F14, the model-provider connection, until MAR-593 relays its fleet-level manifest shape

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

## F14 boundary

This decision does not synthesize a model-provider connection. MAR-593 owns the
fleet-level connection model and had no coordinator relay when this work began.
Emitting a provider, secret field, or ownership shape before that decision would
create the cross-repository contract it is supposed to follow. F14 remains held
and is recorded as such in Linear and the state packet.

## Evidence boundary

The proof covers the exact attended support-mail goal and validates the emitted
manifest against the pinned DASH v2 schema, including the requirement-to-
connection join. Portfolio `pnpm verify` also runs the live sibling-DASH schema
parity check. This is reproducible contract proof, not installed-runtime proof:
no claim is made that an installed DASH rendered the panel or completed a real
connection flow in this session.
