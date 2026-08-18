/**
 * MAR-692 — the MCP finally knows what a DASH run is allowed to have produced.
 *
 * Before this the answer was *nothing at all*: the MCP could tell an LLM how to
 * plan an agent, declare its connections and POST telemetry, and said not one
 * word about the document the agent exists to make. An agent built from such a
 * brief runs, reports correctly, and emits an output DASH's `lib/contracts.ts`
 * rejects at the channel boundary — so the run reads as a success and there is
 * nothing to open.
 *
 * These tests are about the copy being a COPY. Whether it still matches DASH is
 * `pnpm dash:vocab:check`'s job, because only that can compare against the real
 * file; what belongs here is everything that can be wrong without DASH moving:
 * a member read off the wrong place, a helper that guesses at a kind it does not
 * know, a mirror whose text was edited into something that no longer hashes the
 * way DASH hashes.
 */
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";

import {
  DASH_ITEMS_DIGEST_MIRROR_JS,
  DASH_RUN_ARTIFACT_SCHEMA,
  DASH_RUN_ARTIFACT_SCHEMA_COMMIT,
  dashArtifactKinds,
  dashArtifactRequiredMembers,
} from "../../src/lib/dashArtifactContract.js";

describe("MAR-692 — the run-artifact contract is carried, not described", () => {
  it("is DASH's own document, identified as such", () => {
    expect(DASH_RUN_ARTIFACT_SCHEMA.$id).toBe(
      "https://orchestratemcp.dev/orchestratedash/contracts/run-artifact.schema.json",
    );
    expect(DASH_RUN_ARTIFACT_SCHEMA_COMMIT).toMatch(/^[0-9a-f]{40}$/);
  });

  it("keeps the description strings, which are the half a summary would drop", () => {
    /*
     * The reason this is a hard assertion rather than a preference. MAR-689 §3.4
     * records a real agent losing a whole briefing to a manifest three
     * characters over a cap — and a cap, plus the sentence explaining why it is
     * there, is exactly what survives in DASH's `description` fields and dies in
     * any retelling. A copy with the annotations stripped would still validate
     * and would still be the wrong thing to hand a builder.
     */
    const properties = DASH_RUN_ARTIFACT_SCHEMA.properties as Record<
      string,
      { description?: string }
    >;
    expect(properties.document?.description).toContain("ordering is the document");
    expect(properties.derived_from?.description).toContain("CHECKABLE");
    expect(properties.items?.description).toContain("uncited");
  });

  it("names the three kinds DASH accepts, brief included", () => {
    expect(dashArtifactKinds()).toEqual(["digest", "draft", "brief"]);
  });
});

describe("MAR-692 — required members are read off the contract, never listed twice", () => {
  it("a brief requires document and derived_from on top of the common members", () => {
    const required = dashArtifactRequiredMembers("brief");
    expect(required).toContain("document");
    expect(required).toContain("derived_from");
    expect(required).toContain("artifact_id");
    // `items` belongs to the digest branch and must not leak into the brief's.
    expect(required).not.toContain("items");
  });

  it("a digest requires items, and nothing the brief branch added", () => {
    const required = dashArtifactRequiredMembers("digest");
    expect(required).toContain("items");
    expect(required).not.toContain("document");
    expect(required).not.toContain("derived_from");
  });

  it("a brief is pinned to artifact_version 2 by the contract itself", () => {
    /*
     * Not a convention the emitter enforces — a constraint in the branch. A
     * `brief` at version 1 is rejected whole rather than partly read, because
     * `lib/contracts.ts` compiles one validator for the file.
     */
    const branches = DASH_RUN_ARTIFACT_SCHEMA.allOf as {
      if?: { properties?: { kind?: { const?: string } } };
      then?: { properties?: { artifact_version?: { const?: number } } };
    }[];
    const brief = branches.find((entry) => entry.if?.properties?.kind?.const === "brief");
    expect(brief?.then?.properties?.artifact_version?.const).toBe(2);
  });

  it("answers [] for a kind the contract does not define, rather than guessing", () => {
    // The honest answer. A guessed member list would be a second contract, and
    // the emitter would tell a builder to produce something DASH never asked for.
    expect(dashArtifactRequiredMembers("newsletter")).toEqual([]);
  });

  it("binds citations to the paragraph, not the section", () => {
    /*
     * ADR 0025 decision 1's whole safety argument, and the defect Henrik
     * reported: a section-level binding lets one wrong sentence borrow the
     * citations of every other sentence under the same heading. Asserted
     * structurally so a re-sync that moved `items` up a level fails here rather
     * than silently changing what §9 teaches.
     */
    const document = DASH_RUN_ARTIFACT_SCHEMA.properties as Record<string, never>;
    const sections = (document.document as never as {
      properties: { sections: { items: { properties: Record<string, unknown> } } };
    }).properties.sections.items.properties as {
      paragraphs: { items: { properties: Record<string, { description?: string }> } };
      items?: unknown;
    };
    expect(sections.items, "sections must not carry citations of their own").toBeUndefined();
    expect(sections.paragraphs.items.properties.items?.description).toContain("zero-based");
  });
});

describe("MAR-692 — the items_digest mirror is source, and it behaves like DASH's", () => {
  /**
   * Run the pasteable mirror the same way the drift gate does.
   *
   * The snippet is written for a built agent and opens with a `node:crypto`
   * import, which a `Function` body cannot carry — so the import line is dropped
   * and `createHash` is supplied from this process. That substitution is the
   * only edit made to it.
   */
  function runMirror(items: unknown[]): string {
    const body = DASH_ITEMS_DIGEST_MIRROR_JS.split("\n")
      .filter((line) => !line.startsWith("import "))
      .join("\n");
    return (
      new Function("createHash", `${body}\nreturn fingerprintItems;`) as (
        hash: typeof createHash,
      ) => (items: unknown[]) => string
    )(createHash)(items);
  }

  it("is code, carrying DASH's three function names", () => {
    // A builder told what the hash is *over* writes a reasonable function, and
    // every reasonable choice produces a different hash from DASH's. So the
    // brief ships the function rather than a specification of it.
    expect(DASH_ITEMS_DIGEST_MIRROR_JS).toContain("function itemIdentity");
    expect(DASH_ITEMS_DIGEST_MIRROR_JS).toContain("function canonicaliseItems");
    expect(DASH_ITEMS_DIGEST_MIRROR_JS).toContain("function fingerprintItems");
  });

  it("hashes identity fields only — never the summary", () => {
    /*
     * The decision, not an economy. What is guarded against is a *different
     * list*, not a mutated item; hashing prose would let a re-truncation or a
     * parser fix silently withdraw every citation from a brief that is perfectly
     * correct, and a check that fails on correct data is one people learn to
     * ignore.
     */
    const a = [{ headline: "One", source_url: "https://a.example/f", summary: "first" }];
    const b = [{ headline: "One", source_url: "https://a.example/f", summary: "rewritten" }];
    expect(runMirror(a)).toBe(runMirror(b));
  });

  it("treats a missing url and an empty url as different rows", () => {
    // Absent is `null`, never `""`.
    expect(runMirror([{ headline: "One" }])).not.toBe(
      runMirror([{ headline: "One", source_url: "" }]),
    );
  });

  it("makes order part of the identity", () => {
    // A brief citing "item 4" means the fourth row of the list it was handed, so
    // a reordering makes every number point somewhere else.
    const items = [{ headline: "One" }, { headline: "Two" }];
    expect(runMirror(items)).not.toBe(runMirror([...items].reverse()));
  });

  it("produces lowercase hex of the length derived_from.items_digest demands", () => {
    const pattern = (
      (DASH_RUN_ARTIFACT_SCHEMA.properties as Record<string, never>)
        .derived_from as never as {
        properties: { items_digest: { pattern: string } };
      }
    ).properties.items_digest.pattern;
    expect(runMirror([{ headline: "One" }])).toMatch(new RegExp(pattern));
  });
});
