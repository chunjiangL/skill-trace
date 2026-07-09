#!/usr/bin/env node
import { scanUsageFromRollouts } from "./lib/rollout-scan.mjs";
import { renderDashboard } from "./lib/stats.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printUsage();
  process.exit(0);
}

render();

if (args.watch) {
  const timer = setInterval(render, args.refreshMs);
  process.on("SIGINT", () => {
    clearInterval(timer);
    process.stdout.write("\n");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    clearInterval(timer);
    process.exit(0);
  });
}

function render() {
  if (args.watch) process.stdout.write("\x1b[2J\x1b[H");
  const scanned = scanUsageFromRollouts({ maxFiles: args.scanFiles, maxLines: args.scanLines });
  process.stdout.write(renderDashboard(scanned.records, {
    since: args.since,
    mode: args.mode,
    limit: args.limit,
    scope: args.scope,
    sessionId: args.sessionId || process.env.CODEX_THREAD_ID || scanned.latestSessionId || null,
    color: args.color,
    columns: process.stdout.columns || 100,
    sourceLabel: args.verbose ? sourceLabel(scanned.records.length, scanned.filesScanned) : null,
  }));
  if (args.watch) process.stdout.write("\nCtrl-C to exit\n");
}

function parseArgs(argv) {
  const parsed = {
    since: "all",
    mode: "all",
    scope: "both",
    limit: 12,
    color: defaultColor(),
    refreshMs: 1000,
    watch: false,
    scanFiles: 50,
    scanLines: 20000,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--since") parsed.since = argv[++i];
    else if (arg === "--mode") parsed.mode = argv[++i];
    else if (arg === "--scope") parsed.scope = argv[++i];
    else if (arg === "--session-id") parsed.sessionId = argv[++i];
    else if (arg === "--limit") parsed.limit = parsePositiveInteger(argv[++i], "--limit");
    else if (arg === "--scan-files") parsed.scanFiles = parsePositiveInteger(argv[++i], "--scan-files");
    else if (arg === "--scan-lines") parsed.scanLines = parsePositiveInteger(argv[++i], "--scan-lines");
    else if (arg === "--refresh-ms") parsed.refreshMs = parsePositiveInteger(argv[++i], "--refresh-ms");
    else if (arg === "--watch" || arg === "-w") parsed.watch = true;
    else if (arg === "--verbose" || arg === "-v") parsed.verbose = true;
    else if (arg === "--color") parsed.color = true;
    else if (arg === "--no-color") parsed.color = false;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return parsed;
}

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} expects a positive integer`);
  return parsed;
}

function printUsage() {
  process.stdout.write(`Usage: skill-trace dashboard [--since 24h|7d|all] [--mode all|implicit|explicit] [--scope both|session|user] [--session-id THREAD_ID] [--limit N] [--watch] [--verbose] [--color|--no-color]\n`);
}

function defaultColor() {
  return true;
}

function sourceLabel(recordCount, filesScanned) {
  return `source ${recordCount} session-scan + ${filesScanned} files`;
}
