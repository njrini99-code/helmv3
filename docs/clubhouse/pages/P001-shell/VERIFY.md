# P001 — Shell: verification

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md` (row "Foundation"); the per-gate
checklist is `docs/clubhouse/screens/foundation.md`.

## Current verification status

```text
Status:     partial
Commit/PR:  agent/clubhouse (draft PR #2102)
Date:       2026-09-30
```

## Static checks

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run -s typecheck:fast` | see CHANGELOG for the latest run |
| Lint | `npx eslint <changed files>` | see CHANGELOG |
| Clubhouse check (registry and contract) | `npm run -s clubhouse:check` | see CHANGELOG |
| Knowledge check | `npm run -s docs:check` | see CHANGELOG |
| Build | `NODE_OPTIONS=--max-old-space-size=8192 npm run build` | exit 0 on 2c5cf01b6 (before the v2 motion and navigation) |

## Automated tests

| Test | Contract | Result |
| --- | --- | --- |
| `src/clubhouse/__tests__/shell.test.tsx` | every shell catalog row of kinds 0 to 5; 1611, 1701 to 1703, 1801 to 1811, 1906; the hand contracts 10102, 10301, 10802, 10901, 11301, 11401, 11402, 11901, 12301 | pass (2026-09-30) |
| `src/clubhouse/__tests__/gate.test.ts` | 10801 | pass (2026-09-30) |
| `src/clubhouse/__tests__/motion.test.tsx`, `native.test.tsx` | 11606, 11608 and the native bridge | pass |
| `scripts/clubhouse/__tests__/check.test.mjs` | 12401 | pass |

Mutation checks (2026-09-30): with Mark all read's rollback removed, 11301 fails; with the frame
ignoring the viewer's role, 10102/10802 fails. Both were restored.

## Visual verification

### Desktop

```text
Viewport:  1280px (dev server on :3100, node Playwright script)
Reference: design/handoff/gh-nav.js, sidebar.css
Result:    the v2 navigation, the reveal, the skeleton delay and reduced motion checked 2026-09-29 (PROGRESS log)
```

### Phone

```text
Viewport:     390 × 844
Device/shell: not yet on a real iPhone (npm run ios:dev, owner)
Reference:    docs/clubhouse/phone/foundation.md
Result:       tab bars per role and the More sheet checked 2026-09-29; the iPhone pass is open
```

## Forced states

| State | Contract | How forced | Observed result |
| --- | --- | --- | --- |
| Bell loading, empty, filtered, failed | 10201, 10402, 10403, 10602 | tests; `/clubhouse-preview` bell states | as catalogued |
| Mark all read fails | 10601, 11301 | test | toast with Retry; rows put back |
| Route errors | 10603 to 10607 | tests (all five kinds); `/clubhouse-preview/home?state=error` (the unknown kind) | each view with its own words |
| Offline | 10701, 10703, 10704 | tests | banner; nothing sent; Try again says offline |
| Slow save | 10702 | test (fake timers) | "Still saving…" once |
| Not rebuilt / role | 10401, 10802 | tests | the notice, never the page |
| Sidebar reads fail | 10608, 10609 | tests (loader against a fake client) | card and badge hide; logged |

Not forced against a live session: a real chunk-load after a deploy, and a real 5xx.

## Accessibility

```text
Keyboard:       Skip to content (11801); the More sheet and the phone bell keep Tab inside and return focus (11802, 11811).
VoiceOver:      not tried on a device.
Focus:          pushed screens take focus on their title (11809).
Reduced motion: sheets don't drag; the press, reveal, skeleton fade and shimmer are off (tests and browser check).
Contrast:       clubhouse:a11y ran before the v2 changes; the rerun is open.
Text scaling:   not checked.
```

## Performance

```text
Layout shift:      not measured
Request waterfall: the shell's three reads run in parallel; the attendance read follows only when there is an event
Animation:         v2 tokens only; the animation features load after first paint (D-25)
Notes:             LCP and INP come only from sampled Sentry tracing (12101)
```

## Open verification gaps

- The iPhone pass (owner).
- `clubhouse:a11y` rerun after the v2 changes.
- The route boundary's automatic retry is tested only through the view (11401), not the boundary.
- A Clubhouse-side detector for rage, dead and slow clicks does not exist (12201 to 12203).
