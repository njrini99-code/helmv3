# Roster checklist

Reference: design/handoff/Roster.html, roster.jsx, roster.css,
screenshots/roster-01..05 Route: /golf/dashboard/roster (coach)   Surface tag:
`roster.<requests|list|peek>`

## spec

- [x] Desktop reference files and screenshots are named above
- [x] Every figure on the screen is mapped to a table and column, or logged as a data gap in PROGRESS.md
- [x] Every control is mapped to an existing server action, or to a migration that has to be written (never applied by an agent)
- [x] Differences between the README and the screenshots are resolved as decisions in PROGRESS.md

## desktop

- [x] Matches the reference at 924px and at 1280px or wider (spacing, type, radius, depth)
- [x] Only Clubhouse tokens and classes are used, and `clubhouse:check` is clean
- [x] Numbers are tabular, with a true minus, `E` for even and `—` for no data
- [x] Red appears only for under par and the pin flag; gains are green and losses amber
- [x] Copy is in sentence case, in the head-pro voice, and actions are a verb plus an object
- [x] Controls that point at an unbuilt screen are hidden via `rebuiltHref`, never dead
- [x] A narrow canvas (container below 860px) reflows without horizontal page scroll

## wired

- [x] Everything is read server-side in one request, in two parallel rounds (the second needs the first's player ids), so final data is on first paint (no client fetch waterfall)
- [x] Reads go through the RLS-scoped client, with no service role for a user's own data
- [x] Every Supabase call reads `error`; lists over 1,000 rows paginate, and `.in()` is chunked
- [x] Null, zero and "early read" render differently, and windows and samples are stated
- [x] N/A: round dates are calendar dates (formatted in UTC noon, no zone shift); request ages are computed server-side
- [x] Unit tests cover the loader's derivations

## states

- [x] Loading: a route skeleton shaped like the page, so nothing shifts when data lands
- [x] Empty (first run): says what will appear here and the one next step
- [x] Empty (filtered or no results): distinct from first run, and offers to clear filters
- [x] Partial failure: each section has its own failure flag and shows an inline notice with Try again; the rest of the page still works
- [x] Crash containment: every section is wrapped in a `SectionBoundary` with a surface tag
- [x] Route error: the Clubhouse error view (it inherits the `logError`, chunk and stale-action recovery)
- [x] Not found and no access: a coach without a team gets the no-team state; players never reach the coach roster
- [x] Offline or slow network: the action says so instead of spinning forever
- [x] User errors: every mutation goes through `useAction`, with a specific failure message, Retry, an error haptic and a Sentry event
- [x] Forms: the coach's note saves on blur, keeps the text on failure, and the Remove button disables while pending
- [x] Destructive actions: a confirm step or Undo
- [x] Optimistic updates roll back on failure and tell the coach

## error-tracking

- [x] Server read failures are logged with `chLogServer('<screen>', '<read>')`
- [x] Client crashes are reported with `chReport`, tagged `ui=clubhouse` and `surface=<screen>.<section>`
- [x] Key intents leave a `chTrail` breadcrumb (open, filter, submit)
- [x] No `catch` swallows an error without reporting or handling it on screen
- [x] Handled failures are low severity and crashes are high, so alerts stay meaningful
- [ ] Every failure path was forced once locally and seen in the console or Sentry. Open because it needs a dev server with each failure forced in turn; the tests force each one, but not in a browser. Owner: the merge pass (D-27).

## phone-spec

Evidence: `docs/clubhouse/phone/roster.md` maps the owner's design
(`design/handoff/mobile/Roster Mobile.html`, `m-roster.jsx`: list, profile, join
requests sheet). The design boards were captured at 390 × 844, as was the
current preview at 390px.

- [x] `docs/clubhouse/phone/<slug>.md` is written as an intentional native design, not a shrunk desktop. It adds a pushed profile, a requests sheet and a list with sections, and maps every element to a component and to a loader field or action.
- [x] The owner approved it: the file says `Status: approved`. Handing over the design is the approval (D-22, `design/handoff/mobile/README.md`).
- [x] The phone foundation it sits in is approved. The owner decided it on 2026-09-29, the lead relayed it, and it is recorded as D-40 onward on `agent/clubhouse-messages-mobile`, whose `phone/foundation.md` says `Status: approved`. It merges into this branch before the shell-dependent pieces are built.
- [x] The owner questions from the spec are answered: Q-30 to Q-39, 2026-09-29, recorded as D-50 to D-59 in `PROGRESS.md`.

## phone

Evidence so far (2026-09-29): built on the foundation, and the preview captured
at 390 × 844 (roster-34 to 44 in the session scratchpad) against the design
boards roster-01 to 14. `clubhouse:a11y roster` is clean on 15 pages, at 390px
and 1280px, including the requests sheet, the profile and its ⋯ sheet.

- [ ] Built at 390px and 430px, respecting the safe areas. 390 is checked in the preview (d9b1c81fc). Open: 430px, owned by the merge pass (D-27); safe areas on a device, owned by the owner's iPhone pass.
- [x] Touch targets are at least 44px, and hover-only affordances have a tap equivalent. Rows are 64px; buttons, the sort hit area and the "All N" link are 44px. The desktop row menu is the profile's ⋯ sheet. The axe target-size check is clean.
- [ ] Sheets are used instead of popovers, and they drag to dismiss. Sheets are done: the join requests, ⋯ and Invite sheets are `ui/Modal` bottom sheets. Open: drag to dismiss, owned by the foundation, built in b4b1b6a6b (CH-1611) on `agent/clubhouse-messages-mobile`, and it arrives when that is merged here.
- [ ] The bottom tab bar and toasts don't overlap content. The tab bar is checked at 390 (the list ends above it). Open: toasts over content, owned by the merge pass (D-27).
- [ ] Checked in the iOS app shell (Capacitor), with native haptics felt on a device. Open: owned by the owner (`npm run ios:dev`). Pull to refresh isn't in this checklist; it waits for a design (D-43).

## motion
<!-- Rewritten for v2 motion (D-64) and v2 haptics (D-70) on 2026-09-29; earlier evidence was against the old timings, so every box starts again. -->
- [ ] Transitions use only the v2 tokens (press 110, quick 180, base 260, release 280, reveal 520ms) and the v2 curves (D-64)
- [ ] Press: every tappable shrinks about 6px and springs back (`useChPress`), and nothing scales twice
- [ ] First paint: sections rise in once (`.ch-reveal`); no count-ups and no other stagger; a refresh never replays it
- [ ] Skeletons wait 150ms, fade in, and share one shimmer sweep
- [ ] Reduced motion and Animations off remove the rise, the press and the shimmer (`useChReducedMotion`)
- [ ] Haptics follow v2 (D-70): selection for tabs, segmented controls, switches and choices; light for primary buttons; success for Post, Save, Send, Share, Assign and Got it; warning for Remove, Delete, Discard and Dismiss; medium only for a sheet settling or a shot logged; error when an import or sync fails; every other tap silent

## accessibility

Verified by `roster.test.tsx` (CH-38xx) and `npm run clubhouse:a11y`; states
catalogued in `docs/clubhouse/catalog/roster.md`.

- [ ] Full keyboard path, with visible focus and no traps; Esc closes overlays. CH-3803 covers Esc, and `<dialog>` traps focus in sheets. Open because the path hasn't been walked in a browser end to end. Owner: the merge pass (D-27).
- [x] Landmarks, headings in order, table roles, and labels on icon buttons
- [x] Charts have a text equivalent (aria-label or a view-as-table path)
- [x] Status changes are announced (aria-live) and errors use role=alert
- [x] Text contrast meets WCAG AA on every surface

## performance

- [ ] No request waterfall on the server, with independent reads in parallel. `loadRoster` runs two parallel rounds: the second needs the first's player ids. Open because it hasn't been measured. Owner: the merge pass (D-27).
- [ ] Client JS is limited to the interactive islands, and animation code is loaded lazily. Open because no bundle check has been run. Owner: the merge pass (D-27), with `npm run build`.
- [ ] No layout shift after first paint. The skeleton matches the layout on desktop and phone. Open because no layout-shift measurement has been taken. Owner: the merge pass (D-27).

## verified

- [x] typecheck, lint, `clubhouse:check` and the screen's tests are green, with exit codes recorded in the log. Logged 2026-09-29: typecheck 0, eslint 0 and `vitest src/clubhouse` 295/295 (2d4555d9b); typecheck:fast 0, test:file roster 37/37 and clubhouse:check 0 (46461e837); clubhouse:check 0 (eb8e079be).
- [ ] Browser pass on desktop and phone with a real coach account, logged in PROGRESS.md. The preview pass at 1280 and 390 is logged (d9b1c81fc). Open because no real coach account has been used. Owner: the owner's live pass on a Vercel preview (Q-4).
- [ ] Owner review of the built screen. Open. Owner: the owner.
