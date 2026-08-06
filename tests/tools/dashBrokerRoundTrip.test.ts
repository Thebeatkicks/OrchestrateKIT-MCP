/**
 * MAR-477 — the committed cross-repo conformance test that replaces the
 * gitignored `exports/mar-477/` harness.
 *
 * MAR-477's live proof found the MCP -> DASH round trip blocked by two field
 * VALUES, not shapes: `agent_dom.connections[].provider` and `.ownership`
 * (fixed as MAR-493/494, `src/lib/dashBrokerCatalog.ts`). Every assertion in
 * `tests/tools/observabilityManifest.test.ts` that covers those fixes checks
 * the MCP's output against the MCP's own literals — real coverage, but it
 * would pass identically whether or not DASH agrees, which is exactly how the
 * MAR-477 gap survived a green `pnpm verify` for as long as it did.
 *
 * This file is the difference: every assertion below is checked against
 * `tests/fixtures/dash/broker-profiles.json`, a semantic copy of DASH's own
 * `lib/broker/providers.ts` + `lib/broker/operations.ts` facts (dual-update
 * discipline documented in `tests/fixtures/dash/README.md`, same pattern as
 * the pinned manifest-v2 schema). It asserts three things the round trip
 * depends on, grounded in that pinned copy of DASH's truth rather than the
 * MCP's own claims about itself:
 *
 *   1. Provider vocabulary — `dashManifestProvider`'s spelling for a brokered
 *      connection matches a `connection_provider` DASH's broker actually
 *      recognises (`brokerProfileFor`, `lib/broker/providers.ts`).
 *   2. The `dash_broker_available` -> `dash_managed` path — ownership is
 *      `dash_managed` if and only if the emitted provider matches a pinned
 *      DASH profile; never for a provider DASH's broker does not recognise
 *      (the "looks connected, nothing works" failure `dashBrokerCatalog.ts`
 *      warns about).
 *   3. Broker-profile resolution — `resolveGrant` (`lib/broker/grant.ts`)
 *      grants an operation only when every one of that operation's
 *      `required_scopes` is in the manifest's declared OAuth scopes AND the
 *      connection carries exactly one OAuth field (`oauthField`'s
 *      one-field-or-refuse rule). Both preconditions are checked here against
 *      the pinned operations, so a manifest that would make DASH's
 *      `resolveGrant` return `no_operations_granted` or `no_oauth_field` fails
 *      this test instead of failing silently at a real consent screen.
 *
 * What this does NOT do: import orchestratedash's TypeScript, run its broker
 * against a live credential, or drive `createBroker.handle`. That is
 * MAR-477's steps 3/5/6 in `exports/mar-477/{dash-side,brokered-call}.ts`,
 * which need orchestratedash checked out beside this repo and are the
 * developer-machine proof this test does not replace — this repo's CI never
 * has that sibling. What this test replaces is the part of the harness that
 * checked whether an MCP-authored manifest is even SHAPED like something DASH
 * would grant, which is exactly the part that can be pinned as a fixture and
 * run everywhere.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { exportBuildBrief } from "../../src/tools/exportBuildBrief.js";
import {
  planWorkflow,
  type PlacementAxis,
  type RuntimeOption,
  type TriggerExplanation,
} from "../../src/tools/planWorkflow.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";
import {
  dashManifestProvider,
  dashBrokeredConnectionIds,
} from "../../src/lib/dashBrokerCatalog.js";

const require = createRequire(import.meta.url);
/* eslint-disable @typescript-eslint/no-var-requires */
const Ajv2020 = require("ajv/dist/2020.js") as new (opts?: object) => {
  compile: (schema: object) => ((data: unknown) => boolean) & { errors?: unknown };
};
const addFormats = require("ajv-formats") as (ajv: object) => void;
/* eslint-enable @typescript-eslint/no-var-requires */

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/dash",
);
function loadFixtureJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(path.join(fixtureRoot, relativePath), "utf-8"));
}

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateManifest = ajv.compile(loadFixtureJson("agent.manifest.v2.schema.json") as object);

type BrokerProfile = {
  connection_provider: string;
  oauth_provider_id: string;
  label: string;
  token_custodian: string;
  client_owner: string;
};
type BrokerOperationFixture = {
  id: string;
  connection_provider: string;
  access: "read" | "write";
  required_scopes: string[];
};
const brokerFixture = loadFixtureJson("broker-profiles.json") as {
  profiles: BrokerProfile[];
  operations: BrokerOperationFixture[];
};

function pinnedProfileFor(connectionProvider: string): BrokerProfile | undefined {
  return brokerFixture.profiles.find((p) => p.connection_provider === connectionProvider);
}
function pinnedOperationsFor(connectionProvider: string): BrokerOperationFixture[] {
  return brokerFixture.operations.filter((o) => o.connection_provider === connectionProvider);
}

const registry = loadRegistry();

const LEAD_GOAL =
  "read emails, detect sales leads and write a note to the CRM for each lead";

const LOCAL_RUNNER_RUNTIME: RuntimeOption = {
  id: "dash_agent_runner_local",
  label: "DASH Agent Runner on this computer",
  runtime_class: "local_process",
  reason: "Run the generated code as a local process under the separately installed runner.",
  offline_behavior:
    "Continues after the DASH window closes while this computer and runner remain on.",
  continues_when_dash_closed: true,
  appropriate_when: "The agent should run locally while this computer is on.",
  limitation: "Stops while the computer is asleep or off.",
  availability: "requires setup",
  install_action: null,
};

const DASH_CONTROL_SURFACE: PlacementAxis = {
  recommended: {
    id: "dash_agent_runner_control",
    label: "DASH Agent Runner control adapter",
    appropriate_when: "Control a compatible locally registered process.",
    limitation: "Unavailable while the computer or runner is off.",
    availability: "requires setup",
  },
  alternatives: [],
};

const DASH_INTERACTION_SURFACE: PlacementAxis = {
  recommended: {
    id: "dash_workspace",
    label: "DASH agent workspace",
    appropriate_when: "Inspect safe state and submit declared commands.",
    limitation: "Last safe state is read-only while the runner is unavailable.",
    availability: "requires setup",
  },
  alternatives: [],
};

const MANUAL_RUNNER_TRIGGER: TriggerExplanation = {
  mode: "manual",
  label: "Manual run request",
  what_wakes_it_up: "The runner starts a registered process when a person requests a run.",
  offline_behavior: "No run starts while the computer or runner is off.",
  limitation: "No schedule or inbound event is configured.",
};

function planAndBrief(opts: { dash_broker_available?: boolean }) {
  const plan = planWorkflow({ goal: LEAD_GOAL, must_have_capabilities: [], must_avoid: [] }, registry);
  const wizard = plan.goal_to_product_wizard;
  return exportBuildBrief({
    goal: plan.goal,
    plan_source: plan.plan_source,
    route_status: plan.route_status,
    recommended_route: plan.recommended_route,
    safety_review: plan.safety_review,
    automation_clearance: plan.automation_clearance,
    enforced_approval_gates: plan.enforced_approval_gates,
    untested_edges: plan.untested_edges,
    avoid_when_violations: plan.avoid_when_violations,
    evals_to_add: plan.evals_to_add,
    design_notes: plan.design_notes,
    worker_pipeline: plan.worker_pipeline,
    loop_guidance: plan.loop_guidance,
    approval_gate_advisory: plan.approval_gate_advisory,
    runtime_requirements: wizard.runtime_requirements,
    runtime_recommendation: LOCAL_RUNNER_RUNTIME,
    control_surface: DASH_CONTROL_SURFACE,
    interaction_surface: DASH_INTERACTION_SURFACE,
    trigger_explanation: MANUAL_RUNNER_TRIGGER,
    handoff_targets: ["prompt"],
    playbook_id: plan.playbook?.id ?? "",
    route_id: plan.playbook?.route_id ?? "",
    build_target: "code",
    output_location: "HubSpot notes",
    dash_broker_available: opts.dash_broker_available,
    generated_at: "2026-08-06T00:00:00Z",
    llm_provider: "anthropic",
  });
}

describe("MAR-477 — export_build_brief output vs the pinned DASH broker facts", () => {
  it("sanity: the pinned fixture names google-gmail and nothing else", () => {
    // A canary for the fixture itself drifting silently out of sync with what
    // the rest of this file assumes. If DASH's real profile set ever grows,
    // this is the assertion that forces tests/fixtures/dash/broker-profiles.json
    // to be re-synced deliberately rather than the tests below quietly
    // covering less than they claim to.
    expect(brokerFixture.profiles.map((p) => p.connection_provider)).toEqual(["google-gmail"]);
  });

  it("provider vocabulary: dashManifestProvider spells brokered connections the way DASH's broker recognises them", () => {
    for (const connectionId of dashBrokeredConnectionIds()) {
      const spelled = dashManifestProvider(connectionId);
      expect(
        pinnedProfileFor(spelled),
        `dashManifestProvider(${JSON.stringify(connectionId)}) -> ${JSON.stringify(spelled)}, ` +
          "which is not a provider DASH's broker recognises per the pinned fixture",
      ).toBeDefined();
    }
  });

  it("dash_broker_available + local runtime: every connection matching a pinned DASH profile is dash_managed, and nothing else is", () => {
    const b = planAndBrief({ dash_broker_available: true });
    expect(validateManifest(b.agent_manifest), JSON.stringify(validateManifest.errors)).toBe(true);

    for (const connection of b.agent_manifest.agent_dom.connections) {
      const pinned = pinnedProfileFor(connection.provider);
      if (pinned) {
        expect(
          connection.ownership,
          `${connection.id} (provider=${connection.provider}) matches a pinned DASH broker profile`,
        ).toBe("dash_managed");
      } else {
        expect(
          connection.ownership,
          `${connection.id} (provider=${connection.provider}) matches NO pinned DASH broker profile ` +
            "— claiming dash_managed here is exactly the over-claim MAR-494 exists to prevent",
        ).not.toBe("dash_managed");
      }
    }
  });

  it("without the signal, nothing is dash_managed even though the same connections would match a pinned profile", () => {
    const b = planAndBrief({});
    for (const connection of b.agent_manifest.agent_dom.connections) {
      expect(connection.ownership, connection.id).not.toBe("dash_managed");
    }
  });

  it("broker-profile resolution: the dash_managed gmail connection satisfies resolveGrant's preconditions against the pinned operations", () => {
    const b = planAndBrief({ dash_broker_available: true });
    const gmail = b.agent_manifest.agent_dom.connections.find((c) => c.id === "gmail");
    expect(gmail, "goal names gmail as a connection").toBeDefined();
    expect(gmail?.ownership).toBe("dash_managed");

    // lib/broker/grant.ts's oauthField(): exactly one oauth_reauthorization
    // field, or resolveGrant refuses `no_oauth_field` before it looks at scopes.
    const oauthFields = (gmail?.fields ?? []).filter((f) => f.kind === "oauth_reauthorization");
    expect(oauthFields, "resolveGrant's oauthField() requires exactly one").toHaveLength(1);

    const declaredScopes = new Set(oauthFields[0]?.technical?.provider_scopes ?? []);
    const pinnedOps = pinnedOperationsFor(gmail!.provider);
    expect(pinnedOps.length, `DASH has operations for ${gmail!.provider}`).toBeGreaterThan(0);

    // resolveGrant's grant loop (lib/broker/grant.ts): an operation is a
    // candidate only when every required scope is in the manifest's declared
    // scopes. At least one pinned operation must clear that bar, or DASH
    // returns `no_operations_granted` — a connection that renders as
    // "connected" while every call is refused.
    const grantable = pinnedOps.filter((op) => op.required_scopes.every((s) => declaredScopes.has(s)));
    expect(
      grantable.map((op) => op.id),
      "at least one DASH operation's required_scopes must be a subset of the declared OAuth scopes",
    ).not.toHaveLength(0);
    expect(grantable.some((op) => op.id === "gmail.search")).toBe(true);
  });

  it("a provider DASH does not name (hubspot) never gets exactly-one-oauth-field dash_managed treatment", () => {
    const b = planAndBrief({ dash_broker_available: true });
    const hubspot = b.agent_manifest.agent_dom.connections.find((c) => c.id === "hubspot");
    expect(hubspot, "goal names hubspot as a connection").toBeDefined();
    expect(pinnedProfileFor(hubspot!.provider), "hubspot has no pinned DASH broker profile").toBeUndefined();
    expect(hubspot?.ownership).not.toBe("dash_managed");
  });
});
