/**
 * What a DASH run is allowed to have produced — MAR-692, ADR 0025.
 *
 * ## Why this file is a copy and not a description
 *
 * Until now the MCP had **no copy of the artifact contract at all**. It told an
 * LLM how to plan an agent, how to declare its connections and how to POST
 * telemetry, and then said nothing whatsoever about the one document the agent
 * exists to produce. An agent built from such a brief runs, reports, and emits
 * an output DASH's `lib/contracts.ts` rejects at the channel boundary — so the
 * run looks fine and the product of it is silently dropped.
 *
 * The fix is not a paragraph explaining the shape. It is the shape. What is
 * below is orchestratedash's `contracts/run-artifact.schema.json`, copied
 * verbatim, because every attempt to summarise a contract loses exactly the
 * parts that are load-bearing: MAR-689 §3.4 records the scout losing a whole
 * briefing to a manifest three characters over a cap, and a cap is precisely
 * what a summary drops. The schema's own `description` strings are kept too —
 * they carry the reasoning a builder needs (why `items` is authoritative, why a
 * paragraph's citations bind to the paragraph, what a mismatch does), and they
 * are the difference between a builder who follows the shape and one who
 * understands why deviating from it fails silently.
 *
 * ## Kept in `src/`, not in `tests/fixtures/`
 *
 * Every other DASH mirror in this repo is a test fixture, because every other
 * one is only ever read by a test. This one is read by `export_build_brief` and
 * has to survive `pnpm build` into `dist/` — a fixture would be correct in CI
 * and missing at runtime, which is the worst of the two failures.
 *
 * ## How it stays true
 *
 * `pnpm dash:vocab:check` compares this against DASH's own file out of a
 * checkout at the pinned commit and fails on any difference, including a
 * difference in a `description`. That gate runs in CI, which is what
 * `dash:schema:check` never did — it needed a sibling checkout, CI had none, and
 * it printed SKIPPED on every run that mattered.
 */

/** The orchestratedash commit this copy was taken from. */
export const DASH_RUN_ARTIFACT_SCHEMA_COMMIT = "118d83b04c3fbf20e048528821dbffb3ed0568f3";

/**
 * `contracts/run-artifact.schema.json`, verbatim.
 *
 * Do not edit by hand. Re-sync with `pnpm dash:vocab:check --write` after
 * moving the pinned commit, and read the diff — a new `kind`, a new required
 * member, or a tightened ceiling is a decision about what the emitter should
 * tell a builder to produce, not a mechanical update.
 */
export const DASH_RUN_ARTIFACT_SCHEMA: Readonly<Record<string, unknown>> =
  {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://orchestratemcp.dev/orchestratedash/contracts/run-artifact.schema.json",
  "title": "OrchestrateDASH run artifact v1 and v2",
  "description": "What a run produced, as opposed to what it did. Carried to DASH on the runner's newline-delimited JSON channel as {\"type\":\"artifact\"} and validated at the same boundary telemetry is. A separate contract from run-event.schema.json on purpose: telemetry v1 is frozen and locked in contract.lock.json, an artifact is a different population from an event, and listRuns derives run status from events alone — an artifact must never be able to perturb that. additionalProperties is left open per the contract's additive-versioning rule.",
  "type": "object",
  "required": ["artifact_version", "agent", "run_id", "artifact_id", "kind", "title", "generated_at"],
  "allOf": [
    {
      "description": "MAR-458 moved `items` from the top-level required list into this conditional. That is a relaxation of the outer object and not of a digest: a digest is required to carry items exactly as before, and the change exists so a second kind can require a different member instead. Adding a kind without a branch here would let it require nothing, so a new branch is part of adding a kind.",
      "if": { "properties": { "kind": { "const": "digest" } }, "required": ["kind"] },
      "then": {
        "required": ["items"],
        "$comment": "The `properties` entry below exists only to satisfy Ajv's strictRequired check, which will not let a subschema require a property the same subschema does not define. `true` adds no constraint — the real definition is the one under the top-level `properties`, and it still applies here because an allOf branch narrows rather than replaces.",
        "properties": { "items": true }
      }
    },
    {
      "if": { "properties": { "kind": { "const": "draft" } }, "required": ["kind"] },
      "then": { "required": ["draft"], "properties": { "draft": true } }
    },
    {
      "description": "ADR 0025 amendment 1. The third kind, and the branch that makes `artifact_version` mean something rather than being a number nobody checks: a brief REQUIRES version 2, so a producer emitting one has necessarily been written against this contract. `derived_from` is required beside `document` because a brief's whole citation property is an index into another artifact's list, and an index with no way to check which list it names is worse than no citation at all.",
      "if": { "properties": { "kind": { "const": "brief" } }, "required": ["kind"] },
      "then": {
        "required": ["document", "derived_from"],
        "$comment": "`artifact_version` is constrained rather than merely required: the outer object already requires it, and what this adds is that it must be 2 here.",
        "properties": { "document": true, "derived_from": true, "artifact_version": { "const": 2 } }
      }
    }
  ],
  "properties": {
    "artifact_version": {
      "enum": [1, 2],
      "description": "Widened from `const 1` by ADR 0025. Note what this widening actually is: `lib/contracts.ts` compiles ONE validator for this file, so before it a v2 artifact was not partly read — it was rejected whole and never stored. A v1 artifact is unchanged and stays valid byte for byte. Version 2 is required by, and only by, the `brief` kind; `set_aside` is deliberately NOT gated on it, for the reason given on that member."
    },
    "agent": {
      "type": "string",
      "minLength": 1,
      "description": "Must match agent.name in the manifest DASH imported for this run, and is re-checked against the producing agent at ingest exactly as an event's is."
    },
    "run_id": {
      "type": "string",
      "minLength": 1,
      "description": "The run that produced this. DASH joins on it; it does not have to exist yet when the artifact arrives."
    },
    "artifact_id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128,
      "description": "Stable for the life of the artifact and unique within (agent, run_id). This is what makes 'open the digest again' resolve to the same document rather than to whatever is newest — the stable id MAR-457 asks for."
    },
    "kind": {
      "enum": ["digest", "draft", "brief"],
      "description": "`brief` was added by ADR 0025 amendment 1 and means a document a model wrote ABOUT a digest this same run produced — never instead of it. Henrik's rule, on reopening decision 2: \"One RAW and one curated. Don't mix them.\" The raw roundup stays a `digest` and stays exactly what it was, so `analyzeGrounding` grades the same population it always did and a model cannot improve a run's verdict by writing well. `draft` was added by MAR-458, when a second kind existed rather than in advance of one. It means a reply an agent composed. Whether that reply exists anywhere but DASH is `draft.placement`, which MAR-469 made a required member for exactly this reason: stage 1's description said a draft was always LOCAL, and stage 2 made that false without changing the kind. A renderer that reads the kind alone can no longer tell, and now cannot compile without asking."
    },
    "title": { "type": "string", "minLength": 1, "maxLength": 200 },
    "generated_at": { "type": "string", "format": "date-time" },
    "sources_fetched": {
      "type": "array",
      "description": "The sources this run actually retrieved, as the agent reports them. This is what makes grounding checkable: an item citing a source that was never fetched is a finding DASH can state without trusting the item's own claim about itself. It is an internal-consistency check on the agent's own report, NOT independent proof that a fetch happened — DASH does not see the network. Copy must not describe it as more than that.",
      "items": {
        "type": "object",
        "required": ["source_name", "source_url", "status"],
        "properties": {
          "source_name": { "type": "string", "minLength": 1, "maxLength": 120 },
          "source_url": { "type": "string", "format": "uri", "maxLength": 2048 },
          "status": {
            "enum": ["ok", "unreachable", "not_a_feed", "empty"],
            "description": "Kept apart because they are four different recoveries. lib/copy/recovery.ts refuses to collapse failure modes that lead somewhere different, and 'that address answered but not with a news feed' is not 'this computer may be offline'."
          },
          "fetched_at": { "type": "string", "format": "date-time" },
          "item_count": { "type": "integer", "minimum": 0 }
        }
      }
    },
    "draft": {
      "type": "object",
      "description": "A reply an agent wrote. Required when kind is `draft`. DASH never sends it and the broker has no send operation, in this slice or any other so far. What DASH can no longer assert for every draft is that nothing exists at the provider: MAR-469 added `gmail.draft.create`, so a reply may also be sitting in the user's own Drafts folder. `placement` is where that is stated, and it is required so no producer can leave it to a renderer to guess.",
      "required": ["subject", "body", "placement"],
      "properties": {
        "placement": {
          "type": "object",
          "description": "Where this reply actually is (MAR-469). Required, and a tagged union rather than a boolean, so a renderer must branch rather than default. Note what it is NOT: DASH's own record of what it performed is `broker_audit`, and this field is the agent's claim about its own work — the same standing `sources_fetched` has for a digest. Copy must attribute it.",
          "required": ["where"],
          "allOf": [
            {
              "description": "The MAR-458 meaning, kept and now named. DASH is holding this and it exists nowhere else — so there is no provider draft to carry an id for, and `draft_id: false` refuses one rather than letting a producer file a provider id under a placement that denies there is one.",
              "if": { "properties": { "where": { "const": "dash_only" } }, "required": ["where"] },
              "then": { "properties": { "draft_id": false } }
            },
            {
              "description": "A draft the agent says it created at the provider through the broker. `service` is required because the sentence a user reads has to name where to go and look.",
              "if": { "properties": { "where": { "const": "provider_draft" } }, "required": ["where"] },
              "then": {
                "required": ["service"],
                "$comment": "Present only to satisfy Ajv's strictRequired check, as at the top level. `true` adds no constraint.",
                "properties": { "service": true }
              }
            }
          ],
          "properties": {
            "where": { "enum": ["dash_only", "provider_draft"] },
            "service": {
              "type": "string",
              "minLength": 1,
              "maxLength": 60,
              "description": "Plain service name, e.g. \"Gmail\". Not a provider id and not a URL — this is rendered."
            },
            "draft_id": {
              "type": "string",
              "maxLength": 128,
              "description": "The provider's own id for the draft, as the broker returned it. Carried so a support conversation can name one thing rather than describe it, and deliberately NOT rendered as a link: DASH would be guessing at a provider's web UI, and a wrong link on this card sends a person looking for a draft where there is none."
            }
          }
        },
        "to": {
          "type": "array",
          "description": "Who the agent proposes to reply to, as read from the source message. A proposal a person edits, never an address book DASH resolved.",
          "items": { "type": "string", "maxLength": 320 },
          "maxItems": 25
        },
        "subject": { "type": "string", "minLength": 1, "maxLength": 300 },
        "body": { "type": "string", "maxLength": 20000 },
        "in_reply_to": {
          "type": "object",
          "description": "The message this replies to, by the provider's own ids. Ids and not content: this is what lets a person open the original themselves, and it is not a claim that DASH threaded anything.",
          "properties": {
            "message_id": { "type": "string", "maxLength": 128 },
            "thread_id": { "type": "string", "maxLength": 128 }
          }
        },
        "sources": {
          "type": "array",
          "description": "The messages the agent actually read to write this, as it reports them. The same internal-consistency check `sources_fetched` provides for a digest: a draft claiming to answer a message the run never read through the broker is a finding DASH can state, and the broker's own audit rows are the independent record to state it against.",
          "items": {
            "type": "object",
            "required": ["message_id"],
            "properties": {
              "message_id": { "type": "string", "maxLength": 128 },
              "subject": { "type": "string", "maxLength": 300 },
              "from": { "type": "string", "maxLength": 320 }
            }
          }
        }
      }
    },
    "curation": {
      "type": "object",
      "description": "What a model made of this digest, or the honest account of why nothing did (MAR-619). Optional, and absent means a digest from an agent that never tried — every digest written before this existed, and every agent that declares no model provider. Note what this block does NOT do: it does not replace `items`, reorder them, or decide which of them are shown. `items` stays the flat, authoritative list, so lib/analyze.ts's grounding verdict is computed over exactly what it always was and a model cannot improve a run's score by grouping tidily. Groups reference items by position into that list, so a model that invents a headline cannot make it appear in a digest — the same discipline AskCitation keeps for the chat.",
      "required": ["state"],
      "allOf": [
        {
          "description": "A curated digest has to carry the grouping that makes it one. A block claiming `curated` with no groups would render as an ordinary digest wearing a label, which is exactly the claim this contract exists to make checkable.",
          "if": { "properties": { "state": { "const": "curated" } }, "required": ["state"] },
          "then": {
            "required": ["groups"],
            "$comment": "Present only to satisfy Ajv's strictRequired check, as elsewhere in this file. `true` adds no constraint.",
            "properties": { "groups": true }
          }
        },
        {
          "description": "And an uncurated one has to say why, because 'this digest was not summarised' is a sentence DASH shows a person and it needs a reason in it. Required rather than optional so no producer can leave the surface to guess.",
          "if": { "properties": { "state": { "const": "not_curated" } }, "required": ["state"] },
          "then": { "required": ["reason"], "properties": { "reason": true } }
        }
      ],
      "properties": {
        "state": {
          "enum": ["curated", "not_curated"],
          "description": "Whether a model actually grouped this. Two values and no third: a partial curation is not a state, it is a `curated` block whose groups happen not to cover every item, and the renderer shows the remainder under DASH's own words."
        },
        "reason": {
          "enum": [
            "no_model_connection",
            "not_connected",
            "no_model_chosen",
            "needs_a_person",
            "refused",
            "unreadable"
          ],
          "description": "Why nothing summarised this, in the kinds that lead somewhere different for the reader. Deliberately mirrors the broker's own refusal codes rather than collapsing them: `not_connected` is one press on the Connections page, `no_model_chosen` is one press on the agent's page, `needs_a_person` means the run was not one somebody asked for, and `no_model_connection` means this agent never claimed it could do this and nothing is wrong. `unreadable` is the one that is not a refusal at all — a provider answered, was paid, and said nothing DASH could read a grouping out of."
        },
        "model": {
          "type": "string",
          "maxLength": 128,
          "description": "The model the provider says wrote this, which may not be the one asked for — a router is entitled to route. The agent's own report of what it was told, with telemetry v1's `model` standing rather than DASH's: DASH does not sit between an agent and its provider. Copy must attribute it."
        },
        "overview": {
          "type": "string",
          "maxLength": 600,
          "description": "The model's lead paragraph. Model-authored text, rendered as text and never as markup, and it carries no link — the broker's projection refuses a line with an address in it rather than trusting the prompt that forbade one."
        },
        "groups": {
          "type": "array",
          "maxItems": 12,
          "description": "How the model grouped the items. An item may appear in no group, and the renderer shows those under DASH's own heading rather than dropping them — the same rule that keeps an uncited item on screen.",
          "items": {
            "type": "object",
            "required": ["label", "items"],
            "properties": {
              "label": { "type": "string", "minLength": 1, "maxLength": 80 },
              "summary": { "type": "string", "maxLength": 400 },
              "items": {
                "type": "array",
                "description": "Positions into this artifact's own `items` array, zero-based. Numbers and never text, which is the whole safety property: what crosses from the model is an index into a list the agent already had, and an index naming nothing is dropped by the agent before it is ever written here.",
                "items": { "type": "integer", "minimum": 0 },
                "maxItems": 200
              }
            }
          }
        }
      }
    },
    "deep_dive": {
      "type": "object",
      "description": "A closer look at part of the digest, written by a model from items already in this artifact (MAR-691). Absent means the agent never attempts this — most digests, and every digest written before this existed. Mirrors `curation`'s state split for the same reason: absent and `not_written` are different claims, and a renderer that conflated them would put a refusal on a digest that never tried one. `not_written` covers both a genuine refusal and the ordinary case of nothing yet to look harder at (`nothing_picked`, `nothing_found`), which is why its reasons are a superset of `curation.reason` rather than the same enum. `text` is the one field here that is prose: it carries no link of its own, the same rule `curation.overview` keeps, because a model writing about items DASH already trusts must never be able to point a reader anywhere the items themselves did not.",
      "required": ["state"],
      "allOf": [
        {
          "description": "A written deep dive has to carry the text that makes it one, the same reason a `curated` block has to carry its groups.",
          "if": { "properties": { "state": { "const": "written" } }, "required": ["state"] },
          "then": {
            "required": ["text"],
            "$comment": "Present only to satisfy Ajv's strictRequired check, as elsewhere in this file. `true` adds no constraint.",
            "properties": { "text": true }
          }
        },
        {
          "description": "And one that was not written has to say why, for `curation`'s own reason: the sentence a person reads needs a cause in it.",
          "if": { "properties": { "state": { "const": "not_written" } }, "required": ["state"] },
          "then": {
            "required": ["reason"],
            "properties": { "reason": true }
          }
        }
      ],
      "properties": {
        "state": {
          "enum": ["written", "not_written"],
          "description": "Whether a model actually wrote a closer look this run."
        },
        "reason": {
          "enum": [
            "nothing_picked",
            "nothing_found",
            "no_model_connection",
            "not_connected",
            "no_model_chosen",
            "needs_a_person",
            "unreadable",
            "refused"
          ],
          "description": "Why nothing was written. The first two are not refusals at all — there was nothing yet to look harder at — and are kept apart from the four that mirror the broker's own refusal codes plus `unreadable`, the one where a provider answered and was paid and nothing readable came back."
        },
        "model": {
          "type": "string",
          "maxLength": 128,
          "description": "The model the provider says wrote this. The agent's own report, with the same standing `curation.model` has — DASH does not sit between an agent and its provider."
        },
        "text": {
          "type": "string",
          "minLength": 1,
          "maxLength": 12000,
          "description": "Model-authored prose. Rendered as text and never as markup, and it carries no link — the same rule `curation.overview` keeps, extended to a body rather than a label."
        }
      }
    },
    "document": {
      "type": "object",
      "description": "What a model wrote about this run's digest (ADR 0025 decision 1). Required when kind is `brief`, meaningless on any other kind. Ordered sections of prose, and the ordering is the document — this is the one member in the contract whose sequence a renderer must not re-sort. Every string here is model-authored, is rendered as text and never as markup, and may not carry a link: `readBrief` drops a paragraph containing anything that looks like an address rather than cleaning it, exactly as `readCuration` does for a group label.",
      "required": ["sections"],
      "properties": {
        "sections": {
          "type": "array",
          "maxItems": 8,
          "items": {
            "type": "object",
            "required": ["heading", "paragraphs"],
            "properties": {
              "heading": { "type": "string", "minLength": 1, "maxLength": 80 },
              "paragraphs": {
                "type": "array",
                "maxItems": 6,
                "items": {
                  "type": "object",
                  "required": ["body"],
                  "properties": {
                    "body": { "type": "string", "minLength": 1, "maxLength": 1200 },
                    "items": {
                      "type": "array",
                      "description": "Positions into the digest named by `derived_from`, zero-based. Bound to the PARAGRAPH and not to the section, which is the whole safety argument of ADR 0025 decision 1: a section-level binding would let one wrong sentence borrow the citations of every other sentence under the same heading, which is the defect Henrik reported. ABSENT IS NOT AN ERROR — it means prose the model wrote without naming a source, and the renderer marks it rather than dropping it, on `digest.tsx`'s rule that hiding the evidence against a verdict is how the verdict becomes theatre.",
                      "items": { "type": "integer", "minimum": 0 },
                      "maxItems": 200
                    }
                  }
                }
              }
            }
          }
        },
        "model": {
          "type": "string",
          "maxLength": 128,
          "description": "What the provider says wrote this. The agent's own report, with telemetry v1's `model` standing rather than DASH's. Copy must attribute it."
        }
      }
    },
    "derived_from": {
      "type": "object",
      "description": "The digest this brief was written from, and the fingerprint that makes the join CHECKABLE (ADR 0025 amendment 1, A1.2). Required when kind is `brief`. Splitting the brief from the roundup is what Henrik asked for; the cost is that `document.sections[].paragraphs[].items` now index into a DIFFERENT artifact's array, and nothing about two separate records guarantees they are the same list in the same order. This member is that guarantee. DASH recomputes `items_digest` from the digest it holds, and on a mismatch draws the brief with NO citations under its own sentence — because a wrong citation is a real link under a claim it does not support, which is worse than no citation and is precisely what the index-only design exists to prevent.",
      "required": ["artifact_id", "run_id", "item_count", "items_digest"],
      "properties": {
        "artifact_id": { "type": "string", "minLength": 1, "maxLength": 128 },
        "run_id": {
          "type": "string",
          "minLength": 1,
          "description": "Carried and checked rather than assumed equal to the brief's own `run_id`. A brief written from a previous run's digest is a thing an agent could do, and DASH should be able to say so rather than silently joining across runs."
        },
        "item_count": {
          "type": "integer",
          "minimum": 0,
          "description": "The length of that list when the brief was written. Redundant against `items_digest` and kept anyway: it is what lets DASH say 'written from 60 items, and this digest has 58' in words a person can act on, where a hash mismatch alone says only that something differs."
        },
        "items_digest": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$",
          "description": "SHA-256, lowercase hex, over a canonical rendering of the digest's `items` in order. The canonicalisation is ONE pure function shared by DASH and the agent kit and must never be transcribed into a second place — a drift between the two ends turns every correct brief into an uncited one, which is A1.2's recorded cost."
        }
      }
    },
    "set_aside": {
      "type": "array",
      "description": "What the agent collected and deliberately did not put in the digest. The other half of the honesty layer beside `sources_fetched`: that member says which sources did not answer, this one says what answered and was left out.\n\nDELIBERATELY NOT GATED ON artifact_version 2, unlike `document`. The competitor scout has emitted this field since MAR-647 and it has been travelling under this schema's open `additionalProperties` and rendering nowhere — so gating it would reject, at ingest, every artifact the one real agent produces today. A contract change that breaks a working agent to enforce a version number is the wrong trade, and the versioned member is the one that carries a new kind.\n\nONLY WHAT DASH RENDERS IS DEFINED. The scout also carries `competitor` and `item_url` on these entries; both go on travelling under `additionalProperties` and neither is constrained here, because a constraint on a field DASH does not read is a way to reject a good artifact for no benefit.",
      "items": {
        "type": "object",
        "required": ["headline"],
        "properties": {
          "headline": { "type": "string", "minLength": 1, "maxLength": 300 },
          "reason": {
            "enum": ["no_signal", "duplicate", "off_topic", "too_old", "unparseable"],
            "description": "Why it was left out, in a CLOSED set so that the sentence a person reads is DASH's rather than the agent's. The alternative — free text — would put agent-authored prose on the one surface whose entire job is to be DASH's own honest accounting, which is the distinction `sources_fetched` keeps and `lib/copy/identifiers.ts` exists to protect.\n\nOptional, and absent is rendered as 'left out, and the agent did not say why' rather than as an error. The scout's existing entries carry no reason at all, and a required member would make this contract reject them."
          }
        }
      }
    },
    "items": {
      "type": "array",
      "description": "The digest itself. An item with no source_url is kept and rendered as uncited rather than dropped — hiding it is how a grounded verdict becomes theatre.",
      "items": {
        "type": "object",
        "required": ["headline"],
        "properties": {
          "headline": { "type": "string", "minLength": 1, "maxLength": 300 },
          "summary": { "type": "string", "maxLength": 1000 },
          "source_name": { "type": "string", "maxLength": 120 },
          "source_url": {
            "type": "string",
            "format": "uri",
            "maxLength": 2048,
            "description": "The feed this item came from. Absent means uncited, which is a verdict input rather than an error."
          },
          "item_url": { "type": "string", "format": "uri", "maxLength": 2048 },
          "published_at": { "type": "string", "format": "date-time" }
        }
      }
    }
  }
};

/**
 * The `items_digest` canonicalisation, as JavaScript a built agent can paste in.
 *
 * ## Why source and not a sentence
 *
 * `derived_from.items_digest` is a SHA-256 over a canonical rendering of the
 * digest's `items`, and the schema says in as many words that the
 * canonicalisation "is ONE pure function shared by DASH and the agent kit and
 * must never be transcribed into a second place". A builder told *what the hash
 * is over* will write a reasonable function — join the headlines, hash the
 * JSON, sort for stability — and every one of those reasonable choices produces
 * a different hash from DASH's.
 *
 * The failure that follows does not look like a bug. DASH recomputes the
 * fingerprint over the digest it holds, sees a mismatch, and draws the brief
 * with **no citations at all** under its own sentence. Nothing errors. The
 * agent looks like a model that forgot to cite. ADR 0025 amendment 1 records
 * that as the recorded cost of splitting the brief from the roundup, and it is
 * why this block is source code rather than a specification of source code.
 *
 * Byte-for-byte the same three functions as `lib/brief/fingerprint.ts` in
 * orchestratedash — same names, same tuple order, same `JSON.stringify`, same
 * hash — and the drift gate proves it by *running both* over the same items and
 * comparing the digests, rather than by comparing text that could agree in
 * spelling and disagree in behaviour.
 *
 * Identity fields only, never `summary`: what is guarded against is a
 * *different list*, not a mutated item, and hashing the prose would let a
 * re-truncation silently withdraw every citation from a brief that is perfectly
 * correct. Absent is `null` rather than `""`. Order is part of the identity,
 * because a brief citing "item 4" means the fourth row of the list it was
 * handed.
 */
export const DASH_ITEMS_DIGEST_MIRROR_JS = `import { createHash } from "node:crypto";

/** Identity fields only — never summary. Absent is null, never "". */
function itemIdentity(item) {
  return [item.headline, item.source_url ?? null, item.item_url ?? null];
}

/** The canonical rendering of the digest's items, in order. Order is identity. */
function canonicaliseItems(items) {
  return JSON.stringify(items.map(itemIdentity));
}

/** SHA-256 of the canonical rendering, lowercase hex — \`derived_from.items_digest\`. */
function fingerprintItems(items) {
  return createHash("sha256").update(canonicaliseItems(items), "utf8").digest("hex");
}
`;

/** Every `kind` DASH's artifact contract accepts, read off the copied schema. */
export function dashArtifactKinds(): string[] {
  const properties = DASH_RUN_ARTIFACT_SCHEMA.properties as
    | Record<string, { enum?: string[] }>
    | undefined;
  return [...(properties?.kind?.enum ?? [])];
}

/**
 * The members DASH requires for one artifact kind, top-level plus the kind's own
 * conditional branch.
 *
 * Read off the copied schema rather than listed here, so a kind gaining a
 * required member in DASH changes what the brief tells a builder on the next
 * re-sync — with no second list to forget. Returns `[]` for a kind the contract
 * does not define, which is the honest answer and never a guess.
 */
export function dashArtifactRequiredMembers(kind: string): string[] {
  const top = (DASH_RUN_ARTIFACT_SCHEMA.required as string[] | undefined) ?? [];
  const branches = (DASH_RUN_ARTIFACT_SCHEMA.allOf as
    | { if?: { properties?: { kind?: { const?: string } } }; then?: { required?: string[] } }[]
    | undefined) ?? [];
  const branch = branches.find((entry) => entry.if?.properties?.kind?.const === kind);
  if (!branch) return [];
  return [...new Set([...top, ...(branch.then?.required ?? [])])];
}
