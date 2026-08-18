/**
 * Extract DASH's real vocabulary from DASH's real source — MAR-692.
 *
 * The one thing this module refuses to do is *describe* DASH. It imports
 * `lib/broker/operations.ts` and `lib/broker/providers.ts` out of an
 * orchestratedash checkout and calls them, so what comes back is the operation
 * set DASH's own `operationById` will resolve, not a reading of the file.
 *
 * ## Why executing is safe here, and why that is not luck
 *
 * `lib/broker/operations.ts` has exactly one import — `../ai/providers` — and
 * `lib/ai/providers.ts` has none at all. The pair is a dependency-free island,
 * so tsx compiles and runs it with no orchestratedash `node_modules`, no
 * Electron, no store and no network. A clone is enough.
 *
 * That property is load-bearing and is asserted rather than assumed: if DASH
 * ever gives either file an import that pulls in the rest of the application,
 * the import here throws and the drift gate fails loudly. A gate that quietly
 * fell back to parsing would be the silent-drift failure this whole issue
 * exists to end — `dashBrokerCatalog.ts` went 598 commits stale precisely
 * because nothing failed.
 *
 * ## Why not a parser
 *
 * Twelve of the fifteen operations do not exist as literals anywhere in DASH's
 * source. They are built by `aiProviders().map(...)` over a closed profile list,
 * with ids assembled from exported suffix constants. A regex would have to
 * re-implement that generation to see them — which is a second copy of the
 * thing being checked, drifting on its own schedule. Running the module is the
 * only extraction with no second copy in it.
 */
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** One broker operation, reduced to the facts the MCP mirrors. */
export interface DashOperationFact {
  id: string;
  connection_provider: string;
  access: "read" | "write" | "spend";
  required_scopes: string[];
}

/** One broker profile, reduced to the facts the MCP mirrors. */
export interface DashProfileFact {
  connection_provider: string;
  oauth_provider_id: string | null;
  label: string;
  token_custodian: string;
  client_owner: string;
}

export interface DashVocabulary {
  dash_path: string;
  /** The commit the checkout is actually at, or null when it is not a git tree. */
  head_commit: string | null;
  operations: DashOperationFact[];
  profiles: DashProfileFact[];
  ai_provider_ids: string[];
  operation_id_suffixes: {
    models_list: string;
    chat_completion: string;
    digest_curate: string;
    brief_compose: string;
  };
  /** `contracts/run-artifact.schema.json`, parsed. */
  run_artifact_schema: unknown;
  /** `contracts/agent.manifest.v2.schema.json`, parsed. */
  manifest_v2_schema: unknown;
}

/**
 * Where orchestratedash is, in the order a caller can control it.
 *
 * The sibling default is the developer-machine convention this repo already
 * uses (`scripts/check-dash-schema-drift.mjs`); the env var is what CI sets
 * after cloning the pinned commit.
 */
export function locateDash(explicit?: string): string | null {
  const isCheckout = (candidate: string) =>
    existsSync(path.join(path.resolve(candidate), "lib/broker/operations.ts"));

  /*
   * A named path is authoritative, and a named path that is not a checkout is a
   * hard null rather than a fall-through to the sibling. CI names the clone it
   * just made; if that clone failed, quietly comparing against some other
   * orchestratedash on the machine would report agreement with a commit nobody
   * asked about — the one answer this gate must never give.
   */
  const named = explicit ?? process.env.ORCHESTRATEDASH_PATH;
  if (typeof named === "string" && named.length > 0) {
    return isCheckout(named) ? path.resolve(named) : null;
  }

  const sibling = path.resolve(repoRoot, "../orchestratedash");
  return isCheckout(sibling) ? sibling : null;
}

/** The commit a checkout is at, so a comparison can say what it compared against. */
function headCommit(dashPath: string): string | null {
  try {
    return execFileSync("git", ["-C", dashPath, "rev-parse", "HEAD"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Import a module out of the DASH checkout by absolute path.
 *
 * Kept as its own function so the failure has one place to be explained: the
 * only way this throws is DASH growing an import the island cannot satisfy, and
 * that is a real finding rather than a broken gate.
 */
async function importFromDash(dashPath: string, relative: string): Promise<Record<string, unknown>> {
  const target = path.join(dashPath, relative);
  try {
    return (await import(pathToFileURL(target).href)) as Record<string, unknown>;
  } catch (cause) {
    throw new Error(
      `Could not execute ${relative} out of ${dashPath}. This gate runs DASH's broker source ` +
        `directly, which works only while lib/broker/operations.ts and lib/ai/providers.ts stay ` +
        `a dependency-free island. If DASH has given either an import that reaches the rest of ` +
        `the application, that is the finding — not this script.\n  cause: ${String(cause)}`,
      { cause },
    );
  }
}

/** Read one of DASH's contract files verbatim. */
export function readDashContract(dashPath: string, name: string): string {
  return readFileSync(path.join(dashPath, "contracts", name), "utf-8");
}

/**
 * Run DASH's broker source and return what it defines.
 *
 * Throws rather than returning a partial answer: every caller here is a gate,
 * and a gate that reports "no operations found" as agreement is worse than no
 * gate at all.
 */
export async function extractDashVocabulary(dashPath: string): Promise<DashVocabulary> {
  const operationsModule = await importFromDash(dashPath, "lib/broker/operations.ts");
  const providersModule = await importFromDash(dashPath, "lib/broker/providers.ts");
  const aiModule = await importFromDash(dashPath, "lib/ai/providers.ts");

  const allOperations = operationsModule.allOperations;
  const brokerProfileFor = providersModule.brokerProfileFor;
  if (typeof allOperations !== "function" || typeof brokerProfileFor !== "function") {
    throw new Error(
      "DASH's broker source no longer exports allOperations()/brokerProfileFor(). The mirror " +
        "cannot be extracted, which is drift in the loudest possible form.",
    );
  }

  const raw = (allOperations as () => readonly Record<string, unknown>[])();
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("DASH's allOperations() returned nothing; refusing to report that as agreement.");
  }

  const operations: DashOperationFact[] = raw
    .map((operation) => ({
      id: String(operation.id),
      connection_provider: String(operation.connection_provider),
      access: operation.access as DashOperationFact["access"],
      required_scopes: [...((operation.required_scopes as string[] | undefined) ?? [])].sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const providerIds = [...new Set(operations.map((operation) => operation.connection_provider))].sort();
  const profiles: DashProfileFact[] = [];
  for (const providerId of providerIds) {
    const profile = (brokerProfileFor as (id: string) => Record<string, unknown> | null)(providerId);
    if (!profile) {
      throw new Error(
        `DASH defines operations for connection_provider "${providerId}" but brokerProfileFor() ` +
          "resolves no profile for it. That is a DASH-side inconsistency this gate must not paper over.",
      );
    }
    profiles.push({
      connection_provider: String(profile.connection_provider),
      oauth_provider_id:
        profile.oauth_provider_id === null || profile.oauth_provider_id === undefined
          ? null
          : String(profile.oauth_provider_id),
      label: String(profile.label),
      token_custodian: String(profile.token_custodian),
      client_owner: String(profile.client_owner),
    });
  }

  const aiProviderIds = [...((aiModule.AI_PROVIDER_IDS as readonly string[] | undefined) ?? [])];
  if (aiProviderIds.length === 0) {
    throw new Error("DASH's AI_PROVIDER_IDS is empty or gone; the AI half of the mirror cannot be checked.");
  }

  const curate = operationsModule.CURATE_OPERATION_SUFFIX;
  const compose = operationsModule.COMPOSE_OPERATION_SUFFIX;
  if (typeof curate !== "string" || typeof compose !== "string") {
    throw new Error(
      "DASH no longer exports CURATE_OPERATION_SUFFIX/COMPOSE_OPERATION_SUFFIX. The MCP builds " +
        "spend-operation ids from those constants; a rename is drift the emitter must follow.",
    );
  }

  /*
   * `.models.list` and `.chat.completion` have no exported constant on DASH's
   * side — they are template literals inside the two generator functions. They
   * are recovered from the extracted ids rather than typed in here, so this
   * module still holds no second copy of DASH's spelling.
   */
  const suffixFrom = (providerId: string, id: string) => id.slice(providerId.length);
  const sample = aiProviderIds[0];
  const modelsList = operations.find((operation) => operation.id.startsWith(`${sample}.`) && operation.access === "read");
  const completion = operations.find(
    (operation) =>
      operation.connection_provider === sample &&
      operation.access === "spend" &&
      !operation.id.endsWith(curate) &&
      !operation.id.endsWith(compose),
  );
  if (!modelsList || !completion) {
    throw new Error(
      `DASH's operation set no longer contains a models-list read and a general completion spend for ` +
        `"${sample}". The emitter's AI capability block is built from both.`,
    );
  }

  return {
    dash_path: dashPath,
    head_commit: headCommit(dashPath),
    operations,
    profiles,
    ai_provider_ids: aiProviderIds,
    operation_id_suffixes: {
      models_list: suffixFrom(sample, modelsList.id),
      chat_completion: suffixFrom(sample, completion.id),
      digest_curate: curate,
      brief_compose: compose,
    },
    run_artifact_schema: JSON.parse(readDashContract(dashPath, "run-artifact.schema.json")),
    manifest_v2_schema: JSON.parse(readDashContract(dashPath, "agent.manifest.v2.schema.json")),
  };
}
