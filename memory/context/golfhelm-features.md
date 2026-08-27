# GolfHelm Feature Registry — RETIRED 2026-08-27

> **This document no longer has contents. Go to `memory/features/`.**

## What was here

1,399 lines describing 28 GolfHelm features — the OLDER of two generations that
described the same features. Two generations meant every fact had two homes,
they disagreed, and which one a session believed depended on nothing legible.
That was one of the measured causes of agent drift in this repo.

It was also **provably wrong**, not merely superseded. A machine check on
2026-08-19 found it naming **19 database identifiers that do not exist in
production**, rendered with full columns and FKs, formatted identically to the
real ones. A session that trusted it produced fluent, confident, broken work.

## Why the contents went, rather than getting another banner

A `SUPERSEDED — do not route feature work here` banner was added on 2026-08-26,
and it was well argued: keep the file as historical context, because it may hold
the only written account of some behaviour. That reasoning did not survive
contact with what the file actually contained.

It cannot have been the only account of anything it claimed, because 19 of the
things it claimed were fiction. And a warning above 1,400 lines of confident,
correctly-formatted prose is weak — the prose is what gets read, quoted and
built on. Emptying the file is the only version of "do not trust this" that a
future session cannot accidentally ignore.

Removing those 19 identifiers also ratchets `.doc-schema-baseline.json` **down**,
which a banner never could.

## Why a tombstone instead of a deletion

36 files still link here — all 17 docs under `memory/features/`,
`.claude/rules/golf-review.md`, `CLAUDE.md`, `memory/README.md`,
`memory/glossary.md`, and a dozen under `docs/`. Deleting the file would turn
every one of those into a dead path and fail `npm run docs:path-drift`.

Retire the links as you touch those files. When the last one is gone, delete
this.

## Where the content actually lives now

| You want | Go to |
|---|---|
| What a golf feature does, current state | `memory/features/<feature-id>.md` — resolve the id with `npm run knowledge:map -- --files <paths>` |
| Which doc covers a file | `memory/registry.yml` — the canonical semantic router |
| Table, column, or enum names | `src/lib/types/database.ts`, or `npm run schema -- <table>` |
| Route, action, or hook inventory | the `AUTOGEN` blocks in `memory/projects/golfhelm.md` |
| Why a feature changed | `memory/ledgers/changes/<feature-id>.md` |
| The rules governing all of this | `memory/system/golfhelm-engineering-os.md` |

One feature had no canonical doc at all until 2026-08-27: **Recruiting HQ**.
`memory/registry.yml` pointed its `docs.feature` at this file, which contained
zero occurrences of the string "recruit". It now has a real one written from the
source, at `memory/features/recruiting.md`.
