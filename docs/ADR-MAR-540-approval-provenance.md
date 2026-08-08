# ADR MAR-540 — Approval provenance: binding an approval to the action that runs

- **Status:** Accepted (design). Bar #1 implemented; bars #2–#6 are filed as follow-ups.
- **Date:** 2026-08-08
- **Issue:** MAR-540
- **Supersedes:** nothing. Extends the MAR-132 gate policy and the MAR-250 coverage-honesty layer.

## Context

LAB's signal intake (MAR-532) surfaced the same shape in five separate partial
plans: every one matched `human_approval_gate` + `audit_log`, and every one
missed binding an approval to the exact action executed. The sharpest statement
of it from the intake — *"human in the loop is meaningless unless we define what
the human is approving"*.

The finding is worse than a missing component. A goal that states the concern as
plainly as a user ever will —

> "…require my approval before it sends, with an audit trail proving what I
> approved is exactly what ran"

— returned `approval: enforced`, `unmatched_demand: []`. The reader is told the
requirement is satisfied. Re-probed on master `f6e486f` on 2026-08-08: MAR-541's
Stripe fix removed **one** instance (the gate that guarded an action missing from
the route entirely, because `stripe_data_read` had stood in for a refund), but
the drift ask itself still vanished on every phrasing that does not name Stripe.

### Why it vanished

The clause was **absorbed, not merely unmet**. `approve`/`approved` is a
`DEMAND_VERB` that `human_approval_gate`'s own hint claims, and one claimed word
inside a clause clears the whole clause. The ask disappeared into the very
component whose insufficiency it was describing.

### Why nothing carries it

A **component gap**. `human_approval_gate`'s declared interface is
`inputs: action summary, proposed payload, risk context` →
`outputs: approved | rejected | timeout decision` — a *decision*, with no
identity attached to what was decided. `audit_log` takes
`action name, actor, payload, result, timestamp` — the *executed* payload, with
no reference to an approved one. Neither carries a digest, a token, or a
correlation id, so no consumer can compare them. `schema_validation` validates
shape, not identity; `saga_compensation` compensates after the fact. The drift
failure modes appear in neither component's `failure_modes`.

An **edge gap**, and a concrete one. Of 163 edges, `human_approval_gate` had
**zero outgoing edges** — thirteen pointed at it, none left it. Its own YAML
declares `recommended_with: audit_log`, a relation that existed in the component
file and **not in the graph**. That is how five plans could place gate, write and
audit in sequence, pass every structural check, and bind nothing.

**Sequence is not provenance.** Route composition orders these components; it
never relates them.

## Decision

### 1. The overclaim is corrected first, and independently of the mechanism

Whether or not the binding component is ever built, the plan must stop claiming
a guarantee it does not deliver. Two changes, both shipped:

- **Coverage.** A goal that asks for drift-proofing gets that ask reported in
  `coverage.unmatched_demand`. The rule is keyed on the COMPONENT that would
  satisfy it (`APPROVAL_BINDING_COMPONENTS`, empty today) rather than on a phrase
  claim — a phrase check alone would have been dismissed by the same `approve`
  claim that caused the bug.
- **The card.** `Approval enforced` becomes `Approval enforced (unbound)`
  whenever an enforced `human_approval_gate` sits in front of a component in
  `ALWAYS_REQUIRES_GATE`, and the Risks & safeguards line says what the gate does
  not guarantee. This fires on the **default** path, not only when the goal asks —
  bar #4 exists because a goal that never says the word "approval" reaches the
  same gate and deserves the same honesty.

This is the MAR-250 pattern applied one field over: `Full coverage` is already
qualified rather than deleted when a constraint gap is present. The plan keeps
its chip and stops overstating it.

### 2. The mechanism is a component, and it is augmenter-injected — not hint-reachable

Two shapes were considered and the choice is recorded here so it is not
re-litigated:

**Rejected — a hint-reachable `approval_binding` component**, selected only when
the goal states the concern. It is genuinely one slice, and it is the pattern
MAR-526's slices used. But it serves only users who already know to ask, which
is precisely the population the signal says is *not* the problem: the
meaninglessness the intake quote names is the **default**. Shipping it first
would leave the default overclaim untouched and entrench the wrong shape.

**Accepted — augmenter-injected**, riding in whenever an enforced gate precedes
a write, the way `safetyAugmenter.ts` already handles `ALWAYS_REQUIRES_GATE`.
This is the correct shape and it is **not one slice**: it changes the route of
every gated plan in the registry and ripples through the test suite,
`EXPECTED_RELEASE_FINGERPRINT`, the committed MAR-426 manifest fixture,
`benchmarks/public/*`, every golden-journey fixture, and the DASH round-trip
fixtures.

### 3. The component's contract

`approval_binding` (name provisional), category `safety`:

- **inputs:** the proposed payload at gate time; the gate's decision.
- **outputs:** an approval identity — a digest over the canonicalised payload
  plus a single-use approval token, scoped to one execution.
- **permissions:** `read` the payload; `write: []`. It asserts, it does not act.
- **required at execution time:** the executing write refuses when the payload
  digest does not match the approved one. Refusal, not logging — a mutated
  payload that is executed and then recorded is the failure, not the detection.
- **failure_modes** (all four are the point of the component, not decoration):
  the TOCTOU window between approval and execution; a replayed or reused approval
  token; a payload regenerated after approval (the commonest real case — an LLM
  step re-runs and produces different text); a gate bypassed in test mode.
- **evals:** a mutated-payload fixture must be **REFUSED**, not merely logged.

### 4. The edges

`human_approval_gate__produces__audit_log` ships now: the gate's decision is
itself an auditable event and must reach the log as its own record, separate
from the record of the action that followed. This closes the zero-outgoing-edges
hole and states in the graph what the component file already declared.

The second edge — that the executing write **consumes** the binding rather than
merely following it — is deliberately **not** written yet. No component produces
an approval identity to consume, and writing that edge early would assert in the
graph exactly the guarantee this ADR exists to stop asserting.

## Consequences

- Every gated plan's Layer-1 card now says less than it used to, and what it says
  is true. Two golden-journey transcripts and several snapshots move; each is a
  deliberate correction, not drift.
- `APPROVAL_BINDING_COMPONENTS` in `src/graph/coverage.ts` is the switch: a
  future component joining that set is all that is needed to make the gap report
  stop. Nothing else needs to change for the honesty layer to recognise the fix.
- The remaining bars (#2 the component, #4 verified on the default path once the
  component exists, #5 regression fixtures both directions, #6 re-triage of the
  five LAB posts) are filed as follow-ups rather than half-shipped, per MAR-526's
  own slicing precedent.
- A reader who wants the guarantee today has an honest answer instead of a
  misleading one: re-check the request at execution time yourself, because the
  plan does not.
