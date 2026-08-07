/**
 * MAR-539 — a bare "draft" must not hijack a non-email goal into the mailbox.
 *
 * "draft" was both a `DOMAIN_KEYWORDS.email_calendar` token and a
 * `KEYWORD_HINTS` entry pointing at `email_draft`, so the word established the
 * email domain single-handedly and then fired the hint that domain permits,
 * with `optional_email_send` following behind it. A marketing-copy goal that
 * never mentions email composed an outbound EMAIL SEND step.
 *
 * The fix makes "draft" a WEAK email_calendar trigger (MAR-131's mechanism,
 * generalising MAR-219's chat-only fix to every other primary domain). Two
 * comments in capabilityMatcher.ts already called the word unreliable —
 * STRONG_EMAIL_CALENDAR_TOKENS "deliberately EXCLUDES 'draft'" — without
 * wiring it to the general case.
 *
 * Every presence assertion is paired with its absence twin: a real mailbox goal
 * must keep `email_draft` exactly as before.
 */
import { describe, expect, it } from "vitest";
import { matchCapabilities } from "../../src/graph/capabilityMatcher.js";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

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

function routeIds(goal: string): string[] {
  return plan(goal).recommended_route.map((step) => step.component_id);
}

// ── A content "draft" is not a mailbox action ────────────────────────────────

describe("a content-draft goal gets no email path (MAR-539)", () => {
  const CONTENT_DRAFT_GOALS = [
    // MAR-526 slice 5's own goal, restored to the wording it had to avoid
    "generate 3 headline variants for the campaign in parallel, fan the results back together, compose a review draft, and require my approval",
    "write a blog post draft each week and store it in the CMS",
    "draft a product announcement and post it to Slack after I approve",
  ];

  for (const goal of CONTENT_DRAFT_GOALS) {
    it(`selects no email_draft for: "${goal}"`, () => {
      expect(matchedIds(goal)).not.toContain("email_draft");
    });

    it(`composes NO outbound email send for: "${goal}"`, () => {
      // The expensive half. An unrequested egress step is the one thing a plan
      // that claims to be a contract of permitted actions cannot survive.
      const route = routeIds(goal);
      expect(route).not.toContain("optional_email_send");
      expect(route).not.toContain("email_draft");
      expect(route).not.toContain("gmail_draft_write");
    });
  }

  it("names the uncovered step instead of silently substituting an email draft", () => {
    // "draft a product announcement" has no registry component behind it once
    // email_draft stops absorbing it. The honest outcome is unmatched demand on
    // the card — a stated gap, not a wrong component (MAR-250).
    const coverage = plan("draft a product announcement and post it to Slack after I approve")
      .coverage;
    expect(coverage.unmatched_demand).toContain("draft a product announcement");
  });
});

// ── review_draft_composer becomes usable through its own vocabulary ──────────

describe("review_draft_composer is reachable via its documented hints (MAR-539)", () => {
  it("'compose a review draft' selects the composer, not the email drafter", () => {
    const goal =
      "generate 3 headline variants for the campaign in parallel, fan the results back together, compose a review draft, and require my approval";
    const ids = matchedIds(goal);
    expect(ids).toContain("review_draft_composer");
    expect(ids).not.toContain("email_draft");
  });

  it("MAR-526 slice 5's shipped fixture wording is unaffected", () => {
    // The slice worded its goal "stage for review" specifically to route around
    // this bug. That route must not move now that the workaround is unnecessary.
    const route = routeIds(
      "generate 3 headline variants in parallel, fan the results back together, stage for review, and require my approval",
    );
    expect(route).toContain("review_draft_composer");
    expect(route).not.toContain("email_draft");
    expect(route).not.toContain("optional_email_send");
  });
});

// ── A real mailbox goal is untouched ─────────────────────────────────────────

describe("a genuine mailbox draft goal keeps email_draft (MAR-539 absence fixtures)", () => {
  const MAILBOX_GOALS: [string, string][] = [
    ["read my unread emails and draft a reply for each one, do not send", "email"],
    ["draft a reply in gmail for every support email", "gmail"],
    ["monitor my inbox and draft a response to each new message", "inbox"],
    ["draft a reply to every message in my mailbox", "mailbox"],
  ];

  for (const [goal, token] of MAILBOX_GOALS) {
    it(`keeps email_draft — "${token}" is a strong email token: "${goal}"`, () => {
      expect(matchedIds(goal)).toContain("email_draft");
      expect(routeIds(goal)).toContain("email_draft");
    });
  }

  it("keeps email_draft when 'reply' carries the goal without the word email", () => {
    // "reply"/"replies" stay STRONG tokens, so a CRM-domain goal that really is
    // about correspondence is not stripped by the weak-only suppression.
    expect(matchedIds("draft a reply to each new lead in our pipeline")).toContain(
      "email_draft",
    );
  });

  it("still honours the no-send constraint on a mailbox draft goal", () => {
    // MAR-161's suppression must be reached, which means email_draft must survive
    // to be constrained in the first place.
    const route = routeIds("read my unread emails and draft a reply for each one, do not send");
    expect(route).toContain("email_draft");
    expect(route).not.toContain("optional_email_send");
  });
});

// ── The stated residual ──────────────────────────────────────────────────────

describe("RECORDED LIMIT — 'draft' as the only domain signal (MAR-539)", () => {
  it("a goal with no other primary domain still reaches email_draft", () => {
    // suppressWeakOnlyDomain defers to a competing primary domain; with none
    // present there is nothing to defer to, so email_calendar survives on the
    // weak token alone. Separating this needs intent parsing, not lexical
    // de-biasing — asserted here so the limit is visible rather than discovered.
    expect(matchedIds("draft a weekly update")).toContain("email_draft");
  });
});
