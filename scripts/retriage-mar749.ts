#!/usr/bin/env tsx
/**
 * MAR-540 bar #6 / MAR-749 scope item 5 — re-triage the five LAB signal-intake
 * posts against the changed registry.
 *
 * Wording is carried forward from MAR-562's recorded re-triage (the comment on
 * MAR-540), which drew each goal from its post's own text. Reddit is not
 * re-fetched here; the point of the exercise is to run the SAME five goals
 * against a registry that now has approval_binding, so any difference is
 * attributable to this change rather than to a re-paraphrase.
 *
 *   pnpm tsx scripts/retriage-mar749.ts
 */
import { planWorkflow } from "../src/tools/planWorkflow.js";
import { loadRegistry } from "../src/registry/registryLoader.js";

const registry = loadRegistry();

const POSTS: Array<{ n: number; post: string; url: string; goal: string }> = [
  {
    n: 1,
    post: "Human in the loop is meaningless unless we define what the human is approving",
    url: "https://www.reddit.com/r/AI_Agents/comments/1vhvqp0/",
    goal:
      "I want an agent that drafts outbound replies and requires a human to approve before it sends, " +
      "and I want the approval bound tightly to the exact request that ends up executing, with an " +
      "audit trail that proves there was no drift between what was approved and what actually ran",
  },
  {
    n: 2,
    post: "Built a governance layer for n8n — who owns each automated decision",
    url: "https://www.reddit.com/r/n8n/comments/1vhsswf/",
    goal:
      "Add a governance layer to our automations so that every irreversible action requires approval " +
      "first, and we can see who owns each automated decision and look up the decision ledger later",
  },
  {
    n: 3,
    post: "Built a human-approved n8n to Xero bookkeeping flow",
    url: "https://www.reddit.com/r/n8n/comments/1vh12hd/",
    goal:
      "Read receipts from email, turn each one into a proposed bookkeeping entry, and only after I " +
      "approve it create the transaction in Xero, with an evidence link back to the source receipt",
  },
  {
    n: 4,
    post: "We're building self-driving cars for money but nobody can say who authorized the trip",
    url: "https://www.reddit.com/r/AI_Agents/comments/1vhzwxs/",
    goal:
      "When our agent moves money or changes a customer record, I need every action tied to who " +
      "authorized it, so an auditor can see the authorization and the action together",
  },
  {
    n: 5,
    post: "How much evidence should an automated CRM finding show",
    url: "https://www.reddit.com/r/automation/comments/1vgytcr/",
    goal:
      "Read new leads from our inbox, research each company, and write a note to the CRM after I " +
      "approve it, showing enough evidence in the note that a salesperson can trust the finding",
  },
];

for (const { n, post, url, goal } of POSTS) {
  const r = planWorkflow(
    { goal, must_have_capabilities: [], must_avoid: [], output_depth: "brief" },
    registry,
  );
  const ids = r.recommended_route.map((s) => s.component_id);
  const header = (r.summary_markdown.split("\n").find((l) => l.includes("Risk ")) ?? "").trim();
  const chip = /Approval[^·]*/.exec(header)?.[0]?.trim() ?? "(none)";
  console.log(`\n### ${n}. ${post}`);
  console.log(`${url}`);
  console.log(`goal:      ${goal}`);
  console.log(`route:     ${ids.join(" → ")}`);
  console.log(`chip:      ${chip}`);
  console.log(`gate:      ${JSON.stringify(r.enforced_approval_gates)}`);
  console.log(`binding:   ${ids.includes("approval_binding") ? "YES" : "no"}`);
  console.log(`coverage:  ${r.coverage.coverage_label}`);
  console.log(`unmatched: ${JSON.stringify(r.coverage.unmatched_demand)}`);
}
