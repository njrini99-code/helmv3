## 2026-10-22 — CoachHelm data prompts in round entry (flags off)

```text
Design package: none (CoachHelm Slice 8a and 8b; the Fairway prompts are the
                reference)
PR/commit:      see git log (claude/coachhelm-round-prompts, chs-22, chs-23)
Contract IDs:   CH-11960 putt-miss prompt, CH-11961 recovery-lie tap,
                CH-11962 course nudge, CH-11760 chip haptic
Actions:        a putt-miss side (Short, Long, High side, Low side); Clear shot
                or Blocked or punch out; Pick the course; Skip on each
Data impact:    none new: the tags save through the shared shot engine's
                handleTagPuttMiss / handleTagRecovery, and a linked course
                goes out as the round's course_id with its next update
Held items:     coachhelm_data_gap_prompt_v1 and coachhelm_data_prompts_v2
                stay off in production
```

### Changed

- Shot entry: behind `coachhelm_data_gap_prompt_v1`, a missed first putt in
  the band the player's putting read is short of asks "Which side did it
  miss?" with one tap, and counts toward the read ("3 of 6 for your 5–10 ft
  putt read"). Skip hides it for that putt.
- Shot entry: behind `coachhelm_data_prompts_v2`, a tee shot that finished in
  the rough or another lie asks "Next shot from there?" (Clear shot, Blocked
  or punch out), the same question the Fairway screen asks.
- New round and Continue round: behind `coachhelm_data_prompts_v2`, a round
  typed by hand with no library course shows "Link this round to a course" at
  the first hole and in the Round complete sheet. Pick the course opens the
  course picker with the library only (no Add); pars and yardages stay as
  entered.
- The course picker hides Add, and its empty copy stops offering to add a
  course, when the caller passes no add handler.
- The round-new and round-continue routes load the asks and the v2 flag for
  the route's player, as the Fairway pages do. Flags off: undefined and
  false, and the screens are what they were.

### Why

- The Clubhouse round screens lacked the one-tap prompts the Fairway screens
  already carry, so data-gap reads and course plans filled only from Fairway
  rounds.

### Verification

- `src/clubhouse/screens/rounds/track/__tests__/data-prompts.test.tsx`,
  `src/clubhouse/routes/__tests__/round-prompts-routes.test.tsx` and the
  existing round tracking and entry suites.
- Preview states `track?state=puttprompt|recovery|nudge|nudge-summary`, phone
  screenshots (390 × 844), light and dark.
