# 2026-11-12 — coachhelm

## 2026-11-12 — The Miss Compass in Ask, behind a team flag (CoachHelm Studio Phase 1)

```text
Design package: COACHHELM_STUDIO_PHASE0.md sections 2, 4, 5 (owner approved 12 Nov ~16:20); research COACHHELM_STUDIO_RESEARCH.md
PR/commit:      agent/coachhelm-miss-compass
Contract IDs:   none changed
Actions:        none
Data impact:    get_shots reads golf_shots id, round_id, hole_id and golf_rounds round_date, course_name, player_id (read only)
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
  checks against the read it stored; it waits, as a starter does, while a reply is on its way. It sends, where a chart mark
  only fills the composer: the approved design (Phase 0, section 2, step 4) has the drawer's key send the turn. On a phone a
  sent ask closes the sheet, so it never sits over the answer; on a desk the drawer stays in the earlier answer.
- What the model is told about the selection (engine/about.ts): the count and the rounds, each with its id whole, the list
  kept to a length that leaves the closing sentence inside the 900-character line, the rest counted ("and 8 more rounds").
- On a team-wide read each row says whose round it was, the player first ("Jonah Okafor", then "Wed, Nov 4 · Hilltop Golf
  Club"), named from the coach's active roster; a player no longer on it is unnamed, never an id. A read of one player
  names no one. The name is the app's alone, like the rest of the list: never in what the model is told, the selection
  line included.
- Each shot reads as the round review says a shot: "135 yd from the fairway · 18 ft left", the distance left after its
  number, never "left 18 ft" beside "missed right". On a phone "Ask about these shots" sits in the sheet's footer, in reach
  above up to 40 rows; on a desk it ends the drawer. The chosen direction is ruled and named in the selected ink, which
  reads at night (WebKit, 12 Nov: `--ch-selected-strong`, a plate's fill, all but vanished on the dark page).
- In the studio's look (coachhelm-ask-studio.css): rules under each direction, not boxes; the share as a ruled length in
  an SVG; the chosen direction ruled in the selected ink. It draws in place: nothing moves when a direction is chosen,
  with or without reduced motion (the phone's sheet is the app's Modal, with its own reduced-motion handling).
- Off (no flag, a player, the shell's Ask sheet, Fairway, a composition stored without shots): the drawing as it was, byte
  for byte. The data half is in `memory/features/coachhelm-ai.md` (chat visuals).
- Preview: `/clubhouse-preview/coachhelm-capabilities?task=studio:distance_compass`.

### Verification

- `studio/__tests__/miss-compass.test.tsx`: off is today's markup byte for byte (no gate, gate off, block without shots,
  both sizes); names and shares; one tab stop; arrow keys; no fetch and no ask on a tap or a key; the drawer's list,
  links and cap line; close; the ask's payload; no ask without a host; 44 targets; no animation or transition anywhere
  on it, no fill or shadow on a direction; the phone's sheet. The studio's own look test (coachhelm-visual-artifact-css)
  and look-feel-pass-css pass with it.
- `lib/coachhelm/v3/chat/__tests__/miss-compass-data.test.ts`: a selection line with uuid round ids, 40-character course
  names and a summary and window past their caps ends with its closing sentence and every round id whole (it failed before
  the budget); show_visual given the read as cited (`read:e7`) keeps the bare `e7` on the shots, the ref an ask can name.
- `chat/__tests__/ask-miss-compass.test.tsx`: Ask's page turns it on for a flagged coach team only and sends the selection
  as `about`, not while a reply is on its way.
