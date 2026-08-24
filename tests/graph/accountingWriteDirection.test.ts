/**
 * MAR-581 - a Xero/QuickBooks WRITE must be represented by a real write step.
 *
 * Presence and absence are paired deliberately. A provider noun is not a write:
 * only verb + accounting object + provider/system context may select the
 * privileged component. The exact issue goal also locks MAR-540's honesty rule:
 * the gate is enforced, but remains visibly unbound until runtime proof exists.
 */
import { describe, expect, it } from "vitest";
import {
  accountingWriteDemandToken,
  hasAccountingWriteIntent,
  matchCapabilities,
} from "../../src/graph/capabilityMatcher.js";
import { computeExecutionOrder } from "../../src/graph/routeOrdering.js";
import { augmentWithSafety } from "../../src/graph/safetyAugmenter.js";
import { connectionContractForComponents, planWorkflow } from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();
const ISSUE_GOAL =
  "Build a bookkeeping workflow where a receipt becomes a proposed transaction, " +
  "requires explicit human approval, then revalidates and creates the Xero transaction " +
  "only after approval, with an evidence link back to the source item and duplicate-event guards.";

function matchedIds(goal: string): string[] {
  return matchCapabilities(goal, [], [], registry.components, registry.edges).matches.map(
    (match) => match.component.id,
  );
}

function plan(goal: string, output_depth: "brief" | "technical" = "brief") {
  return planWorkflow(
    { goal, must_have_capabilities: [], must_avoid: [], output_depth },
    registry,
  );
}

function routeIds(goal: string): string[] {
  return plan(goal).recommended_route.map((step) => step.component_id);
}

describe("accounting write direction is verb-object-provider anchored (MAR-581)", () => {
  const WRITES = [
    "create the Xero transaction only after approval",
    "post the approved bill to QuickBooks Online",
    "record the payment in QBO after the owner signs off",
    "write a journal entry into the general ledger after review",
    "the Xero journal entry is created after approval",
  ];

  for (const goal of WRITES) {
    it(`recognises a real accounting write: "${goal}"`, () => {
      expect(hasAccountingWriteIntent(goal.toLowerCase())).toBe(true);
      expect(matchedIds(goal)).toContain("accounting_write");
    });
  }

  const NOT_WRITES = [
    "read transactions from Xero and summarize them",
    "export Xero transactions to a local spreadsheet",
    "look up the bill in QuickBooks Online before replying",
    "draft a proposed Xero transaction for a human to review",
    "create a transaction object in memory for a preview",
    "create a CRM transaction note after the call",
    "read Xero transactions. Create an invoice PDF for the customer",
    "read transactions from Xero and create an invoice PDF report",
  ];

  for (const goal of NOT_WRITES) {
    it(`does not invent an accounting write for: "${goal}"`, () => {
      expect(hasAccountingWriteIntent(goal.toLowerCase())).toBe(false);
      expect(matchedIds(goal)).not.toContain("accounting_write");
      expect(routeIds(goal)).not.toContain("accounting_write");
    });
  }

  it("uses the user's Xero transaction words as coverage provenance", () => {
    expect(accountingWriteDemandToken(ISSUE_GOAL.toLowerCase())).toBe("xero transaction");
  });
});

describe("the exact Xero post has a guarded, honest write path (MAR-581 / MAR-540)", () => {
  const output = plan(ISSUE_GOAL, "brief");
  const ids = output.recommended_route.map((step) => step.component_id);

  it("carries the write, validation, dedupe, gate, auth-failure and audit steps", () => {
    expect(ids).toEqual(expect.arrayContaining([
      "accounting_write",
      "schema_validation",
      "deduplication",
      "human_approval_gate",
      "auth_failure_handler",
      "audit_log",
    ]));
    expect(output.coverage.unmatched_demand).toEqual([]);
    expect(output.coverage.matched.find((m) => m.component_id === "accounting_write")?.tokens)
      .toEqual(expect.arrayContaining(["xero transaction", "evidence link"]));
  });

  it("orders validation and the approval gate before the accounting API write", () => {
    expect(ids.indexOf("schema_validation")).toBeLessThan(ids.indexOf("accounting_write"));
    expect(ids.indexOf("human_approval_gate")).toBeLessThan(ids.indexOf("accounting_write"));
  });

  it("binds the approval to the transaction it is about to post (MAR-749)", () => {
    // Was "enforced but NOT bound" when this test was written: MAR-540 had
    // corrected the overclaim without building the mechanism, so the honest
    // answer for a ledger write was "re-check it yourself". MAR-749 built the
    // mechanism, and a posted transaction is the highest-consequence write in
    // the registry — reversible only by a second, separately audited entry — so
    // it is the last route that should still be reading (unbound).
    expect(output.enforced_approval_gates).toContain("human_approval_gate");
    expect(output.summary_markdown).toContain("Approval enforced (bound)");
    expect(output.summary_markdown).toContain("bind the approval to the payload");
    expect(ids).toContain("approval_binding");
    expect(ids.indexOf("approval_binding")).toBeLessThan(ids.indexOf("accounting_write"));
  });

  it("exposes a provider-neutral connection without pretending connect.mjs can mint one", () => {
    const accounting = connectionContractForComponents(["accounting_write"])[0];
    expect(accounting.connection_id).toBe("accounting_system");
    expect(accounting.grants).toContain("Create approved accounting transactions");
    expect(accounting.scopes).toEqual(expect.arrayContaining([
      "Xero: accounting.transactions + offline_access, or",
      "QuickBooks Online: com.intuit.quickbooks.accounting",
    ]));
    const actionable = accounting.acquisition_paths.find(
      (path) => path.kind === accounting.actionable_path_kind,
    );
    expect(actionable?.how).toContain("Choose Xero or QuickBooks Online");
    expect(actionable?.how).not.toContain("scripts/connect.mjs");
    expect(actionable?.caveat).toContain("cannot mint a provider-neutral accounting credential");
  });

  it("the component is deterministic and declares the write/evidence/idempotency contract", () => {
    const component = registry.components.find((candidate) => candidate.id === "accounting_write");
    expect(component).toBeDefined();
    expect(component?.model_tier).toBe("none");
    expect(component?.permissions.write).not.toEqual([]);
    expect(component?.permissions.approval_required_for).not.toEqual([]);
    expect(component?.capabilities).toEqual(expect.arrayContaining([
      "revalidate_transaction_before_write",
      "preserve_source_evidence_reference",
      "enforce_idempotent_accounting_write",
    ]));
  });
});

describe("accounting-write graph policy is executable (MAR-581)", () => {
  const accounting = registry.components.find((component) => component.id === "accounting_write")!;

  it("edge: accounting_write__requires__human_approval_gate", () => {
    const result = augmentWithSafety([accounting], registry.edges, registry.components);
    expect(result.components.map((component) => component.id)).toContain("human_approval_gate");
  });

  it("edge: accounting_write__safer_with__auth_failure_handler", () => {
    const result = augmentWithSafety([accounting], registry.edges, registry.components);
    expect(result.components.map((component) => component.id)).toContain("auth_failure_handler");
  });

  it("edge: audit_log__recommended__accounting_write", () => {
    const result = augmentWithSafety([accounting], registry.edges, registry.components);
    expect(result.components.map((component) => component.id)).toContain("audit_log");
    expect(result.added_audit).toBe(true);
  });

  it("edge: schema_validation__before__accounting_write", () => {
    const result = augmentWithSafety([accounting], registry.edges, registry.components);
    const order = computeExecutionOrder(result.components, registry.edges).map(
      (component) => component.id,
    );
    expect(order.indexOf("schema_validation")).toBeLessThan(order.indexOf("accounting_write"));
    expect(order.indexOf("human_approval_gate")).toBeLessThan(order.indexOf("accounting_write"));
  });
});
