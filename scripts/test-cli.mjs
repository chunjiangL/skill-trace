#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skill-trace-cli-test-"));
const codexHome = path.join(tmp, "codex-home");
const sessionDir = path.join(codexHome, "sessions", "2026", "07", "09");
const skillDir = path.join(tmp, "skills", "openai-docs");
fs.mkdirSync(sessionDir, { recursive: true });
fs.mkdirSync(skillDir, { recursive: true });
fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: openai-docs\n---\n", "utf8");
const sessionFile = path.join(sessionDir, "rollout-019f3a8a-c85c-7a40-bbd1-d2bd24ab597a.jsonl");
fs.writeFileSync(sessionFile, [
  JSON.stringify({ type: "session_meta", payload: { id: "thread-a" } }),
  JSON.stringify(execEvent("2026-07-09T05:00:00.000Z", "turn-1", `sed -n '1,20p' '${path.join(skillDir, "SKILL.md")}'`)),
  JSON.stringify(userSkillEvent("2026-07-09T05:10:00.000Z", "turn-2", "openai-docs")),
  "",
].join("\n"), "utf8");

const baseArgs = ["scripts/skill-trace.mjs", "--session-id", "thread-a"];
const env = { ...process.env, NO_COLOR: "1", TERM: "dumb", CODEX_HOME: codexHome };

const help = spawnSync(process.execPath, ["scripts/skill-trace.mjs", "--help"], {
  encoding: "utf8",
});
assert.equal(help.status, 0, help.stderr);
assert.match(help.stdout, /install\s+Install plugin and link the CLI/);
assert.match(help.stdout, /dashboard, dash\s+Show skill activation frequency bars/);

const coloredDefault = spawnSync(process.execPath, baseArgs, {
  encoding: "utf8",
  env,
});
assert.equal(coloredDefault.status, 0, coloredDefault.stderr);
assert.match(coloredDefault.stdout, /^\x1b\[90m\x1b\[1mSkill Trace/);
assert.match(coloredDefault.stdout, /\x1b\[90m/);
assert.match(coloredDefault.stdout, /\x1b\[36m/);
assert.match(coloredDefault.stdout, /■/);
assert.doesNotMatch(coloredDefault.stdout, /usage .*usage\.jsonl/);
assert.match(coloredDefault.stdout, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\s{2}openai-docs/);

const colored = spawnSync(process.execPath, [...baseArgs, "--color"], {
  encoding: "utf8",
  env,
});
assert.equal(colored.status, 0, colored.stderr);
assert.match(colored.stdout, /^\x1b\[90m\x1b\[1mSkill Trace/);
assert.match(colored.stdout, /\x1b\[90m/);
assert.match(colored.stdout, /\x1b\[36m/);
assert.match(colored.stdout, /\x1b\[35m/);
assert.match(colored.stdout, /\x1b\[90mtotal \d+\x1b\[0m\s+\x1b\[36m■\x1b\[0m\x1b\[90m implicit/);
assert.match(colored.stdout, /\x1b\[35m■\x1b\[0m\x1b\[90m explicit/);
assert.doesNotMatch(colored.stdout, /\x1b\[97m/);
assert.doesNotMatch(colored.stdout, /\x1b\[30m/);
assert.doesNotMatch(colored.stdout, /\x1b\[34m/);
assert.doesNotMatch(colored.stdout, /\x1b\[94m/);
assert.doesNotMatch(colored.stdout, /\x1b\[95m/);
assert.doesNotMatch(colored.stdout, /\x1b\[92m/);
assert.doesNotMatch(colored.stdout, /\x1b\[38;2;/);
assert.doesNotMatch(colored.stdout, /\x1b\[38;5;16m/);
assert.doesNotMatch(colored.stdout, /\x1b\[38;5;39m/);
assert.doesNotMatch(colored.stdout, /\x1b\[32m/);
assert.match(colored.stdout, /■/);

const verbose = spawnSync(process.execPath, [...baseArgs, "--verbose"], {
  encoding: "utf8",
  env,
});
assert.equal(verbose.status, 0, verbose.stderr);
assert.match(verbose.stdout, /source 2 session-scan \+ 1 files/);

const plain = spawnSync(process.execPath, [...baseArgs, "--no-color"], {
  encoding: "utf8",
  env,
});
assert.equal(plain.status, 0, plain.stderr);
assert.doesNotMatch(plain.stdout, /\x1b\[/);
assert.match(plain.stdout, /■/);
assert.doesNotMatch(plain.stdout, /🔹/);
assert.doesNotMatch(plain.stdout, /🟩/);

function execEvent(ts, turnId, cmd) {
  return {
    timestamp: ts,
    payload: {
      type: "function_call",
      name: "exec_command",
      arguments: JSON.stringify({ cmd, cwd: tmp }),
      internal_chat_message_metadata_passthrough: { turn_id: turnId },
    },
  };
}

function userSkillEvent(ts, turnId, skill) {
  return {
    timestamp: ts,
    payload: {
      type: "message",
      role: "user",
      content: [{ text: `<skill><name>${skill}</name></skill>` }],
      internal_chat_message_metadata_passthrough: { turn_id: turnId },
    },
  };
}
