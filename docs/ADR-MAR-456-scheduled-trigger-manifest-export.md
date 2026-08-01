# ADR: `scheduled_trigger` in the plan vs. in the exported manifest

- Status: Accepted
- Date: 2026-08-01
- Owners: OrchestrateKit MCP (this repo), OrchestrateDASH (consumer)
- Related: MAR-456, MAR-455, MAR-457, MAR-427

## Context

MAR-455's proven route for a public-feed digest goal is
`public_feed_fetch -> scheduled_trigger -> audit_log`. `scheduled_trigger` is
in the route because the goal asks for a recurring ("daily") deliverable — it
is a correct description of the full agent the user asked for, and it is
locked by `tests/tools/publicFeedRouting.test.ts`.

MAR-457 (DASH AI News Scout) is deliberately staged: **manual run first,
cadence only after the manual path is proven.** DASH's `lib/analyze.ts`
compares a manifest's `planned_route` against the steps an actual run
executed and scores an unexecuted planned step as `missing_step` drift. A
manual News Scout run never executes `scheduled_trigger`, so importing the
MAR-455 manifest as-is into a manual-first DASH build would flag drift on a
step nobody has tried to run yet — a false positive created by DASH's own
staged rollout, not by the plan being wrong.

## Options considered

1. **Make `scheduled_trigger` conditional on the user choosing a cadence at
   planning time** — i.e., change `plan_workflow`'s route composition so the
   trigger doesn't appear until cadence is confirmed. Rejected: this changes
   MAR-455's proven, tested route composition (explicitly out of scope for
   MAR-456), and it would make the plan describe a smaller agent than the one
   the user's goal actually asked for ("a daily digest" is inherently
   recurring). `recommended_route` is the honest full-plan artifact; it should
   not be shaped by a downstream consumer's rollout staging.

2. **Export `scheduled_trigger` into the manifest's `planned_route` only once
   cadence is enabled** — keep `recommended_route` (and everything derived
   from it: hosting/runtime reasoning, summary markdown, safety review) fully
   accurate and untouched, and gate only the manifest v2 `planned_route` /
   `agent_dom` trigger fields that DASH's drift check reads.

## Decision

**Option 2.** The plan stays the ground truth for "what the user asked for."
The exported manifest is the ground truth for "what this build is currently
wired to execute," and those are allowed to diverge when a build is staged.
`export_build_brief` should carry an explicit cadence-enabled signal (not
present in the contract today) and, when it is false/absent, exclude
`scheduled_trigger` from the exported `planned_route` and from the
`agent_dom` trigger declaration — falling back to a manual/on-demand trigger
description for that surface only.

## Consequence for the DASH manifest v2 export

- `planned_route` in a manifest is **not** guaranteed to equal
  `recommended_route` from `plan_workflow` whenever the route contains a
  trigger step whose activation the build defers. Any manifest consumer
  (`lib/analyze.ts` included) must not assume 1:1 equivalence between the two
  and should treat `planned_route` as "what this build currently runs," not
  "the full intended agent."
- No manifest v2 schema field exists yet to carry the cadence-enabled signal.
  This ADR records the decision; implementing the export-side gate is
  tracked separately (see MAR-459/460-adjacent follow-up — file as a small,
  independently scoped ticket rather than folding it into MAR-456, since it
  needs a real interview signal, not just a mapping change).
- Until that signal exists, a manual-first DASH import of a scheduled MAR-455
  style manifest will still show `scheduled_trigger` in `planned_route`. DASH
  can avoid the false-positive drift score in the interim by not diffing
  trigger-class steps against a build stage that hasn't enabled them, without
  waiting on the MCP-side field.
