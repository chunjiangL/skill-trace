#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const command = process.argv[2];
const args = process.argv.slice(3);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const commands = new Map([
  ["dashboard", "skill-trace-dashboard.mjs"],
  ["dash", "skill-trace-dashboard.mjs"],
  ["install", "install.mjs"],
]);

if (command === "--help" || command === "-h") {
  printUsage();
  process.exit(0);
}

if (!command || command.startsWith("-")) {
  runScript("skill-trace-dashboard.mjs", process.argv.slice(2));
}

const target = commands.get(command);
if (!target) {
  process.stderr.write(`unknown command: ${command}\n\n`);
  printUsage();
  process.exit(2);
}

runScript(target, args);

function runScript(target, scriptArgs) {
  const result = spawnSync(process.execPath, [path.join(scriptDir, target), ...scriptArgs], {
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

function printUsage() {
  process.stdout.write(`Usage: skill-trace [command] [args]\n\nNo command opens the dashboard.\n\nCommands:\n  dashboard, dash   Show skill activation frequency bars\n  install           Install plugin and link the CLI from this checkout\n`);
}
