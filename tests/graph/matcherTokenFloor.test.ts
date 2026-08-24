/**
 * MAR-742/F1 — a goal token must not match INSIDE a capability word.
 *
 * Reported case (Henrik's family-price-watch planning transcript, 2026-08-24):
 * "my 14 year old" selected `threshold_router`. Nothing in that goal is about
 * thresholds — the token `old` was landing inside `thresh·old·_evaluation`.
 *
 * The cause was not a missing stopword. `capabilityMatcher.ts` already carries
 * a long note (MAR-550) explaining that a goal token matched as a bare
 * SUBSTRING is what produces this bug family, and stating that the fix applies
 * to "the two remaining substring passes" — the capability pass and the summary
 * pass. Only the summary pass ever got `matchesWordAligned`; the capability pass
 * one line above it kept `cap.includes(token)`. This suite pins the promised
 * behaviour for both.
 *
 * A stopword list could only ever have covered the token someone had already
 * been bitten by. Probing master turned up six more instances of the same hole
 * in this repo's own fixtures and tests, every one of them an ordinary English
 * word swallowed by a longer compound:
 *
 *   | goal phrase                            | token | inside                        | pulled in            |
 *   | "my 14 year old wants a gaming laptop" | old   | thresh·old·_evaluation        | threshold_router     |
 *   | (same goal)                            | old   | stakeh·old·er_notification    | reviewer_notification|
 *   | "suggest two times that work"          | work  | route_work·flow               | intent_classifier    |
 *   | "suggest two times that work"          | work  | resume_work·flow              | state_store          |
 *   | "When I ask, look up an invoice"       | ask   | enqueue_t·ask / schedule_t·ask| job_queue            |
 *   | "fan the results back together"        | back  | exponential_back·off          | retry_policy         |
 *   | "while my computer is asleep or off"   | off   | exponential_back·off          | retry_policy         |
 *
 * Every presence assertion below is paired with its absence twin, per the
 * MAR-538/539 regression bar: a goal genuinely about thresholds (or queues, or
 * retries) must still reach the component it is actually asking for.
 */
import { describe, expect, it } from "vitest";
import { matchCapabilities, matchesWordAligned } from "../../src/graph/capabilityMatcher.js";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

function matchedIds(goal: string): string[] {
  return matchCapabilities(goal, [], [], registry.components, registry.edges).matches.map(
    (match) => match.component.id,
  );
}

function routeIds(goal: string): string[] {
  return planWorkflow(
    { goal, must_have_capabilities: [], must_avoid: [], output_depth: "brief" },
    registry,
  ).recommended_route.map((step) => step.component_id);
}

// The transcript's own goal shape: a parent watching prices, mentioning a child's
// age in passing. The age is the only reason `threshold_router` was ever selected.
const FAMILY_PRICE_WATCH =
  "Watch the prices of a few things my family wants — my 14 year old wants a gaming laptop, " +
  "my wife wants a coffee machine — across a handful of shops, and tell me when one drops " +
  "below the price I set.";

describe("a generic token inside a capability word selects nothing (MAR-742/F1)", () => {
  it("the reported case: '14 year old' does not reach threshold_router", () => {
    expect(matchedIds(FAMILY_PRICE_WATCH)).not.toContain("threshold_router");
    expect(routeIds(FAMILY_PRICE_WATCH)).not.toContain("threshold_router");
  });

  it("the same token does not reach reviewer_notification either", () => {
    // `old` also sits inside `stakeh·old·er_notification`. One token, two
    // spurious components — which is why the fix is the rule, not the token.
    expect(matchedIds(FAMILY_PRICE_WATCH)).not.toContain("reviewer_notification");
  });

  it("the bare age phrase on its own selects nothing at all", () => {
    // Isolated, so a future regression cannot hide behind the rest of the goal.
    for (const phrase of ["14 year old", "my 14 year old", "old"]) {
      expect(matchedIds(phrase), phrase).toEqual([]);
    }
  });

  it("the goal still gets the monitor it actually asked for", () => {
    // Absence twins are only meaningful if the goal keeps working. This is a
    // price-watch goal; it must still reach a page monitor.
    expect(matchedIds(FAMILY_PRICE_WATCH)).toContain("page_monitor");
  });

  it.each([
    // token, goal, component the token used to drag in
    ["work", "Look at new emails and suggest two times that work for a call", "intent_classifier"],
    ["work", "Look at new emails and suggest two times that work for a call", "state_store"],
    ["ask", "When I ask, look up an invoice in our billing system and issue the refund", "job_queue"],
    ["back", "Generate 3 headline variants in parallel and fan the results back together", "retry_policy"],
    ["off", "Watch my Gmail for leads while my computer is asleep or off", "retry_policy"],
  ])("the token %j in %j does not select %s", (_token, goal, component) => {
    expect(matchedIds(goal)).not.toContain(component);
  });
});

describe("the absence twins — the same components stay reachable (MAR-742/F1)", () => {
  it("a goal genuinely about thresholds still reaches threshold_router", () => {
    const goal =
      "Score each inbound support ticket for urgency and route it based on a confidence " +
      "threshold: high scores to a human, low scores to the auto-reply queue.";
    expect(matchedIds(goal)).toContain("threshold_router");
  });

  it("a goal that genuinely asks for background jobs still reaches job_queue", () => {
    const goal =
      "Fan out the enrichment task for each row onto a background job queue and retry any " +
      "task that fails.";
    expect(matchedIds(goal)).toContain("job_queue");
  });

  it("a goal that genuinely asks for retries still reaches retry_policy", () => {
    const goal =
      "Call the vendor API for each record and retry with exponential backoff when it rate-limits.";
    expect(matchedIds(goal)).toContain("retry_policy");
  });

  it("a goal that genuinely asks for a reviewer still reaches reviewer_notification", () => {
    const goal = "Draft the release note and notify the assigned reviewer that it is ready for review.";
    expect(matchedIds(goal)).toContain("reviewer_notification");
  });
});

describe("the capability pass uses the same alignment rule as the summary pass (MAR-742/F1)", () => {
  // Pinned at the helper level too: the passes must not be able to drift apart
  // again, which is exactly how this bug survived MAR-550.
  it("inflections still match — the fuzzy passes keep earning their keep", () => {
    expect(matchesWordAligned("threshold_evaluation", "threshold")).toBe(true);
    expect(matchesWordAligned("fan_out_tasks", "task")).toBe(true);
    expect(matchesWordAligned("exponential_backoff", "backoff")).toBe(true);
    expect(matchesWordAligned("resume_workflow", "workflow")).toBe(true);
  });

  it("mid-word fragments do not", () => {
    expect(matchesWordAligned("threshold_evaluation", "old")).toBe(false);
    expect(matchesWordAligned("stakeholder_notification", "old")).toBe(false);
    expect(matchesWordAligned("resume_workflow", "work")).toBe(false);
    expect(matchesWordAligned("enqueue_task", "ask")).toBe(false);
    expect(matchesWordAligned("exponential_backoff", "back")).toBe(false);
    expect(matchesWordAligned("exponential_backoff", "off")).toBe(false);
  });
});
