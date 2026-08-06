/**
 * MAR-495 — is the pinned DASH manifest-v2 schema still the cross-repo tripwire
 * it claims to be?
 *
 * `tests/fixtures/dash/agent.manifest.v2.schema.json` exists so the MCP emitter
 * can be validated against DASH's contract without the two repos sharing code.
 * `tests/tools/observabilityManifest.test.ts` calls it "semantically identical to
 * orchestratedash's canonical contract". That claim decays silently: DASH edits
 * its contract, the MCP's tests keep passing against the old copy, and the
 * tripwire quietly stops covering the part that changed. MAR-477 found it four
 * additions behind.
 *
 * ## Why this is a check and not a test
 *
 * It needs orchestratedash checked out beside this repo, which is true on a
 * developer machine and false in CI. A vitest case that silently passed when the
 * sibling is missing would be worse than nothing — it would report "identical"
 * on exactly the machine that never looks. So this is a script with three
 * outcomes, and the missing-sibling one is loud:
 *
 *   exit 0 + "identical"   the two agree
 *   exit 0 + "SKIPPED"     orchestratedash is not checked out; says so, every run
 *   exit 1                 they disagree, with the paths that differ
 *
 * Wired into `pnpm verify` after `state:check`, so a developer who edits either
 * side finds out on the next verify rather than months later.
 *
 * ## What counts as drift
 *
 * Any structural difference in either direction, reported as JSON-pointer paths.
 * Additive-only drift is still drift — it is how MAR-477's gap survived, since
 * every addition DASH made was optional and nothing failed. Deciding whether the
 * MCP should now *emit* a newly added block is a separate judgement; this script
 * only insists that somebody makes it.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PINNED = path.join(repoRoot, "tests/fixtures/dash/agent.manifest.v2.schema.json");
const CANONICAL = path.resolve(
  repoRoot,
  "../orchestratedash/contracts/agent.manifest.v2.schema.json",
);

if (!existsSync(CANONICAL)) {
  console.log(
    "[dash-schema] SKIPPED — orchestratedash is not checked out beside this repo, so the " +
      "pinned schema could not be compared with the canonical one. This run proves nothing " +
      "about drift.",
  );
  process.exit(0);
}

/** Every JSON-pointer path in a document, so a diff can name what moved. */
function paths(node, prefix = "", out = new Set()) {
  if (node === null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((value, index) => paths(value, `${prefix}/${index}`, out));
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    const pointer = `${prefix}/${key}`;
    out.add(pointer);
    paths(value, pointer, out);
  }
  return out;
}

/** Only the shallowest node of each differing subtree; descendants are noise. */
function roots(list) {
  return list.filter((entry) => !list.some((other) => other !== entry && entry.startsWith(`${other}/`)));
}

const pinned = JSON.parse(readFileSync(PINNED, "utf-8"));
const canonical = JSON.parse(readFileSync(CANONICAL, "utf-8"));

const pinnedPaths = paths(pinned);
const canonicalPaths = paths(canonical);

const missingHere = roots([...canonicalPaths].filter((p) => !pinnedPaths.has(p)).sort());
const extraHere = roots([...pinnedPaths].filter((p) => !canonicalPaths.has(p)).sort());

if (missingHere.length === 0 && extraHere.length === 0) {
  console.log("[dash-schema] pinned fixture is structurally identical to orchestratedash's contract");
  process.exit(0);
}

console.error("[dash-schema] DRIFT — the pinned fixture no longer matches DASH's canonical contract.");
console.error(`  pinned:    ${path.relative(repoRoot, PINNED)}`);
console.error(`  canonical: ${CANONICAL}`);
if (missingHere.length > 0) {
  console.error("\n  In DASH's contract, absent from the pinned copy:");
  for (const pointer of missingHere) console.error(`    + ${pointer}`);
}
if (extraHere.length > 0) {
  console.error("\n  In the pinned copy, absent from DASH's contract:");
  for (const pointer of extraHere) console.error(`    - ${pointer}`);
}
console.error(
  "\n  Re-sync with:\n" +
    "    cp ../orchestratedash/contracts/agent.manifest.v2.schema.json tests/fixtures/dash/agent.manifest.v2.schema.json\n" +
    "  Confirm the source matches DASH master first — orchestratedash is read-only from here,\n" +
    "  and a copy taken from an in-flight branch pins something that was never released.\n" +
    "  Then decide separately whether the emitter should populate anything newly added.",
);
process.exit(1);
