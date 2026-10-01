# P007 — Messages: verification

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md`; the per-gate checklist is
`docs/clubhouse/screens/messages.md`.

## Current verification status

```text
Status:     partial
Commit/PR:  agent/clubhouse (local; draft PR #2102 is behind it)
Date:       2026-09-29
```

## Static checks

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run -s typecheck:fast` | exit 0 (2026-09-29, after the v2 foundation) |
| Lint | `npx eslint src/clubhouse` | exit 0 |
| Clubhouse check | `npm run -s clubhouse:check` | clean |
| Registry check | inside `clubhouse:check` (`scripts/clubhouse/registry.mjs`) | clean |
| Contract check | inside `clubhouse:check`: all 25 categories, every P007 Bridge ID listed under its category | clean |
| Knowledge check | `npm run -s docs:check` | exit 0 |
| Build | `NODE_OPTIONS=--max-old-space-size=8192 npm run build` | exit 0 on 2c5cf01b6 (before the v2 motion and navigation) |

## Automated tests

| Test | Contract | Result |
| --- | --- | --- |
| `src/clubhouse/__tests__/messages.test.tsx` (63 cases, each named by the codes it forces) | every catalog row of kinds 0 to 5 (706xx, 705xx, 704xx, 702xx, 711xx), plus 7604, 7704, 7804 | pass (`messages.test.tsx` 63/63, 2026-09-30) |
| `src/app/golf/actions/__tests__/message-attachments-conversation-files.test.ts` (7 cases) | 72302, 70630 | pass |
| `src/clubhouse/__tests__/shell.test.tsx` | the shell contracts this page inherits (10703, 10702, 11611, 11811 and the rest) | pass |

## Visual verification

### Desktop

```text
Viewport:  924, 1280 and 1400px (preview)
Reference: design/handoff/screenshots/messages-01..04 (v1); Coach - Messages.html (v2, same screen)
Result:    matched, logged 2026-09-29 in PROGRESS.md (team thread, direct, group details, new group validation;
           send, react, edit, delete and attachments driven through the preview). Not yet re-checked after the
           v2 motion, haptics and navigation changes.
```

### Phone

```text
Viewport:     390 × 844 (preview)
Device/shell: not yet on a real iPhone (npm run ios:dev, owner)
Reference:    design/handoff/mobile/Messages Mobile.html; Coach - Messages - Mobile.html (v2)
Result:       built to the approved spec; the iPhone pass is open
```

## Forced states

| State | Contract | How forced | Observed result |
| --- | --- | --- | --- |
| Skeleton | 70201 | `/clubhouse-preview/messages?state=loading`, test | skeleton in Messages' shape |
| Empty | 70401, 70408 | `?state=empty`, test | distinct from a failed read |
| Validation | 70501 to 70505 | tests | message under the field, nothing sent |
| Server failure | 70601 to 70631 | tests; `?state=failed`, `thread-failed`, `ann-failed`, `files-failed`, `add-failed` | toast or notice with its code; draft kept |
| Offline | 10703 | test (shell) | nothing sent, the action named |
| Permission | 70801, 70802 | tests | toast; the conversation closes |
| Destructive | 71101, 71102 | tests | confirm first, warning haptic |
| Optimistic rollback | 71301, 70613 | test (a refused send stays marked with Retry) | bubble marked Not sent, never removed |

Not forced yet against a live session: send, edit, delete and leave failures (the merge pass). A state
never observed is not verified (08_CI_PROGRESS_AND_VERIFICATION.md).

## Accessibility

```text
Keyboard:       Enter sends and Shift+Enter adds a line (messages.test 72001); Esc closes a sheet (shell.test).
                Not tested: that a sheet keeps Tab inside it. A full keyboard walk at 1280 and 390 is open.
VoiceOver:      the long press has a Message actions button (CH-7804); not tried on a device.
Focus:          a pushed screen takes focus on its title (CH-1809).
Reduced motion: a sheet doesn't drag (shell.test); the press is off (motion.test); the reveal, skeleton fade and
                shimmer are off (browser check, 2026-09-29). That pushes and sheets fade instead is not tested.
Contrast:       clubhouse:a11y (axe, WCAG 2.2 AA) ran for messages at 1280 and 390 before the v2 changes; rerun open.
Text scaling:   not checked.
```

## Performance

```text
Layout shift:      not measured
Request waterfall: none on the server (one-pass loader); the client fetches the list and the open thread once each
Large list:        not measured
Animation:         v2 tokens only
Notes:             first-load JS and LCP after the v2 reveal are open (CH-1954)
```

## Open verification gaps

- The iPhone pass through `npm run ios:dev` (owner).
- A browser pass with a real coach account (owner or merge pass).
- Forced send, edit, delete and leave failures against a live session.
- The full keyboard walk; `clubhouse:a11y` rerun after the v2 changes; LCP and layout shift.
- The Messages e2e (it signs in to production, so the owner decides when).
- Fixed 2026-09-30: an unsent draft used to be lost when you switched threads. Drafts are now kept per
  conversation by the container (71202), and the test fails with the fix taken out (checked).
- v2 draws the no-conversations state as a whole-page empty (D-71); the rail version is what is built.
