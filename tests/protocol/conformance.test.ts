/**
 * Protocol conformance fixtures (MAR-459).
 *
 * One fixture per PINNED cell of `conformanceMatrix.ts`. Every fixture drives
 * the real `createMcpHandler` — the object `src/server-http.ts` and
 * `src/worker.ts` serve — at one specific revision, so a green cell means a
 * real client speaking that revision gets that behavior.
 *
 * Each test name embeds `[conformance <revision> <behavior>]`. That token is
 * the ONLY binding between a fixture and its matrix cell:
 * `scripts/conformance-matrix.ts` reads the vitest JSON report, maps tokens
 * back to cells, and fails when a pinned cell has no executing fixture. A cell
 * therefore cannot be published as conformant by declaration alone — deleting
 * or skipping a fixture turns its cell `unproven` and fails the gate, rather
 * than leaving a stale ✅ behind.
 *
 * This suite generalizes `dualEra.test.ts` (MAR-448), which pins the same
 * boundary for the two ERAS. That file stays as the MAR-448 regression; this
 * one is per REVISION.
 */
import { describe, it, expect, afterAll } from "vitest";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/server";
import {
  PINNED_REVISIONS,
  BEHAVIORS,
  declarationFor,
  fixtureToken,
  MODERN_ERA_REVISIONS,
} from "./conformanceMatrix.js";
import {
  handler,
  post,
  postLegacy,
  postModern,
  postRaw,
  postBatch,
  notify,
  initialize,
  requestMethod,
  modernEnvelope,
  toolNames,
  eraOf,
  MODERN_REVISION,
} from "./handlerHarness.js";

afterAll(async () => {
  await handler.close();
});

/** The capability set `src/mcpServer.ts` produces: tools + resources, nothing else. */
const ADVERTISED_CAPABILITIES = {
  tools: { listChanged: true },
  resources: { listChanged: true },
};

/** A playbook that exists in the registry — used for the structured-output and resource fixtures. */
const KNOWN_PLAYBOOK = "codebase_agent_workflow";
const KNOWN_RESOURCE_URI = `orchestratekit://playbooks/${KNOWN_PLAYBOOK}`;

/**
 * Methods behind capabilities this server does not advertise. Serving any of
 * them would make the capability handshake a lie in the other direction.
 *
 * `subscriptions/listen` is deliberately absent: the SDK routes it at the
 * modern era before any capability check, so it is not evidence about this
 * server's honesty either way.
 */
const UNDECLARED_METHODS: Record<string, Record<string, unknown>> = {
  "prompts/list": {},
  "logging/setLevel": { level: "info" },
  "completion/complete": {},
};

const MODERN_ONLY_UNDECLARED_METHODS: Record<string, Record<string, unknown>> = {
  "tasks/list": {},
  "tasks/get": { taskId: "never-created" },
};

/** The tool surface every revision must agree on, read once from the modern era. */
async function modernToolDefinitions(): Promise<unknown[]> {
  const response = await postModern("tools/list");
  return response.body?.result?.tools ?? [];
}

describe("claimed revisions (MAR-459)", () => {
  it("pins exactly the legacy revisions the SDK will negotiate", () => {
    const pinnedLegacy = PINNED_REVISIONS.filter((r) => r.era === "legacy").map((r) => r.id);
    expect([...pinnedLegacy].sort()).toEqual([...SUPPORTED_PROTOCOL_VERSIONS].sort());
  });

  it("pins exactly the modern revisions the live server advertises", async () => {
    const { body } = await postModern("server/discover");
    expect([...body?.result?.supportedVersions].sort()).toEqual([...MODERN_ERA_REVISIONS].sort());
  });

  it("declares every (revision × behavior) cell explicitly", () => {
    for (const revision of PINNED_REVISIONS) {
      for (const behavior of BEHAVIORS) {
        expect(() => declarationFor(revision.id, behavior.id)).not.toThrow();
      }
    }
  });
});

for (const revision of PINNED_REVISIONS) {
  const id = revision.id;
  const era = eraOf(id);
  const modern = era === "modern";
  const token = (behaviorId: string): string => fixtureToken(id, behaviorId);

  describe(`revision ${id} (${era} era)`, () => {
    it(`${token("negotiation")} answers at the requested revision and names it back`, async () => {
      if (modern) {
        const { body } = await postModern("server/discover", {}, id);
        expect(body?.result?.supportedVersions).toContain(id);
        expect(body?.result?.instructions).toContain("OrchestrateMCP");

        // The modern era REFUSES what it cannot serve rather than substituting.
        const rejected = await postModern("tools/list", {}, "1900-01-01");
        expect(rejected.body?.error?.code).toBe(-32022);
        expect(rejected.body?.error?.data?.requested).toBe("1900-01-01");
        expect(rejected.body?.error?.data?.supported).toContain(MODERN_REVISION);
        return;
      }

      const { body } = await initialize(id);
      // Echoed EXACTLY: no silent upgrade to the newest legacy revision, which
      // is the failure mode a client cannot detect.
      expect(body?.result?.protocolVersion).toBe(id);
      expect(body?.result?.serverInfo).toMatchObject({ name: "orchestratekit-mcp" });

      if (id === "2025-11-25") {
        // The 2025-era handshake prescribes offering your own revision rather
        // than refusing; 2025-11-25 is the revision that offer lands on.
        const unknown = await postLegacy(id, "initialize", {
          protocolVersion: "1900-01-01",
          capabilities: {},
          clientInfo: { name: "orchestratekit-conformance", version: "1.0" },
        });
        expect(unknown.body?.result?.protocolVersion).toBe("2025-11-25");
      }
    });

    it(`${token("capabilities")} advertises tools and resources and claims nothing else`, async () => {
      const { body } = modern ? await postModern("server/discover", {}, id) : await initialize(id);
      expect(body?.result?.capabilities).toEqual(ADVERTISED_CAPABILITIES);
    });

    it(`${token("capability-honesty")} refuses every method behind an undeclared capability`, async () => {
      const methods = {
        ...UNDECLARED_METHODS,
        ...(modern ? MODERN_ONLY_UNDECLARED_METHODS : {}),
      };
      for (const [method, params] of Object.entries(methods)) {
        const { body } = await post(id, method, params);
        expect(body?.error?.code, `${method} at ${id}`).toBe(-32601);
        expect(body?.result, `${method} at ${id}`).toBeUndefined();
      }
    });

    it(`${token("tools-surface")} serves the same tool definitions, in the same order, as every other revision`, async () => {
      const reference = await modernToolDefinitions();
      const response = await post(id, "tools/list");
      const tools = response.body?.result?.tools ?? [];

      // Deep equality, not just names: a revision that quietly dropped a
      // description or an annotation would still pass a names-only check.
      expect(tools).toEqual(reference);
      expect(toolNames(response)).toContain("plan_workflow");
      expect(toolNames(response)).toContain("health_check");

      // Registration order is curated and fixed, so it must be reproducible.
      const second = await post(id, "tools/list");
      expect(toolNames(second)).toEqual(toolNames(response));
    });

    it(`${token("tool-schemas")} carries 2020-12 input schemas and returns structuredContent where declared`, async () => {
      const tools = (await post(id, "tools/list")).body?.result?.tools ?? [];
      expect(tools.length).toBeGreaterThan(0);

      for (const tool of tools) {
        expect(tool.inputSchema?.type, `${tool.name} at ${id}`).toBe("object");
        // `health_check` takes no arguments, and an argument-free schema
        // carries no `$schema` keyword. Every schema that DOES declare a
        // dialect must declare 2020-12 — a mixed-dialect tool list is the
        // drift this pins.
        if (tool.inputSchema?.$schema !== undefined) {
          expect(tool.inputSchema.$schema, `${tool.name} at ${id}`).toBe(
            "https://json-schema.org/draft/2020-12/schema",
          );
        }
      }
      expect(
        tools.some(
          (tool: { inputSchema?: { $schema?: string } }) =>
            tool.inputSchema?.$schema === "https://json-schema.org/draft/2020-12/schema",
        ),
      ).toBe(true);

      // `get_playbook` declares an outputSchema, so its result must carry the
      // structured half — at EVERY revision, including the 2024-era ones where
      // the field postdates the specification (a recorded leniency).
      const withOutputSchema = tools.find((tool: { name: string }) => tool.name === "get_playbook");
      expect(withOutputSchema?.outputSchema).toBeDefined();

      const called = await post(id, "tools/call", {
        name: "get_playbook",
        arguments: { playbook_id: KNOWN_PLAYBOOK },
      });
      expect(called.body?.result?.structuredContent).toBeDefined();
      expect(called.body?.result?.content?.[0]?.type).toBe("text");
    });

    it(`${token("errors")} uses the JSON-RPC error vocabulary and keeps tool failures in the result`, async () => {
      const unknownMethod = await post(id, "orchestrate/not-a-method");
      expect(unknownMethod.body?.error?.code).toBe(-32601);

      const unknownTool = await post(id, "tools/call", {
        name: "no_such_tool",
        arguments: {},
      });
      expect(unknownTool.body?.error?.code).toBe(-32602);

      const unknownResource = await post(id, "resources/read", {
        uri: "orchestratekit://playbooks/no_such_playbook",
      });
      expect(unknownResource.body?.error?.code).toBe(-32602);

      // A tool that rejects its arguments is a TOOL failure, not a protocol
      // failure: it comes back as a successful JSON-RPC result carrying
      // isError, so the model can read and recover from it.
      const badArguments = await post(id, "tools/call", {
        name: "get_graph_component",
        arguments: {},
      });
      expect(badArguments.body?.error).toBeUndefined();
      expect(badArguments.body?.result?.isError).toBe(true);
      expect(badArguments.body?.result?.content?.[0]?.text).toContain("validation error");
    });

    it(`${token("era-fields")} carries the 2026-era result fields only in the modern era`, async () => {
      const list = await post(id, "tools/list");
      const read = await post(id, "resources/read", { uri: KNOWN_RESOURCE_URI });

      if (modern) {
        expect(list.body?.result?.resultType).toBe("complete");
        expect(list.body?.result?._meta?.["io.modelcontextprotocol/serverInfo"]).toMatchObject({
          name: "orchestratekit-mcp",
        });
        // Not the SDK's conservative default: the registry is a build-time
        // frozen snapshot, so this server can promise a real cache policy.
        expect(list.body?.result?.ttlMs).toBeGreaterThan(0);
        expect(list.body?.result?.cacheScope).toBe("public");
        expect(read.body?.result?.ttlMs).toBeGreaterThan(0);
        return;
      }

      for (const result of [list.body?.result, read.body?.result]) {
        expect(result).not.toHaveProperty("resultType");
        expect(result).not.toHaveProperty("ttlMs");
        expect(result).not.toHaveProperty("cacheScope");
        expect(result).not.toHaveProperty("_meta");
      }
    });

    it(`${token("cancellation")} accepts a cancellation notification and keeps serving`, async () => {
      const cancelled = await notify(id, "notifications/cancelled", {
        requestId: "never-issued",
        reason: "conformance fixture",
      });

      // A notification is accepted and never answered — an unknown request id
      // must be ignored, not turned into an error response the client would
      // have no id to match.
      expect(cancelled.status).toBe(202);
      expect(cancelled.messages).toHaveLength(0);
      expect(cancelled.raw.trim()).toBe("");

      const after = await post(id, "tools/list");
      expect(toolNames(after)).toContain("plan_workflow");
    });

    it(`${token("batching")} answers legacy batches and refuses modern ones`, async () => {
      if (modern) {
        const batch = await postBatch(id, ["tools/list", "tools/list"]);
        expect(batch.status).toBe(400);
        expect(batch.body?.error?.code).toBe(-32600);
        expect(batch.body?.error?.message).toContain(MODERN_REVISION);
        return;
      }

      const batch = await postBatch(id, ["ping", "ping"]);
      expect(batch.status).toBe(200);
      expect(batch.messages).toHaveLength(2);
      expect(batch.messages.map((message) => message.id)).toEqual([1, 2]);
      for (const message of batch.messages) {
        expect(message.error).toBeUndefined();
      }
    });

    it(`${token("transport")} enforces the Streamable HTTP boundary`, async () => {
      // Sessions were removed in 2026-07-28 and this server never used them,
      // so the 2025 session verbs are refused at every revision.
      expect((await requestMethod("GET")).status).toBe(405);
      expect((await requestMethod("DELETE")).status).toBe(405);

      // The modern era rejects a request whose MCP-* headers disagree with (or
      // are missing from) the body BEFORE it looks at anything else, so the
      // era-neutral cases below have to carry era-appropriate routing headers
      // to reach the check they are actually about.
      const routing: Record<string, string> = modern
        ? {
            "MCP-Protocol-Version": id,
            "Mcp-Method": "tools/list",
            "Mcp-Name": "orchestratekit-conformance",
          }
        : { "MCP-Protocol-Version": id };
      const listBody = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: modern ? { _meta: modernEnvelope(id) } : {},
      });

      // Accept negotiation is itself an era boundary. The 2025-era Streamable
      // HTTP transport may answer either JSON or an SSE stream, so it demands
      // the client accept BOTH — even `*/*` is refused. 2026-07-28 always
      // answers plain JSON on this path, so it does not gate on Accept at all.
      for (const accept of ["text/plain", "*/*"]) {
        const response = await postRaw(
          { ...routing, "Content-Type": "application/json", Accept: accept },
          listBody,
        );
        if (modern) {
          expect(response.status, `modern Accept: ${accept}`).toBe(200);
          expect(response.body?.result?.tools, `modern Accept: ${accept}`).toBeDefined();
        } else {
          expect(response.status, `legacy Accept: ${accept}`).toBe(406);
        }
      }

      const badContentType = await postRaw(
        {
          ...routing,
          "Content-Type": "text/plain",
          Accept: "application/json, text/event-stream",
        },
        listBody,
      );
      expect(badContentType.status).toBe(415);

      const acceptedHeaders = {
        ...routing,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      };

      // Unparseable and parseable-but-not-JSON-RPC are different faults and
      // get different codes; collapsing them would hide a codec regression.
      const unparseable = await postRaw(acceptedHeaders, "not json at all");
      expect(unparseable.status).toBe(400);
      expect(unparseable.body?.error?.code).toBe(-32700);

      const notJsonRpc = await postRaw(acceptedHeaders, JSON.stringify({ hello: "world" }));
      expect(notJsonRpc.status).toBe(400);
      expect(notJsonRpc.body?.error?.code).toBe(-32600);

      if (!modern) return;

      // SEP-2243: the MCP-* headers exist so an intermediary can route without
      // parsing the body, which only works if they are FORCED to agree with it.
      const methodMismatch = await postModern("tools/list", {}, id, {
        headers: { "Mcp-Method": "resources/list" },
      });
      expect(methodMismatch.status).toBe(400);
      expect(methodMismatch.body?.error?.code).toBe(-32020);

      const nameMismatch = await postModern(
        "tools/call",
        { name: "health_check", arguments: {} },
        id,
        { headers: { "Mcp-Name": "some_other_tool" } },
      );
      expect(nameMismatch.status).toBe(400);
      expect(nameMismatch.body?.error?.code).toBe(-32020);

      const versionMismatch = await postRaw(
        {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": id,
          "Mcp-Method": "tools/list",
          "Mcp-Name": "orchestratekit-conformance",
        },
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: { _meta: modernEnvelope("2025-11-25") },
        }),
      );
      expect(versionMismatch.status).toBe(400);
      expect(versionMismatch.body?.error?.code).toBe(-32020);

      const missingEnvelope = await postRaw(
        {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": id,
          "Mcp-Method": "tools/list",
          "Mcp-Name": "orchestratekit-conformance",
        },
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      );
      expect(missingEnvelope.status).toBe(400);
      expect(missingEnvelope.body?.error?.code).toBe(-32602);
      expect(missingEnvelope.body?.error?.data?.envelope?.missing).toContain("_meta");

      const incompleteEnvelope = await postRaw(
        {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": id,
          "Mcp-Method": "tools/list",
          "Mcp-Name": "orchestratekit-conformance",
        },
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: { _meta: { "io.modelcontextprotocol/protocolVersion": id } },
        }),
      );
      expect(incompleteEnvelope.status).toBe(400);
      expect(incompleteEnvelope.body?.error?.code).toBe(-32602);

      // The two eras are sealed against each other: neither one's entry method
      // is reachable from the other.
      const legacyHandshakeAtModern = await postModern("initialize", {
        protocolVersion: id,
        capabilities: {},
        clientInfo: { name: "orchestratekit-conformance", version: "1.0" },
      });
      expect(legacyHandshakeAtModern.body?.error?.code).toBe(-32601);
    });
  });
}

describe("era sealing (MAR-459)", () => {
  it("does not expose server/discover to a legacy client", async () => {
    const { body } = await postLegacy("2025-11-25", "server/discover");
    expect(body?.error?.code).toBe(-32601);
  });
});
