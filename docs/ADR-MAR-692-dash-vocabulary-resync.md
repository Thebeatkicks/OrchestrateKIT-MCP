# ADR MAR-692 — re-syncing the DASH vocabulary, and the gate that keeps it synced

Status: accepted, 2026-08-18.
Pinned against orchestratedash master `118d83b04c3fbf20e048528821dbffb3ed0568f3`.

## Context

MAR-689's research found that an agent authored through the MCP could not make a
model call on DASH at all. MAR-692's step 0 then called `export_build_brief` for
real — the competitor scout's own goal, the exact `plan_workflow` output,
`llm_provider: openrouter`, `dash_broker_available: true`, compact delivery — and
corrected the prediction in the direction that matters.

The prediction was `unknown_operation`: an agent refused at the broker. The
observation was worse. The 145 KB brief routed every model step **around DASH**.
Its connect section instructed the builder to mint an `OPENROUTER_API_KEY` at
openrouter.ai and keep it in the agent's own `.env`; the word `spend` appeared
nowhere in the artifact. An agent built from it does not get refused — it runs,
it charges the user's provider account on every run, and DASH has no record of
any of it.

Three mirrors of DASH's vocabulary had gone stale with nothing able to see it:

| mirror | state found |
| --- | --- |
| `src/lib/dashBrokerCatalog.ts` operations | 3 of DASH's 15, 598 commits behind |
| `tests/fixtures/dash/agent.manifest.v2.schema.json` | missing `access: "spend"`, 323 commits |
| the run-artifact contract | absent entirely |

## Decision 1 — the emitter declares DASH's operation ids, or nothing

A capability id on a `dash_managed` connection is not a label. It is the key
`operationById` looks up, and DASH answers `unknown_operation` before the request
reaches a provider. `${connection_id}.${component_id}` resolves nothing, ever:
DASH's ids name operations (`gmail.search`), not plan components
(`gmail.email_read`).

So `dashOperationsForComponent` maps a route component to the DASH operations it
actually needs, and a component DASH has no operation for contributes **nothing**
rather than a name that refuses. Two consequences worth stating:

- `email_send` maps to the empty list. ADR 0002 invariant 6 guarantees DASH has
  no send operation in the draft-only profile, and a capability claiming one
  would render as "DASH can send mail for this agent" over a call that cannot
  exist.
- A brokered connection whose route steps resolve to no operation is downgraded
  to `agent_managed`. It is not brokered *for this plan* however well DASH knows
  the service, and claiming otherwise produces the "DASH holds this credential,
  every call refused" row `dashBrokerCatalog.ts`'s header has always warned about.

Model steps route through a family. `chat.completion` is the default because it
is DASH's general "answer a question" spend and is never wrong about what a model
step does; `research_synthesis` and `report_generation` get `brief.compose`
instead, because their registry outputs are exactly what that operation's
projection returns — a document written about a set of collected items. Nothing
maps to `digest.curate`: no component in this registry means "group a list of
collected items under labels", and naming one that does not fit would put a wrong
id in front of a real spend.

For the scout's own goal the result is the three capabilities the proven scout
declares by hand: `openrouter.models.list`, `openrouter.brief.compose`,
`openrouter.chat.completion`.

## Decision 2 — `spend` is a word the emitter can say

`AgentDomConnectionCapability.access` was typed `"read" | "write"`. DASH's schema
has had three members since MAR-619. The emitter could not say `spend` even where
it meant it, so every model capability was filed under `read` — a permission card
claiming the user's account is not charged, for the one operation class that
certainly charges it. The union is widened and the access class is now read off
the catalogue rather than chosen per connection.

## Decision 3 — one decision decides where the model key lives

The manifest's model-provider connection and the connect contract's `.env` entry
are two statements about the same key, and the observed brief made them
contradict each other on the same page. `dashBrokersModelKey` answers it once —
DASH present **and** a runtime DASH can broker for — and both are derived from
that answer. When DASH holds the key, no `OPENROUTER_API_KEY` is emitted anywhere
in the export.

**The ADR 0006 downgrade stays.** `lib/manifest-constraints.ts` in orchestratedash
refuses at import any manifest pairing a `remote` runtime with a `dash_managed`
connection — the broker cannot reach a process it did not spawn. On a managed
worker, which is what `plan_workflow` recommends for the scout's goal today, the
key genuinely lives with the agent. That is not a bug to route around, and the
emitter must not produce what the importer refuses.

What the brief owes the reader there is the consequence in words rather than
silence, so §11 now says which of the two worlds this export is in: either "DASH's
vault holds the key" with the brokered operation ids listed, or "this agent holds
it, and DASH cannot see the spend" with the reason and the way out.

## Decision 4 — the artifact contract is copied, not described

The MCP told an LLM how to plan an agent, declare its connections and POST
telemetry, and said nothing about the document the agent exists to make. An agent
built from such a brief reports perfectly and emits an output DASH drops at the
channel boundary: the run reads as a success and there is nothing to open.

`src/lib/dashArtifactContract.ts` carries `contracts/run-artifact.schema.json`
byte for byte, `description` strings included — they carry the field-length
ceilings, and MAR-689 §3.4 records a real agent losing a whole briefing to a
manifest three characters over a cap. It lives in `src/` rather than
`tests/fixtures/` because it is the one mirror the emitter reads at runtime and
must survive `pnpm build` into `dist/`.

`items_digest` ships as **source**. A builder told what the hash is over writes a
reasonable function, and every reasonable choice produces a different hash from
DASH's; DASH then draws the brief with no citations at all and the agent reads as
a model that forgot to cite. ADR 0025 amendment 1 records that as the recorded
cost of splitting the brief from the roundup.

### Cost, stated

Compact delivery grew from 90,621 to ~117,130 bytes and the response-size ceiling
moved 96 KB → 128 KB, with the compact/full ratio assertion 4x → 3x. The
alternative — descriptions stripped in compact, annotated contract only in `full`
— was rejected because compact is the mode people use (the observed export was
compact), so a contract only in `full` is a contract the building LLM never
reads. `tests/tools/exportBuildBrief.test.ts` records the trade at the assertion.

## Decision 5 — the gate runs in CI, and compares values

`scripts/check-dash-schema-drift.mjs` was correct and never fired. Two holes:

1. **It could not run in CI.** It needed orchestratedash beside this repo; CI had
   no sibling, so it printed SKIPPED and exited 0 on every push that mattered.
2. **It compared JSON-pointer paths, not values.** Array elements contribute no
   pointer of their own, so a new enum member is invisible to it — and
   `access: "spend"` is exactly a new enum member.

`pnpm dash:vocab:check` fixes both. CI clones orchestratedash at the commit
pinned in `tests/fixtures/dash/broker-profiles.json` (public repo, no token,
`--filter=blob:none`) and runs the gate as a named step. A missing checkout is
now exit 1 by default; `--allow-missing` exists only so `pnpm verify` still works
for a contributor without the sibling, and CI never passes it.

Extraction is by **execution**, not parsing. Twelve of DASH's fifteen operations
exist as no literal in its source — they are generated by `aiProviders().map(...)`
from exported suffix constants, so any parser would be a second copy of DASH's id
generation drifting on its own schedule. `lib/broker/operations.ts`,
`lib/broker/providers.ts` and `lib/ai/providers.ts` are a dependency-free island,
so a bare clone runs them; `lib/brief/fingerprint.ts` is another, so the
`items_digest` mirror is compared by running both and diffing the hashes rather
than by diffing text that can agree in spelling and disagree in behaviour.

## What this does not claim

No live model call was made, nothing was imported into an installed DASH, and no
agent was run. The end-to-end proof MAR-692's bar asks for — `plan_workflow` →
`export_build_brief` → an LLM builds it → imported into DASH → its model steps
admitted and its output rendered — is a later attended step and is not claimed
here.
