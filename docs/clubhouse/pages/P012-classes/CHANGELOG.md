# P012 — Classes: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

## 2026-10-01 — Phone: today first, one heading, the term in a line (iPhone brief)

From the owner's "GolfHelm iPhone Layout and Native Experience Repair" brief, §10.

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none (owner brief; docs/clubhouse/phone/classes.md updated)
Contract IDs:   CH-12308 (new)
Actions:        none
Data impact:    none
Held items:     none
```

- **One "Classes".** The phone top bar is the page's only heading; `main` is
  labelled "Classes" directly.
- **Today first.** `TodayClasses` lists what meets today by start time: time,
  name, and room · code, each opening its class. With nothing today it names
  the next class day (CH-12308).
- **The term, compact.** One line on the green card, plus an overlaps row that
  scrolls to the overlap cards (only when there are overlaps). The credit bar
  and the term line, whose Today marker collided with the warning, stay on
  desktop.
- **Overlaps before the deck** on the phone; the course code on a card is
  metadata, and the name leads.
- Not verified on a real iPhone.

## 2026-09-30 — Delete all classes (Q-75a)

```text
PR/commit:      agent/clubhouse
Contract IDs:   catalog CH-12005, CH-12006, CH-12503 and CH-12704 (Bridge IDs are minted by the registry sync)
Data impact:    none (the same table and server action as Remove; no migration)
```

### Delete all classes (Q-75a)

- **Issue.** The current Fairway Classes page has "Delete all classes" and the Clubhouse page did not, so clearing a
  semester's schedule was one removal at a time. The owner approved building it on 2026-09-30.
- **Fix.** A quiet red "Delete all classes" button under the deck (a full-width, 44px row on the phone) with the warning
  haptic first, behind a question that says how many classes go, that their calendar events go with them, and how many
  are from another term (CH-12503). It is one write, `writes.removeAll`, in the current page's order: the calendar
  first for every class, then one delete of the rows that came off it, scoped to the player; a class whose calendar
  removal failed keeps its row. A failure says which part: nothing was deleted (CH-12005), or it stopped half-way, with
  the classes that are gone dropped from the list, the ones kept and the ones off the calendar but still saved named,
  and the latter flagged "Not on your calendar" (CH-12006). A row is reported deleted only when the delete returned it
  or a read-back shows it gone, so a failed delete or a row a policy hid is never called deleted. Retry repeats the same
  classes and finishes the job (a class already gone counts as removed). The button is off while a save, an import, a
  remove, a calendar sync or a delete-all is running, and is not drawn with no classes or when they didn't load.
  The question stays open after a failure, counts what is left, and cannot be closed while its delete runs.
- **Checked.** `classes.test.tsx` 125/125 with 16 new cases (the control, the question and its counts, the silent confirm,
  the two failure toasts and their Retry, the off states, and the live writes: order, scope, read-back, a thrown call);
  each behaviour mutation-checked (15 mutations, each caught; see VERIFY.md); axe clean at 1280 and 390 on the question,
  the half-way toast and the nothing-deleted toast, and the phone button measured 358 x 44. Not seen on an iPhone.

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
