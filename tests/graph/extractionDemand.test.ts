/**
 * MAR-549 — public-web extraction: a silent demand drop, and a matcher gap.
 *
 * Two distinct defects, and the first is the serious one. "…write the leads to
 * a spreadsheet **with a source link on every row**" returned
 * `unmatched_demand: []` on a route that records no source link anywhere. The
 * requirement did not merely go unsatisfied — it was never registered as demand
 * at all, and a demand signal that vanishes can never be prioritised. The second
 * is ordinary vocabulary: "track competitor ad listings" composed a plan with no
 * extraction step, because `data_scraper` was reachable only through words that
 * name the ACCESS PATTERN (scrape / crawl) rather than the outcome.
 *
 * Presence paired with absence throughout. The absence fixtures here guard two
 * things the fix could easily have broken: the code-agent goals that say "scan"
 * and "changes", and MAR-266's price-monitor identity.
 */
import { describe, expect, it } from "vitest";
import {
  hasExtractionTrackSignal,
  hasMonitoringTrackSignal,
  matchCapabilities,
} from "../../src/graph/capabilityMatcher.js";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

function plan(goal: string) {
  return planWorkflow(
    { goal, must_have_capabilities: [], must_avoid: [], output_depth: "brief" },
    registry,
  );
}

function routeIds(goal: string): string[] {
  return plan(goal).recommended_route.map((step) => step.component_id);
}

function matchedIds(goal: string): string[] {
  return matchCapabilities(goal, [], [], registry.components, registry.edges).matches.map(
    (m) => m.component.id,
  );
}

const USDOT_GOAL =
  "scrape USDOT and state LLC/corporate filings for new transport-sector registrations, " +
  "then enrich and write the leads to a spreadsheet with a source link on every row";

// ── Defect 1: the silent demand drop ────────────────────────────────────────

describe("provenance demand is registered, not silently dropped (MAR-549 defect 1)", () => {
  it("reports the source-link ask on a route that does not record one", () => {
    const gaps = plan(USDOT_GOAL).coverage.unmatched_demand.join(" ");
    expect(gaps).toContain("source link");
  });

  it("and does the same for the 'with attribution' phrasing", () => {
    const gaps = plan(
      "extract the rows and save them to a sheet with attribution for each one",
    ).coverage.unmatched_demand.join(" ");
    expect(gaps).toContain("attribution");
  });

  it("one word of a compound demand phrase does not claim the phrase", () => {
    // The reason adding the vocabulary alone would not have been enough:
    // `data_normalizer` fuzzy-matches the bare word "source" from its own
    // summary prose, and containment-based claiming let that single word
    // dismiss "source link" outright. The ask was heard and then discarded.
    const matches = matchCapabilities(USDOT_GOAL, [], [], registry.components, registry.edges);
    const normalizer = matches.matches.find((m) => m.component.id === "data_normalizer");
    expect(normalizer?.matched_tokens).toContain("source");
    expect(plan(USDOT_GOAL).coverage.unmatched_demand.join(" ")).toContain("source link");
  });

  it("but a genuine multi-word claim still covers its phrase", () => {
    // file_storage's "google sheet" hint must keep claiming "google sheets",
    // which is the case the strict rule could have broken.
    const r = plan("every morning save the rows to a google sheets file");
    expect(r.coverage.unmatched_demand).toEqual([]);
  });
});

// ── Defect 2: "track listings" reaches the extractor ────────────────────────

describe("ordinary track/monitor phrasing reaches data_scraper (MAR-549 defect 2)", () => {
  const TRACKS = [
    "track competitor ad listings on a schedule and write new ones to a Google Sheet",
    "monitor marketplace listings for new items and score them",
    "collect the job postings from the board every morning",
  ];
  for (const goal of TRACKS) {
    it(`selects data_scraper for: "${goal}"`, () => {
      expect(hasExtractionTrackSignal(goal.toLowerCase())).toBe(true);
      expect(routeIds(goal)).toContain("data_scraper");
    });
  }

  it("and the route no longer reports its own extraction step as a gap", () => {
    // The token is the goal's own matched words, so coverage credits
    // "competitor"/"listings" by the same words the user wrote.
    const goal = "track competitor ad listings on a schedule and write new ones to a Google Sheet";
    expect(plan(goal).coverage.unmatched_demand).toEqual([]);
  });

  it("a price-watch goal reaches the page monitor, not the extractor", () => {
    // "track competitor prices across their product pages every morning"
    // composed `scheduled_trigger → state_store` — no monitor at all, because
    // the monitoring domain was never established and page_monitor's own
    // "product page" hint could not fire without it.
    const goal = "track competitor prices across their product pages every morning";
    expect(hasMonitoringTrackSignal(goal)).toBe(true);
    expect(routeIds(goal)).toContain("page_monitor");
  });
});

// ── Absence twins: the verbs and objects deliberately left out ───────────────

describe("the track signal stays off goals that merely share its words (MAR-549)", () => {
  const NOT_TRACKING = [
    // "scan" belongs to codebase_scan; "changes" is code vocabulary. Together
    // they reached the monitoring domain and put a web-page monitor — with a
    // Firecrawl connection — onto a code-review plan.
    "scan a codebase, plan changes, edit code, run tests and write a PR summary",
    "When a pull request opens on GitHub, review the diff for bugs and risky changes",
    // "track" is ambient in ordinary process language
    "keep track of which invoices have been paid and tell me on Friday",
  ];
  for (const goal of NOT_TRACKING) {
    it(`neither signal fires on: "${goal.slice(0, 60)}…"`, () => {
      expect(hasExtractionTrackSignal(goal.toLowerCase())).toBe(false);
      expect(hasMonitoringTrackSignal(goal.toLowerCase())).toBe(false);
    });
  }

  it("a code-only plan still needs no credentials at all (MAR-117)", () => {
    const r = plan("scan a codebase, plan changes, edit code, run tests and write a PR summary");
    expect(r.credential_advisory.components_requiring_credentials).toHaveLength(0);
    expect(routeIds("scan a codebase, plan changes, edit code, run tests and write a PR summary"))
      .not.toContain("page_monitor");
  });

  it("MAR-266's price-monitor goal is unchanged", () => {
    const r = plan(
      "Build an agent that checks 5 competitor pages every morning, detects price changes, " +
        "and sends me a Slack summary. I want to approve before anything external is changed.",
    );
    expect(r.plan_source).toBe("playbook");
    expect(r.playbook?.id).toBe("competitor_price_monitor");
  });
});

// ── Bar #2: extraction reaches a destination in a named route ────────────────

describe("a named route carries extraction through to a destination (MAR-549 bar #2)", () => {
  // Beta, so outside DEFAULT_ALLOWED and invisible to the live tools by design
  // (the MAR-527 structural finding). The artifact is durable either way.
  const withBeta = loadRegistry({ includeBeta: true });

  it("scheduled_extraction_to_storage_route_v1 is the first home of an unused edge", () => {
    const route = withBeta.routes.find(
      (r) => r.id === "scheduled_extraction_to_storage_route_v1",
    );
    expect(route).toBeDefined();
    expect(route?.edges).toContain("schema_validation__produces__file_storage");
    expect(route?.components).toContain("data_scraper");
    expect(route?.components).toContain("file_storage");
  });

  it("its playbook points at it and both load", () => {
    const pb = withBeta.playbooks.find((p) => p.id === "scheduled_extraction_to_storage");
    expect(pb?.golden_path_route_id).toBe("scheduled_extraction_to_storage_route_v1");
  });

  it("and the route is the shape the live matcher composes for that goal", () => {
    const ids = routeIds(
      "every morning scrape the listings, normalise and deduplicate the rows, " +
        "validate them, and save them to a Google Sheet",
    );
    for (const id of [
      "scheduled_trigger",
      "data_scraper",
      "data_normalizer",
      "deduplication",
      "schema_validation",
      "file_storage",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("MAR-549's control holds: scraped data never pipelines to external publish", () => {
    const route = withBeta.routes.find(
      (r) => r.id === "scheduled_extraction_to_storage_route_v1",
    );
    expect(route?.edges).toContain("data_scraper__avoid__external_publish");
    expect(route?.components).not.toContain("external_publish");
  });
});
