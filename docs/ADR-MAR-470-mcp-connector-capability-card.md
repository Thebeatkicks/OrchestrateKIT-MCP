# ADR MAR-470 — an MCP-connected server gets a capability card, not a broker path

**Status:** Proposed (awaiting Henrik) — this is MCP-repo prep for a DASH-repo issue; the decision belongs to whoever implements MAR-470 in orchestratedash
**Date:** 2026-08-07
**Supersedes:** none
**Related:** MAR-458 (the three-party grant rule this ADR deliberately does not extend), MAR-438 / DASH-25 (MCP as a declared connection kind — unstarted, no conflicting commitments to reconcile against), MAR-477 / MAR-494 (the MCP↔DASH round trip whose failure mode this ADR explicitly avoids repeating), orchestratedash ADR 0002 (stage 3, the rollout text this answers), orchestratedash ADR 0006 (the broker's reach ends at this machine — the precedent this ADR extends)

## Context

ADR 0002's rollout stage 3 (unbuilt) asks for: an authenticated MCP connection kind; server-advertised tools imported as untrusted declarations; approved tools mapped to DASH capabilities; the remote server and token custodian shown in the receipt. MAR-470, the Linear issue asking for it, names its own hard part: MAR-458's three-party grant rule (DASH implements the operation / the manifest declares the scope / the provider grants it) assumes DASH is one of the three parties. An MCP server proposing its own tool list doesn't fit that shape — the tools are not DASH's frozen allowlist, and treating them as one would hand an arbitrary remote server the ability to define what an agent may do.

**What's already built, DASH side.** `TokenCustodian` (`lib/broker/providers.ts`) already has three values — `dash_vault`, `remote_mcp_server`, `hosted_broker` — and `describeCustody`'s `remote_mcp_server` sentence ("does not withdraw") is real and unit-tested. But no `BrokerProviderProfile` ever constructs anything but `dash_vault`; the other two values exist only in a hand-built test fixture. `BrokerRowView` / `PermissionCard` render from a provider-agnostic shape — `BrokerCapabilityView: {id, label, access, consequence}` — that could already carry an MCP-tool-backed capability with no new rendering path; a docstring on `CapabilityCard` already anticipates this. The gap is entirely upstream, in `lib/broker/grant.ts` / `lib/broker/operations.ts`: `OPERATIONS` is a frozen array of three DASH-authored, hand-written `plan`/`compose` functions, and every write `path` is checked at *module load* against a hardcoded `WRITE_PATHS` list. The module's own docstring states the invariant plainly: "there is no path from a manifest, a scope, a connection or an agent request to an entry that is not written here by hand." MAR-438 (MCP as a declared connection kind) exists only as a strategy-doc paragraph — zero code, so nothing here is locked in by a prior commitment.

**What's already built, MCP side.** `AgentDomConnection.ownership` is `dash_managed | agent_managed | external`. The existing `mcp_server` acquisition path — "install a community/official MCP server that holds the token" as a way to reach a *known* provider like Gmail — already resolves to `ownership: "external"` via `connectionOwnership()`. But nothing today lets a connection say "I am, myself, an MCP server": `McpServerInfo.transport` (in `INTEGRATION_CATALOG`) describes only how to *acquire* a provider connection and never reaches `agent_manifest`. `contracts/agent.manifest.v2.schema.json`'s `provider` field is a free string with no connection-kind enum. `src/lib/dashBrokerCatalog.ts`'s `DASH_BROKERED_CONNECTIONS` is a narrow, test-pinned allowlist (Gmail only, per MAR-494) of what DASH actually mediates end to end today.

## Decision

DASH's stage 3 should not try to make `lib/broker/operations.ts` execute a remote MCP server's tools. It should build a second, narrower pipeline that produces the *same* card types DASH already has (`BrokerCapabilityView`, `CapabilityCard`, `BrokerRowView`), populated from human-curated, per-server tool approvals, with `token_custodian` set to `remote_mcp_server` (or `hosted_broker`) — and DASH never relays or executes the calls itself.

Concretely, four pieces:

1. **Import is data-only.** A connected MCP server's advertised tool list (names and JSON schemas) is read and stored as an untrusted declaration — structurally validated (well-formed, matches the MCP tool-list shape) and trusted for nothing beyond that. The server's own description of what a tool does is not evidence of its consequence.
2. **Mapping is a review step, not code.** A human, at connection-setup time (not per call), reviews the declared tools and approves a subset, attaching the same fields `BrokerCapabilityView` already requires by hand for Gmail today: `access: read|write` and a DASH-authored `consequence` sentence. This mirrors ADR 0002 invariant 7 — provider content is untrusted data and cannot create permissions on its own say-so.
3. **DASH does not execute the tool.** Once approved, the *agent* calls the remote MCP server directly, with its own session to that server. DASH's involvement stops at disclosure and consent: the card shows what was approved, which server it belongs to, and who holds the token. This is the same shape the MCP-manifest side already expresses today as `ownership: "external"` for "some other custodian holds this" — DASH's stage-3 work makes that case reviewable and visible instead of an unlabeled pass-through.
4. **`lib/broker/operations.ts` stays exactly as it is.** No new `BrokerOperation` variant whose `plan`/`compose` delegates to a remote server's own logic.

## Why not extend `BrokerOperation` to cover remote tools

`WRITE_PATHS` is a frozen array checked once, at module load, precisely so that no external input — not a manifest, not a connection, not an agent request — can choose where a write goes. A `plan`/`compose` step supplied by, or dispatched to, a remote MCP server is external input by construction. Teaching `operations.ts` to delegate the compose step to a server doesn't extend that model, it deletes the property that makes it trustworthy: the operation set stops being "DASH's own code, reviewed once" and becomes "whatever code answers this server's endpoint today." That is exactly the vulnerability class amendment 2 of ADR 0002 closed for Gmail — an external party choosing the outbound request — reopened one layer up.

## Why not render MCP connections as `external` and stop there

The MCP-side `ownership: "external"` value already exists and is technically sufficient to say "some custodian other than DASH holds this." But ADR 0002 invariant 8 commits to more than visibility: "MCP connectors pass the same capability review. Installing a Gmail MCP server changes who owns token custody; it does not remove OAuth consent or permission review." A connection labeled `external` with no card behind it is a connection nobody reviewed. `TokenCustodian`'s `remote_mcp_server` value, and the "does not withdraw" sentence built for it, exist specifically to make that custody visible in a way a generic `external` label does not.

## Why not auto-map declared tools to capabilities by name

MAR-470's own framing is the reason this can't be automatic: "server-advertised tools are a manifest written by someone else, at runtime." A server naming a tool `gmail.search` is a claim, not a fact. DASH's card grammar exists so a human reads what a tool actually does before it is granted — the same discipline `consequence` and `wider_permission` already enforce for Gmail's `gmail.compose` scope. Automatic name-matching would let a compromised or merely careless server author its way into an approved capability by picking a familiar-sounding name.

## Sequencing: what the MCP repo should not do yet

The natural next question is whether `orchestratekit-mcp` should add a connection `kind` (e.g. `mcp_server`) to `AgentDomConnection` now, so a manifest can name "this agent depends on MCP server X's tools T1..Tn" as a first-class requirement. It should not, yet.

MAR-477 already found this exact failure mode one level down: two repos' *types* agreeing while the *values* silently drifted (`gmail` vs `google-gmail`; an acquisition path permanently stuck at `planned`), caught only by a committed cross-repo fixture, never by schema agreement alone. DASH's stage 3 has no shipped capability schema yet — the `contracts/connection-capability.schema.json` a `CapabilityCard` doc comment already refers to does not exist in the DASH repo today. Building an MCP-side field now, to feed a DASH pipeline that doesn't exist yet, means guessing at a wire shape with nothing on the other end to validate against — a worse starting position than MAR-477's, which at least had two independently-built sides to reconcile.

Once DASH ships a real stage-3 schema and a `TokenCustodian` value other than `dash_vault` becomes reachable in practice — not just in a hand-built test fixture — the MCP-side move should be small, and should follow the pattern MAR-494 already proved out: an explicit, caller-supplied signal gating the new connection kind, defaulting to the honest negative, checked against a small pinned allowlist the MCP repo owns. Not an inference, and not a blanket assumption that every MCP-server connection is DASH-reviewable the moment DASH's type system allows it.

## Consequences

- DASH's card-rendering layer needs no new type — `BrokerRowView` / `CapabilityCard` / `BrokerCapabilityView` already fit an MCP-tool-backed capability. The implementation work is entirely a new import → validate → human-approve pipeline that populates them, built parallel to `lib/broker/operations.ts`, not inside it.
- `TokenCustodian`'s `remote_mcp_server` and `hosted_broker` values move from "typed and tested but unreachable in production" to actually constructible, closing the gap ADR 0006 already named.
- The MCP repo's manifest and registry stay unchanged for now. This ADR's recommendation is a reason to leave `orchestratekit-mcp` alone until DASH's stage-3 schema lands, not a task list for it.
- MAR-438 (DASH-25) and MAR-470 describe the same destination from two angles — connection-kind vocabulary versus capability-card integration — and per MAR-470's own text should be reconciled into one implementation ticket, with a clear parent, before either starts.
