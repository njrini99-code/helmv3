# P007 — Messages: verification

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md`; the per-gate
checklist is `docs/clubhouse/screens/messages.md`.

## Current verification status

```text
Status:     partial
Commit/PR:  codex/clubhouse-design-fidelity (repair pass)
Date:       2026-10-01
```

October 1 repair checks: settled WebKit thread at 390x664 has graded incoming
ivory and sent green faces, visible upper highlights and layered contact/ambient
shadows. The page fills the viewport without document overflow. Capture waits
for the thread panel to finish sliding; the after image is not an intermediate
transition frame. Message behavior tests pass with the combined repair tests.
Physical iPhone scrolling and keyboard performance remain unverified.

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

## Screenshots

Evidence log. The images stay in `.helm/screenshots/clubhouse/` (never
committed) and travel in the PR description; this table is the committed record
of them. One row per file; the label is the file's basename, named by `npm run
clubhouse:shots -- name` (convention: `.claude/rules/clubhouse.md`). Phase is
before, after, baseline or evidence.

| Label | Phase | Commit | What it shows |
| --- | --- | --- | --- |
| `P007__list__coach__1440__default__after__ba75b0a.png` | after | ba75b0a | list (coach), 1440px, default; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__list__coach__1440__default__baseline__ee5976d.png` | baseline | ee5976d | list (coach), 1440px, default; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__list__coach__375__default__after__ba75b0a.png` | after | ba75b0a | list (coach), 375px, default; /clubhouse-preview/messages?state=rail, synthetic preview fixture |
| `P007__list__coach__375__default__baseline__ee5976d.png` | baseline | ee5976d | list (coach), 375px, default; /clubhouse-preview/messages?state=rail, synthetic preview fixture |
| `P007__list__coach__390__default__after__ba75b0a.png` | after | ba75b0a | list (coach), 390px, default; /clubhouse-preview/messages?state=rail, synthetic preview fixture |
| `P007__list__coach__390__default__baseline__ee5976d.png` | baseline | ee5976d | list (coach), 390px, default; /clubhouse-preview/messages?state=rail, synthetic preview fixture |
| `P007__list__coach__430__default__after__ba75b0a.png` | after | ba75b0a | list (coach), 430px, default; /clubhouse-preview/messages?state=rail, synthetic preview fixture |
| `P007__list__coach__430__default__baseline__ee5976d.png` | baseline | ee5976d | list (coach), 430px, default; /clubhouse-preview/messages?state=rail, synthetic preview fixture |
| `P007__thread__coach__1440__composer-draft__after__f724065.png` | after | f724065 | thread (coach), 1440px, composer-draft; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__1440__composer-draft__baseline__ee5976d.png` | baseline | ee5976d | thread (coach), 1440px, composer-draft; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__1440__composer-draft__before__ba75b0a.png` | before | ba75b0a | thread (coach), 1440px, composer-draft; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__1440__thread-open__after__f724065.png` | after | f724065 | thread (coach), 1440px, thread-open; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__1440__thread-open__baseline__ee5976d.png` | baseline | ee5976d | thread (coach), 1440px, thread-open; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__1440__thread-open__before__ba75b0a.png` | before | ba75b0a | thread (coach), 1440px, thread-open; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__375__composer-draft__after__f724065.png` | after | f724065 | thread (coach), 375px, composer-draft; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__375__composer-draft__baseline__ee5976d.png` | baseline | ee5976d | thread (coach), 375px, composer-draft; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__375__composer-draft__before__ba75b0a.png` | before | ba75b0a | thread (coach), 375px, composer-draft; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__375__thread-open__after__f724065.png` | after | f724065 | thread (coach), 375px, thread-open; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__375__thread-open__baseline__ee5976d.png` | baseline | ee5976d | thread (coach), 375px, thread-open; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__375__thread-open__before__ba75b0a.png` | before | ba75b0a | thread (coach), 375px, thread-open; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__390__composer-draft__after__f724065.png` | after | f724065 | thread (coach), 390px, composer-draft; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__390__composer-draft__baseline__ee5976d.png` | baseline | ee5976d | thread (coach), 390px, composer-draft; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__390__composer-draft__before__ba75b0a.png` | before | ba75b0a | thread (coach), 390px, composer-draft; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__390__thread-open__after__f724065.png` | after | f724065 | thread (coach), 390px, thread-open; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__390__thread-open__baseline__ee5976d.png` | baseline | ee5976d | thread (coach), 390px, thread-open; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__390__thread-open__before__ba75b0a.png` | before | ba75b0a | thread (coach), 390px, thread-open; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__430__composer-draft__after__f724065.png` | after | f724065 | thread (coach), 430px, composer-draft; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__430__composer-draft__baseline__ee5976d.png` | baseline | ee5976d | thread (coach), 430px, composer-draft; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__430__composer-draft__before__ba75b0a.png` | before | ba75b0a | thread (coach), 430px, composer-draft; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__430__thread-open__after__f724065.png` | after | f724065 | thread (coach), 430px, thread-open; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__430__thread-open__baseline__ee5976d.png` | baseline | ee5976d | thread (coach), 430px, thread-open; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__430__thread-open__before__ba75b0a.png` | before | ba75b0a | thread (coach), 430px, thread-open; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__list__coach__1440__default__after__d4367ee.png` | after | d4367ee | list (coach), 1440px, default; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__list__coach__1440__default__before__d3a6483.png` | before | d3a6483 | list (coach), 1440px, default; /clubhouse-preview/messages, synthetic preview fixture |
| `P007__thread__coach__390x664__ready__before__cbc1c0d.png` | before | `cbc1c0d` | Before: flat incoming and sent bubble fills. |
| `P007__thread__coach__390x664__ready__after__cbc1c0d.png` | after | `cbc1c0d` | After: graded surfaces, highlights and grounded bubble shadows; thread settled at0x0. |
| `P007__apple-thread__coach__390x664__group__after__cca081c.png` | after | cca081c | apple-thread (coach), 390x664px, group |
| `P007__apple-thread__coach__390x664__group__before__cca081c.png` | before | cca081c | apple-thread (coach), 390x664px, group |
| `P007__apple-thread__coach__390x664__long-press__after__cca081c.png` | after | cca081c | apple-thread (coach), 390x664px, long-press |
| `P007__apple-thread__coach__390x664__reply-multiline__after__cca081c.png` | after | cca081c | apple-thread (coach), 390x664px, reply-multiline |

## 2026-10-02 — Apple Messages phone interaction pass

- Messages 74/74 + audit 8/8: 82 passed, one worker, 11.61 seconds, real exit 0.
  Includes multiline Return/explicit Send; real parent send ID and Cancel;
  vertical
  scroll/back-edge gesture guards; loaded/deleted/unavailable quote
  truthfulness;
  pending text target lock; deferred attachment refusal restoration;
  phone-thread
  departure clearing reply while preserving text; intermediate timestamp reveal
  and loaded-parent scrolling. Hook/server Retry checks are recorded by their
  owner.
- After the full suite, the reduced-motion parent jump was repaired and its
  existing timestamp/quote-scroll test ran again: 1/1 selected passed (281ms,
  1.74 seconds overall), checking smooth normally and instant under reduced motion.
- Final scoped Messages source/test ESLint exit 0; `git diff --check` exit 0.
- WebKit iPhone13 emulation, local synthetic populated fixture at port 3120:
  scrollWidth equals viewport at 375/390/430 pixels. At 390, a held native
  pointer opened the
  selected-message sheet, a 70px rightward pointer gesture on a visible bubble
  selected Reply, Return produced `First line\nSecond line`, input retained
  focus
  and `enterkeyhint=enter`. The action sheet showed actual 2:31 PM and selected
  text.
- Axe WCAG 2 A/AA and 2.1 AA scan of the active thread: zero violations.
  Physical touch,
  Safari keyboard chrome, frame timing and production persistence were not
  measured
  by this emulator pass. Four shots show settled group, reply multiline, and
  action
  context; the Next development indicator in the lower-left is not product UI.

Combined final production build: exit 0. Compiled in 117 seconds, TypeScript
finished in 13.3 seconds, all 181 static pages generated and the route table
emitted. This verifies the built source, not a deployed real-account write.

## Open verification gaps

- The iPhone pass through `npm run ios:dev` (owner).
- A browser pass with a real coach account (owner or merge pass).
- Forced send, edit, delete and leave failures against a live session.
- The full keyboard walk; `clubhouse:a11y` rerun after the v2 changes; LCP and layout shift.
- The Messages e2e (it signs in to production, so the owner decides when).
- Fixed 2026-09-30: an unsent draft used to be lost when you switched threads. Drafts are now kept per
  conversation by the container (71202), and the test fails with the fix taken out (checked).
- v2 draws the no-conversations state as a whole-page empty (D-71); the rail version is what is built.
