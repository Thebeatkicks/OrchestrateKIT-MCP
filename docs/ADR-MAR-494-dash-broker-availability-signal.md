# ADR MAR-494 — the DASH broker is a caller-supplied fact, not an inferred one

**Status:** Proposed (awaiting Henrik)
**Date:** 2026-08-06
**Supersedes in part:** the "the broker path is always planned" half of MAR-383
**Related:** MAR-477 (the proof that found this), MAR-493 (provider vocabulary), MAR-463 (the `cadence_enabled` precedent), orchestratedash ADR 0002 (the broker), orchestratedash ADR 0006 (the broker's reach)

## Context

MAR-477 ran the MCP → DASH round trip end to end for the first time: `export_build_brief` → `dash://` handoff → schema validation → Connection Center → broker grant → brokered call. Steps 1–3 passed. Step 5 could not be reached, and the reason was not a contract mismatch.

DASH's `resolveGrant` refuses any connection whose `ownership` is not `dash_managed`, before it looks at anything else. The MCP could not emit that value at all. `connectionOwnership()` returns it only when the *actionable* acquisition path has `ownership_location: "dash"`; the only such path is `brokerPath()`, which declared `availability: "planned"`; and the actionable path is `paths.find(p => p.availability !== "planned")`. The one path that could produce the value was disqualified by construction.

Swept across 7 realistic goals × 2 runtime kinds: 32 emitted connections, 0 `dash_managed`.

That was correct when MAR-383 landed — no broker existed. It stopped being correct when DASH shipped `lib/broker/`, with a provider profile, three allowlisted Gmail operations and a real three-party grant. Neither repo noticed, and DASH's own `docs/agent-dom-contract-v2.md` still describes `dash_managed` as "a future DASH connection service". The stale belief was written down on both sides.

## Decision

`export_build_brief` accepts an optional `dash_broker_available: boolean`. Absent or false is the honest negative and changes nothing. Explicit true makes the broker-backed acquisition path actionable — but only for services DASH actually brokers, which the MCP tracks in `src/lib/dashBrokerCatalog.ts`.

Two independent conditions, and both must hold:

1. **Is DASH there?** Caller-supplied. The MCP is stateless; it cannot observe the machine that will run the agent.
2. **Can DASH broker this service?** A table in the MCP, checked against DASH.

## Why not infer it

There is nothing to infer from. The MCP has no filesystem probe, no network call and no session state — that is the architecture boundary, not an implementation gap. Every signal it could reach for is a guess about a machine it has never seen.

## Why not flip it on unconditionally

Because MAR-383's honesty rule is load-bearing: an `availability` that renders as an action the user cannot take is worse than no path at all. A user without DASH would be shown "Connect Gmail in DASH's Connection Center" as their recommended path, and there would be no Connection Center.

## Why not a per-connection input

It is more precise and worse. The caller is an LLM client relaying a user's intent, and asking it to enumerate which services DASH brokers invites it to guess — confidently, and in a direction that over-claims. One boolean about the machine is a thing a caller can actually know.

## Why `dash_managed` is not claimed for every connection when the signal is on

This is the failure mode the design exists to avoid. DASH brokers Gmail and nothing else today. A HubSpot connection marked `dash_managed` would render as "DASH holds this credential", and every brokered call against it would be refused with `no_broker_profile` — a row that looks connected while nothing works, which is precisely the confusion DASH's `no_operations_granted` refusal was invented to name.

So the MCP holds `DASH_BROKERED_CONNECTIONS`, and it is deliberately narrower than the vocabulary map beside it. Google Calendar is the case that shows the two are different questions: DASH can *name* it (`google-calendar` is in DASH's OAuth flow map) and cannot *broker* it (no profile, no operations). It is in one and not the other.

## The cost, stated plainly

This puts DASH knowledge inside the MCP, which the architecture boundary otherwise avoids, and it will drift when DASH adds a provider or an operation.

It drifts **narrow**, which is the safe direction. A service missing from the set is emitted exactly as it is today and simply is not brokered — the user sees the MCP-server or direct-credential path they already see. Nothing invents access. The unsafe direction, claiming a service DASH cannot broker, is the one guarded by an equality assertion in `tests/lib/dashBrokerCatalog.test.ts`: widening the set fails a test that asks whether anyone verified the claim against DASH.

## What this does not change

- **ADR 0006 still bounds it.** A remote runtime downgrades `dash_managed` to `agent_managed` in `buildAgentManifest`, exactly as MAR-486 established, and the signal does not override it. The broker runs in Electron main because `safeStorage` is only readable there; when DASH is closed, the broker is closed. `tests/tools/observabilityManifest.test.ts` asserts the signal never survives a remote runtime.
- **`plan_workflow` is untouched.** Planning happens before anyone has asserted anything about the machine, and its connection contract keeps showing the broker path as planned. Only export time, where a caller can assert, changes — the same scope as `cadence_enabled`.
- **`recommended_route` is unaffected**, for the same reason MAR-463 left it alone: it is the description of the agent the user asked for, not of the build.

## Consequences

An MCP-authored manifest exported with the signal on now resolves a real grant through DASH's own `resolveGrant`, yielding a capability card with its custody, consent-screen, consequence and wider-permission sentences, and a brokered `gmail.search` call is allowed and audited. That is MAR-477 steps 5 and 6, closed.

What remains open is the half that needs a human: a real Google account at a real consent screen, which is MAR-468's shape — attended, dated, and never in `pnpm verify` (ADR 0004's rule). The proof harness stubs `mintAccessToken` and `fetchImpl`, which are seams DASH's `BrokerDeps` already exposes for DASH's own tests, so what is proven is that DASH authorizes and records the call, not that Google answers it.
