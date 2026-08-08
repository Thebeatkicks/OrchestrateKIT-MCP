/**
 * MAR-558 — the three direction findings MAR-541's sweep recorded but did not
 * fix, plus the fourth it could not see.
 *
 * MAR-541 rated the first three low severity because the correct write
 * component is always co-present, so the plan is never silently read-only. That
 * rating held; the noise did not stop being noise. The fourth — a goal saying
 * "email it to them" planned with a mailbox READ, no send component anywhere,
 * and `coverage: full` — is the same silent-substitution shape as MAR-538, and
 * the sweep could not see it: the `email` hint really does map to read AND
 * write, but a separate rule (MAR-302's document-source suppression) was
 * removing the write half.
 *
 * Presence paired with absence throughout, per the MAR-538/539 bar. The absence
 * fixtures are the ones that matter here: every suppression below is one step
 * away from breaking a fixture some earlier issue fought for — MAR-526 slice
 * 1's CRM reads, MAR-455's anonymous feed fetch, MAR-302's own document-intake
 * shape.
 */
import { describe, expect, it } from "vitest";
import { matchCapabilities } from "../../src/graph/capabilityMatcher.js";
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
    (match) => match.component.id,
  );
}

// ── Finding 1: pdf_extraction on a document-CREATION goal ────────────────────

describe("a document-CREATION goal drops the PDF parser (MAR-558 finding 1)", () => {
  const CREATES = [
    "create a PDF invoice for the customer and email it to them",
    "generate a PDF invoice for each new order and save it",
    "produce a monthly PDF report for every client",
  ];
  for (const goal of CREATES) {
    it(`drops pdf_extraction on: "${goal}"`, () => {
      expect(routeIds(goal)).not.toContain("pdf_extraction");
    });
  }

  it("and keeps the creation direction, which was always co-present", () => {
    expect(routeIds("create a PDF invoice for the customer and email it to them")).toContain(
      "report_generation",
    );
  });

  const PARSES = [
    // MAR-302's own document-intake shape — the parser is the point here
    "read the invoices from my inbox and extract the line items",
    "extract the totals from each receipt and match them to a purchase order",
    // both arrows in one goal: parse the incoming documents, produce a new one
    "generate a summary PDF report from the invoices in my inbox",
  ];
  for (const goal of PARSES) {
    it(`keeps pdf_extraction on: "${goal}"`, () => {
      expect(matchedIds(goal)).toContain("pdf_extraction");
    });
  }
});

// ── Finding 2: crm_record_read on a write-only CRM goal ──────────────────────

describe("a write-only CRM goal drops the CRM read (MAR-558 finding 2)", () => {
  const WRITES = [
    "log a note in our CRM after the call",
    "update the deal stage in HubSpot when the contract is signed",
    "add every new signup to Salesforce as a contact",
  ];
  for (const goal of WRITES) {
    it(`drops crm_record_read on: "${goal}"`, () => {
      expect(routeIds(goal)).not.toContain("crm_record_read");
    });
  }

  it("and keeps the write, which was always co-present", () => {
    expect(routeIds("log a note in our CRM after the call")).toContain("crm_note_write");
    expect(routeIds("update the deal stage in HubSpot when the contract is signed")).toContain(
      "deal_stage_update",
    );
  });

  // MAR-526 slice 1 added these hints precisely because a natural CRM read
  // matched nothing. Every one of its own read goals must survive.
  const READS = [
    "reads contacts from HubSpot and enriches them",
    "reads new leads from our CRM and enriches each one",
    "Look at the records in Pipedrive and enrich each one",
    "look up the customer in our CRM before replying",
  ];
  for (const goal of READS) {
    it(`keeps crm_record_read on: "${goal}"`, () => {
      expect(matchedIds(goal)).toContain("crm_record_read");
    });
  }

  it('"record"/"note" are nouns here, not write verbs', () => {
    // The trap this fix fell into once: "the records in Pipedrive" read as a
    // write and suppressed slice 1's own fixture. Same lesson MAR-538 recorded
    // for Airtable's verb list.
    expect(matchedIds("Look at the records in Pipedrive and enrich each one")).toContain(
      "crm_record_read",
    );
  });
});

// ── Finding 3: public_feed_fetch on a feed-PUBLISHING goal ───────────────────

describe("a feed-PUBLISHING goal drops the anonymous feed fetcher (MAR-558 finding 3)", () => {
  const PUBLISHES = [
    "publish our RSS feed update to subscribers",
    "publish the weekly newsletter to our RSS feed",
  ];
  for (const goal of PUBLISHES) {
    it(`drops public_feed_fetch on: "${goal}"`, () => {
      expect(routeIds(goal)).not.toContain("public_feed_fetch");
    });
  }

  it("and keeps the publish, which was always co-present", () => {
    expect(routeIds("publish our RSS feed update to subscribers")).toContain("external_publish");
  });

  // MAR-455's whole achievement was that an anonymous public feed takes a
  // zero-credential read path. None of its goals may lose it.
  const FETCHES = [
    "every morning fetch the latest posts from our RSS feed and summarise them",
    "watch a public RSS feed for new posts and send me a digest",
    "poll the atom feed hourly and store new entries",
  ];
  for (const goal of FETCHES) {
    it(`keeps public_feed_fetch on: "${goal}"`, () => {
      expect(matchedIds(goal)).toContain("public_feed_fetch");
    });
  }
});

// ── Finding 4: an outbound-only email goal planned as an inbox read ──────────

describe("an outbound-only email goal is planned as a SEND (MAR-558 finding 4)", () => {
  const GOAL = "create a PDF invoice for the customer and email it to them";

  it("no longer carries a mailbox read", () => {
    expect(routeIds(GOAL)).not.toContain("email_read");
  });

  it("and DOES carry the send the goal asked for", () => {
    const ids = routeIds(GOAL);
    expect(ids).toContain("email_draft");
    expect(ids).toContain("optional_email_send");
  });

  it("behind an approval gate, since the send is an external write", () => {
    const r = plan(GOAL);
    const ids = r.recommended_route.map((s) => s.component_id);
    expect(ids).toContain("human_approval_gate");
    expect(ids.indexOf("human_approval_gate")).toBeLessThan(ids.indexOf("optional_email_send"));
  });

  // MAR-302's gate exists for this shape and must keep working: email is the
  // SOURCE, there is no correspondence intent, and the drafting/sending path is
  // hallucinated work.
  it("MAR-302's document-intake suppression still fires when email is the SOURCE", () => {
    const ids = routeIds("read invoices from my inbox and route them to accounting");
    expect(ids).not.toContain("email_draft");
    expect(ids).not.toContain("optional_email_send");
    expect(ids).toContain("email_read");
  });

  it("a goal that reads the inbox AND replies keeps both directions", () => {
    const ids = routeIds("read the invoices from my inbox and draft a reply to each vendor");
    expect(ids).toContain("email_read");
    expect(ids).toContain("email_draft");
  });
});
