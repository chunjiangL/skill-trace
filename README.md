# Skill Trace

Unofficial Codex plugin and CLI for local skill activation dashboards.

```text
!skill-trace
```

Skill Trace scans local Codex session records, counts skill activations, and renders compact session/user dashboards with daily, weekly, and monthly diffs. It does not call a model or external API to render the dashboard.

## Install

From a checkout:

```bash
./install.sh
```

This installs the Codex plugin, links the `skill-trace` CLI, and verifies the command is available.

If you only want the plugin from a configured marketplace:

```bash
codex plugin add skill-trace@skill-trace
```

For a new marketplace source:

```bash
codex plugin marketplace add <repo-url-or-owner/repo>
codex plugin add skill-trace@skill-trace
```

Start a new Codex thread after installing or updating the plugin.

## Usage

Inside Codex:

```text
!skill-trace
```

From a terminal:

```bash
skill-trace
skill-trace --since 24h
skill-trace --scope session
skill-trace --no-diff
skill-trace --verbose
```

The plugin skill is also available:

```text
$skill-trace:skill-trace-dashboard
```

## Data

Skill Trace reads local Codex session JSONL files under `~/.codex/sessions/` and `~/.codex/rollouts/` on demand. It does not write telemetry files or send data anywhere.

Dashboard records include skill names, timestamps, thread IDs, turn IDs, and activation mode.

## Development

```bash
npm run check
npm test
./install.sh
```
