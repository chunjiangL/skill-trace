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
const COLUMN_GAP = 4;
const MIN_COLUMN_WIDTH = 44;
const PERIODS = [
  { key: "day", short: "D", label: "Daily" },
  { key: "week", short: "W", label: "Weekly" },
  { key: "month", short: "M", label: "Monthly" },
];

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
  diff = true,
  layout = "auto",
  now = new Date(),
  sourceLabel = null,
} = {}) {
  const filtered = filterUsage(records, { since, mode, now });
  const summary = summarizeModes(filtered);
  const lines = [];
  const scopes = normalizeScopes(scope);
  const useColumns = shouldUseColumns({ columns, layout, diff });

  lines.push(`${text("Skill Trace", { color, bold: true })} ${text(`window=${since} mode=${mode}`, { color })}`);
  lines.push(separator(columns, { color }));
  lines.push(summaryLine(summary, { color }));
  if (sourceLabel) lines.push(text(sourceLabel, { color }));

  if (scopes.includes("session")) {
    const sessionRecords = sessionId ? filtered.filter((record) => record.thread_id === sessionId) : [];
    lines.push("");
    lines.push(renderDashboardRow({
      leftTitle: `Session ${sessionId ? shortId(sessionId) : "unavailable"}`,
      records: sessionRecords,
      limit,
      color,
      columns,
      now,
      diff,
      useColumns,
      emptyMessage: sessionId
        ? "No skill activation records for this session in this window."
        : "No current session id found. Pass --session-id THREAD_ID.",
    }));
  }

  if (scopes.includes("user")) {
    lines.push("");
    lines.push(renderDashboardRow({
      leftTitle: "User Sessions",
      records: filtered,
      limit,
      color,
      columns,
      now,
      diff,
      useColumns,
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

function shouldUseColumns({ columns, layout, diff }) {
  if (!diff) return false;
  if (layout === "stack") return false;
  if (layout === "columns") return true;
  if (layout !== "auto") throw new Error(`invalid --layout value: ${layout}`);
  return columns >= MIN_COLUMN_WIDTH * 2 + COLUMN_GAP;
}

function renderDashboardRow({
  leftTitle,
  records,
  limit,
  color,
  columns,
  now,
  diff,
  useColumns,
  emptyMessage,
}) {
  if (!diff) {
    return renderSection({ title: leftTitle, records, limit, color, columns, emptyMessage });
  }

  const rows = aggregateBySkill(records).slice(0, limit);

  if (!useColumns) {
    return [
      renderActivitySection({ title: leftTitle, records, rows, color, columns, emptyMessage }).join("\n"),
      "",
      renderDeltaSection({ records, rows, color, columns, now }).join("\n"),
    ].join("\n");
  }

  const leftWidth = Math.floor((columns - COLUMN_GAP) / 2);
  const rightWidth = columns - COLUMN_GAP - leftWidth;
  const leftLines = renderActivitySection({
    title: leftTitle,
    records,
    rows,
    color,
    columns: leftWidth,
    emptyMessage,
  });
  const rightLines = renderDeltaSection({
    records,
    rows,
    color,
    columns: rightWidth,
    now,
  });
  return joinColumns(leftLines, rightLines, leftWidth, COLUMN_GAP);
}

function renderSection({ title, records, limit, color, columns, emptyMessage }) {
  const rows = aggregateBySkill(records).slice(0, limit);
  return renderActivitySection({ title, records, rows, color, columns, emptyMessage }).join("\n");
}

function renderActivitySection({ title, records, rows, color, columns, emptyMessage }) {
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
    lines.push(text(truncate(emptyMessage, columns), { color }));
    return lines;
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
      lines.push(text(truncate(`${shortDateTime(record.ts)}  ${record.skill}`, columns), { color }));
    }
  }
  return lines;
}

function renderDeltaSection({ records, rows, color, columns, now }) {
  const lines = [];
  const metrics = deltaMetrics(records, now);
  const rowMetrics = rows.map((row) => metrics.bySkill.get(row.skill) || emptyDelta());
  const totalMaxByPeriod = maxDeltaByPeriod(metrics.total, []);
  const rowMaxByPeriod = maxDeltaByPeriod(emptyDelta(), rowMetrics);
  const layout = deltaColumnLayout(columns);

  lines.push(deltaHeaderLine(layout, { color }));
  lines.push(separator(columns, { color }));
  lines.push(deltaTripletLine(metrics.total, totalMaxByPeriod, layout, { color, columns }));

  if (rows.length === 0) {
    lines.push(text("No skill diffs for this view.", { color }));
    return lines;
  }

  for (const item of rowMetrics) {
    lines.push(deltaTripletLine(item, rowMaxByPeriod, layout, { color, columns }));
  }

  lines.push(separator(columns, { color }));
  lines.push(text("Total Diff", { color, bold: true }));
  lines.push(deltaDetailLine(metrics.total, layout, { color, columns }));
  return lines;
}

function deltaMetrics(records, now) {
  const ranges = periodRanges(now);
  const bySkill = new Map();
  const total = emptyDelta();

  for (const record of records) {
    const ts = Date.parse(record.ts);
    if (!Number.isFinite(ts)) continue;

    const item = bySkill.get(record.skill) || emptyDelta();
    let matched = false;
    for (const period of PERIODS) {
      const bucket = periodBucket(ts, ranges[period.key]);
      if (!bucket) continue;
      total[period.key][bucket] += 1;
      item[period.key][bucket] += 1;
      matched = true;
    }
    if (matched) bySkill.set(record.skill, item);
  }

  finalizeDelta(total);
  for (const item of bySkill.values()) finalizeDelta(item);
  return { total, bySkill };
}

function emptyDelta() {
  return {
    day: emptyPeriodDelta(),
    week: emptyPeriodDelta(),
    month: emptyPeriodDelta(),
  };
}

function emptyPeriodDelta() {
  return { current: 0, previous: 0, delta: 0 };
}

function finalizeDelta(item) {
  for (const period of PERIODS) {
    item[period.key].delta = item[period.key].current - item[period.key].previous;
  }
  return item;
}

function periodRanges(now) {
  const dayStart = startOfLocalDay(now);
  const weekStart = startOfLocalWeek(now);
  const monthStart = startOfLocalMonth(now);
  return {
    day: {
      currentStart: dayStart,
      currentEnd: addDays(dayStart, 1),
      previousStart: addDays(dayStart, -1),
      previousEnd: dayStart,
    },
    week: {
      currentStart: weekStart,
      currentEnd: addDays(weekStart, 7),
      previousStart: addDays(weekStart, -7),
      previousEnd: weekStart,
    },
    month: {
      currentStart: monthStart,
      currentEnd: addMonths(monthStart, 1),
      previousStart: addMonths(monthStart, -1),
      previousEnd: monthStart,
    },
  };
}

function periodBucket(ts, range) {
  if (ts >= range.currentStart.getTime() && ts < range.currentEnd.getTime()) return "current";
  if (ts >= range.previousStart.getTime() && ts < range.previousEnd.getTime()) return "previous";
  return null;
}

function maxDeltaByPeriod(total, items) {
  const result = {};
  for (const period of PERIODS) {
    result[period.key] = Math.max(
      1,
      Math.abs(total[period.key].delta),
      ...items.map((item) => Math.abs(item[period.key].delta)),
    );
  }
  return result;
}

function deltaColumnLayout(columns) {
  const gap = 2;
  const width = Math.max(8, Math.floor((columns - gap * (PERIODS.length - 1)) / PERIODS.length));
  return { gap, width, barWidth: Math.max(1, Math.min(5, width - 7)) };
}

function deltaHeaderLine(layout, { color }) {
  return PERIODS
    .map((period) => text(period.label.padEnd(layout.width, " "), { color, bold: true }))
    .join(text(" ".repeat(layout.gap), { color }));
}

function deltaTripletLine(item, maxByPeriod, layout, { color, columns }) {
  const pieces = PERIODS.map((period) => deltaCell(item[period.key], maxByPeriod[period.key], layout, { color }));
  return truncateAnsi(pieces.join(text(" ".repeat(layout.gap), { color })), columns);
}

function deltaCell(item, maxDelta, layout, { color }) {
  const value = formatDelta(item.delta);
  const bar = deltaBar(item.delta, maxDelta, layout.barWidth, { color });
  const visible = `${value}${bar ? " " : ""}${stripAnsi(bar)}`;
  const padded = visible.padEnd(layout.width, " ");
  if (!color) return padded;
  const suffix = " ".repeat(Math.max(0, layout.width - visible.length));
  return `${deltaText(value, item.delta, { color })}${bar ? deltaText(" ", item.delta, { color }) : ""}${bar}${text(suffix, { color })}`;
}

function deltaDetailLine(item, layout, { color, columns }) {
  const pieces = PERIODS.map((period) => deltaDetailCell(item[period.key], layout, { color }));
  return truncateAnsi(pieces.join(text(" ".repeat(layout.gap), { color })), columns);
}

function deltaDetailCell(item, layout, { color }) {
  const value = `${item.previous}->${item.current} ${formatDelta(item.delta)}`;
  const visible = truncate(value, layout.width).padEnd(layout.width, " ");
  return deltaText(visible, item.delta, { color });
}

function deltaBar(delta, maxDelta, maxBarWidth, { color }) {
  if (delta === 0) return "";
  const barWidth = Math.max(1, maxBarWidth);
  const barLength = Math.max(1, Math.round((Math.abs(delta) / maxDelta) * barWidth));
  const tone = delta > 0 ? "implicit" : "explicit";
  const value = BLOCK.repeat(barLength);
  return color ? paint(value, { color, tone }) : value;
}

function deltaText(value, delta, { color }) {
  if (!color) return value;
  if (delta > 0) return paint(value, { color, tone: "implicit" });
  if (delta < 0) return paint(value, { color, tone: "explicit" });
  return text(value, { color });
}

function formatDelta(value) {
  if (value > 0) return `+${value}`;
  if (value < 0) return String(value);
  return "0";
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

function joinColumns(leftLines, rightLines, leftWidth, gap) {
  const rows = [];
  const count = Math.max(leftLines.length, rightLines.length);
  const spacer = " ".repeat(gap);
  for (let index = 0; index < count; index += 1) {
    const left = leftLines[index] || "";
    const right = rightLines[index] || "";
    rows.push(`${padAnsiEnd(left, leftWidth)}${spacer}${right}`);
  }
  return rows.join("\n");
}

function padAnsiEnd(value, width) {
  const visible = stripAnsi(value).length;
  return visible >= width ? value : `${value}${" ".repeat(width - visible)}`;
}

function stripAnsi(value) {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

function startOfLocalDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfLocalWeek(value) {
  const day = startOfLocalDay(value);
  const mondayOffset = (day.getDay() + 6) % 7;
  return addDays(day, -mondayOffset);
}

function startOfLocalMonth(value) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addDays(value, days) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
}

function addMonths(value, months) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
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

function truncateAnsi(value, width) {
  if (stripAnsi(value).length <= width) return value;
  let visible = 0;
  let output = "";
  for (let index = 0; index < value.length && visible < Math.max(1, width - 1); index += 1) {
    if (value[index] === "\x1b") {
      const end = value.indexOf("m", index);
      if (end === -1) break;
      output += value.slice(index, end + 1);
      index = end;
      continue;
    }
    output += value[index];
    visible += 1;
  }
  return `${output}…${RESET}`;
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
