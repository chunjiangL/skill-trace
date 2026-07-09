#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  aggregateBySkill,
  cutoffForSince,
  filterUsage,
  normalizeScopes,
  renderDashboard,
  summarizeModes,
} from "./lib/stats.mjs";

const records = [
  record("2026-07-09T05:00:00.000Z", "openai-docs", "implicit"),
  record("2026-07-09T05:10:00.000Z", "openai-docs", "explicit"),
  record("2026-07-09T05:20:00.000Z", "documents", "implicit"),
];

const filtered = filterUsage(records, {
  since: "12h",
  now: new Date("2026-07-09T06:00:00.000Z"),
});
assert.equal(filtered.length, 3);

const rows = aggregateBySkill(filtered);
assert.equal(rows[0].skill, "openai-docs");
assert.equal(rows[0].total, 2);
assert.equal(rows[0].implicit, 1);
assert.equal(rows[0].explicit, 1);

assert.deepEqual(summarizeModes(records), {
  total: 3,
  explicit: 1,
  implicit: 2,
  other: 0,
});

const rendered = renderDashboard(records, {
  color: false,
  since: "all",
  sessionId: "thread-a",
  columns: 80,
  now: new Date("2026-07-09T06:00:00.000Z"),
});
assert.match(rendered, /Skill Trace/);
assert.match(rendered, /Session thread-a/);
assert.match(rendered, /User Sessions/);
assert.match(rendered, /─{24,}/);
assert.match(rendered, /total 3\s+■ implicit 2\s+■ explicit 1/);
assert.match(rendered, /openai-docs\s+2\s+■+/);
assert.doesNotMatch(rendered, /auto=/);
assert.doesNotMatch(rendered, /manual=/);
assert.doesNotMatch(rendered, /modes /);
assert.doesNotMatch(rendered, /\bi:/);
assert.doesNotMatch(rendered, /\be:/);
assert.doesNotMatch(rendered, /\blast\b/);
assert.doesNotMatch(rendered, /🔹/);
assert.doesNotMatch(rendered, /🟩/);
assert.doesNotMatch(rendered, /▪/);
assert.match(rendered, /documents\s+1\s+■/);
assert.match(rendered, /Recent Activations/);
assert.match(rendered, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\s{2}documents/);
assert.doesNotMatch(rendered, /usage .*usage\.jsonl/);
assert.doesNotMatch(rendered, /source .*session-scan/);

const verboseRendered = renderDashboard(records, {
  color: false,
  since: "all",
  sessionId: "thread-a",
  columns: 80,
  now: new Date("2026-07-09T06:00:00.000Z"),
  sourceLabel: "source fixture",
});
assert.match(verboseRendered, /source fixture/);

const colored = renderDashboard(records, {
  color: true,
  since: "all",
  sessionId: "thread-a",
  columns: 80,
  now: new Date("2026-07-09T06:00:00.000Z"),
});
assert.match(colored, /\x1b\[90m/);
assert.match(colored, /\x1b\[36m/);
assert.match(colored, /\x1b\[35m/);
assert.match(colored, /^\x1b\[90m\x1b\[1mSkill Trace/);
assert.match(colored, /\x1b\[90mtotal 3\x1b\[0m\s+\x1b\[36m■\x1b\[0m\x1b\[90m implicit 2/);
assert.match(colored, /\x1b\[35m■\x1b\[0m\x1b\[90m explicit 1/);
assert.doesNotMatch(colored, /\x1b\[97m/);
assert.doesNotMatch(colored, /\x1b\[30m/);
assert.doesNotMatch(colored, /\x1b\[34m/);
assert.doesNotMatch(colored, /\x1b\[94m/);
assert.doesNotMatch(colored, /\x1b\[95m/);
assert.doesNotMatch(colored, /\x1b\[92m/);
assert.doesNotMatch(colored, /\x1b\[38;2;/);
assert.doesNotMatch(colored, /\x1b\[38;5;16m/);
assert.doesNotMatch(colored, /\x1b\[38;5;39m/);
assert.doesNotMatch(colored, /\x1b\[32m/);
assert.match(colored, /■/);
assert.doesNotMatch(colored, /🔹/);
assert.equal(cutoffForSince("24h", new Date("2026-07-09T06:00:00.000Z")).toISOString(), "2026-07-08T06:00:00.000Z");
assert.deepEqual(normalizeScopes("both"), ["session", "user"]);

function record(ts, skill, mode) {
  const threadId = skill === "documents" ? "thread-b" : "thread-a";
  return { ts, skill, mode, thread_id: threadId, turn_id: "turn", path: `/tmp/${skill}/SKILL.md` };
}
