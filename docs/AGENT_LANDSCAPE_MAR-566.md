# Agent landscape scoring — 22 advanced agents against the capabilities DASH/MCP care about

- **Issue:** MAR-566
- **Date:** 2026-08-23
- **Type:** Research. Docs-only. **Nothing was filed** — the three issues at the end are proposals.
- **Owner:** Henrik
- **Method:** fresh web research, primary vendor documentation wherever it could be fetched, cross-referenced against OrchestrateLab's live signal-triage clusters.

## Why this exists

MAR-566 asks a build-order question: before we build another registry component, which
of the things we could build are already solved better by somebody else, and which are
the ones nobody is solving. The way to answer that is not to read one comparison blog
post; it is to read the *permission model, approval semantics and audit contract* of the
agents people actually run, and score them on the six axes that decide whether a plan
from OrchestrateMCP survives contact with a real runtime.

Two things bound the answer honestly:

1. **We never execute.** OrchestrateMCP is stateless and read-only and makes no LLM calls
   inside its tools ([README.md](../README.md),
   [PUBLIC_CLAIM_LEDGER.md](PUBLIC_CLAIM_LEDGER.md)). DASH observes and requests; the Agent
   Runner executes. So "they beat us at X" is often not a defeat — it is a different job.
   The scoring below separates *they do it and we should copy the shape into the registry*
   from *they do it and we should never do it*.
2. **Demand is measured, not guessed.** The registry-component column is cross-referenced
   against LAB's live `signal_triage` table, not against intuition. See
   [Appendix A](#appendix-a--labs-live-demand-clusters-2026-08-23).

---

## The six axes

| Axis | The question it answers | Why DASH/MCP care |
| --- | --- | --- |
| **Planning honesty** | When the plan cannot do something, does the reader find out *before* running it? | This is MCP's whole product. Coverage accounting, `unmatched_demand`, held claims. |
| **Approval gates** | Can a human stop an action, and is the approval bound to the action that actually runs? | MAR-540. Our #1 live demand cluster (38 questions). |
| **Connection legibility** | Does the system say which connections a plan needs, how to acquire them, and whether that path is actionable *for this user*? | MAR-494, the `dash_managed` ownership signal, DASH's Connection Center. |
| **Supervision surface** | After a run, can a human reconstruct what happened from a durable record? | LAB's fleet health, plan-vs-actual, gate compliance. `audit_log` is our #2 cluster (35). |
| **Runtime residency** | Where does the process live, who owns it, and is that boundary real or rhetorical? | DASH's "never hosts" boundary and the separate Agent Runner process. |
| **Browser/file tool harnesses** | What can it actually touch — shell, files, a browser, a mailbox? | The thing we deliberately do not build, and therefore must plan *for*. |

### Scoring scale

| Score | Meaning |
| --- | --- |
| **0** | Absent, or explicitly out of scope. |
| **1** | Present as a mode or a setting. No binding, no persistence, no documented contract. |
| **2** | A real documented mechanism a reader can rely on. |
| **3** | Mechanism **plus** one of: binding to the specific action, durable persistence, or a published audit contract. |

**Evidence grade** on each row: **P** = I fetched and read the vendor's own documentation
page cited in [Sources](#sources). **S** = search-result summary only; the row is directionally
right but I did not open a primary page, and the score is capped at what the summary supports.

---

## Scoreboard

Ordered by total. `Plan` / `Appr` / `Conn` / `Supv` / `Resd` / `Harn` map to the six axes above.

| # | Agent | Plan | Appr | Conn | Supv | Resd | Harn | **Total** | Grade |
| --- | --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| 1 | **Claude Code / Claude Agent SDK** | 2 | 3 | 2 | 2 | 3 | 3 | **15** | P |
| 2 | **OpenClaw** | 1 | 3 | 2 | 2 | 3 | 3 | **14** | P |
| 3 | **Devin (Cognition)** | 3 | 2 | 2 | 2 | 2 | 3 | **14** | P |
| 4 | **Microsoft Agent Framework** | 2 | 3 | 2 | 3 | 2 | 2 | **14** | P |
| 5 | **Hermes Agent (Nous Research)** | 1 | 3 | 2 | 1 | 3 | 3 | **13** | P |
| 6 | **OpenAI Codex** | 1 | 3 | 2 | 1 | 3 | 2 | **12** | P |
| 7 | **Gemini CLI** | 2 | 3 | 2 | 1 | 2 | 2 | **12** | P |
| 8 | **OpenHands** | 1 | 3 | 1 | 2 | 2 | 3 | **12** | P |
| 9 | **Dify** | 1 | 3 | 2 | 3 | 2 | 1 | **12** | P |
| 10 | **n8n** | 1 | 3 | 2 | 2 | 2 | 2 | **12** | P |
| — | **_OrchestrateMCP + DASH + LAB (us)_** | _3_ | _1_ | _3_ | _2_ | _2_ | _1_ | **_12_** | — |
| 11 | **Strands Agents (AWS)** | 1 | 3 | 1 | 3 | 2 | 1 | **11** | S |
| 12 | **OpenAI Agents SDK / AgentKit** | 1 | 3 | 1 | 3 | 1 | 1 | **10** | P |
| 13 | **Google ADK** | 1 | 2 | 1 | 3 | 2 | 1 | **10** | P |
| 14 | **Cursor** | 1 | 2 | 1 | 1 | 3 | 2 | **10** | P |
| 15 | **LangGraph** | 1 | 3 | 1 | 2 | 1 | 1 | **9** | P |
| 16 | **Goose (Block)** | 1 | 2 | 1 | 1 | 2 | 2 | **9** | P |
| 17 | **Mastra** | 1 | 2 | 1 | 2 | 1 | 1 | **8** | P |
| 18 | **Temporal** | 0 | 3 | 0 | 3 | 2 | 0 | **8** | P |
| 19 | **browser-use** | 0 | 0 | 1 | 1 | 2 | 3 | **7** | P |
| 20 | **CrewAI** | 0 | 1 | 1 | 1 | 1 | 1 | **5** | P |
| 21 | **Letta (MemGPT)** | 0 | 0 | 0 | 1 | 2 | 1 | **4** | P |
| 22 | **Manus** | — | — | — | — | — | — | **n/a** | ✗ |

**Read the total loosely.** It is a sum across axes that are not equally important to us,
and a coding agent scoring 15 is not "better" than Temporal scoring 8 — Temporal is not
trying to browse the web. The column that matters for build order is **Appr**, and the
column that matters for our moat is **Plan**.

**Manus is deliberately unscored.** `manus.im/blog/manus-browser-operator` and
`manus.im/help/browser-operator` both returned a scheduled-maintenance notice on
2026-08-23 ("access will resume at 8:00 a.m. on August 25 (SGT)"). Everything available
was third-party review copy. Scoring it from that would be exactly the free-prose-over-evidence
failure `AGENTS.md` forbids, so it stays blank until a primary page can be read.

### Two facts the scoreboard makes obvious

**First: approval gating is a solved problem everywhere except in our registry.**
Fourteen of the twenty-one scored systems score 3 on **Appr**. Our own `human_approval_gate`
declares its outputs as `approved | rejected | timeout decision` and its
`recommended_with` as `audit_log` alone
([registry/components/human_approval_gate.component.yaml](../registry/components/human_approval_gate.component.yaml)).
That is a decision with no identity attached to what was decided — precisely the gap
[ADR MAR-540](ADR-MAR-540-approval-provenance.md) named, and the field has since shipped
four distinct better answers to it.

**Second: nobody else does planning honesty, and one of them does the opposite.**
CrewAI's `planning=True` sends all crew information to an `AgentPlanner` whose output is
appended to each task description; the documentation shows no capability validation, no
feasibility check, and no human gate ([docs.crewai.com](https://docs.crewai.com/en/concepts/planning)).
That is a plan with a confidence signal and no coverage accounting behind it — the
failure mode `unmatched_demand` exists to prevent. Devin is the one system that beats us
here, and it beats us on a *different* dimension (see below).

---

## Per-agent findings

Each entry: what they do better than us · what we do that they cannot · what their users keep asking for, mapped to our registry.

### 1. Claude Code / Claude Agent SDK — 15 (P)

**Better than us.** The most rigorously *documented* permission model in the set. Six-step
evaluation order — hooks, deny rules, ask rules, permission mode, allow rules,
`canUseTool` — with deny beating `bypassPermissions` and `PreToolUse` hooks running before
everything. Rules are scoped to tool *and* argument pattern (`Bash(rm *)`,
`Edit(//secrets/**)`), and the anchor semantics of `//path` versus `/path` are spelled out
([code.claude.com](https://code.claude.com/docs/en/agent-sdk/permissions)).

The part worth stealing is not a feature, it is a **warning**: "Auto-approved tools never
reach `canUseTool`… so permission checks you put there are silently bypassed for that
tool." A vendor documenting the hole in its own gate is the same discipline as
`unmatched_demand`. Same page documents that subagents inherit `bypassPermissions` and
cannot override it — an escalation path stated rather than hidden.

**We cannot be beaten on.** Nothing here tells a user *which connections a workflow needs
and whether they can get them*. Permissions are about a tool the client already has.

**Their users ask for:** `human_approval_gate` (38), `audit_log` (35) — the org-level
`ask` controls on connector tools exist because someone needed an approval an individual
could not switch off.

### 2. OpenClaw — 14 (P)

**Better than us — and this is the single most important finding in the document.**
OpenClaw binds an approval to the exact execution it approved. From
[docs/tools/exec-approvals.md](https://github.com/openclaw/openclaw/blob/main/docs/tools/exec-approvals.md):

> "Approved node-host runs bind canonical execution context: cwd, exact argv, env binding
> when present, and pinned executable path when applicable."

and, for shell scripts, it "tries to bind one concrete local file operand. If that file
changes after approval but before execution, the run is denied instead of executing
drifted content."

That is MAR-540's "what I approved is exactly what ran", implemented, in an open-source
project, with drift-denial on top. Modes are `deny` / `allowlist` / `ask` / `auto` / `full`;
allowlists are per-agent with `argPattern` regexes and carry `lastUsedAt`,
`lastResolvedPath`, `lastUsedCommand` audit metadata.

The audit contract is equally specific
([docs.openclaw.ai/gateway/audit](https://docs.openclaw.ai/gateway/audit)): a
"bounded, metadata-only audit ledger" in `state/openclaw.sqlite`, capped at 100,000 rows
and 30 days, recording `agent.run.started` / `finished` and `tool.action.started` /
`finished`, each with "a stable event id, a monotonic owner sequence, a lifecycle
timestamp, actor, action, status, `schemaVersion: 1`, and `redaction: metadata_only`". It
"never stores prompts, message bodies, tool arguments, tool results, attachments,
filenames, URLs, command output, or raw error text" — and operator approvals are held as
a *separate authoritative source* projected into decision receipts rather than copied
into the ledger.

**Where it falls down, usefully.** [Issue #65486](https://github.com/openclaw/openclaw/issues/65486)
reports that `ExecApprovalManager` "stores all pending approvals in a plain in-memory
`Map<string, PendingEntry>` with no disk persistence", so a gateway restart wipes them
while session JSONL files replay the old approval IDs — an `INVALID_REQUEST` loop. The
best approval-binding in the field has no approval-state durability. That is
`human_approval_gate` (38) needing `state_store` (26), demonstrated in production.

**We cannot be beaten on.** OpenClaw's security guide is candid that it "is not a hostile
multi-tenant security boundary" and that the sandbox is opt-in and off by default
([docs.openclaw.ai/gateway/security](https://docs.openclaw.ai/gateway/security)). It
describes what a running agent may do; it has nothing that tells you, before you build,
that your plan's Gmail step has no actionable acquisition path on this machine.

**Their users ask for:** `human_approval_gate` (38), `audit_log` (35), `state_store` (26),
`auth_failure_handler` (11) — the last from the pairing/scope-upgrade failure threads.

### 3. Devin (Cognition) — 14 (P)

**Better than us, on the axis we thought was ours.** Devin's Interactive Planning produces
a plan containing "Relevant files", "Key findings from its initial analysis" and
"Implementation questions", with code citations that "deep-link directly into the Devin
IDE" — and a **"Wait for my approval"** setting that makes the plan itself the gate
([docs.devin.ai](https://docs.devin.ai/work-with-devin/interactive-planning)).

Our planning honesty is *accounting* honesty: we say what the plan does not cover. Devin's
is *grounding* honesty: every plan step points at the real file it will touch, and the
human approves the plan before any code runs. Those are complementary, and we have only
one of them. A route that cited the concrete artefacts it expects to exist would be a
strictly better route.

**We cannot be beaten on.** Devin plans inside one repository it has already cloned. It
has no notion of a workflow spanning services the user does not yet have credentials for,
and its enterprise security page documents a Secrets Manager but no audit-log retention
policy ([docs.devin.ai](https://docs.devin.ai/enterprise/security-access/security/enterprise-security)).

**Their users ask for:** `plan_generation` (9), `codebase_scan` (3), `code_editing` (3),
`audit_log` (35) — the SOC 2 posture exists because buyers demanded a record.

### 4. Microsoft Agent Framework — 14 (P)

**Better than us.** The only entry with approval, durability and telemetry as one
integrated story. The Harness agent ships "planning and todo tracking, context compaction,
file access and memory, **don't-ask-again tool approval**, and observability", and the
framework adds "a robust state management system for long-running and human-in-the-loop
scenarios" plus native OpenTelemetry
([learn.microsoft.com](https://learn.microsoft.com/en-us/agent-framework/overview/)).

"Don't ask again" is an interesting borrow *and* an interesting hazard — it is a
persisted approval decision, which is exactly what we need, applied to a tool rather than
to an action, which is exactly the over-broad grant MAR-540 warns about.

**We cannot be beaten on.** Its own docs push responsibility for third-party systems back
to the developer: "It is your responsibility to manage whether your data will flow outside
of your organization's Azure compliance and geographic boundaries… and that appropriate
permissions, boundaries and approvals are provisioned." That is a disclaimer where we
emit a structured answer.

**Their users ask for:** `human_approval_gate` (38), `audit_log` (35), `state_store` (26),
`retry_policy` (14).

### 5. Hermes Agent (Nous Research) — 13 (P)

**Better than us.** An eight-layer defence-in-depth model with the clearest *irreducible*
denial in the set: some commands are refused "regardless of `--yolo`" — a hardline
blocklist covering `rm -rf /`, fork bombs and direct device writes
([hermes-agent.nousresearch.com](https://hermes-agent.nousresearch.com/docs/user-guide/security)).
Approvals live in `~/.hermes/config.yaml` under `approvals`, in `smart` (LLM-triaged) /
`manual` / `off` modes, with `approvals.deny` fnmatch globs. MCP subprocesses receive only
safe system variables with secrets stripped unless declared; skills declare
`required_credential_files` mounted read-only; MCP error messages are auto-redacted.
Runtime residency is the broadest of any entry: "6 terminal backends: local, Docker, SSH,
Daytona, Singularity, Modal" ([docs](https://hermes-agent.nousresearch.com/docs/)).

**We cannot be beaten on.** By its own documentation Hermes "maintains no explicit audit
trail feature" — session data in `~/.hermes/state.db` and logs in `~/.hermes/logs/`. Strong
gate, weak record. And nothing describes connection acquisition.

**Their users ask for:** `audit_log` (35) — the absent thing — plus `human_approval_gate`
(38), `file_storage` (11), `state_store` (26).

### 6. OpenAI Codex — 12 (P)

**Better than us.** The cleanest separation of *what may be touched* from *when to ask*:
`sandbox_mode` (`read-only` / `workspace-write` / `danger-full-access`) is orthogonal to
approval policy (`untrusted` / `on-request` / `never`), with an optional **auto-review**
mode routing eligible requests through an automatic reviewer before execution. Network is
off by default; when enabled, `network_proxy` allowlisting applies where "deny always wins
over allow". Approval is required for "side-effecting app and MCP tool calls" when the
tool advertises destructive annotations
([learn.chatgpt.com](https://learn.chatgpt.com/docs/agent-approvals-security)).

Also worth noting for the claim ledger: OpenAI states the limitation plainly — "prompt
injection can cause the agent to fetch and follow untrusted instructions" — inside a page
about the sandbox.

**We cannot be beaten on.** The MCP destructive-annotation trigger is per-tool metadata
supplied by the tool author. We can say, at design time, that a *route* contains an
irreversible external write, before any tool is chosen.

**Their users ask for:** `human_approval_gate` (38), `schema_validation` (11),
`auth_failure_handler` (11).

### 7. Gemini CLI — 12 (P)

**Better than us.** The most legible policy *composition* model found. Rules carry
`toolName`, `argsPattern`, `commandPrefix` / `commandRegex`, `mcpName`, `subagent`, a
`decision` of `allow` / `deny` / `ask_user`, and a numeric priority; precedence is an
arithmetic formula — `final_priority = tier_base + (toml_priority / 1000)` over tiers
Default(1), Extension(2), Workspace(3), User(4), Admin(5) — persisted as `.toml` under
`~/.gemini/policies/` and an OS-specific admin path
([github.com/google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md)).

Two honesty details worth copying. `ask_user` is "treated as deny in non-interactive
mode" — the unattended degradation is stated, not discovered. And approvals *cascade*:
"Approvals in plan mode represent an intentional choice to trust a tool globally, with the
resulting rule explicitly including all modes (plan, default, autoEdit, and yolo)." That
is a documented over-grant. We have no equivalent statement about how gates compose in a
route.

**We cannot be beaten on.** Precedence between rules is not the same as coverage of a
goal. Nothing here reports that a requested capability has no rule, no tool and no path.

**Their users ask for:** `human_approval_gate` (38), `intent_classifier` (14),
`auth_failure_handler` (11).

### 8. OpenHands — 12 (P)

**Better than us.** Approval as typed program state rather than a UI prompt:
`AlwaysConfirm()` / `NeverConfirm()` / `ConfirmRisky()` policies, an
`AgentExecutionStatus.WAITING_FOR_CONFIRMATION` state, `ConversationState.get_unmatched_actions()`
to enumerate what is pending, and `conversation.reject_pending_actions()` carrying
explanatory feedback back to the agent. Risk is a first-class enum — `LOW` / `MEDIUM` /
`HIGH` / `UNKNOWN` — assessed by a pluggable `SecurityAnalyzerBase`, with an
`LLMSecurityAnalyzer` using a separate model plus deterministic `PatternSecurityAnalyzer`,
`PolicyRailSecurityAnalyzer` and `EnsembleSecurityAnalyzer`
([docs.openhands.dev](https://docs.openhands.dev/sdk/guides/security)).

`get_unmatched_actions()` is a supervision primitive we do not have a component for: *the
set of things this run wanted to do and has not yet been allowed to do*.

**We cannot be beaten on.** The same page documents no sandboxing, approval persistence
or audit logging, and enforcement is "policy-based rather than hard-blocking at execution
boundaries". `UNKNOWN` is an honest risk value; what it does *not* do is force the plan to
say so up front.

**Their users ask for:** `human_approval_gate` (38), `audit_log` (35),
`threshold_router` (3) — the risk-level routing shape.

### 9. Dify — 12 (P)

**Better than us, on vocabulary.** Dify's Human Input node lets the reviewer **approve /
edit / comment / forward / regenerate**, with pre-filled editable fields, delivered by Web
App or email, resuming "along the corresponding branch"
([dify.ai blog](https://dify.ai/blog/the-human-input-node-bringing-human-judgment-into-automated-workflows)).

Our `human_approval_gate` can express two of those five. *Edit* (approve a modified
payload) and *forward* (escalate to a different approver) are unrepresentable in a
component whose declared output is `approved | rejected | timeout decision` — and both
appear repeatedly in LAB's triage notes. This is the cheapest high-value registry fix in
the document.

**We cannot be beaten on.** Dify's honesty is per-node, not per-goal. It shows you what
each node did; it does not tell you the workflow you described cannot be built with the
nodes available.

**Their users ask for:** `human_approval_gate` (38), `reviewer_notification`,
`audit_log` (35), `data_normalizer` (16).

### 10. n8n — 12 (P)

**Better than us.** Approval moved from *review the output* to *review the call*. Any tool
on an AI Agent node can be added to the human-review step's tool connector; when the agent
tries to use it, the workflow pauses and the reviewer is shown `$tool.name` ("the name of
the tool the AI Agent is trying to call") and `$tool.parameters` ("the parameters the AI
Agent is trying to use in the tool call"), typically rendered with
`{{ JSON.stringify($tool.parameters, null, 2) }}`. Approve runs the tool "with the input
specified by the AI"; deny cancels it and "the AI is informed of the rejection". Nine
delivery channels ([docs.n8n.io](https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools)).

`$tool.name` + `$tool.parameters` is the minimum viable approval payload, and it is
exactly the identity our component's `inputs: action summary, proposed payload, risk
context` gestures at without naming.

**We cannot be beaten on.** n8n gates the call but does not bind it — nothing prevents the
parameters from being re-evaluated between approval and execution the way OpenClaw's
drift-denial does. And a plan is only legible after you have wired it.

**Their users ask for:** `human_approval_gate` (38), `data_normalizer` (16),
`scheduled_trigger` (10), `webhook_trigger` (5).

### 11. Strands Agents (AWS) — 11 (S)

**Better than us.** Tool gating as a lifecycle hook: `BeforeToolCallEvent` exposes
`event.tool_use["name"]` and `event.tool_use["input"]`, and can set `event.cancel_tool`
with feedback; `event.interrupt()` pauses the loop for human approval. Observability is
OpenTelemetry trajectories with configurable `trace_attributes`, exported to X-Ray,
CloudWatch or Jaeger ([strandsagents.com](https://strandsagents.com/)).

**We cannot be beaten on.** Trajectory recording is a record of what happened. It is not a
plan-vs-actual comparison, which needs a plan with a contract — which is what
`export_build_brief`'s Plan Passport emits and LAB consumes.

**Their users ask for:** `audit_log` (35), `human_approval_gate` (38), `log_monitor` (4).

### 12. OpenAI Agents SDK / AgentKit — 10 (P)

**Better than us, on the exact thing OpenClaw gets wrong.** A tool marked
`needsApproval: true` causes the run to "record an approval interruption instead of
executing the tool"; the result returns `interruptions` plus a **resumable `state`**, and
you "serialize `state`, store it, and resume later. That's still the same run"
([developers.openai.com](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals)).
Approval durability across process boundaries, with run identity preserved.

Tracing is on by default with `generation_span()`, `function_span()`, `handoff_span()`,
and a `RunConfig.trace_include_sensitive_data` flag that defaults to `True` — and the docs
state that tracing is unavailable under Zero Data Retention
([openai.github.io](https://openai.github.io/openai-agents-python/tracing/)).

**We cannot be beaten on.** Guardrails are described as "single-purpose tripwires", not
coverage. `InputGuardrailTripwireTriggered` fires on a bad input; nothing fires on a goal
the agent cannot serve at all.

**Their users ask for:** `human_approval_gate` (38), `state_store` (26), `audit_log` (35).

### 13. Google ADK — 10 (P)

**Better than us.** Global interception as an architectural primitive: "Plugin hooks are
_global_. You register a Plugin once on the `Runner`, and its hooks apply universally to
every Agent, Model, and Tool it manages" — with plugin callbacks taking precedence over,
and able to skip, per-agent callbacks. Hooks span the lifecycle:
`on_user_message_callback`, `before_run_callback`, `before_agent_callback`,
`before_model_callback`, `before_tool_callback`, `on_tool_error_callback`,
`on_event_callback`, `after_run_callback`. A `before_tool_callback` blocks a tool by
returning a dict instead of `None` ([adk.dev/plugins](https://adk.dev/plugins/)).

The global-versus-local precedence is a policy-composition answer worth having in writing.

**We cannot be beaten on.** Blocking a tool by returning a substitute result is a silent
substitution — the agent proceeds believing the tool ran. That is the shape of failure
`unmatched_demand` exists to make loud.

**Their users ask for:** `human_approval_gate` (38), `audit_log` (35),
`intent_classifier` (14).

### 14. Cursor — 10 (P)

**Better than us.** OS-level enforcement rather than policy: Seatbelt on macOS, Landlock
and seccomp on Linux, `.cursorignore` respected so excluded files are inaccessible, writes
blocked to `.vscode`, `.git/config`, `.git/hooks`. Network access is the main thing that
triggers a prompt, and Cursor reports "Sandboxed agents stop 40% less often than
unsandboxed ones" ([cursor.com/blog](https://cursor.com/blog/agent-sandboxing)) — the only
quantified argument in the set that *a stronger boundary reduces approval fatigue*, which
is the counter-argument to "more gates is always safer".

Their own guidance is admirably unheroic — deny rules "express intent" and should not be
treated as proof an irreversible action is impossible.

**We cannot be beaten on.** A syscall boundary cannot know that a plan needs a Gmail
connection the user does not have.

**Their users ask for:** `file_storage` (11), `human_approval_gate` (38),
`code_editing` (3).

### 15. LangGraph — 9 (P)

**Better than us.** `interrupt()` plus a checkpointer plus a `thread_id` gives durable
pause/resume with time travel, resumed by `Command(resume=value)`
([docs.langchain.com](https://docs.langchain.com/oss/python/langgraph/interrupts)).

The reason it is in this document is its **warning**, which is the best-stated version of
a hazard our registry does not model at all:

> "When execution resumes (after you provide the requested input), the runtime restarts
> the entire node from the beginning—it does not resume from the exact line where interrupt
> was called."

So an approval gate placed after a side effect causes that side effect to run twice. A
correctly-modelled `human_approval_gate` should carry that as a declared failure mode; ours
currently lists timeout stall, ambiguous UI and test-mode bypass, but not
resume-reexecution.

**We cannot be beaten on.** Everything above is runtime. LangGraph has no concept of a
component registry, coverage, or connection acquisition.

**Their users ask for:** `human_approval_gate` (38), `state_store` (26),
`saga_compensation` (6), `retry_policy` (14).

### 16. Goose (Block) — 9 (P)

**Better than us.** Four named modes — Completely Autonomous, Manual Approval, Smart
Approval, Chat Only — with per-tool granularity and a "best effort attempt at classifying
read or write tools" so prompts concentrate on writes
([goose-docs.ai](https://goose-docs.ai/docs/guides/managing-tools/goose-permissions/)).
"Best effort" is honest phrasing for a heuristic.

**We cannot be beaten on.** The same page does not say whether granular tool permissions
persist across sessions. A gate whose durability is undocumented is a gate you cannot
audit.

**Their users ask for:** `human_approval_gate` (38), `local_file_read` (3),
`audit_log` (35).

### 17. Mastra — 8 (P)

**Better than us.** Typed suspension: `suspend()` / `resume()` with `suspendSchema` and
`resumeSchema` declaring the shapes on both sides, plus `bail()` to stop without error;
the suspend payload carries a `reason` such as `{ reason: 'Human approval required.' }`
([mastra.ai](https://mastra.ai/docs/workflows/human-in-the-loop)). A *schema* for what the
approver must return is closer to a contract than most entries manage.

**We cannot be beaten on.** The page I read does not state where snapshots persist, and
does not cover the agent-network tool-approval surface. Contract on the payload, silence
on the durability.

**Their users ask for:** `human_approval_gate` (38), `state_store` (26),
`schema_validation` (11).

### 18. Temporal — 8 (P)

**Better than us.** The strongest audit and identity story of any entry, from a system
that is not an agent framework at all. Approval arrives as a `@workflow.signal` carrying
an `ApprovalDecision`; the handler **compares the incoming `request_id` against
`self.pending_request_id`** and only then updates the decision;
`workflow.wait_condition()` with a `timedelta` waits durably — "for hours, days or
indefinitely; while waiting, the agent consumes no compute resources" — and every
transition lands in workflow history as a "complete audit trail"
([docs.temporal.io](https://docs.temporal.io/ai-cookbook/human-in-the-loop-python)).

That `request_id` check is approval-identity binding in eleven characters, and it is the
runtime analogue of the MCP spec's approver-continuity rule (below).

**We cannot be beaten on.** Temporal has no opinion about what an agent should do, which
connections it needs, or whether the plan covers the goal. It guarantees that whatever you
decided is what replays.

**Their users ask for:** `state_store` (26), `audit_log` (35), `retry_policy` (14),
`saga_compensation` (6), `job_queue` (5) — Temporal is effectively the reference
implementation of four of our registry components at once.

### 19. browser-use — 7 (P)

**Better than us.** It is the harness. A Python library plus a managed cloud that drives
a real browser from natural-language instruction
([docs.browser-use.com](https://docs.browser-use.com/open-source/introduction)).

**Worth recording as a negative result.** The agent-settings page I read exposes
`sensitive_data` ("Dictionary of sensitive data to handle carefully"), `max_failures`
(default 3), `final_response_after_failure` and `max_history_items` — and **no**
`allowed_domains`, no step cap and no human-in-the-loop hook on that page
([docs.browser-use.com](https://docs.browser-use.com/customize/agent-settings)). The most
capable browser harness in the set has the thinnest documented oversight surface of the
set. Any route we publish that recommends browser automation should therefore carry the
gate explicitly, because the harness will not supply one.

**We cannot be beaten on.** Everything except the browser.

**Their users ask for:** `data_scraper` (13), `data_normalizer` (16),
`page_monitor` (2), `human_approval_gate` (38).

### 20. CrewAI — 5 (P)

**Better than us.** Ergonomics. `planning=True` is one flag.

**The cautionary entry.** All crew information goes to an `AgentPlanner` (default
`gpt-4o-mini`, overridable via `planning_llm`) which emits step-by-step markdown appended
to each task description. The documentation shows no capability validation, no feasibility
check, no constraint checking and no human approval step
([docs.crewai.com](https://docs.crewai.com/en/concepts/planning)). This is the artefact
OrchestrateMCP exists to be an alternative to: a confident plan with nothing underneath it
reporting what it cannot do.

**We cannot be beaten on.** Coverage accounting, provenance tagging, corpus contracts in CI.

**Their users ask for:** `plan_generation` (9), `fan_out_collector` (4),
`loop_controller` (2).

### 21. Letta (MemGPT) — 4 (P)

**Better than us, on one axis only, and decisively.** State is server-side, not
client-side: memory blocks (labelled, e.g. `human`, `persona`) persist across separate API
calls and sessions, alongside recall and archival tiers and an Agent File (`.af`) format
([docs.letta.com](https://docs.letta.com/concepts/letta)). Our `state_store` component
describes "key-value or structured state payload" in and "retrieved state or confirmation
of write" out — Letta is what a serious answer to that contract looks like.

**We cannot be beaten on.** No approval model, no connection legibility, no coverage. It
is a memory substrate, correctly scoped.

**Their users ask for:** `state_store` (26), `vector_store` (6),
`knowledge_ingestion` (7).

### 22. Manus — unscored (✗)

Both primary pages returned a maintenance notice on 2026-08-23. Not scored. Worth a second
look after 2026-08-25 specifically for its replay/share surface, which third-party reviews
describe as a shareable full action history — if that is accurate it is a supervision
surface worth studying, but I did not read it and will not score it.

---

## The cross-cutting finding: identity of the approver

Outside the agent vendors, the Model Context Protocol's own 2026-07-28 revision names the
problem our `human_approval_gate` has, in protocol terms. The spec documents an
approval-phishing scenario — Alice starts an approval, tricks Bob into completing it, and
both the CRM log and the MCP server log look normal — and states the mitigation as:

> "The server must make sure that the person who started an approval is the person who
> finished it."

with servers instructed that they "must not take the client's word for it". The same
analysis notes that MCP now makes the **agent** explicit via headers and the **account**
explicit via the OAuth token, but **the person** still has no standardized field, and
approval flows are "the exactly one place" the protocol accounts for human identity
([cakewalk.security](https://www.cakewalk.security/blog/mcp-spec-agent-access-control-accountability)).

Three independent systems converge on the same primitive: Temporal's `request_id` match,
MCP's approver continuity, OpenClaw's canonical-execution binding. Our component models
none of it.

---

## Build / borrow / ignore

Ranked by expected value, where value = (live LAB demand) × (gap between us and the field) ÷ (cost).

| # | Move | What | Why this rank | Evidence |
| --- | --- | --- | --- | --- |
| 1 | **BORROW** | **Bind an approval to the action that runs.** Give `human_approval_gate` an approval identity in its declared outputs, and an `audit_log` relation that carries it. | Our #1 cluster (38) sits on the one component the field has already solved four different ways. Closes MAR-540 bars #2–#6. Pure registry work — no runtime needed. | OpenClaw canonical-context binding + drift denial; Temporal `request_id` match; MCP 2026-07-28 approver continuity; n8n `$tool.name`/`$tool.parameters` |
| 2 | **BORROW** | **Widen the gate's vocabulary and make its durability explicit.** Add *edit* and *forward* outcomes; add `state_store` to `recommended_with`; add resume-reexecution and approval-loss-on-restart to `failure_modes`. | Cheapest change in the table. `human_approval_gate` (38) and `state_store` (26) co-occur constantly in triage yet the component does not relate them at all. | Dify Human Input verbs; OpenClaw issue #65486; OpenAI Agents SDK resumable `state`; LangGraph node-restart warning |
| 3 | **BUILD** | **Keep and widen coverage accounting — it is the moat.** Nothing in 21 systems does it, and CrewAI ships the anti-pattern. | Zero competitors. Every point of differentiation in the PR-facing claim ledger rests here. | CrewAI `planning=True`; absence across all other 20 |
| 4 | **BUILD** | **Grounded plan steps, Devin-style.** Let a route cite the concrete artefacts it expects (files, endpoints, tables) so a reader can check the plan against reality before running it. | The one axis where somebody beats us outright, and it composes with (3) rather than replacing it. | Devin Interactive Planning code citations + "Wait for my approval" |
| 5 | **BUILD** | **Publish gate-composition order.** A short doc saying what wins when a gate, an allowlist and a mode disagree in one of our routes. | Two vendors publish theirs and we publish none; this is a planning-honesty gap, not a safety feature. | Gemini CLI `final_priority` formula; Claude Code six-step order and its `canUseTool` bypass warning |
| 6 | **BORROW** | **A "pending demand" primitive.** Model the set of actions a run wanted and has not been allowed to take. | Would give LAB's fleet view a gate-compliance signal that is currently inferred rather than reported. | OpenHands `get_unmatched_actions()` |
| 7 | **BUILD** | **Deepen `data_normalizer`.** 16 live questions, and it was the #1 cluster at the 77-question snapshot before governance overtook it. | Real demand, but the field treats it as plumbing; low differentiation. Below the governance work. | LAB triage (16); PROJECT_STATE.md 2026-08-07 snapshot |
| 8 | **IGNORE** | **Browser / file / shell harnesses.** | Four systems do this well and it directly contradicts "OrchestrateMCP is stateless and read-only" and "DASH never hosts". Plan for them; never build one. | browser-use, OpenClaw, Devin, Cursor |
| 9 | **IGNORE** | **Memory-substrate internals.** | Letta is a serious product in this space. Our `state_store` needs a good contract, not an implementation. | Letta memory tiers, Agent File |
| 10 | **IGNORE** | **Multi-agent role/orchestration patterns.** | `loop_controller` 2, `fan_out_collector` 4 — bottom of the live clusters. CrewAI and AutoGen own the mindshare and the demand is not ours. | LAB triage |
| 11 | **IGNORE** | **Model routing / provider abstraction.** | Every entry solves it; zero appearances in LAB's clusters. | Absence in triage |

---

## The three issues I would file

**File nothing from this document.** These are proposals for Henrik.

### Proposal 1 — Approval provenance: bind the approval to the action (closes MAR-540 bars #2–#6)

> `human_approval_gate` declares `outputs: approved | rejected | timeout decision` — a
> decision with no identity attached to what was decided — and `audit_log` declares
> `inputs: action name, actor, payload, result, timestamp` with nothing tying the two
> together. A goal that says "require my approval before it sends, with an audit trail
> proving what I approved is exactly what ran" still returns `approval: enforced`.
>
> Change: add an approval-receipt identity to the gate's declared outputs and a
> corresponding relation to `audit_log`, modelled on the three converging implementations —
> OpenClaw's canonical execution context (cwd, exact argv, env, pinned executable path,
> deny-on-drift), Temporal's `request_id` continuity check, and MCP 2026-07-28's rule that
> the server must verify the person who started an approval finished it.
>
> Acceptance: the MAR-540 probe goal returns the approval-provenance ask in
> `unmatched_demand` when no receipt-carrying component is in the route, and stops
> returning it when one is. Corpus contract added so it cannot silently regress.

Demand: `human_approval_gate` 38 · `audit_log` 35 — the two largest live clusters.

### Proposal 2 — The gate's vocabulary and its durability

> Three defects in one component, all cheap:
>
> 1. **Vocabulary.** Reviewers in the field can *approve, edit, comment, forward and
>    regenerate* (Dify). Ours can approve or reject. *Edit* (approve a modified payload) and
>    *forward* (escalate to a different approver) recur in LAB triage notes and are
>    unrepresentable today.
> 2. **Durability.** `human_approval_gate.recommended_with` lists `audit_log` only. It does
>    not relate to `state_store` at all — yet OpenClaw's `ExecApprovalManager` keeps pending
>    approvals in an in-memory `Map` with no disk persistence and loses them on restart
>    (issue #65486), while the OpenAI Agents SDK returns a serializable resumable `state`
>    so an approval survives a process boundary within the same run. A plan that gates an
>    action should be told its approval must outlive the process.
> 3. **Failure modes.** Add resume-reexecution: LangGraph documents that a node restarts
>    from the beginning after `interrupt()`, so a gate placed after a side effect causes
>    that side effect to run twice.
>
> Acceptance: registry lint passes; the new outcomes appear in at least one published route;
> a corpus goal phrased as "let me edit the draft before it sends" no longer collapses into
> a bare approve/reject gate.

Demand: `human_approval_gate` 38 · `state_store` 26.

### Proposal 3 — Publish the gate-composition order

> Gemini CLI publishes `final_priority = tier_base + (toml_priority / 1000)` across five
> named tiers. Claude Code publishes a six-step evaluation order and, more usefully,
> documents its own hole: "Auto-approved tools never reach `canUseTool`… so permission
> checks you put there are silently bypassed for that tool." We publish nothing. A reader
> looking at one of our routes cannot tell what happens when a `human_approval_gate`, a
> `threshold_router` and a caller-side allowlist disagree — and the honest answer today may
> be that the question is undefined.
>
> This is a **planning-honesty** issue, not a safety feature. If the composition order is
> undefined, saying so in `docs/` is the deliverable; a PUBLIC_CLAIM_LEDGER "claims on hold"
> entry may be the correct outcome rather than a new mechanism.
>
> Acceptance: a `docs/` page stating the order, or stating that it is undefined and what a
> route reader may therefore not conclude. Linked from `human_approval_gate`'s `sources`.

Demand: indirect — this is the honesty layer over clusters 1 and 2.

---

## Appendix A — LAB's live demand clusters (2026-08-23)

Computed from OrchestrateLab's `signal_triage` table by the same rule as
`lib/signals/clusters.ts` (`buildDemandClusters`): in-domain rows where `can_we != 'yes'`;
for `partial` rows, count distinct questions naming each component; `MIN_CLUSTER_SIZE = 2`.

**337 triage rows total · 102 in-domain and not fully covered.**

Top components by partial-plan appearances:

| Component | Count | | Component | Count |
| --- | :-: | --- | --- | :-: |
| `human_approval_gate` | **38** | | `schema_validation` | 11 |
| `audit_log` | **35** | | `scheduled_trigger` | 10 |
| `state_store` | **26** | | `source_retrieval` | 9 |
| `data_normalizer` | **16** | | `plan_generation` | 9 |
| `intent_classifier` | 14 | | `chat_trigger` | 8 |
| `retry_policy` | 14 | | `public_feed_fetch` | 8 |
| `data_scraper` | 13 | | `deduplication` | 7 |
| `file_storage` | 11 | | `knowledge_ingestion` | 7 |
| `auth_failure_handler` | 11 | | `external_publish` | 7 |

**The ordering has changed, and that is itself a finding.** At the 77-question snapshot
recorded in `PROJECT_STATE.md` on 2026-08-07 the top four were `data_normalizer` (12),
`human_approval_gate` (12), `state_store` (8), `audit_log` (7). At 337 rows, approval and
audit have pulled decisively clear and `data_normalizer` has dropped to fourth. Demand
moved from *plumbing* to *governance* as the corpus grew — which is the same direction the
vendor landscape moved in over the same period (Dify's Human Input node, n8n's tool-level
gate, MCP's approver-continuity rule are all 2026 additions). Build order should follow the
current clusters, not the July ones.

Named hard gaps (no component matched at all) cluster around safety contracts and
multi-agent governance, each appearing once — including "define and enforce safety
contracts for agentic workflows (permissions, boundaries, governance, audit trails, failure
recovery)" twice in near-identical phrasing. Below `MIN_CLUSTER_SIZE`, so not ranked, but
consistent with the governance shift above.

---

## Appendix B — method and its limits

- **What "cited" means here.** Every claim about a system is drawn from a page listed in
  [Sources](#sources) that I actually fetched, or is explicitly marked **S** for
  search-summary. Where a page could not be fetched (Manus ×2, `docs.n8n.io/advanced-ai/
  human-in-the-loop-tools/` which 404s, `github.com/openai/codex/blob/main/docs/sandbox.md`
  which is a pointer only), that is stated in the entry rather than papered over.
- **Star counts and market-share claims are deliberately absent.** Sources disagreed wildly
  (one search summary reported OpenClaw at 68,000 stars and another at 280,000+ in the same
  session). None of it changes a build decision, so none of it is repeated here.
- **Vendor documentation describes intent, not behaviour.** A documented approval mode is
  evidence that the vendor built one, not that it works. The one place this document has
  behavioural evidence is OpenClaw issue #65486, and it contradicts the documentation —
  which is the general case, not the exception.
- **"Their users keep asking for" is inference, and the inference is stated.** It is drawn
  from two kinds of evidence: a feature the vendor shipped (shipping a tool-level approval
  gate is evidence someone demanded one), and public issue threads. It is cross-referenced
  against LAB's clusters but not derived from them. The counts in parentheses are always
  LAB's, never the vendor's.
- **Scores are ordinal within an axis, and the totals are not.** See the note under the
  scoreboard.
- **Not evaluated:** cost, latency, model quality, benchmark performance, licence terms,
  and anything requiring an account. Out of scope for a build-order question.

---

## Sources

Primary pages fetched and read on 2026-08-23:

1. https://clawdocs.org/getting-started/introduction
2. https://github.com/openclaw/openclaw/blob/main/docs/tools/exec-approvals.md
3. https://docs.openclaw.ai/gateway/security
4. https://docs.openclaw.ai/gateway/audit
5. https://github.com/openclaw/openclaw/issues/65486
6. https://hermes-agent.nousresearch.com/docs/
7. https://hermes-agent.nousresearch.com/docs/user-guide/security
8. https://code.claude.com/docs/en/agent-sdk/permissions
9. https://learn.chatgpt.com/docs/agent-approvals-security
10. https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md
11. https://cursor.com/blog/agent-sandboxing
12. https://cursor.com/docs/agent/tools/terminal
13. https://docs.openhands.dev/sdk/guides/security
14. https://goose-docs.ai/docs/guides/managing-tools/goose-permissions/
15. https://docs.devin.ai/work-with-devin/interactive-planning
16. https://docs.devin.ai/enterprise/security-access/security/enterprise-security
17. https://docs.langchain.com/oss/python/langgraph/interrupts
18. https://docs.crewai.com/en/concepts/planning
19. https://learn.microsoft.com/en-us/agent-framework/overview/
20. https://developers.openai.com/api/docs/guides/agents/guardrails-approvals
21. https://openai.github.io/openai-agents-python/tracing/
22. https://adk.dev/plugins/
23. https://mastra.ai/docs/workflows/human-in-the-loop
24. https://dify.ai/blog/the-human-input-node-bringing-human-judgment-into-automated-workflows
25. https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools
26. https://docs.temporal.io/ai-cookbook/human-in-the-loop-python
27. https://docs.letta.com/concepts/letta
28. https://strandsagents.com/
29. https://docs.browser-use.com/open-source/introduction
30. https://docs.browser-use.com/customize/agent-settings
31. https://www.cakewalk.security/blog/mcp-spec-agent-access-control-accountability

Fetched and found unusable (recorded so the next session does not repeat the attempt):

- https://manus.im/blog/manus-browser-operator — scheduled-maintenance notice
- https://manus.im/help/browser-operator — scheduled-maintenance notice
- https://docs.n8n.io/advanced-ai/human-in-the-loop-tools/ — 404
- https://github.com/openai/codex/blob/main/docs/sandbox.md — pointer to (9) only
- https://learn.chatgpt.com/docs/security — index page only

Internal, read from this repository and from OrchestrateLab at the commits current on
2026-08-23:

- `registry/components/human_approval_gate.component.yaml`, `audit_log.component.yaml`,
  `state_store.component.yaml`, `data_normalizer.component.yaml`
- `docs/ADR-MAR-540-approval-provenance.md`, `docs/ADR-MAR-494-dash-broker-availability-signal.md`
- `docs/PUBLIC_CLAIM_LEDGER.md`, `README.md`
- OrchestrateLab `lib/signals/clusters.ts`, `PROJECT_STATE.md`, and a read-only query
  against `data/lab.db`
- OrchestrateDASH `README.md`
