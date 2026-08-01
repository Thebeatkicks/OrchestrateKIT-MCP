# OrchestrateKit MCP Agent Rules

Read `PROJECT_STATE.md` and `.orchestrate/state.json` before planning work.

## Product boundary

This repository is the deterministic design and export layer for agent systems. Keep tool output reproducible, preserve user wording where the plan promises to preserve it, and do not add external writes or hidden execution to planning tools. DASH manifest exports use manifest v2; telemetry uses the v1 envelope.

## Sources of truth

- Git is implementation truth.
- Linear is intent and ownership truth.
- ADRs are decision truth.
- Tests and real runtime proofs are evidence truth.
- `.orchestrate/state.json` is an index, never an independent source of truth.

Never collapse `planned`, `merged`, and `proven`. Merged means an ancestor commit contains the implementation. Proven means a reproducible proof exercised the promised path.

## Session protocol

At the start: confirm repository and branch, inspect `git status`, run `pnpm state:check`, and read the active Linear issue. At the end: run the relevant tests, update the issue with commit/proof evidence, add an ADR for cross-repository decisions, update the state packet, and run `pnpm state:check` again. Preserve unrelated dirty files.

Use `pnpm verify` before claiming a change is proven.

## New-session handoff contract

When Henrik asks for a **new session prompt**, do not return a loose summary.
Return one or more copy/paste-ready prompts and specify for each:

1. client (`Codex` or `Claude Code`), exact model selector, and reasoning level;
2. repository, branch/worktree, Linear issue, and read/write ownership;
3. objective, current evidence, known blocker, allowed changes, and non-goals;
4. required start checks, verification commands, lifecycle exit state, and the
   evidence that must be written back to Linear/state files;
5. coordination rules for any parallel session.

Model routing while usage is available:

- Use **Codex `gpt-5.6-sol` with high/xhigh reasoning** for cross-repository
  implementation, architecture migrations, difficult debugging, security
  boundaries, and installed/runtime proof work.
- Use **Codex `gpt-5.6-terra` with medium/high reasoning** for a bounded issue,
  mechanical cleanup, focused tests, or documentation where the scope is known.
- Use **Claude Code `--model opus` with extended thinking** for an independent
  architecture/UX audit, long-context reconciliation, or a second opinion on a
  risky plan. The official `opus` alias intentionally resolves to Claude Code's
  current Opus model; include the concrete model ID too when the client exposes
  it.
- Use **Claude Code `--model sonnet`** for bounded implementation and review when
  Opus usage is limited.

For important work that benefits from both clients, default to Codex
`gpt-5.6-sol` xhigh as the implementation/proof owner and Claude Code `opus` as
a read-only reviewer. Reverse the lead only when the task is primarily product
writing or UX synthesis. Two live sessions must never edit the same files or
worktree. Give them separate repositories/file ownership, or make one explicitly
read-only. The user will say when one provider's usage is exhausted; until then,
recommend the strongest justified model rather than silently downgrading.
