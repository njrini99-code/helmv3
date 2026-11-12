# 2026-11-12 — coachhelm

## 2026-11-12 — The Miss Compass in Ask, behind a team flag (CoachHelm Studio Phase 1)

```text
Design package: COACHHELM_STUDIO_PHASE0.md sections 2, 4, 5 (owner approved 12 Nov ~16:20); research COACHHELM_STUDIO_RESEARCH.md
PR/commit:      agent/coachhelm-miss-compass
Contract IDs:   none changed
Actions:        none
Data impact:    get_shots reads golf_shots id, round_id, hole_id and golf_rounds round_date, course_name (read only)
Held items:     flag coachhelm_miss_compass_v1 is off everywhere; COACHHELM_MISS_COMPASS_TEAM_IDS is unset (the owner's call)
```

### Added

- Ask's "Where the misses go" visual, for a coach on a team the flag lists, is the Miss Compass (`studio/MissCompass.tsx`):
  eight labelled directions around the pin (long at the top, as before), each a 44 target with its count and its share
  of the shots with a direction logged; the shots with none are said apart; the caption says these are directions, not
  places on the green.
- Choosing a direction (tap, or the arrow keys, which walk the compass and pass over a direction with no shots) is local:
  no request, no model call. It opens the shots behind it, newest round first, each with its date, course, from, left and
  lie, each opening its round (`/golf/dashboard/rounds/<id>`, where the coach's access is checked); when a direction has
  more than the 40 kept, the list says "The newest 40 of 46, by round." Desk: below the compass. Phone: a sheet.
- "Ask about these shots" sends the next question with the selection (`about`, key `shots:<direction>`), which the server
  checks against the read it stored; it waits, as a starter does, while a reply is on its way.
- Off (no flag, a player, the shell's Ask sheet, Fairway, a composition stored without shots): the drawing as it was, byte
  for byte. The data half is in `memory/features/coachhelm-ai.md` (chat visuals).
- Preview: `/clubhouse-preview/coachhelm-capabilities?task=studio:distance_compass`.

### Verification

- `studio/__tests__/miss-compass.test.tsx`: off is today's markup byte for byte (no gate, gate off, block without shots,
  both sizes); names and shares; one tab stop; arrow keys; no fetch and no ask on a tap or a key; the drawer's list,
  links and cap line; close; the ask's payload; no ask without a host; 44 targets; the drawer's motion by opacity and
  transform only, none with reduced motion or motion off; the phone's sheet.
- `chat/__tests__/ask-miss-compass.test.tsx`: Ask's page turns it on for a flagged coach team only and sends the selection
  as `about`, not while a reply is on its way.
