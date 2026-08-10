/**
 * MAR-596 — planner regressions found in the 2026-08-10 attended DASH run.
 *
 * These are the user's words from the failed paths, not matcher vocabulary
 * invented for a unit test: `out of my Notion database` and the support-mail
 * summary goal used to build `support-mail-digest`.
 */
import { describe, expect, it } from "vitest";
import { matchCapabilities } from "../../src/graph/capabilityMatcher.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";
import { planWorkflow } from "../../src/tools/planWorkflow.js";

const registry = loadRegistry();

const NOTION_OUT_GOAL =
  "pull the latest support notes out of my Notion database and summarise them";
const SUPPORT_MAIL_GOAL = "summarise today's support emails into a few bullet points";

function plan(goal: string) {
  return planWorkflow({ goal, must_have_capabilities: [], must_avoid: [] }, registry);
}

describe("MAR-596/F1 — fuzzy matching requires a meaningful whole word", () => {
  it("does not translate the preposition 'out' into four orchestration components", () => {
    const matches = matchCapabilities(
      NOTION_OUT_GOAL,
      [],
      [],
      registry.components,
      registry.edges,
    );
    const ids = matches.matches.map((match) => match.component.id);

    for (const noiseComponent of [
      "fan_out_collector",
      "intent_classifier",
      "job_queue",
      "threshold_router",
    ]) {
      expect(ids).not.toContain(noiseComponent);
    }
    expect(matches.matches.flatMap((match) => match.matched_tokens)).not.toContain("out");
    expect(ids).toContain("research_synthesis");
  });

  it("keeps the contextual fan-out and audit hints while rejecting bare action verbs", () => {
    const ids = (goal: string) =>
      matchCapabilities(goal, [], [], registry.components, registry.edges).matches.map(
        (match) => match.component.id,
      );

    expect(ids("out")).not.toContain("fan_out_collector");
    expect(ids("write")).not.toContain("audit_log");
    expect(ids("fan out the records in parallel")).toContain("fan_out_collector");
    expect(ids("audit every external action")).toContain("audit_log");
  });
});

describe("MAR-596/F2-F3 — support-mail summary stays AI-backed and read-only", () => {
  it("retains the requested synthesis step with an AI model tier", () => {
    const result = plan(SUPPORT_MAIL_GOAL);
    const synthesis = result.recommended_route.find(
      (step) => step.component_id === "research_synthesis",
    );

    expect(synthesis).toBeDefined();
    expect(synthesis?.model_tier).not.toBe("none");
    expect(result.recommended_route.some((step) => step.model_tier !== "none")).toBe(true);
  });

  it("does not call the noun 'emails' an external write or contradict clearance", () => {
    const result = plan(SUPPORT_MAIL_GOAL);

    expect(result.automation_clearance).toMatchObject({
      level: "L0",
      autonomous_allowed: true,
    });
    expect(result.safety_review.status).not.toBe("fail");
    expect(result.safety_review.blocking_issues).toEqual([]);
    expect(result.safety_review.approval_gates_required).toEqual([]);
    expect(result.summary_markdown).not.toContain("External write/send/publish action detected");
  });
});
