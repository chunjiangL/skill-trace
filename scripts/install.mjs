#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, ".codex-plugin", "plugin.json"), "utf8"));

main();

function main() {
  process.chdir(repoRoot);
  requireFile(".codex-plugin/plugin.json");
  requireFile(".agents/plugins/marketplace.json");
  requireCommand("codex");
  requireCommand("npm");
  requireNodeMajor(22);

  step("Register local Codex marketplace");
  run("codex", ["plugin", "marketplace", "add", repoRoot], {
    okIfOutputMatches: /already|exists|configured|duplicate/i,
  });

  step("Install Codex plugin");
  run("codex", ["plugin", "add", "skill-trace@skill-trace"]);

  step("Sanitize installed plugin cache");
  sanitizeInstalledCache();

  step("Link skill-trace CLI");
  run("npm", ["link"]);

  step("Verify CLI");
  run("skill-trace", ["--help"]);

  process.stdout.write("\nSkill Trace installed.\n");
  process.stdout.write("Use `!skill-trace` in Codex, or run `skill-trace` in a terminal.\n");
  process.stdout.write("Start a new Codex thread for plugin skill changes to be picked up.\n");
}

function requireFile(relativePath) {
  if (!fs.existsSync(path.join(repoRoot, relativePath))) {
    fail(`missing required file: ${relativePath}`);
  }
}

function requireCommand(command) {
  const check = spawnSync(command, ["--version"], { encoding: "utf8" });
  if (check.error?.code === "ENOENT") fail(`missing required command on PATH: ${command}`);
}

function requireNodeMajor(minMajor) {
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(major) || major < minMajor) {
    fail(`Node ${minMajor}+ is required; found ${process.version}`);
  }
}

function sanitizeInstalledCache() {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const pluginRoot = path.join(codexHome, "plugins", "cache", "skill-trace", "skill-trace", manifest.version);
  if (!fs.existsSync(pluginRoot)) return;

  for (const relativePath of [".git", "hooks"]) {
    fs.rmSync(path.join(pluginRoot, relativePath), { recursive: true, force: true });
  }
}

function step(message) {
  process.stdout.write(`\n==> ${message}\n`);
}

function run(command, args, { okIfOutputMatches = null } = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) fail(`${command} failed: ${result.error.message}`);
  if (result.status !== 0 && !(okIfOutputMatches && okIfOutputMatches.test(output))) {
    fail(`command failed with exit ${result.status}: ${[command, ...args].join(" ")}`);
  }
}

function fail(message) {
  process.stderr.write(`install failed: ${message}\n`);
  process.exit(1);
}
