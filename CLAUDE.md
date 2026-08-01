# Claude entry point

Follow `AGENTS.md`, then read `PROJECT_STATE.md` and `.orchestrate/state.json`. Use the same planned -> merged -> proven evidence rules as Codex.

When Henrik asks for a new session prompt, follow `AGENTS.md`'s new-session
handoff contract. Always name the recommended client and model. For Claude Code,
use `claude --model opus` for deep audit/architecture work and
`claude --model sonnet` for bounded implementation; state whether the Claude
session owns files or is read-only beside a Codex session.
