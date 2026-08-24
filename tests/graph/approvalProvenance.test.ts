/**
 * Approval provenance — MAR-540's six-point bar, closed by MAR-749.
 *
 * MAR-540 (PR #177, `f11d8de`) landed bar #1: a goal stating the concern as
 * plainly as a user ever will used to return `approval: enforced`,
 * `unmatched_demand: []`, and stopped doing so. The clause had been ABSORBED
 * rather than merely unmet — "approve"/"approved" is a DEMAND_VERB that
 * `human_approval_gate`'s own hint claims, and one claimed word clears a clause,
 * so the ask disappeared into the very component whose insufficiency it was
 * describing.
 *
 * MAR-749 closes bars #2–#5 with the mechanism itself. `approval_binding` is
 * injected by safetyAugmenter Rule 5c wherever a gate meets a gated write, so
 * the guarantee arrives on the DEFAULT path rather than only when the goal knows
 * to ask — the augmenter-injected-over-hint-reachable decision recorded in
 * docs/ADR-MAR-540-approval-provenance.md.
 *
 * Every assertion here is paired with an absence twin, per the grounded-prose
 * rule: a route that must NOT gain the component is as much of the contract as
 * one that must.
 */
import { describe, expect, it } from "vitest";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";
import { ALWAYS_REQUIRES_GATE } from "../../src/graph/safetyAugmenter.js";

const registry = loadRegistry();

function plan(goal: string, mustAvoid: string[] = []) {
  return planWorkflow(
    { goal, must_have_capabilities: [], must_avoid: mustAvoid, output_depth: "brief" },
    registry,
  );
}

const routeIds = (goal: string, mustAvoid: string[] = []) =>
  plan(goal, mustAvoid).recommended_route.map((s) => s.component_id);

/** The goal MAR-540 filed the bug against. Its wording is the acceptance probe. */
const MAR540_PROBE =
  "when a customer emails a refund request, draft the refund in Stripe and require my " +
  "approval before it executes, with an audit trail proving what I approved is exactly what ran";

/** The same drift ask on a phrasing that does not name Stripe. */
const DRIFT_ASK =
  "draft a reply to every support email and require my approval before it sends, " +
  "with an audit trail proving what I approved is exactly what ran";

/** Composes a gate and a write and never says the word "provenance" (bar #4). */
const DEFAULT_PATH =
  "read new leads from Gmail and write a note to the CRM for each one after I approve";

// ── Bar #2: the mechanism exists as a component ─────────────────────────────

describe("the binding mechanism exists as a component (MAR-540 bar #2)", () => {
  const binding = registry.components.find((c) => c.id === "approval_binding");

  it("is published, is a safety component, and asserts rather than acts", () => {
    expect(binding).toBeDefined();
    expect(binding!.status).toBe("published");
    expect(binding!.category).toBe("safety");
    // The ADR is explicit: it reads the payload, it does not act. A binding that
    // can write is a second thing that can drift.
    expect(binding!.permissions.write).toEqual([]);
  });

  it("declares an identity as its output, not a decision", () => {
    // The defect MAR-540 named is that `human_approval_gate` outputs an
    // `approved | rejected | timeout` DECISION with nothing attached to what was
    // decided. The binding's output must carry the identity or it repeats the bug.
    const outputs = binding!.outputs.join(" ").toLowerCase();
    expect(outputs).toMatch(/digest/);
    expect(outputs).toMatch(/token/);
    expect(outputs).toMatch(/refus/);
  });

  it("carries the four failure modes the issue named", () => {
    const modes = binding!.failure_modes.join(" | ").toLowerCase();
    expect(modes).toMatch(/toctou/); // the window between approval and execution
    expect(modes).toMatch(/replay|reused/); // a token used twice
    expect(modes).toMatch(/regenerat/); // an LLM step re-runs after approval
    expect(modes).toMatch(/test mode/); // the check disabled in test and shipped
  });

  it("requires a mutated payload to be REFUSED, not merely logged", () => {
    // MAR-540 bar #2 names this exactly. A mutated payload that executes and is
    // then faithfully recorded is the failure, not the detection of it.
    const evals = binding!.evals.join(" | ").toLowerCase();
    expect(evals).toMatch(/mutated/);
    expect(evals).toMatch(/refus/);
  });

  it("is reachable ONLY through the augmenter — never through a goal phrase", () => {
    // The ADR rejected the hint-reachable shape as the primary fix. This pins
    // that decision: naming the concept in a goal that composes no gated write
    // must not summon the component.
    expect(
      routeIds("design an approval binding with a payload digest and a single-use approval token"),
    ).not.toContain("approval_binding");
  });
});

// ── Bar #3: the relation exists as edges ────────────────────────────────────

describe("the gate's decision reaches an identity and a log (MAR-540 bar #3)", () => {
  const outgoing = registry.edges.filter((e) => e.from === "human_approval_gate");

  it("the gate's decision now reaches an approval identity", () => {
    expect(outgoing.map((e) => e.id)).toContain("human_approval_gate__produces__approval_binding");
  });

  it("the receipt reaches the audit log", () => {
    // MAR-540 shipped human_approval_gate__produces__audit_log: the decision is
    // recorded. This is the other half — the IDENTITY of what was decided is
    // recorded, which is what makes the two log entries comparable.
    expect(outgoing.map((e) => e.id)).toContain("human_approval_gate__produces__audit_log");
    expect(registry.edges.map((e) => e.id)).toContain("approval_binding__produces__audit_log");
  });

  it("every gated write consumes the binding", () => {
    // MAR-540 deliberately did NOT write this edge, because no component
    // produced an approval identity to consume and writing it early would have
    // asserted in the graph the exact guarantee the issue existed to stop
    // asserting. It is honest now, and it must cover EVERY gated write: one
    // representative edge plus a policy set would reproduce the original defect
    // for every write the edge does not name.
    for (const write of ALWAYS_REQUIRES_GATE) {
      expect(
        registry.edges.some((e) => e.from === "approval_binding" && e.to === write),
        `no approval_binding → ${write} edge — that write can still be sequenced after a gate and bound to nothing`,
      ).toBe(true);
    }
  });

  it("states consumption, not sequence", () => {
    // `must_run_before` would say only that the write RUNS AFTER the binding,
    // which is the thing MAR-540 called insufficient. `produces_input_for` says
    // the receipt is an INPUT to the write — the difference between order and
    // provenance, and the whole reason "sequence is not provenance" is the line
    // these edges exist to make readable.
    const consumeEdges = registry.edges.filter((e) => e.from === "approval_binding");
    expect(consumeEdges.length).toBeGreaterThan(0);
    for (const e of consumeEdges) expect(e.relation).toBe("produces_input_for");
  });
});

// ── Bar #4: the DEFAULT path reaches the same guarantee ─────────────────────

describe("the default path is covered, not just the stated one (MAR-540 bar #4)", () => {
  it("a goal that never mentions provenance still gets the binding", () => {
    const route = routeIds(DEFAULT_PATH);
    expect(route).toContain("human_approval_gate");
    expect(route).toContain("approval_binding");
  });

  it("and the header says the approval is bound", () => {
    expect(plan(DEFAULT_PATH).summary_markdown).toContain("Approval enforced (bound)");
  });

  it("and the body explains the chip rather than leaving a bare label", () => {
    expect(plan(DEFAULT_PATH).summary_markdown).toContain("bind the approval to the payload");
  });

  it("the binding is ordered after the gate and before the write it guards", () => {
    const route = routeIds(DEFAULT_PATH);
    expect(route.indexOf("human_approval_gate")).toBeLessThan(route.indexOf("approval_binding"));
    expect(route.indexOf("approval_binding")).toBeLessThan(route.indexOf("crm_note_write"));
  });

  it("reports no spurious GAP — the goal did not ask for binding", () => {
    // The chip and the gap report stay independent on purpose: the card is
    // always honest; `unmatched_demand` speaks only to what the user asked for.
    expect(plan(DEFAULT_PATH).coverage.unmatched_demand).toEqual([]);
  });
});

// ── Bar #1, still true: the stated ask is answered rather than absorbed ──────

describe("a stated drift-proofing ask is now satisfied, not just reported (MAR-540 bar #1)", () => {
  it("MAR-540's own probe goal stops returning the drift ask", () => {
    const r = plan(MAR540_PROBE);
    const gaps = r.coverage.unmatched_demand.join(" ");
    // The drift clause is gone because a component in APPROVAL_BINDING_COMPONENTS
    // is in the route — the switch MAR-540 built the rule around.
    expect(gaps).not.toContain("what I approved is exactly what ran");
    expect(r.recommended_route.map((s) => s.component_id)).toContain("approval_binding");
    // The Stripe refund gap is a DIFFERENT, real gap (no component performs a
    // Stripe refund) and must survive — MAR-581's finding, not this one's.
    // Silence about it would be a new overclaim.
    expect(gaps).toContain("Stripe");
  });

  it("the same ask on a non-Stripe phrasing is fully satisfied", () => {
    const r = plan(DRIFT_ASK);
    expect(r.coverage.unmatched_demand).toEqual([]);
    expect(r.summary_markdown).toContain("Approval enforced (bound)");
  });

  it("but WITHOUT the component the ask comes straight back", () => {
    // The other half of the switch. `must_avoid` is the only honest way to probe
    // this now that injection is unconditional, and it proves the rule is still
    // keyed on the COMPONENT rather than on a phrase list that got hard-coded
    // into agreement with the fix.
    const r = plan(DRIFT_ASK, ["approval_binding"]);
    expect(r.recommended_route.map((s) => s.component_id)).not.toContain("approval_binding");
    expect(r.coverage.unmatched_demand.join(" ")).toContain("what I approved is exactly what ran");
    expect(r.summary_markdown).toContain("Approval enforced (unbound)");
    expect(r.summary_markdown).toContain("not bound to the payload");
  });
});

// ── Bar #5: absence twins ───────────────────────────────────────────────────

describe("routes where binding does not apply must not gain it (MAR-540 bar #5)", () => {
  it("a read-only scheduled report gains neither the component nor the chip", () => {
    const r = plan(
      "every morning read yesterday's signup rows from our postgres database " +
        "and store a short summary in the state store",
    );
    expect(r.enforced_approval_gates).toEqual([]);
    expect(r.recommended_route.map((s) => s.component_id)).not.toContain("approval_binding");
    expect(r.summary_markdown).toContain("No approval needed");
    expect(r.summary_markdown).not.toContain("(bound)");
    expect(r.summary_markdown).not.toContain("(unbound)");
  });

  it("an unattended read-and-notify plan is untouched", () => {
    const r = plan(
      "every morning pull the numbers from our Postgres database and post a summary to Slack",
    );
    expect(r.recommended_route.map((s) => s.component_id)).not.toContain("approval_binding");
    expect(r.summary_markdown).not.toContain("(bound)");
    expect(r.coverage.unmatched_demand).toEqual([]);
  });

  it("a gate with no downstream write gains no binding", () => {
    // The sharper twin: the gate IS present, so the injection rule's first
    // condition holds. There is nothing to bind an approval TO, and a binding in
    // that route would be a component with no consumer — the same empty gesture
    // as a gate with nothing to gate.
    const route = routeIds(
      "an agent that edits code in my repository, runs the test suite and writes a pull request " +
        "summary, and checks with me before it changes anything",
    );
    expect(route).toContain("human_approval_gate");
    expect(route.some((id) => ALWAYS_REQUIRES_GATE.has(id))).toBe(false);
    expect(route).not.toContain("approval_binding");
  });
});
