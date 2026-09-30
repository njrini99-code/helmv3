# Messages checklist

Reference: design/handoff/Messages.html, messages.jsx, msg-data.js, msg.css, screenshots/messages-01..04
Route: /golf/dashboard/messages (coach and player) · `?conversation=<id>` · `?player=<golf_players.id>`
Surface tag: `messages.<rail|thread|details|send|sendFiles|edit|remove|react|startDirect|createGroup|leave|members|attachments>`

Data: the conversation list and threads stay on the existing realtime hooks (`useGolfConversations`,
`useGolfMessages`, `useMessageReactions`, `useMessageAttachments`), unchanged. The server loads only who
the viewer may message (the program's coaches and the team's players, the audience
`createGolfConversation` validates) and the team timezone for labels.

Player permissions: players start direct threads with their coaches and teammates (as in the current app);
coaches also create named team groups (`createGolfTeamBroadcast`). RLS and the actions decide; the screen reports what
they return.

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
- [x] Everything is read server-side in one pass, so final data is on first paint (no client fetch waterfall)
- [x] Reads go through the RLS-scoped client, with no service role for a user's own data
- [x] Every Supabase call reads `error`; lists over 1,000 rows paginate, and `.in()` is chunked
- [x] Null, zero and "early read" render differently, and windows and samples are stated
- [x] Times format in the team timezone on server and client alike, so labels never mismatch on hydration
- [x] Unit tests cover thread grouping, rail sections, zone-correct time labels and filters (`logic.test.ts`, "messages model")

## states
- [x] Loading: a route skeleton shaped like the page, so nothing shifts when data lands
- [x] Empty (first run): no conversations says who can be messaged and offers New message
- [x] Empty (filtered or no results): search and the Unread filter say nothing matches, distinct from first run
- [x] Partial failure: the rail, the thread, group members and each attachment fail on their own with Try again
- [x] Crash containment: the rail, thread and details are each wrapped in a `SectionBoundary` with a surface tag
- [x] Route error: the Clubhouse error view
- [x] Not found and no access: a conversation link the viewer can't open says so and clears; no team has its own state
- [x] Offline or slow network: the action says so instead of spinning forever
- [x] User errors: every send, edit, delete, reaction, group and leave failure says what failed and what to do, with an error haptic and a Sentry event
- [x] Forms: a failed send keeps the draft and files; new-group validation names the missing field
- [x] Destructive actions: delete message and leave group each ask first
- [x] Optimistic updates roll back on failure and tell the viewer (failed sends stay in the thread with Retry and Discard)

## error-tracking
- [x] Server read failures are logged with `chLogServer('<screen>', '<read>')`
- [x] Client crashes are reported with `chReport`, tagged `ui=clubhouse` and `surface=<screen>.<section>`
- [x] Key intents leave a `chTrail` breadcrumb (open conversation, send, start direct, create group)
- [x] No `catch` swallows an error without reporting or handling it on screen
- [x] Handled failures are low severity and crashes are high, so alerts stay meaningful
- [ ] Every failure path was forced once locally and seen in the console or Sentry (the preview forces the conversation-list and thread failures; send, edit, delete and leave still need a forced failure against a live session. Open: the merge pass, with a live session)

## phone-spec
- [x] `docs/clubhouse/phone/<slug>.md` is written as an intentional native design, not a shrunk desktop (`phone/messages.md` maps the six boards of `design/handoff/mobile/Messages Mobile.html` and `m-msg.jsx` to components, loader fields, hooks and actions, for coach and player. Rendered at 390 × 844 on 2026-09-29, captures `messages-01..22`, beside our preview at 390px, `messages-preview-*`)
- [x] The owner approved it (the file says `Status: approved`). The handoff in `design/handoff/mobile/` is the approval (D-22)
- [x] Every design/data gap is answered as an owner decision in `PROGRESS.md` (`MOBILE.md` step 1). Q-48 to Q-64 were answered by the owner on 2026-09-29, recorded as D-44 to D-49.

## phone
- [x] Built at 390px and 430px, respecting the safe areas (`MessagesPhone.tsx` on the same container, hooks and actions: Inbox, Thread, Details, New message and the announcement screens, per `phone/messages.md` and D-44 to D-49. Captures next to the design's: scratchpad `messages-mobile/built/built-{390,430}-*` against `messages-mobile/messages-00..22`)
- [x] Touch targets are at least 44px, and hover-only affordances have a tap equivalent (a hit-test probe at 390px (every control drawn under 44px must take a tap 21px from its centre) over the Inbox, thread, actions sheet, Details (group, direct and with files), Add sheet, New message (coach and player), announcement form and announcement, each at its top and scrolled to its end: 0 misses on 2026-09-29. The desktop bubble's hover tools are a long press or the "Message actions" button on the phone, CH-7804)
- [x] Sheets are used instead of popovers, and they drag to dismiss (the actions, Add members, Edit, Delete and Leave sheets are `Modal` bottom sheets that follow the finger and close past 80px, CH-1611 in shell.test. At 390px with real touch input on 2026-09-29, the Add members sheet followed a 50px drag, sprang back, and closed on a 160px one: scratchpad `phone-shell/drag-390-modal-*`; `clubhouse:a11y shell messages` exit 0, 29 pages)
- [x] The bottom tab bar and toasts don't overlap content (the Inbox scrolled to its end clears the tab bar, `built-390-02-inbox-scrolled`; pushed screens hide the tab bar and toasts sit above the composer)
- [ ] Checked in the iOS app shell (Capacitor), with native haptics felt on a device (open: the owner, on a device through `npm run ios:dev`)

## motion
<!-- Rewritten for v2 motion (D-64) and v2 haptics (D-70) on 2026-09-29; earlier evidence was against the old timings, so every box starts again. -->
- [ ] Transitions use only the v2 tokens (press 110, quick 180, base 260, release 280, reveal 520ms) and the v2 curves (D-64)
- [ ] Press: every tappable shrinks about 6px and springs back (`useChPress`), and nothing scales twice
- [ ] First paint: sections rise in once (`.ch-reveal`); no count-ups and no other stagger; a refresh never replays it
- [ ] Skeletons wait 150ms, fade in, and share one shimmer sweep
- [ ] Reduced motion and Animations off remove the rise, the press and the shimmer (`useChReducedMotion`)
- [ ] Haptics follow v2 (D-70): selection for tabs, segmented controls, switches and choices; light for primary buttons; success for Post, Save, Send, Share, Assign and Got it; warning for Remove, Delete, Discard and Dismiss; medium only for a sheet settling or a shot logged; error when an import or sync fails; every other tap silent

## accessibility
- [ ] Full keyboard path, with visible focus and no traps; Esc closes overlays (the sheets trap Tab and close on Esc in tests, shell.test CH-1802 and CH-1811; a full keyboard walk at 1280px and 390px isn't done. Open: the next agent slot)
- [x] Landmarks, headings in order, table roles, and labels on icon buttons
- [x] Charts have a text equivalent (aria-label or a view-as-table path) (Messages has no charts)
- [x] Status changes are announced (aria-live) and errors use role=alert
- [x] Text contrast meets WCAG AA on every surface

## performance
- [x] No request waterfall on the server, with independent reads in parallel (`src/clubhouse/data/messages.ts` reads the team, its settings and its players in one `Promise.all`; only the coaches read waits, on the team's organization)
- [ ] Client JS is limited to the interactive islands, and animation code is loaded lazily (Messages is one client island on the realtime hooks; this branch loads `domAnimation` up front, and `agent/clubhouse` loads it lazily since 314b03055. Open: the merge pass, with the build's output)
- [ ] No layout shift after first paint (not measured. Open: the merge pass, with the build)

## verified
- [x] typecheck, lint, `clubhouse:check` and the screen's tests are green, with exit codes recorded in the log (PROGRESS log, 2026-09-29: typecheck 0, eslint 0 errors, `clubhouse:check` 0, `npx vitest run src/clubhouse` 295/295, the files action test 6/6, then `test:file` for messages and the other Modal screens 190/190 after the sheet work. The full suite, the build and the e2e run, `npm run test:e2e -- e2e/messages.spec.ts`, run again at the merge pass)
- [ ] Browser pass on desktop and phone with a real coach account, logged in PROGRESS.md (open: the owner or the merge pass, signed in as a real coach)
- [ ] Owner review of the built screen (open: the owner)
