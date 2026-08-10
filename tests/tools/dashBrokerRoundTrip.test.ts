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
  AI_PROVIDER_IDS,
} from "../../src/lib/dashBrokerCatalog.js";
import {
  CONNECTOR_KINDS_V1,
  PANEL_SECTION_TYPES_V1,
  type AgentDomConnectionRequirements,
  type AgentDomPanel,
} from "../../src/lib/observabilityContract.js";

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

type TaskInputRoleFixture = {
  id: string;
  label: string;
  description?: string;
  required: boolean;
  min_count?: number;
  max_count?: number;
  media_types?: string[];
};

function planAndBrief(opts: {
  dash_broker_available?: boolean;
  task_inputs?: TaskInputRoleFixture[];
  agent_panel?: AgentDomPanel;
  connection_requirements?: AgentDomConnectionRequirements;
  output_location?: string;
}) {
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
    output_location: opts.output_location ?? "HubSpot notes",
    dash_broker_available: opts.dash_broker_available,
    task_inputs: opts.task_inputs,
    agent_panel: opts.agent_panel,
    connection_requirements: opts.connection_requirements,
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
      // MAR-596/F14: the AI-provider connection is legitimately dash_managed
      // through a wholly separate DASH subsystem — lib/ai/providers.ts's
      // AI-key vault (MAR-582), not the OAuth broker lib/broker/providers.ts
      // this fixture pins. It has its own dedicated assertions in the
      // MAR-596/F14 describe block below, scoped to AI_PROVIDER_IDS rather
      // than folded into a fixture that only ever named "google-gmail".
      if ((AI_PROVIDER_IDS as readonly string[]).includes(connection.provider)) continue;
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

/**
 * MAR-507 companion — export_build_brief emitting `agent_dom.task_inputs`.
 *
 * DASH's own `tests/inputs-panel.test.ts` (orchestratedash, MAR-507) proves
 * its Inputs panel against a literal `DECLARING` fixture of two roles —
 * `customer_brief` and `price_list`, the MAR-434 golden journey ("turn a
 * customer brief and a price list into an offert"). The roles below use the
 * SAME ids, labels, description and media types on purpose: this is the MCP
 * half of that same journey, and reusing DASH's own literal is what makes the
 * two repos' independent tests point at one shared golden case rather than
 * two similar-looking ones that could quietly drift apart.
 *
 * Like the broker-facts assertions above, the schema check here is run
 * against `tests/fixtures/dash/agent.manifest.v2.schema.json` — DASH's real
 * pinned contract, not a local approximation of it.
 */
describe("MAR-507 companion — export_build_brief emits task_inputs against DASH's pinned schema", () => {
  const GOLDEN_ROLES: TaskInputRoleFixture[] = [
    {
      id: "customer_brief",
      label: "Customer brief",
      description: "The document describing what the customer asked for.",
      required: true,
      max_count: 1,
      media_types: ["application/pdf", "text/plain"],
    },
    {
      id: "price_list",
      label: "Price list",
      required: false,
      max_count: 3,
    },
  ];

  it("honest absence: a plan that declares no roles omits agent_dom.task_inputs entirely", () => {
    const b = planAndBrief({});
    expect(validateManifest(b.agent_manifest), JSON.stringify(validateManifest.errors)).toBe(true);
    // Not an empty array — DASH's own buildInputRoles() treats absence and an
    // empty declaration the same on screen, but the schema's own warning is
    // that absence must never be read as an unrestricted agent, so the
    // emitter does not manufacture a block nothing declared.
    expect("task_inputs" in b.agent_manifest.agent_dom).toBe(false);
  });

  it("the golden case: declared roles round-trip into agent_dom.task_inputs and validate against DASH's schema", () => {
    const b = planAndBrief({ task_inputs: GOLDEN_ROLES });
    expect(validateManifest(b.agent_manifest), JSON.stringify(validateManifest.errors)).toBe(true);
    expect(b.agent_manifest.agent_dom.task_inputs).toEqual(GOLDEN_ROLES);
  });

  it("an id DASH's own pattern would refuse fails the pinned schema, not just a local check", () => {
    // `exportBuildBrief` is a plain deterministic function with no zod layer
    // of its own — the MCP tool's registerTool wrapper is what enforces the
    // taskInputRole id pattern on a real call. This asserts the pinned AJV
    // schema is a second, independent backstop: a manifest that slipped an
    // id DASH would show to a person (the exact leak `lib/copy/identifiers.ts`
    // exists to prevent) fails validation here rather than shipping.
    const b = planAndBrief({
      task_inputs: [{ id: "Customer Brief", label: "Customer brief", required: true }],
    });
    expect(validateManifest(b.agent_manifest)).toBe(false);
  });
});

/**
 * ADR 0008 slice 4 (MAR-555) — export_build_brief emitting `agent_dom.panel`.
 *
 * The panel is a DECLARATION DASH renders with its own trusted components, so
 * the only thing the MCP can get wrong is the shape and the honesty of the
 * default. Both are checked here against DASH's pinned contract rather than
 * the MCP's own idea of it, the same standard the `task_inputs` block above
 * holds itself to.
 *
 * The two panels below are the ones MAR-548's two shipped sample agents would
 * declare — `ai-agent-news` and `gmail-meeting-assistant`. They remain AUTHOR
 * declarations and override the MAR-596 default, which is deliberately limited
 * to DASH-observed run facts and binds no artifact role.
 * `digest` and `draft` are the two artifact kinds DASH's own
 * `describeArtifactRole` (`lib/copy/artifacts.ts`) names today; the rest bind
 * to roles those builds give their own outputs.
 */
describe("MAR-555 — export_build_brief emits agent_dom.panel against DASH's pinned schema", () => {
  /** MAR-548 sample agent 1: the credential-free AI news scout. The ADR's own worked example. */
  const NEWS_SCOUT_PANEL: AgentDomPanel = {
    panel_version: 1,
    title: "Today's AI news",
    sections: [{ id: "latest_digest", type: "report", label: "Latest digest", artifact_role: "digest" }],
  };

  /** MAR-548 sample agent 2: the everything-agent, exercising all five section types at once. */
  const MEETING_ASSISTANT_PANEL: AgentDomPanel = {
    panel_version: 1,
    title: "Meeting assistant",
    sections: [
      { id: "latest_draft", type: "report", label: "Latest draft reply", artifact_role: "draft" },
      { id: "recent_drafts", type: "outputs", label: "Recent drafts", artifact_role: "draft", max_items: 5 },
      {
        id: "proposed_times",
        type: "table",
        label: "Times it proposed",
        source_role: "proposed_times",
        columns: [
          { key: "starts_at", label: "Starts", kind: "timestamp" },
          { key: "duration_minutes", label: "Minutes", kind: "number" },
          { key: "attendee", label: "With", kind: "text" },
        ],
      },
      {
        id: "activity",
        type: "metrics",
        label: "Activity",
        items: [
          { id: "runs", label: "Runs", source: { kind: "dash_fact", fact: "run_count" } },
          { id: "last_run", label: "Last run", source: { kind: "dash_fact", fact: "last_run_at" } },
          {
            id: "drafts_written",
            label: "Drafts written",
            source: { kind: "artifact_field", artifact_role: "draft", field: "draft_count" },
          },
        ],
      },
      {
        id: "sending_note",
        type: "note",
        label: "About sending",
        text: "This agent writes drafts and never sends them. Send is yours.",
      },
    ],
  };

  it("by-value pin: PANEL_SECTION_TYPES_V1 is exactly DASH's closed v1 section enum", () => {
    // The panel's entire security argument is that what it can make DASH draw
    // is one closed union readable in a single sitting. A vocabulary this repo
    // re-derived from the fixture would widen the moment DASH widened it,
    // silently. This is the review step, and it fails on the fixture re-sync
    // rather than at somebody's import.
    const schema = loadFixtureJson("agent.manifest.v2.schema.json") as {
      $defs: { panelSectionV1: { properties: { type: { enum: string[] } } } };
    };
    expect([...PANEL_SECTION_TYPES_V1]).toEqual(schema.$defs.panelSectionV1.properties.type.enum);
  });

  it("MAR-596 default: a plan with no authored panel gets DASH-fact run history", () => {
    const b = planAndBrief({});
    expect(validateManifest(b.agent_manifest), JSON.stringify(validateManifest.errors)).toBe(true);
    expect(b.agent_manifest.agent_dom.panel?.panel_version).toBe(1);
    const section = b.agent_manifest.agent_dom.panel?.sections[0];
    expect(section).toMatchObject({ id: "run_history", type: "metrics" });
    expect(section && "items" in section ? section.items : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "run_count",
          source: { kind: "dash_fact", fact: "run_count" },
        }),
        expect.objectContaining({
          id: "last_run_at",
          source: { kind: "dash_fact", fact: "last_run_at" },
        }),
        expect.objectContaining({
          id: "last_run_verdict",
          source: { kind: "dash_fact", fact: "last_run_verdict" },
        }),
      ]),
    );
  });

  it("keeps MAR-555's artifact-binding refusal: output_location does not become a report role", () => {
    // ADR 0008 PERMITS deriving one `report` section from an output_location.
    // docs/ADR-MAR-555-agent-panel-emission.md declines it: `report` requires
    // an `artifact_role`, a role is a name the agent's RUNTIME gives what it
    // writes, and an output_location is free text naming a destination. This
    // MAR-596 can still populate the panel with DASH's own facts because that
    // declares no artifact. The location must not leak into any section.
    const b = planAndBrief({ output_location: "HubSpot notes + Gmail drafts" });
    expect(b.agent_manifest.monitoring.output_location).toBe("HubSpot notes + Gmail drafts");
    expect(b.agent_manifest.agent_dom.panel?.sections).toHaveLength(1);
    expect(JSON.stringify(b.agent_manifest.agent_dom.panel)).not.toContain("HubSpot");
    expect(JSON.stringify(b.agent_manifest.agent_dom.panel)).not.toContain("artifact_role");
  });

  it("never an empty object: a panel with no sections is refused by DASH's own schema", () => {
    // Why the emit is conditional rather than defaulted. `{}` is not a
    // quieter version of absence — `panel_version` and `sections` are both
    // required, so an emitter that reached for a placeholder would ship a
    // manifest DASH refuses at import.
    const b = planAndBrief({});
    const withEmptyPanel = {
      ...b.agent_manifest,
      agent_dom: { ...b.agent_manifest.agent_dom, panel: {} },
    };
    expect(validateManifest(withEmptyPanel)).toBe(false);
  });

  it("MAR-548 sample agent 1 (ai-agent-news): the declared report panel round-trips verbatim", () => {
    const b = planAndBrief({ agent_panel: NEWS_SCOUT_PANEL });
    expect(validateManifest(b.agent_manifest), JSON.stringify(validateManifest.errors)).toBe(true);
    expect(b.agent_manifest.agent_dom.panel).toEqual(NEWS_SCOUT_PANEL);
  });

  it("MAR-548 sample agent 2 (gmail-meeting-assistant): all five section types validate at once", () => {
    const b = planAndBrief({ agent_panel: MEETING_ASSISTANT_PANEL });
    expect(validateManifest(b.agent_manifest), JSON.stringify(validateManifest.errors)).toBe(true);
    expect(b.agent_manifest.agent_dom.panel).toEqual(MEETING_ASSISTANT_PANEL);
    // Coverage claim asserted rather than assumed: this fixture really does
    // exercise every member of the closed vocabulary.
    const declared = new Set(MEETING_ASSISTANT_PANEL.sections.map((s) => s.type));
    expect([...PANEL_SECTION_TYPES_V1].every((t) => declared.has(t))).toBe(true);
  });

  it("a newer panel version travels intact and is checked structurally, not against v1's enum", () => {
    const newer: AgentDomPanel = {
      panel_version: 2,
      sections: [{ id: "conversation", type: "conversation", label: "Talk to it" }],
    };
    const b = planAndBrief({ agent_panel: newer });
    expect(validateManifest(b.agent_manifest), JSON.stringify(validateManifest.errors)).toBe(true);
    expect(b.agent_manifest.agent_dom.panel).toEqual(newer);
  });

  it("a section type outside the closed enum fails the pinned schema, not just the zod layer", () => {
    // `exportBuildBrief` is a plain deterministic function with no zod of its
    // own — the registerTool wrapper enforces AgentPanelInputShape on a real
    // call (tests/tools/exportBuildBrief.test.ts). This asserts DASH's own
    // schema is a second, independent backstop for the same refusal, so a
    // typo'd type cannot reach an import by slipping past one layer.
    const b = planAndBrief({
      agent_panel: {
        panel_version: 1,
        sections: [{ id: "chart", type: "chart", label: "Chart" }],
      } as unknown as AgentDomPanel,
    });
    expect(validateManifest(b.agent_manifest)).toBe(false);
  });
});

/**
 * MAR-569 — export_build_brief emitting `agent_dom.connection_requirements`.
 *
 * The one thing this block exists to prove is the trap the MAR-569 coordinator
 * named: a v1 requirement's `connection_id` must match an id this same
 * export's `agent_dom.connections[]` ACTUALLY declares, or DASH resolves the
 * line to `connection_not_declared` and draws no Connect button. Every join
 * assertion below reads `b.agent_manifest.agent_dom.connections` from a real
 * `exportBuildBrief` call over `LEAD_GOAL` — never a hand-written fixture list
 * of connection ids — so a future change to what the route connects (adding,
 * renaming, or dropping a connection) cannot leave this test silently
 * checking a join that no longer describes reality.
 */
describe("MAR-569 — export_build_brief emits agent_dom.connection_requirements against DASH's pinned schema", () => {
  it("by-value pin: CONNECTOR_KINDS_V1 is exactly DASH's closed v1 connector_kind enum", () => {
    const schema = loadFixtureJson("agent.manifest.v2.schema.json") as {
      $defs: { connectionRequirementV1: { properties: { connector_kind: { enum: string[] } } } };
    };
    expect([...CONNECTOR_KINDS_V1]).toEqual(schema.$defs.connectionRequirementV1.properties.connector_kind.enum);
  });

  it("honest absence: a plan that declares no connection requirements omits agent_dom.connection_requirements entirely", () => {
    const b = planAndBrief({});
    expect(validateManifest(b.agent_manifest), JSON.stringify(validateManifest.errors)).toBe(true);
    expect("connection_requirements" in b.agent_manifest.agent_dom).toBe(false);
  });

  it("MAR-596 derives the Gmail requirement when the same export declares it DASH-managed", () => {
    const b = planAndBrief({ dash_broker_available: true });
    expect(validateManifest(b.agent_manifest), JSON.stringify(validateManifest.errors)).toBe(true);
    expect(b.agent_manifest.agent_dom.connection_requirements).toEqual({
      requirements_version: 1,
      requirements: [
        {
          id: "gmail_connection",
          name: "Your Gmail",
          connector_kind: "google_oauth_broker",
          connection_id: "gmail",
          why: "Read your inbox; Write drafts (never send)",
        },
        {
          // MAR-596/F14: LEAD_GOAL is AI-backed and this suite's planAndBrief
          // always supplies llm_provider: "anthropic", so the same
          // dash_broker_available signal also derives the AI-key requirement.
          // Dedicated F14 assertions live in the MAR-596/F14 describe block
          // below; this confirms it does not disturb Gmail's own derivation.
          id: "anthropic_connection",
          name: "Your Anthropic",
          connector_kind: "api_key",
          connection_id: "anthropic",
          why: "Answer this agent's AI-backed steps",
        },
      ],
    });
    const liveIds = new Set(b.agent_manifest.agent_dom.connections.map((connection) => connection.id));
    expect(liveIds.has("gmail")).toBe(true);
  });

  it("never an empty object: DASH's own schema refuses requirements_version with no requirements array member", () => {
    const b = planAndBrief({});
    const withEmpty = {
      ...b.agent_manifest,
      agent_dom: { ...b.agent_manifest.agent_dom, connection_requirements: {} },
    };
    expect(validateManifest(withEmpty)).toBe(false);
  });

  it("THE TRAP, positive form: every requirement's connection_id is found among the REAL emitted agent_dom.connections[].id, not a fixture list", () => {
    const b = planAndBrief({});
    const emittedConnectionIds = b.agent_manifest.agent_dom.connections.map((c) => c.id);
    expect(emittedConnectionIds, "LEAD_GOAL must actually emit a gmail connection for this suite to mean anything").toContain("gmail");

    const requirements: AgentDomConnectionRequirements = {
      requirements_version: 1,
      requirements: [
        {
          id: "gmail_signin",
          name: "Your Gmail",
          connector_kind: "google_oauth_broker",
          connection_id: "gmail",
        },
      ],
    };
    const withRequirements = planAndBrief({ connection_requirements: requirements });
    expect(validateManifest(withRequirements.agent_manifest), JSON.stringify(validateManifest.errors)).toBe(true);
    expect(withRequirements.agent_manifest.agent_dom.connection_requirements).toEqual(requirements);
    // The join, asserted against this call's OWN emitted output.
    const liveIds = new Set(withRequirements.agent_manifest.agent_dom.connections.map((c) => c.id));
    for (const requirement of requirements.requirements) {
      expect(liveIds.has(requirement.connection_id), requirement.connection_id).toBe(true);
    }
  });

  it("THE TRAP, negative form: a connection_id absent from the real emitted agent_dom.connections is refused, not silently exported", () => {
    const b = planAndBrief({});
    const emittedConnectionIds = new Set(b.agent_manifest.agent_dom.connections.map((c) => c.id));
    expect(emittedConnectionIds.has("notion"), "the fixture goal must not coincidentally connect notion").toBe(false);

    const requirements: AgentDomConnectionRequirements = {
      requirements_version: 1,
      requirements: [
        { id: "notion_signin", name: "A Notion workspace", connector_kind: "api_key", connection_id: "notion" },
      ],
    };
    expect(() => planAndBrief({ connection_requirements: requirements })).toThrow(/connection_requirements/);
  });

  it("a requirement naming a real connection (hubspot) under the api_key kind round-trips and validates", () => {
    const requirements: AgentDomConnectionRequirements = {
      requirements_version: 1,
      requirements: [
        {
          id: "hubspot_key",
          name: "Your HubSpot API key",
          connector_kind: "api_key",
          connection_id: "hubspot",
          operations: ["hubspot.notes.write"],
          optional: false,
          why: "Writes a note to the CRM for each detected lead.",
        },
      ],
    };
    const b = planAndBrief({ connection_requirements: requirements });
    expect(validateManifest(b.agent_manifest), JSON.stringify(validateManifest.errors)).toBe(true);
    expect(b.agent_manifest.agent_dom.connection_requirements).toEqual(requirements);
  });

  it("a newer requirements_version travels intact and is checked structurally, not against v1's enum", () => {
    const newer: AgentDomConnectionRequirements = {
      requirements_version: 2,
      requirements: [{ id: "notion_signin", name: "A Notion workspace", connector_kind: "mcp_server" }],
    };
    // Deliberately references an id ("notion_signin", not a connection_id) DASH
    // never joins against for a non-v1 declaration — the opaque branch carries
    // no requirements to place buttons beside at all, so the join guard is a
    // v1-only rule and must not fire here.
    const b = planAndBrief({ connection_requirements: newer });
    expect(validateManifest(b.agent_manifest), JSON.stringify(validateManifest.errors)).toBe(true);
    expect(b.agent_manifest.agent_dom.connection_requirements).toEqual(newer);
  });

  it("a connector_kind outside the closed v1 enum fails the pinned schema, not just the zod layer", () => {
    // exportBuildBrief is a plain deterministic function with no zod of its
    // own — the registerTool wrapper enforces the closed enum on a real call
    // (tests/tools/exportBuildBrief.test.ts). This asserts DASH's own schema
    // is a second, independent backstop for the same refusal, on the exact
    // kind Henrik ruled out (MAR-569 comment thread): mcp_server under v1.
    const requirements = {
      requirements_version: 1,
      requirements: [
        { id: "host_connect", name: "A deploy host", connector_kind: "mcp_server", connection_id: "gmail" },
      ],
    } as unknown as AgentDomConnectionRequirements;
    const b = planAndBrief({ connection_requirements: requirements });
    expect(validateManifest(b.agent_manifest)).toBe(false);
  });
});

/**
 * MAR-596/F14 (coordinator relay, PR #183; DASH ADR 0013) — the held item:
 * an emitted agent with an AI-backed step declares a real DASH AI-key
 * connection (MAR-582), on the same v1 connection_requirements join MAR-578
 * already enforces for every other DASH-managed connection. ADR 0013 settled
 * that this needs no schema change; these assertions run through the exact
 * public `export_build_brief` surface a caller uses, validated against DASH's
 * own pinned schema, not against fixtures describing the MCP's own claims.
 */
describe("MAR-596/F14 — export_build_brief declares an AI-provider connection for AI-backed steps", () => {
  it("presence: an AI-backed export with dash_broker_available names a real DASH AI provider, dash_managed, one secret field, no env-var delivery", () => {
    // LEAD_GOAL is AI-backed (asserted by observabilityManifest.test.ts's own
    // MAR-583 coverage) and this file's planAndBrief always chooses
    // llm_provider: "anthropic" — DASH's own connection_provider spelling,
    // unchanged.
    const b = planAndBrief({ dash_broker_available: true });
    expect(validateManifest(b.agent_manifest), JSON.stringify(validateManifest.errors)).toBe(true);

    const ai = b.agent_manifest.agent_dom.connections.find((c) => c.id === "anthropic");
    expect(ai, "an AI-backed, dash_broker_available export must declare the AI-provider connection").toBeDefined();
    expect(ai?.provider).toBe("anthropic");
    expect(AI_PROVIDER_IDS as readonly string[]).toContain(ai?.provider);
    expect(ai?.ownership).toBe("dash_managed");
    expect(ai?.fields).toHaveLength(1);
    expect(ai?.fields[0]?.kind).toBe("secret");
    // The DASH-side trap: `resolveCredentialTarget` refuses
    // `brokered_provider_delivery` when an AI-provider secret field ALSO
    // declares technical.environment_name. DASH's broker holds the key and
    // answers on the agent's behalf; it never hands the key back as an env
    // var, unlike every agent-managed credential field this repo emits.
    expect(ai?.fields[0]?.technical?.environment_name).toBeUndefined();

    const requirement = b.agent_manifest.agent_dom.connection_requirements?.requirements.find(
      (r) => "connection_id" in r && r.connection_id === "anthropic",
    );
    expect(requirement, "MAR-578's join: a dash_managed connection with a secret field derives an api_key requirement").toBeDefined();
    expect(requirement).toMatchObject({ connector_kind: "api_key", connection_id: "anthropic" });
  });

  it("absence: without dash_broker_available, no AI-provider connection is declared even though the step is AI-backed", () => {
    const b = planAndBrief({});
    expect(b.agent_manifest.agent_dom.connections.some((c) => c.id === "anthropic")).toBe(false);
  });
});
