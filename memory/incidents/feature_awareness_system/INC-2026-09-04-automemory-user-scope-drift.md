# INC-2026-09-04 — autoMemoryEnabled was true in user scope against policy

- Feature: `feature_awareness_system`

## What happened

`autoMemoryEnabled` must be `false` for Helm work, set only in
`.claude/settings.json`. It was also set in user scope, to `true`. Because
which scope wins for this key was unverified, the invariant could be
silently violated with no way to tell from project config alone.

## Impact

A machine-local auto-memory store that can disagree with this repo's
committed `memory/` state would be a second, unreviewable authority for
engineering truth.

## Fix / where it lives now

The user-scope key was removed (owner-authorized) rather than set to
`false`, so project scope now governs with no second value to reconcile.
Backup kept at `~/.claude/settings.json.bak-2026-09-04`. There is no
auto-memory directory in this repo any more — `memory/` (registry, features,
ledgers, incidents, decisions) is the only memory. If the user-scope key
reappears, remove it again rather than reasoning about precedence.
