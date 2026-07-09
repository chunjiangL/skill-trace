#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanUsageFromRollouts, skillPathsFromExecArguments } from "./lib/rollout-scan.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skill-trace-rollout-test-"));
const codexHome = path.join(tmp, ".codex");
const sessionDir = path.join(codexHome, "sessions", "2026", "07", "09");
const skillDir = path.join(tmp, ".codex", "skills", "demo-skill");
const skillPath = path.join(skillDir, "SKILL.md");
fs.mkdirSync(sessionDir, { recursive: true });
fs.mkdirSync(skillDir, { recursive: true });
fs.writeFileSync(skillPath, "---\nname: demo-skill\ndescription: demo\n---\n", "utf8");

const rollout = path.join(sessionDir, "rollout-2026-07-09T00-00-00-019f0000-0000-7000-8000-000000000001.jsonl");
const lines = [
  {
    timestamp: "2026-07-09T00:00:00.000Z",
    type: "session_meta",
    payload: { session_id: "019f0000-0000-7000-8000-000000000001" },
  },
  {
    timestamp: "2026-07-09T00:00:01.000Z",
    type: "response_item",
    payload: {
      type: "function_call",
      name: "exec_command",
      arguments: JSON.stringify({ cmd: `sed -n '1,120p' ${skillPath}` }),
      internal_chat_message_metadata_passthrough: { turn_id: "turn-a" },
    },
  },
  {
    timestamp: "2026-07-09T00:00:02.000Z",
    type: "response_item",
    payload: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "<skill>\n<name>plugin:explicit-skill</name>\n</skill>" }],
      internal_chat_message_metadata_passthrough: { turn_id: "turn-b" },
    },
  },
];
fs.writeFileSync(rollout, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");

assert.deepEqual(skillPathsFromExecArguments(JSON.stringify({ cmd: `cat "${skillPath}"` })), [skillPath]);

const scanned = scanUsageFromRollouts({ codexHome, maxFiles: 5, maxLines: 100 });
assert.equal(scanned.latestSessionId, "019f0000-0000-7000-8000-000000000001");
assert.equal(scanned.records.length, 2);
assert.deepEqual(scanned.records.map((record) => record.skill).sort(), ["demo-skill", "plugin:explicit-skill"]);
