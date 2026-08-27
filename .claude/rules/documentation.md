---
paths:
  - "memory/**"
  - "docs/**"
  - "**/*.md"
verified: 2026-08-27  # split out of shipping.md; claims unchanged, homes corrected
---

## Documentation — the rot rule

Split out of `shipping.md` on 2026-08-27. It is path-scoped rather than
always-on because you cannot violate any of it without opening a `.md`, and the
test for always-on is *"could this prevent a mistake on a turn that opens no
files?"* This section fails that test; the git and bash sections pass it.

An audit on 2026-08-19/20 found the knowledge base naming database objects that
do not exist in production and file paths that do not resolve (current counts
live in `.doc-schema-baseline.json` / `.doc-path-baseline.json` — never in
prose), each rendered with full detail and formatted identically to the real
ones. A session that obeyed the docs produced fluent, confident, broken work.

- **Never write a count into prose.** Not "266 tables", not "41 action files".
  Counts rot within weeks and a stale number reads as current forever. Put it in
  an `AUTOGEN` block, ship the command that derives it, or leave it out.
  `glossary.md` said "75 tables" for six months against a schema of 268. On
  2026-08-27 `quality-gates.md` still said "59 pgTAP suites" against 74, and
  `vitest.config.ts` put the assertion count at 93 against 1,232 — the same lie
  in two homes, both stale, neither noticed.
- **Never document a table, column, or path you have not just verified.** Query
  it or `ls` it. "The migration exists in this repo" is *not* evidence the table
  is live.
- **Run the gates before claiming a doc is correct:**
  `npm run docs:schema-drift` and `npm run docs:path-drift`. Both baseline to a
  known-bad count that may only go DOWN, and both fail CI on anything new.
- **A "DO NOT EDIT — regenerated" stamp is not evidence of correctness.** That
  exact stamp sat on an enum block reporting 6 of 18 enums for ~6 months because
  the generator's regex silently dropped the rest. Verify the generator, not the
  stamp.
- **A missing table does not mean a missing feature.** Recurring events are fully
  implemented on `golf_events.recurring` / `recurrence_rule` / `parent_event_id`;
  `golf_recurring_events` never existed. Check the code before concluding
  anything is absent.
- **Staleness markers must be a number, not a date.** "Re-verified 2026-08-15"
  reads as current for weeks after it stops being true. Record the anchor SHA and
  let the reader run `git rev-list --count <sha>..HEAD -- 'src/**'`.
- **Never bulk-repoint dead paths by basename search.** Tried; nearest-name
  matches were build artifacts under `src/.helmdev/`. That swaps a visibly broken
  path for a confidently wrong one.
- **A fact with four homes has four chances to rot.** Put it in the file whose
  name matches it and have the others point there. The required-check NAME trap
  lived in four files until 2026-08-27; one of the four,
  `docs/REPO_MAP.md`, had itself drifted into naming the phantom check the other
  three warned about. Restating is how a warning system acquires the bug it
  warns about.
- **A pointer that resolves is not a pointer that is correct.** `fileExists`
  passing says nothing about whether the target is on-topic —
  `memory/registry.yml` pointed the `recruiting` feature at a 1,399-line file
  containing zero occurrences of "recruit". `npm run knowledge:check` now tests
  this; do not weaken it.
