import { describe, expect, it } from "vitest";
import { exportBuildBrief } from "../../src/tools/exportBuildBrief.js";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();
const EXACT_GOAL =
  "Watch public news feeds for stories about AI agents and write me a daily digest file on my computer.";

function planExactGoal() {
  return planWorkflow(
    {
      goal: EXACT_GOAL,
      must_have_capabilities: [],
      must_avoid: [],
      build_target: "code",
      local_or_hosted: "local",
      output_depth: "technical",
    },
    registry,
  );
}

function exportExactGoal() {
  const plan = planExactGoal();
  const wizard = plan.goal_to_product_wizard;
  return exportBuildBrief({
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
    build_target: "code",
    output_location: "daily digest file on my computer",
    agent_name: "ai-news-scout",
    generated_at: "2026-08-01T00:00:00.000Z",
    llm_provider: "deterministic_first",
  });
}

describe("MAR-455 exact public-feed planner and export proof", () => {
  it("preserves wording and emits a zero-connection anonymous route", () => {
    const plan = planExactGoal();
    const ids = plan.recommended_route.map((step) => step.component_id);

    expect(plan.goal).toBe(EXACT_GOAL);
    expect(plan.goal_fidelity.looks_like_paraphrase).toBe(false);
    expect(ids).toContain("public_feed_fetch");
    expect(ids).toContain("scheduled_trigger");
    expect(ids).not.toContain("page_monitor");
    expect(ids).not.toContain("data_scraper");
    expect(ids).not.toContain("source_retrieval");
    expect(ids).not.toContain("external_publish");
    expect(plan.what_you_need).toEqual([]);
    expect(plan.connection_contract).toEqual([]);
    expect(plan.summary_markdown).not.toContain("Firecrawl");
    expect(plan.summary_markdown).not.toContain("@firecrawl/mcp");
    expect(plan.summary_markdown).not.toContain("500 pages / month");
  });

  it("MAR-456: recommends the local runtime, not paid hosting, for a computer-on local-output goal", () => {
    const plan = planExactGoal();
    const wizard = plan.goal_to_product_wizard;

    expect(wizard.runtime_requirements).toMatchObject({
      trigger_mode: "scheduled",
      operation_mode: "scheduled",
      must_run_while_computer_off: false,
    });
    // Before MAR-456 this was "managed_scheduled_job" — a bare scheduled
    // route always recommended a paid managed timer regardless of whether the
    // computer needed to stay off. The goal writes its output to this
    // computer and never asks for computer-off execution, so the floor is the
    // local scheduled task, not a bill.
    expect(wizard.runtime_recommendation.id).toBe("local_scheduled_runtime");
    expect(wizard.runtime_recommendation.limitation).toContain(
      "needs no provider account or secret",
    );
    expect(wizard.recommended_setup.next_achievable_step).toContain(
      "feed read needs no provider account or credential",
    );
    expect(wizard.recommended_setup.next_achievable_step).not.toMatch(
      /Firecrawl|OAuth|API key/,
    );

    // The legacy hosting field and the build_surface question round must
    // agree with the runtime recommendation above, not contradict it.
    expect(plan.hosting_and_monitoring.hosting.recommended.id).toBe("local_cron");
    const buildSurface = plan.question_flow.rounds.find(
      (round) => round.id === "build_surface",
    )!;
    expect(buildSurface.recommended_option_id).toBe("self_host_local");
    expect(buildSurface.recommended_option_id).not.toBe("self_host_hosted");
  });

  it("exports a deterministic DASH manifest v2 with no credential connection", () => {
    const first = exportExactGoal();
    const second = exportExactGoal();

    expect(first).toEqual(second);
    expect("agent_manifest" in first).toBe(true);
    if (!("agent_manifest" in first)) return;

    expect(first.agent_manifest.manifest_version).toBe(2);
    expect(first.agent_manifest.agent.goal).toBe(EXACT_GOAL);
    expect(first.agent_manifest.planned_route.map((step) => step.component_id)).toContain(
      "public_feed_fetch",
    );
    expect(first.agent_manifest.planned_route.map((step) => step.component_id)).not.toContain(
      "page_monitor",
    );
    expect(first.agent_manifest.connections).toEqual([]);
    expect(first.agent_manifest.agent_dom.connections).toEqual([]);
    expect(first.agent_manifest.monitoring.output_location).toBe(
      "daily digest file on my computer",
    );
    expect(
      first.connect.credential_manifest.filter((credential) => credential.required),
    ).toEqual([]);
    expect(
      first.connect.credential_manifest.map((credential) => credential.provider),
    ).toEqual(["dash", "dash"]);
    expect(first.connect.credential_manifest).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "firecrawl" }),
      ]),
    );
    expect(first.brief_markdown).toContain(EXACT_GOAL);
    expect(first.brief_markdown).toContain("public_feed_fetch");
    expect(first.brief_markdown).not.toContain("Firecrawl");
  });
});
