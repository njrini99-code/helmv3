# INC-2026-09-04 — surface-registry.ts listed as generated

- Feature: `feature_awareness_system`

## What happened

`CLAUDE.md` listed `src/lib/golf/surface-registry.ts` among the generated
artifacts that outrank prose (alongside `src/lib/types/database.ts` and the
`AUTOGEN:*` blocks), for an unknown duration. `grep -rn surface-registry
scripts/ package.json` returns nothing — no generator produces the file.

## Impact

An agent who trusted the old wording could treat the file as read-only or
regenerate-only, when it is the single hand-maintained source of truth for
every golf surface name and href and needs direct edits when a surface is
added or moved.

## Fix / where it lives now

`CLAUDE.md`'s "Trusting what you read" section states plainly that
`surface-registry.ts` is hand-maintained and canonical, and to edit it
directly rather than duplicating a surface name elsewhere.
