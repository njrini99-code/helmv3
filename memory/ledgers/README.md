# memory/ledgers/

Semantic history — layer 5 of the source-of-truth hierarchy in
`memory/system/golfhelm-engineering-os.md` (below canonical feature memory,
above general `memory/`/`docs/` prose). Append-only; never rewrite a past
entry to make it read better, correct it forward instead.

- `changes/<feature-id>.md` — what changed, why, and at what SHA, per feature.
- `tests/<feature-id>.md` — when test guarantees/contracts changed.
- `deployments.md` — one row per production promote; see that file's header.

A fourth entry, `operations/<feature-id>.md`, was documented here and **never
existed** — no such directory, no file, no writer, no reference anywhere in the
repository. It is removed rather than created: incident aftermath already has a
durable per-feature home in `memory/incidents/<feature-id>/INC-*.md`, ops-only
behavioural changes belong in `changes/`, and in-flight repair state belongs in
`memory/operations/release-queue.yml`. A fifth slot with no distinct lifecycle
would have been a place for entries to go unread.

A documented subsystem that exists only in prose is worse than a missing one: it
makes a reader believe the history was recorded somewhere.

Update these after a *behavioral* mutation, not a cosmetic one — non-behavioral
changes record a structured reason instead (see the runtime contract).
