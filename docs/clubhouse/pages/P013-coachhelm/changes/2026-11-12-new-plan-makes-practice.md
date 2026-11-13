# 2026-11-12 — coachhelm (Practice)

## 2026-11-12 — New plan makes the practice itself (Q7)

```text
Design package: none (owner's answer Q7, 12 Nov 2026 15:15: "New plan" creates the practice itself)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new; CH-13395 and CH-13396 reworded in the catalog
Actions:        none new. The sheet calls the Calendar's own createGolfEvent (already observed), then savePracticePlan
Data impact:    a coach's Create with "A new practice" writes one golf_events row (event_type practice, timed, no RSVP)
                through createGolfEvent, with the active roster's attendance rows as the Calendar's editor starts a
                practice (no replies asked, so no notice to anyone), then the plan as before. No new insert, table or policy
Held items:     none
```

### Changed

- New plan's sheet asks the day, start, end and an optional place when there is
  no practice to plan, or when the coach
  picks "A new practice" under the practices listed. It starts on the next
  weekday after today, 3:00 to 5:00 PM, in the
  team's zone; a new start keeps the length. Create puts the practice on the
  calendar through the Calendar's own
  create (`createGolfEvent`, with the editor's request-id rule, so a lost reply
  makes it once; the team on it as the
  editor starts a practice, no replies asked), then plans it as before. A plan
  that fails after the practice was made
  keeps it: its day and time become a line ("On the calendar: …"), the page
  reads the calendar again, and Create again
  only plans it.
- Practice: New plan is the page's one primary again, on a desk (the header) and
  on a phone (the bar's plus), whatever
  the calendar holds. The empty state's key is New plan ("New plan puts one on
  the calendar and plans it.") with the
  calendar a quiet "Open the calendar" beside it; the first run always offers
  its three starts, with the same quiet link
  when nothing is on the calendar. Up next's Build plan and Keep building are
  secondary, so no state has two primaries.
- `ChPracticeHome` carries the team's zone; the preview has
  `coachhelm-practice-home?state=empty-new`.

### Why

- W13/W52 hid New plan when nothing could be planned and sent the coach to
  Calendar. The owner's answer to Q7 replaces
  that: New plan makes the practice.

### Verification

- `practice/__tests__/new-plan-new-practice.test.tsx` (Create with no open
  practice: the event built, the plan on it,
  no second event after a failed plan, a refused event saves no plan, "A new
  practice" beside listed ones);
  `practice/__tests__/new-practice.test.ts` (next weekday, offsets 240/300
  either side of the clock change, length kept);
  `practice-screens.test.tsx` W13 case moved to the new contract and a
  one-primary check over six states, on a desk and
  on a phone (the phone's bar plus itself is not in that harness);
  `practice-states.test.tsx` first run. No `'use server'` file changed.
