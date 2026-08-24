/**
 * Coverage accounting (MAR-250) — the scope compiler's honesty layer.
 *
 * Answers three questions about a plan, deterministically and with no LLM:
 *   1. Which goal phrases did the route actually claim? (matched)
 *   2. Which goal steps matched NOTHING in the registry? (unmatched demand —
 *      the "save a note into Notion → 'nothing external'" failure class)
 *   3. Which routed components have no goal phrase supporting them?
 *      (unsupported supply — the "crm_note_write on a Postgres→PDF→Slack goal"
 *      failure class: selected on fuzzy capability/summary word overlap alone)
 *
 * Everything here is derived from the matcher's own scoring provenance
 * (CapabilityMatch.matched_tokens / .evidence) plus a fixed demand lexicon.
 * Unsupported supply is FLAGGED, never dropped — route membership is unchanged,
 * so no probe/corpus behavior moves; the verdict layer gets honest instead.
 */

import type { CapabilityMatch } from "./capabilityMatcher.js";
import { isNegatedInContext } from "./capabilityMatcher.js";
import { containsPhrase } from "../lib/constraintSignals.js";

export type CoverageLabel = "full" | "partial" | "poor";

export type Coverage = {
  /** Goal tokens/phrases each route component actually claimed. */
  matched: Array<{ component_id: string; tokens: string[] }>;
  /**
   * Goal clauses that name workflow work (a demand verb/noun from the lexicon)
   * which NO selected component claimed. These steps are outside the registry —
   * the reading agent must treat them as 🔵 unguided, not silently drop them.
   *
   * Superset of `unrecognized_demand` — a caller reading only this field still
   * hears about clauses the lexicon could not parse.
   */
  unmatched_demand: string[];
  /**
   * MAR-396: goal clauses that name an ACTION whose vocabulary is outside the
   * demand lexicon entirely. These used to hit a bare `continue` and vanish —
   * judged "not a demand" rather than judged uncovered, which is how "issue the
   * refund to the customer" produced a refund-free route with
   * `unmatched_demand: []`.
   *
   * Kept separate from `unmatched_demand` because the two say different things
   * and a builder must be able to tell them apart: an unmatched clause means
   * "we understood this step and nothing carries it"; an unrecognized clause
   * means "we could not parse this step at all — assume nothing about it".
   * The registry may or may not have a component; the honest answer is that
   * coverage does not know.
   */
  unrecognized_demand: string[];
  /**
   * Route components selected on fuzzy evidence alone (capability/summary word
   * overlap; no keyword hint, no identifier match). No goal phrase asked for
   * them — verify before building, or remove.
   */
  unsupported_supply: string[];
  coverage_label: CoverageLabel;
};

/**
 * Action verbs that name a workflow step. A verb alone only flags a clause when
 * the clause has no demand NOUNS (nouns anchor the judgement — see
 * clauseIsUncovered). Deliberately excludes ambient verbs ("run", "use",
 * "check", "make") that appear in nearly every goal without naming a step.
 */
const DEMAND_VERBS = new Set([
  "read", "send", "draft", "reply", "classify", "generate", "create",
  "produce", "save", "store", "post", "publish", "pull", "fetch", "extract",
  "parse", "monitor", "watch", "alert", "notify", "summarize", "summarise",
  "enrich", "update", "write", "validate", "deduplicate", "scrape", "review",
  "approve", "upload", "download", "sync", "translate", "transcribe", "book",
  "tell", "tells",
  // MAR-396: money-moving and irreversible actions. These are additive polish,
  // NOT the fix — the structural detector below is what makes the NEXT unknown
  // verb fail safely. They earn their place by giving the commonest cases a
  // precise clause reading instead of a shape-inferred one.
  //
  // Deliberately NOT added: "issue", which is a noun at least as often as a verb
  // in this domain ("open an issue", "Linear issues") and would false-flag.
  // The money NOUNS below anchor those clauses without the ambiguity.
  "refund", "charge", "transfer", "reimburse", "delete", "cancel",
]);

/**
 * System / artifact nouns that name WHAT the workflow touches. These are the
 * demand anchors: an unclaimed noun means a named system or artifact the route
 * does not carry. Includes systems the registry deliberately does NOT cover yet
 * (postgres, notion, …) — naming known-unknowns is the whole point.
 * Deliberately excludes ambient nouns ("api", "channel", "team", "data",
 * "message") that co-occur with covered work and would false-alarm.
 */
const DEMAND_NOUNS = new Set([
  // registry-covered systems (claimed when their component matches)
  "email", "emails", "inbox", "slack", "discord", "telegram", "notion",
  "airtable", "stripe", "pdf", "spreadsheet", "csv", "crm", "calendar",
  "transaction", "transactions", "ledger",
  "github", "webhook", "invoice", "invoices", "uptime", "logs", "metric",
  "sources", "feed", "feeds", "competitor", "competitors", "price", "prices",
  // known-unknown systems/artifacts — not in the registry today; an unclaimed
  // hit here is exactly the gap the user must hear about
  "postgres", "postgresql", "mysql", "sqlite", "sql", "database", "warehouse",
  "bigquery", "snowflake", "report", "hubspot", "salesforce", "jira",
  "gitlab", "wordpress", "twitter", "linkedin", "instagram", "facebook",
  "youtube", "tiktok", "shopify", "zendesk", "intercom", "sms", "whatsapp",
  "dropbox", "s3",
  // MAR-396: money artifacts. The registry has NO payment-write component (only
  // stripe_data_read), so an unclaimed hit here is exactly the gap that must be
  // said out loud rather than routed around.
  "refund", "refunds", "payment", "payments", "payout", "payouts",
  "chargeback", "chargebacks", "disbursement",
  // MAR-549: provenance. "…write the leads to a spreadsheet WITH A SOURCE LINK
  // ON EVERY ROW" produced `unmatched_demand: []` on a route that records no
  // source link anywhere — the requirement did not merely go unsatisfied, it was
  // never registered as demand at all. Neither "source" (only the plural
  // "sources" was listed) nor "link" nor "attribution" nor "provenance" was
  // vocabulary, and the clause "with a source link on every row" opens with the
  // determiner "a", which the MAR-396 shape detector rejects as a verb — so both
  // paths to being heard were closed. A demand signal that vanishes can never be
  // prioritised, which is worse than one that is reported and unmet.
  "attribution", "provenance",
]);

/** Multi-word demand phrases checked before single tokens. */
const DEMAND_PHRASES = [
  "google drive",
  "google sheet",
  "google sheets",
  "pull request",
  "pr opens",
  "code review",
  "risky changes",
  // MAR-549: the phrasings people actually use for row-level provenance. Kept as
  // PHRASES rather than adding a bare "source"/"link" noun, which would fire on
  // "sources", "linked", "linkedin" and every research goal in the corpus.
  "source link",
  "source links",
  "source url",
  "source urls",
  // MAR-581: bookkeeping writes commonly promise a durable reference back to
  // the receipt/source item. The accounting_write component can carry this
  // reference in its write confirmation + audit evidence, so its direction
  // signal claims the exact phrase when present.
  "evidence link",
  "evidence links",
  "where it came from",
  "where the data came from",
];

/**
 * MAR-540 acceptance bar #1 — the approval-provenance overclaim.
 *
 * A goal can state the concern as plainly as a user ever will:
 *
 *   "…require my approval before it sends, WITH AN AUDIT TRAIL PROVING WHAT I
 *    APPROVED IS EXACTLY WHAT RAN"
 *
 * and get back `approval: enforced`, `unmatched_demand: []`. Re-probed on master
 * `f6e486f` (2026-08-08): MAR-541's Stripe fix removed one instance of this —
 * the gate that guarded an action missing from the route entirely — but the
 * drift ask itself still vanishes on every phrasing that does not name Stripe.
 *
 * Nothing in the 66 components binds an approval to a payload.
 * `human_approval_gate`'s declared output is an `approved | rejected | timeout`
 * DECISION with no identity attached to what was decided; `audit_log` takes the
 * EXECUTED payload with no reference to an approved one. No consumer can compare
 * them. Both components' prose reads as though they cover drift —
 * "requires explicit human approval before ANY irreversible action", "records
 * EVERY sensitive or external action" — and neither does.
 *
 * The clause was absorbed rather than heard: "approve"/"approved" is a
 * DEMAND_VERB that `human_approval_gate`'s own hint claims, and one claimed word
 * clears the clause. So the ask disappeared into the very component whose
 * insufficiency it was describing.
 *
 * Keyed on the COMPONENT that would satisfy it, not on the phrase claim — the
 * MAR-551 pattern. `APPROVAL_BINDING_COMPONENTS` is empty because nothing in the
 * registry produces an approval identity; a future component joining it is all
 * that is needed to make this stop reporting. Until then the honest answer is
 * that the plan does not carry the guarantee, and silence is the one answer that
 * is definitely wrong.
 */
const APPROVAL_BINDING_PHRASES = [
  "exactly what ran",
  "exactly what was",
  "exactly what got",
  "exactly what executed",
  "exactly what i approved",
  "what i approved is exactly",
  "proving what i approved",
  "prove what i approved",
  "prove that what i approved",
  "matches what i approved",
  "match what i approved",
  "no drift between",
  "drift between approved",
  "drift between what",
  "cannot be changed after i approve",
  "unchanged after approval",
  "tamper-proof approval",
  // MAR-580: the original LAB black-box post's own compliance vocabulary. The
  // gate now hears these phrases, but it still does not bind an approval
  // identity to the executed payload (MAR-540/561), so coverage must say so
  // instead of letting the new hint absorb the concern.
  "who authorized it",
  "who authorised it",
  "tied to authorization",
  "tied to authorisation",
  "tied to who authorized",
  "tied to who authorised",
];

/**
 * Components that genuinely bind an approval to the executed action.
 *
 * MAR-749 flipped this switch. MAR-540 wrote the rule above keyed on the
 * COMPONENT rather than on the phrase precisely so that building one would be
 * the whole change — "a future component joining that set is all that is needed
 * to make the gap report stop". `approval_binding` is that component: it issues
 * a digest over the canonicalised payload plus a single-use token at gate time
 * and refuses execution when the payload presented later does not match.
 *
 * `human_approval_gate` is still NOT a member, and must never become one — see
 * the note above. The gate proves a human saw something; only the binding
 * carries an identity for what they saw.
 */
const APPROVAL_BINDING_COMPONENTS = new Set<string>(["approval_binding"]);

/**
 * MAR-551 — proactive credential lifecycle is not reactive failure recovery.
 *
 * "pull invoices from the QuickBooks API on a schedule, **keeping the OAuth
 * token refreshed**, and email a PDF report" reported `unmatched_demand: []`.
 * Nothing in that route performs a scheduled pre-expiry refresh;
 * `auth_failure_handler` is triggered by a FAILURE SIGNAL and says so in its own
 * registry entry — its declared input is "failure signal from an external
 * integration step (HTTP 401/403, expired token, missing scope)". It recovers
 * after a call has already failed. That is a different guarantee from never
 * letting the call fail, and the difference is exactly what an unattended
 * nightly job depends on.
 *
 * It absorbed the ask anyway: it fuzzy-matched the bare word "token" out of its
 * `detect_token_expiry` capability, and one claimed word inside a clause clears
 * the whole clause. So the plan asserted coverage of a capability the registry
 * does not have — the same overclaim shape MAR-540 records for approval binding,
 * and the reason this correction is the one must-fix on MAR-551 whether or not a
 * lifecycle component is ever built.
 *
 * The rule is deliberately keyed on the COMPONENT that would satisfy it rather
 * than on a claim: `PROACTIVE_REFRESH_COMPONENTS` is empty today because nothing
 * in the registry declares proactive refresh, and populating it is all that a
 * future component needs to do to make the gap stop being reported. A phrase
 * check alone would have been dismissed by the same "token" claim that caused
 * the bug.
 */
const PROACTIVE_TOKEN_LIFECYCLE = [
  "token refreshed",
  "tokens refreshed",
  "refresh the token",
  "refreshing the token",
  "refresh the oauth token",
  "refresh the access token",
  "token refresh",
  "keep the token",
  "keeping the token",
  "keep the oauth token",
  "keeping the oauth token",
  "token lifecycle",
  "before it expires",
  "before the token expires",
  "rotate the token",
  "rotating the token",
  "credential refresh",
  "refresh credentials",
  "refresh the credential",
];

/**
 * Components that would genuinely satisfy a proactive-refresh ask. Empty on
 * purpose: no component in the registry schedules a pre-expiry refresh today.
 * `auth_failure_handler` is NOT a member — see the note above.
 */
const PROACTIVE_REFRESH_COMPONENTS = new Set<string>();

/**
 * MAR-396 — structural action-clause detection, used ONLY for clauses the
 * demand lexicon did not recognise at all.
 *
 * The lexicon can never be complete: "issue a refund", "revoke a credential",
 * "evict a lease" are all workflow steps built from words no fixed vocabulary
 * would contain. So the unknown case is decided by SHAPE rather than by
 * membership — a clause reads as an action when it is a verb phrase applied to
 * an object: `[openers] VERB … DETERMINER NOUN`.
 *
 * This is deliberately the narrow, high-precision half of the judgement. A
 * clause reaching this test already has zero known demand vocabulary, so the
 * only question left is "does this look like work at all?" — and the cost of a
 * false positive (a spurious gap) is much lower than the cost of the false
 * negative this issue is about (a silently dropped money transfer).
 */

/**
 * Words that can open a clause without being its action verb: subordinators,
 * prepositions, pronouns, auxiliaries, contraction remnants and sequencing
 * adverbs. Skipped when hunting for the verb candidate, so "When I ask" tests
 * "ask" and "I'll approve each one" tests "approve".
 */
const CLAUSE_OPENERS = new Set([
  "when", "if", "after", "before", "while", "once", "whenever", "unless",
  "until", "as", "on", "in", "at", "for", "with", "from", "to", "by", "of",
  "so", "that", "which", "who", "then", "there", "here", "also", "just",
  "only", "first", "next", "finally", "please", "let",
  "i", "you", "we", "they", "he", "she", "it", "me", "us", "them",
  "ll", "ve", "re", "don", "doesn", "didn", "won", "isn", "aren",
  "can", "could", "should", "would", "will", "shall", "may", "might", "must",
  "do", "does", "did", "is", "are", "was", "were", "be", "been", "being", "am",
  "have", "has", "had", "want", "wants", "need", "needs",
  "not", "never", "no", "always", "automatically", "manually", "fully",
  "every", "each", "all", "any", "some", "this", "these", "those",
]);

/**
 * Determiners and possessives that open an object noun phrase. Finding one
 * AFTER the verb candidate is what turns "issue …" into "issue THE refund" —
 * a verb with something to act on, i.e. a step.
 */
const OBJECT_MARKERS = new Set([
  "the", "a", "an", "our", "my", "your", "their", "its", "his", "her",
  "this", "that", "these", "those", "each", "every", "all", "any", "one",
  "both", "another",
]);

/**
 * Indirect objects that make the clause a delivery to the USER in the current
 * channel ("give me a summary", "show us the result"). The assistant surface
 * satisfies these by construction, so they are output, not uncovered work.
 * Without this rule the read-only inbox-summary goal reports its own answer as
 * a missing step.
 */
const USER_RECIPIENTS = new Set(["me", "us"]);

/**
 * True when a clause with NO known demand vocabulary still reads as a step that
 * NOTHING in the route claims.
 *
 * Two independent conditions, and both must hold:
 *
 *   (a) SHAPE — the clause is a verb applied to an object, not negated, not a
 *       delivery to the user.
 *   (b) UNCLAIMED — no content word in the clause was matched by any route
 *       component.
 *
 * (b) is what keeps this honest rather than merely loud. The recognized path
 * has always checked claims (`clauseIsUncovered`); an unrecognized clause that
 * skipped that check would flag work the route genuinely does under different
 * words — "keeps a change log for 30 days" is carried by `audit_log`, and
 * "reads new leads from Gmail" by `email_read`, even though neither clause
 * contains a lexicon token. Flagging those would make the honesty layer cry
 * wolf on validated playbooks, and a gap report nobody trusts is worth less
 * than no gap report at all.
 */
function looksLikeUnrecognizedAction(
  clause: string,
  goalLower: string,
  claimedTokens: Set<string>,
): boolean {
  const words = clause.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let i = 0;
  while (i < words.length && CLAUSE_OPENERS.has(words[i])) i += 1;
  const verb = words[i];
  // Nothing but function words, or a bare one/two-letter token: not a step.
  if (verb === undefined || verb.length < 3) return false;
  // A negated verb is a CONSTRAINT ("never send the email", "do not delete any
  // record"), and constraints must never read as demand — that would invert the
  // safety meaning of the goal. Checked against the whole goal so a negation
  // sitting just before the clause boundary still counts.
  if (isNegatedInContext(goalLower, verb)) return false;
  // "give me a summary" — delivery to the user, already satisfied in-channel.
  if (words[i + 1] !== undefined && USER_RECIPIENTS.has(words[i + 1])) return false;
  // (a) shape: a verb with something to act on.
  if (!words.slice(i + 1).some((w) => OBJECT_MARKERS.has(w))) return false;
  // (b) claim: any route component already speaking to this clause clears it.
  const contentWords = words.filter(
    (w) => w.length > 2 && !CLAUSE_OPENERS.has(w) && !OBJECT_MARKERS.has(w),
  );
  return !contentWords.some((w) => isClaimed(w, claimedTokens));
}

/**
 * Clause boundaries: punctuation and step conjunctions. "and" is included so a
 * long conjunction chain reports each uncovered step as its own readable phrase
 * ("…trusted sources AND save a digest note into Notion" → the Notion step
 * surfaces whole instead of being truncated off the end of a mega-clause).
 *
 * MAR-550: a period followed immediately by a word character is a FILE
 * EXTENSION, not a sentence end. "load a local .xlsx spreadsheet, validate every
 * row, …" used to split into the fragment "load a local", which named no
 * component, matched no claim, and was reported as an uncovered step — a gap the
 * plan had invented out of a filename. A sentence end ("…every morning. Then
 * send…") still splits, because the period there is followed by a space.
 */
const CLAUSE_SPLIT = /[,;:!?—–]|\.(?!\w)|\bthen\b|\band\b/;

/**
 * Safety / policy infrastructure the augmenter injects deterministically for
 * routes like these (MAR-88/117 chains). When one of them ALSO happens to
 * fuzzy-match the goal first (audit_log scored on the token "every"; observed
 * in the MAR-250 audit), it lands via the matcher instead of the augmenter —
 * but it is still policy-justified, never unsupported supply.
 */
const SAFETY_INFRA_COMPONENTS = new Set([
  "human_approval_gate",
  "audit_log",
  "schema_validation",
  "auth_failure_handler",
  "retry_policy",
  "state_store",
]);

const CLAUSE_MAX_CHARS = 80;

function tokenizeWords(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
}

/**
 * A demand item is claimed when any selected component's matched token equals
 * it or contains/is contained by it (≥3 chars both sides) — so "emails" is
 * claimed by the "email" hint, "replies" by "reply", and words inside a
 * multi-word hint ("every morning", "human review") claim their parts.
 */
function isClaimed(item: string, claimedTokens: Set<string>): boolean {
  if (claimedTokens.has(item)) return true;
  for (const t of claimedTokens) {
    if (t.length < 3 || item.length < 3) continue;
    if (t.includes(item) || item.includes(t)) return true;
  }
  return false;
}

/**
 * MAR-549: claiming a multi-word artifact needs more than one of its words.
 *
 * `isClaimed`'s containment rule is right for inflection ("emails" claimed by
 * "email") and wrong for a compound name: `data_normalizer` fuzzy-matched the
 * bare word "source" from its own summary prose, and that single word claimed
 * the whole phrase "source link" — so "write the leads to a spreadsheet **with a
 * source link on every row**" reported no gap on a route that records no source
 * link. Adding the phrase to the demand lexicon alone would not have been
 * enough; it would have been heard and then immediately dismissed.
 *
 * A phrase is claimed when a claimed token contains it outright, or when a
 * claimed token that is ITSELF multi-word sits inside it — so `file_storage`'s
 * "google sheet" hint still claims "google sheets", while a lone "source" does
 * not claim "source link".
 */
function isPhraseClaimed(phrase: string, claimedTokens: Set<string>): boolean {
  if (claimedTokens.has(phrase)) return true;
  for (const t of claimedTokens) {
    if (t.includes(phrase)) return true;
    if (phrase.includes(t) && tokenizeWords(t).length >= 2) return true;
  }
  return false;
}

/**
 * Nouns anchor the verdict: when a clause names demand-noun UNITS, it is
 * uncovered iff ANY unit is unclaimed. A clause with only demand verbs is
 * uncovered iff ALL of them are unclaimed — verbs are too generic for a single
 * miss to outweigh a claimed sibling ("post it to our team Slack channel" is
 * covered by the claimed `slack` even though `post` isn't).
 *
 * A UNIT is a compound: demand nouns within 2 words of each other in the clause
 * ("our Postgres database", "PDF summary report") name ONE system/artifact, and
 * the unit is claimed when ANY member is. Without grouping, "Postgres database"
 * false-alarmed after MAR-254: db_read claims `postgres` but no phrase claims
 * the adjacent `database`, and a covered step read as an uncovered one.
 */
function clauseIsUncovered(
  nounUnits: string[][],
  verbs: string[],
  claimedTokens: Set<string>,
): boolean {
  if (nounUnits.length > 0) {
    return nounUnits.some((unit) =>
      unit.every((n) =>
        // A multi-word unit member came from DEMAND_PHRASES; it needs the
        // stricter claim (MAR-549), so one word of it cannot dismiss the whole.
        n.includes(" ") ? !isPhraseClaimed(n, claimedTokens) : !isClaimed(n, claimedTokens),
      ),
    );
  }
  if (verbs.length > 0) {
    return verbs.every((v) => !isClaimed(v, claimedTokens));
  }
  return false;
}

/**
 * Group a clause's demand nouns into compound units: nouns whose word positions
 * are within `maxGap` of each other merge ("pdf … report" with "summary"
 * between them is one artifact). Multi-word phrase hits are their own unit.
 */
function groupNounUnits(
  words: string[],
  phraseHits: string[],
  isDemandNoun: (w: string) => boolean,
): string[][] {
  const MAX_GAP = 2;
  const units: string[][] = [];
  let current: string[] = [];
  let lastIdx = -Infinity;
  words.forEach((w, i) => {
    if (!isDemandNoun(w)) return;
    if (i - lastIdx > MAX_GAP && current.length > 0) {
      units.push(current);
      current = [];
    }
    current.push(w);
    lastIdx = i;
  });
  if (current.length > 0) units.push(current);
  for (const p of phraseHits) units.push([p]);
  return units;
}

export type CoverageInput = {
  goal: string;
  /** Matcher matches restricted to components present in the FINAL route. */
  routeMatches: CapabilityMatch[];
  /** Final route component ids (matcher-selected + injected). */
  finalComponentIds: string[];
  /**
   * Components added by policy rather than by the matcher (safety augmenter,
   * `requires` expansion, prerequisite chain). Policy additions are supported
   * by construction and never count as unsupported supply.
   */
  injectedComponentIds: Set<string>;
  /**
   * "playbook" plans serve a validated fixed component set — unsupported-supply
   * accounting does not apply to it (the set is evidence-backed as a whole).
   */
  mode?: "composed" | "playbook";
  /**
   * Registry-grounded descriptions of a validated route/playbook. These let
   * coverage credit semantics carried by the fixed route even when no single
   * component matcher token names them (for example, "competitor pages" in the
   * competitor-price playbook). Composed plans must not provide these claims.
   */
  groundedClaimTexts?: string[];
};

export function computeCoverage(input: CoverageInput): Coverage {
  const { goal, routeMatches, finalComponentIds, injectedComponentIds } = input;
  const mode = input.mode ?? "composed";
  const goalLower = goal.toLowerCase();

  // ── matched: each route component's claimed goal tokens ──
  const matched = routeMatches
    .filter((m) => finalComponentIds.includes(m.component.id))
    .map((m) => ({
      component_id: m.component.id,
      tokens: [...m.matched_tokens].sort(),
    }))
    .sort((a, b) => a.component_id.localeCompare(b.component_id));

  // Claimed-token set: every token any route component matched on, plus the
  // words inside multi-word hint tokens.
  const claimedTokens = new Set<string>();
  for (const m of matched) {
    for (const token of m.tokens) {
      claimedTokens.add(token);
      for (const w of tokenizeWords(token)) claimedTokens.add(w);
    }
  }
  if (mode === "playbook") {
    for (const claimText of input.groundedClaimTexts ?? []) {
      for (const word of tokenizeWords(claimText)) claimedTokens.add(word);
    }
  }

  // ── unmatched demand: clause-by-clause ──
  const unmatched_demand: string[] = [];
  const unrecognized_demand: string[] = [];
  for (const rawClause of goal.split(CLAUSE_SPLIT)) {
    const clause = rawClause.trim();
    if (clause.length < 4) continue;
    const clauseLower = clause.toLowerCase();

    const words = tokenizeWords(clause);
    // A negated demand word is a constraint ("never send", "no emails"), not a
    // step — check negation against the FULL goal so a negation just before the
    // clause boundary still counts.
    const phraseHits = DEMAND_PHRASES.filter(
      (p) => clauseLower.includes(p) && !isNegatedInContext(goalLower, p),
    );
    const nounUnits = groupNounUnits(
      words,
      phraseHits,
      (w) => DEMAND_NOUNS.has(w) && !isNegatedInContext(goalLower, w),
    );
    const verbs = words.filter(
      (w) => DEMAND_VERBS.has(w) && !isNegatedInContext(goalLower, w),
    );
    const shown =
      clause.length > CLAUSE_MAX_CHARS
        ? `${clause.slice(0, CLAUSE_MAX_CHARS - 1).trimEnd()}…`
        : clause;

    // MAR-540 bar #1: an approval-provenance ask, which no component in the
    // registry satisfies and which `human_approval_gate`'s own "approve" claim
    // was absorbing. Checked before the lexicon so that claim cannot dismiss it.
    if (
      APPROVAL_BINDING_PHRASES.some(
        (p) => containsPhrase(clauseLower, p) && !isNegatedInContext(goalLower, p),
      ) &&
      !finalComponentIds.some((id) => APPROVAL_BINDING_COMPONENTS.has(id))
    ) {
      unmatched_demand.push(shown);
      continue;
    }

    // MAR-551: a proactive credential-lifecycle ask, which no component in the
    // registry satisfies and which `auth_failure_handler`'s reactive recovery
    // was silently absorbing through a bare "token" claim. Checked before the
    // lexicon so that claim cannot dismiss it.
    if (
      PROACTIVE_TOKEN_LIFECYCLE.some(
        (p) => clauseLower.includes(p) && !isNegatedInContext(goalLower, p),
      ) &&
      !finalComponentIds.some((id) => PROACTIVE_REFRESH_COMPONENTS.has(id))
    ) {
      unmatched_demand.push(shown);
      continue;
    }

    // MAR-396: the clause carries no lexicon vocabulary. It used to `continue`
    // here — judged "not a demand" — which is how a refund step disappeared
    // from a plan without a trace. Decide it by SHAPE instead: if it reads as
    // a verb applied to an object, it is a step we could not parse, and
    // silence about it is the one answer that is definitely wrong.
    if (nounUnits.length === 0 && verbs.length === 0) {
      if (looksLikeUnrecognizedAction(clause, goalLower, claimedTokens)) {
        unrecognized_demand.push(shown);
        unmatched_demand.push(shown);
      }
      continue;
    }

    if (clauseIsUncovered(nounUnits, verbs, claimedTokens)) {
      unmatched_demand.push(shown);
    }
  }

  // ── unsupported supply: fuzzy-evidence-only route components ──
  let unsupported_supply: string[] = [];
  if (mode === "composed") {
    unsupported_supply = routeMatches
      .filter(
        (m) =>
          finalComponentIds.includes(m.component.id) &&
          !injectedComponentIds.has(m.component.id) &&
          !SAFETY_INFRA_COMPONENTS.has(m.component.id) &&
          !m.evidence.includes("hint") &&
          !m.evidence.includes("segment"),
      )
      .map((m) => m.component.id)
      .sort();
  }

  // full    — nothing missing, nothing unjustified.
  // partial — a single soft gap: one uncovered step OR unjustified extras only.
  //           (Extras alone are a verify-list, not a broken plan.)
  // poor    — several uncovered steps, or an uncovered step alongside
  //           unjustified extras, or extras piling up: the route needs rework.
  const unmatchedN = unmatched_demand.length;
  const unsupportedN = unsupported_supply.length;
  const coverage_label: CoverageLabel =
    unmatchedN === 0 && unsupportedN === 0
      ? "full"
      : unmatchedN >= 2 || (unmatchedN >= 1 && unsupportedN >= 1) || unsupportedN >= 3
      ? "poor"
      : "partial";

  return { matched, unmatched_demand, unrecognized_demand, unsupported_supply, coverage_label };
}
