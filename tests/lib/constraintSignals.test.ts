/**
 * constraintSignals (MAR-255 / BRIEF-03) — the shared goal-constraint
 * detection used by plan_workflow's gate logic AND export_build_brief's §0.
 * Six fixture goals covering every constraint class, plus negation and the
 * conflicting case. The G1 goal is VERBATIM from the 2026-07-01 audit — the
 * one the brief previously answered with "No explicit … constraint detected".
 */
import { describe, it, expect } from "vitest";
import {
  detectConstraintSignals,
  hasWriteConstraint,
  hasUnattendedWaiver,
  hasExplicitApprovalRequirement,
  occursUnnegated,
} from "../../src/lib/constraintSignals.js";

const G1_EMAIL =
  "Every morning, read unread customer support emails, classify them by urgency, and draft " +
  "replies for my approval — never send anything automatically. A human reviews every draft.";

describe("detectConstraintSignals (MAR-255)", () => {
  it("G1 audit goal → draft-only + attended, with trigger phrases", () => {
    const s = detectConstraintSignals(G1_EMAIL);
    expect(s.draft_only.detected).toBe(true);
    expect(s.draft_only.trigger).toBe("never send anything automatically");
    expect(s.attended_required.detected).toBe(true);
    expect(s.attended_required.trigger).toBe("for my approval");
    expect(s.read_only.detected).toBe(false);
    expect(s.conflict).toBe(false);
  });

  it("read-only goal → read_only with trigger", () => {
    const s = detectConstraintSignals(
      "Scan the pull request diff for problems, read-only, never write anything",
    );
    expect(s.read_only.detected).toBe(true);
    expect(s.read_only.trigger).toBe("read-only");
  });

  it("unattended goal → unattended, no attended", () => {
    const s = detectConstraintSignals(
      "Watch our API uptime and alert on Slack, fully unattended, no human in the loop",
    );
    expect(s.unattended.detected).toBe(true);
    expect(s.unattended.trigger).toBe("unattended");
    expect(s.attended_required.detected).toBe(false);
    expect(s.conflict).toBe(false);
  });

  it("no-outbound goal → no_outbound with trigger", () => {
    const s = detectConstraintSignals(
      "Summarize industry news into an internal digest, no emails sent to anyone",
    );
    expect(s.no_outbound.detected).toBe(true);
    expect(s.no_outbound.trigger).toBe("no emails sent");
  });

  it("goal with no constraints → nothing detected", () => {
    const s = detectConstraintSignals("read emails and draft a CRM note for each lead");
    expect(s.read_only.detected).toBe(false);
    expect(s.unattended.detected).toBe(false);
    expect(s.attended_required.detected).toBe(false);
    expect(s.draft_only.detected).toBe(false);
    expect(s.no_outbound.detected).toBe(false);
    expect(s.conflict).toBe(false);
  });

  it("conflicting goal (waiver + human review) → both detected + conflict flag", () => {
    const s = detectConstraintSignals(
      "Runs unattended on a schedule, but a human reviews every draft before it goes out",
    );
    expect(s.attended_required.detected).toBe(true);
    expect(s.unattended.detected).toBe(true);
    expect(s.conflict).toBe(true);
  });

  it("negated waiver phrases do not count (MAR-229/140 lineage)", () => {
    const s = detectConstraintSignals("This is not unattended — I check the output daily");
    expect(s.unattended.detected).toBe(false);
    expect(s.conflict).toBe(false);
  });
});

/**
 * Word-boundary matching. Naive `String.includes` counted a phrase that merely
 * sat inside a longer word: "posts the result in the same THREAD ONLY after I
 * approve" contains "read only" (th·"read only"), so a goal explicitly asking
 * the agent to POST was told its route violated a read-only prohibition the
 * user never stated — and `constraint_label` degraded to "gaps". That exact
 * goal ships as the `chat_triggered_assistant` golden-journey fixture.
 *
 * Every false-positive shape is paired with the true positive it must not cost.
 */
describe("phrases match whole words only", () => {
  const FALSE_POSITIVES: Array<[string, string]> = [
    ["thread only", "Post the result in the same thread only after I approve it."],
    ["thread-only", "Keep a thread-only reply policy for the bot."],
    ["unread only", "Summarize the unread only messages in my inbox."],
    ["spread only", "Spread only the approved content across the channels."],
    ["no written", "No written approval needed, just post it."],
  ];

  for (const [shape, goal] of FALSE_POSITIVES) {
    it(`"${shape}" does not fire the read-only prohibition`, () => {
      expect(detectConstraintSignals(goal).read_only.detected).toBe(false);
      expect(hasWriteConstraint(goal)).toBe(false);
    });
  }

  // `hasWriteConstraint` reads the narrower MAR-142 planner table
  // (WRITE_CONSTRAINT_SIGNALS); the §0 read_only class adds the edit/commit
  // phrases. That split is pre-existing and deliberate — `inWriteTable` records
  // which side of it each phrase belongs to rather than blurring the two.
  const TRUE_POSITIVES: Array<{ phrase: string; goal: string; inWriteTable: boolean }> = [
    { phrase: "read-only", goal: "Scan the PR diff for problems, read-only.", inWriteTable: true },
    { phrase: "read only", goal: "This is read only — do not change anything.", inWriteTable: true },
    { phrase: "never write", goal: "Review the PR but never write anything.", inWriteTable: true },
    { phrase: "never writes", goal: "The agent never writes to the database.", inWriteTable: true },
    { phrase: "no writes", goal: "Report on the tables with no writes at all.", inWriteTable: true },
    { phrase: "never edit", goal: "Never edit or commit any code.", inWriteTable: false },
    {
      phrase: "never editing",
      goal: "Never editing the repository, only reporting.",
      inWriteTable: false,
    },
    {
      phrase: "never commits",
      goal: "The reviewer never commits anything itself.",
      inWriteTable: false,
    },
  ];

  for (const { phrase, goal, inWriteTable } of TRUE_POSITIVES) {
    it(`"${phrase}" still fires the read-only prohibition`, () => {
      expect(detectConstraintSignals(goal).read_only.detected).toBe(true);
      expect(hasWriteConstraint(goal)).toBe(inWriteTable);
    });
  }

  it("does not read an approval phrase out of a longer word", () => {
    // "preview before" contains "review before".
    expect(occursUnnegated("show me a preview before publishing", "review before", true)).toBe(
      false,
    );
    expect(occursUnnegated("a human must review before publishing", "review before", true)).toBe(
      true,
    );
  });

  it("does not read a waiver out of a longer word", () => {
    // "no gateway" contains "no gate"; "no humanity check" contains "no human".
    expect(hasUnattendedWaiver("route it through our no gateway proxy")).toBe(false);
    expect(hasUnattendedWaiver("run it with no gate and no human")).toBe(true);
  });

  it("KNOWN LIMIT: a real word sequence still fires, boundaries or not", () => {
    // "…anything I already READ ONLY after the digest" is a genuine two-word
    // sequence, not a phrase buried inside a longer word. Whole-word matching
    // cannot separate it from the constraint; that needs parsing, not matching.
    // Recorded so the limit is visible rather than discovered later.
    const goal = "Skip anything I already read only after the daily digest.";
    expect(detectConstraintSignals(goal).read_only.detected).toBe(true);
  });

  it("the chat-bot fixture goal is not read-only — it posts", () => {
    // Verbatim from tests/journey/fixtures/index.ts.
    const goal =
      "Build a Discord bot that responds to a slash command from an allowed team member, " +
      "classifies it, performs the action, and posts the result in the same thread only after " +
      "I approve it.";
    const s = detectConstraintSignals(goal);
    expect(s.read_only.detected).toBe(false);
    expect(s.attended_required.detected).toBe(true);
  });
});

describe("planner predicates re-exported unchanged (pure refactor)", () => {
  it("hasWriteConstraint fires on the MAR-142 phrase table", () => {
    expect(hasWriteConstraint("read-only on all external sites")).toBe(true);
    expect(hasWriteConstraint("post the summary to Slack")).toBe(false);
  });

  it("hasWriteConstraint does NOT fire on send prohibitions — no-send is no_outbound, not read-only", () => {
    // "Never send the email" forbids one outbound effect while explicitly
    // requesting two writes (calendar event + Gmail draft). Classifying it as
    // read-only made the planner warn against the writes the user asked for
    // (live golden-prompt finding, 2026-07-17).
    expect(
      hasWriteConstraint("after I approve, create the calendar event and the draft. Never send the email."),
    ).toBe(false);
    expect(hasWriteConstraint("summarize the inbox for me, no emails sent to anyone")).toBe(false);
    // …while a genuine read-only constraint still counts.
    expect(hasWriteConstraint("review the PR, read-only, never write anything")).toBe(true);
  });

  it("hasUnattendedWaiver yields to an explicit approval requirement (MAR-229)", () => {
    expect(hasUnattendedWaiver("fully automated, no gate")).toBe(true);
    expect(hasUnattendedWaiver("fully automated, but a human must approve each send")).toBe(false);
    expect(hasExplicitApprovalRequirement("a human must approve each send")).toBe(true);
  });

  it("occursUnnegated respects the negation window", () => {
    expect(occursUnnegated("must review before sending", "must review", true)).toBe(true);
    // negation word directly precedes the phrase → negated
    expect(occursUnnegated("do not review before sending", "review before", true)).toBe(false);
  });
});
