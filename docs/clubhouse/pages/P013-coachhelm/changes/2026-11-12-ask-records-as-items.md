# 2026-11-12 — Ask: a table of records is a list of items

## 2026-11-12 — Tasks, events, tournaments and goals in an answer read as items, not a ruled grid of words

```text
Design package: none (owner, 12 Nov 2026, on Ask's tables: "I don't like those tables")
PR/commit:      agent/preview-fixes-ui
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `chat/studio/table.tsx` (`DataTable`, every Ask surface that draws an `AskTable`): a table whose columns after the first
  are mostly words (tasks, events, tournaments, goals) is drawn as a list of items. Each item shows the first cell as its
  title, a Status or State column as the shared `Badge` (done positive, under way accent, waiting or late a warning), and
  the other columns as one line that reads as a sentence: "Practice · Oct 30, 3 PM – 5 PM", "Due Nov 5 · Regular priority".
  A start and an end are one range, with the day said once.
- A grid of figures to compare (players against their strokes gained, rounds against their scores) stays a table, and so
  does a two-column table (a label and its value).
- On a phone the old grid was cut at the edge ("Regula…", "Oct 30, 5 P…", a fifth column gone) with nothing to say it
  scrolled. Pictures: helm-handoff shots/ask-items/.
