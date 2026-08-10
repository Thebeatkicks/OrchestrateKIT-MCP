# ADR MAR-555 — the panel is declared by the build, never derived by the planner

**Status:** Superseded in part by ADR MAR-596
**Date:** 2026-08-08
**Implements:** orchestratedash ADR 0008 slice 4 ("the MCP emitter"), spec-only on the DASH side by design
**Declines:** ADR 0008's optional derivation clause ("the emitter MAY derive a default panel … an `output_location`-bearing route gets a single `report` section")
**Related:** MAR-552 (DASH's `$defs.panel`, merged as `3666459`), MAR-507 (`task_inputs`, the pattern this follows), MAR-494 (explicit-signal-defaulting-to-the-honest-negative), MAR-549 (the precedent for a recorded decline)

> **2026-08-10 amendment:** MAR-596 supersedes only the blanket omission
> decision. The emitter now derives a default `metrics` section whose three
> values are facts DASH observes itself (`run_count`, `last_run_at`, and
> `last_run_verdict`). The refusal to derive an artifact role, report, table, or
> outputs section from `output_location` remains in force.

## Context

DASH's ADR 0008 makes a per-agent panel a **declaration** — data over a closed
vocabulary that DASH renders with its own trusted components — and puts it in
the manifest as `agent_dom.panel`. MAR-552 landed the schema first, which is
the order this repo's `pnpm dash:schema:check` enforces by design.

This slice is the emitter half: `export_build_brief` gains an `agent_panel`
input and threads it into the manifest. The mechanics are the `task_inputs`
precedent applied a second time, and they are not the interesting part.

The interesting part is that ADR 0008 left a door open:

> The emitter MAY derive a default panel only from facts the plan already
> declares — an `output_location`-bearing route gets a single `report`
> section — and derivation past that is refused rather than guessed.

## Decision

**`agent_panel` is passed through verbatim or omitted. Nothing is derived,
including the one derivation ADR 0008 permits.**

Absence is the honest default and `agent_dom.panel` is omitted entirely —
never `{}`, which DASH's own schema refuses anyway (`panel_version` and
`sections` are both required, `sections` has `minItems: 1`).

## Why the permitted derivation is declined

Not because derivation is wrong in principle — MAR-494 is the same shape and
it derives plenty once the caller supplies the one fact it cannot observe.
Because on these facts there is nothing to derive **from**.

**Every v1 section that renders an agent's output binds to an artifact role,
and a plan declares no artifact roles.** `report` *requires* `artifact_role`.
`table` requires `source_role`. `metrics` binds `artifact_field` sources by
role. A role is the name the agent's **runtime** gives what it writes — DASH
resolves it at render time through `describeArtifactRole(artifact.kind)`
(`lib/copy/artifacts.ts`), whose entire known vocabulary today is `digest` and
`draft`, with everything else falling back to "Output". Nothing in a
`plan_workflow` result names one, and nothing in the registry does either.

**`output_location` is not a role.** It is free text naming a *destination* —
"HubSpot notes + Gmail drafts", "Google Calendar event and Gmail drafts
folder" — and it does not even satisfy `roleName`'s `^[a-z0-9_]+$`. Reading a
role out of it would mean inventing an identifier and asserting the built
agent will label its output with it.

**The remaining candidate is worse, not better.** An `outputs` section is the
one shape that binds to nothing: its `artifact_role` is optional, so the MCP
could emit "show this agent's outputs here" without naming anything. But a
non-empty `output_location` says output lands *somewhere* — often entirely
outside DASH, like a Gmail drafts folder. It does not say this agent writes
DASH artifacts at all. Deriving an outputs section from it would still be a
guess, just a quieter one.

So the honest emitter derives nothing, and says why. A build knows its own
artifact roles; that is where the declaration belongs, and `agent_panel` is
how it travels.

## What this costs, stated rather than hidden

**An exported build brief produces no panel today.** Both of MAR-548's shipped
sample agents render exactly as they do now until something declares one — the
MCP is not what makes their panels appear. That is the correct standing (the
same one `task_inputs` has shipped with since MAR-519: the mechanism plus its
round-trip proof, with the first real declaration a separate piece of work),
but it means this slice's value is a contract, not a visible change.

**The decline is reversible, and the bar is stated.** The moment a plan
carries artifact roles — a registry component that declares what it writes, or
a `plan_workflow` output shape with named roles rather than free text — the
derivation ADR 0008 permits becomes grounded and should be revisited. Until
then `tests/tools/dashBrokerRoundTrip.test.ts`'s "the recorded decline" case
is where anyone wiring it up has to argue for it.

## Why `.strict()`, when DASH's own schema is not

DASH's `$defs.panel` does not set `additionalProperties: false`, so an unknown
key rides along and DASH ignores it. The zod input shape refuses it. This is
the `TaskInputRoleInputShape` rule ("the emitter's job is to be honest, not
permissive") and it is narrower than the contract on purpose: a key DASH will
never read is a caller believing it declared something. A caller who wanted a
section type the vocabulary does not have should find out at the tool
boundary, not discover an inert field in a shipped manifest.

The same reasoning bounds the version split. `panel_version: 1` is checked
against the closed enum; any other version is accepted structurally and
travels intact so DASH can render it as one stated "newer format" card. A v1
panel carrying an opaque section is refused — version 1 must not rot into
leniency to accommodate a version nobody has designed.

## Alternatives rejected

**Derive a `report` section from `output_location`.** The clause ADR 0008
left open. Rejected above: it requires inventing an `artifact_role`, which is
the emitter asserting something about the built agent's output vocabulary that
the plan never stated — the overclaim class MAR-540/549/551 closed this same
week.

**Take the panel as an opaque `Record<string, unknown>` and let DASH's Ajv be
the only gate.** Cheaper, and it moves the failure from the caller's tool call
to a user's import. The strict mirror is the whole point of DASH-schema-first:
two repos that share no code agree because one of them pins the other's
contract and validates against it.

**Derive nothing but ship a `note` section restating the goal.** A panel that
says what the manifest already says, occupying the space a real declaration
should. Attribution makes it harmless; usefulness makes it pointless.

## Consequences

- `export_build_brief` gains one optional input; no new tool, no output-schema
  change (`agent_manifest` is already `passthrough`), no transport change.
- `PANEL_SECTION_TYPES_V1` is pinned by value in
  `src/lib/observabilityContract.ts` and asserted against DASH's enum in
  `tests/tools/dashBrokerRoundTrip.test.ts`, so DASH widening the vocabulary
  turns this repo red on the fixture re-sync rather than silently widening it
  too.
- `proven` stays out of reach here: it needs an exported brief to round-trip
  into an installed DASH and the panel to render, which is MAR-554's renderer.
  `merged` is this slice's ceiling.
