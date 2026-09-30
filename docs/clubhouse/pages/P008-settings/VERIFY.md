# P008 — Settings: verification

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md`; the per-gate checklist is
`docs/clubhouse/screens/settings.md`.

## Current verification status

```text
Status:     partial
Commit/PR:  agent/clubhouse (local; not committed when this was written)
Date:       2026-09-30
```

## Static checks

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run -s typecheck:fast` | exit 0 (2026-09-30) |
| Lint | `npx eslint` on the changed Settings files (screens, loader, both test files, the two loading files) | exit 0 |
| Registry and contract check | the registry's own `checkRegistry` and `renderContract`, run in memory with this page's new Bridge IDs merged in | no P008 violation; `CONTRACT.md` is what `registry.mjs sync` writes. `npm run -s clubhouse:check` itself was not run here |
| Build | not run: no `'use server'` surface changed (the loader, the two loading files and the client screens did change) |

## Automated tests

| Test | Contract | Result |
| --- | --- | --- |
| `src/clubhouse/__tests__/settings.test.tsx` (113 cases) | every catalog row of kinds 0 to 5 (80xx to 85xx), CH-8608, CH-8701 to CH-8705, CH-8707, CH-8801 to CH-8805, CH-8807, and the hand contracts 80101, 80102, 80701, 80801, 80804, 80805, 80901 to 80903, 81002, 81003, 81204 to 81206, 81302, 81401, 81402, 81501, 81708, 82001, 82301, 82401 | pass (157/157 with the file below, 2026-09-30) |
| `src/clubhouse/__tests__/settings-server.test.tsx` (44 cases) | the loader (82101, 80804), the route and the three addresses (80101, 80102, 80405, 80801 to 80803), the three loading files (CH-8401), the live writes (80806 to 80808, 80903, CH-8002) | pass |
| `src/clubhouse/__tests__/logic.test.ts` (settings model) | section parsing and the validators | pass |
| `src/clubhouse/__tests__/native.test.tsx` | sign-out order (push teardown, active team, session) | pass |
| `npx vitest run src/clubhouse` | everything above and the other pages as they stood | 553/553 |
| `dashboard/settings/notifications` page test (3 cases) | the Fairway page for the old link | pass |

Mutation checks: every test added or retitled in this pass was checked against a broken copy of the code it guards.
107 mutations were applied one at a time in an isolated copy of the tree (baseline 157/157 first), and all 107 made a
test fail (for example, `keepSaved` removed from `SettingsView` fails the four 81204 cases; the old whole-object
rollback fails 81302; the Fairway skeleton back in the two loading files fails CH-8401; rethrowing the team CoachHelm
action's failure fails 82101; dropping the row count from any of the four updates fails 80808; not replacing the
page's copy on a fresh read fails 81204 and 81401; resetting the draft on save fails 81205).

## Visual verification

### Desktop
```text
Viewport:  1280px (preview); states player, noteam, failed, partial, assistant, failwrites, loading
Reference: none (no Settings screen in the handoff; D-18 and the design system)
Result:    built to D-18 and logged 2026-09-29 in PROGRESS.md. Not re-checked after the v2 motion and haptics changes,
           and not re-checked after this pass (which changed no styles). The owner has not reviewed the built screen.
```

### Phone
```text
Viewport:     not built. The container queries reflow the desktop layout at 860px and 560px; that was not viewed in this pass.
Device/shell: not tried on an iPhone (npm run ios:dev, owner)
Reference:    docs/clubhouse/phone/settings.md (a draft awaiting the owner)
Result:       the phone gate is open
```

## Forced states

| State | Contract | How forced | Observed result |
| --- | --- | --- | --- |
| Skeleton | 80201 | `?state=loading`, tests (the page and both old links) | skeleton in Settings' shape; the old links no longer show the Fairway one |
| Empty | 80401 to 80405 | tests | distinct from a failed read; Settings opens with no team |
| Validation | 80501 to 80515 | tests | message in place, Save disabled, nothing sent |
| Server failure | 80601 to 80636 | tests; `?state=failwrites`, `failed`, `partial` | toast or notice with its code; edits kept |
| Offline | 10703, 80701 | shell test; tests | a form save is refused; a switch and a CoachHelm autosave do not change |
| Permission | 80801 to 80808 | tests; `?state=assistant` | the team switch is disabled with the reason; the old links land by role; an update that changed no row fails with "Your account doesn’t have access to do this" |
| Destructive | 81101 to 81105 | tests | confirm first; Delete account warns when it opens |
| Optimistic rollback | 81302 | tests | only the failed control goes back |
| State preservation | 81201 to 81206 | tests | saved values kept, a failed save keeps its edits, Discard drops a draft |
| Retry | 81401, 81402 | tests | Try again reads the page; Retry finishes the save |

Not forced against a live session: every write against the real database (including an assistant coach's write
being refused by a policy, and that PostgREST answers a policy-hidden update with a count of 0, which 80808 relies on:
the tests answer from a fake client), the push subscription, the photo upload, the email and password flows against Supabase
Auth, and the account delete. A state never observed is not verified (08_CI_PROGRESS_AND_VERIFICATION.md).

## Accessibility

```text
Keyboard:       Enter in New email and in the invite code field (settings.test 82001); Esc closes a sheet (shell.test).
                Not tested: that a dialog keeps Tab inside it. A full keyboard walk is open. Focus does not move to the
                first invalid field (checklist item open).
VoiceOver:      not tried on a device.
Reduced motion: the CH-8608 test checks the stored Animations preference, not that motion stops; the shell's tests cover
                a sheet not dragging (shell.test) and the press being off (motion.test).
Contrast:       clubhouse:a11y (axe, WCAG 2.2 AA) ran on 2026-09-29 with 0 violations across 105 pages, the eight Settings
                pages among them, before the v2 changes; rerun open.
Text scaling:   not checked.
```

## Performance

```text
Layout shift:      not measured
Request waterfall: none after paint (the server loader); on the server three batches, read from the code, not measured
Large list:        none on this page
Animation:         v2 tokens only
Notes:             first-load JS and LCP are open (CH-1954)
```

## Open verification gaps

- Owner review of the built desktop screen; approval and build of the phone design; the iPhone pass.
- A browser pass with a real coach account (head and assistant) and a real player account, forcing the live writes.
- `clubhouse:a11y` rerun after the v2 changes; the keyboard walk; LCP and layout shift.
- Fixed 2026-09-30 (each has a test that fails without the fix): saved values snapped back after leaving a section
  (81204); a failed CoachHelm dashboards switch put back another switch (81302); Retry on a failed save left the card
  unfinished (81402); a slider moved just before leaving was dropped (81206); the two old links showed the Fairway
  skeleton in Clubhouse (CH-8401); a throwing team CoachHelm action failed the whole page and a missing profile or team
  row was not logged (82101); Discard was silent (81708); the handicap messages used a hyphen for the minus sign; a
  profile, team, golf or coaching-settings save that a policy hides the row from could say Saved while nothing
  changed (80808; how the database answers is not observed live); a failed team CoachHelm access check made a head
  coach see the switch disabled with "Only the head coach can change this." (80804).
- Found and not fixed:
  - A refused instant save (a switch or CoachHelm autosave) always says "Check your connection", because it never shows
    the server's reason; a refusal that arrives as an error (an upsert against a policy, "violates row-level
    security") reads the same way on a form save.
  - Two CoachHelm priority moves in a row: if the first save fails and the second lands, the screen shows the order
    from before the first move while the server has both moves.
  - The loader reads `golf_coach_philosophy` and `golf_teams` twice each.
  - Leave team, Make a new invite code, Reset CoachHelm updates and Turn off CoachHelm open their confirm without the
    warning haptic (an owner decision under D-70).
