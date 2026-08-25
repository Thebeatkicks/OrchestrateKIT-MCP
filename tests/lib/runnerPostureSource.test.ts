/**
 * MAR-742/F2 — the runner posture is never silent about where it came from.
 *
 * Reported case: a goal that said "unattended" in as many words was assessed
 * against the `public` posture, all seven dimensions came back undecided, and
 * the brief said only "(`public` posture)". Two separate defects wearing one
 * symptom:
 *
 *  1. `detectConstraintSignals` already reads `unattended` out of the goal and
 *     carries the phrase that triggered it, but nothing connected that to
 *     `runner_posture`, which defaulted to `public` regardless.
 *  2. Even with the default being correct, the reader could not tell a
 *     DEFAULTED posture from a DECLARED one — and the posture decides which
 *     dimensions gate the result, so that is not a detail.
 *
 * The second is the load-bearing half: `runnerEligibility.ts` exists to keep
 * "nobody said" and "the answer is no" on separate code paths, and a posture
 * that cannot say whether anyone chose it is the same collapse one level up.
 *
 * Every presence fixture is paired with an absence fixture, per the module's own
 * rule: a goal that says nothing still gets the strictest posture, and a goal
 * that names OPEN reachability keeps it however unattended it is.
 */
import { describe, expect, it } from "vitest";
import { assessRunnerEligibility } from "../../src/lib/runnerEligibility.js";
import { exportBuildBrief } from "../../src/tools/exportBuildBrief.js";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

/**
 * `exportBuildBrief` returns a union that includes the needs-input shape. Every
 * call here supplies a complete plan, so narrowing once keeps each test reading
 * as an assertion about the posture rather than about the overload.
 */
function briefFor(goal: string, extra: Record<string, unknown> = {}) {
  const plan = planWorkflow({ goal, must_have_capabilities: [], must_avoid: [] }, registry);
  const wizard = plan.goal_to_product_wizard;
  const result = exportBuildBrief({
    goal: plan.goal,
    plan_source: plan.plan_source,
    route_status: plan.route_status,
    recommended_route: plan.recommended_route,
    safety_review: plan.safety_review,
    automation_clearance: plan.automation_clearance,
    enforced_approval_gates: plan.enforced_approval_gates,
    untested_edges: plan.untested_edges,
    avoid_when_violations: plan.avoid_when_violations,
    evals_to_add: plan.evals_to_add,
    design_notes: plan.design_notes,
    worker_pipeline: plan.worker_pipeline,
    loop_guidance: plan.loop_guidance,
    approval_gate_advisory: plan.approval_gate_advisory,
    runtime_requirements: wizard.runtime_requirements,
    runtime_recommendation: wizard.runtime_recommendation,
    control_surface: wizard.control_surface,
    interaction_surface: wizard.interaction_surface,
    trigger_explanation: wizard.trigger_explanation,
    handoff_targets: ["prompt"],
    llm_provider: "anthropic",
    ...extra,
  } as Parameters<typeof exportBuildBrief>[0]);
  if (!("runner_eligibility" in result)) {
    throw new Error("export_build_brief returned the needs-input shape for a complete plan");
  }
  return result;
}

const UNATTENDED_GOAL =
  "Watch the prices of a few things my family wants across a handful of shops and tell me " +
  "when one drops below the price I set. It should run on its own without me watching, " +
  "unattended, and only I can reach it.";

const SILENT_GOAL =
  "Watch the prices of a few things my family wants across a handful of shops and tell me " +
  "when one drops below the price I set.";

describe("the posture is derived from the goal that states it (MAR-742/F2)", () => {
  it("an unattended goal is assessed as unattended, not public", () => {
    const brief = briefFor(UNATTENDED_GOAL);
    expect(brief.runner_eligibility.posture).toBe("unattended");
    expect(brief.runner_eligibility.posture_source).toBe("derived");
  });

  it("the reason quotes the goal's own trigger phrase", () => {
    // Grounded-prose rule: the brief shows its work from the user's words
    // rather than asserting a posture from nowhere.
    const brief = briefFor(UNATTENDED_GOAL);
    expect(brief.runner_eligibility.posture_reason).toContain("the goal says so");
    expect(brief.runner_eligibility.posture_reason).toContain("unattended");
  });

  it("the narrower posture actually narrows the required set", () => {
    // Six dimensions, not seven — this is the difference the reader was being
    // shown as `public` without explanation.
    const unattended = briefFor(UNATTENDED_GOAL).runner_eligibility;
    const silent = briefFor(SILENT_GOAL).runner_eligibility;
    expect(unattended.required_dimensions).not.toContain("network_exposure");
    expect(silent.required_dimensions).toContain("network_exposure");
    expect(unattended.required_dimensions.length).toBeLessThan(
      silent.required_dimensions.length,
    );
  });

  it("no capability evidence still means needs_evidence, at either posture", () => {
    // Deriving a posture must never turn into deriving a pass. The fail-closed
    // property is unchanged.
    expect(briefFor(UNATTENDED_GOAL).runner_eligibility.decision).toBe("needs_evidence");
    expect(briefFor(SILENT_GOAL).runner_eligibility.decision).toBe("needs_evidence");
  });
});

describe("the absence twins — nothing said, or open reach said (MAR-742/F2)", () => {
  it("a goal that says nothing gets the strictest posture, and says so", () => {
    const assessment = briefFor(SILENT_GOAL).runner_eligibility;
    expect(assessment.posture).toBe("public");
    expect(assessment.posture_source).toBe("default");
    expect(assessment.posture_reason).toContain("nothing declared");
    expect(assessment.posture_reason).toContain("not evidence of a narrow one");
  });

  it("a goal naming OPEN reach keeps the public posture however unattended it is", () => {
    // Posture is about who can REACH the agent; the supervision signals do not
    // answer that. An unattended agent anyone can trigger is still public.
    const assessment = briefFor(
      "Run a price checker unattended, on its own, with no one watching — anyone can " +
        "trigger it from a public endpoint.",
    ).runner_eligibility;
    expect(assessment.posture).toBe("public");
    expect(assessment.posture_source).toBe("default");
  });

  it("an explicitly declared posture still wins, and is labelled as declared", () => {
    const assessment = briefFor(UNATTENDED_GOAL, {
      runner_posture: "public",
    }).runner_eligibility;
    expect(assessment.posture).toBe("public");
    expect(assessment.posture_source).toBe("declared");
    expect(assessment.posture_reason).toContain("the caller declared it");
  });
});

describe("the rendered §9 block states the posture source (MAR-742/F2)", () => {
  it("a derived posture is visible in the brief markdown, not just the JSON", () => {
    // The reported failure was a reader looking at prose, so prose is where the
    // fix has to land.
    const md = briefFor(UNATTENDED_GOAL).brief_markdown;
    expect(md).toContain("Posture source:");
    expect(md).toContain("`derived`");
  });

  it("a defaulted posture says it defaulted", () => {
    const md = briefFor(SILENT_GOAL).brief_markdown;
    expect(md).toContain("Posture source:");
    expect(md).toContain("`default`");
  });
});

describe("assessRunnerEligibility keeps its own contract (MAR-742/F2)", () => {
  it("defaults posture_source to declared when a caller passes one directly", () => {
    const assessment = assessRunnerEligibility({ posture: "attended" });
    expect(assessment.posture_source).toBe("declared");
    expect(assessment.decision).toBe("needs_evidence");
  });

  it("a derived assessment with no trigger still renders a usable sentence", () => {
    const assessment = assessRunnerEligibility({
      posture: "unattended",
      posture_source: "derived",
    });
    expect(assessment.posture_reason).toContain("unattended");
    expect(assessment.posture_reason.length).toBeGreaterThan(0);
  });
});
