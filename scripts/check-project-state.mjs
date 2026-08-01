import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const state = JSON.parse(
  readFileSync(path.join(root, ".orchestrate", "state.json"), "utf8"),
);

const failures = [];
const warnings = [];

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function isAncestor(commit) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

if (state.schema_version !== 1) {
  failures.push("unsupported state schema");
}
if (typeof state.git?.evidence_base_commit !== "string") {
  failures.push("git.evidence_base_commit is missing");
} else if (!isAncestor(state.git.evidence_base_commit)) {
  failures.push(`evidence base ${state.git.evidence_base_commit} is not an ancestor of HEAD`);
}

for (const issue of state.issues ?? []) {
  if (["merged", "proven"].includes(issue.lifecycle)) {
    if (typeof issue.commit !== "string" || !isAncestor(issue.commit)) {
      failures.push(`${issue.id}: merged/proven without an ancestor commit`);
    }
  }
  if (issue.lifecycle === "proven" && typeof issue.proof?.command !== "string") {
    failures.push(`${issue.id}: proven without a reproducible proof command`);
  }
  if (
    ["merged", "proven"].includes(issue.lifecycle) &&
    ["Backlog", "Todo", "In Progress"].includes(issue.linear_status)
  ) {
    warnings.push(
      `${issue.id}: Git says ${issue.lifecycle}, recorded Linear status is ${issue.linear_status}`,
    );
  }
}

console.log(`[state] ${state.project} HEAD=${git(["rev-parse", "--short", "HEAD"])} wave=${state.current_wave}`);
for (const warning of warnings) {
  console.warn(`[state] DRIFT: ${warning}`);
}
for (const failure of failures) {
  console.error(`[state] INVALID: ${failure}`);
}
if (failures.length > 0) {
  process.exit(1);
}
console.log(`[state] valid; ${warnings.length} recorded cross-system drift warning(s)`);
