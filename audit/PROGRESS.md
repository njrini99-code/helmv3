# PROGRESS — GolfHelm Messages write phase

Running checklist. **Read this first on every wake-up.** Session `helmv3-3f`, started
2026-09-07. Branch `agent/mobile-messages-audit`, worktree
`~/worktrees/helmv3/mobile-messages-audit`.

Decisions are frozen in `DECISIONS.md`. Findings are in `M00-MANIFEST.md`.
§A1 and §A2 are closed (`A1-RESOLUTION.md`, `A2-RESOLUTION.md`).

## Loop contract
1. Read this file. 2. Do the next unchecked item. 3. Gates. 4. Commit with **explicit paths**
(never `git add -A`). 5. Tick the box here. 6. If a PR is open, `gh pr checks` and fix red.

**Gates that must pass before a push:** `npm run typecheck`, `npm run lint`, `npm run test`.
Add `npm run build` whenever a `'use server'` surface changed (CLAUDE.md requires it).
The pre-push hook additionally runs `gates:review` on changed files. A new file under
`supabase/migrations/` pulls `migration-lockdown.yml` into the required checks.

Never deploy. Never merge. Never apply a migration — writing the file is in scope, applying
it is the owner's, through `db-apply`.

---

## Ordering constraints that are not obvious
- **W3 (G-46 `AttachmentPreview.tsx`) must land before W5 (composer).** It renders inside
  every composer attachment state, so the composer cannot meet the Fairway constraint until
  it is migrated. Doing W5 first means doing it twice. (`HANDOFF.md` §5.3.)
- **G-58's migration is written here and applied by the owner.** Do not apply it.
- **W8 needs the app actually running** (Docker + local stack on 54321/54322).

---

## W1 — Data and correctness. No schema change, highest user impact
- [x] **G-08** failed attachment insert reports SUCCESS to the sender
      (`message-attachments.ts:157`). Open issue #1825 is this symptom.
- [x] **G-19** failed sends erase the message instead of retaining it [cross-lane confirmed]
- [x] **G-21** attachment send fails OPEN
- [x] **G-13** a slow fetch for an abandoned conversation overwrites the open one
- [x] **G-15** fabricated `id: ''` rows in the inbox view model. Fixed by NARROWING the
      type (`GolfConversationLastMessage`) so the compiler proves no consumer read the
      fabrication. Its second half — the RPC's 14th column — is answered in
      `M01-TEAM-FLAGS.md`: `is_team_chat` and `is_team_channel` are two flags, not two
      spellings, so the manifest's "dropped in favour of" is wrong. No sort change
      (inbox ordering is the client's; sectioning is G-01's). New finding **G-59** [low]
      recorded there: the admin activity feed reads the other flag.
- [x] **G-18** duplicate-key short-circuit does not verify equivalence. Verifies id +
      conversation + sender + content before claiming success; invisible row or failed
      lookup fails closed. Safe only because G-19 landed first — the caller now retains
      the message and offers Retry.
- [x] **G-23** no IME composition guard on Enter-to-send. Guards on three signals
      (`nativeEvent.isComposing`, legacy `keyCode === 229`, and a
      compositionstart/end ref cleared on a macrotask for WebKit's
      compositionend-before-keydown order). 8 tests, 5 verified failing pre-fix.
- [x] **G-40** group unread is shared, not per-viewer. Uses the existing
      `participants.last_read_at` — no new column (see `A1-RESOLUTION.md` §3).
      Fixed client-side: the per-viewer computation that already existed on the
      supplemental team-chat path now runs over every group conversation the RPC
      returns. DMs deliberately untouched (with two people the shared boolean IS
      per-viewer, and DM read receipts are built on it). The RPC's own
      shared-boolean count still needs a migration to fix at the source — noted,
      NOT applied.

## W2 — Migration written, NOT applied
- [x] **G-58** forward migration adding `muted_until` + `notification_level`
      `IF NOT EXISTS` with production's exact default and CHECK, so production is a no-op and
      every rebuilt-from-migrations environment converges. Leave for `db-apply`.
      `supabase/migrations/20260907120000_golf_participants_mute_columns.sql` — WRITTEN, NOT
      APPLIED to production. Shapes read from the production catalog, not the mirror. Verified
      against the local stack: before = `id, conversation_id, user_id, joined_at, last_read_at`
      (G-58's own evidence), after = production's exact shape, second apply a no-op. Adds no
      index, because production has none and one would stop this being a no-op. The
      `COMMENT ON` is guarded on absence — production's existing comment is the only written
      record of the mute semantics anywhere, and an unguarded one would overwrite it.
      Now ENFORCED: both columns added to `GOLF_EXPECTED_COLUMNS` in
      `scripts/db/check-supabase-drift.mjs`, which `ci.yml` runs against the migrations
      rebuild — the schemas→migrations direction nothing was checking.

## W3 — Design-system prerequisites (blocks W5)
- [x] **G-46** migrate `AttachmentPreview.tsx` off legacy classes onto Fairway.
      `warm-*`, `cream-*`, `red-*`, `primary-*` and `purple-*` all gone, plus the raw-Tailwind
      radii the Fairway path forbids. Three mappings were judgement, not substitution: the
      purple audio tile now matches the document tile beside it (no purple exists in the
      scale, and the icon already differentiates); the red/blue/green PDF-DOC-XLS labels are
      all `text-text-secondary` (no blue token, `red-*` banned, and the word is the signal);
      the video scrim keeps `bg-black/20` deliberately. The remove control stays on
      `@/components/ui/button` — `MessageComposer.tsx`, the Fairway file that renders this
      one, imports its `Button` from the same module, so that IS the local idiom.
      §19.3 lease: this file was under no lease row. Single-agent execution collapses the
      question — no concurrent worker to conflict with — so the row was not added rather than
      inventing lease bookkeeping for a lane of one. 10 tests, 8 failing pre-fix.
      New finding **G-60** [med] below.
- [x] **G-48** bubble radii use `fw-lg` (28px); the artboard's dominant 20px is byte-identical
      to `--fw-radius-card`. Only 6px and 12px genuinely lack tokens.
      `rounded-fw-lg` → `rounded-card` at all five sites in `MessageThreadPane.tsx` — the three
      bubble corner cases plus the typing indicator (which copies the incoming-bubble shorthand)
      and the edit box (which replaces a bubble in place); leaving either behind would have made
      the swap read as an inconsistency rather than a correction. The 6px tail and 12px grouped
      inner corners stay untouched: both fall below `--fw-radius-sm` (10px), so the fw ramp has
      no step, and §19.3 sends exactly those to A03 rather than letting messaging fork a shared
      primitive. Correction to the manifest: the class is `rounded-card`, not `rounded-fw-card`
      — the latter is defined nowhere in `tailwind.config.ts`. 6 tests, 3 failing pre-fix; the
      other 3 measure the artboard against the token file, so they fail if either side moves.
- [x] **G-32** bind artboard values to the existing unused tokens; six unmapped values go to
      A03 as variant requests, never hardcoded. `audit/A03-VARIANT-REQUESTS.md` is the
      deliverable, every value measured from `reference/*.dc.html` against `design-tokens.css`
      rather than read off a lane summary. Applied: the unread row's lift
      (`[box-shadow:var(--fw-shadow-card)]`, byte-identical to the artboard's own
      "cream card lifting off the champagne" row) and `bg-canvas-gradient` layered over
      `bg-canvas` at 4 page-shell sites (M03A F11). Verified already-correct and left alone:
      the row and search-well radii. **Two corrections.** The unmapped set is FIVE, not six —
      `.send-on` and the pinned-rail pill carry the identical 165deg declaration, so two lanes
      reported one value twice; and the composer's progress bar, thought unmapped, is
      accent-600 → accent-500 exactly. **One trap recorded:** `shadow-card` is NOT
      `--fw-shadow-card` — it resolves to a legacy cool-grey value, and no utility bridges the
      Fairway token at all. 5 tests, 3 failing pre-fix.

## W4 — Thread
- [x] **G-26** the headline defect: metadata is a sibling flex item of the message column
      (`MessageThreadPane.tsx:1046-1270`), so any message with a timestamp sits left of its
      group-mates. jsdom cannot see this — verify in W8
- [x] **G-50a** day chip → floating glass chip (`DECISIONS.md`) — static, not sticky; four unused `--fw-glass-*`/`--fw-shadow-pop` tokens matched the artboard exactly; 11 tests, 6 failing pre-fix
- [x] **G-50b** bubble max-width → 288px base, group-incoming derived from the avatar gutter — the rule, not the specimens; 268 written nowhere; the decision’s stated 288−gutter=268 arithmetic does not reproduce from the measured 40px gutter (see the ledger); 7 tests, 3 failing pre-fix
- **G-29** is four sub-items on one line; split, one commit each (M03B F7/F8/F9 + the pagination note):
  - [x] **G-29a** thread typography — `text-body-sm` (13px) → `text-body` (15px), the `.bub` CLASS RULE stated in both `Bubbles.dc.html:17` and `Thread.dc.html:16`. **Correction:** M03B's F7 asked for 17px `body-lg`, sourced from §8.3's prose ("approximately 17px"), not from an artboard — the rule beats the prose, same call as G-50b. The inline edit field moves with it. The 22px line-height has no token and is now A03 request #6, so the token's 24px ships. 6 tests, 4 failing pre-fix
  - [x] **G-29b** photo layout — the image IS the bubble, caption below. Specimen is `Bubbles.dc.html:73-83` (NOT `Thread.dc.html`, which has no photo message): `max-width: 250px`, `padding: 5px 5px 10px 5px`, image `height: 150px` at `border-radius: 1rem 1rem 0.5rem 0.25rem`, caption below at `padding: 8px 11px 0 11px` and `14px/20px`. Shipped: caption moved after the attachments, generic card padding swapped for a frame on a photo message, and all three dead width caps (image 260px, file chip 260px, specimen 250px) removed in favour of the column's 288px rule. The asymmetric image radius is A03 request #7; the caption's 14px is an open A03 question (distinct type role, or a hand-tune?). 9 tests, 6 failing pre-fix
  - [x] **G-29c** group header — overlapping member stack + literal member count. `Group.dc.html:27-34`: three 34px circles, `2px` border in the header's own background, `margin-left: -12px`, a literal `+7` overflow badge, then a real "9 members" subtitle. `groupParticipants` and `participant_count` are already threaded into the component and unused in the header. Shipped: `AvatarGroup size="sm" max={2} ring="ring-surface"` over the participants map, the generic `Users` glyph kept as the async fallback, and the subtitle now prints the literal count. `AvatarGroup` gained an optional `ring` prop (default `ring-canvas`, every caller unchanged) because its hardcoded rim was the page-canvas token on a surface-backed header. 34px→32px and -12px→-8px absorbed and recorded in A03. 11 tests, 8 failing pre-fix
  - [x] **day separators** — closed by G-50a. M03B's F8 IS that finding; nothing further is owed here
  - [ ] **pagination past the newest-200 fetch** — OUT OF LEASE for this file. The `.limit(200)` with no cursor lives in `use-golf-messages.ts`; M03B:56 says so explicitly and it agrees with G-17. Deferred to **G-17**, not dropped
- [x] **G-49** absolute measure cap and the depth system
  - [x] **G-49a** the 288px cap binds at every width — `sm:max-w-[70%]` removed. F13 supplied the desktop authority G-50b's own comment said was missing: the plan annotates 288px as a **maximum text measure** "constrained by available row width" (`audit/M03B-thread.md:94`), and `sm:` is 640px, so on the `max-w-[720px]` pane the percentage (504px) was the only rule in effect. The G-50b suite's assertion that the override was present is re-anchored, not deleted — it now asserts its absence and cites why. 6 tests, 2 failing pre-fix
  - [x] **G-49b** the depth system — both bubble sides are lit. `.lit` (`Bubbles.dc.html:18`) is byte-identical to `--fw-shadow-card`, so incoming was a free token application, the same win G-32 found on the rail's unread rows; the manifest calls F14 and G-03 "one systemic issue across two lanes, not two", and the canvas half already shipped in G-32's page wash. `.lit-accent` is a HUED ambient no fw token expresses — A03 request #8, with `shadow-soft` shipping as the interim because `--fw-shadow-card`'s 0.55 white inset would paint a specular rim on a dark green fill. 11 tests, 3 failing pre-fix

## W5 — Composer (only after W3)
- [x] **G-20** two of six composer states do not exist — G-20a + G-20b landed; G-20c (replying) deferred with its four pieces named below
  - [x] **G-20a** the "Didn't send" state — and a CORRECTION: it was half-shipped already. The two send paths differ. `onSend` reaches `sendMessage`, which pushes an optimistic row before anything can throw, so every text failure is already a muted bubble with its own Retry (G-19) — the artboard's sixth state, in the better place §9.2 asks for. `onSendWithAttachments` reaches `useMessageAttachments`, which creates NO optimistic row: a toast and nothing else. The banner is for that path only. Also closes a defect G-19 left behind — the composer kept the draft on a failed text send, so the same sentence sat on screen twice offering two different retries. 7 tests, 5 failing pre-fix
  - [x] **G-20b** the §9.5 outcome taxonomy. The discriminator needed no new plumbing: a transport error means `fetch` itself threw, so no response was read and the commit state is genuinely unknown; anything else means the server answered. The failed row now reads "Not confirmed" instead of "Not sent", and the toast says so too — both through the same helper, so they cannot disagree. Two outcomes only: §9.5 names eight, M03C's F3 documents this one collapse, and the other six are not invented. 12 tests, 7 failing pre-fix
- [x] **G-09** upload progress is fabricated [cross-lane + artboard confirmed] — G-09a (wiring) + G-09b (real transport) landed, and G-61 fell out of the trace
  - [x] **G-09a** the wiring, and a CORRECTION to the finding. The 10/90/100 constants `M00-MANIFEST.md:504` reads as a §1.1 "no false progress" violation reached no pixel: `useMessageAttachments` has always accepted an `onProgress` and threaded it into `uploadAttachment`, `AttachmentPreview.tsx:170,189` has always rendered the percentage and the bar — but `FairwayMessages` passed no callback and the composer never wrote `uploadProgress` after staging. Nothing false was on screen because nothing was on screen. The bar now moves in real time, monotonically and clamped, and returns to staged on a failed send. 10 tests, 9 failing pre-fix
  - [x] **G-61** [med, NEW] the `contentType` upload option is inert — found while tracing G-09's transport. `uploadOrUpdate` (`@supabase/storage-js/dist/index.mjs:615-641`) routes a Blob body into a `FormData` and never reads `options.contentType`; only its raw-body branch sets the header from it. A `File` is a Blob and `convertHeicToJpeg` returns non-HEIC files untouched, so the Storage API saw the file's own `type` — blank on an iOS camera capture. The bytes now carry the resolved type. Written as LATENT: the SDK source proves the option is dropped, not that production rejects those uploads, and Sentry is quiet over 90d. 8 tests, 2 failing pre-fix
  - [x] **G-09b** the real byte signal — a `createSignedUploadUrl` + `XMLHttpRequest` PUT replaces the hardcoded 10/90/100, with `supabase.storage.upload()` as the fallback. `xhr.upload.onprogress` is the only upload-progress signal a browser gives without a streaming body, and the same object `abort()` makes cancellable (G-24), so no dependency was added. Headers copied from the SDK's own raw-body branch rather than invented. The fallback is NARROW on purpose: signing failure, transport failure and 5xx fall back; a 4xx is an answer and is returned. A non-computable length reports nothing, and 100 waits for the response. 15 tests, 12 failing pre-fix
- [x] **G-24** no cancel path for an in-flight upload — and the control already existed, which made it worse than missing. `AttachmentPreview`'s X renders in every state, so mid-upload it took the tile off screen while the bytes kept going: the file finished uploading and the send carried it anyway, because the handler holds its own captured array. An `AbortSignal` now runs the length of the send — `xhr.abort()` in the transport, `cancelled` (not failed) through the hook, no toast/log/banner, orphan cleanup for whatever finished first, and the label says "Cancel upload of <file>" while it is one. G-09b supplied the mechanism: the XHR chosen for `upload.onprogress` is the same object with an `abort()`, exactly as the manifest predicted. The `.upload()` fallback stays uncancellable, stated rather than hidden. 15 tests, 12 failing pre-fix
- [x] **G-22** five-line growth is a hardcoded 120px — and it was not five. At the composer's 24px line-height, 120px is five lines of CONTENT and `py-2` spends 16px of it: ~4.3 visible lines at the default size, shrinking further with every step of browser zoom / OS text size / Dynamic Type, which is the case §9.4 protects. The cap is now `line-height × 5` plus the padding and border `border-box` puts inside `height`, read from the element's resolved style, written to `style.maxHeight` so no CSS cap can override it, and re-measured on `resize` (text size changes without a keystroke). Guards a NaN from `line-height: normal` and adds padding only under `border-box`. `minHeight: 40px` deliberately untouched — resting height is G-47's. 10 tests, 7 failing pre-fix
- [x] **G-47** composer geometry from the artboard's numbers — five deltas, one commit. The DOCK is a free token application, the third this audit has found (after G-32 and G-49b): `.slab`'s background, blur, saturation, radius and both drop-shadow layers are byte-identical to `--fw-glass-bg` / `--fw-blur-glass` / `--fw-glass-saturate` / `--fw-radius-lg` / `--fw-shadow-pop`, with only the inset specular 2 channel units + 0.05 alpha off (absorbed). NOT `.fw-glass-regular` — same material, but declared local to the overlay family and one depth step heavier (`raise`, not `pop`). Send is a full circle at 40px with the 44px hit area as an `after:` overlay, un-inverting §9.1's own split. Track centres at rest and bottom-aligns once MEASURED as grown. Placeholder names the recipient from the same source the header reads. Track/send gradient fills are out of scope and said so. 18 tests, 11 failing pre-fix
- [x] **G-45 / D-05** focus ring — glow geometry, token color (`DECISIONS.md`). The artboard's `.track-on` glow is accent-500 to the byte, and `focus-within:border-accent-500` was literally one of the 175 call sites `design-tokens.css:150-165` moved to accent-600 because they drew "a ring nobody with low vision could reliably find" (~2.67:1 vs WCAG's 3:1). Theme-dependent too — dark keeps accent-500 on purpose — so no literal is right in both. Now `border-border-focus/30` (the 1px layer is the EXISTING border: same weight, no focus-time layout shift) plus one new `0 0 0 4px` at 10%, written with the `color-mix(in oklab, …)` the Tailwind bridge itself emits. 10 tests, 5 failing pre-fix; four of the passing five assert the CONFLICT (artboard vs tokens vs the frozen decision) so the premise is re-checked if any source moves

## W6 — Overlays and actions
- [x] **G-55** action order — and the finding's own premise is wrong. M00 called it "three sources, three orders"; there are TWO. `Reactions.dc.html` and §12.4's prose agree exactly (Reply, Copy, Edit, — Delete) and only `Actions.dc.html` differs, by leading with Copy — same set, same tail, one swap. `DECISIONS.md:31` already records the correction. What follows is that Copy→Edit→Delete was ALREADY the shipped relative order, so the implementable delta is the part that carries the meaning: the **separator**, absent from both the mobile long-press row and the desktop hover row. Fourth free token application of this audit (after G-32, G-49b, G-47) — `Actions.dc.html:52`'s `oklch(0.862 0.013 82 / 0.95)` is `--fw-color-border-subtle` to the byte. The two artboards disagree on the rule's colour (`Reactions.dc.html:88` uses the glass bottom edge); the one matching a token wins under AGENTS.md's authority order, so no preference was invented. Turned vertical because this row is horizontal — the artboards' labelled vertical list is G-56's shape, not this finding's. **Reply is absent by deferral, not disagreement** (G-20c). **Known limit, recorded not hidden:** Close still trails Delete, inheriting the past-the-separator position without being destructive; it is a sheet dismissal with no slot in either artboard and G-56 settles it — so the suite filters Close out rather than pinning its index, which would make a correct G-56 fix arrive as a failure. 12 tests, 4 failing pre-fix
- [x] **G-42** incoming messages have no action surface — two halves, both from `M03D-overlays.md`. **F7 (`:83`):** the long-press spread was `isOwn ? … : {}` and the whole controls block was `isOwn && …`. §12.4 asks incoming messages to omit **Edit and Delete**; omitting the entire menu is a stronger claim than the plan makes, and its effect was that the one thing in a thread you could not copy was the message somebody else sent you. The gate moved: only the hover row is `isOwn` now (Edit/Delete are the own-only pair, and the G-55 separator goes with them — with nothing destructive in the row there is nothing to fence). **F8 (`:89`):** desktop had no path at all. `onContextMenu` was an unconditional `preventDefault()` while the tap row was `lg:hidden`, so right-click suppressed the native menu and opened nothing; and the hover row's `opacity-0` had no focus variant, so Tab reached buttons that stayed invisible — §15.3's definition of the defect, not a fix for it. Now the context menu SUBSTITUTES (opens the same row, idempotent with the hold timer, still suppressing the iOS callout the original comment was right about), `lg:hidden` is gone, and `focus-within:opacity-100` shows the row to whoever focused it. **Four things the first pass got wrong, found by re-reading and by researching the gesture rather than by a gate.** (1) `:1443` carried `isOwn && 'select-none [-webkit-touch-callout:none]'` — the gesture went unconditional and its SUPPRESSION did not, so on iOS a long press on an incoming message would have raced our row against the native callout, on exactly the messages the finding is about. (2) The comment on `onContextMenu` claimed it suppressed that callout; iOS Safari has not fired `contextmenu` on a long press since iOS 13 (react/react#21812), so it never reached it — what `preventDefault` genuinely protects is Android Chrome, which does, plus the desktop right-click. The CSS pair above is the iOS mechanism, which is how (1) was found. (3) NOTHING dismisses the row but its Close button (`FairwayMessages.tsx:134` holds the id; nothing else clears it) — tolerable while it was touch-only, a trap once right-click opens it on desktop, so Escape closes it now. The scrim and outside-click are deliberately left to **G-56**, which owns the dismissal model. (4) The move cancel was ZERO-TOLERANCE — any `pointermove` killed the timer — and a finger resting on glass never emits zero of them, so a real 450ms hold is a stream of sub-pixel jitter that killed it every time. Pre-existing, but G-42 is what makes it matter: on an incoming message the hold is now the ONLY action surface a touch device has, and a menu that opens only if you hold perfectly still is not one. Now a 10px touch slop measured as a RADIUS. The authority is UIKit, not the web: this ships as a Capacitor app (`@capacitor/ios`), so the surface is a WKWebView on a phone where every other long press is a `UILongPressGestureRecognizer`, and `allowableMovement` is the property the 10 mirrors — written as the convention it is rather than a quoted constant, because developer.apple.com renders client-side and returned an empty page. Corroborated from the other side by Android's ~8dp scaled touch slop and the 6–10px web band (it ships to `@capacitor/android` too). 10 is also the forgiving end of that band, which is right because the gesture this must lose to is a scroll, and a scroll clears 10px immediately. `LONG_PRESS_MS` 450 → **500**, UIKit's `minimumPressDuration`. The finding RECORDED the 50ms delta rather than retuning it — the right default for a design value it does not own — and the **owner overrode that default explicitly, for the App Store submission**. Pinned by the tick BEFORE the deadline staying silent, since advancing to 500 alone would also have passed at 450; verified red against 450. Duration and slop are the two halves of one recognizer and both now name UIKit's. Note for release planning: `capacitor.config.ts` points the WKWebView at a REMOTE url (`https://www.helmsportslabs.com/golf/dashboard`), so the binary is a shell and this reaches users on a web deploy, not on a submission. 15 new tests, 10 failing pre-fix (11 across both suites) — plus one assertion added to the G-55 suite (9 failing across both), because "incoming draws no separator" was passing for two stacked reasons and is now pinned by what the row DOES hold. `e2e/messages.spec.ts` is in this file's `requiredChecks` and was read: it exercises list/send/search/realtime/unread and touches no action row, long press or context menu, so removing `lg:hidden` cannot flip a locator there. `Escape` appears nowhere else on the messages surface as a key binding, so one press still does one thing. The movement-cancels-the-hold property is pinned explicitly because attaching long-press to EVERY message doubles how often a scroll starts on a listening element, and the Escape listener is asserted to be absent while no row is open so it cannot swallow the key from the edit field
- [x] **G-56 / M03D F17** the action surface is a labelled bottom sheet. G-56 itself is a RECORD of a self-correction — M03D first read the overlays as scrim-tap-to-dismiss, then found neither artboard contains a dim overlay div at all — and the manifest keeps it because the original "would have driven a wrong build". F17 is the buildable half, severity **high** and carrying no G-number of its own: both artboards draw a vertical list of full-width labelled rows and the code drew an icon-only horizontal strip with an X, which is a different interaction pattern, not a styling delta — a bare glyph can be recognised, not read. **What the artboard evidence does and does not settle:** an artboard is a picture, so "no overlay div" is strong evidence about the COMPOSITION and weak evidence about the INTERACTION, because a static mock draws a scrim and a dimmed sibling identically. The composition comes from the artboard; the dismissal comes from the shared `Sheet`, which AGENTS.md's authority order puts above prose — scrim included. **Fifth free token application, and the closest yet:** `Sheet`'s bottom variant is `rounded-t-fw-lg` + `border-t border-border-subtle`, and the artboard's panel is `border-radius: 1.75rem 1.75rem 0 0` + `border-top: 1px solid oklch(0.862 0.013 82 / 0.95)` — byte-identical, both; the row radius is `--fw-radius-md`, whose own comment reads "list rows"; the grip is the 2px near-match M03D measured and is the primitive's to change. **A SEVENTH free token application the first pass missed and a test caught:** the artboard's 16px/500 label was written off as unmapped and filed as an A03 request, because the Fairway ramp brackets it (`body` 15, `body-lg` 17). `tailwind.config.ts` also carries an **iOS TYPE SCALE — Apple HIG (San Francisco)** whose `callout` is exactly 16px, under a comment naming mobile/native surfaces as its use. The artboard is drawing an iOS action sheet and this ships as a Capacitor WKWebView, so that is the token — and `text-callout` had **zero uses in the repo**. Nothing is owed to A03. The X close row is gone (no artboard counterpart; grip/scrim/Escape dismiss), the G-55 rule is horizontal now so BOTH of the artboard's `margin: 6px 12px` numbers are pinned rather than one, and Delete keeps IconButton's ink-on-transparent danger rather than drifting to Button's tinted chip, which on a full-width row is a red band no artboard draws. **Desktop is capped, not designed.** `SIDE_CLASS.bottom` is `inset-x-0`, so the sheet would have been a full-width band across a 1440px monitor — a phone control stretched. `sm:max-w-sm sm:mx-auto` caps the measure; the leading edge keeps the variant's `rounded-t-fw-lg` (rounding all four would be wrong for a bottom-anchored panel AND would trip G-48's guard). A pointer-anchored context menu is the idiomatic desktop control and was NOT built: every artboard here is a 390×844 phone scene and supplies no desktop authority — the same gap G-50b recorded on bubble width, which G-49/F13 later resolved from the plan's own words. There is no equivalent sentence for this one, so nothing was invented. **Two style asterisks, stated rather than glossed:** `text-callout` belongs to the iOS HIG scale, which `design-system.md` never names — token-backed and endorsed by its own config comment for mobile/native surfaces, but not a Fairway ramp role; and `h-[52px]` is arbitrary because the spacing scale is enumerated and stops at 12/16 with no 13, following this file's own `max-w-[288px]` idiom. A raw `<button>` was caught by `helm/no-raw-button` and is now the `Button` primitive with the geometry merged over the variant. 18 tests, 6 failing pre-fix; the G-55 and G-42 suites are RE-ANCHORED onto the sheet, not weakened — each keeps the property it owns, and G-55's rule assertion got STRONGER (both artboard margins, not one)

## W7 — Group details
- [x] **G-33 / D-03a / G-30 / G-57** — one change, four findings, because they were one
      gap: a surface with no entry point, no data source and no component. Built as
      `GroupDetailsSheet.tsx` (new — `ConversationDetailsSheet.tsx` is cited all through
      the audit corpus and exists nowhere under `src/`; it lived on unmerged branches,
      so nothing was ported) plus a trailing info control in the thread header.
      **G-57 was already 2/3 shipped and this is recorded, not re-claimed:** G-29c put
      the member stack and the live "N members" subtitle in that header, so the only
      remaining delta was the trailing control — which is G-30. Building it closes both.
      **G-33's two halves are different problems.** The *inbox-list* arrays
      (`use-golf-messages.ts`, `participant_ids: []`) fed the rail; the *details sheet*
      needed member rows. Both are fixed, and the ids cost nothing: the participant
      query that produced the count already ran, and asked for `conversation_id` alone —
      it now asks for `user_id` too, and the count is derived from the same rows, so the
      header's "N members" and the sheet's list cannot disagree. That query is now
      **paginated and stably ordered**, because as a count the PostgREST 1000-row cap
      degraded quietly and as the source of *who is in the group* it would silently drop
      members. The transform also stopped dropping `creator_id` and `participant_ids` —
      both were on the row one step upstream and neither reached the UI on **either**
      origin path. **Correction to G-34, verified against the function definition:** it
      reads as though the RPC branch never populates `creator_id`; the baseline
      migration's `get_golf_conversations_with_details` selects `c.created_by AS
      creator_id` (`20260527000000_prod_public_baseline.sql:2820`), so RPC-origin rows
      always carried it. The transform was the only thing losing it. **D-03a shipped
      exactly as frozen**: subtitle is `golf_coaches.title` for a coach and
      `Class of {golf_players.graduation_year}` for a player — two columns added to a
      join that already ran — with **no subtitle at all** when either is missing rather
      than the DM path's `'Golf Coach'` / `'Golf Player'` placeholder, which is why the
      rows do NOT reuse `GolfConversationParticipant` (its `subtitle` is required).
      Admin pill reads `created_by` and nothing else; **no presence dot** (D-01a/G-51 —
      production `users` RLS cannot resolve a teammate's state, so it would imply a fact
      nobody can check). **Absent by deferral, not disagreement:** the artboard's
      Mute / Search / Files tiles, the "Add" link, shared files and "Leave group" —
      Mute is G-02 and waits on G-58's migration being *applied*, and the other four have
      no capability anywhere in the messages tree; a control that does nothing scores as
      coverage and reads as a bug. Pinned by tests so a later pass adding one has to mean
      it. **Ninth free token application, and three of them come from the iOS ramp on a
      measurement, not a preference:** the artboard's `.sub` is 12px at weight 400 —
      `caption-1` exactly, where the canonical `caption` is the same 12px but forces
      500; `.nm` is 15px/21px, where `subhead`'s 1.35 leads to 20.25 and canonical
      `body` to a flat 24; the title is 20px/600, which is `title-3` on both. `.hd` and
      the row radius are the canonical `eyebrow` and `--fw-radius-md` ("list rows") byte
      for byte. **Desktop is capped, not designed** — `sm:max-w-sm sm:mx-auto`, the same
      disposition as G-56, because every artboard here is a 390×844 phone scene.
      **Two orderings that are choices, stated rather than hidden:** the artboard's
      first row is the viewer *who is also the creator*, so it does not discriminate —
      viewer-first is chosen because it holds for every member of every group, where
      creator-first would reorder the list under you per group; and the "created by"
      clause drops **whole** when the creator cannot be named, rather than printing a
      placeholder. 45 tests, 12 failing pre-fix.

## W7b — Group membership: add, remove, leave (owner request, outside the original manifest)
- [x] **Add member and Remove member wired in, and the honest half is stated.** Asked
      for directly by the owner mid-run ("Add member and delete member need wired in.
      Don't worry about search"), so it is not a numbered finding. It is also **not a
      wiring task**, which the first thing this wave did was establish against live
      production `pg_policies`: `golf_participants_delete` is
      `USING (user_id = auth.uid())` — self only, so a creator **cannot** remove anyone —
      and `golf_participants_insert_v2`'s creator branch carries
      `AND NOT golf_conversation_has_other_participant(conversation_id)`, so adding to an
      **existing** group is refused. That clause is
      `20260819070000_conversation_creator_cannot_inject_third_party.sql`, whose header
      records it as a control added after a **verified production attack**. Both halves of
      the request therefore need a policy change, which is the owner's to apply.
      **This is not a reversal of that hardening**, and the migration says why in its own
      terms: the branch removed on 2026-08-19 authorized an insert on the sole basis that
      the actor created the conversation — no bound on which conversation, none on who was
      being added, and reachable against a private DM. The new branch is bounded on three
      axes at once: the conversation must be a genuine team chat
      (`is_team_chat AND team_id IS NOT NULL`, so a DM is unreachable), the actor must be
      its creator, and **for INSERT the person being added must already be on the owning
      team** — so it grants no ability to introduce an outsider to anything, only to
      include a teammate in a channel their team already owns. The DELETE branch excludes
      the creator's own row, so "remove" can never orphan a group of its only Admin.
      **The history exposure is named, not buried:** `golf_participants_select_v2` gives a
      participant the conversation's full prior history, so adding a member hands them the
      backlog. Almost certainly right for a team channel, and the owner's call to make
      knowingly. **Creator-only, not any coach** — matching the Admin pill, which is the
      only thing "admin" can mean on a table with no role column.
- [x] **Tested against a real Postgres, both directions** — the thing
      `20260819070000` could not do ("Docker was unavailable, so the clean-room
      local-stack replay could not be exercised"). Docker was available this time.
      `supabase/tests/rls/golf_group_membership_management.sql`, 14 pgTAP assertions,
      run against the local stack with the migration applied: all 14 pass. Re-run with
      both policies reverted to their pre-migration shape inside the same transaction:
      exactly 3 fail — the delete policy's creator branch, the add (42501) and the remove
      (0 rows) — while the 2026-08-19 refusals (DM injection, non-creator add) and the
      two-statement creation order still pass. So the suite discriminates, and the
      widening demonstrably did not disturb what the earlier hardening closed.
- [x] **Two defects found on review, both fixed, and one of them corrected a claim
      rather than only the code.** (a) The DELETE branch's safety argument cited
      20260819070000's "creator is always a participant" finding — evidence this very
      PR staled by shipping Leave group. Re-asked against a real Postgres instead of
      re-cited: a creator who is not a participant sees the conversation but zero
      participant rows (`golf_participants_select_v2` has no coach branch), so the
      DELETE was already a no-op. The branch now states the bound itself via
      `user_conversation_ids` — deliberately redundant, so this branch's only real bound
      does not live in a different policy. GROUP 4's two new assertions cover the
      outcome, and the suite says plainly that they do NOT discriminate on that clause:
      a third control run with it alone removed still passes all 14. (b)
      `getGolfGroupAddCandidatesImpl` checked `existing.error` and explained why it must
      not be absorbed, then absorbed `members.error` and `staff.error` — on which the
      sheet renders "Everyone on this team is already in the group", making a failed
      read indistinguishable from a full one. Both now throw.
- [x] **One assertion was wrong first and the fix is recorded:** counting rows as the
      acting user cannot tell "the row is gone" from "the row is invisible to me" — the
      same SELECT policy filters both — so the delete assertions now take their counts
      with RLS off. The first draft passed for the wrong reason.
- [x] **Declarative schema updated and proven equal.** `supabase/schemas/policies/golf.sql`
      and `functions/public.sql` carry the new shapes;
      `scripts/db/check-new-migrations-in-schema.sh` is a blocking CI gate, so a migration
      without them fails the PR. Equality is not assumed: the declarative statements were
      applied to a scratch transaction and Postgres's own deparse of the result diffed
      byte-for-byte against the deparse of what the migration produces. Identical.
- [x] **Leave group ships live and ungated**, because it is the one membership mutation
      production RLS already permits (the baseline self-delete). Add and Remove render for
      the creator of a team chat — derived from `creator_id === currentUserId`, the same
      fact the Admin pill uses, so what the sheet offers and what the database permits come
      from one predicate rather than two that can drift. Before the migration is applied
      they return 42501, and that surfaces as an error in the sheet and is recorded through
      `maybeCaptureRlsDenial` — never a silent no-op. **No feature-flag constant**: a
      hardcoded `false` would ship no capability while adding a second thing for the owner
      to remember and a test to delete on enablement.
- [x] **The absence assertions were updated deliberately, which is the mechanism they
      exist for.** `'Add member'` and `'Leave group'` were removed from the deferred-control
      `it.each` list; Mute, Search and Files stay. Enabling one costs a deleted assertion,
      so it cannot happen by accident. 73 tests total (45 → 73), 18 failing pre-change.
- [x] **Two action-count tripwires moved, with the arithmetic written down** —
      `coverage-contract.foundation` 428 → 432 and golf message exports 10 → 14;
      `feature-registry` 420 → 424, because `src/app/actions/messages.ts` is one of the
      explicitly-listed manifest entries rather than an `'ALL'`-mapped file, so the four
      new actions had to be named in `feature-registry.ts` too.
- [ ] **BLOCKED ON THE OWNER, and nothing else is:** apply
      `20260907160000_golf_team_chat_membership_management.sql` through `db-apply` after
      `db-migration-reviewer` (mandatory before applying). Until then Add and Remove are
      visible to a group's creator and fail with a surfaced error; Leave works today.

## W8 — Rendered fidelity review (M05 / D-02)
- [x] Serve the app against the local stack and compare against `reference/*.dc.html`.
      Served the built app at 390×844 against the local stack. The one-conversation
      seed could not show list rhythm at all, so the fixture was widened to the
      artboard's shape (six conversations, two groups, mixed read state, spread
      across today / this week / a fortnight ago) before measuring. Two defects,
      both fixed, both closing an open audit item:
  - [x] **OVER-SEGMENTATION** — the rail printed FIVE section headers for six rows
        (Unread + Today + Yesterday + This Week + Earlier). `Main.dc.html:61,111`
        labels exactly two sections for seven rows. It also ran time backwards on
        screen: an unread row stamped "Yesterday" sat above a section headed TODAY.
        Collapsed the four recency buckets to Today / Earlier. Nothing is lost —
        `formatTime` already stamps each row "Yesterday" / "Fri" / "Aug 28". This
        also shrinks **M03A F09**'s risk surface (row time and section grouping used
        two different day rules) from three shared boundaries to one. Neither
        `DECISIONS.md` nor the manifest freezes the Unread bucket or authorises
        removing it, so it stays — only the recency split changed.
  - [x] **A FALSE SELECTED ROW ON A PHONE** — the page auto-selects the first
        conversation on load, and a phone hides the rail once a thread is open, so
        `selectedId` described nothing visible yet still painted its row. Measured:
        that row is `oklab(0.963 0.0022 0.0209 / 0.9)`, which IS the search well's
        `surface-sunken` fill. **This is the rendered evidence M03A F06 asked for
        and could not gather** — the two states did collapse visually. It was also
        the only fill a READ row could receive, so it broke the artboard's single
        list contrast (unread lifts on a card `:66`, read lies flat `:82`) with a
        third material. Selection is now gated on the desktop media query the rail
        already reads.
  - Confirmed correct and deliberately NOT changed: read rows are flat and unread
    rows lift on a card (G-32, matches `:66`/`:82`); the page paints
    `bg-canvas-gradient` (M03A F11 already shipped); `isGroupConversation`
    classifies both groups and none of the five DMs (G-15's flag distinction).
  - Left alone, with the reason: **G-01** pinned strip and **G-03/G-04** filter
    chips need data that does not exist (a pin column, filter state) plus the two
    unmapped gradients M03A routed to A03 — all already in DEFERRED above.
    **G-31**'s bell is app-wide chrome, likewise deferred. The
    Messages/Announcements strip is `FairwayHubSubNav`, rendered at shell level for
    every golf hub; folding the page's actions into it would put a cross-surface
    component in a messages-scoped PR.
- [x] Confirm G-26 is actually fixed in a real browser, not just in jsdom
  - Measured at 390x844 with a real thread open, not asserted from the class
    list. All four outgoing bubbles right-align to the same edge (x=374) at
    four different widths (277 / 176 / 288 / 207), and each bubble's metadata
    renders BELOW its body rather than beside it. That is the pair G-26
    described; both hold live.
- [x] Rebuild the conversations list on ONE cadence (the visual complaint)
  - The list read as uneven with real data and the reason was measurable, not
    a matter of taste. Box gaps were a uniform 6px; PERCEIVED gaps were not.
    Card-to-card the eye lands on the card edges and reads 6px; flat-to-flat
    there is no edge, so it reads text-to-text -- 12px padding + 6px gap +
    12px padding = 30px, five times larger. Rows were 80px carded against
    72px flat on top of that, and five section headers printed for six rows.
  - Sections collapsed to the artboard's set (Unread / Today / Earlier),
    every row given identical padding, the inter-row gap replaced with a
    `divide-y divide-border-subtle` hairline, and unread re-expressed as a
    tint plus weight plus badge instead of an elevated card.
  - This partly REVERSES G-32, which is recorded as a correction rather than
    quietly dropped (`memory/ledgers/changes/team_communications.md`). G-32's
    diagnosis was right and its shadow was an exact token match; what the
    artboard could not show is that it is a specimen which never stacks two
    flat rows, so the fix produced the uneven cadence with real data.
    DECISIONS.md G-50b governs: take the rule, not the specimens. The repo
    already ships the rule in a dense list -- `FairwayQualifierLeaderboard`
    tints its leader row inside a divided list.
  - `MessageConversationRail.unreadLift.test.ts` is re-anchored, not deleted
    (the G-49a precedent): it now asserts the absence of the lift, the
    presence of the divided-list treatment, and that the leaderboard idiom it
    cites still exists.
- [x] Give the list edges and the bubbles depth (the "it's super flat" complaint)
  - The complaint had two halves and they had different causes.
  - **The sides.** Once the rows went flat, nothing carried an edge: the list
    ran to the page padding with only a hairline between rows, so a grouped
    set of conversations had no boundary at all. Each triage section's `<ul>`
    is now a grouped card. **Corrected in the same pass, after the owner
    rejected the first attempt as "doing too much":** it shipped as
    `rounded-fw-lg` carrying `--fw-shadow-card` composed over
    `--fw-shadow-soft`, and both halves overshot in a way a token comment names
    outright. `--fw-radius-lg` is 28px and reserved for "modals, sheets, hero
    plinths, glass bars"; `--fw-radius-card` is the one whose comment says "THE
    card radius". And `card` and `soft` each carry a `0 1px 2px` CONTACT layer,
    so stacking them doubled it to roughly 0.11 at 2px blur — a hard dark edge
    at the card's foot, which is the "resting on" tell and the opposite of
    floating. It is now `rounded-card bg-surface shadow-raise`: ONE radius
    token, ONE shadow token, whose own comment names the state that was asked
    for — "popovers / floating glass" — and a mapped utility rather than a
    bracket, because the complaint was too much machinery. The depth moved UP
    one level: it belongs to the list, never
    back onto the row, so the one-cadence fix above is preserved -- every row
    is still `rounded-none border-0 p-3` with no shadow of its own, and the
    inner container is pinned to the avatar's height (`flex h-12 items-center
    gap-3`) so a badge's line-height cannot re-introduce the 80-vs-72 split.
  - **The bubbles.** The incoming bubble was `bg-surface-sunken` (0.963) --
    that is the WELL role, used for input tracks and insets. A recessed fill
    fights every shadow you put under it, which is why the artboard's own
    `--fw-shadow-card` read as nothing. `Bubbles.dc.html:82` draws the
    brightest cream, so the fill is now `bg-elevated` (0.993) and the shadow
    reads. Outgoing lifts further on `--fw-shadow-raise` over `bg-accent-650`.
  - **A03 request #8 is recorded, not silently satisfied.** The artboard's
    `.lit-accent` ambient is HUED -- `oklch(0.488 0.124 150 / 0.22)` -- and no
    Fairway *shadow* token is. But the *colour* ramp already holds that exact
    green as `--fw-color-accent-700`, so the variant can be minted from the
    ramp rather than invented; that is now written at the source in
    `audit/A03-VARIANT-REQUESTS.md`. The interim ships the deepest NEUTRAL
    token, and `MessageThreadPane.bubbleDepth.test.ts` still forbids a raw
    `oklch(` inside a `box-shadow:` -- a first attempt at the hued value was
    rejected by that test and the CODE was changed, not the test.

## W9 — Touch response, busy affordances and loading states (owner request, outside the original manifest)
Same shape as W7b: an owner ask that arrived after the manifest was frozen, so
it gets its own section rather than being filed under W8. Five gaps, one
property each. Every one was found by reading the tree against its OWN
standards, not against taste — each cites a place where this repo had already
decided the answer and one Messages surface was not following it. Nothing new
was invented and no new entrance animation was added: the tokens say "slow,
cinematic, never twitchy", and the surface had already been rejected three
times for reading choppy.

- [x] **The thread's first paint was three grey bars.** `MessageThreadPane`'s
      loading branch drew three raw `bg-surface-sunken` divs: not the
      `Skeleton` primitive, so no shimmer; no `role="status"` / `aria-busy` /
      SR-only label, so a screen reader heard nothing; and not bubble-shaped,
      so the first paint jumped. `Skeleton.tsx`'s own header states all three
      as the contract, and `MessageConversationRail`'s loading branch already
      honoured all three — two standards in one directory. The placeholders now
      alternate incoming / outgoing at the bubble's own geometry (`max-w-[288px]`,
      `rounded-card` with the sharpened trailing corner, the 32px avatar gutter
      held on incoming rows) so the slot the real messages land in is actually
      reserved. `MessageThreadPane.bubbleWidth.test.ts` is RE-ANCHORED, not
      relaxed: it located the bubble column by the file's first `max-w-[288px]`,
      which the skeleton now precedes, so it anchors on the column's full
      declaration instead — a stricter locator than the one it replaces.
- [x] **A send in flight spoke the typing vocabulary, and said nothing at all
      to assistive tech.** The send button drew three `animate-bounce` dots.
      Three animated dots in a chat mean "someone is typing", which this tree
      draws one file over in `TypingIndicator` — so a send in progress and a
      peer composing a reply rendered as the same object. That indicator's own
      comment also records that `animate-bounce` on dots was tried and rejected
      for throwing them a third of their height on a spring curve. Worse, the
      dots were `aria-hidden` and nothing else on the control changed, so a
      screen-reader user got NOTHING while a send was in flight. Now `Loader2`
      + `animate-spin motion-reduce:animate-none` (`ToastStack`'s in-repo idiom,
      and the same shape `Button`'s own `busy` draws), plus `aria-busy` and a
      label that switches to "Sending message". The primitive's `busy` prop is
      deliberately NOT used here: `Button` renders its spinner ALONGSIDE
      children, and this is a 40px `p-0` circle, so the ring and the paper
      plane would share the well.
- [x] **`GroupDetailsSheet` never said WHICH action was running.** Five
      mutating controls set `disabled={busy}` and none set the primitive's own
      `busy=`, so a tap greyed the whole sheet out and drew no progress
      anywhere — while `FairwayNewMessageSheet` and `FairwayTeamBroadcastSheet`,
      in the same directory, both already pass it on their CTA. The single
      boolean could not simply be forwarded: Add is rendered once PER
      CANDIDATE, so one flag would spin every row at once, which claims several
      requests are running when one is. `run()` now takes an optional key and a
      `pendingKey` names the pressed action; Add draws its spinner on that,
      while confirm-remove and Leave — both singletons, one gated on
      `removeConfirmId` and one on `leaveConfirm` — take `busy` directly. The
      key clears on the failure path and on close, so a reopened sheet never
      starts mid-spin.
- [x] **The rail's press response fired but could not settle.** The rows are
      `Button`s, so the primitive's base already carries `fwPress`
      (`controls/_internal.ts:62-63`) — a 0.5px settle plus `scale-[0.98]` on a
      spring curve, the one tactile language the system has for "I felt that".
      But the row className carried a bare `transition-colors`, which displaces
      the base's own property list through `cn`, and `transform` was in that
      list: the press snapped on and snapped back and the spring easing governed
      nothing. On a phone, where hover never happens, that press is the only
      feedback a tap gets before the route changes. Widened by exactly ONE
      property, deliberately — `fwTransition` also transitions `box-shadow`, and
      a row shadow is what the one-cadence pass removed; putting it back in the
      transition list invites per-row depth to return. A test pins its absence.
- [x] **The recipient rows in both sheets acknowledged a tap with a colour swap
      alone.** They are raw `<button>`s (each with its own
      `helm/no-raw-button` disable), so they inherit nothing from the control
      family. The four `fwPress` utilities are now inlined and cited rather than
      imported: nothing outside `controls/` imports `_internal` and the
      underscore is announcing a boundary, so the recipe is spelled out the way
      this tree spells out artboard lines — and the test pins BOTH halves
      against `_internal.ts` itself, so the copy cannot drift from its source.
- `messages.motionAndBusy.test.ts` is the new suite: 14 tests across all five,
  including one that walks every touched file and requires each to pair its
  motion with a reduced-motion collapse.

---

## W10 — Ground, tint and the day-chip collision (owner review round 5)
Two owner messages on live screenshots: "Add some color and depth to this. Some
like shadow. And the top looks kinda rough. Not centered and spacing throughout
isn't very consistent. The avatars should have some color", then "The avatars
should be directly beside the message and messages should never appear like
this, with the lettering popping it over."

Note on the screenshots: they were taken against a stale `next start` build left
running by an earlier gate pass, so the meta-row complaint ("lettering popping
it over" — the timestamp sitting BESIDE the bubble) was already fixed on this
branch by G-26 and is not re-fixed here. The dev server now runs from this
worktree with HMR so the owner is reviewing what is actually committed.

- [x] **The flatness was the GROUND, not the fill.** Scroll region `bg-surface`
      (0.984) under an incoming bubble of `bg-elevated` (0.993) — nine
      thousandths, which no shadow can rescue. Region → `bg-canvas` (0.953),
      bubble → `bg-surface`. That is the 0.031 step G-49/F14's shadows were
      drawn against, and `bg-surface` is independently the right fill:
      `Bubbles.dc.html:20` / `Thread.dc.html:57` paint the bubble a gradient
      whose mean is 0.9845 — `--fw-color-surface` to three places — while
      `elevated` overshoots the ramp into the "cold white sheet"
      `design-tokens.css:118` explicitly bans.
- [x] **`Avatar` gains an opt-in `tone="accent"`**; default `neutral` unchanged,
      so no other caller in the app moves. `bg-accent-100` / `text-accent-700`
      are byte-identical to what `Group.dc.html:28,49` and `Thread.dc.html:35`
      fill a person's avatar with. Applied to the 1:1 header avatar, the
      incoming message avatar, and the group stack's FIRST face only — the
      artboard leaves the ones behind it `surface-sunken`, which is the default.
- [x] **The incoming avatar renders on every incoming row, not groups only.**
      The gate was argued on width; measured, the column costs nothing (390px
      screen − 32px padding − 40px column = 318px, still clear of the 288px
      bubble cap). Wrong premise, gate removed.
- [x] **The day chip is inline, which is why it can no longer collide.**
      G-50a generalised `Thread.dc.html:51`'s floating chip — a container-pinned
      current-day indicator — into a per-boundary separator, so it painted over
      the next group's sender name ("TODAY" over "Alexis Bennett" in the
      screenshot). `Group.dc.html:44`, the artboard matching a group thread,
      draws the same chip in flow and centred. Material unchanged (DECISIONS.md
      froze the glass); only placement moved.
- [x] **Header**: `<ArrowLeft>` moved into `Button`'s `leftIcon` slot — the
      primitive's sanctioned API for an icon beside a label — and the title
      column took `ml-1`, `Group.dc.html:32`'s `margin-left: 4px` on top of the
      row's gap. The artboard's asymmetric `padding: 14px 14px 12px 8px` was
      deliberately NOT ported: it exists because its back affordance is a bare
      44px icon box, and ours is a labelled button with `-ml-2`.
- [x] `MessageThreadPane.dayChip.test.ts` re-anchored under G-49a — inline
      assertions that read `Group.dc.html:44`'s literal out of the artboard,
      plus a standing guard that the absolute positioning does not return. Its
      `stripComments` took the whole-block strip `unreadLift` already had.
- [x] **Rendered check done.** Served at 390x844 against the local stack, signed in
      as `coach@local.test`, opened the "Kiawah Trip" group. The seeded thread had
      two messages on one day, which cannot show a day boundary or a multi-message
      run at all, so the fixture was widened first (five messages from two other
      participants spread across Saturday / yesterday / today, including a
      two-message run from one sender) — same fixture-widening the W8 rail pass
      needed. Every W10 claim measured, none asserted from a class list:
  - **Ground vs bubble.** Scroll region `oklab(0.953 0.0027 0.0218)` = canvas;
    incoming bubble `oklab(0.984 0.0011 0.0160)` = surface. The 0.031 step the
    shadows were drawn against, live. Own bubble `oklab(0.540 -0.114 0.0666)` =
    accent-650, unchanged.
  - **Avatar tint.** Every incoming message avatar is `oklab(0.939 -0.0390 0.0225)`
    = accent-100 with `oklab(0.488 -0.107 0.062)` = accent-700 ink. The header
    stack renders NR accent and AB `oklab(0.963 0.0022 0.0209)` = surface-sunken —
    the artboard's first-face-accent rule, not a blanket tint. Rail avatars stayed
    neutral, so the opt-in default held.
  - **Day chip cannot collide any more.** All three boundaries are
    `position: static`. SATURDAY chip ends y=125, the "Jordan Rivera" label under
    it starts y=141; YESTERDAY ends y=331 against "Maya Torres" at y=347 — 16px of
    clearance both times, which is `Group.dc.html:44`'s `padding: 0 0 16px 0`.
    The pre-fix build painted the chip ON that label.
  - **Avatar is directly beside the message.** Avatar x=16..48, bubble x=56 — an
    8px `gap-2`, and the avatar's box bottom is level with the column's foot, i.e.
    the group's timestamp, which is what `align-items: flex-end` draws in
    `Group.dc.html:48`.
  - **The header back control is ONE line and vertically centred.**
    `getClientRects().length === 1`, arrow at x=17 and label at x=39 on the same
    20px row, button centre y=44; the title/subtitle block spans y=24..64, centre
    y=44. Exactly the anonymous-box split the `leftIcon` move was meant to fix.
    Avatar stack right edge x=199, title x=213 — 14px, which is the row's 10px
    gap plus `Group.dc.html:32`'s `margin-left: 4px`. The title is not optically
    centred in the bar and cannot be: the labelled back control is 101px wide.
    That is the shipped back affordance, not a defect this round introduced.
- [ ] **NOTED, not fixed, out of W10's scope:** with the widened fixture the thread
      did not auto-scroll to the newest message — content continued below the
      scroll region's foot while the view sat mid-thread. It may be an artifact of
      rows inserted straight into Postgres arriving by realtime rather than by the
      initial fetch. It needs its own reproduction against a normal send before
      anything is changed; recording it rather than guessing at it.

## DEFERRED — deliberately not in this PR, with the reason
Scaling scope down is the owner's call, so these are named rather than silently dropped.
None is blocked by anything above; each is its own piece of work.

| Finding | Why deferred |
|---|---|
| **G-01** pinned conversations | Needs a migration *and* a product decision (D-03). Not a UI item |
| **G-27** deletes hard-remove instead of tombstoning | Migration plus destructive-semantics change; needs `db-migration-reviewer` and an owner call |
| **G-31** masthead reshape + bell | App-wide chrome, not messaging-owned. G-53 confirms the bell contract already exists elsewhere — consume it, don't invent it here |
| **G-54** unify the two recipient sheets | Large refactor spanning two leases; §11 stays `proposal` because no multi-recipient group-creation flow exists at all |
| **G-14 / G-16** send-path unification, reconnect/foreground resync | Architecture, not a defect fix. Wrong thing to land un-reviewed overnight |
| **G-39 / D-04** branch reconciliation | Needs the local-vs-remote tip (`e3aec2315` ≠ `c65dd47b5`) chosen explicitly first |
| **G-02** mute UI | Depends on G-58's migration being *applied*, which is the owner's step |
| **G-20c** replying — the composer's reply-context slot | Named rather than built, because a slot with nothing to fill it and nothing to render the result is decoration that scores green. Four pieces, and NO MIGRATION GATE: `golf_messages.reply_to_id` already exists with its FK (`src/lib/types/database.ts:14216,14260`), so whoever picks this up does not need to re-derive that. (1) initiate from a bubble — the long-press action row G-19 built is where it goes; (2) thread the id through `sendMessage`, which hardcodes `reply_to_id: null` at `use-golf-messages.ts:662`; (3) the composer's quote slot, drawn at `Composer.dc.html:69-86`; (4) render the quote in the recipient's bubble |
| **G-51** remove the dead roster presence dot | Referral — outside the messages tree, different lease |
| **G-52** messaging presence | Policy problem (RLS), not a build |
| **G-41** DM creation race | Needs a unique constraint ⇒ migration ⇒ owner |
| **M03D F18** reactions tray (`Reactions.dc.html`) [high] | Named here because a high-severity finding with no checklist row makes "the plan is complete" untrue. It is NOT a re-skin: the five-emoji vocabulary, per-emoji counts and viewer-own-reaction state (G-35) are a contract that has to be specified against the unused `golf_message_reactions` table first, and the tray's entry point is the same long-press row G-42/G-56 just rebuilt. Its own piece of work, not a tail on this one |
| **G-03..G-07** inbox states (elevation, filter row, offline, drafts, stale cue) | Depend on G-04's finding that the visible "Team" control is a different feature; sequenced after the thread work |
| **G-10 / G-11 / G-12 / G-17 / G-25 / G-28 / G-34..G-37 / G-43** | Lower severity or dependent on a deferred item above |

## NEW findings from the write phase
Found while doing something else, recorded rather than silently absorbed.

| Finding | What |
|---|---|
| **G-59** [low] | `src/lib/admin/data/activity.ts:395,423` reads `is_team_channel` for golf where 403/437 read `is_team_chat` for baseball. Latent today only because `title` is coalesced first (`audit/M01-TEAM-FLAGS.md`) |
| **G-60** [med] | `AttachmentPreview.tsx`'s remove button is a 20px target — WCAG 2.2 SC 2.5.8 requires 24px. Belongs to W5/G-47, which owns composer geometry; G-46 was a palette migration and changing a control size under it would be a different change wearing G-46's name. Note that Fairway's own `IconButton` does not fix it either: its smallest size is 36px (44px on a coarse pointer), which at `-top-1 -right-1` on an 80px tile overhangs into the next tile's `gap-2`. The fix is a hit-area expansion, not a bigger badge |
| **G-62** [high] | On a phone the thread header, INCLUDING Back, was clipped behind `FairwayHubSubNav`. `useImmersiveSurface` hid the shell top bar and the bottom nav but not the hub sub-nav strip (39px + border, `position: sticky`), while the immersive surface below sized itself against the full viewport. Measured at 390x844: the contact-name row was 0px tall at scrollTop 0 and Back was unreachable on every conversation. FIXED -- one rule in `globals.css`, keyed on the same `data-fw-immersive` attribute inside the same phone-only media block, with `FairwayMessages.immersive.test.ts` pinning the data-slot |
| **G-61** [med] | `src/lib/storage/attachments.ts` passed `contentType` to `.upload()` under a comment saying it stops the SDK inferring `application/octet-stream` for an iOS camera capture. `uploadOrUpdate` (`@supabase/storage-js/dist/index.mjs:615-641`) never reads that option for a Blob body — and a `File` is a Blob. FIXED under W5 (the bytes now carry the resolved type); latent rather than confirmed live |
