# Hermes 0.9.9 source contract

## Provenance

- Upstream: `https://github.com/chandra447/pi-hermes-memory`
- Upstream tag: `v0.9.9`
- Source commit: `71ce9f0cf2985a52219b4fba0d3ebdd7c2f598df`
- License: MIT
- Fork: `https://github.com/erics118/pi-hermes-memory`

## Public contract to preserve

- Tools: `memory_add`, `memory_replace`, `memory_remove`, `memory_search`, `session_search`, and `skill_manage`.
- Commands: `memory-index-sessions`, `memory-consolidate`, `memory-insights`, `memory-interview`, `memory-learn-tool`, `memory-preview-context`, `memory-skills`, `memory-switch-project`, `memory-sync-markdown`, and `memory-pin`.
- Global memory files: `MEMORY.md`, `USER.md`, and `failures.md`.
- Project memory files: `~/.pi/agent/projects-memory/<project>/`.
- Generated skills: `~/.pi/agent/pi-hermes-memory/skills/` and project skill directories.
- Session index: `~/.pi/agent/pi-hermes-memory/sessions.db`.
- Configuration: `~/.pi/agent/hermes-memory-config.json`.

## Existing SQLite tables

- `extension_metadata`
- `sessions`
- `session_files`
- `messages`
- `message_fts`
- `memories`
- `memory_fts`

## Inherited safety behavior

- Content scanning runs before memory and skill persistence.
- SQLite recovery, snapshots, locking, and session retention are implemented.
- Legacy `~/.pi/agent/memory` and project-memory migration preserve source data.
- Background review and correction detection are configurable.

## Intentional changes

- Replace automatic correction persistence with an explicit correction lifecycle.
- Store correction candidates, grouping snapshots, proposals, decisions, and proof outcomes in the same SQLite database.
- Add bounded `/reflect`.
- Use a configured reviewer role for grouping. Do not require Anthropic Fable.

## Non-goals

- Do not inspect, copy, or migrate Pi credentials.
- Do not change the live `pi-hermes-memory` package until isolated migration validation succeeds.
- Do not keep a second correction or general-memory store.

## Inherited checks

- Type check: `npm run check`
- Test suite: `npm test`
- Production-package check: `npm run check:production`
