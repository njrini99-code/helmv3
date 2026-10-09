# Clubhouse native-feel and performance audit — 2026-10-08

## Executive summary

**Scope:** Clubhouse coach screens on the phone: Home, Calendar, Stats,
CoachHelm, More, Roster, the player page.
**Platforms:**

- iPhone 17 Pro simulator, Safari, iOS 26.
- Vercel preview `helmv3-lc57habm8` (main at 0cd9689ff, Clubhouse on).
- Signed in as the demo coach (Demo University Golf).
- Production database.

**Findings:** P0 3 · P1 5 · P2 4.

The owner's verdict was "still feels like a website, choppy, non-native". The
measurements agree. Two causes explain most of it:

1. **Every tab switch is a full server round trip with a page-wide skeleton.**
   No page is kept in memory, and the crossfade dims the whole screen, the tab
   bar included.
2. **Row security on shots and holes runs its permission check once for every
   row.** One team's shots take 553 ms with row security and 4.7 ms without.
   Those queries feed Stats, Home, CoachHelm and player pages.

### Top 3 wins

1. Rewrite the `golf_shots` / `golf_holes` read policies to check the round once
   rather than every row. Measured 553 ms → a projected ~15 ms per query: 125
   round checks instead of 6,977 row checks, plus the 4.7 ms raw read. Behaviour
   is identical.
2. Keep visited pages in the client router cache and prefetch the tabs. Tab
   revisits then render in one frame instead of 700 ms of skeleton.
3. Pin the tab bar and top bar outside the page crossfade, and show a skeleton
   only when a load passes ~300 ms. This removes the ghosting and the fading tab
   bar.

### Headline metrics (before)

All figures come from frame-timestamped simulator recordings
(`simctl io recordVideo`, variable frame rate, so each frame is a real screen
change).

- **Tab: Home → Calendar.** Measured: 820 ms to content; skeleton 700 ms.
  Target: ≤ 100 ms cached, ≤ 400 ms cold. Status: 🔴
- **Tab: Calendar → Home (just visited).** Measured: 715 ms; 1 blank frame.
  Target: ≤ 1 frame. Status: 🔴
- **Tab: → Stats.** Measured: 1,350 ms; three layers ghosted. Target: ≤ 400 ms.
  Status: 🔴
- **More → Roster.** Measured: 845 ms; sheet, Home and skeleton overlaid.
  Target: ≤ 400 ms. Status: 🔴
- **Roster → player (push).** Measured: 435 ms slide, content ready. Target: ≈
  350–450 ms. Status: 🟢 the model to copy
- **Back button (pop).** Measured: 183 ms. Target: 250–350 ms. Status: 🟡 a
  little abrupt
- **Edge swipe back.** Measured: Cancels at 80% travel. Target: Completes past
  ~50%. Status: 🔴
- **Scroll fling (Home).** Measured: 60 fps; 8 frames over 25 ms; 53 ms hitch.
  Target: No frame over 25 ms. Status: 🟡
- **More sheet.** Measured: 460 ms spring. Target: ✓. Status: 🟢
- **`golf_shots` read, one team (6,977 rows).** Measured: 553 ms with row
  security; 4.7 ms raw. Target: < 50 ms. Status: 🔴
- **`pg_stat_statements`, shot and hole reads.** Measured: Mean 0.73–2.47 s,
  300–2,300 calls each. Target: < 100 ms. Status: 🔴

## Methodology

- **Device:** iPhone 17 Pro simulator (402×874 pt) on this Mac, Safari, preview
  deployment, so these are real network and production database timings.
- **Frames:** `xcrun simctl io booted recordVideo`, then `ffprobe` frame times
  and a per-frame pixel diff (`scratchpad/native/analyze.py`). Each "+ms" is
  time since the first visual response to the tap.
- **Database:** `pg_stat_statements` (cumulative), plus
  `EXPLAIN (ANALYZE, BUFFERS)` in a rolled-back transaction acting as the demo
  coach (`request.jwt.claims.sub`). It was read-only.
- **Advisors:** Supabase performance advisors. Of note: 7 `auth_rls_initplan`
  (one is on `golf_rounds`), 143 `multiple_permissive_policies`, and 789 unused
  indexes.
- **Not measured:**
  - **Vercel function timings:** the runtime logs held no entries for the
    preview.
  - **The Capacitor native shell:** the preview can't be loaded in the shell
    without a production config change. WKWebView behaves like Safari here,
    except for back-swipe (see P1-4).

## Findings

### P0-1 Row security checks every shot and hole row

- **Evidence:** `EXPLAIN ANALYZE` as the demo coach. `golf_shots` for one team
  returned 6,977 rows in **553 ms**. SubPlan 13 runs **6,977 times**,
  re-checking `golf_rounds` row security plus the `is_golf_team_coach()` /
  `is_golf_team_player()` (plpgsql, security definer, cannot be inlined) and
  `is_admin()` checks for each shot. The same read without row security takes
  **4.7 ms**.
- **Policies:**
  - `golf_shots_select` + `admin_read_all`;
  - `golf_holes_select` + `golf_holes_select_team`, two permissive policies ORed
    together.
- **Fix (migration, owner applies):** replace each table's SELECT policies with
  one policy, `round_id IN (SELECT id FROM golf_rounds)`. The subquery runs
  under the caller's own `golf_rounds` policies once per round, as a hashed
  semi-join.
  - It is exactly equivalent for `golf_shots`: the same own, team-coach,
    team-player and admin predicate.
  - For `golf_holes` it adds admin read, which `golf_rounds` already grants.
- **Also:** `idx_golf_shots_round_id_covering` is **71 MB on a 12 MB table**.
  When it is cold, the planner's index-only scans cost about 3.4 ms per round.
  `REINDEX CONCURRENTLY` it, or drop it in favour of `idx_golf_shots_round_id`;
  it was 447 ms in one cold run.
- **Expected:** Stats, Home, CoachHelm and player reads drop from 0.5–2.5 s to
  tens of ms.

### P0-2 Every tab switch refetches with a full-page skeleton

- **Evidence:** t1, t2, t10. The skeleton holds for 700 ms even for a tab left 5
  s earlier (t2), with one fully blank frame before content.
- **Cause:**
  - `next.config.mjs:184` sets no `experimental.staleTimes`, so the dynamic
    client cache is 0 s and every visit refetches.
  - The route-level `src/app/golf/(dashboard)/dashboard/loading.tsx` shows a
    skeleton immediately.
- **Fix:**
  - set `experimental.staleTimes: { dynamic: 30, static: 180 }`;
  - prefetch the five tab routes on shell mount (`router.prefetch`);
  - show the skeleton only after a 300 ms delay, keeping the current page until
    then.

### P0-3 The tab bar and the page ghost during the crossfade

- **Evidence:**
  - t1 frame 2: the tab bar is dimmed and the old page sits under the new
    skeleton.
  - t10: skeleton text is drawn over the tab bar.
  - t5: the More sheet, Home and the Roster skeleton all show at once.
- **Cause:** the root view transition (`shell.css:1779–1800`) crossfades the
  whole document. Only `ch-page` is named, so the tab bar and top bar are part
  of `root` and fade with it. RouteFrame (`RouteFrame.tsx:55`) adds its own
  opacity fade on top.
- **Fix:**
  - give the tab bar and top bar their own `view-transition-name`, with no
    animation, so they stay put;
  - pick one fade, not two;
  - close the More sheet before navigating, not during.

### P1-1 Drill-ins from More use a crossfade, not a push

Roster, Messages, Recruiting and Qualifiers are drill-ins, but they enter with
the tab crossfade. The player page already slides (t6: a 435 ms push with
parallax). Use the same push for every drill-in.

### P1-2 The pop is too quick

The back pop takes 183 ms, while iOS pops take about 350 ms. It reads as a jump,
not a slide back.

### P1-3 The sort control doesn't show its sort value

After tapping SG (t9), the list is in strokes-gained order but each row still
shows the scoring average and handicap, so the order looks random. Show the
sorted value in the trailing column.

### P1-4 Edge swipe back

- **In Safari:** the swipe is Safari's own history gesture, and it cancelled at
  80% travel (t7).
- **In the native shell:** `GolfBridgeViewController.swift:60` uses
  `allowsBackForwardNavigationGestures`, a whole-WebView history snapshot that
  also slides the tab bar and status area.
- **Fix:** an in-app interactive pop that drags the page layer, keeping the bars
  fixed.

### P1-5 One `auth_rls_initplan` warning on `golf_rounds`

`golf_rounds` is the hottest table (16.6 M index scans). Wrap `auth.uid()` as
`(select auth.uid())` wherever the advisor flags it.

### P2-1 Scroll hitches near the end of a fling

- 53 ms and 50 ms frames near the end of a fling (t3), and one 1.1 s late
  repaint.
- Likely a late image or content swap after the scroll stops.
- Profile once P0 is fixed.

### P2-2 The top bar's title doesn't move with the push

The title swaps instantly during the push; iOS crossfades and slides the title
too.

### P2-3 The tab bar disappears on the player page

iOS keeps the tab bar on pushed pages unless the page is fully immersive.

### P2-4 No large title that collapses on scroll

Each page stacks a bar title, a letter-spaced line, a large title and a double
rule, so content starts about 33% down the screen. Use one large title that
collapses into the bar on scroll. This one is the design pass's call.

## Capacitor iOS shell (capacitor-best-practices pass)

- **C1.** Remote-hosted app: every cold start and every navigation needs the
  network; there is no local shell. Evidence: `capacitor.config.ts:31`:
  `server.url` = production. Fix: Short term: P0-2 (cache and prefetch). Long
  term: bundle a static app shell (`webDir`) with live updates, so the frame,
  tab bar and last data paint offline at launch. Pri: P1 (strategic)
- **C2.** The launch colour is Fairway cream, but Clubhouse opens on a green
  frame and an ivory canvas, so a colour jump is visible at launch once
  Clubhouse ships. Evidence: `capacitor.config.ts:57,105`;
  `GolfBridgeViewController.swift` `FwColorCanvas` (`#F2E6D2` / `#F7EFDF`) Fix:
  When the flag ships, the launch storyboard, splash and WebView background take
  the Clubhouse frame colour (`--ch-frame` #0a331f light, #08150e dark). Pri: P1
- **C3.** The WebView is non-opaque. iOS composites the whole WebView over the
  window on every frame, an avoidable scroll and transition cost. Evidence:
  `GolfBridgeViewController.swift`: `webView.isOpaque = false`. Fix: Keep it
  non-opaque until the first navigation paints (that is what prevents the white
  launch flash), then set `isOpaque = true` in `didFinish`. Re-measure scroll
  pacing (P2-1) in a native build. Pri: P2
- **C4.** The back swipe is WKWebView's history snapshot, not an in-app pop: the
  tab bar and status area slide with the page. Evidence: `applySwipeBack()`.
  Fix: P1-4: an interactive in-app pop. Keep the snapshot gesture off on
  Clubhouse routes. Pri: P1
- **C5.** Web Inspector is off in every build, so the WebView can't be profiled
  (timelines, layout and paint) on the simulator. Evidence:
  `webContentsDebuggingEnabled: false`. Fix: Enable it for Debug or dev-server
  builds only, e.g. `webContentsDebuggingEnabled: devServer != null`. Production
  stays off. Pri: P2 (tooling)
- **C6.** No universal links or associated domains, so notifications and shared
  links open Safari or a cold launch rather than the screen. Evidence: No
  `com.apple.developer.associated-domains`; already wave-2 backlog. Fix: AASA +
  entitlement. Pri: P2
- **✓.** Haptics plugin, keyboard `resize: ionic`, `allowsLinkPreview: false`,
  the offline `errorPath`, the auto-hiding splash watchdog, and clearing the web
  cache per build are all correct.

## Prioritised plan

- **1.** Policy rewrite for `golf_shots` / `golf_holes`, plus a reindex:
  forward-only migration, migration review, local pgTAP, then apply. Owner
  decision: **Yes:** production RLS. Effort: M
- **2.** `staleTimes`, prefetch on shell mount, 300 ms delayed skeleton. Owner
  decision: No. Effort: S
- **3.** Bars outside the view transition; one fade. Owner decision: No. Effort:
  S
- **4.** Push for every drill-in; 350 ms pop; title transition. Owner decision:
  No. Effort: M
- **5.** Sort value column. Owner decision: No. Effort: S
- **6.** Interactive edge pop in the native shell. Owner decision: No (native
  build) Effort: M

## After-fix verification plan

- Re-record t1, t2, t5, t10 with the same script. Target: a cached tab change in
  ≤ 1 frame of skeleton, and a cold one in ≤ 400 ms to content.
- Re-run the `EXPLAIN ANALYZE` as the demo coach. Target: under 50 ms.
- Recheck `pg_stat_statements` mean times 24 h after the apply.
