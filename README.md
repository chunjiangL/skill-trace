# Skill Trace

Unofficial Codex plugin and CLI for local skill activation dashboards.

```text
!skill-trace
```

Skill Trace scans local Codex session records, counts skill activations, and renders compact session/user dashboards with daily, weekly, and monthly diffs. It does not call a model or external API to render the dashboard.

## Install

### From the Codex plugin browser

Add this GitHub repo as a Codex marketplace once:

```bash
codex plugin marketplace add chunjiangL/skill-trace
```

Then open Codex and install it from the plugin browser:

```text
/plugins
```

Search for `Skill Trace`, install it, then start a new Codex session.

This installs the plugin and bundled skill. It does not link the `skill-trace` shell command.

### Full local install

Use this if you want the no-model dashboard command:

```bash
git clone https://github.com/chunjiangL/skill-trace.git
cd skill-trace
./install.sh
```

This installs the Codex plugin, links the `skill-trace` CLI, and verifies that `skill-trace` is available.

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
