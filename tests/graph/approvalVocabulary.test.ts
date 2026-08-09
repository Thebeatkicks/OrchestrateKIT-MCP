/**
 * MAR-580 — audit/compliance approval vocabulary must reach the human gate.
 *
 * The five presence fixtures below quote the original LAB signal-intake posts'
 * own words rather than paraphrasing them toward the matcher. Only the black-box
 * post exposed the reachability defect; the other four are pinned here because
 * they are the demand corpus this change must continue to serve. The absence
 * fixtures protect the second meaning of "authorization" in this product:
 * authentication/connection checks are not human approval gates.
 */
import { describe, expect, it } from "vitest";
import {
  hasHumanApprovalLanguage,
  matchCapabilities,
} from "../../src/graph/capabilityMatcher.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";
import { planWorkflow } from "../../src/tools/planWorkflow.js";

const registry = loadRegistry();

function plan(goal: string) {
  return planWorkflow(
    { goal, must_have_capabilities: [], must_avoid: [], output_depth: "brief" },
    registry,
  );
}

function route(goal: string): string[] {
  return plan(goal).recommended_route.map((step) => step.component_id);
}

const LAB_POST_EXCERPTS = [
  {
    post: "automated CRM evidence",
    goal:
      "How much evidence should an automated CRM finding show before the report becomes unreadable? " +
      "For automations that actually make decisions (not just move data around), what's the minimum " +
      "evidence you'd need to see before you'd trust the result enough to act on it?",
  },
  {
    post: "human-approved Xero bookkeeping",
    goal:
      "Workflow 2: run only after explicit approval, revalidate, create the Xero transaction, and " +
      "write confirmation back to the source item. The controls I have so far are approval states, " +
      "duplicate-event guards, required-field checks, exception states, and an evidence link back to the source item.",
  },
  {
    post: "n8n governance layer",
    goal:
      "There've been a few threads here recently about approvals, authorisation and oversight in production. " +
      "The questions stopped being \"did it run\" and became \"who owns this one\", \"what breaks if it fails\", " +
      "and \"should this be able to act irreversibly without asking anyone\".",
  },
  {
    post: "what was approved",
    goal:
      "People often say risky agent actions are safe because a human approves them. But what did the person approve? " +
      "How tightly are people binding human approval to the action that eventually happens?",
  },
  {
    post: "financial black box",
    goal:
      "The financial system runs on audits. On proof. On the ability to say this happened, here's why, and here's " +
      "who authorized it. Are there any projects building the verification layer now? With every step hashed and " +
      "tied to authorization, receipts that actually hold up to regulators.",
  },
] as const;

describe("the five original LAB posts' own words reach human_approval_gate (MAR-580)", () => {
  for (const fixture of LAB_POST_EXCERPTS) {
    it(fixture.post, () => {
      const result = plan(fixture.goal);
      expect(result.recommended_route.map((step) => step.component_id)).toContain(
        "human_approval_gate",
      );
      expect(result.enforced_approval_gates).toContain("human_approval_gate");
    });
  }

  it("keeps the black-box post's binding concern honest after the gate lands", () => {
    const result = plan(LAB_POST_EXCERPTS[4].goal);
    expect(result.coverage.unmatched_demand.join(" ")).toMatch(
      /who authorized it|tied to authorization/,
    );
  });
});
describe("authorization and sign-off vocabulary is whole-word and meaning-aware", () => {
  const PRESENCE = [
    "Tie every action to who authorized it and keep an audit receipt.",
    "Every payment must be authorised by the finance owner.",
    "Ship only after human sign-off.",
    "Ship after the owner signed off.",
  ];
  for (const goal of PRESENCE) {
    it(`lands for: ${goal}`, () => {
      expect(hasHumanApprovalLanguage(goal.toLowerCase())).toBe(true);
      expect(route(goal)).toContain("human_approval_gate");
    });
  }

  const ABSENCE = [
    "Accept an authorized sender and reject an unauthorized sender.",
    "Connect Gmail through the OAuth authorization code flow.",
    "Send an Authorization header with the bearer token.",
    "Record the sender authorization result in the audit log.",
  ];
  for (const goal of ABSENCE) {
    it(`does not turn technical auth into approval: ${goal}`, () => {
      expect(hasHumanApprovalLanguage(goal.toLowerCase())).toBe(false);
      const matched = matchCapabilities(
        goal,
        [],
        [],
        registry.components,
        registry.edges,
      ).matches.map((match) => match.component.id);
      expect(matched).not.toContain("human_approval_gate");
    });
  }
});
