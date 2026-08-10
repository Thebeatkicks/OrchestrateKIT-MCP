# ADR MAR-583 — default model routing is a per-step level, never a model name

**Status:** Accepted for the MCP emitter; typed DASH schema/UI consumption pending
**Date:** 2026-08-10
**Related:** MAR-583, MAR-299, MAR-555, MAR-578

## Context

The plan already assigns every route step a registry-grounded `model_tier`:
`none`, `small`, `standard`, or `frontier`. MAR-583 needs the exported build
contract to turn that internal planning fact into a stable default that DASH
and a later runtime can resolve to an actual model. A provider or model name is
not stable enough for a portable manifest, and one agent can legitimately need
different capability floors for extraction, synthesis, and code-writing steps.

DASH master `0a023585f6e3a82b550a933fd26697ac6fd16170` does not yet declare a typed
property for this default. Its manifest-v2 `planned_route.items` schema is open
to additive properties, so the MCP can emit the declaration without producing
a manifest DASH rejects. That compatibility is not evidence that DASH consumes
the field; the DASH schema, settings UI, deploy propagation, and run-row model
recording remain the DASH half of MAR-583.

## Decision

`export_build_brief` emits `planned_route[].default_model_level` for every
AI-needing step, using exactly this closed mapping:

| Existing `model_tier` | Emitted `default_model_level` |
| --- | --- |
| `none` | omitted |
| `small` | `cheap` |
| `standard` | `standard` |
| `frontier` | `frontier` |

The emitted vocabulary is closed to `cheap`, `standard`, and `frontier`.
Provider names and model names are not legal values. `model_tier` stays in the
manifest for backward compatibility and MAR-299's existing plan-versus-run
cost comparison; this slice is additive.

Omission for `none` is deliberate. A deterministic step does not have a model
default, so emitting `none`, `null`, or a placeholder would make it look like a
model-configurable step. This follows MAR-555/MAR-578's conditional-emission
rule: absence states that nothing was declared.

## Contract mirror and dependency

The MCP fixture was structurally re-synced against DASH master
`0a023585f6e3a82b550a933fd26697ac6fd16170` in the same implementation commit.
The schema has not changed semantically since the prior pin, so its semantic
SHA-256 remains `6e04094d08fe2f637b7e46ec29a3d1b75f21af58a1b5a051d524b2f9689d64c6`;
only `contract.lock.json.canonical_commit` advances.

DASH still needs to declare `default_model_level` on the planned-route item
before treating the field as a typed contract and before surfacing it in the
settings UI or deploy bundle. Until that lands, the MCP output is an accepted
additive extension, not a claim of DASH-side behavior. The dependency is
recorded on MAR-583 rather than blocking the MCP implementation.

## Alternatives rejected

- Emit actual model names: rejected because names and availability change and
  would couple the deterministic plan to one provider.
- Put one default on the agent: rejected because capability needs differ by
  step; it would force cheap extraction and frontier planning into one choice.
- Rename or replace `model_tier`: rejected because existing DASH cost-honesty
  work consumes it and a breaking manifest-v2 change is unnecessary.
- Emit a value for deterministic steps: rejected because no AI is needed and
  a placeholder would overstate configurability.

## Evidence boundary

The MCP proof asserts all three mappings, honest absence on deterministic
steps, absence of provider/model names, and validation against the pinned DASH
schema. It does not prove DASH renders, propagates, or executes the defaults;
those are the recorded companion dependency.
