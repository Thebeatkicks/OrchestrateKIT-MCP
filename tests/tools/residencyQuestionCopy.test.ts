/**
 * MAR-742/F4 — the residency options are a choice a novice can actually make,
 * and the monitoring ⭐ stops pointing away from DASH.
 *
 * Two reported failures from Henrik's screenshots, one round apart:
 *
 * 1. "Where should this agent live?" — "Self-host hosted — always on" and
 *    "DASH Agent Runner — a local runtime on this computer" did not separate.
 *    The copy named implementations ("a local runtime", "manifest v2", "a
 *    separately installed runner") rather than answering the three questions
 *    someone choosing between them actually has. So every option now answers
 *    the same three, in the same order, and can be compared by reading down:
 *      does it run when I'm away · what does it cost · who starts/stops/watches it.
 *
 * 2. "How do you want to watch it?" recommended *Local logs* over DASH — the
 *    planner recommending against its own monitoring surface, in favour of an
 *    option whose own description says nothing alerts you when a run fails.
 *    That came from reading MAR-315's `log_to_file` default, which is computed
 *    from the goal before any residency answer exists.
 *
 * This suite pins the SEPARATION and the FACTS, not the sentences — asserting
 * exact prose is how the copy got frozen into jargon in the first place. The
 * absence twins are the two cases where the old behaviour is still right: a
 * goal that states its own monitoring preference, and an agent that must run
 * while the computer is off (DASH is a desktop app on that computer, so it is
 * off exactly when the agent is running).
 */
import { describe, expect, it } from "vitest";
import { planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

function plan(goal: string, build_target?: "cowork" | "cursor" | "chatgpt_gpt" | "code") {
  return planWorkflow(
    {
      goal,
      must_have_capabilities: [],
      must_avoid: [],
      output_depth: "technical",
      ...(build_target ? { build_target } : {}),
    },
    registry,
  );
}

const PRICE_WATCH =
  "Watch the prices of a few things my family wants across a handful of shops and tell me " +
  "when one drops below the price I set. Check about a dozen products every hour.";

const DASH_LOCAL =
  "Build a local agent that watches my Gmail for meeting requests continuously. " +
  "The separately installed DASH Agent Runner is available. Keep running after the " +
  "DASH window closes while this computer remains on.";

function round(goal: string, id: string, build_target?: Parameters<typeof plan>[1]) {
  return plan(goal, build_target).question_flow.rounds.find((r) => r.id === id)!;
}

describe("residency options are distinguishable by a novice (MAR-742/F4)", () => {
  const options = () => round(DASH_LOCAL, "build_surface").options;

  it("every substantive option answers the away question", () => {
    // The one thing the reported confusion was about: which of these keeps
    // working when I'm not sitting here.
    const AWAY = /away|awake|asleep|power-off|while this chat is open|whether your computer/i;
    for (const option of options()) {
      if (option.id === "other") continue;
      expect(option.description ?? "", `${option.id}`).toMatch(AWAY);
    }
  });

  it("every substantive option answers the cost question", () => {
    const COST = /bill|cost|no hosting bill|no bill/i;
    for (const option of options()) {
      if (option.id === "other") continue;
      expect(option.description ?? "", `${option.id}`).toMatch(COST);
    }
  });

  it("every substantive option answers the who-controls-it question", () => {
    const CONTROL = /dashboard|you start|you deploy|you change it|check on it/i;
    for (const option of options()) {
      if (option.id === "other") continue;
      expect(option.description ?? "", `${option.id}`).toMatch(CONTROL);
    }
  });

  it("the two local options separate on what the user actually gets", () => {
    // The reported pair. Both run on this computer; the difference is whether
    // anything watches it for you, and that has to be on the page.
    const opts = options();
    const runner = opts.find((o) => o.id === "dash_agent_runner")!;
    const bare = opts.find((o) => o.id === "self_host_local")!;
    expect(runner.description).toMatch(/dashboard/i);
    expect(bare.description).toMatch(/no dashboard/i);
    expect(runner.label).not.toBe(bare.label);
  });

  it("the hosted option is the one that says it runs while you are away", () => {
    const hosted = options().find((o) => o.id === "self_host_hosted")!;
    expect(hosted.label).toMatch(/away|always-on/i);
    expect(hosted.description).toMatch(/whether your computer is on or not/i);
    expect(hosted.description).toMatch(/monthly hosting bill/i);
  });

  it("no residency option leans on product jargon a chooser cannot act on", () => {
    // "manifest v2" / "a local runtime" were the reported offenders. They name an
    // implementation detail, not a consequence of choosing.
    for (const roundId of ["build_surface", "monitoring"]) {
      for (const option of round(DASH_LOCAL, roundId).options) {
        const text = `${option.label} ${option.description ?? ""}`;
        expect(text, `${roundId}/${option.id}`).not.toMatch(/manifest v2/i);
        expect(text, `${roundId}/${option.id}`).not.toMatch(/\bruntime\b/i);
      }
    }
  });

  it("the facts the old copy carried are still carried", () => {
    // Rewriting for clarity must not drop what the reader needed. All three of
    // these were load-bearing in the copy MAR-427 pinned.
    const runner = options().find((o) => o.id === "dash_agent_runner")!;
    expect(runner.description).toMatch(/separately installed/i);
    expect(runner.description).toMatch(/close its window/i);
    expect(runner.description).toMatch(/sleep or power-off/i);
  });
});

describe("the monitoring ⭐ points at DASH when DASH applies (MAR-742/F4)", () => {
  it("a durable agent with DASH reachable recommends DASH, not a log file", () => {
    const monitoring = round(PRICE_WATCH, "monitoring");
    expect(monitoring.options.map((o) => o.id)).toContain("dash");
    expect(monitoring.recommended_option_id).toBe("dash");
  });

  it("local logs stay offered as the fallback", () => {
    const monitoring = round(PRICE_WATCH, "monitoring");
    expect(monitoring.options.map((o) => o.id)).toContain("local_logs");
    const r = plan(PRICE_WATCH);
    expect(r.hosting_and_monitoring.monitoring.alternatives.map((a) => a.id)).toContain(
      "log_to_file",
    );
  });

  it("the card's recommended setup agrees with the round's ⭐", () => {
    // The two surfaces disagreeing is its own bug: the card said "Log runs to a
    // file" while the question starred DASH.
    const r = plan(PRICE_WATCH);
    expect(r.hosting_and_monitoring.monitoring.recommended.id).toBe("dash_import");
    expect(round(PRICE_WATCH, "monitoring").recommended_option_id).toBe("dash");
  });
});

describe("the absence twins — where a log is still the honest answer (MAR-742/F4)", () => {
  it("a goal that states its own monitoring preference keeps it", () => {
    const goal = `${PRICE_WATCH} Log to a file I can read myself.`;
    expect(plan(goal).hosting_and_monitoring.monitoring.recommended.id).toBe("log_to_file");
    expect(round(goal, "monitoring").recommended_option_id).toBe("local_logs");
  });

  it("an agent that must run while the computer is off is not sent to a desktop dashboard", () => {
    // DASH runs on this computer. An agent that has to keep working while the
    // computer is asleep or off is running exactly when DASH is not, so
    // recommending it would be the mirror of the bug above.
    const goal =
      "Build a local agent that continuously watches my Gmail for new sales leads, drafts " +
      "replies, and waits for my approval. Never send email. The separately installed DASH " +
      "Agent Runner is available, but it must keep working while my computer is asleep or off.";
    const r = plan(goal);
    expect(r.goal_to_product_wizard.runtime_requirements.must_run_while_computer_off).toBe(
      true,
    );
    expect(r.hosting_and_monitoring.monitoring.recommended.id).toBe("log_to_file");
  });

  it("a Cowork build has no durable run to monitor, so DASH is not offered at all", () => {
    const goal =
      "When I ask in chat, summarize my unread inbox in Cowork. Never run in the background.";
    const ids = [
      plan(goal, "cowork").hosting_and_monitoring.monitoring.recommended,
      ...plan(goal, "cowork").hosting_and_monitoring.monitoring.alternatives,
    ].map((o) => o.id);
    expect(ids).not.toContain("dash_import");
  });
});
