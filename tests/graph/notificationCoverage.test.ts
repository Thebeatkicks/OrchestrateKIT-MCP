/**
 * MAR-786 — a notification ask must never vanish into "full".
 *
 * Reported case (Henrik's family-price-watch transcript, 2026-08-24/25, carried
 * on PR #192's handoff and verified byte-identical on the pre-MAR-742 master, so
 * pre-existing): "watch prices … and tell me when one drops" planned
 * `page_monitor → state_store`, reported `coverage_label: "full"` and
 * `unmatched_demand: []`, and rendered a card whose §What's missing read
 * "Nothing — every step in your goal is carried by this route." The person's
 * central ask — being told — was in neither the route nor the gap list.
 *
 * The mechanism is ABSORPTION, the MAR-540/MAR-551 shape: `page_monitor` matched
 * the hint "watch the prices", the words inside a multi-word hint enter the
 * claimed set, so the demand noun `price` in "…below THE PRICE I set" was
 * claimed — and one claimed noun unit clears the whole clause before the `tell`
 * verb sitting right beside it is ever consulted. The claimed noun belongs to the
 * WATCHING half of the sentence; nothing carried the TELLING half.
 *
 * Every presence case below was measured silent-with-"full" on master and is
 * paired with an absence twin, per the MAR-538/539 regression bar and the
 * grounded-prose rule in CONTRIBUTING.md.
 */
import { describe, expect, it } from "vitest";
import { computeCoverage } from "../../src/graph/coverage.js";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

function coverageOf(goal: string) {
  return planWorkflow(
    { goal, must_have_capabilities: [], must_avoid: [], output_depth: "brief" },
    registry,
  ).coverage;
}

function routeOf(goal: string): string[] {
  return planWorkflow(
    { goal, must_have_capabilities: [], must_avoid: [], output_depth: "brief" },
    registry,
  ).recommended_route.map((step) => step.component_id);
}

/** True when the plan says SOMETHING about the ask rather than nothing. */
function saysSomethingAbout(goal: string, fragment: string): boolean {
  const coverage = coverageOf(goal);
  return coverage.unmatched_demand.some((clause) =>
    clause.toLowerCase().includes(fragment.toLowerCase()),
  );
}

/** Components whose job is to deliver a message to a person. */
const NOTIFY_COMPONENTS = [
  "slack_notification",
  "discord_notification",
  "teams_notification",
  "telegram_notification",
  "optional_email_send",
];

// The transcript's own goal, verbatim — the same string MAR-742/F1 pinned.
const FAMILY_PRICE_WATCH =
  "Watch the prices of a few things my family wants — my 14 year old wants a gaming laptop, " +
  "my wife wants a coffee machine — across a handful of shops, and tell me when one drops " +
  "below the price I set.";

// The absorption shape, isolated: a price-watch goal whose telling clause sits
// next to a demand noun (`price`) the page monitor's own hint already claims.
const PRICE_WATCH = "Watch the prices of a few things my family wants across a handful of shops";

describe("MAR-786 — the reported case", () => {
  it("the transcript goal names the telling instead of reporting full coverage", () => {
    const coverage = coverageOf(FAMILY_PRICE_WATCH);
    expect(coverage.unmatched_demand).toContain("tell me when one drops below the price I set");
    expect(coverage.coverage_label).not.toBe("full");
  });

  it("the route it plans genuinely has no way to tell anyone", () => {
    // The gap report is only honest if the gap is real: if a future registry
    // change routes a notification here, this assertion is the one that should
    // fail first, and the fix is to delete it — not to keep reporting a gap the
    // plan has closed.
    const route = routeOf(FAMILY_PRICE_WATCH);
    expect(route.some((id) => NOTIFY_COMPONENTS.includes(id))).toBe(false);
  });
});

describe("MAR-786 — the phrasing family, not one hint token", () => {
  // Each of these was measured `full` with `unmatched_demand: []` on master:
  // "alert me" worked only because `alert` happens to be a KEYWORD_HINT, and one
  // phrasing working is not the rule working. Written as `and <phrase>` on the
  // same price-watch stem so the claimed `price` noun is present in every case —
  // that noun is the thing that was swallowing the ask.
  it.each([
    ["tell me when", "and tell me when one drops below the price I set."],
    ["notify me", "and notify me when one drops below the price I set."],
    ["let me know", "and let me know when one drops below the price I set."],
    ["let me know (bare)", "and let me know."],
    ["keep me posted", "and keep me posted on the price."],
    ["give me a heads up", "and give me a heads up about the price."],
    ["text me", "and text me the price when it drops."],
    ["ping me", "and ping me about the price when it drops."],
  ])("%s is stated as unmatched demand rather than absorbed", (label, tail) => {
    const coverage = coverageOf(`${PRICE_WATCH} ${tail}`);
    expect(coverage.coverage_label, label).not.toBe("full");
    expect(coverage.unmatched_demand.length, label).toBeGreaterThan(0);
  });

  it("the reported ask is quoted back in the user's own words", () => {
    // A gap the person cannot recognise as their own sentence is not much better
    // than silence — the card renders these verbatim under §What's missing.
    expect(saysSomethingAbout(`${PRICE_WATCH} and notify me when one drops.`, "notify me")).toBe(
      true,
    );
  });
});

describe("MAR-786 — absence twins", () => {
  it("a goal that merely MENTIONS telling someone gains nothing", () => {
    // The issue's own twin. "tells me" is not "tell me": the family is matched
    // whole-word (`containsPhrase`), which is MAR-742/F1's lesson applied here —
    // a bare substring would read this sentence as a notification ask.
    const goal = "Build a weekly report my boss tells me to make from our sales spreadsheet.";
    const coverage = coverageOf(goal);
    expect(coverage.unmatched_demand).toEqual([]);
    expect(coverage.coverage_label).toBe("full");
    expect(routeOf(goal).some((id) => NOTIFY_COMPONENTS.includes(id))).toBe(false);
  });

  it("a negated telling is a constraint, not demand", () => {
    for (const tail of ["and never notify me.", "and never let me know."]) {
      const coverage = coverageOf(`${PRICE_WATCH} ${tail}`);
      expect(coverage.unmatched_demand, tail).toEqual([]);
      expect(coverage.coverage_label, tail).toBe("full");
    }
  });

  it("a goal answered in this chat is not turned into a gap", () => {
    // `USER_RECIPIENTS` in coverage.ts treats delivery to the user in the current
    // channel as satisfied by construction, and that must survive: "let me know
    // what it says" about a PDF the person just uploaded is this conversation's
    // reply, not a missing notification step.
    const coverage = coverageOf("Read the invoice PDF I upload and let me know what it says.");
    expect(coverage.unmatched_demand).toEqual([]);
    expect(coverage.coverage_label).toBe("full");
  });

  it("the same words become a delivery once nobody is there to read the chat", () => {
    // The discriminator, isolated against the twin above: identical phrasing, and
    // the only change is that the plan now fires on a schedule. There is no chat
    // to answer into at 7am, so "let me know" is an egress the route lacks.
    // Measured silent-with-"full" on master.
    const coverage = coverageOf(
      "Every morning, read the new invoice PDFs in our shared folder and let me know what they say.",
    );
    expect(coverage.unmatched_demand).toContain("let me know what they say");
  });
});

describe("MAR-786 — naming a channel closes the gap", () => {
  // The other half of the acceptance: the ask is satisfied when the route
  // actually carries it. This is why the fix reports instead of inventing — the
  // planner cannot pick a channel the person never named, and "we'll Slack you"
  // on a goal that never said Slack is the overclaim this layer exists to stop.
  it.each([
    ["Slack", "and tell me on Slack when one drops below the price I set."],
    ["Telegram", "and send me a Telegram message when one drops below the price I set."],
  ])("naming %s silences the report and puts the delivery in the route", (channel, tail) => {
    const goal = `${PRICE_WATCH} ${tail}`;
    expect(coverageOf(goal).unmatched_demand, channel).toEqual([]);
    expect(coverageOf(goal).coverage_label, channel).toBe("full");
    expect(routeOf(goal).some((id) => NOTIFY_COMPONENTS.includes(id)), channel).toBe(true);
  });

  it("the competitor-price playbook already carries the alert and stays silent", () => {
    const goal =
      "Check 5 competitor product pages every hour for price changes and post an internal " +
      "Slack alert when a price crosses my threshold.";
    expect(coverageOf(goal).unmatched_demand).toEqual([]);
    expect(routeOf(goal)).toContain("slack_notification");
  });
});

describe("MAR-786 — what counts as delivering to a person", () => {
  // Keyed on the COMPONENT rather than on a claim (the MAR-551 pattern), so
  // these pin the membership rule directly, with the matcher held out of it —
  // `routeMatches: []` means nothing is claimed and the route is whatever the
  // case says it is.
  //
  // The goal deliberately carries NO demand-lexicon vocabulary of its own (no
  // "price", no "watch", no "alert"): the telling is the only thing under test,
  // so a verdict here can only have come from this rule.
  function coverageWithRoute(componentIds: string[]) {
    return computeCoverage({
      goal: "Keep an eye on the product pages every hour and let me know when something changes.",
      routeMatches: [],
      finalComponentIds: componentIds,
      injectedComponentIds: new Set(componentIds),
    });
  }

  it("the telling clause is the only one these cases turn on", () => {
    // `routeMatches: []` claims nothing, so the watching clause is reported by
    // the MAR-396 shape path in every case here — same in all of them, and never
    // the clause under test. Pinned so a reader knows why the assertions below
    // scope to the telling instead of to an empty list.
    const stem = coverageWithRoute(["page_monitor", "scheduled_trigger", "slack_notification"]);
    expect(stem.unmatched_demand).toEqual(["Keep an eye on the product pages every hour"]);
  });

  it.each(NOTIFY_COMPONENTS)("%s carries the ask", (componentId) => {
    const coverage = coverageWithRoute(["page_monitor", "scheduled_trigger", componentId]);
    expect(coverage.unmatched_demand.some((c) => c.includes("let me know"))).toBe(false);
  });

  it.each([
    // A draft is not a delivery: it waits in a folder until someone opens the
    // folder, which is the thing the person asked not to have to do.
    "email_draft",
    "gmail_draft_write",
    // Its declared job is signalling that an artifact is ready for REVIEW, to a
    // named reviewer. It is also this repo's standing unsupported-supply fixture,
    // so admitting it would let the ask be silenced by a component the same plan
    // reports as nobody-asked-for.
    "reviewer_notification",
    // An audience, not the person.
    "external_publish",
    // A record. Whether it pushes a reminder is the calendar's setting.
    "calendar_write",
    // Recording is not telling — and this pair IS the reported route.
    "state_store",
    "audit_log",
  ])("%s does not", (componentId) => {
    const coverage = coverageWithRoute(["page_monitor", "scheduled_trigger", componentId]);
    expect(coverage.unmatched_demand.some((c) => c.includes("let me know"))).toBe(true);
  });
});
