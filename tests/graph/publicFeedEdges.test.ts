import { describe, expect, it } from "vitest";
import { computeExecutionOrder } from "../../src/graph/routeOrdering.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();
const { components, edges } = registry;

function pick(ids: string[]) {
  return ids.map((id) => {
    const component = components.find((candidate) => candidate.id === id);
    if (!component) throw new Error(`Component not found in registry: ${id}`);
    return component;
  });
}

describe("component: public_feed_fetch", () => {
  it("declares network: read and no write or credential prerequisite", () => {
    const component = components.find((candidate) => candidate.id === "public_feed_fetch");
    expect(component).toBeDefined();
    expect(component!.permissions.read).toEqual([
      "network: read - anonymous public RSS/Atom/HTTP endpoints only",
    ]);
    expect(component!.permissions.write).toEqual([]);
    expect(component!.requires).toEqual([]);
    expect(component!.summary).toContain("never requires a crawler account");
  });

});

describe("edge: scheduled_trigger__compatible__public_feed_fetch", () => {
  it("connects scheduled_trigger to public_feed_fetch", () => {
    const edge = edges.find(
      (candidate) =>
        candidate.id === "scheduled_trigger__compatible__public_feed_fetch",
    );
    expect(edge).toMatchObject({
      from: "scheduled_trigger",
      to: "public_feed_fetch",
      relation: "compatible_with",
      tested: true,
    });
  });
});

describe("edge: public_feed_fetch__produces__deduplication", () => {
  it("orders public_feed_fetch before deduplication", () => {
    const ids = computeExecutionOrder(
      pick(["deduplication", "public_feed_fetch"]),
      edges,
    ).map((component) => component.id);
    expect(ids.indexOf("public_feed_fetch")).toBeLessThan(
      ids.indexOf("deduplication"),
    );
  });
});

describe("edge: public_feed_fetch__produces__source_freshness_check", () => {
  it("orders public_feed_fetch before source_freshness_check", () => {
    const ids = computeExecutionOrder(
      pick(["source_freshness_check", "public_feed_fetch"]),
      edges,
    ).map((component) => component.id);
    expect(ids.indexOf("public_feed_fetch")).toBeLessThan(
      ids.indexOf("source_freshness_check"),
    );
  });
});
