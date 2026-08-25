#!/usr/bin/env tsx
/**
 * probe-mar786.ts — MAR-786 acceptance evidence (reporting only, not a gate).
 *
 * The gate for this behaviour is tests/graph/notificationCoverage.test.ts. This
 * script exists so the acceptance evidence on MAR-786 can be REPRODUCED rather
 * than trusted: it prints route, coverage label and unmatched_demand for the
 * family-price-watch transcript goal, for each phrasing of the family on the
 * same absorption stem, and for every absence twin — the mention-only goal, the
 * negated tellings, the in-channel goal and its unattended sibling, and the
 * goals that name a channel.
 *
 * Read the middle column: on master every PRESENT row printed `full  []`.
 *
 *   pnpm tsx scripts/probe-mar786.ts
 */
import { planWorkflow } from "../src/tools/planWorkflow.js";
import { loadRegistry } from "../src/registry/registryLoader.js";

const registry = loadRegistry();

/**
 * The absorption stem: a price-watch goal whose telling clause sits next to the
 * demand noun `price`, which `page_monitor`'s own "watch the prices" hint
 * claims. That claimed noun is what was clearing the whole clause.
 */
const PRICE_WATCH = "Watch the prices of a few things my family wants across a handful of shops";

const GOALS: Array<{ label: string; goal: string }> = [
  {
    label: "the transcript goal, verbatim",
    goal:
      "Watch the prices of a few things my family wants — my 14 year old wants a gaming laptop, " +
      "my wife wants a coffee machine — across a handful of shops, and tell me when one drops " +
      "below the price I set.",
  },

  // ── the phrasing family ───────────────────────────────────────────────────
  { label: "tell me when", goal: `${PRICE_WATCH} and tell me when one drops below the price I set.` },
  { label: "notify me", goal: `${PRICE_WATCH} and notify me when one drops below the price I set.` },
  { label: "let me know", goal: `${PRICE_WATCH} and let me know when one drops below the price I set.` },
  { label: "let me know (bare)", goal: `${PRICE_WATCH} and let me know.` },
  { label: "keep me posted", goal: `${PRICE_WATCH} and keep me posted on the price.` },
  { label: "give me a heads up", goal: `${PRICE_WATCH} and give me a heads up about the price.` },
  { label: "text me", goal: `${PRICE_WATCH} and text me the price when it drops.` },
  { label: "ping me", goal: `${PRICE_WATCH} and ping me about the price when it drops.` },
  {
    label: "alert me (the one that always worked)",
    goal: `${PRICE_WATCH} and alert me when one drops below the price I set.`,
  },

  // ── absence twins ─────────────────────────────────────────────────────────
  {
    label: "TWIN mention-only ('tells me')",
    goal: "Build a weekly report my boss tells me to make from our sales spreadsheet.",
  },
  { label: "TWIN negated notify", goal: `${PRICE_WATCH} and never notify me.` },
  { label: "TWIN negated let me know", goal: `${PRICE_WATCH} and never let me know.` },
  {
    label: "TWIN answered in this chat",
    goal: "Read the invoice PDF I upload and let me know what it says.",
  },
  {
    label: "TWIN same words, nobody in the chat",
    goal:
      "Every morning, read the new invoice PDFs in our shared folder and let me know what they say.",
  },
  {
    label: "TWIN channel named (Slack)",
    goal: `${PRICE_WATCH} and tell me on Slack when one drops below the price I set.`,
  },
  {
    label: "TWIN channel named (Telegram)",
    goal: `${PRICE_WATCH} and send me a Telegram message when one drops below the price I set.`,
  },
  {
    label: "TWIN the playbook already carries it",
    goal:
      "Check 5 competitor product pages every hour for price changes and post an internal " +
      "Slack alert when a price crosses my threshold.",
  },
];

for (const { label, goal } of GOALS) {
  const plan = planWorkflow(
    { goal, must_have_capabilities: [], must_avoid: [], output_depth: "brief" },
    registry,
  );
  const coverage = plan.coverage;
  console.log("─".repeat(78));
  console.log(`${label}`);
  console.log(`  goal    : ${goal}`);
  console.log(`  route   : ${plan.recommended_route.map((s) => s.component_id).join(" → ")}`);
  console.log(`  coverage: ${coverage.coverage_label}`);
  console.log(`  missing : ${JSON.stringify(coverage.unmatched_demand)}`);
}
