# P005 — Stats (player): changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

## 2026-09-30 — Tabs from the keyboard

```text
PR/commit:      agent/clubhouse
Contract IDs:   none new
Data impact:    none
```

### Fixed (with a test that fails without the fix)

- **The profile tabs had no arrow keys.** They are now one Tab stop, and the arrows (wrapping), Home and End
  move between them and select, as in the Segmented control (52001, reworded).

## 2026-09-30 — Page docs, permission proven, six bugs fixed

```text
Contract IDs:   19 new behaviour contracts: 50101, 50102, 50103, 50104, 50611, 50803, 50804, 50805, 50806,
                50901, 51201, 51202, 51401, 51501, 51901, 52001, 52101, 52301, 52401 (each named by a test
                title); two new catalog rows, CH-5901 and CH-5902 (Bridge IDs 50701 and 50702, category 07)
Actions:        6 (ACT-P005-*)
Data impact:    none
```

### Changed

- The six page docs, the manifest's actions, and CONTRACT.md answering all 25 categories, with Permission
  (08) written from the route, the loader and the actions rather than assumed: a player opens only their own
  stats, a coach the team and any player on it.
- Fixed, each with a test that fails without the fix:
  - A failed player or membership read showed "That player isn't on your team" (CH-5306). The loader now
    throws, so the route error view offers Try again (50611).
  - A pending or removed team member opened as Active. The membership read now takes active and inactive
    rows only, as Roster does (50804).
  - A coach's Message opened the bare inbox. It opens the direct thread with that player, on desktop and on the
    phone (50104), as the phone spec and Messages' deep link (70102) say.
  - Changing the window while offline was not refused, so the request was attempted and the page could stay
    dimmed and busy, and a slow change never said so. It now behaves as on Team stats: refused with nothing
    requested (CH-5901), one notice after 5 seconds (CH-5902).
  - A `?player=` that was not shaped like an id reached the database, which rejects it, and the failed read
    was shown as "not on your team". The route now answers it as not on your team without a read (50804).
  - If the team's own row failed to load, the profile graded a women's team against the men's D1 averages.
    Its tour is now unknown and no benchmark is claimed (CH-5208), as Team stats does (CH-4210).
- Tests: 25 added (the route's permission and address, the loader on a fake Supabase client, the focus area
  landing, the keyboard, the offline and slow window changes, the busy state) and eight retitled to carry the
  IDs they prove; the meta test 52401 keeps the file honest. Each new test was mutation-checked.
- The catalog gains the 59xx rows, states the true empty and permission answers (CH-5306, CH-5307, CH-5208),
  and CH-5208 and CH-5402 now name tests (they said existing and preview).
- The checklist's Offline or slow network box is ticked, with its evidence.

### Found and not fixed

- `createFocusArea` (shared action, `actions/development.ts`): stores the `coach_id` the browser sends instead
  of the caller's own, and skips its roster check when the coach has no organisation or no active team
  (row-level security remains the lock). Fix it in the action.
- The profile has no profile-shaped loading state: `stats/loading.tsx` cannot read the address, so it draws
  Team stats' shape, and a profile's taller hero moves it.
- Profile tabs are not arrow-key navigable (each is one Tab stop).
- The phone profile's scoring trend draws nothing with fewer than two rounds, and says nothing.
- A coach's Back to Team and the Previous and Next links do not check for offline the way the window switch
  now does.
- v2 draws Stats with no rounds ever as a whole-page empty, "No stats yet" (D-71); not built, owner decision.

### Verification

- `npx vitest run src/clubhouse/__tests__/stats-player.test.tsx` 53/53; `npm run -s typecheck:fast` exit 0;
  eslint exit 0 on the changed files. Not run in this pass: clubhouse:check, docs:check, build, a11y.

## 2026-09-30 — v2 phone built

- `StatsPlayerPhone`, inside `StatsPlayer` so the loader, the window change, the Add focus area sheet and the
  catalog are the desktop's: a coach's Player stats with Team and Share, or a player's My stats with More;
  three figures; Game detail's five sections as chips, one at a time; the scoring line; Rounds (five, then
  All N) and Development. New catalog rows CH-5002 and CH-5807; the gaps against the board are Q-68. Nine
  tests, each mutation-checked.

## 2026-09-29 — Fidelity pass and `?tab=`

- Strokes gained by leg is the design system's StrokesGainedRoute, the Rounds count its tab pill, and a coach
  reads "Stats › name" in the top bar. `?tab=overview|game|rounds|dev` opens that tab, and Roster's "All N"
  opens `window=season&tab=rounds` (D-53).

## 2026-09-29 — Desktop build

- The profile on the RLS-scoped client in one server pass, the same page for a coach and, with the
  permissions a player already has, for a player; the focus-area sheet on `createFocusArea`; and the state
  catalog CH-50xx to CH-58xx.
