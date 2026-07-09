import os from "node:os";
import path from "node:path";

export function defaultCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}
