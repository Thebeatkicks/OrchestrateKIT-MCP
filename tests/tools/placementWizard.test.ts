import { describe, expect, it } from "vitest";
import {
  planWorkflow,
  type GoalToProductWizard,
  type PlacementAxis,
  type RuntimeOption,
} from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

const PROMPT_A =
  "I want an assistant that looks at my Gmail for meeting requests, checks my calendar, " +
  "suggests two times, and after I approve it creates the calendar invite and leaves a reply " +
  "in my Gmail drafts. I do not want it to send anything without me.";
const PROMPT_B =
  "Watch five competitor product pages every morning and tell our team in Slack when a price " +
  "changes. I want it to keep working when my computer is off.";
const PROMPT_C =
  "When I ask in chat, summarize the documents I select. Never run in the background and never change the documents.";

function plan(
  goal: string,
  output_depth: "guided" | "brief" | "standard" | "technical" | "deep" = "guided",
  build_target?: "cowork" | "cursor" | "chatgpt_gpt" | "code",
) {
  return planWorkflow(
    {
      goal,
      must_have_capabilities: [],
      must_avoid: [],
      output_depth,
      ...(build_target ? { build_target } : {}),
    },
    registry,
  );
}

function expectCompleteSurface(axis: PlacementAxis) {
  for (const option of [axis.recommended, ...axis.alternatives]) {
    expect(option.label).not.toBe("");
    expect(option.appropriate_when).not.toBe("");
    expect(option.limitation).not.toBe("");
    expect(["available now", "requires setup", "planned", "advanced"]).toContain(option.availability);
  }
}

function expectCompleteRuntime(option: RuntimeOption) {
  expect(option.runtime_class).not.toBe("");
  expect(option.reason).not.toBe("");
  expect(option.offline_behavior).not.toBe("");
  expect(typeof option.continues_when_dash_closed).toBe("boolean");
  expect(option.limitation).not.toBe("");
  expect(["available now", "requires setup", "planned", "advanced"]).toContain(option.availability);
}

function snapshotContract(wizard: GoalToProductWizard) {
  return {
    runtime_requirements: wizard.runtime_requirements,
    runtime_recommendation: wizard.runtime_recommendation,
    runtime_alternatives: wizard.runtime_alternatives,
    control_surface: wizard.control_surface,
    interaction_surface: wizard.interaction_surface,
    trigger_explanation: wizard.trigger_explanation,
    recommended_setup: wizard.recommended_setup,
    recommended_next_click: wizard.recommended_next_click,
  };
}

describe("MAR-378 — corrected runtime-fit wizard", () => {
  it("Prompt A selects a durable background runtime with provider-neutral approvals", () => {
    const result = plan(PROMPT_A);
    const wizard = result.goal_to_product_wizard;
    expect(wizard.runtime_recommendation.runtime_class).toBe("managed_durable_background");
    expect(wizard.runtime_requirements).toMatchObject({
      persistent_state_needed: true,
      durable_approval_needed: true,
      must_run_while_user_offline: true,
      estimated_operational_complexity: "high",
    });
    expect(wizard.control_surface.recommended.id).toBe("provider_neutral_approval_inbox");
    expect(wizard.interaction_surface.recommended.id).toBe("approval_inbox_interaction");
    expect(wizard.trigger_explanation.label).toContain("Gmail");
    expect(wizard.recommended_setup.action).toBeNull();
    expect(wizard.recommended_setup.blocker).toContain("MCP worker is stateless");
    // Prompt A asks for "the calendar invite" AND says "I do not want it to send
    // anything without me" — an invite is a send, so the notification fork is
    // open and pickRecommendedNextClick puts answering it ahead of runtime prep
    // (the standing rule for any clarifying question, not new behavior here).
    // MAR-378's runtime-fit contract above is unchanged; only the next click is.
    expect(result.clarifying_questions.map((q) => q.id)).toContain("calendar_notification");
    expect(wizard.recommended_next_click.id).toBe("answer_clarifying_questions");
    // MAR-398: operating-bundle prose now renders from `standard` up.
    const mdA = plan(PROMPT_A, "standard").summary_markdown;
    expect(mdA).toContain("Managed background worker / durable workflow");
    expect(mdA).toContain("provider-neutral");
    expect(result.summary_markdown).toContain("Email sending: excluded per your constraint");
    expect(result.summary_markdown).not.toContain("Email Send (disabled for this goal)");
    expect(result.summary_markdown).not.toContain("Use recommended setup");
    expect(result.summary_markdown).not.toContain("localhost");
  });

  it("Prompt B selects a managed scheduled job, not an always-on worker", () => {
    const result = plan(PROMPT_B);
    const wizard = result.goal_to_product_wizard;
    expect(wizard.runtime_recommendation.runtime_class).toBe("managed_scheduled_job");
    expect(wizard.runtime_recommendation.label).toBe("Managed scheduled job");
    expect(wizard.runtime_requirements.operation_mode).toBe("scheduled");
    expect(wizard.runtime_requirements.persistent_state_needed).toBe(true);
    expect(wizard.runtime_requirements.durable_approval_needed).toBe(false);
    expect(wizard.control_surface.recommended.id).toBe("runtime_provider_control");
    expect(wizard.interaction_surface.recommended.id).toBe("slack_interaction");
    expect(wizard.interaction_surface.recommended.limitation).toContain(
      "approve every post or automate low-risk alerts",
    );
    expect(wizard.recommended_setup.next_achievable_step).toContain(
      "low-risk price-change alerts",
    );
    expect(wizard.runtime_alternatives.map((option) => option.runtime_class)).not.toContain(
      "managed_durable_background",
    );
    // MAR-398: operating-bundle prose now renders from `standard` up.
    expect(plan(PROMPT_B, "standard").summary_markdown).toContain(
      "Slack is an interaction surface, not hosting",
    );
    expect(result.summary_markdown).not.toContain("Always-on managed runner");
    expect(result.summary_markdown).not.toContain("Use recommended setup");
  });

  it("keeps price-monitor instructions out of unrelated scheduled Slack plans", () => {
    const result = plan(
      "Every morning, pull yesterday's revenue from Stripe and post a summary to our Slack finance channel.",
    );
    const nextStep = result.goal_to_product_wizard.recommended_setup.next_achievable_step;

    expect(nextStep).toContain("choose whether Slack posts require approval");
    expect(nextStep).toContain("durable run history");
    expect(nextStep).not.toMatch(/price|change-detection/i);
  });

  it("Prompt C selects the current client/chat runtime with no background trigger", () => {
    const result = plan(PROMPT_C);
    const wizard = result.goal_to_product_wizard;
    expect(wizard.runtime_recommendation.runtime_class).toBe("client_chat");
    expect(wizard.runtime_requirements).toMatchObject({
      trigger_mode: "interactive",
      operation_mode: "interactive",
      must_run_while_user_offline: false,
      estimated_operational_complexity: "low",
    });
    expect(wizard.control_surface.recommended.id).toBe("client_control");
    expect(wizard.interaction_surface.recommended.id).toBe("client_interaction");
    expect(wizard.trigger_explanation.what_wakes_it_up).toContain("Nothing runs until the user asks");
    // MAR-398: operating-bundle prose now renders from `standard` up.
    expect(plan(PROMPT_C, "standard").summary_markdown).toContain("Client/chat runtime");
    expect(result.summary_markdown).not.toContain("Managed scheduled job");
    expect(result.summary_markdown).not.toContain("background worker");
  });

  it("all three prompts receive different runtime classes and complete option metadata", () => {
    const results = [PROMPT_A, PROMPT_B, PROMPT_C].map((goal) => plan(goal));
    expect(new Set(results.map((result) => result.goal_to_product_wizard.runtime_recommendation.runtime_class)).size).toBe(3);
    for (const result of results) {
      const wizard = result.goal_to_product_wizard;
      expectCompleteRuntime(wizard.runtime_recommendation);
      wizard.runtime_alternatives.forEach(expectCompleteRuntime);
      expect(wizard.runtime_alternatives.length).toBeGreaterThanOrEqual(2);
      expect(wizard.runtime_alternatives.length).toBeLessThanOrEqual(3);
      expectCompleteSurface(wizard.control_surface);
      expectCompleteSurface(wizard.interaction_surface);
      expect(wizard.control_surface.recommended.id).not.toContain("dash");
      expect(wizard.interaction_surface.recommended.id).not.toContain("dash");
      const websiteBroker = wizard.control_surface.alternatives.find(
        (option) => option.id === "website_install_broker",
      );
      expect(websiteBroker?.limitation).toContain(
        "does not execute agents without a separate real runner",
      );
      expect(wizard.recommended_setup.action).toBeNull();
      expect(wizard.recommended_setup.blocker).toContain("MCP worker is stateless");
      expect(result.summary_markdown).not.toContain("Use recommended setup");
    }
  });

  /**
   * MAR-398 CHANGES THIS CONTRACT DELIBERATELY. MAR-378 put runtime-fit detail
   * in guided/brief; MAR-398 moves it behind `standard` because Layer 1 is a
   * decision card ("runtime class, control/interaction surface, triggers …
   * moves behind output_depth standard/technical. Nothing is deleted — it stops
   * being Layer 1"). The detail is unchanged and still asserted below; only the
   * depth it appears at moved, and guided/brief now assert its ABSENCE.
   */
  it("keeps runtime-fit detail from standard through deep output", () => {
    for (const depth of ["guided", "brief"] as const) {
      const md = plan(PROMPT_A, depth).summary_markdown;
      // The full 7-bullet bundle is a Layer-2 report block…
      expect(md).not.toContain("Recommended runtime setup");
      // …but PROMPT_A must outlive the session, so the two facts that ARE a
      // decision — where it runs, what wakes it — stay on the card, folded
      // into the MAR-402 ⭐ Recommended-setup line. This is the half of
      // MAR-378's contract that was load-bearing.
      expect(md).toContain("**Recommended setup:** ⭐");
      expect(md).toContain("wakes on:");
    }
    expect(plan(PROMPT_A, "standard").summary_markdown).toContain("Recommended runtime setup");
    for (const depth of ["technical", "deep"] as const) {
      const result = plan(PROMPT_A, depth);
      expect(result.summary_markdown).toContain("### Runtime-fit setup");
      expect(result.summary_markdown).toContain("### Model-tier profile");
      expect(result.summary_markdown).toContain("### Credentials & permissions");
      expect(result.goal_to_product_wizard.build_choices.length).toBeGreaterThan(0);
    }
  });

  it("locks the corrected three-prompt runtime contracts", () => {
    expect({
      prompt_a: snapshotContract(plan(PROMPT_A).goal_to_product_wizard),
      prompt_b: snapshotContract(plan(PROMPT_B).goal_to_product_wizard),
      prompt_c: snapshotContract(plan(PROMPT_C).goal_to_product_wizard),
    }).toMatchSnapshot();
  });
});

describe("MAR-427 — DASH Agent Runner and DASH control remain separate", () => {
  const LOCAL_DASH_GOAL =
    "Build a local agent that watches my Gmail for meeting requests continuously. " +
    "The separately installed DASH Agent Runner is available. Keep running after the " +
    "DASH window closes while this computer remains on.";
  const COMPUTER_OFF_GOAL =
    "Build an agent that watches my Gmail for meeting requests continuously. The separately " +
    "installed DASH Agent Runner is available, but it must keep working while my computer is asleep or off.";
  const EXTERNAL_DASH_GOAL =
    "Build a hosted agent that checks competitor pages every morning and posts a Slack summary. " +
    "DASH is installed; use DASH to monitor and control the compatible agent, but the external " +
    "managed runtime runs it even while my computer is off.";

  it("recommends the available local runner with DASH control and a separate interaction surface", () => {
    const result = plan(LOCAL_DASH_GOAL, "technical", "code");
    const wizard = result.goal_to_product_wizard;

    expect(wizard.runtime_requirements).toMatchObject({
      expected_duration: "long-running",
      must_run_while_user_offline: true,
      must_run_while_computer_off: false,
    });
    expect(wizard.runtime_recommendation).toMatchObject({
      id: "dash_agent_runner_local",
      label: "DASH Agent Runner",
      runtime_class: "local_process",
      availability: "available now",
      continues_when_dash_closed: true,
    });
    expect(wizard.runtime_recommendation.offline_behavior).toContain(
      "DASH window closes",
    );
    expect(wizard.runtime_recommendation.limitation).toMatch(/asleep or off/i);
    expect(wizard.control_surface.recommended).toMatchObject({
      id: "dash_control",
      label: "DASH",
    });
    expect(wizard.interaction_surface.recommended.id).not.toContain("dash");
    expect(wizard.trigger_explanation.what_wakes_it_up).toContain("Gmail");
    expect(wizard.trigger_explanation.limitation).toMatch(/asleep or off/i);
    expect(result.hosting_and_monitoring.hosting.recommended.id).toBe(
      "dash_agent_runner_local",
    );
    expect(result.hosting_and_monitoring.monitoring.recommended.id).toBe(
      "dash_import",
    );

    const buildRound = result.question_flow.rounds.find(
      (round) => round.id === "build_surface",
    )!;
    const monitorRound = result.question_flow.rounds.find(
      (round) => round.id === "monitoring",
    )!;
    expect(buildRound.options.map((option) => option.id)).toEqual([
      "cowork",
      "dash_agent_runner",
      "self_host_local",
      "self_host_hosted",
      "other",
    ]);
    expect(buildRound.recommended_option_id).toBe("dash_agent_runner");
    expect(
      buildRound.options.find((option) => option.id === "dash_agent_runner"),
    ).toMatchObject({
      scope_selection: {
        runtime_recommendation_id: "dash_agent_runner_local",
      },
    });
    expect(monitorRound.recommended_option_id).toBe("dash");
    expect(
      monitorRound.options.find((option) => option.id === "dash"),
    ).toMatchObject({
      scope_selection: {
        monitoring_option_id: "dash_import",
        control_surface_id: "dash_control",
      },
    });
  });

  it("pairs that presence case with a computer-off absence case", () => {
    const result = plan(COMPUTER_OFF_GOAL, "technical", "code");
    const wizard = result.goal_to_product_wizard;

    expect(wizard.runtime_requirements.must_run_while_computer_off).toBe(true);
    expect(wizard.runtime_recommendation.id).not.toBe("dash_agent_runner_local");
    expect(wizard.runtime_recommendation.runtime_class).not.toBe("local_process");
    expect(wizard.runtime_alternatives.map((option) => option.id)).not.toContain(
      "dash_agent_runner_local",
    );
    const buildRound = result.question_flow.rounds.find(
      (round) => round.id === "build_surface",
    )!;
    expect(buildRound.options.map((option) => option.id)).not.toContain(
      "dash_agent_runner",
    );
    expect(buildRound.recommended_option_id).not.toBe("dash_agent_runner");
  });

  it("lets an external agent use DASH monitoring without claiming DASH runs it", () => {
    const result = plan(EXTERNAL_DASH_GOAL, "technical", "code");
    const wizard = result.goal_to_product_wizard;

    expect(wizard.runtime_requirements.must_run_while_computer_off).toBe(true);
    expect(wizard.runtime_recommendation.runtime_class).not.toBe("local_process");
    expect(wizard.runtime_recommendation.label).not.toContain("DASH");
    expect(wizard.control_surface.recommended.id).toBe("dash_control");
    expect(wizard.control_surface.recommended.limitation).toContain(
      "not the runtime",
    );
    expect(wizard.interaction_surface.recommended.id).toBe("slack_interaction");
    expect(result.hosting_and_monitoring.monitoring.recommended.id).toBe(
      "dash_import",
    );
    expect(result.hosting_and_monitoring.monitoring.reason).toContain(
      "execution remains with the separately selected runtime",
    );
  });

  it("pairs external monitoring with a Cowork absence case", () => {
    const result = plan(
      "When I ask in chat, summarize my unread inbox in Cowork. Never run in the background.",
      "technical",
      "cowork",
    );
    const wizard = result.goal_to_product_wizard;
    const monitoringIds = [
      result.hosting_and_monitoring.monitoring.recommended,
      ...result.hosting_and_monitoring.monitoring.alternatives,
    ].map((option) => option.id);
    const monitoringRound = result.question_flow.rounds.find(
      (round) => round.id === "monitoring",
    )!;
    const buildRound = result.question_flow.rounds.find(
      (round) => round.id === "build_surface",
    )!;

    expect(monitoringIds).not.toContain("dash_import");
    expect(wizard.control_surface.recommended.id).not.toBe("dash_control");
    expect(wizard.control_surface.alternatives.map((option) => option.id)).not.toContain(
      "dash_control",
    );
    expect(monitoringRound.options.map((option) => option.id)).not.toContain("dash");
    expect(buildRound.options.map((option) => option.id)).not.toContain(
      "dash_agent_runner",
    );
  });

  it("keeps compact and technical outputs on the same structured decision", () => {
    const compact = plan(LOCAL_DASH_GOAL, "brief", "code");
    const technical = plan(LOCAL_DASH_GOAL, "technical", "code");
    const decision = (result: ReturnType<typeof plan>) => ({
      runtime_requirements: result.goal_to_product_wizard.runtime_requirements,
      runtime_recommendation: result.goal_to_product_wizard.runtime_recommendation,
      control_surface: result.goal_to_product_wizard.control_surface.recommended,
      interaction_surface: result.goal_to_product_wizard.interaction_surface.recommended,
      trigger_explanation: result.goal_to_product_wizard.trigger_explanation,
      hosting: result.hosting_and_monitoring.hosting.recommended,
      monitoring: result.hosting_and_monitoring.monitoring.recommended,
    });

    expect(decision(compact)).toEqual(decision(technical));
    // MAR-742/F4 rewrote the user-facing monitoring label: "monitor/control a
    // compatible manifest v2 agent" named an implementation detail on the
    // card's own Recommended-setup line. Both depths still have to name DASH as
    // the runner AND as the monitor, which is what this test is actually for.
    expect(compact.summary_markdown).toContain("DASH Agent Runner");
    expect(compact.summary_markdown).toContain("DASH — a dashboard");
    expect(technical.summary_markdown).toContain("DASH Agent Runner");
    expect(technical.summary_markdown).toContain("DASH — Recommended");
    expect(technical.summary_markdown).toContain("recommended: DASH");
  });
});
