# P010 — Team Hub: verification

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md`; the per-gate checklist is
`docs/clubhouse/screens/team-hub.md`.

## Current verification status

```text
Status:     partial
Commit/PR:  agent/clubhouse (local, uncommitted at the time of writing)
Date:       2026-09-30
```

## Static checks

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run -s typecheck:fast` | exit 0 after the page's code changes; the last run, after another writer added `classes.test.tsx`, was exit 1 on 8 errors all in that file (Classes, not this page) and none in this page's files |
| Lint | `npx eslint` on the changed files | exit 0 on `TeamHub.tsx`, `sheets.tsx`, `HubSkeleton.tsx`, `data/hub.ts`, `hub.test.tsx` and `team-hub/loading.tsx` |
| Clubhouse check | `npm run -s clubhouse:check` | not run in this pass (the merge pass runs it, after `registry.mjs sync`) |
| Registry and contract check | a read-only simulation of `checkRegistry` with the hand contracts merged into the registry (CH-10405 is already minted as 100205) | 0 violations, and CONTRACT.md is exactly what `sync` writes (a throwaway script; the real run is the merge pass's) |
| Knowledge check | `npm run -s docs:check` | not run |
| Build | `npm run build` | not run: no `'use server'` file changed (the loader and screens are server-only and client modules) |

## Automated tests

| Test | Contract | Result |
| --- | --- | --- |
| `src/clubhouse/__tests__/hub.test.tsx` (95 cases) | every catalog row of kinds 0 to 5 (CH-10001 to CH-10406), and the hand contracts 100101, 100102, 100410, 100701, 100801 to 100803, 100901, 101201, 101301, 101401, 101402, 101501, 101901, 102001, 102101, 102301 and 102401 | pass: `npx vitest run src/clubhouse/__tests__/hub.test.tsx` exit 0, 95/95; 66 mutations of the page's code, each failing the suite as expected (the whole fix taken out, and single lines), and 25 more for Attach from Documents and Edit an announcement (Clickables gaps 5 and 11), each caught |

| `src/clubhouse/__tests__/hub.test.tsx` (Q-82, Q-83, Q-84 additions, 129/129 cases in the file) | CH-10012, CH-10110, CH-10212, CH-10314, CH-10315, CH-10407 | pass: `npm run test:file -- src/clubhouse/__tests__/hub.test.tsx` exit 0; 45 of 45 mutations of the new code caught (the equivalent survivors are named in the report) |
| `src/test/golf/actions/announcement-attachments.test.ts`, `src/test/golf/actions/travel-class-conflicts.test.ts` | the actions behind Q-82 and Q-84: scope (coach staffed on the team, travelers on its roster, only the chosen asked about), the window in the team's zone, what leaves the server | pass: `npm run test:file -- src/test/golf/actions/announcement-attachments.test.ts src/test/golf/actions/travel-class-conflicts.test.ts` exit 0, 2/2 and 16/16; 3 of 3 and 12 of 13 mutations caught (the survivor is equivalent) |

What the suite forces, beyond the catalog: for each of the ten writes (twelve cases: a post, a task and a
file each delete separately) it presses the control once and lands, presses it again with a refusal and
then Retry, and presses it offline; it throws from a reply's write; it loads a player's and a coach's data
through the loader with a fake database and checks what a player is sent; and it checks the loading route
inside and outside the shell.

## Visual verification

### Desktop

```text
Viewport:  1280px (preview, /clubhouse-preview/hub and hub-player), logged 2026-09-30 in PROGRESS.md
Reference: design/handoff/Coach - Team Hub.html and Player - Team Hub.html
Result:    matched in the 2026-09-30 browser pass (Updates rows without a link were fixed). Not re-checked after
           this pass's changes, which do not touch layout except the loading skeleton (CH-10405), never seen
           in a browser.
```

### Phone

```text
Viewport:     390px (preview, headless Chromium, the 2026-09-30 pass logged in PROGRESS.md)
Device/shell: not yet on a real iPhone (npm run ios:dev, owner)
Reference:    design/handoff/Coach and Player - Team Hub - Mobile.html
Result:       built to the approved spec and seen at 390 in that pass; the iPhone pass is open
```

## Forced states

| State | Contract | How forced | Observed result |
| --- | --- | --- | --- |
| Skeleton | CH-10405 | test (loading route inside and outside the shell) | the Clubhouse skeleton in the shell, Fairway's outside it |
| Empty | CH-10301 to CH-10311, 100410 | tests, `?state=empty` | distinct from a failed read; Updates count |
| Validation | CH-10101 to CH-10108 | tests | message under the field, nothing sent |
| Server failure | CH-10001 to CH-10010, CH-10201 to CH-10209 | tests, `?state=failed`, `?state=failwrites` | toast or notice with its code; text kept |
| Retry | 101401 | tests, twelve cases | the same write again; the tick, tab, sheet, refresh and row follow |
| Offline | 10703, 100701 | tests, one per write | nothing sent; the shell's toast; no blank tab |
| Permission | 100801 to 100803 | tests | no cross-role controls; nothing of a teammate's in a player's data; only invited, still open events offered |
| Server refusal | 100804 | read, not run | reserved: no test forces a refusal |
| Destructive | CH-10501 to CH-10503 | tests | confirm first, warning haptic; the row leaves only when the server has deleted it |
| Optimistic rollback | 101301 | tests, including a write that throws | the tick goes back to the last confirmed answer |

## Accessibility

```text
Keyboard:       the tabs are one stop, moved by the arrows, Home and End; Enter or Space presses a reply (hub.test 102001); Esc
                closes a sheet and focus returns to its opener (hub.test 102001, on the sheet's cancel event).
                Not built: arrow keys between tabs. A full keyboard walk at 1280 and 390 is open.
VoiceOver:      not tried on a device.
Focus:          validation does not move focus to the first invalid field (the checklist's rule is not met).
Reduced motion: the shell's; nothing of this page's own.
Contrast:       clubhouse:a11y (axe) has not run for Team Hub; CH-10802 is reserved. It needs the dev server.
Text scaling:   not checked.
```

## Performance

```text
Layout shift:      not measured
Request waterfall: none on the client; the server loader reads in rounds (102101); a player's path is several rounds
Large list:        not measured (announcements read up to the server actions' own limits; Updates shows six)
Animation:         the shell's tokens only
Notes:             first-load JS and LCP (CH-1954) are open
```

## Open verification gaps

- The iPhone pass through `npm run ios:dev`, and a browser pass with a real coach and a real player account
  (owner or merge pass).
- `clubhouse:a11y` for Team Hub and its states, at 1280 and 390.
- Every write and every failure against a live session; the loading skeleton in a browser.
- The toast's Retry inside a real modal dialog: the tests run the shell's dialog-hosted toast (CH-1812)
  in jsdom, which has no top layer.
- Found and not fixed (see the report to the parent): a failed roster read leaves a coach's audience and
  assignee pickers empty with no notice; a second reply tapped while the first is saving is ignored without a
  message (`useAction` keeps one busy flag per action); `deleteGolfDocument` and `uploadGolfDocument` do not
  check for a coach (100804); validation does not move focus; a tablist without arrow keys.
- Q-70 and Q-71 are open owner questions; the page is built on their recommendations.
