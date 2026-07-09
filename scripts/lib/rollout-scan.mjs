import fs from "node:fs";
import path from "node:path";
import { defaultCodexHome } from "./env.mjs";

const SESSION_ID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function scanUsageFromRollouts({
  codexHome = defaultCodexHome(),
  maxFiles = 50,
  maxLines = 20000,
} = {}) {
  const files = findRolloutFiles(codexHome).slice(0, maxFiles);
  const records = [];
  let latestSessionId = null;
  const seen = new Set();

  for (const filePath of files) {
    const scanned = scanRolloutFile(filePath, { maxLines });
    if (!latestSessionId && scanned.sessionId) latestSessionId = scanned.sessionId;
    for (const record of scanned.records) {
      if (seen.has(record.dedupe_key)) continue;
      seen.add(record.dedupe_key);
      records.push(record);
    }
  }

  return { records, latestSessionId, filesScanned: files.length };
}

export function findRolloutFiles(codexHome = defaultCodexHome()) {
  const files = [];
  for (const root of [path.join(codexHome, "sessions"), path.join(codexHome, "rollouts")]) {
    collectJsonl(root, files);
  }
  files.sort((a, b) => safeMtimeMs(b) - safeMtimeMs(a));
  return files;
}

export function scanRolloutFile(filePath, { maxLines = 20000 } = {}) {
  let lines;
  try {
    lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  } catch {
    return { sessionId: sessionIdFromFile(filePath), records: [] };
  }
  if (maxLines > 0 && lines.length > maxLines) lines = lines.slice(-maxLines);

  let sessionId = sessionIdFromFile(filePath);
  const records = [];
  for (let index = 0; index < lines.length; index += 1) {
    let event;
    try {
      event = JSON.parse(lines[index]);
    } catch {
      continue;
    }

    if (event.type === "session_meta") {
      sessionId = event.payload?.session_id || event.payload?.id || sessionId;
      continue;
    }

    const payload = event.payload || {};
    const turnId = payload.internal_chat_message_metadata_passthrough?.turn_id || "unknown";
    const ts = event.timestamp || new Date(safeMtimeMs(filePath)).toISOString();

    if (payload.type === "function_call" && payload.name === "exec_command") {
      for (const skillPath of skillPathsFromExecArguments(payload.arguments)) {
        const skill = skillDisplayName(skillPath);
        records.push(makeRecord({
          ts,
          sessionId,
          turnId,
          skill,
          skillPath,
          mode: "implicit",
        }));
      }
    }

    if (payload.type === "message" && payload.role === "user") {
      for (const skill of explicitSkillNames(payload.content)) {
        records.push(makeRecord({
          ts,
          sessionId,
          turnId,
          skill,
          skillPath: null,
          mode: "explicit",
        }));
      }
    }
  }

  return { sessionId, records: removeExplicitDuplicates(records) };
}

export function skillPathsFromExecArguments(rawArguments) {
  let parsed;
  try {
    parsed = JSON.parse(rawArguments || "{}");
  } catch {
    return [];
  }
  const command = String(parsed.cmd || "");
  const cwd = typeof parsed.cwd === "string" ? parsed.cwd : process.cwd();
  const found = new Set();
  const pattern = /"([^"]*SKILL\.md)"|'([^']*SKILL\.md)'|(\S*SKILL\.md)/g;
  let match;
  while ((match = pattern.exec(command)) !== null) {
    const candidate = match[1] || match[2] || match[3];
    const cleaned = candidate.replace(/[),;]+$/g, "");
    const resolved = normalizeSkillPath(cleaned, cwd);
    if (resolved) found.add(resolved);
  }
  return [...found];
}

export function explicitSkillNames(content) {
  const text = contentText(content);
  const names = [];
  const pattern = /<skill>\s*<name>([^<]+)<\/name>/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    names.push(match[1].trim());
  }
  return names;
}

function makeRecord({ ts, sessionId, turnId, skill, skillPath, mode }) {
  const keyTarget = skillPath || skill;
  return {
    ts,
    thread_id: sessionId || "unknown",
    turn_id: turnId,
    skill,
    mode,
    dedupe_key: `${sessionId}:${turnId}:${mode}:${keyTarget}`,
  };
}

function removeExplicitDuplicates(records) {
  const explicit = new Set(
    records
      .filter((record) => record.mode === "explicit")
      .map((record) => `${record.thread_id}:${record.turn_id}:${record.skill}`),
  );
  return records.filter((record) => {
    if (record.mode !== "implicit") return true;
    return !explicit.has(`${record.thread_id}:${record.turn_id}:${record.skill}`);
  });
}

function collectJsonl(root, files) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) collectJsonl(fullPath, files);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(fullPath);
  }
}

function normalizeSkillPath(candidate, cwd) {
  if (!candidate || candidate.includes("<") || candidate.includes(">")) return null;
  if (candidate.includes("$") || candidate.includes("%") || candidate.includes("|")) return null;
  if (candidate.includes("{") || candidate.includes("}")) return null;
  if (candidate.includes("JSON.stringify")) return null;
  if (path.basename(candidate) !== "SKILL.md") return null;

  if (path.isAbsolute(candidate)) return candidate;
  if (candidate === "SKILL.md") return null;

  const resolved = path.resolve(cwd || process.cwd(), candidate);
  return fs.existsSync(resolved) ? resolved : null;
}

function skillDisplayName(skillPath) {
  const name = readSkillName(skillPath) || inferSkillName(skillPath);
  const normalized = skillPath.replaceAll(path.sep, "/");
  const pluginMatch = normalized.match(/\/plugins\/cache\/[^/]+\/([^/]+)\/[^/]+\/skills\/[^/]+\/SKILL\.md$/);
  if (pluginMatch && !name.includes(":")) return `${pluginMatch[1]}:${name}`;
  return name;
}

function readSkillName(skillPath) {
  try {
    const text = fs.readFileSync(skillPath, "utf8");
    if (!text.startsWith("---")) return null;
    for (const line of text.split(/\r?\n/).slice(1, 80)) {
      if (line.trim() === "---") return null;
      if (line.startsWith("name:")) return line.split(":", 2)[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    return null;
  }
  return null;
}

function inferSkillName(skillPath) {
  const parts = skillPath.split(/[\\/]/).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : "unknown";
}

function contentText(content) {
  if (!Array.isArray(content)) return "";
  return content.map((item) => item?.text || "").join("\n");
}

function sessionIdFromFile(filePath) {
  return path.basename(filePath).match(SESSION_ID_RE)?.[1] || null;
}

function safeMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}
