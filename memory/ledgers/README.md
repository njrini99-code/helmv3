# memory/ledgers/

Semantic history — layer 5 of the source-of-truth hierarchy in
`memory/system/golfhelm-engineering-os.md` (below canonical feature memory,
above general `memory/`/`docs/` prose). Append-only; never rewrite a past
entry to make it read better, correct it forward instead.

- `changes/<feature-id>.md` — what changed, why, and at what SHA, per feature.
- `tests/<feature-id>.md` — when test guarantees/contracts changed.
- `operations/<feature-id>.md` — operational history (incidents' aftermath,
  ops-only changes) per feature.
- `deployments.md` — one row per production promote; see that file's header.

Update these after a *behavioral* mutation, not a cosmetic one — non-behavioral
changes record a structured reason instead (see the runtime contract).
