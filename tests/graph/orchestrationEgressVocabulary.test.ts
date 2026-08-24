/**
 * MAR-526 slice 5 (final) — orchestration primitives + chat-egress parity.
 *
 * MAR-513's gap-list item 3 found `fan_out_collector`, `review_draft_composer`,
 * `multi_variant_generator`, `teams_notification` and `telegram_notification`
 * carried live `capabilityMatcher` vocabulary but backed no route or
 * playbook. All five were already independently reachable via their existing
 * KEYWORD_HINTS — this slice is pure golden-path naming: two golden paths, as
 * the issue itself anticipated — a parallel multi-variant content + review
 * shape, and Microsoft Teams / Telegram parity with the existing
 * chat_triggered_assistant_route_v1 (Discord) shape.
 *
 * NOTE — found but out of scope: the bare word "draft" unconditionally maps
 * to email_draft regardless of context, so goal phrasings using "compose a
 * review draft" pull in a spurious email_draft/optional_email_send tail even
 * when nothing about the goal mentions email. Routed around here with
 * draft-free phrasing ("stage for review"); filed as a follow-up task rather
 * than fixed, since the fix carries real regression risk across many
 * existing goals that legitimately use the word "draft".
 */
import { describe, expect, it } from "vitest";
import { matchCapabilities } from "../../src/graph/capabilityMatcher.js";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

const VARIANT_REVIEW_GOAL =
  "generate 3 headline variants for a landing page in parallel, fan the results back " +
  "together, stage for review, and require my approval before anything ships";

const TEAMS_GOAL =
  "Build a Microsoft Teams bot that responds to a slash command from an allowed team " +
  "member, classifies it, performs the action, and posts the result in the same thread " +
  "only after I approve it.";

const TELEGRAM_GOAL =
  "Build a Telegram bot that responds to a slash command from an allowed team member, " +
  "classifies it, performs the action, and posts the result in the same thread only " +
  "after I approve it.";

function matchedIds(goal: string): string[] {
  return matchCapabilities(goal, [], [], registry.components, registry.edges).matches.map(
    (match) => match.component.id,
  );
}

function plan(goal: string) {
  return planWorkflow(
    { goal, must_have_capabilities: [], must_avoid: [], output_depth: "brief" },
    registry,
  );
}

describe("orchestration-primitive vocabulary reaches all three components (MAR-526 slice 5)", () => {
  it("selects fan_out_collector for a parallel/fan-out goal", () => {
    expect(matchedIds("Run these three branches in parallel and fan out the work.")).toContain(
      "fan_out_collector",
    );
  });

  it("selects multi_variant_generator for an A/B variant goal", () => {
    expect(matchedIds("Generate 3 variants of this headline for an A/B test.")).toContain(
      "multi_variant_generator",
    );
  });

  it("selects review_draft_composer via its draft-free hint", () => {
    expect(matchedIds("Generate this content, stage for review, and wait for approval.")).toContain(
      "review_draft_composer",
    );
  });

  it("the combined goal composes all three primitives into one coherent route", () => {
    const route = plan(VARIANT_REVIEW_GOAL).recommended_route.map((step) => step.component_id);
    expect(route).toContain("fan_out_collector");
    expect(route).toContain("multi_variant_generator");
    expect(route).toContain("review_draft_composer");
    expect(route).toContain("human_approval_gate");
  });
});

describe("Teams/Telegram chat-egress parity with the existing Discord route (MAR-526 slice 5)", () => {
  it("selects teams_notification for a Teams goal", () => {
    expect(matchedIds("Post an update to our Microsoft Teams channel.")).toContain(
      "teams_notification",
    );
  });

  it("selects telegram_notification for a Telegram goal", () => {
    expect(matchedIds("Post an update to our Telegram chat.")).toContain("telegram_notification");
  });

  it("the Teams bot goal composes the same shape as chat_triggered_assistant_route_v1's Discord route", () => {
    const route = plan(TEAMS_GOAL).recommended_route.map((step) => step.component_id);
    expect(route).toEqual([
      "chat_trigger",
      "schema_validation",
      "human_approval_gate",
      "auth_failure_handler",
      // MAR-749: the binding rides in with the gate on every gated egress.
      "approval_binding",
      "teams_notification",
      "audit_log",
    ]);
    expect(plan(TEAMS_GOAL).enforced_approval_gates).toContain("human_approval_gate");
  });

  it("the Telegram bot goal composes the same shape as chat_triggered_assistant_route_v1's Discord route", () => {
    const route = plan(TELEGRAM_GOAL).recommended_route.map((step) => step.component_id);
    expect(route).toEqual([
      "chat_trigger",
      "schema_validation",
      "human_approval_gate",
      "auth_failure_handler",
      // MAR-749: the binding rides in with the gate on every gated egress.
      "approval_binding",
      "telegram_notification",
      "audit_log",
    ]);
    expect(plan(TELEGRAM_GOAL).enforced_approval_gates).toContain("human_approval_gate");
  });
});

describe("slice 5 registry artifacts (MAR-526 slice 5)", () => {
  const pairs: Array<[string, string, string]> = [
    ["variant_review", "variant_review_route_v1", VARIANT_REVIEW_GOAL],
    ["teams_triggered_assistant", "teams_triggered_assistant_route_v1", TEAMS_GOAL],
    ["telegram_triggered_assistant", "telegram_triggered_assistant_route_v1", TELEGRAM_GOAL],
  ];

  for (const [pbId, routeId, goal] of pairs) {
    it(`${pbId} is status: beta, so it stays out of the default-loaded registry`, () => {
      expect(registry.playbooks.some((p) => p.id === pbId)).toBe(false);
      expect(registry.routes.some((r) => r.id === routeId)).toBe(false);
      expect(plan(goal).plan_source).toBe("composed");
    });

    it(`${pbId}'s route reference resolves when beta entities are loaded`, () => {
      const withBeta = loadRegistry({ includeBeta: true });
      const playbook = withBeta.playbooks.find((p) => p.id === pbId);
      expect(playbook).toBeDefined();
      expect(playbook?.golden_path_route_id).toBe(routeId);
      expect(withBeta.routes.some((r) => r.id === routeId)).toBe(true);
    });
  }

  it("variant_review_route_v1's components are a subset of the live-composed shape", () => {
    const withBeta = loadRegistry({ includeBeta: true });
    const route = withBeta.routes.find((r) => r.id === "variant_review_route_v1");
    const composed = new Set(plan(VARIANT_REVIEW_GOAL).recommended_route.map((s) => s.component_id));
    for (const componentId of route?.components ?? []) {
      expect(composed.has(componentId)).toBe(true);
    }
  });

  it("teams_triggered_assistant_route_v1's components are exactly the live-composed shape", () => {
    const withBeta = loadRegistry({ includeBeta: true });
    const route = withBeta.routes.find((r) => r.id === "teams_triggered_assistant_route_v1");
    const composed = plan(TEAMS_GOAL).recommended_route.map((s) => s.component_id);
    expect([...(route?.components ?? [])].sort()).toEqual([...composed].sort());
  });

  it("telegram_triggered_assistant_route_v1's components are exactly the live-composed shape", () => {
    const withBeta = loadRegistry({ includeBeta: true });
    const route = withBeta.routes.find((r) => r.id === "telegram_triggered_assistant_route_v1");
    const composed = plan(TELEGRAM_GOAL).recommended_route.map((s) => s.component_id);
    expect([...(route?.components ?? [])].sort()).toEqual([...composed].sort());
  });
});
