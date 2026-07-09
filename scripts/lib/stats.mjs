const AUTO = "\x1b[36m";
const TEXT = "\x1b[90m";
const MANUAL = "\x1b[35m";
const OTHER = "\x1b[35m";
const DIVIDER = "\x1b[90m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const BLOCK = "■";
const SEPARATOR = "─";
const MAX_BAR_UNITS = 18;

export function filterUsage(records, { since = "all", mode = "all", now = new Date() } = {}) {
  const cutoff = cutoffForSince(since, now);
  return records.filter((record) => {
    if (cutoff && Date.parse(record.ts) < cutoff.getTime()) return false;
    if (mode === "all") return true;
    return record.mode === mode;
  });
}

export function aggregateBySkill(records) {
  const bySkill = new Map();
  for (const record of records) {
    const row = bySkill.get(record.skill) || {
      skill: record.skill,
      total: 0,
      explicit: 0,
      implicit: 0,
      other: 0,
      lastTs: null,
    };
    row.total += 1;
    if (record.mode === "explicit") row.explicit += 1;
    else if (record.mode === "implicit") row.implicit += 1;
    else row.other += 1;
    if (!row.lastTs || Date.parse(record.ts) > Date.parse(row.lastTs)) row.lastTs = record.ts;
    bySkill.set(record.skill, row);
  }
  return [...bySkill.values()].sort((a, b) => b.total - a.total || a.skill.localeCompare(b.skill));
}

export function summarizeModes(records) {
  const summary = { total: records.length, explicit: 0, implicit: 0, other: 0 };
  for (const record of records) {
    if (record.mode === "explicit") summary.explicit += 1;
    else if (record.mode === "implicit") summary.implicit += 1;
    else summary.other += 1;
  }
  return summary;
}

export function renderDashboard(records, {
  since = "all",
  mode = "all",
  limit = 12,
  scope = "both",
  sessionId = null,
  color = true,
  columns = 100,
  now = new Date(),
  sourceLabel = null,
} = {}) {
  const filtered = filterUsage(records, { since, mode, now });
  const summary = summarizeModes(filtered);
  const lines = [];
  const scopes = normalizeScopes(scope);

  lines.push(`${text("Skill Trace", { color, bold: true })} ${text(`window=${since} mode=${mode}`, { color })}`);
  lines.push(separator(columns, { color }));
  lines.push(summaryLine(summary, { color }));
  if (sourceLabel) lines.push(text(sourceLabel, { color }));

  if (scopes.includes("session")) {
    const sessionRecords = sessionId ? filtered.filter((record) => record.thread_id === sessionId) : [];
    lines.push("");
    lines.push(renderSection({
      title: `Session ${sessionId ? shortId(sessionId) : "unavailable"}`,
      records: sessionRecords,
      limit,
      color,
      columns,
      emptyMessage: sessionId
        ? "No skill activation records for this session in this window."
        : "No current session id found. Pass --session-id THREAD_ID.",
    }));
  }

  if (scopes.includes("user")) {
    lines.push("");
    lines.push(renderSection({
      title: "User Sessions",
      records: filtered,
      limit,
      color,
      columns,
      emptyMessage: "No skill activation records for this window.",
    }));
  }

  return `${lines.join("\n")}\n`;
}

export function normalizeScopes(scope) {
  if (scope === "both") return ["session", "user"];
  if (scope === "session") return ["session"];
  if (scope === "user") return ["user"];
  throw new Error(`invalid --scope value: ${scope}`);
}

export function cutoffForSince(since, now = new Date()) {
  if (!since || since === "all") return null;
  const normalized = String(since).trim().toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)(m|h|d|w)$/);
  if (match) {
    const amount = Number(match[1]);
    const unitMs = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[match[2]];
    return new Date(now.getTime() - amount * unitMs);
  }
  const parsed = Date.parse(since);
  if (Number.isFinite(parsed)) return new Date(parsed);
  throw new Error(`invalid --since value: ${since}`);
}

function renderSection({ title, records, limit, color, columns, emptyMessage }) {
  const rows = aggregateBySkill(records).slice(0, limit);
  const summary = summarizeModes(records);
  const skillWidth = Math.min(30, Math.max(10, ...rows.map((row) => row.skill.length)));
  const countWidth = Math.max(4, String(rows[0]?.total || 0).length);
  const available = columns - skillWidth - countWidth - 17;
  const barWidth = Math.max(4, Math.min(MAX_BAR_UNITS, Math.floor(available / 2)));
  const maxTotal = rows[0]?.total || 1;
  const lines = [];

  lines.push(text(title, { color, bold: true }));
  lines.push(separator(columns, { color }));
  lines.push(summaryLine(summary, { color }));

  if (rows.length === 0) {
    lines.push(text(emptyMessage, { color }));
    return lines.join("\n");
  }

  for (const row of rows) {
    const barLength = Math.max(1, Math.round((row.total / maxTotal) * barWidth));
    const skill = truncate(row.skill, skillWidth).padEnd(skillWidth, " ");
    const count = String(row.total).padStart(countWidth, " ");
    const bar = renderStackedBar(row, barLength, { color });
    lines.push(`${text(`${skill} ${count} `, { color })}${bar}`);
  }

  const recent = [...records]
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .slice(0, 3);
  if (recent.length > 0) {
    lines.push(separator(columns, { color }));
    lines.push(text("Recent Activations", { color, bold: true }));
    for (const record of recent) {
      lines.push(text(`${shortDateTime(record.ts)}  ${record.skill}`, { color }));
    }
  }
  return lines.join("\n");
}

function summaryLine(summary, { color } = {}) {
  return [
    text(`total ${summary.total}`, { color }),
    `${modeMarker("implicit", { color })}${text(` implicit ${summary.implicit}`, { color })}`,
    `${modeMarker("explicit", { color })}${text(` explicit ${summary.explicit}`, { color })}`,
    summary.other ? text(`other ${summary.other}`, { color }) : null,
  ].filter(Boolean).join("  ");
}

function renderStackedBar(row, barLength, { color } = {}) {
  const segments = [
    { tone: "implicit", count: row.implicit },
    { tone: "explicit", count: row.explicit },
    { tone: "other", count: row.other },
  ].filter((segment) => segment.count > 0);

  if (segments.length === 0) return BLOCK.repeat(barLength);

  const lengths = allocateSegmentLengths(segments, Math.max(barLength, segments.length), row.total);
  return segments
    .map((segment, index) => {
      const value = BLOCK.repeat(lengths[index]);
      return color ? paint(value, { color, tone: segment.tone }) : value;
    })
    .join("");
}

function modeMarker(mode, { color } = {}) {
  if (mode === "implicit") return color ? paint(BLOCK, { color, tone: "implicit" }) : BLOCK;
  if (mode === "explicit") return color ? paint(BLOCK, { color, tone: "explicit" }) : BLOCK;
  return BLOCK;
}

function allocateSegmentLengths(segments, barLength, total) {
  const raw = segments.map((segment) => (segment.count / total) * barLength);
  const lengths = raw.map(Math.floor);
  let used = lengths.reduce((sum, value) => sum + value, 0);

  for (let i = 0; i < lengths.length && used < barLength; i += 1) {
    if (lengths[i] === 0) {
      lengths[i] = 1;
      used += 1;
    }
  }

  const order = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const item of order) {
    if (used >= barLength) break;
    lengths[item.index] += 1;
    used += 1;
  }

  while (used > barLength) {
    const largest = lengths.indexOf(Math.max(...lengths));
    lengths[largest] -= 1;
    used -= 1;
  }

  return lengths;
}

function shortId(value) {
  if (!value) return "unknown";
  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function shortDateTime(ts) {
  const parsed = new Date(ts);
  if (Number.isNaN(parsed.getTime())) return "unknown";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  const second = String(parsed.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function truncate(value, width) {
  if (value.length <= width) return value;
  if (width <= 1) return value.slice(0, width);
  return `${value.slice(0, width - 1)}…`;
}

function separator(columns, { color } = {}) {
  const value = SEPARATOR.repeat(Math.max(24, Math.min(72, columns || 72)));
  return color ? `${DIVIDER}${value}${RESET}` : value;
}

function text(value, { color, bold = false } = {}) {
  if (!color) return value;
  const codes = [TEXT];
  if (bold) codes.push(BOLD);
  return `${codes.join("")}${value}${RESET}`;
}

function paint(value, { color, tone = null, bold = false } = {}) {
  if (!color) return value;
  const codes = [];
  if (tone === "implicit") codes.push(AUTO);
  else if (tone === "explicit") codes.push(MANUAL);
  else if (tone === "other") codes.push(OTHER);
  else codes.push(TEXT);
  if (bold) codes.push(BOLD);
  if (codes.length === 0) return value;
  return `${codes.join("")}${value}${RESET}`;
}
