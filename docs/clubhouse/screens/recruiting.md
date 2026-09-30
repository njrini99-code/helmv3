# Recruiting checklist

Reference: `design/handoff/recruiting/` (the owner's canvas "Clubhouse Recruiting": `Main`, `AddProspect`, `Empty`, `NoMatch`, `LoadFailed` and the `Phone*` boards, approved 2026-09-30, Q-87); spec `docs/clubhouse/phone/recruiting.md`
Route: `/golf/dashboard/recruiting` (coach)   Surface tag: `recruiting` (Sentry `surface=recruiting.<section>`)

## spec
- [x] Desktop reference files and screenshots are named above
- [x] Every figure on the screen is mapped to a table and column, or logged as a gap (`pages/P014-recruiting/DESIGN.md` "Data assumptions": every figure is `golf_recruits` or `golf_recruit_documents`; the pipeline's counts and shares are computed from the list, not stored)
- [x] Every control is mapped to an existing server action: Add, Edit, stage and Delete are `createRecruit`, `updateRecruit` and `deleteRecruit`; documents are `getRecruitDocuments`, `uploadRecruitDocument`, `deleteRecruitDocument` and `getRecruitDocumentUrl`; Email and Call are `mailto:` and `tel:` links. No new action and no migration
- [x] N/A: the Recruiting boards have no README to disagree with; what the boards do not show (the upload dialog, removing a document, the no-team page, an empty stage, the phone's Add form) is listed as questions in `pages/P014-recruiting/DESIGN.md`, and the tracker entry is the lead's

## desktop
- [ ] Matches the reference at 924px and at 1280px or wider (spacing, type, radius, depth)
- [x] Only Clubhouse tokens and classes are used (`.ch-rec-*` and `.ch-recm-*` over `--ch-*`), and `clubhouse:check` is clean
- [x] Numbers are tabular (`.ch-num` on the counts, the class year and the dates), with `—` for no data (an empty pipeline's shares)
- [x] Red appears only on Delete prospect and invalid fields (`.ch-rec-danger`); stages are green, never red
- [ ] Copy is in sentence case, in the head-pro voice, and actions are a verb plus an object
- [x] Controls that point at an unbuilt screen are hidden via `rebuiltHref`: the page links only to Team Settings (`/settings?section=team`, rebuilt)
- [x] A narrow canvas (container below 860px) reflows without horizontal page scroll (checked at 924px: the panel sits under the list)

## wired
- [x] Everything is read server-side in one pass, so final data is on first paint (`getRecruits`; a prospect's documents are read when it opens, with their own skeleton and failure)
- [x] Reads and writes are the current page's own server actions, which scope to the coach's active team with RLS behind them; no service role
- [x] Every read reads its error (`loadRecruiting` flags it and logs `chLogServer('recruiting', 'prospects')`; a failed read is never an empty list)
- [x] Null, zero and no data render differently: a prospect with no contact, notes or documents has three different empty rows, and an empty pipeline shows dashes
- [x] Dates resolve from the server's clock and the UTC calendar until the browser's own zone is known, so there is no hydration mismatch
- [x] Unit tests cover the derivations (`recruiting.test › the rules`, `the loader, the route and the page`)

## states
- [x] Loading: a route skeleton shaped like the page (CH-14401); a prospect's documents (CH-14402); a save, an upload, a removal and a delete each say so (CH-14403 to CH-14406)
- [x] Empty (first run): says what will appear here and the one next step (CH-14301); no team (CH-14306)
- [x] Empty (filtered or no results): distinct from first run, and offers to clear the search or show every stage (CH-14302)
- [x] Partial failure: the list and a prospect's documents have their own notice with Try again; the rest of the page still works (CH-14201, CH-14202)
- [x] Crash containment: the pipeline, the list and the panel are each wrapped in a `SectionBoundary` (CH-14203)
- [ ] Route error: the Clubhouse error view (it inherits the `logError`, chunk and stale-action recovery)
- [ ] Not found and no access: plain words and a way back
- [x] Offline or slow network: a write says so instead of spinning (CH-1903, CH-1902); Try again says so offline (CH-1905)
- [x] User errors: every mutation goes through `useAction`, with a specific failure message, Retry, an error haptic and a Sentry event (CH-14001 to CH-14007)
- [x] Forms: inline field messages, focus moves to the first invalid field, and double submit is prevented (CH-14101 to CH-14106)
- [x] Destructive actions: a confirm step (CH-14501, CH-14502)
- [x] Optimistic updates roll back on failure and tell the coach (a stage, CH-14003)

## error-tracking
- [x] Server read failures are logged with `chLogServer('recruiting', 'prospects')`
- [x] Client crashes are reported with `chReport`, tagged `ui=clubhouse` and `surface=recruiting.<section>` (`recruiting.pipeline`, `.list`, `.panel`)
- [x] Key intents leave a `chTrail` breadcrumb (`recruiting open`, `add`, `edit`, `stage`, `upload`, and every action by name through `useAction`)
- [x] No `catch` swallows an error without reporting or handling it on screen (a thrown write is reported by `useAction` and shown; a thrown stage change is undone first)
- [ ] Handled failures are low severity and crashes are high, so alerts stay meaningful
- [ ] Every failure path was forced once locally and seen in the console or Sentry

## phone-spec
- [x] `docs/clubhouse/phone/recruiting.md` names the owner's mobile boards (`design/handoff/recruiting/Phone*.dc.html`) and maps each screen to components
- [x] It says `Status: approved`

## phone
- [x] Built at 390px and 430px, respecting the safe areas (both widths scanned; the shell's top bar and sheets own the safe areas)
- [x] Touch targets are at least 44px, and hover-only affordances have a tap equivalent (`native.mjs recruiting` at 390 and 430: clean, after two shared hit-area rules in `controls.css`)
- [x] Sheets are used instead of popovers, and they drag to dismiss (the edit sheet, the stage picker, the action sheet, the upload dialog)
- [ ] The bottom tab bar and toasts don't overlap content
- [ ] Checked on a real iPhone through `npm run ios:dev` (docs/clubhouse/MOBILE.md): keyboard, swipe-back with a sheet open, haptics felt

## motion
- [x] Transitions use only the v2 tokens (press 110, quick 180, base 260, release 280, reveal 520ms) and the v2 curves (D-64)
- [ ] Press: every tappable shrinks about 6px and springs back (`useChPress`), and nothing scales twice
- [ ] First paint: sections rise in once (`.ch-reveal`); no count-ups and no other stagger; a refresh never replays it
- [ ] Skeletons wait 150ms, fade in, and share one shimmer sweep
- [ ] Reduced motion and Animations off remove the rise, the press and the shimmer (`useChReducedMotion`)
- [ ] Haptics follow v2 (D-70): selection for tabs, segmented controls, switches and choices; light for primary buttons; success for saves; warning before Delete and Remove; medium only for a sheet settling; error when a write fails; every other tap silent

## accessibility
- [ ] Full keyboard path, with visible focus and no traps; Esc closes overlays
- [x] Landmarks, headings in order, table roles, and labels on icon buttons (CH-14801, CH-14802)
- [x] N/A: no charts
- [x] Status changes are announced (aria-live) and errors use role=alert (CH-14803, CH-14804)
- [x] Text contrast meets WCAG AA on every surface (`a11y.mjs recruiting` at 1280, 390 and 430: 40 scans, no violations)

## performance
- [x] No request waterfall on the server: one read before first paint
- [ ] Client JS is limited to the interactive islands, and animation code is loaded lazily
- [ ] No layout shift after first paint

## verified
- [ ] typecheck, lint, `clubhouse:check` and the screen's tests are green, with exit codes recorded in the log
- [ ] Browser pass on desktop and phone with a real coach account, logged in PROGRESS.md
- [ ] Owner review of the built screen
