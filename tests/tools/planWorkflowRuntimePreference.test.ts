/**
 * MAR-699 — `plan_workflow` should prefer the DASH Agent Runner over a managed
 * background worker when the caller asserts DASH's broker is present and the
 * plan does not genuinely need the computer to stay off.
 *
 * ## The gap this closes
 *
 * MAR-692 fixed `export_build_brief`'s connection block (a `dash_managed`
 * OpenRouter connection, no raw `.env` key) but deliberately left the
 * upstream decision alone: `plan_workflow` recommended a **managed
 * background worker** for the competitor scout's own goal regardless of
 * `dash_broker_available`, because that signal did not exist as a
 * `plan_workflow` input — only `export_build_brief` accepted it (ADR
 * MAR-494 §"What this does not change": "`plan_workflow` is untouched").
 * DASH's own `lib/manifest-constraints.ts` refuses at import any manifest
 * pairing a remote runtime with a `dash_managed` connection (ADR 0006), so
 * on that runtime the model key genuinely had to live with the agent — the
 * planner's own default routed around the supervised path the MVP is built
 * on.
 *
 * These tests exercise the REAL pipeline end to end — `planWorkflow`'s own
 * `runtime_recommendation`, `control_surface`, `interaction_surface` and
 * `trigger_explanation`, unmodified, fed straight into `export_build_brief`
 * — rather than the hand-built `RuntimeOption` fixtures `dashModelCustody.
 * test.ts` used to stand in for "the runtime plan_workflow actually
 * recommends" before this fix existed.
 */
import { describe, it, expect } from "vitest";

import { exportBuildBrief } from "../../src/tools/exportBuildBrief.js";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";
import { dashOperationById } from "../../src/lib/dashBrokerCatalog.js";
import type { AnyBuildBriefOutput, CompactBuildBriefOutput } from "../../src/tools/exportBuildBrief.js";

function brief(result: AnyBuildBriefOutput): CompactBuildBriefOutput {
  if ("status" in result && result.status === "needs_input") {
    throw new Error(
      `export_build_brief returned needs_input: ${JSON.stringify(result).slice(0, 300)}`,
    );
  }
  return result as CompactBuildBriefOutput;
}

const registry = loadRegistry({ includeBeta: true, includeCandidates: true, strict: false });

/** The competitor scout's own goal string, verbatim — MAR-689 §3.3 / MAR-692 step 0. */
const SCOUT_GOAL =
  "Watches public sources for what competing agent products ship and for what people " +
  "praise, complain about and ask for, and writes a briefing where every claim links to " +
  "where it came from.";

function planScout(goal: string, dashBrokerAvailable: boolean | undefined) {
  return planWorkflow(
    {
      goal,
      must_have_capabilities: [],
      must_avoid: [],
      dash_broker_available: dashBrokerAvailable,
    },
    registry,
  );
}

function briefFor(
  plan: ReturnType<typeof planScout>,
  dashBrokerAvailable: boolean | undefined,
): CompactBuildBriefOutput {
  const wizard = plan.goal_to_product_wizard;
  return brief(exportBuildBrief({
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
    // The point of this file: these four come straight off the wizard the
    // fixed plan_workflow produced — nothing hand-built stands in for them.
    runtime_requirements: wizard.runtime_requirements,
    runtime_recommendation: wizard.runtime_recommendation,
    control_surface: wizard.control_surface,
    interaction_surface: wizard.interaction_surface,
    trigger_explanation: wizard.trigger_explanation,
    handoff_targets: ["prompt"],
    playbook_id: plan.playbook?.id ?? "",
    route_id: plan.playbook?.route_id ?? "",
    build_target: "code",
    output_location: "",
    dash_broker_available: dashBrokerAvailable,
    llm_provider: "openrouter",
    generated_at: "2026-08-18T00:00:00Z",
  }));
}

describe("MAR-699 — plan_workflow's own runtime_recommendation, gated on dash_broker_available", () => {
  it("regression: without dash_broker_available, nothing changes — still the managed background worker", () => {
    const plan = planScout(SCOUT_GOAL, undefined);
    const wizard = plan.goal_to_product_wizard;
    expect(wizard.runtime_requirements.must_run_while_computer_off).toBe(false);
    expect(wizard.runtime_recommendation.id).toBe("managed_durable_background_runtime");
    expect(wizard.runtime_alternatives.map((a) => a.id)).toContain("dash_agent_runner_local");
  });

  it("the scout's goal verbatim, dash_broker_available: true → recommends the DASH Agent Runner", () => {
    const plan = planScout(SCOUT_GOAL, true);
    const wizard = plan.goal_to_product_wizard;
    expect(wizard.runtime_requirements.must_run_while_computer_off).toBe(false);
    expect(wizard.runtime_recommendation.id).toBe("dash_agent_runner_local");
    expect(wizard.runtime_recommendation.availability).toBe("available now");
    // The managed worker is demoted to an alternative, not dropped — a real
    // choice, not a hidden one.
    expect(wizard.runtime_alternatives.map((a) => a.id)).toContain(
      "managed_durable_background_runtime",
    );
    // Placement axes derived from the same signal move together (MAR-427:
    // one decision, re-projected everywhere, never independently inferred).
    expect(wizard.control_surface.recommended.id).toBe("dash_control");
    expect(plan.hosting_and_monitoring.hosting.recommended.id).toBe("dash_agent_runner_local");
  });

  it("the same goal with a genuine computer-off requirement still recommends the durable runtime — the runner cannot satisfy it, and says so", () => {
    const plan = planScout(
      SCOUT_GOAL + " Keep working even while my computer is off.",
      true,
    );
    const wizard = plan.goal_to_product_wizard;
    expect(wizard.runtime_requirements.must_run_while_computer_off).toBe(true);
    expect(wizard.runtime_recommendation.id).toBe("managed_durable_background_runtime");
    // Not offered at all, recommended or alternative — it would be a dishonest option.
    const allOffered = [wizard.runtime_recommendation, ...wizard.runtime_alternatives].map(
      (o) => o.id,
    );
    expect(allOffered).not.toContain("dash_agent_runner_local");
  });

  it("the connection block follows: dash_broker_available + no computer-off → dash_managed, no raw provider key", () => {
    const plan = planScout(SCOUT_GOAL, true);
    const b = briefFor(plan, true);
    const ai = b.agent_manifest.agent_dom.connections.find((c) => c.id === "openrouter");
    expect(ai?.ownership).toBe("dash_managed");
    const ids = (ai?.capabilities ?? []).map((capability) => capability.id);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(dashOperationById(id), `${id} resolves nothing in DASH's catalogue`).not.toBeNull();
    }
    expect(b.connect.credential_manifest.map((c) => c.env)).not.toContain("OPENROUTER_API_KEY");
    expect(JSON.stringify(b)).not.toContain("OPENROUTER_API_KEY");
  });

  it("the trade-off stays visible: a computer-off goal still gets the honest .env sentence, key-with-agent", () => {
    const plan = planScout(
      SCOUT_GOAL + " Keep working even while my computer is off.",
      true,
    );
    const b = briefFor(plan, true);
    const ai = b.agent_manifest.agent_dom.connections.find((c) => c.id === "openrouter");
    expect(ai?.ownership).toBe("agent_managed");
    expect(b.connect.credential_manifest.map((c) => c.env)).toContain("OPENROUTER_API_KEY");
    expect(b.sections.s11_connect).toContain("DASH has no record of any of it");
    expect(b.sections.s11_connect).toContain("ADR 0006");
  });
});
