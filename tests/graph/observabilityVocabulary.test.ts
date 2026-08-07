/**
 * MAR-526 slice 4 — infra/app observability alerting.
 *
 * MAR-513's gap-list item 3 found `uptime_check`, `metric_threshold_monitor`
 * and `log_monitor` carried live `capabilityMatcher` vocabulary but backed no
 * route or playbook. Unlike slice 1's `crm_record_read`, all three were
 * already independently REACHABLE (MAR-243's own HINT_ONLY + monitoring-domain
 * gating was already correct). The one real gap found while probing was
 * structural, not component-specific: `scheduled_trigger`'s phrase hints
 * covered "every morning"/"every hour" but not "every 5 minutes" — the
 * natural cadence for this kind of monitor — so a live monitoring goal
 * composed with NO trigger at all. That is fixed in
 * `src/graph/capabilityMatcher.ts` (see `capabilityMatcher.test.ts` for the
 * matcher-level regression tests); this slice is otherwise pure golden-path
 * naming, not a matcher fix.
 */
import { describe, expect, it } from "vitest";
import { matchCapabilities } from "../../src/graph/capabilityMatcher.js";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

const OBSERVABILITY_GOAL =
  "every 5 minutes, unattended, monitor our service uptime, error rate metric, and logs " +
  "for anomalies, and alert Slack";

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

describe("observability vocabulary reaches all three monitors (MAR-526 slice 4)", () => {
  it("selects uptime_check for an uptime goal", () => {
    expect(matchedIds("Check if our API endpoint's uptime is healthy.")).toContain("uptime_check");
  });

  it("selects metric_threshold_monitor for a metric-threshold goal", () => {
    expect(matchedIds("Monitor our error rate metric and alert on a threshold breach.")).toContain(
      "metric_threshold_monitor",
    );
  });

  it("selects log_monitor for a log-anomaly goal", () => {
    expect(matchedIds("Monitor our application logs for anomaly spikes.")).toContain("log_monitor");
  });

  it("does not fire any of the three on an unrelated goal", () => {
    const ids = matchedIds("Read the unread messages in my inbox and summarise them.");
    expect(ids).not.toContain("uptime_check");
    expect(ids).not.toContain("metric_threshold_monitor");
    expect(ids).not.toContain("log_monitor");
  });

  it("the combined goal composes all three signal sources, not a page-watch", () => {
    const route = plan(OBSERVABILITY_GOAL).recommended_route.map((step) => step.component_id);
    expect(route).toContain("uptime_check");
    expect(route).toContain("metric_threshold_monitor");
    expect(route).toContain("log_monitor");
    expect(route).toContain("scheduled_trigger");
    expect(route).not.toContain("page_monitor");
  });
});

describe("observability_alerting carries an advisory (not enforced) gate", () => {
  it("the write lands with automation_clearance L2 and no enforced_approval_gates", () => {
    const p = plan(OBSERVABILITY_GOAL);
    expect(p.enforced_approval_gates).toEqual([]);
    expect(p.automation_clearance.level).toBe("L2");
  });
});

describe("observability_alerting / observability_alerting_route_v1 registry artifacts (MAR-526 slice 4)", () => {
  it("are status: beta, so they stay out of the default-loaded registry", () => {
    expect(registry.playbooks.some((p) => p.id === "observability_alerting")).toBe(false);
    expect(registry.routes.some((r) => r.id === "observability_alerting_route_v1")).toBe(false);
    expect(plan(OBSERVABILITY_GOAL).plan_source).toBe("composed");
  });

  it("the playbook's route reference resolves when beta entities are loaded", () => {
    const withBeta = loadRegistry({ includeBeta: true });
    const playbook = withBeta.playbooks.find((p) => p.id === "observability_alerting");
    expect(playbook).toBeDefined();
    expect(withBeta.routes.some((r) => r.id === playbook?.golden_path_route_id)).toBe(true);
  });

  it("the route is a leaner, noise-free subset of the live-composed shape", () => {
    // reviewer_notification also rides in — generic "alert" word-overlap noise,
    // deliberately excluded, same class as chat_triggered_assistant_route_v1
    // and airtable_data_report_route_v1.
    const withBeta = loadRegistry({ includeBeta: true });
    const route = withBeta.routes.find((r) => r.id === "observability_alerting_route_v1");
    const composed = new Set(plan(OBSERVABILITY_GOAL).recommended_route.map((step) => step.component_id));
    for (const componentId of route?.components ?? []) {
      expect(composed.has(componentId)).toBe(true);
    }
    expect(route?.components).not.toContain("reviewer_notification");
  });
});
