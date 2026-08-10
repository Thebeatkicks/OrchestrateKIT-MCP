# ADR MAR-583 — default model routing is a per-step level, never a model name

**Status:** Accepted; typed DASH schema field merged
**Date:** 2026-08-10
**Related:** MAR-583, MAR-299, MAR-555, MAR-578

## Context

The plan already assigns every route step a registry-grounded `model_tier`:
`none`, `small`, `standard`, or `frontier`. MAR-583 needs the exported build
contract to turn that internal planning fact into a stable default that DASH
and a later runtime can resolve to an actual model. A provider or model name is
not stable enough for a portable manifest, and one agent can legitimately need
different capability floors for extraction, synthesis, and code-writing steps.

DASH added the typed field in `d9781b9` and it is present on master
`04dc3469402b9a31fff9097ef651986966a975ae`. The MCP fixture now pins that
contract directly rather than relying on the planned-route item's additive
openness.

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

MAR-596 re-synced the MCP fixture against DASH master
`04dc3469402b9a31fff9097ef651986966a975ae`. The semantic SHA-256 is now
`ce174cc6b8e568be86b1ad27615b73cd80b0b61f027477402a2f675a63993b56`,
recorded with the canonical commit in `tests/fixtures/dash/contract.lock.json`.

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
steps, absence of provider/model names, and validation against the pinned typed
DASH schema. It does not independently re-prove DASH's UI, deploy propagation,
or runtime recording; those remain DASH-owned evidence.
