# P012 — Classes: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

## 2026-09-30 — Classes for players, the review fixes and the page docs

```text
Design package: design/handoff/ v2 (Player - Classes.html, Player - Classes - Mobile.html)
PR/commit:      agent/clubhouse (the page: c1925eba2; these page docs are uncommitted at the time of writing)
Contract IDs:   120101 to 122401 (29 hand contracts, all reserved until their tests carry the Bridge IDs), plus the
                46 catalog IDs 120201 to 121805 (CH-12001 to CH-12902)
Actions:        6 (ACT-P012-*)
Data impact:    none (the same table and server actions as the current page; no migration)
Held items:     none (Delete all and the board's grade, deadline and Share with coach wait on Q-75)
```

### Added

- Classes for players, desktop and phone: the term overview, a card for every class, this week's overlaps with
  the team's events, and the sheets to add, edit, import (a screenshot, PDF, TXT file or pasted text, reviewed
  before anything is saved) and remove a class. Coaches keep the current page at the same address
  (`LegacyClassesPage.tsx`, unchanged).
- The six page docs, the manifest's actions (`status.docs` current, `status.contract` complete) and the hand
  contracts: the core view, a class's card and sheet, first run only on an answered read, the import's duplicate
  check, term-scoped checks, a hidden update and an empty sync as failures, offline, the page's role, the
  server actions as the gate (reserved: read, not run), success and the import result, forms kept, Retry, Try
  again, the calendar (not waited on, from the class's own term, no-time classes taken off it, flags held for
  the visit), axe, phone layout, keyboard, the loader, observability and tests.

### Fixed (each with a test that fails without the fix; mutation-checked, as reported in PROGRESS.md)

- **An import sent next Monday as every class's start.** A class in next term, or one imported before its term
  began, failed to sync ("Could not determine semester dates"), and its Retry repeated the same start. Each class's
  start now comes from its own term (`syncStartFor`); a class with no start gets the term's whole window; every
  Retry replays the stored start.
- **The sheet stayed locked while the calendar sync ran.** A save is done when the row is stored: the sheet is
  free, "Class added" shows, and the sync is its own action that the save starts without waiting for.
- **The import said the classes were on the calendar when some had no days.** The result now counts only those
  that can be, names the rest and why ("PHIL 150 (no meeting days)"), and says "Adding them to your calendar…"
  while it runs.
- **A class with days but no time got a phantom 08:00 to 09:00 block.** The server fills in that time, so such a
  class is now taken off the calendar instead of synced, and its card, sheet and the import result say "no time
  set".
- **Importing a schedule again duplicated the classes that had no term.** The duplicate check now reads a class
  with no term as the current term's, the way the page and the calendar sync do.
- **The duplicate and overlap checks compared other terms.** They now count only the classes of the term in
  question, and this week's team overlaps only the current term's.
- **CH-12002's row promised a toast the busy case never shows.** A class saved while another sync is still
  running is flagged with no toast, and the row now says so.
- **A Retry after a lost answer could insert a second row.** A new class's row id is made when the sheet opens
  and travels with every attempt; a duplicate-key answer on it means the row is already stored, so the save
  updates it.
- Also fixed: a class in next term lists its next meetings from its term's first day; a weekend day an import
  saved can be taken off in the form; a coach's loading skeleton is Fairway's, because a coach gets the
  Fairway page.

### Owner questions

- **Q-75** (open; the reversible choices are built): Delete all (recommended: build it behind the same confirm
  and calendar-first order), Add class as a sheet rather than the board's inline card, coach-visibility copy that
  follows the read policy, and the grade, next deadline and Share with coach that have no column.

### Why

- The contract pass (D-62, D-69): every category answered, every behaviour named, and every bug class the
  earlier pages' passes found looked for here; and the review of the first build, whose fixes are above.

### Verification

- See VERIFY.md.
