# Completeness pass, 4 Nov 2026

This pass checked every screen, subscreen, push, sheet, menu, popover, modal, toast, inline state and sub-flow in all nine lanes, so one Claude Code agent can build the whole redesign front to back without guessing. Nick asked for it in these words: "ensure that all screens subscreens and feature are front to back completed. Everything needs to be thought of and considered."

Read this after `START_HERE.md` and `DECISIONS.md` (it is item 7 in START_HERE's reading order). Nothing here overrides the START_HERE shared values table or a call in DECISIONS.md. The added rows themselves live in each lane's own files, so the agent meets them while building.

## How to find what was added

- Every lane file that changed has a pointer line under its H1 and one section at the end titled `## Completeness pass, 4 Nov 2026`. Those sections use the file's own shape: 05 inventory rows and per-ID state matrices, 06 element specs, 07 motion rows, 08 numbered pass or fail criteria.
- Rows that were wrong were fixed in place and marked `(fixed 4 Nov: ...)`.
- Calls made by the lead (not the lane worker) are marked `Added by the lead`.
- Each lane's full matrix, handoff table and fix log is in `completeness/<lane-folder>.md`.

## What was checked, for every item

1. States: default, empty, first run, loading or skeleton, failed with retry, offline or stale, coach vs player (a player never sees a teammate's figures; coach-only things are absent from player DOM and responses), long content, zero, one and many, flag off.
2. Sizes and modes: phone 390, large phone 430 (20px edge), desktop 1280 and the 821 to 1279 band where it matters, light and dark, Reduce Motion (CH_FADE_MS 180ms crossfade), XXL Text Size (`--ch-type-scale` 1.36 must not clip), keyboard and focus (focus ring, Esc closes, focus returns to the opener), 44pt targets, contrast (4.9:1 target, 4.5 floor, marks 3:1).
3. Motion: every transition in and out, back, close, swipe down, scrim tap and Esc, interrupts, and the Reduce Motion version.
4. Entry points: every way in, including push and bell notifications, deep links with params, a cold start into a deep link, and a link to something deleted or not allowed for this role.
5. Data: every field traced to today's helmv3 (03-DATA-CHECKS); a missing value shows "—"; nothing changes what shot tracking collects.
6. Flags and held migrations: which flag gates it, which migration it needs, and what shows until that migration runs.
7. Cross-lane handoffs: the entry, the context carried, where Back goes, and what happens when the other lane's flag is off.
8. Every listed state has a numbered pass or fail check in 08.
9. The extras a premium app needs: pull to refresh, scroll restore on Back, discard confirm for unsaved changes, double-submit guard, optimistic update with rollback, empty search results, today vs tomorrow and the 1 August season turnover, long lists, a player removed mid-session, two devices editing, haptics where 07 uses them, VoiceOver labels and order, and share or print where drawn.

## Results per lane

| # | Lane | Gaps found and filled | Fixed in place | New 08 criteria | Lane report |
|---|---|---|---|---|---|
| 1 | `classes-roster-home/` | 73: 39 new screen and state IDs, 21 IDs with no acceptance, 1 missing file plan (desktop Home) | 12 | CP-25 to CP-73 | `completeness/classes-roster-home.md` |
| 2 | `stats-home/` | 74 (197 rows): detail states on cold deep links, S-HOMEGAME rows, press, Missed short | 46 | CP-131 to CP-155 | `completeness/stats-home.md` |
| 3 | `messages/` | 69: 19 IDs with full matrices, the lane flag, 6 of today's bugs fixed behind the flag, pin sync edge cases, Ask prefill fields, `?announcement=<id>`, offline sends | 13 | MSG-CP-01 to MSG-CP-71 | `completeness/messages.md` |
| 4 | `coachhelm-team/` | 111 rows | 21 | CP-TEAM-1 to CP-TEAM-27 | `completeness/coachhelm-team.md` |
| 5 | `coachhelm-read/` | 88 rows | 11 | CP-READ-1 to CP-READ-27 | `completeness/coachhelm-read.md` |
| 6 | `coachhelm-lenses/` | 107 rows | 16 | CP-LNS-1 to CP-LNS-23 | `completeness/coachhelm-lenses.md` |
| 7 | `ask/` | 52: failed states per flow, event first, poll prefill, acknowledgement wording | several, plus 14 rows on `draft_poll` | CP-1 to CP-74 | `completeness/ask.md` |
| 8 | `coachhelm/` (Quick chat and AGENT_KIT) | 26: 5 new IDs, the S-PANEL.full matrix, 9 motion rows, 12 spec rows | 14 | CP-QC-1 to CP-QC-32 | `completeness/coachhelm.md` |
| 9 | `practice-plan/` | 52 N-00 screens with no state matrix, 20 IDs with no motion row, 13 IDs not in 08, 11 open cross-lane calls | 46 "parent owns it" rows given a named parent | CP-PP-01 to CP-PP-80 | `completeness/practice-plan.md` |

## The biggest gaps, now closed

- Scope: this package covers only the nine pages Nick asked for (Classes, Roster and Home; Stats and player Home; Messages; Team Board; Root cause; Coach vs player; Ask; Quick chat; Practice plan creation). It is not a full redesign. Nothing outside those nine is in it, apart from the prerequisites below.
- The Practice tab and Documents plans were missing from the zip. Only the minimum the Practice plan and Quick chat lanes need to work is in `prerequisites/` (plan, drill bank and event data, and the Documents rows plans file into). It is not a redesign of the Practice tab or Documents. Several Practice Builder PRs, Ask's Save and Publish, and Quick chat's plan save depend on them. They are now in `prerequisites/`: `N-00-practice-plan-builder.md`, `N-10-documents.md`, `PRACTICE_DESIGN_SPEC.md`, `practice-plan-builder.preview.html` and their changelogs. START_HERE section 4 row 11b builds them.
- Three lanes had no flag, so SHARED-8 (flag off renders as main) could not hold. Classes, Roster and Home, Stats and Home, and Messages now each have one. The foundation PR 2 and 3 were also unflagged; they now sit behind `clubhouse_refresh_v1`.
- There were two drill bank models and two folder models. There is now one of each (DECISIONS, completeness calls).
- Ask saved a plan before its practice event existed. Ask is now event first, like the Practice lane.
- Ask's 06 said a poll draft wrote a message row; its 02 said prefill only. It is prefill only, and nothing is written until the coach presses Post.
- Ask and Messages worded acknowledgements differently. Both now say "n of N acknowledged".
- Feature cards were drawn with a radial light, against SHARED-2. They are flat everywhere now.
- Messages had no deep link to an announcement; it now takes `?announcement=<id>`.
- `playerFileHref` and `/golf/dashboard/roster?player=<id>` were used but never defined. They are defined now, with flag-off fallbacks.
- The player Home green bar left a seam under the flat hero. PR 6 sets `data-ch-hero-flat` on the Home root.
- 32 Stats detail rows said a detail "can't occur" while loading. That broke the `dev_plan_assigned` push on a cold start. A detail now shows its bar and a skeleton, then lands in place.

## Flags (all off, everywhere)

| Flag | Gates | New in this pass |
|---|---|---|
| `clubhouse_refresh_v1` | Foundation PR 2 and 3 (flat page, large titles), scoped under `[data-ch-refresh='on']` on the app root | yes |
| `clubhouse_classes_roster_home_v1` | PR 7 to 10 | yes |
| `clubhouse_stats_redesign_v1` | PR 4a to 4c, 5, 6 | yes |
| `golf_messages_redesign_v1` | PR 11a to 11h | yes |
| `coachhelm_team_board_v1` | CT0a to CT7 | no |
| `coachhelm_read_v1` | CR1 to CR6 | no |
| `coachhelm_player_file_v1` | L1 to L6 | no |
| `coachhelm_ask_v2`, `coachhelm_player_ask_v1` | AK0 to AK12 | no |
| `coachhelm_quick_chat_v1` | QC0 to QC6 | no |
| `golf_practice_plans`, `golf_documents_library` | N-00 and N-10 prerequisites | no |
| `coachhelm_practice_plans_v1` | PP0 to PP9 (CoachHelm writing plans) | no |

SHARED-8 now says to override `preview: true` and `development: true` on every one of these when checking flag off. Captures run with `clubhouse_refresh_v1` and the lane's own flag on.

## Held migrations (files only, never applied)

Each runs only on Nick's yes, one at a time, after the first deploy and the rename migration.

| Migration | Lane | Note |
|---|---|---|
| `20261031150000` pin sync | Messages 11h | as drawn in `messages/pin-sync/PIN-SYNC.md` |
| `20261028140800` poll delete fix (already in the repo's held list) | Messages polls | a poll can't be deleted on production until it is applied (CH-7008); apply it before Clubhouse polls are used |
| `20261026010000` to `20261026010800` | N-00 Practice tab | `20261026010100_golf_team_drills` is the one drill bank |
| `20261026090000` to `20261026090300` | N-10 Documents | `090300` narrowed so a plan can sit in any folder |
| HM1 to HM4, `20261101090000` to `20261101090300` | Ask and Quick chat | written as files in the wiring pass: `ask/held-migrations/`. Quick chat writes need HM1; without it only today's four writes show |
| HM5 `20261101090400_golf_drills_team_bank` | Ask | superseded by N-00's `golf_team_drills`; do not build |
| PM1 `20261102090000_golf_practice_plan_formats` | Practice plan | now a file: `practice-plan/held-migrations/` |
| `20261104090000_golf_practice_plan_coach_why_and_draft_row` (new in the wiring pass) | Practice plan PP4 | coach-only `golf_practice_plans.coach_why` and `golf_practice_plan_file_draft`, which files a draft plan as a coach-only Documents row; N-00's 010400 forbids coach inserts of plan rows, so nothing else covers it. Needs N-00 010000, 010400 and 010600 first |

The SQL for N-00 and N-10 is inside their plan files (the 8.x blocks); N-00 slice 0 copies it to files word for word. Until a migration runs, each lane's 05 Completeness section and 06 Wiring section say exactly what shows (usually today's behaviour, or an inert "Comes with the Practice tab" row that makes no network call).

## Cross-lane handoffs

The full tables are in each lane report, section 3. These are the rules every lane now agrees on:

| From | To | Trigger | Carried | Back | Other lane's flag off |
|---|---|---|---|---|---|
| Roster profile, peek "View stats" | Stats coach view | tap | `?player=<id>` | Roster, profile at rest, scroll kept; Stats' own "‹ Team" key goes to Team Stats | today's Stats page |
| Coach Home names, "Team stats" | Stats | tap | `?player=&tab=game` or none | Stats summary, then Home at its scroll | today's Stats |
| Roster, Home, Read, Lenses "Message" | Messages compose | tap | the player, or `?prefill=<key>` draft only | the opener as it was | today's Messages |
| Ask board and poll asks | Messages composer | tap | `ChPrefill` with `conversationId` (wins over players), `poll`, `attachment`, `returnTo:'ask'`; a fresh key per tap. AK11c also lets `takePrefill` accept `conversationId` with no players, hashes the new fields in `keyOf`, and adds `seed` to `PollSheet` | back to Ask | Ask off: today's links |
| Ask announcement | Messages, Announcements | Post, after the 8s Undo | the announcement row | Ask's Open lands on `?announcement=<id>` | Messages off: today's announcements |
| Team or Lenses read sheet | Read | "Open the full read" | player, insight | host, sheet closed, scroll kept | Team falls back to `coachReadHref`; Lenses leaves the row out |
| Team player sheet, Ask names | Lenses file | tap | `playerFileHref(id, at?, on)` | to the opener, scroll kept | Lenses off: today's player page or Deep dive |
| Lenses "Open {first}'s profile" | Roster profile | tap | `/golf/dashboard/roster?player=<id>` | "‹ Roster" to the list; browser Back to the file | before PR 8 the param is ignored |
| Read, Team, Lenses "Ask about" | Ask | tap | read or player id via `askAboutHref` | Ask's own | null, so the row is absent |
| Read, Team "Add to practice plan", drill suggestions | Practice | tap | read id or drill | Practice's own | absent until `practicePlanHref` and both practice flags |
| Ask and Quick chat plan | Plan page | Save | the same plan object through `savePracticePlanDraft`, event first | `?from=coachhelm&ret=` | "Comes with the Practice tab", inert |
| Practice publish | Bell and push | Publish, after the 8s window | one push (`practice_plan`, Events) and one bell row (`event_reminder`, kind practice_plan) | n/a | nothing sent |
| `dev_plan_assigned` push | Stats goals | notification, cold start too | `?tab=dev` | Stats summary | n/a |

No lane contradicts another after this pass. Quick chat never publishes. A waiting Quick chat card expires at midnight.

## Wiring pass (4 Nov 2026)

Nick then asked: "Make sure everything's wired and complete data / feature logic / function wise too". Every screen and action in the nine lanes was checked against the real code and schema on helmv3 main 03d9087: the source of every field, what every button writes or calls, who may do it and the RLS policy behind it, validation, success and failure, Undo, optimistic updates, how other screens see the change, every push and bell row, where each flag is read, and every handoff. Each lane's 06 now ends with `## Wiring, 4 Nov 2026` and its 08 with numbered `W-` checks. Citations that moved since 75b4956 were fixed in place, marked `(fixed 4 Nov wiring: ...)`.

| Lane | Wiring gaps filled | Checks | Notes |
|---|---|---|---|
| Classes, Roster, Home | 12 (data 6, actions 4, flags 2) | W-CRH-1 to 28 | practice rounds left out through one `countsForScoring(r)`; the flag reaches the client as `ChShellData.crh` |
| Stats and Home | 3 (data, flags, handoffs) | W-STATS-1 to 20 | `dev_plan_assigned` is a bell row and email, not a push; `round_submitted` opens the round |
| Messages | 32 (data 11, actions 9, privacy 2, notifications 3, flags 3, handoffs 4) | W-MSG-1 to 21 | today's bugs L3, M1 and M3 confirmed and fixed behind the flag; H1 already fixed on main |
| Team Board | 11 | W-TEAM-1 to 20 | `course_id` added to `ROUND_COLUMNS`; player ids come only from the resolved roster |
| Root cause (Read) | 14 | W-READ-1 to 20 | CR0 traced to `diagnosisFor` (`data/coachhelm-dive-shape.ts:328-350`); failed code is CH-13866 |
| Coach vs player (Lenses) | 9 | W-LNS-1 to 21 | L0 traced to `readPlans` (`data/coachhelm-dive.ts:53-71`) |
| Ask | 19 | W-ASK-1 to 28 | HM1 to HM4 written as files; teammate filter lives in `player-tools.ts` on the server |
| Quick chat and AGENT_KIT | 16 | W-QC-1 to 15, kit K-16 to K-27 | without HM1, no held writes; the chat lives in a provider-level session so it survives navigation |
| Practice plan | 14 | W-PP-1 to 18 (18 added in review: a draft save keeps a published row's Documents title) | `practice_plan` push type added in N-00 slice 3; chat post sends with no second push |
| Prerequisites (N-00, N-10, minimum only) | 7 | in each plan's Wiring section | 090300 narrowed; Move on plan rows; everything else marked not in this build |

Nothing in any lane changes what shot tracking collects, stores or sends; every lane that reads shot-derived figures says so in its Wiring section. The engineering calls made in this pass are in DECISIONS.md, "Calls settled in the wiring pass". Full per-lane detail: `completeness/wiring-<lane>.md`.

## Shared files changed

- `START_HERE.md`: two shared values rows (XXL 1.36, flat feature card), COMPLETENESS.md in the reading order, the build order table rebuilt with a Flag column and row 11b, and new cross-lane rules (one drill bank and one folder model, event first, prefill only for polls and board asks, href helpers fall back when a flag is off, capture IDs scoped per lane, captures run with the refresh flag on, held migrations stay files).
- `DECISIONS.md`: a 26-row table, "Calls settled in the completeness pass (4 Nov 2026)".
- `DESIGN_LANGUAGE.md`: feature cards flat; chart marks drawn at rest inside sheets; a Completeness block with group D to F tokens, the breakpoints (phone up to 820; Team, Read and Lenses full layout at 1180; Ask at 1280; Documents per N-10 §12.14; captures at 1280) and the XXL clip checks.
- `ACCEPTANCE-SHARED.md`: SHARED-8 overrides `preview` and `development` and lists every lane flag.
- `BUILD_BRIEF.md`: the lane flags, the card press (0.97 plus wash), PR 10 retitled "Coach Home (phone and desktop)", the read sheet draws its own head, the Lenses rail and `playerFileHref`, Ask's one-card brief, HM5 superseded, and the folder lines for Practice and Quick chat.
- `CODE_PROMPT.md` and `README.md`: point here and to `prerequisites/`.

## Left as written, on purpose

- No design page was republished. Where a page doesn't draw a state, the lane's 05 to 08 Completeness rows are the build rule, and they win over the page.
- Quick chat's page (`coachhelm/redesign/quick-chat.html`) still prints "Only you can see it." on the plan told row. Build "Only coaches can see it", as 05, 06 and 08 say.
- Messages capture of 11a runs in app-only mode for the states the page doesn't draw.
- Haptics: 07 names them where today's `useFocusActions` already fires them. Check each one exists before relying on it; don't add new ones.
- `screenshots/` in Ask, Lenses, Team and Quick chat hold only a README. Capture fills them on the Mac.
