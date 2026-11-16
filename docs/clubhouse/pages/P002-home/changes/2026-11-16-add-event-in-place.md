# P002 — Changelog

## 2026-11-16 — Add event opens the editor on Home (MAC-03)

```text
Design package: production audit 2026-11-15, MAC-03 (P1-4)
PR/commit: claude/project-thread-10vtd2-motion-2 (#2544)
Contract IDs: none
Actions: getEventEditorInputs (new read-only server action)
Data impact: none (reads only; the editor's writes are Calendar's own)
Held items: none
```

### Changed

- Phone Home's "Add event" and its quick type chips (Practice, Qualifier,
  Tournament, Meeting) open Calendar's event editor on Home instead of leaving
  for Calendar just to open a sheet (`screens/home/NewEventLink.tsx`).
- A press starts the editor's code and its inputs: the week's events and the
  roster, read for the signed-in coach by `getEventEditorInputs`
  (`data/event-editor-inputs.ts`), which reuses Calendar's loader under the
  coach's RLS-scoped client and takes the team from the session.
- With no inputs (not a coach, a failed read, or a degraded read of events,
  timezone, busy time or classes) the tap goes to Calendar's `?new=1` as
  before, where those reads have their own notices. A modified or middle click stays a plain link.
- A saved event refreshes Home, and the next open reads the week again.
- The editor gets one seed per opening, so a later render (the busy hold
  ending) cannot reset what the coach has typed.

### Why

- MAC-03 measured the trip to Calendar at a 196 ms long task and 43 dropped
  frames (766 ms at 4x CPU, Chromium), against one dropped frame for the same
  sheet opened on Calendar.

### Verification

- Unit (vitest): new `screens/home/__tests__/new-event-link.test.tsx` (opens
  in place with the chip's type, keeps one seed per opening, falls back to
  Calendar, re-reads after a save); `home.test.tsx` and `player-home.test.tsx` green.
- Not run: a browser look. Owed: W at 393 px on staging with the demo coach
  (open, save, cancel), and a C trace of the tap against MAC-03's numbers.
