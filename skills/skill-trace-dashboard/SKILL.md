---
name: skill-trace-dashboard
description: Show local Skill Trace activation statistics inside Codex, including current session/thread and user-wide summaries.
---

Run the local dashboard command and show its output directly:

```bash
skill-trace dashboard --scope both
```

If the user asks for a time window, mode, limit, diff display, or specific session/thread, pass the matching flags:

- `--since 24h`, `--since 7d`, or `--since all`
- `--mode all`, `--mode implicit`, or `--mode explicit`
- `--limit N`
- `--session-id THREAD_ID`
- `--diff` or `--no-diff`

If `skill-trace` is not on `PATH`, resolve the plugin root from this skill's path and run:

```bash
node <plugin-root>/scripts/skill-trace.mjs dashboard --scope both
```

Do not use `--watch` inside a Codex transcript unless the user explicitly asks for a long-running terminal process.
