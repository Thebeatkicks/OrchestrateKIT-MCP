/**
 * What DASH names, and what DASH brokers — MAR-493 / MAR-494.
 *
 * The one place in the MCP that holds DASH-side vocabulary. Both facts here are
 * DASH's to define and the MCP's to follow, and they are kept in a single file
 * so a review that touches one is forced to look at the other.
 *
 * ## Why the MCP holds any of this
 *
 * MAR-477 ran the round trip end to end and found the seam blocked by two field
 * *values*, not two field shapes: `agent_dom.connections[].provider` and
 * `.ownership`. Both repos type them as strings, both documents validate against
 * the shared schema, and neither a type check nor a schema check could see the
 * disagreement.
 *
 * MAR-486 already settled the principle that decides who moves: **the emitter
 * must not produce what the importer refuses.** DASH is the importer. So the
 * MCP spells things DASH's way.
 *
 * ## The cost, stated plainly
 *
 * This is DASH knowledge inside the MCP, which the architecture boundary
 * otherwise avoids, and it will drift when DASH adds a provider or an operation.
 *
 * It drifts **narrow**, which is the safe direction. A connection missing from
 * `DASH_BROKERED_CONNECTIONS` is emitted exactly as it is today and simply is not
 * brokered — the user sees the MCP-server or direct-credential path they already
 * see. A connection missing from `DASH_MANIFEST_PROVIDER` keeps its own id, which
 * DASH refuses with an honest "DASH has no sign-in for this" rather than
 * silently pointing at the wrong provider. Neither failure invents access.
 *
 * The direction that would NOT be safe is claiming a connection is brokered when
 * DASH cannot broker it. That produces a row rendering as "DASH holds this
 * credential" whose every call is then refused with `no_broker_profile` — a
 * connection that looks connected while nothing works. Adding an entry here is
 * therefore a claim about DASH that has to be checked against DASH, and
 * `tests/lib/dashBrokerCatalog.test.ts` records what was checked and when.
 */

/**
 * MCP `connection_id` → the `provider` string DASH expects in a manifest.
 *
 * Hand-listed rather than derived, mirroring `lib/oauth/providers.ts` in
 * orchestratedash, which lists its side by hand for a stated reason: a prefix or
 * case transform would invent `google-drive` and point it at Google with scopes
 * nobody wrote copy for. A transform here would invent `google-sheets` and
 * `hub-spot`, neither of which DASH has heard of, turning a clean refusal into a
 * guess.
 *
 * Only services DASH actually names belong here. Everything else keeps its own
 * id, which is what `dashManifestProvider` does.
 */
const DASH_MANIFEST_PROVIDER: Readonly<Record<string, string>> = {
  gmail: "google-gmail",
  google_calendar: "google-calendar",
};

/**
 * The `provider` value to emit for a connection, DASH's spelling where DASH has
 * one and the MCP's own id where it does not.
 *
 * Never throws and never guesses: an unmapped connection is passed through
 * unchanged, so adding a provider to the registry cannot break an export.
 */
export function dashManifestProvider(connectionId: string): string {
  return DASH_MANIFEST_PROVIDER[connectionId] ?? connectionId;
}

/**
 * Connections DASH's broker can actually hold a credential for and run an
 * operation against.
 *
 * Narrower than `DASH_MANIFEST_PROVIDER` on purpose, and the two are not the same
 * question. Naming a service is a vocabulary fact and is safe to state for
 * anything DASH recognises; brokering it is a claim that DASH has an OAuth flow,
 * a provider profile AND at least one allowlisted operation. A service DASH can
 * name but not broker belongs in the map above and not in this set.
 *
 * Re-checked against orchestratedash master `118d83b` on 2026-08-18 (MAR-692),
 * by extraction rather than by reading: `lib/broker/providers.ts` now resolves
 * FOUR profiles — `google-gmail` plus the three AI providers — and
 * `lib/broker/operations.ts` defines fifteen operations. The 2026-08-06 note
 * this replaces said "one profile, three operations" and was 598 commits stale.
 *
 * This set stays `["gmail"]` anyway, and that is not an oversight. It answers a
 * narrower question than the catalogue below: which *registry connection* named
 * by a planned route can be handed to DASH's broker. The three AI providers are
 * reached through the model-provider connection `observabilityContract.ts`
 * appends for AI-backed steps, which is chosen from `llm_provider` and never
 * from a route component, so it never passes through here. Google Calendar has
 * an OAuth flow on the DASH side but still no broker profile and no operations,
 * so it is deliberately absent — including it would be the "looks connected,
 * grants nothing" failure this file's header warns about.
 */
const DASH_BROKERED_CONNECTIONS: ReadonlySet<string> = new Set(["gmail"]);

/**
 * Can DASH broker this connection, if DASH is present?
 *
 * Answers only the capability half. Whether DASH is present at all is the
 * caller's assertion, carried by `export_build_brief`'s `dash_broker_available`
 * input — the MCP is stateless and cannot observe it.
 */
export function dashBrokersConnection(connectionId: string): boolean {
  return DASH_BROKERED_CONNECTIONS.has(connectionId);
}

/** Every connection this build of the MCP believes DASH brokers. For tests. */
export function dashBrokeredConnectionIds(): string[] {
  return [...DASH_BROKERED_CONNECTIONS].sort();
}

/** Every connection id with a DASH-specific spelling. For tests. */
export function dashNamedConnectionIds(): string[] {
  return Object.keys(DASH_MANIFEST_PROVIDER).sort();
}

/**
 * MAR-582 (F14 companion, MAR-596): every model-provider DASH will hold an API
 * key for, by value — mirrors orchestratedash's `lib/ai/providers.ts::AI_PROVIDER_IDS`.
 * Same discipline as `DASH_MANIFEST_PROVIDER`/`DASH_BROKERED_CONNECTIONS` above
 * and for the same reason: this is DASH's registry of manifest `provider`
 * strings DASH will actually act on for its AI-key vault (MAR-582's "bring
 * your own AI key" feature), not something derivable from this repo's own
 * registry.
 *
 * Checked against orchestratedash master on 2026-08-10 (`5ad6d70`):
 * `AI_PROVIDER_IDS = ["openrouter", "anthropic", "openai"] as const`, and
 * `AiProviderProfile.connection_provider` equals `id` for all three — so the
 * MCP's own `llm_provider` spelling ("anthropic"/"openrouter") already matches
 * DASH's manifest `provider` string with no translation table, unlike Gmail.
 * "openai" has no MCP-side selection path yet (`connectContract.ts`'s
 * `LlmProvider` union does not offer it): narrow drift, the safe direction
 * this file's own header calls out — unreachable today rather than guessed.
 */
export const AI_PROVIDER_IDS = ["openrouter", "anthropic", "openai"] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

/* ------------------------------------------------------------------ *
 * The operation catalogue (MAR-692)
 * ------------------------------------------------------------------ */

/**
 * DASH's three access classes, `spend` included.
 *
 * `spend` is not a third flavour of write. DASH's own words on the manifest
 * schema: it means the person's own account is charged and **nothing appears
 * anywhere**. Filing a model call under `write` makes a permission card promise
 * something turns up in an account, which is the one thing a completion does
 * not do — so the emitter has to be able to say `spend` or it has no honest
 * word for the only class of thing an AI-backed agent does.
 */
export type DashBrokerAccess = "read" | "write" | "spend";

/** One operation DASH's `operationById` resolves. */
export interface DashBrokerOperation {
  readonly id: string;
  readonly connection_provider: string;
  readonly access: DashBrokerAccess;
  readonly required_scopes: readonly string[];
}

/**
 * Every operation DASH's broker will perform, by value.
 *
 * **This is the vocabulary the whole issue is about.** A capability id an agent
 * declares on a DASH-brokered connection has to be one of these, or DASH's
 * `operationById` misses and `execute.ts` answers `unknown_operation`. Before
 * MAR-692 this repo held three entries against DASH's fifteen, 598 commits
 * stale, and every AI-backed agent the MCP authored named a capability id that
 * existed nowhere.
 *
 * Kept by value here and extracted-not-transcribed into
 * `tests/fixtures/dash/broker-profiles.json`: `pnpm dash:vocab:check` runs
 * DASH's own `lib/broker/operations.ts` out of a checkout at the pinned commit
 * and fails when this list and that one disagree. So the list is hand-readable
 * where the emitter needs it and machine-checked against DASH where it counts,
 * which is what the 598 commits proved a comment alone cannot do.
 *
 * Twelve of the fifteen do not appear as literals in DASH's source at all —
 * they are generated per AI provider. See `dashAiOperationId`.
 */
const DASH_BROKER_OPERATIONS: readonly DashBrokerOperation[] = Object.freeze([
  { id: "anthropic.brief.compose", connection_provider: "anthropic", access: "spend", required_scopes: [] },
  { id: "anthropic.chat.completion", connection_provider: "anthropic", access: "spend", required_scopes: [] },
  { id: "anthropic.digest.curate", connection_provider: "anthropic", access: "spend", required_scopes: [] },
  { id: "anthropic.models.list", connection_provider: "anthropic", access: "read", required_scopes: [] },
  { id: "gmail.draft.create", connection_provider: "google-gmail", access: "write", required_scopes: ["https://www.googleapis.com/auth/gmail.compose"] },
  { id: "gmail.message.read", connection_provider: "google-gmail", access: "read", required_scopes: ["https://www.googleapis.com/auth/gmail.readonly"] },
  { id: "gmail.search", connection_provider: "google-gmail", access: "read", required_scopes: ["https://www.googleapis.com/auth/gmail.readonly"] },
  { id: "openai.brief.compose", connection_provider: "openai", access: "spend", required_scopes: [] },
  { id: "openai.chat.completion", connection_provider: "openai", access: "spend", required_scopes: [] },
  { id: "openai.digest.curate", connection_provider: "openai", access: "spend", required_scopes: [] },
  { id: "openai.models.list", connection_provider: "openai", access: "read", required_scopes: [] },
  { id: "openrouter.brief.compose", connection_provider: "openrouter", access: "spend", required_scopes: [] },
  { id: "openrouter.chat.completion", connection_provider: "openrouter", access: "spend", required_scopes: [] },
  { id: "openrouter.digest.curate", connection_provider: "openrouter", access: "spend", required_scopes: [] },
  { id: "openrouter.models.list", connection_provider: "openrouter", access: "read", required_scopes: [] },
]);

/** Every operation DASH brokers, in id order. The mirror the drift gate checks. */
export function dashBrokerOperations(): readonly DashBrokerOperation[] {
  return DASH_BROKER_OPERATIONS;
}

/**
 * The MCP's own copy of DASH's `operationById`.
 *
 * Deliberately the same shape and the same answer for an unknown id — `null` —
 * so a test can ask the question DASH will ask, in DASH's own terms, before a
 * manifest ever leaves this repo.
 */
export function dashOperationById(id: string): DashBrokerOperation | null {
  return DASH_BROKER_OPERATIONS.find((operation) => operation.id === id) ?? null;
}

/** Every id, sorted. For tests and for the drift gate's diff. */
export function dashOperationIds(): string[] {
  return DASH_BROKER_OPERATIONS.map((operation) => operation.id).sort();
}

/**
 * How DASH spells each AI operation family, by suffix.
 *
 * `.digest.curate` and `.brief.compose` are exported constants on DASH's side
 * (`CURATE_OPERATION_SUFFIX`, `COMPOSE_OPERATION_SUFFIX`) precisely so nobody
 * types the literal twice; `.models.list` and `.chat.completion` are template
 * literals inside DASH's generator functions and have no constant to import.
 * All four are mirrored here and all four are checked by the drift gate against
 * ids extracted from DASH's running source, so the distinction costs nothing.
 */
export const DASH_AI_OPERATION_SUFFIX = Object.freeze({
  models_list: ".models.list",
  chat_completion: ".chat.completion",
  digest_curate: ".digest.curate",
  brief_compose: ".brief.compose",
});

export type DashAiOperationFamily = keyof typeof DASH_AI_OPERATION_SUFFIX;

/**
 * The operation id for one AI provider and one family, built DASH's way.
 *
 * One construction with one place to be wrong, mirroring `curateOperationId` /
 * `composeOperationId` in orchestratedash. Returns `null` rather than a string
 * for a provider DASH has no profile for — the safe direction this file's
 * header sets out: a missing id is a connection that declares less, and a
 * guessed one is a capability card promising an operation that refuses.
 */
export function dashAiOperationId(
  providerId: string,
  family: DashAiOperationFamily,
): string | null {
  const id = `${providerId}${DASH_AI_OPERATION_SUFFIX[family]}`;
  return dashOperationById(id) ? id : null;
}

/**
 * Which components mean "write a document about what this agent collected".
 *
 * The two whose registry outputs are exactly what DASH's `brief.compose`
 * projection returns — ordered sections of prose with per-paragraph indexes
 * back into a digest. Everything else model-backed falls to `chat.completion`,
 * which is DASH's general "answer a question" spend and is never wrong about
 * what a model step does.
 */
const AI_COMPOSE_COMPONENTS: ReadonlySet<string> = new Set([
  "research_synthesis",
  "report_generation",
]);

/**
 * Gmail components to the operations DASH actually has for them.
 *
 * `email_send` and `optional_email_send` map to **nothing**, on purpose. DASH
 * has no send operation and ADR 0002 invariant 6 says it never will in this
 * profile; an emitted capability claiming otherwise would render as "DASH can
 * send mail for this agent" over a call that is refused. An empty list is the
 * honest answer and the caller drops the step from the brokered capability
 * block rather than inventing an id for it.
 */
const GMAIL_COMPONENT_OPERATIONS: Readonly<Record<string, readonly string[]>> = {
  email_read: ["gmail.search", "gmail.message.read"],
  gmail_draft_write: ["gmail.draft.create"],
  email_send: [],
  optional_email_send: [],
};

/** Which AI family a model-backed component's step should spend through. */
export function dashAiFamilyForComponent(componentId: string): DashAiOperationFamily {
  return AI_COMPOSE_COMPONENTS.has(componentId) ? "brief_compose" : "chat_completion";
}

/**
 * The DASH operation ids a brokered connection should declare for one component.
 *
 * Returns `[]` for anything DASH cannot broker for that component — an unknown
 * component, a provider with no profile, or a real component DASH has no
 * operation for (`email_send`). Callers must treat an empty list as "declare no
 * brokered capability here", never as "declare the component id", which is the
 * `${provider}.${component_id}` mistake MAR-692 exists to end.
 *
 * Nothing maps to `digest.curate` today: no component in this registry means
 * "group a list of collected items under labels", and naming one that does not
 * fit would put a wrong id in front of a real spend. It stays in the catalogue
 * because DASH has it and the drift gate checks the whole set, not because the
 * emitter reaches it.
 */
export function dashOperationsForComponent(
  connectionProvider: string,
  componentId: string,
): string[] {
  if (connectionProvider === "google-gmail") {
    return [...(GMAIL_COMPONENT_OPERATIONS[componentId] ?? [])].filter(
      (id) => dashOperationById(id) !== null,
    );
  }
  if ((AI_PROVIDER_IDS as readonly string[]).includes(connectionProvider)) {
    const id = dashAiOperationId(connectionProvider, dashAiFamilyForComponent(componentId));
    return id ? [id] : [];
  }
  return [];
}
