# 2026-11-15 — coachhelm

## 2026-11-15 — Your week says its state; tone saves; no test data for players

```text
Design package: none (prod audit 2026-11-15, CHATSET-01, PL-CH-01, PL-CH-02, PL-CH-03, PL-CH-04, PL-CH-05, PL-CH-06, N13P-16)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none new (setChatTone, as before)
Data impact:    none (reads only; no rows changed)
Held items:     a coach-wide default tone needs a migration (Nick's call)
```

### Changed

- `chat/parts/KnowsPanel.tsx`: the tone control shows only with a chat open,
  saves on that chat, and when the save fails the pill goes
  back and an alert says "The tone wasn’t saved. Try again." with the error
  haptic (CHATSET-01, interim).
- `file/YourWeek.tsx`: CoachHelm off for the player shows the off state with the
  coach's reason, never "Couldn’t load / Try again"
  (PL-CH-01). A failed strokes-gained, field or focus read shows the coach
  file's "Couldn’t load this part · Try again" in that card
  (PL-CH-02, PL-CH-04). "1 round", not "1 rounds" (PL-CH-05). The empty copy is
  in player words (PL-CH-06).
- `data/coachhelm-file.ts`: penalties and the newest round day leave out test
  rounds; penalties count the rounds Home and Stats count
  (no practice, no round without a score) (PL-CH-03). The newest day and the
  focus report a failed read instead of "none" (PL-CH-04).
  The current focus, on the player's week and the coach's file alike, is one
  made, started or changed this season (from 1 August in
  the team's zone): last season's focus is not "your focus" now (N13P-16,
  interim; closing the old rows is a data change for Nick).
- `app/golf/actions/insight-delivery.ts`,
  `lib/coachhelm/delivery/team-scope.ts`: a player's Board, Deep dive, Standing
  ladder and Team
  Hub card read their insights from the teams they are on now (plus rows with no
  team), never a former team's (N13P-16: Guilford's reads
  showed on Demo University's CoachHelm). A failed team read keeps the old,
  unscoped read.
- Penalties stay a player's own rounds on every team, as Home and My stats count
  them: a team filter on penalties alone would make
  them disagree again (N13P-16 asked for one; not added, said in the PR).

### Why

- The tone pill moved with no chat open and nothing saved. Your week told a
  player whose CoachHelm is off to try again. Failed reads
  made cards vanish or read as "no focus this week". A QA round could date the
  week.

### Verification

- `lib/coachhelm/delivery/__tests__/team-scope.test.ts` (new),
  `chat/parts/__tests__/knows-tone.test.tsx` (new),
  `file/__tests__/your-week-states.test.tsx` (new),
  `file/__tests__/player-file.test.tsx`.
- Not checked in a browser or on a device in this change.
