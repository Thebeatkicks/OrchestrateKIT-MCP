import { describe, expect, it } from "vitest";
import { matchCapabilities } from "../../src/graph/capabilityMatcher.js";
import { loadRegistry } from "../../src/registry/registryLoader.js";

const registry = loadRegistry();

function matchedIds(goal: string): string[] {
  return matchCapabilities(
    goal,
    [],
    [],
    registry.components,
    registry.edges,
  ).matches.map((match) => match.component.id);
}

describe("MAR-455 anonymous public-feed matcher", () => {
  const exactGoal =
    "Watch public news feeds for stories about AI agents and write me a daily digest file on my computer.";

  it("routes the exact public-feed goal to anonymous GET/feed parsing", () => {
    const ids = matchedIds(exactGoal);
    expect(ids).toContain("public_feed_fetch");
    expect(ids).toContain("scheduled_trigger");
    expect(ids).not.toContain("page_monitor");
    expect(ids).not.toContain("data_scraper");
    expect(ids).not.toContain("source_retrieval");
  });

  it("uses the public-feed path for explicit RSS and Atom sources", () => {
    const ids = matchedIds(
      "Poll public RSS feeds and Atom feeds every morning for new AI agent stories.",
    );
    expect(ids).toContain("public_feed_fetch");
    expect(ids).not.toContain("page_monitor");
    expect(ids).not.toContain("data_scraper");
  });

  it("keeps JavaScript-heavy feed-absent websites on page_monitor", () => {
    const ids = matchedIds(
      "Watch a JavaScript-heavy news website with no RSS or Atom feed for changes.",
    );
    expect(ids).toContain("page_monitor");
    expect(ids).not.toContain("public_feed_fetch");
  });

  it("does not claim anonymous access for a private OAuth feed", () => {
    const ids = matchedIds(
      "Watch a private RSS feed that requires OAuth and summarize new items.",
    );
    expect(ids).toContain("page_monitor");
    expect(ids).not.toContain("public_feed_fetch");
  });

  it("keeps both paths for a public feed plus a rendered website", () => {
    const ids = matchedIds(
      "Watch a public RSS feed and a JavaScript-heavy news website for AI agent stories.",
    );
    expect(ids).toContain("public_feed_fetch");
    expect(ids).toContain("page_monitor");
  });
});
