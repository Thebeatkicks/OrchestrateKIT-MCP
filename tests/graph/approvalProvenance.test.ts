/**
 * MAR-540 bar #1 — the approval-provenance overclaim.
 *
 * A goal stating the concern as plainly as a user ever will returned
 * `approval: enforced`, `unmatched_demand: []`. The reader was told the
 * requirement was satisfied by a route that does not satisfy it.
 *
 * The clause was ABSORBED rather than merely unmet: "approve"/"approved" is a
 * DEMAND_VERB that `human_approval_gate`'s own hint claims, and one claimed word
 * clears a clause — so the ask disappeared into the very component whose
 * insufficiency it was describing.
 *
 * Bar #1 has two halves and both are asserted here: the stated ask must be
 * reported, AND the DEFAULT path must stop overstating (bar #4's reason — a goal
 * that never says "approval" reaches the same gate). The absence twins are the
 * other half of the bar: a read-only route and a gate-free plan must not gain
 * either the qualification or the gap.
 *
 * Design: docs/ADR-MAR-540-approval-provenance.md.
 */
import { describe, expect, it } from "vitest";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

function plan(goal: string) {
  return planWorkflow(
    { goal, must_have_capabilities: [], must_avoid: [], output_depth: "brief" },
    registry,
  );
}

// ── Half 1: the stated ask is reported ───────────────────────────────────────

describe("a stated drift-proofing ask is reported, not absorbed (MAR-540 bar #1)", () => {
  const STATED = [
    "draft a reply to every support email and require my approval before it sends, " +
      "with an audit trail proving what I approved is exactly what ran",
    "post the generated summary to Slack after I approve it, and prove that what I approved " +
      "is exactly what was posted",
    "write a note to the CRM after I approve, with no drift between what I approved and what executed",
  ];
  for (const goal of STATED) {
    it(`reports it for: "${goal.slice(0, 55)}…"`, () => {
      const r = plan(goal);
      expect(r.coverage.unmatched_demand.length).toBeGreaterThan(0);
      expect(r.coverage.unmatched_demand.join(" ").toLowerCase()).toMatch(
        /approved|drift/,
      );
    });
  }

  it("MAR-540's own probe goal — the Stripe instance MAR-541 half-fixed", () => {
    // MAR-541 removed the gate-with-nothing-to-guard by suppressing
    // `stripe_data_read` on a money-moving write, so the refund now surfaces as
    // its own gap. The DRIFT ask was still absorbed, and is the part this fixes.
    const r = plan(
      "when a customer emails a refund request, draft the refund in Stripe and require my " +
        "approval before it executes, with an audit trail proving what I approved is exactly what ran",
    );
    const gaps = r.coverage.unmatched_demand.join(" ");
    expect(gaps).toContain("Stripe");
    expect(gaps).toContain("what I approved is exactly what ran");
  });
});

// ── Half 2: the DEFAULT path stops overstating (bar #4's reason) ─────────────

describe("an unbound gate says so, even when the goal never asks (MAR-540 bar #4)", () => {
  it("qualifies the chip on a goal that never mentions provenance", () => {
    const r = plan("read new leads from Gmail and write a note to the CRM for each one after I approve");
    expect(r.enforced_approval_gates).toContain("human_approval_gate");
    expect(r.summary_markdown).toContain("Approval enforced (unbound)");
  });

  it("and explains the chip in the body rather than leaving a bare label", () => {
    const r = plan("read new leads from Gmail and write a note to the CRM for each one after I approve");
    expect(r.summary_markdown).toContain("not bound to the payload");
  });

  it("but reports no spurious GAP — the goal did not ask for binding", () => {
    // The qualification and the gap report are independent on purpose: the card
    // is always honest; `unmatched_demand` speaks only to what the user asked.
    const r = plan("read new leads from Gmail and write a note to the CRM for each one after I approve");
    expect(r.coverage.unmatched_demand).toEqual([]);
  });
});

// ── Absence twins ───────────────────────────────────────────────────────────

describe("plans with no gated write are untouched (MAR-540 absence fixtures)", () => {
  it("a read-only PR review keeps its unqualified header", () => {
    const r = plan(
      "When a pull request opens on GitHub, review the diff for bugs and risky changes, " +
        "notify reviewers with a summary, and never edit or commit code.",
    );
    expect(r.enforced_approval_gates).toEqual([]);
    expect(r.summary_markdown).toContain("No approval needed");
    expect(r.summary_markdown).not.toContain("(unbound)");
  });

  it("an unattended read-and-notify plan keeps its unqualified header", () => {
    const r = plan("every morning pull the numbers from our Postgres database and post a summary to Slack");
    expect(r.summary_markdown).not.toContain("(unbound)");
    expect(r.coverage.unmatched_demand).toEqual([]);
  });
});

// ── Bar #3, first half: the gate's decision reaches the log ──────────────────

describe("human_approval_gate no longer has zero outgoing edges (MAR-540 bar #3)", () => {
  it("the decision reaches the audit log as a graph relation", () => {
    const outgoing = registry.edges.filter((e) => e.from === "human_approval_gate");
    expect(outgoing.length).toBeGreaterThan(0);
    expect(outgoing.map((e) => e.id)).toContain("human_approval_gate__produces__audit_log");
  });

  it("and the second edge is deliberately NOT written yet", () => {
    // "the executing write CONSUMES the binding" cannot be stated honestly
    // until a component produces an approval identity to consume. Writing it
    // early would assert in the graph the exact guarantee this issue exists to
    // stop asserting. Asserted so the omission reads as a decision, not a gap.
    const bindingEdges = registry.edges.filter((e) => e.id.includes("approval_binding"));
    expect(bindingEdges).toEqual([]);
    expect(registry.components.some((c) => c.id === "approval_binding")).toBe(false);
  });
});
