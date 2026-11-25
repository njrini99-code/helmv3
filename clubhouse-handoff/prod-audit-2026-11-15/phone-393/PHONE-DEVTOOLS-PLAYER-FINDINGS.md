# Clubhouse at iPhone width, player side: DevTools findings (live site, read only)

helmsportslabs.com, signed in by the owner as a player on the demo team ("Cole"). Sunday 15 Nov 2026, 17:14–17:55 UTC.
Production served `db3a99ee1` (`npm run release:status`, same build as the coach pass). Line numbers are from `main` at `412be9c89a`, whose
`src/clubhouse` matches what production serves (the two commits ahead, #2531 and #2532, are tooling only).
The coach-side report is `PHONE-DEVTOOLS-FINDINGS.md` in this folder; where a cause is shared, this report points to it rather than repeating it.

## How this was measured (read this first)

- **Browser.** The owner's everyday Chrome 157, Default profile, over the DevTools protocol (`chrome://inspect` remote debugging), in one new tab.
  No other tab was touched. The owner signed out of the coach account and signed in to the player account in that tab, by hand, with a password.
- **Emulation.** iPhone 15 Pro: 393×852, DPR 3, mobile, touch, Safari 26 user agent, light mode. Re-checked on every screen and every flow.
  - The owner's DevTools device toolbar was open on the audit tab at first (Pixel 10, DPR 2, Android user agent) and overrode the emulation. Nothing
    was measured until it was closed and the emulation read back 393×852, DPR 3, iPhone user agent.
- **Tier.** Every number is **C (Chromium)**: not real Safari, not a real iPhone. No safe areas, no iOS keyboard, Mac display at about 100 Hz.
- **Extensions in this profile, next to every trace:** ChatGPT, Chrome Remote Desktop, Chrome Web Store Payments, Claude and DeepWiki to Markdown.
  Only Claude injects a content script on every site. Same profile and set as the coach pass.
- **Read-only guard (new for the player pass).** A player session writes on its own, so the tab ran with a write guard, on from the moment the tab
  showed a player session (`data-ch-role="player"`) until the end:
  - Network blocks: `/golf/dashboard/team-hub`, `/golf/dashboard/coachhelm`, `/rounds/continue`, `/practice/plan/`, round review (`/rounds/<id>`),
    `?conv=`, and the RPCs `mark_golf_messages_read`, `golf_pin_conversation`, `golf_practice_plan_record_open`.
  - In-page: every non-GET request refused unless it was a read on a checked list. Server actions were matched to their names from the production
    chunks (`createServerReference(id, …, "name")`). Supabase RPCs were allowed only after reading their SQL (`STABLE` or select-only).
  - **Result** (`.helm/…/data/player-guard.jsonl`, 1,362 entries): the only requests that reached the server were reads:
    - Server actions: `getNotificationBadgeBundle`, `getUnifiedNotifications`, `getPlayerQualifiers`, `getPlayerSavedCourses`,
      `getRecentCoursesForPlayer` and `getNextQualifierRoundNumber`.
    - RPCs: `golf_my_class_day`, `get_golf_conversations_with_details` and `golf_player_profiles`.
    - **No write reached production during the pass.** The only writes were the owner's own sign-out and sign-in (WRITES-ON-OPEN row 14).
    - Before the guard turned on, while the tab was still the coach's Home, its calls were reads too. The one unnamed at first, `7fe7142a…`, is
      `getGolfActiveTeamConversationIds`, resolved from the production chunk.
  - **Blocked:**
    - 17 `setNextLiveShare` writes (finding 4);
    - every Team Hub and CoachHelm prefetch (finding 1);
    - 175 Vercel analytics beacons;
    - 80 `/api/log-error` reports;
    - three course reads not on the list (`listCoursesStrict`, `getRecentlyPlayedCourses`, `getTeamSavedCourses`).
  - **What the guard changes in the numbers.**
    - The blocked prefetches and beacons cost a real phone a little more network and CPU than measured here.
    - The guard reads the loaded chunks once per page load to match action names: about 106 ms, async, never a long task.
    - The Browse courses sheet and the live-share field may have shown their error states because of blocked calls. Only their motion is reported.
- **Instruments.** As in the coach pass:
  - the repo probe plus painted contrast and chart marks, axe 4.14 and IBM Equal Access 4.0.35;
  - a Chrome trace (`RunTask` long tasks, drawn and dropped frames) plus an in-page recorder (rAF frames, Long Animation Frames, `getAnimations()`).
  - Overlays were opened with focus + Enter and closed with Escape.
- **Not run.** Lighthouse: the `chrome-devtools-real` server started, but Chrome never got its Allow click in this pass.
- **Raw data.** `.helm/audit-runs/prod-audit-2026-11-15/phone-393/` (gitignored) holds:
  - `walk-player.json`, `a11y-player.json`, `small-player.json`, `flows-player-summary*.json`, `overlays-player-*.json`;
  - `data/p*.json`, `data/sep-*.json`, `data/player-guard.jsonl`, `data/player-links.json`;
  - `shots/p*`, `shots/g*`, `shots/sep-*`, `shots/ov-p*`;
  - `traces/g*.json`, `traces/p*.json` and `frames/g*`.
- **Covered.**
  - 16 player screens: Home, Calendar, Messages (list), Practice, Roster, Qualifiers, a qualifier, Rounds, My stats, Classes, Tournaments,
    Tournament history, Settings, Settings › Golf, Settings › Notifications and New round.
  - 22 traced flows, the worst 3 again at 4x CPU, popups on 5 screens, and the 5 worst screens at 375×667.

### Not opened, and why

- **Write when opened, on production (blocked as well):**
  - Team Hub (`golf_insight_exposure`, WRITES-ON-OPEN row 2; its Travel tab, row 6);
  - every CoachHelm view, Ask included (row 1);
  - a practice plan (row 7);
  - round review (row 1 of §1, a paid Claude call for a player with the debrief flag off);
  - Continue round (row 9);
  - message threads (row 4);
  - "Message coach" (`/messages?user=…`, which can open or create a conversation).
- **Coach-only:** What's new and Live send a player to Home, and Drills sends a player to Practice (finding 11). No tournament detail had a link.
- **Popups not opened:** the Messages "Announcements" disclosure (it can mark posts read), long-press peeks and menus (they need a hold), toasts
  (they need a save), bell swipes (they mark read), and native `<select>` pickers.

---

## Findings, worst first

### 1. A player's first app open each day records Team Hub's top insight as "shown", without the player opening Team Hub

- **Evidence**
  - From the code path, verified line by line:
    - `nav.ts:121` makes `hub` one of the player's four phone tabs.
    - `SectionStrip.tsx:44-48` passes those tabs to `usePrefetchTabs`.
    - After first paint, `fetchAhead` asks Next for each tab with `PrefetchKind.FULL` (`use-prefetch-tabs.ts:50-55` and `:126`).
    - `prefetch-guard.ts` exempts only `/golf/dashboard/coachhelm`.
    - A full prefetch runs the Team Hub page loader on the server. For a player, that loader records the hub's top insight in `golf_insight_exposure`
      (surface `hub_signal`).
  - Consistent with this on production: every player page load in this pass requested `/golf/dashboard/team-hub?_rsc=…`. The guard failed it
    (status 0, 0 bytes). That request alone doesn't prove the full prefetch: it carries the same `_rsc` hash as the CoachHelm request, which is
    never fully prefetched.
  - How often: the exposure writer de-duplicates per insight, coach and surface per UTC day (`effectiveness/event-ledger.ts:163-172`, best effort).
    So it is the first player app open of each day, for each top insight, whether or not the player looks at Team Hub.
- **Why it matters**
  - CoachHelm's causality attribution reads `golf_insight_exposure.shown_at` for an insight on any surface:
    - `app/api/cron/v3/causality-attribute/route.ts:379`;
    - `lib/coachhelm/v3/causality/comparable-attribute.ts:351`;
    - `confounding-check.ts:91`.
  - So a prefetch can make an insight count as shown, and receive credit for an outcome, when the player never saw it.
  - (The "Shown to {first}" line reads `player_feed` rows only, `coachhelm-file.ts:80`, so it isn't affected.)
- **Cause**
  - Rule CH-R1 in `src/clubhouse/lib/prefetch-guard.ts` exists so a fetch nobody asked for can't count insights nobody saw. Player Team Hub records
    on read too, but was never added to it.
  - The write: `data/hub.ts:373-375` → `getPlayerHubSummaryData` (`app/golf/actions/player-hub-data.ts:138`, `getTopInsightForPlayer`) →
    `recordExposureForReturned(…, 'hub_signal')` (`insight-delivery.ts:441`, `:501`).
  - WRITES-ON-OPEN row 2 notes "Prefetched" as an audit hazard. This finding is the product side of the same fact.
- **Fix**
  - Add `^/golf/dashboard/team-hub` to `RECORDS_ON_READ` (the cost: Team Hub loses its prefetch for players), or record the `hub_signal` exposure
    from the client once the signal is on screen.
  - Add a test that no full prefetch reaches a loader that records exposure.
  - Treat existing `hub_signal` rows as unreliable in causality runs until then.

### 2. Leaving Rounds or Classes freezes the screen for 0.4–0.5 s (1.6–1.9 s at 4x CPU), and every strip tap blocks for 140–290 ms

- **Evidence** (`traces/g*.json`, `frames/g*.json`)

  | Strip tap | Longest task | Total blocking | Dropped (trace) |
  | --- | --- | --- | --- |
  | Rounds → Home (`g03`) | **510 ms** | 460 ms | 62 |
  | Rounds → Calendar (`g22`, control) | **480 ms** | 430 ms | 53 |
  | Classes → Home (`g07`) | **376 ms** | 326 ms | 44 |
  | Home → Rounds (`g02`) | 285 ms | 235 ms | 37 |
  | My stats → Classes (`g06`) | 279 ms | 241 ms | 37 |
  | Home → Calendar (`g04`) | 261 ms | 211 ms | 31 |
  | Home → Messages (`g08`) | 257 ms | 207 ms | 33 |
  | Calendar → My stats (`g05`) | 157 ms | 107 ms | 22 |
  | Messages → Home (`g21`, control) | 156 ms | 106 ms | 23 |
  | Messages → Practice (`g09`) | 141 ms | 91 ms | 17 |
  | **4x CPU:** Rounds → Home | **1,900 ms** | 1,969 ms | 50 (237 rAF) |
  | **4x CPU:** Classes → Home | **1,607 ms** | 1,700 ms | 55 (211 rAF) |

  - The controls show it is the leaving. Arriving at Home costs 156 ms from Messages, while leaving Rounds costs about 500 ms wherever it goes.
  - The Long Animation Frame attribution is `update` in `41jjj9oqv606g.js` (509 ms for Rounds → Home): React DOM's `startViewTransition` update,
    as on the coach side.
  - Player strip taps are slower than the coach's (124–190 ms). Player Home, Rounds and Classes are heavier: 968, 2,268 and 1,228 nodes, and
    pages 2,842, 3,912 and 5,686 px tall.
- **Cause**
  - The same synchronous route commit inside the view transition's `update` (`src/clubhouse/shell/RouteFrame.tsx:231`; coach finding 1).
  - Player Rounds renders every month group and every row (`src/clubhouse/screens/rounds/RoundsLibrary.tsx:304-329`). Classes renders the whole term.
- **Fix**
  - The coach fixes apply: a smaller commit (suspend to the skeleton, then stream), and Rounds limited to the recent months with "Show earlier".
  - Classes: render the current week and collapse the rest of the term.
  - Gate: no strip tap over 50 ms at 4x CPU.

### 3. New round shows a mismatched skeleton for about 3 seconds

- **Evidence**
  - Three direct loads: the "Browse courses" button first appears 2.9, 3.2 and 3.2 s after navigation start. The page's `load` event had fired at
    0.4–0.7 s.
  - Until then the screen is four ivory skeleton slabs under "Rounds", with no green header and no step row (`shots/p13-rounds-new__at1s.jpg`
    against `shots/p13-rounds-new.png`).
  - Pushing it from Home (`g12`) costs four long tasks (285, 69, 131 and 140 ms; total blocking 425 ms; 66 dropped frames). At 4x CPU it is
    1,195 ms plus 540 ms (total blocking 1,873 ms).
- **Cause**
  - `src/clubhouse/screens/rounds/entry/NewRound.tsx:235` shows `RoundEntrySkeleton` while `qualifiers === 'loading'`, for up to
    `QUALIFIER_READ_MS = 6000` (`setup-reads.ts:241`).
  - `loadSetupQualifiers` runs after hydration, as two server actions in sequence: `getPlayerQualifiers`, then `getNextQualifierRoundNumber` per open
    qualifier (`setup-reads.ts:269-276`; the guard log shows them about 1.1 s apart).
- **Fix**
  - Render the form immediately: Practice is the default and needs no qualifier.
  - Fill in the "Open qualifier" card when the read lands, in a reserved slot.
  - Better, load the open qualifiers and their next round in the route's server loader, so the first paint is the real page.
  - Make the skeleton match the page: green header, step row, then the cards.

### 4. Opening New round writes to production before the player touches anything

- **Evidence**
  - Every New round open in this pass sent `setNextLiveShare` (17 times, all blocked by the guard), about 0.5 s after the setup reads.
  - The next posts were error reports (`/api/log-error`), from the failed write.
- **Cause**
  - `src/clubhouse/screens/rounds/setup/LiveShareField.tsx:49-56`: "Tell the database what the field shows, once per value". The effect calls
    `ports.setNext(level, remember)` → `setNextLiveShare` → RPC `golf_round_live_set_next_share` (`app/golf/actions/round-live.ts:74-83`) as soon
    as the saved preference is loaded, with no change by the player.
  - The write on first show is deliberate: the component's own comment (`LiveShareField.tsx:17-19`) says the choice doesn't travel in the setup
    payload, so the database is told when the field first shows a value. It is a design choice, not a slip.
  - `docs/clubhouse/audit/WRITES-ON-OPEN.md` row 9 says New round writes "only while tracking", so the doc is wrong.
- **Fix**
  - First, add the row to WRITES-ON-OPEN.md (§2), so audits stop opening New round on production.
  - The design question for the owner: should opening the setup screen write at all? If not, send the level with the start-round payload, or call
    `setNext` only on a change (`touched`) and at start.

### 5. "Coaches and team", the default live-share choice, runs out of its pill to the screen edge

- **Evidence**

  | Width | Label spans | Pill spans | Overflow |
  | --- | --- | --- | --- |
  | 393 | x=274–387 | x=258–373 | **14 px**, ending 6 px from the edge |
  | 375 | x=262–375 | x=246–355 | **20 px**, ending at the edge |

  - The overflowing part of the selected label is ivory on the ivory page, so it reads "Coaches and tea…" with the rest gone (painted contrast
    1.06:1). This is the default selection, so every player sees it.
  - Screenshots: `shots/p13-rounds-new.png`, `shots/sep-rounds-new__viewport-live.jpg`.
- **Cause**
  - `src/clubhouse/styles/controls.css:22-36`: `.ch-seg__b` is `white-space: nowrap` with 16 px side padding.
  - `src/clubhouse/screens/rounds/setup/LiveShareField.tsx:90-96` puts three of them in a full-width (`block`) row, about 115 px each.
  - The label is `SHARE_LABEL.team = 'Coaches and team'` (`src/clubhouse/live/copy.ts:102`); about 145 px are needed.
- **Fix**
  - Shorten the label (for example "Team", with the hint line below saying it includes coaches).
  - Or give this control the tight segment rule already used for Ask (`coachhelm-ask-v2.css:203`: `min-width: 0; padding-inline: 4px`).
  - Add a 375 px overflow check for every `Segmented` with three or more options.

### 6. Settings › Notifications jumps 177 px after it appears (CLS 0.113)

- **Evidence**
  - One layout shift of 0.113 at 877 ms (above the 0.1 "poor" line): both delivery groups moved from y=341 to 518 and from 474 to 651.
  - Other player layout shift: Settings › Golf 0.072, New round 0.059–0.075, Messages 0.034, Rounds 0.031.
- **Cause**
  - `src/clubhouse/screens/settings/phone/NotificationsPhone.tsx:91-95`: the player's "During class" group renders only once `useHoldDuringClass`
    (`:67`) has read class status in the browser. It is inserted under Quiet mode, so everything below drops.
- **Fix**
  - Reserve the group's space while it loads (a one-row skeleton with the same height), or read the class status in the route loader.

### 7. Voice Control can't reach player round rows by what they say

- **Evidence**
  - axe `label-content-name-mismatch` (serious): **37 nodes on Rounds**, 14 on Classes, 1 on a qualifier. IBM `label_name_visible` matches.
  - Example row: visible "21 Wed Springfield Country Club · Jeff Roope Invite tees…", accessible name "Oct 21, Springfield Country Club, 73 (+1)".
    "Tap Springfield" works, but "Tap 21" or the visible score order doesn't.
- **Cause**
  - `src/clubhouse/screens/rounds/parts.tsx:606` builds `label` and `:611` sets it as `aria-label` on the row link.
  - Classes: the class rows' group labels ("Coaches see Cole Bennett: …"), from the same pattern.
- **Fix:** start each label with the visible text in the same order, or drop `aria-label` and add the missing words as visually hidden text.

### 8. The player screens read near-white too

- **Evidence**
  - The same flat `#f2f0e9` page as the coach side, with no gradient on `html`, `body` or `main`.
  - Near-white share: My stats 61%, Roster 55%, Messages 53%, Classes 40%, Tournament history 35%, Qualifiers 28%, Practice and Tournaments 25%.
  - Screenshots: `shots/p08-stats.png`, `p05-roster.png`, `p03-messages.png`.
- **Cause and fix:** coach finding 5 (`shell.css:2395-2398`, `tokens.css:716`, `page-colour.test.ts`, law 2 at `tokens.css:93-95`). One change
  covers both roles.

### 9. Classes' "Held · Change" is an 18 px-tall tap target

- **Evidence**
  - At 393 and 375: the link is 81×18 with no padding and no `::before`/`::after` reach. Its row is 24 px tall.
  - It is the only way from Classes to the class-hold setting.
- **Cause:** `src/clubhouse/screens/classes/ClassStatusPanel.tsx:204` and `src/clubhouse/styles/class-awareness.css:529-534`.
- **Fix:** a 44 px reach (`position: relative` plus an `::after` with `inset: -13px -8px`), as `.ch-search` does in `controls.css`.

### 10. Home's sparklines sit just under the 3:1 chart floor

- **Evidence:** the four "Your game" sparklines in their "No clear change" state stroke `#8f8b81` on the `#f2f0e9` page: **2.98:1**.
- **Cause:** `src/clubhouse/styles/home.css:2157` sets the neutral `--ch-spark` to `var(--ch-ink-400)`, which `.ch-ph-spark__line` strokes at 2 px
  (`home.css:2189-2191`). The gain and loss states use the chart tokens (`:2160`, `:2163`).
- **Fix:** use one ink step darker for the neutral state (for example `--ch-ink-500`).

### 11. Coach-only pages load in full for a player, then bounce

- **Evidence**
  - `/golf/dashboard/whats-new` and `/live` return 200, with titles "What's New" and "Live", then move a player to Home after load.
  - `/practice/drills` moves a player to Practice.
  - The walk's probe lost its page mid-measure on both (the page navigated away). A deep link or a stale bookmark shows a flash of the wrong page.
- **Cause (inferred)**
  - The redirect is on the server, but too late. `src/app/golf/(dashboard)/dashboard/whats-new/layout.tsx:5` and `…/live/layout.tsx:5` call
    `redirectToClubhouse({ player: '/golf/dashboard' })` (`src/clubhouse/routes/alias.ts`).
  - Production still answered **200** with the "What's New" title, then moved the page. That is how Next delivers a `redirect()` thrown after the
    response has started streaming (here, under the dashboard's loading boundary): a client-side redirect in the stream instead of a 307.
  - Drills (player → Practice) behaves the same way.
- **Fix**
  - Answer the role before streaming starts: in the request proxy (`src/proxy.ts`) for the coach-only paths, or in a parent that has no loading
    boundary above it.
  - Check with `curl -sI` signed in as a player: it should return 307, not 200.

### 12. Slow first loads on Settings and Practice

| Screen | Time to first byte | Largest paint |
| --- | --- | --- |
| Settings | 750 ms | 2.06 s |
| Practice | 825 ms | 1.42 s |
| Home | 639 ms | 1.28 s |
| Calendar | 390 ms | 1.91 s |

All on a fast Mac connection. HTML is 183–291 KB per screen and each cold load makes 153–212 requests.

- **Cause:** the server time is in the route loaders, `src/clubhouse/routes/settings.tsx` and `src/clubhouse/routes/practice.tsx`, which these
  traces can't see inside. Not profiled.
- **Fix:** add server timing to those two loaders, or read their spans in Sentry (`helm-sentry`), and parallelise or cache whatever dominates.

### 13. Accessibility notes (low)

- IBM `aria_content_in_landmark` on all 16 screens: the shell element outside a landmark, as on the coach side.
- `aria-controls` pointing at ids that aren't in the DOM:
  - Classes: `_r_0_`, from "More for your classes", whose menu isn't mounted while closed;
  - a qualifier's round rows: `ch-qf-rv-<id>`, panels not mounted while collapsed.
  - Mount the controlled element hidden, or drop `aria-controls` while it is absent.
- A qualifier's round row: `role="button"` contains `role="img"` (IBM `aria_descendant_valid`).
- Every page heading includes the section switch's label, so a screen reader hears "Practice, something new in another section" as the page title
  (Team Hub's "7 new" badge). Keep the badge in the button's description (`aria-describedby`), not in the heading text.

---

## Popups and navigation (C tier; extensions as listed above)

| Flow | Trace dropped / drawn | Longest task | Notes |
| --- | --- | --- | --- |
| Section strip open, close (`g01`) | 3 / 102 | 30 ms | clean |
| Account sheet (`g10`) | 8 / 144 | 31 ms | closes on Escape |
| Bell (`g11`) | 2 / 122 | 30 ms | closes on Escape |
| Home › Next round, scorecard pager (`g13`) | 2 / 3 | 25 ms | in place |
| Home › Scoring "Last 5" (`g14`) | 10 / 45 | 73 ms | in place |
| My stats › Filter sheet (`g15`) | 8 / 100 | 76 ms | closes on Escape |
| Classes › More menu (`g16`) | 3 / 46 | 16 ms | closes on Escape |
| New round › Browse courses sheet (`g18`) | 8 / 138 | 58 ms | guard blocked three of its reads |
| New round › Date picker (`g19`) | 19 / 163 | 85 ms | closes on Escape |
| Calendar Month ↔ Day (`g20`) | 10 / 84 | 45 ms | |
| Qualifiers → a qualifier and back (`g17`) | 32 / 80 | 159 ms | route push |
| Home → New round and back (`g12`) | 66 / 149 | **285 ms** (+131, 140, 69) | finding 3 |
| Strip taps (`g02`–`g09`, `g21`, `g22`) | 17–62 | **141–510 ms** | finding 2 |
| **4x CPU:** Rounds → Home | 50 / 121 | **1,900 ms** | |
| **4x CPU:** Classes → Home | 55 / 121 | **1,607 ms** | |
| **4x CPU:** Home → New round | (267 rAF) | **1,195 ms** + 540 ms | |

Every popup closed on Escape and left nothing open. A qualifier's round rows expand in place with no dropped frames.

## Passed (C tier)

- **Section strip kept, no bottom tab bar** on any player screen. The strip's 13 player sections open from the title.
- **Text contrast:**
  - Nothing under its floor on 16 screens apart from finding 5.
  - The other flags are false positives:
    - Calendar's today cell (as on the coach side);
    - New round's disabled "Start round" (WCAG exempts disabled controls) and its empty scorecard's 55% hole numbers (placeholder);
    - Home's boxed bogey scores, where the 1 px box edge is sampled as background;
    - a 375 px capture of New round taken while the Practice pill was mid-slide.
- **Tap targets:** the search fields on Messages, Qualifiers and Rounds reach 44 pt through their `<label class="ch-search">` `::after` (the probe
  measured the inner input). The only real miss is finding 9.
- **Overflow:** no sideways scroll at 393 or 375 on any player screen.
- **Inputs:** 16 px, so iOS won't zoom.
- **Greeting:** "Good afternoon, Cole" at 12:14 Eastern, correct (coach finding 14's 11:00 boundary still applies before noon).

## Not verified (needs S or D)

- Safe areas, the iOS keyboard, and New round's fixed "Start round" bar against the home indicator: Chromium has no safe areas.
- Smoothness on a phone: every frame number here is Chromium on a Mac.
- Player Team Hub and player CoachHelm (Ask included): they write when opened on production. They can be audited on staging with a minted demo player
  (`node scripts/clubhouse/audit/session.mjs --role player --base <preview>`), W tier.
