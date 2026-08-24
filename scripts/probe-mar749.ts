#!/usr/bin/env tsx
/**
 * probe-mar749.ts — MAR-749 acceptance evidence (reporting only, not a gate).
 *
 * The gate for this behaviour is tests/graph/approvalProvenance.test.ts plus the
 * four `approval_binding_*` node probes. This script exists so the acceptance
 * evidence on MAR-540/MAR-749 can be REPRODUCED rather than trusted: it prints
 * route, approval chip and unmatched_demand for the probe goal, the default
 * path, both absence twins, and a negative control that removes the one
 * component via `must_avoid` so the before/after pair is measured on a single
 * build.
 *
 *   pnpm tsx scripts/probe-mar749.ts
 */
import { planWorkflow } from "../src/tools/planWorkflow.js";
import { loadRegistry } from "../src/registry/registryLoader.js";

const registry = loadRegistry();

const GOALS: Array<{ label: string; goal: string; mustAvoid?: string[] }> = [
  {
    label: "MAR-540 probe goal (the acceptance probe)",
    goal:
      "when a customer emails a refund request, draft the refund in Stripe and require my " +
      "approval before it executes, with an audit trail proving what I approved is exactly what ran",
  },
  {
    label: "stated drift concern, no Stripe",
    goal:
      "draft a reply to every support email and require my approval before it sends, " +
      "with an audit trail proving what I approved is exactly what ran",
  },
  {
    label: "DEFAULT path — never says 'approval provenance'",
    goal: "read new leads from Gmail and write a note to the CRM for each one after I approve",
  },
  {
    label: "absence twin — read-only, no write",
    goal:
      "every morning read yesterday's signup rows from our postgres database " +
      "and store a short summary in the state store",
  },
  {
    label: "absence twin — unattended read-and-notify",
    goal: "every morning pull the numbers from our Postgres database and post a summary to Slack",
  },
];

// The negative control runs on the SAME build: `must_avoid` removes the one
// component, so the pair proves the switch rather than proving two builds differ.
GOALS.push({
  label: "NEGATIVE CONTROL — the probe goal with must_avoid: [approval_binding]",
  goal: GOALS[0]!.goal,
  mustAvoid: ["approval_binding"],
});

for (const { label, goal, mustAvoid = [] } of GOALS) {
  const r = planWorkflow(
    { goal, must_have_capabilities: [], must_avoid: mustAvoid, output_depth: "brief" },
    registry,
  );
  const header = (r.summary_markdown.split("\n").find((l) => l.includes("Risk ")) ?? "").trim();
  console.log(`\n=== ${label} ===`);
  console.log(`goal:     ${goal}`);
  console.log(`route:    ${r.recommended_route.map((s) => s.component_id).join(" → ")}`);
  console.log(`header:   ${header.replace(/^[*_\s]+|[*_\s]+$/g, "")}`);
  console.log(`gates:    ${JSON.stringify(r.enforced_approval_gates)}`);
  console.log(`coverage: ${r.coverage.coverage_label}`);
  console.log(`unmatched_demand: ${JSON.stringify(r.coverage.unmatched_demand, null, 2)}`);
}
