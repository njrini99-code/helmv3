# Clubhouse progress

The from-scratch GolfHelm UI. Code: `src/clubhouse/`. Spec: `design/handoff/`
(desktop, owner-approved). Flag: `golf_clubhouse_ui` (production off). Rules:
`.claude/rules/clubhouse.md`. Adding a new design: `README.md`. Enforcement: `npm run clubhouse:check`, which
also validates this file.

Nothing in `src/clubhouse/` imports or styles through Fairway. Shared
non-UI plumbing (session, Supabase loaders, the Capacitor haptics bridge) is
allowed.

## How a screen moves

A screen advances one gate at a time. Each gate is checked (`[x]`) only when
its evidence exists. The phone gates are separate from the desktop gates
because every screen gets its own native phone design, never a squeezed
desktop.

| Gate | Done when |
| --- | --- |
| `spec` | The desktop reference is identified, the data sources are mapped, and gaps are logged below |
| `desktop` | Built pixel-accurate against the reference screenshots at 924px and 1280px |
| `wired` | Every figure comes from a real loader, and null, zero and early-read states render distinctly |
| `states` | Empty, loading and failed-read states are designed and built, and they are distinct from each other. Every action goes through `useAction`, so a failure tells the coach what failed and what to do next, fires an error haptic and is reported to Sentry. Route errors render the Clubhouse error view |
| `error-tracking` | Server reads log through `chLogServer`, client crashes through `chReport` (tagged `ui=clubhouse` and `surface`), intents leave breadcrumbs, nothing is swallowed, and every failure path was forced once |
| `phone-spec` | `docs/clubhouse/phone/<screen>.md` is approved: it maps the owner's mobile design in `design/handoff/mobile/`, or is a draft the owner approved (`MOBILE.md`) |
| `phone` | The phone design is built at 390px, with safe areas and the bottom tab bar, and checked on a real iPhone through `npm run ios:dev` |
| `motion` | Transitions, press and haptics are wired within the doctrine (90/150/220/360ms, 0.985 press, no count-ups or staggers) |
| `accessibility` | Keyboard path, landmarks and roles, chart text equivalents, announced status changes, AA contrast |
| `performance` | No server waterfall, client JS only on interactive islands, no layout shift after first paint |
| `verified` | typecheck, lint, tests and `clubhouse:check` are green, and a browser pass on desktop and phone is logged below |

Statuses are `todo`, `doing`, `blocked (reason)` and `done`.

Each screen past `spec` has a checklist at `docs/clubhouse/screens/<slug>.md`,
copied from `CHECKLIST_TEMPLATE.md`. It has one section per gate, and
`clubhouse:check` refuses a `done` gate while its section still has an
unchecked box. That checklist is the definition of pro quality for the
screen.

## Where we left off (2026-09-29)

All eight built pages (shell, Home, Roster, Stats team and player, Calendar,
Messages, Settings) carry the full state catalog, with tests, a11y scans and
the build green. PR #2102 is a draft, current with `main` and mergeable. CI
runs in full only when it is marked ready for review (an owner call: about 55
runner-minutes).

Starting the next session:

1. Work in `/Users/ricknini/worktrees/helmv3/clubhouse` on `agent/clubhouse`;
   `git status` should be clean.
2. New desktop designs: follow `README.md`. New mobile designs: follow
   `MOBILE.md`. Build the foundation (tab bar, top bar, sheets) before any
   page's phone version.
3. The screen-by-screen checklist is `SCREENS.md`. Waiting on designs: CoachHelm, Rounds, Practice, Lineups, Events,
   Scouting, the player app, the phone foundation (push prompt, pull to
   refresh), and each page's mobile design.
4. Nothing gets applied: no migrations, no deploys, the flag stays off
   (owner, 2026-09-29). Work that needs a schema change is written as a
   migration and left unapplied. Open for the owner: marking #2102 ready for
   review, and the live pass on a Vercel preview (Q-4).
5. Team stats (coach) has cleared its whole contract apart from owner and
   phone items: every desktop gate, from spec to performance, is done. Open:
   the phone spec and phone build (no Stats mobile design; the draft awaits
   approval), the live pass with a real coach account (Q-4), and the owner's
   review. Deferred to the merge pass (D-27): the full `clubhouse:a11y` run,
   one `npm run build`, and the browser proof of the `domMax` switch slide
   and first-load JS. Next: the Stats player views, after the owner reviews
   Team stats.

Phone, on `agent/clubhouse-messages-mobile` (local, not yet merged):

- Foundation: `phone` doing. Built and checked at 390px: the top bar's variants, the ivory tab bar with
  each role's tabs (D-40), the More sheet (D-41), pushed screens that the edge swipe pops, 44px taps,
  sheets that drag shut (CH-1611) and the bell as a phone sheet (CH-1811). Pages build on `PhoneTop`,
  `PhoneBar`, `PhoneScreen`, `usePhoneStackHistory`, `useSheetDrag` and `Modal`. Open: the real-iPhone
  check (the owner).
- Messages: `phone` doing. The phone stack (Inbox, Thread, Details, New message, announcements) on the
  same container and hooks, plus `getGolfConversationFiles` (D-48). Open: the real-iPhone check and
  owner review (the owner); reduced motion and a keyboard walk in a browser (the next agent slot); the
  e2e run, full build, full suite and performance (the merge pass); forced send, edit, delete and
  leave failures against a live session (the merge pass). After Clubhouse: the queued attachment
  migration (Data gaps).
6. Roster phone (`agent/clubhouse-roster-mobile`, d9b1c81fc and this pass):
   phone-spec is done, and phone is doing. It is built on the foundation, and
   D-50 to D-59 are in code. It passed the browser check at 390 and
   `clubhouse:a11y roster`.
   Open for the phone gate:
   - 430px and toasts: the merge pass (D-27)
   - drag to dismiss: foundation, b4b1b6a6b, merged into `agent/clubhouse` 2026-09-29
   - the iPhone pass: owner
   - pull to refresh: design

## Screens

<!-- clubhouse:screens:start -->
| Screen | Route | spec | desktop | wired | states | error-tracking | phone-spec | phone | motion | accessibility | performance | verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Foundation | (shell, tokens, primitives) | done | doing | doing | doing | doing | done | doing | doing | doing | doing | doing |
| Home | /golf/dashboard | done | doing | doing | doing | doing | doing | todo | todo | doing | doing | todo |
| Roster | /golf/dashboard/roster | done | done | done | doing | doing | done | doing | doing | doing | doing | todo |
| Stats (team) | /golf/dashboard/stats | done | done | done | done | done | doing | todo | done | done | done | doing |
| Stats (player) | /golf/dashboard/stats?player= (coach), /golf/dashboard/stats (player) | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Calendar | /golf/dashboard/calendar (coach and player) | done | done | done | doing | doing | doing | todo | doing | doing | doing | todo |
| Messages | /golf/dashboard/messages (coach and player) | done | done | done | doing | doing | done | doing | doing | doing | doing | doing |
| Settings | /golf/dashboard/settings (coach and player) | done | doing | doing | doing | doing | doing | todo | doing | doing | doing | todo |
| Qualifiers | /golf/dashboard/qualifiers with /new, /[id], /[id]/edit (coach; list and detail also player), /golf/dashboard/my-qualifiers (player) | done | done | done | done | done | done | todo | done | done | done | doing |
| CoachHelm | /golf/dashboard/coachhelm | blocked (still in design) | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo |
| Rounds, Practice, Lineups, Events, Scouting | various | blocked (no design yet) | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo |
| Player app (all screens) | /golf/dashboard (player role) | blocked (no design yet) | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo |
<!-- clubhouse:screens:end -->

## Release with the Clubhouse deploy (owner-run)

Noted by the owner 2026-09-29: these migrations go out with the deployment of the new system. Nothing here is applied by an agent. Each file's status stays in `supabase/migrations/HELD.md`, and the apply path is `docs/operations/APPLY_PATH.md`.

1. **Held on `main` (CoachHelm deep audit, merged in #2101).** Apply in this order:
   1. `20260928130000_golf_insight_exposure_rank_factors.sql`
   2. `20260928140000_coachhelm_alert_type_enum_values.sql`
   3. `20260928230000_v3_attribution_control_interval.sql`
   4. `20260928160000_golf_sg_shot_end_is_next_shot_start.sql`, then the strokes gained recompute
2. **Deploy.** Run `scripts/deploy-prod.sh`; the owner runs it.
3. **After the deploy:** the cleanup SQL, the insight regeneration, and the review backfill (169 rounds).
4. **Flag:** turn on `coachhelm_chat_claim_gate`.
5. **Blocked until the owner decides OD-01:**
   - `20260928120000_golf_putt_make_pct_countable_non_test.sql`
   - `20260928150000_golf_stats_cache_exclude_test_rounds.sql`
6. **Written on Clubhouse branches, not applied, still to be reviewed:**
   - the Qualifiers database fixes (D-35, `agent/clubhouse-qualifiers`);
   - the message attachments fix, queued for after Clubhouse (Data gaps).
7. **`golf_clubhouse_ui`** stays off until the owner turns it on.

## Decisions

- D-1 (2026-09-29): Parallel and flag-gated. Coaches and players both get Clubhouse where a screen is rebuilt for their role (Stats, Calendar and Messages have player versions with the permissions players already have); every other route shows the not-rebuilt notice with a link back.
- D-2 (2026-09-29): Light theme only. The handoff's chart colours are tuned for light paper, and dark mode is not designed.
- D-3 (2026-09-29): Phone navigation is a bottom tab bar in the ivory-pass style, with a selection haptic on tab change. Superseded by D-40 (2026-09-29): the tab bar is now the owner's ivory glass design, with role-specific tabs.
- D-4 (2026-09-29, revised the same day by the owner): Home has the screenshot's two actions as "Message team" (opens the team chat) and "New event" (opens the Calendar editor; N on Home). The README's "removed" note is superseded.
- D-5 (2026-09-29): Each screen gets a written phone design that the owner approves before it is built.
- D-6 (2026-09-29): Schema changes are written as migrations and never applied by an agent.
- D-8 (2026-09-29): Calendar state lives in the URL (`view`, `date`, `event`), not localStorage, so every view is linkable and the server renders the right window on first paint. Moving inside the loaded window is instant; moving past it loads the next window.
- D-9 (2026-09-29): Calendar overlaps are computed from the loaded events and classes (the same data the grid shows), not from the 14-day conflict inbox, so the panel, the grid badges and the editor always agree.
- D-10 (2026-09-29): Players never see a teammate's classes, not even as Busy. The handoff showed "Busy" blocks; the live privacy rule (`attributeClassEvents`) is stricter and wins.
- D-11 (2026-09-29): Calendar types are the database's (practice, qualifier, tournament, meeting, travel, other). The handoff's Workout type has no column value; workouts are practices until a migration adds one.
- D-12 (2026-09-29): Two calendar feeds (team and personal) instead of the handoff's three; the database has no competition-only feed. "Keep as is" on an overlap changes nothing and sends nothing, and says so.
- D-13 (2026-09-29): Messages keeps the existing realtime hooks and actions untouched; Clubhouse is a new view over them. The handoff's Announcement mode (urgent, acknowledge) has no backend and is not offered; coaches create named team groups instead.
- D-14 (2026-09-29): Reactions keep their stored values and render as icons (thumbs up, heart, laugh, party, surprised, thanks), because Clubhouse shows no emoji.
- D-15 (2026-09-29): Players start direct threads only, as in the current app. Group creation stays with coaches until the owner decides otherwise.
- D-16 (2026-09-29): Built the five follow-ups on existing backends. Event files (attach from Documents, remove with Undo); the coach's own busy time (add, view, remove; only they see it); message search through `searchGolfMessages`; per-conversation mute, which the message fan-out now honours (no email, push or bell while muted); announcements with acknowledgement and tasks, posted by coaches from New message.
- D-17 (2026-09-29): Fidelity pass against the handoff. The top-bar bell is the current app's notification feed (same actions, badge poll and read state) in Clubhouse styling. "Ready" is read as accepted RSVPs ("5 of 6 confirmed") on Home and in the sidebar card. Home's greeting subline states facts from the leaderboard (slipping form, no round in 7 days) and the week's next competition; it is absent when the rounds read failed. The latest round links to the player's stats, labelled as such, because no single-round recap is rebuilt.
- D-18 (2026-09-29): Settings is one page with a section rail (owner). The handoff has no Settings screen, so it is built strictly from the design system: Surface cards, Inset, PopoverPanel, FormField, Select, Switch, Segmented; the selected section is a flat green tint (owner). Both notification stores stay, shown as "Email and push" and "CoachHelm updates" (owner). Only preferences Clubhouse honours are shown: animations (now wired to every Clubhouse transition) and haptics; theme waits for the dark theme (owner). Coaching intelligence is the CoachHelm section (owner). Writes keep the current tables and actions; new: a typed "delete" to delete an account, a confirm before a new invite code, and blank organization fields can now be cleared.
- D-19 (2026-09-29): The bell and every menu use the design system's PopoverPanel (strong glass, 14px radius, 34px items).
- D-20 (2026-09-29): Every error, empty, loading, confirm, motion, haptic and accessibility state has a catalog number (`docs/clubhouse/catalog/`, CH- plus four digits: page, then kind). The number is on the element as `data-ch-code`, each enforced row is forced in a test named by it, and `clubhouse:check` fails when code, catalog and tests disagree. Not sent to Sentry or the Bridge yet (owner). Pages are catalogued one at a time, each reviewed before the next (owner: go slow).
- D-21 (2026-09-29): Pages after the first eight get two-digit catalog page numbers (`CH-09001`), in the order their catalogs are started, so existing numbers never change (owner). A catalog file without a page number fails `clubhouse:check`.
- D-22 (2026-09-29): Phone is iPhone only (portrait, light). The owner supplies mobile designs in `design/handoff/mobile/`; a page's design there is its approved phone spec and replaces the draft in `docs/clubhouse/phone/`. Pages without one keep their draft, which still needs approval. Device testing goes through `npm run ios:dev` (a dev-only `CAP_SERVER_URL`; the committed native config stays production, pinned by a test) (owner). Built before any design: the swipe-back guard in the Clubhouse shell, and push-token teardown on Clubhouse sign-out. The push soft ask and pull to refresh wait for the foundation design.
- D-23 (2026-09-29): The old Team stats address `/stats/team` renders the rebuilt Team stats in place, never a redirect (a `redirect()` from a conditional branch crashed `/stats` in production, #310), with the Clubhouse stats skeleton as its `loading.tsx`. It is a coach page: players are sent to their own stats, as before. The design project's `Stats.html` adds a Qualifiers item to the sidebar; Qualifiers is still in design, so the nav is unchanged (owner).
- D-7 (2026-09-29): Errors reuse the existing pipeline (`logError`, `logServerError`, chunk and stale-action recovery) with a Clubhouse view and voice. The messages coaches see say what failed and what to do next, and never show raw server text.
- D-24 (2026-09-29): Shell fix found on the Stats pass (lead-authorized), for every page: `SectionBoundary` wraps its section in a `Suspense` (fallback nothing). A section that throws during the server render is left out of the HTML and rendered again in the browser, where the boundary catches it. Before, one section's crash on first load returned a 500 for the whole page. No section suspends (none has async server children or `use()`), so first paint is unchanged.
- D-25 (2026-09-29): Shell change found on the Stats pass (lead-authorized), for every page: the Clubhouse `LazyMotion` loads its animation features through `@/lib/motion/load-features`, in their own chunk after first paint, instead of bundling `domAnimation` with the shell. The shell loads `loadMaxFeatures` (`domMax`), because `Segmented` and StatsPlayer slide with `layoutId`, which `domAnimation` can't run (the pill jumped instead of sliding); the larger chunk still loads after first paint (lead). Nothing animates on mount (first-paint motion uses `initial={false}`), so first paint is unchanged, and toasts still animate once the chunk lands.
- D-26 (2026-09-29, owner): Team stats keeps its four copy choices as built: "Countable rounds since August" (the season starts August 1); the Most improved caption "Scoring avg, first five rounds to latest five"; the grid subtitle's "needs three rounds"; putting bands below D1 in loss amber. The Stats (team) fidelity line in Data gaps (the Tour baseline and weekly average, "across the window", the D1 seed's putting bands, no Season best marker) is accepted under the same decision.
- D-27 (2026-09-29, owner): Until the branches merge into `agent/clubhouse`, each screen runs accessibility on its own preview states only, captures at one width per form factor, and runs no production build. The full `clubhouse:a11y` run and one `npm run build` happen at the merge. Only two agents run at once, each with at most one dev server, and only while capturing or scanning.
- D-40 (2026-09-29, owner; answers Q-40, Q-41, Q-42): Phone tab bar. Coaches get the design's five tabs, Home, Helm, Rounds, Stats and More, in the design's ivory glass style. This supersedes D-3. Messages, Roster and Calendar open from More, and the Messages unread badge rolls up onto More. Helm and Rounds show the not-rebuilt notice until those screens exist; Qualifiers opens from the Rounds tab once it has a phone build. Players keep today's tabs (Home, Calendar, Messages, My stats, More) in the new ivory style until a player tab design exists.
- D-41 (2026-09-29, owner; answers Q-43): More stays today's sheet (CH-1802), with Settings in it, until the owner designs a More screen. The "‹ More" back link on a page opened from More returns to wherever the user came from.
- D-42 (2026-09-29, owner; answers Q-46): Red means under par, the pin flag, or a destructive action (Leave group, Delete conversation and the danger buttons). `design/handoff/README-v1.md` (the v1 README) and `.claude/rules/clubhouse.md` both say so (the rules line applied by the lead on the owner's answer).
- D-43 (2026-09-29, owner; answers Q-44, Q-45, Q-47): The Safari bar is browser chrome and is dropped; the tab bar, composers and sheet footers pad by the safe-area insets. Phone avatars are one neutral coin (#E9E3D3 with #5A4E36 initials), on the phone only, as `--ch-*` tokens; desktop keeps its five tones. Pull to refresh and the push soft ask wait for a design.
- D-44 (2026-09-29, owner; answers Q-48): Announcements stay on the phone: the section above Today in the Inbox, the announcement as a pushed screen, and an Announcement choice in a coach's New message.
- D-45 (2026-09-29, owner; answers Q-49, Q-50, Q-51): New groups. A coach names the group before it is created (CH-7104). Coaches can be added to a new group (the broadcast, then `addGolfGroupMember`). Quick groups are Whole team and Seniors; the travel squad is hidden.
- D-46 (2026-09-29, owner; answers Q-52): The Unread chip counts conversations, not messages.
- D-47 (2026-09-29, owner; answers Q-54, Q-56, Q-61, Q-62): Details controls with a backend. Schedule opens the Calendar editor (`?new=1`), for coaches only, without invitees. Mute lasts until it is turned off. Add member is wired for the group's creator, on desktop and phone. The creator still can't leave their group.
- D-48 (2026-09-29, owner; answers Q-53, Q-55, Q-57, Q-58, Q-59, Q-60, Q-63): Details controls without a backend. A new read-only action lists a conversation's files. Call, in-thread Search, Pinned, "Only coaches can post", Edit and Delete conversation are hidden until a backend exists.
- D-49 (2026-09-29, owner; answers Q-64): No event card in a thread; every group uses the people mark; the six stored reactions only; "Admin" marks the creator only; coaches keep View stats in a player's direct details; the drawn message icon on the other person in a direct thread's Details goes back to that thread.
- D-50 (2026-09-29, owner, Q-30): On the phone, Roster lives under More, per the foundation decision (D-40 onward): the design's five-tab ivory bar for coaches, and More stays a sheet.
- D-51 (2026-09-29, owner, Q-31): The Roster phone profile shows real fields only (hometown, high school, class of, jersey when set, member since). No migration is written for captain, major, bio or home course. Birthday is never collected.
- D-52 (2026-09-29, owner, Q-32): Plan 1:1 opens the Calendar new-event editor with that player invited, through a new Calendar seed `?new=1&with=<playerId>`.
- D-53 (2026-09-29, owner, Q-33): "All N" rounds opens the player's Stats on the Rounds tab for the season (`stats?player=<id>&window=season&tab=rounds`). StatsPlayer takes a `tab` URL parameter.
- D-54 (2026-09-29, owner, Q-34): The profile's ⋯ opens an action sheet (View stats, then Remove from team with the CH-3501 confirm). The top bar's invite button opens the existing Invite players sheet. There is still no invite by email.
- D-55 (2026-09-29, owner, Q-35): Approve all runs the existing approve action one request at a time, through `useAction`. It names every request that failed and says how many were added.
- D-56 (2026-09-29, owner, Q-36): On the phone, the profile keeps the coach's note after About and drops Development counts. Export, search, the status filter, the layout toggle, the Needs-a-look chips and the Handicap and Rounds sorts stay desktop only.
- D-57 (2026-09-29, owner, Q-37): A form sparkline shows from 3 rounds, the same threshold as desktop and every other page.
- D-58 (2026-09-29, owner, Q-38): The phone's Inactive section lists `status = inactive` members, with their form as the note, and the profile adds "Inactive" to its identity line.
- D-59 (2026-09-29, owner, Q-39): The phone's Name sort is by last name, as on desktop.
- D-30 (2026-09-29, Q-5, Q-6): Qualifiers is one page for both roles. Players get a read-only list and detail of their team's qualifiers, with their own entries first, their row marked on the leaderboard, and the confirmed squad once the coach has committed it. Players get no create, edit, close, round-by-round or pick reasoning. `/my-qualifiers` renders the same list filtered to their entries, in place. Enter round waits for Round entry to be rebuilt (owner).
- D-31 (2026-09-29, Q-7): Closed means closed. Close and Reopen call `updateQualifierStatus`. The closed notice says players can't enter or submit rounds until the coach reopens it (the live `submit_round_atomic` rule), and Reopen shows on every completed qualifier. No migration (owner).
- D-32 (2026-09-29, Q-10, Q-11): Edit qualifier is built as the create form, prefilled, plus new server actions for squad size and picks and for adding or removing entrants. The selection workspace is not built, so there is no "Open selection workspace" or "Manage selections" until it is designed. The Selections card shows who is auto-qualifying now, and the confirmed squad read-only once `selection_state = 'selected'` (owner). What the workspace does: it is where a coach turns the leaderboard into the travel squad, by keeping the top finishers, choosing the coach's-pick players with a written reason, and confirming the squad so players are told.
- D-33 (2026-09-29, Q-8, Q-9, Q-12 to Q-15, Q-17 to Q-20): The recommendations in those questions are accepted as written (owner):
  - one server ranking (to par, then total strokes, then more rounds), with "Qualifying" while live;
  - spots from `selection_slots_total`;
  - a course per round with no date, and the per-round course and tee picker kept in the forms;
  - par per round from the tee or the rounds, and one par only when every round agrees;
  - round-by-round, teammates' scorecards and pick reasoning coach-only;
  - Qualifiers under Program, and Lineups hidden;
  - a static Live dot;
  - raw colours mapped to tokens, with two new ones;
  - every column fits at 924 and up;
  - the phone form keeps every web field.

  Q-16 stays open with the phone foundation (answered since: D-34).
- D-34 (2026-09-29, Q-16): On the phone, Qualifiers opens from the Rounds tab, as the boards draw it. This follows the owner's foundation decision: the design's five-tab ivory bar, which `messages-mobile` is building on its branch. The Qualifiers phone build waits for that foundation to merge (owner).
- D-35 (2026-09-29): Once Qualifiers desktop is verified, one forward-only migration closes the older database gaps the security review found. It is written and reviewed (`db-migration-reviewer`, pgTAP, `npm run test:rls` once locally) but not applied; applying it is the owner's call. It covers:
  - `coach_reasoning` becomes coach-only: table-level SELECT is revoked and a column list without it is granted back, or it moves somewhere coach-gated (revoking the one column alone does nothing);
  - the entries insert check also requires a `golf_team_members` row for that player on the qualifier's team;
  - the remove-with-round trigger becomes `SECURITY DEFINER` with a fixed `search_path`, and covers draft rounds;
  - `anon` grants on the four qualifier tables are revoked, and the helpers' `search_path` gains `pg_temp`.

  Live counts (aggregates only): of 224 qualifier rounds, none has no team, another team or another status, so the trigger gap is latent. There are 6 selection rows and none has reasoning written, so nothing has leaked (owner).
- D-36 (2026-09-29): A player seeing only their own scorecards is a screen choice, not a privacy rule. Players can read teammates' `golf_holes` through RLS, and that stays (owner).
- D-60 (2026-09-29, owner): The Foundation V2 plan (`docs/clubhouse/foundation-v2/`) is the process. Page IDs and Bridge namespaces follow the existing catalog page digits, so nothing is renumbered and D-21 stands: P001 Shell, P002 Home, P003 Roster, P004 Stats team, P005 Stats player, P006 Calendar, P007 Messages, P008 Settings, P009 Qualifiers. Existing `CH-` codes stay on elements and in tests; each gets a Bridge contract with its V2 category (01 to 25). Pages not yet designed stay unallocated.
- D-61 (2026-09-29, owner): New capabilities built on 2026-09-29 are HELD. Each refuses on the server unless Clubhouse is on for the caller and has a held feature plan in `docs/clubhouse/held/`. Done: the conversation-files action (D-48); the Qualifiers squad-size and entrant actions (D-32), gated 2026-09-29 with a test that fails without the gate (`docs/clubhouse/held/features/qualifier-squad-and-entrants.md`). D-45 and D-47 reuse existing live actions (EXISTING, not held). The D-35 migration carries the `WRITTEN — HOLD — NOT APPLIED` header and a held data plan (`docs/clubhouse/held/data/qualifier-db-hardening.md`), linked from its `HELD.md` row.
- D-62 (2026-09-29, owner): Rollout: merge the finished branches, build the V2 registry and checks, make Messages (P007) the gold-standard page, then copy it to the other pages. New designs wait until the gold standard is done.
- D-63 (2026-09-29, owner): The v2 design (the full coach and player bundle, `design/handoff/VERSIONS.md`) is committed now, and D-62's order holds: finish D-61 for Qualifiers, build the V2 registry, make Messages the gold standard and copy it to the built pages, then build v2. v1 files stay where records cite them; where v1 and v2 disagree, v2 wins unless a decision says otherwise.
- D-64 (2026-09-29, owner): Motion follows v2 (`design/handoff/README.md` "Motion", `gh-polish.css`, `gh-core.js`): press 110ms ease-out with a width-scaled shrink and a 280ms spring release, quick 180ms, base 260ms, a 520ms first-paint reveal (10px rise, 55ms stagger, at most 10 blocks), a 1.9s shared skeleton shimmer, and the ease-out, spring and in-out curves. Reduced motion removes rise, press and shimmer. Skeletons show after 150ms, stay at least 300ms and crossfade in 260ms; revisits show cached data. This supersedes the 90/150/220/360ms, single-curve, 0.985-press and no-stagger rule. The rules file, `--ch-*` motion tokens, the motion test and every built page change together in the foundation step, and the rule text changes in that same commit.
- D-65 (2026-09-29, owner): D-42 stands. Red means under par, the pin flag or a destructive action. The v2 README's "under par only" line is a leftover; the v2 phone boards still colour Leave group and Delete chat red.
- D-66 (2026-09-29, owner): Navigation follows v2 `gh-nav.js`. Coach sidebar: Home, CoachHelm, Calendar, Team Hub, Messages; Team: Roster, Stats, Qualifiers. Coach tabs: Home, CoachHelm, Calendar, Stats, More. Player sidebar: Home, CoachHelm, Team Hub; My game: Rounds; School: Classes. Player tabs: Home, CoachHelm, Rounds, Team Hub, More. The player's built Calendar, Messages, My stats and Qualifiers stay in the player sidebar and the More sheet until v2 designs them. A destination that isn't rebuilt yet shows the not-rebuilt notice, as today. This supersedes D-40's tab sets.
- D-68 (2026-09-29, owner): Bridge IDs are the page namespace, a two-digit V2 category and a two-digit item, as one decimal integer: Messages' twelfth server-error contract is `70612`, Qualifiers' is `90612`. Items run 01 to 99 per category per page, and the ID decodes from the right at any namespace width. Each Bridge record also carries its `CH-` code; the `CH-` codes stay on elements and in tests. The scaffold's one-digit item (4051) is not used.
- D-69 (2026-09-29, owner): Every page's contract is complete, with nothing left out. All 25 categories are answered, and each answer is either defined or N/A with a reason. Every page has its empty states (first-run and filtered), error toasts, failed-load messages with Try again, validation, offline and permission states, each numbered, on its element and forced by a test. `clubhouse:check` fails a page with a silent category.
- D-67 (2026-09-29, owner): After the gold standard, the v2 order is: phone versions of the built screens (Home, Calendar, Stats, Qualifiers), then player Home, Team Hub (coach and player), CoachHelm (coach and player), Classes, then Rounds (list, course picker, add a course, setup and scorecard, shot tracking, hole complete, review).

## Open owner questions

- Q-1 Roster status: decided 2026-09-29, add a separate availability field. The migration `supabase/migrations/20260929120000_golf_team_members_availability.sql` is written and stays unapplied: the owner is not applying migrations (2026-09-29). The Roster pill stays read-only.
- Q-2 Navigation: decided 2026-09-29, Practice and Events stay hidden until each has its own design.
- Q-3 Phone specs: decided 2026-09-29 (D-22). The owner's mobile designs in `design/handoff/mobile/` are the phone specs; the drafts in `docs/clubhouse/phone/` only matter for pages without one, and still need approval.
- Q-4 Rollout: decided 2026-09-29, the flag stays off in production; the owner does a live pass on a Vercel preview with real coach and player accounts first.
- Q-30 Roster phone, where Roster lives: answered 2026-09-29 (D-50). Roster lives under More, per the foundation decision (D-40 onward).
- Q-31 Roster phone, fields with no column: answered 2026-09-29 (D-51). Real fields only, no migration, and birthday is never collected.
- Q-32 Roster phone, Plan 1:1: answered 2026-09-29 (D-52). It opens the Calendar new-event editor with that player invited, via `?new=1&with=<playerId>`.
- Q-33 Roster phone, "All N" rounds: answered 2026-09-29 (D-53). It opens Stats on the Rounds tab for the season.
- Q-34 Roster phone, ⋯ and invite targets: answered 2026-09-29 (D-54). ⋯ opens an action sheet, and invite opens the existing Invite players sheet.
- Q-35 Roster phone, Approve all: answered 2026-09-29 (D-55). It loops the existing approve action, names every failure and counts the successes.
- Q-36 Roster phone, desktop-only features: answered 2026-09-29 (D-56). The coach's note stays on the phone, and the rest stays on desktop.
- Q-37 Roster phone, sparkline threshold: answered 2026-09-29 (D-57). 3 rounds.
- Q-38 Roster phone, Inactive: answered 2026-09-29 (D-58). Inactive is labelled on the phone.
- Q-39 Roster phone, name sort: answered 2026-09-29 (D-59). By last name.

From the owner's phone shell and Messages design (2026-09-29; `phone/foundation.md`, `phone/messages.md`). All answered by the owner on 2026-09-29, each by accepting or refining the recommendation; the answer is the decision named.

- Q-40 answered 2026-09-29 (D-40). Phone tab contents. The design has Home, Helm, Rounds, Stats and More, with no player set; D-3 as built has coach Home, Calendar, Messages, Roster, More and player Home, Calendar, Messages, My stats, More. Recommended: the design's five as the coach target, with Helm and Rounds each taking a rebuilt screen's place until they are rebuilt, and the player keeping today's set until the player app is designed. Trade-off: for a while the coach bar isn't the drawing. The alternative, the drawing now, puts two "not rebuilt" tabs in the bar.
- Q-41 answered 2026-09-29 (D-40). Tab bar style. The design is an ivory glass bar with the active tab in green and a green badge; D-3 is a green bar with the ivory pass. Recommended: the design, which supersedes D-3's style. Trade-off: the built `.ch-tabbar` is restyled, and the phone loses the green frame.
- Q-42 answered 2026-09-29 (D-40). Messages under More. Recommended: as drawn, with the unread badge rolled up onto More and shown on the Messages row. Trade-off: Messages, the screen players use most, is one tap deeper.
- Q-43 answered 2026-09-29 (D-41). More as a screen, and Settings. "‹ More" makes More a pushed stack, not today's sheet (CH-1802), but it isn't drawn (`m.css` has `.m-me` and `.m-more` only), and the phone top bar has no Settings gear. Recommended: ask for a More board; until then keep the sheet, and put Settings in it. Trade-off: the Inbox's "‹ More" back link has nothing to go back to until More exists.
- Q-44 answered 2026-09-29 (D-43). The Safari bar. Recommended: drop it (it is browser chrome) and pad the tab bar, composers and sheet footers by the home-indicator inset (capture 90). Trade-off: none in the app.
- Q-45 answered 2026-09-29 (D-43). Phone avatars. The design uses one neutral (#E9E3D3 on #5A4E36); Clubhouse coins have five tones. Recommended: the single neutral on the phone only, with the two colours added to the design system as tokens. Trade-off: a player's coin looks different on phone and desktop.
- Q-46 answered 2026-09-29 (D-42). Red for destructive actions. The design colours Leave group and Delete conversation `--ch-danger-600`, the under-par red. Recommended: allow red for destructive actions, as desktop's danger buttons already do, and write that exception into the doctrine. Trade-off: red is no longer exclusive to scoring.
- Q-47 answered 2026-09-29 (D-43). Pull to refresh and the push soft ask. Neither is drawn. Recommended: both keep waiting. Trade-off: none for Messages, whose list is realtime.
- Q-48 answered 2026-09-29 (D-44). Announcements (D-16) are not in the phone design: not in the Inbox and not in New message. Recommended: keep them. Announcements go above Today, the announcement pane opens as a pushed screen, and coaches get an Announcement choice in New message. Trade-off: the phone gains UI nobody drew. Dropping them leaves players unable to acknowledge on the phone.
- Q-49 answered 2026-09-29 (D-45). Naming a new group. The design says "You can name it after sending", but no rename action exists and broadcasts need a title. Recommended: ask for the name before creating (CH-7104) until a rename action exists. Trade-off: a field that isn't drawn.
- Q-50 answered 2026-09-29 (D-45). Coaches in a new group. The design lets a coach add the assistant coach, but `createGolfTeamBroadcast` adds players only. Recommended: create the group, then add the chosen coaches with `addGolfGroupMember`, in one flow using existing actions. Trade-off: two writes, and a new "group created, coach not added" state.
- Q-51 answered 2026-09-29 (D-45). Quick groups. Recommended: Whole team (all players, plus coaches if Q-50 says yes) and Seniors (from `graduation_year`); hide the travel squad until you choose its source (the next competition's invitees, or the itinerary's room list). Trade-off: one of the three drawn rows is missing.
- Q-52 answered 2026-09-29 (D-46). The unread chip's count. The design adds up messages (4); desktop counts conversations (2). Recommended: conversations, the thing the chip filters. Trade-off: the number differs from the drawing.
- Q-53 answered 2026-09-29 (D-48). Call. Recommended: hide it. Phone numbers aren't loaded, players' numbers are minors' PII, and a call means nothing in a group. Trade-off: a drawn tile is missing.
- Q-54 answered 2026-09-29 (D-47). Schedule. Recommended: for coaches, open the Calendar editor (`?new=1`) without invitees, since no prefill exists; hide it for players. Trade-off: the coach picks the people again.
- Q-55 answered 2026-09-29 (D-48). Search inside a thread. Recommended: hide it until `searchGolfMessages` takes a conversation (a change to the action; no migration). Trade-off: search stays team-wide, in the Inbox.
- Q-56 answered 2026-09-29 (D-47). Mute. The design has one switch; desktop offers 8 hours, a week, or until turned back on. Recommended: the switch and the tile mean "until I turn it back on". Trade-off: timed mutes are desktop-only.
- Q-57 answered 2026-09-29 (D-48). Pinned. Recommended: hide it until a pin action exists, plus a migration so coaches can pin other people's messages (the update policy is sender-only). Trade-off: a drawn panel is missing.
- Q-58 answered 2026-09-29 (D-48). Files list. Recommended: write a read-only action for a conversation's files (RLS already allows it; no migration), so Files ships with the phone. Trade-off: a new server surface to build and review. The alternative is to hide it.
- Q-59 answered 2026-09-29 (D-48). "Only coaches can post". Recommended: hide it, and write no migration unless you want the feature. Trade-off: a drawn switch is missing.
- Q-60 answered 2026-09-29 (D-48). Edit group. Recommended: hide it until what Edit covers is drawn and a rename action exists. Trade-off: a drawn button is missing.
- Q-61 answered 2026-09-29 (D-47). Add member. Recommended: wire the existing `getGolfGroupAddCandidates` and `addGolfGroupMember` for the group's creator, on desktop too, because the component is shared. Trade-off: desktop gains a control its handoff doesn't show.
- Q-62 answered 2026-09-29 (D-47). Leave group for the group's creator. The design shows it; desktop hides it. Recommended: keep the desktop rule, because nobody else could manage the group. Trade-off: differs from the drawing.
- Q-63 answered 2026-09-29 (D-48). Delete conversation. Recommended: hide it. There is no delete policy and no defined meaning (for you only, or for both). Trade-off: a drawn row is missing.
- Q-64 answered 2026-09-29 (D-49). Design details with no backend. Recommended: leave out the event card in a thread (no writer, and 0 such rows); show every group with the people mark (no group type); keep the six stored reactions (no check); mark only the creator as "Admin"; keep desktop's View stats for coaches in a player's direct details, which the design leaves out; keep the drawn message icon on the other person in a direct thread's Details, where a tap goes back to that thread. Trade-off: small differences from the drawing.

Qualifiers (design `Qualifiers.html` and `Qualifiers Mobile.html`, dropped in 2026-09-29; map in `screens/qualifiers.md`). The owner answered every question on 2026-09-29; Q-16 last, with the phone foundation (D-30 to D-33). Each still shows the options as they were put.

- Q-5 (answered 2026-09-29, D-30) Player view (the design is coach-only):
  - Recommended: one page for both roles, like Calendar, built from the design system and reviewed by the owner, like Settings (D-18).
    - Players see the team's qualifiers, their own first, with their position, rounds and to-par.
    - The detail is read-only: facts, leaderboard with cut lines and their own row marked, course per round, scoring rules, and the confirmed squad once `selection_state = 'selected'`.
    - No Create, Edit, Close, selections, round-by-round or pick reasoning.
    - `/my-qualifiers` opens the same list filtered to their entries, rendered in place (D-23).
  - Trade-off: the player marks (the "You" row, their standing) are not drawn.
  - Alternative: coaches first, and players wait for a player design.
- Q-6 (answered 2026-09-29, D-30) The player's main action, entering a qualifier round (`/rounds/new?qualifier=`), isn't rebuilt, and `rebuiltHref` would hide it. With the flag on, `/rounds/new` already shows the not-rebuilt notice (`NotRebuilt`, CH-1301, a link back to Home), so today's flag-on players can't enter a round anywhere in Clubhouse.
  - Recommended: ship the read-only player view (Q-5) with the coach page, and add Enter round when Round entry is rebuilt.
  - Trade-off: players see their standing but enter rounds only with the flag off until then. That is no worse than the notice they get now.
  - Alternative: hold the player view until Round entry is rebuilt. Round entry has no design yet, so players would have no Qualifiers in Clubhouse until one is designed and built.
- Q-7 (answered 2026-09-29, D-31) Close and Reopen map to `updateQualifierStatus` (`completed`, `in_progress`). The design's closed notice says "Rounds already started can still be submitted". Live `submit_round_atomic` refuses every round linked to a completed qualifier, including a started one. The `golf.ts` comment says that refusal was removed on 2026-08-31; the feature doc says it stays.
  - Recommended: the copy follows the live rule: "Players can't enter or submit rounds until you reopen it."
  - Also recommended: Reopen shows on every completed qualifier. The design has it only right after a close; the feature doc requires a way back.
  - Trade-off: if started rounds should still submit after a close, that is a migration to write (unapplied) changing the RPC guard.
- Q-8 (answered 2026-09-29, D-33) Ranking, which disagrees in four places:
  - the design's code: rounds played, then to-par, then last round;
  - the design's caption: to-par, then fewer rounds pending;
  - `getQualifierLeaderboard`: to-par, then total strokes, then more rounds;
  - the workspace loader: entry aggregates; the RPC `get_qualifier_leaderboard`: gross total.
  - Recommended: one server ranking, the live action's. The leaderboard, cut lines, "Auto-qualifying now" and the workspace all use it, and the caption says exactly that. While a qualifier is live, "Locked" becomes "Qualifying", because nothing is locked before the last round. The "final-round scorecard playoff" stays rules text; it is not computed.
  - Trade-off: different from the drawn order and label.
- Q-9 (answered 2026-09-29, D-33) Spots: two columns hold it. `selection_slots_total` is what the create form writes and the workspace uses. Legacy `spots_available` is set on 8 of 18 live qualifiers and differs on 1.
  - Recommended: show `selection_slots_total` everywhere.
  - Trade-off: that one qualifier shows a different number from the old page.
- Q-10 (answered 2026-09-29, D-32) Selection workspace: "Open selection workspace" and "Manage selections" lead to an undrawn screen. Today it is the Fairway `/coachhelm/qualifying/[id]`, and its four actions exist (open → scoring → closed → selected, coach picks need reasoning).
  - Recommended: build it in Clubhouse from the design system, as the Selections card grown into a panel: advance state, pick, reasoning, confirm. It needs an owner review.
  - Trade-off: an undrawn surface.
  - Alternative: hide the button until a design exists. Coaches then can't commit a squad in Clubhouse.
- Q-11 (answered 2026-09-29, D-32) Edit qualifier is not drawn (the prototype only toasts).
  - Recommended: the create form, prefilled, at `/qualifiers/[id]/edit`, over `updateGolfQualifierDetails` and `setQualifierRoundCourses`.
  - Also recommended: new server actions to change squad size and picks, and to add or remove entrants. RLS already allows both; no migration is needed.
  - Trade-off: two new actions to write and review.
- Q-12 (answered 2026-09-29, D-33) Course and date per round: the detail draws a course and a date for each round. `golf_qualifier_round_courses` has course and tee but no date, and only 7 of 18 live qualifiers have rows. The design's create form has one free-text course.
  - Recommended: show a round's course when set, else the qualifier's, with no per-round date. The create and edit forms keep today's per-round course and tee picker, which gives the par and the round setup defaults.
  - Trade-off: a field the design doesn't draw.
  - Alternative: a migration adding a round date (written, unapplied).
- Q-13 (answered 2026-09-29, D-33) Par ("Par 72"): the qualifier has no par, and `course_id` is null on all 18.
  - Recommended: par per round from the assigned tee's `total_par` (all 22 round-course rows have one), else from submitted rounds (`total_score − score_to_par`). Show one par only when every round agrees, else "—".
  - Trade-off: 7 live qualifiers mix pars and will show no single par.
- Q-14 (answered 2026-09-29, D-33) Player visibility: RLS lets active players read teammates' rounds and holes, and `coach_reasoning` once selected. Today's UI shows players neither round-by-round nor selections.
  - Recommended: keep round-by-round, teammates' scorecards and the pick reasoning coach-only (the stricter rule wins, as in D-10). Players see totals, their own scorecards and, per Q-5, the confirmed squad without reasoning.
  - Trade-off: tightening RLS to match would be a separate migration.
- Q-15 (answered 2026-09-29, D-33) Navigation: the design's sidebar has Lineups under Team and Qualifiers under Program (medal icon). Clubhouse today points Lineups at `/qualifiers`.
  - Recommended: add Qualifiers under Program once it's rebuilt, and hide Lineups until it has its own design (as Q-2).
  - Trade-off: coaches lose the Lineups label they use now.
  - Player navigation gets Qualifiers only with Q-5 and Q-6.
- Q-16 (answered 2026-09-29, D-34) Phone home for Qualifiers: the tab bar, top bar, More and sheets belong to the foundation spec (owned by `messages-mobile`, from the owner's `m-shell.jsx` and `m.css`); `qual-mobile.jsx` carries an older copy of that shell. The page-level question is which tab owns Qualifiers. The boards mark Rounds active.
  - Recommended: Qualifiers sits under the Rounds tab, as drawn, once the foundation's tab set is approved.
  - Trade-off: it depends on the foundation keeping a Rounds tab.
  - Alternative: Qualifiers is reached from More.
- Q-17 (answered 2026-09-29, D-33) Live pulse: `.qf-pulse` runs a 1.6s infinite pulse on "Live". The doctrine allows 90, 150, 220 and 360ms, and cause and effect only.
  - Recommended: a static dot.
  - Trade-off: a quieter live cue.
  - Alternative: one 360ms pulse when a realtime update lands.
- Q-18 (answered 2026-09-29, D-33) Raw colours need `--ch-*` tokens:
  - `#EDF4EF` (pressed pill, opened row) → `--ch-bg-selected` (#EEF5F0, one step off);
  - `#F5F9F6` (opened-row tray) → a new `--ch-green-25`;
  - `#EFE6D2` with its `rgb(110 84 36 / .14)` ring (one-round box) → a new `--ch-champagne-100`, or `--ch-warning-100`;
  - `rgb(21 90 57 / .28 and .4)` (pill ring, cut line) → green-600 alpha tokens;
  - `rgb(28 25 18 / .07)` → `--ch-border-hairline`.
  - Recommended: map to existing tokens where they are within a step, and add the two new ones through `design/handoff/design-system/`.
  - Trade-off: a design-system change.
- Q-19 (answered 2026-09-29, D-33) Fit at 1280 and 924: the drawn leaderboard (720px minimum) and round-by-round tables scroll inside their panels. That hides Status, the chevron, Total and To par at both widths, and the Dates fact truncates ("Sep 22 – Oc…").
  - Recommended: fit every column without horizontal scroll at 924 and up (narrower columns; Avg moves into the opened row) and let the Dates fact wrap.
  - Trade-off: the geometry departs from the drawn reference.
- Q-20 (answered 2026-09-29, D-33) Phone gaps:
  - The form has no scoring rules field, help text or error states, although the board says "Same fields as the web form".
  - The detail has no Close or Reopen, no round-by-round, and no confirmed squad or reasoning.
  - Recommended: the phone form keeps every web field and its inline errors. Close and Reopen sit behind Edit as a sheet action. Round-by-round stays desktop-only, because the player sheet covers per-round scores. The completed detail adds the confirmed squad above the leaderboard.
  - Trade-off: additions not drawn on the phone boards.

## Data gaps (shown honestly, never invented)

- Home: the prototype's weather and "Week 7 of 12" have no source (golf teams have no season start or end dates). They are omitted until one exists.
- Home: the prototype's "Open recap" needs a single-round screen, which isn't rebuilt. The link opens the player's stats and says so.
- Shell: the top-bar search (⌘K) needs its own spec. It is not rendered until then, so there is no dead control.
- Shell: Practice and Events are in the design's navigation but have no route. They are hidden until the owner decides what they point to.
- Roster: the design's Captain role, major, birthday, home course and "about" line have no columns. Real fields are shown instead: hometown, high school, class and jersey. A migration for captain, major and bio can be written once you decide which you want (birthdays are minors' PII).
- Roster: owner, 2026-09-29: cards show no jersey number (the handoff has none; Captain waits for a column); the layout toggle and the panel order follow the handoff (the panel sits after the cards when there is no room beside them).
- Roster: invite-by-email has no server action. The invite sheet offers the join code, a copy button and the native share sheet for the join link.
- Roster: "Schedule 1:1" and "View insights" wait for Calendar and CoachHelm. They are hidden until then.
- Roster (phone), 2026-09-29, owner design `Roster Mobile.html`. The owner answered Q-30 to Q-39 (D-50 to D-59).
  - The design's Captain chip, major, About prose, home course and birthday have no columns, and none is added (D-51). Birthday is minors' PII. The profile shows hometown, high school, class, jersey when set, and member since.
  - Live data: no member has a jersey number, 12 of 106 players have a high school, and 90 have a hometown.
  - The inactive row note ("Medical · wrist") needs the unapplied Q-1 availability migration.
  - Plan 1:1: the Calendar editor couldn't be seeded with a single invitee, and a new event invited every player. It gains `with=<playerId>` (D-52).
  - "All N" rounds: the player's Stats Rounds tab couldn't be opened from the URL. StatsPlayer gains `tab=rounds`, and `window=season` matches Roster's count (D-53).
  - "Approve all" has no bulk action. It loops the existing one (D-55; live: 0 pending requests on any team).
  - Invite by email still has no action. The ⋯ menu's contents aren't drawn.
  - The join code is drawn in tracked mono. It maps to the desktop treatment (Instrument Sans).
  - Sparkline threshold: 3 rounds, as on every page (D-57).

- Stats (player), 2026-09-29 fidelity: the strokes gained by leg chart is the design system's StrokesGainedRoute (it had been bars), the Rounds count is the design system's tab pill, and a coach reads "Stats › name" in the top bar. The scoring chart's "Season best" marker and "Par 72" meta wait for season-best and course-par data per window.
- Stats: the prototype's PredictionCard, "vs tour" figures and D1 benchmarks for fairways and putts per round have no source. They are omitted, and D1 shows only where `golf_pga_standards` has the metric.
- Calendar: "Print week" and "Duplicate" are not built. "Checked" in Sources is the time the server read the data.

- Settings: theme (light, dark, system), display density, date format, score display and distance units aren't shown; Clubhouse doesn't honour them yet (light only until the dark theme). The current app's controls keep working with the flag off.
- Settings: the comparison weights stay hidden, as in the current app.
- Messages: threaded replies and a shared-files list in details have no backend. They are not shown.
- Messages: the thread header's search icon is not built; message search is team-wide (`searchGolfMessages` takes no conversation) and lives in the rail. The typing indicator shows an avatar in direct threads only, because the realtime hook reports that someone is typing, not who.
- Stats (team), 2026-09-29 fidelity: the strokes gained subtitle says "weekly average · dashed line is the Tour baseline", not the handoff's "vs. D1 · rolling 3-round average", because the stored strokes gained is measured against a tour baseline and the chart is a weekly mean. The leg cards say "across the window", not "since August", because Last 10 isn't the season. The putting rings use the D1 seed's bands (0–3, 3–5, 5–10, 10–15, 15–25 ft), not the handoff's 3–6, 6–10, 10–20 and 20+; 25+ ft putts aren't drawn and aren't counted in the meta. The Scoring lens has no "Season best" marker, because the chart shows at most the last ten weeks. A player's row counts their rounds in the window, not the season. The figure cards show D1 only for greens: overall scrambling and birdies per round have no D1 metric either (`golf_pga_standards` has scrambling only by lie).
- Messages (phone design, 2026-09-29): checked against the code and production. Only SELECT statements were run, and only aggregates were read: no names and no message text. Every production message is `kind = 'text'` (215); none is pinned, none replies to another, and none has a payload. There are 13 attachments and 0 poll or RSVP responses. The design's items without a backend are these, each waiting on the question named:
  - Call: phone numbers aren't loaded and are minors' PII (Q-53).
  - Pinned: the columns exist but nothing writes them, and the update policy is sender-only (Q-57).
  - The Files list: needs a conversation-level read (Q-58).
  - Search inside a thread: the action is team-wide and capped at 50 results (Q-55).
  - "Only coaches can post": no column or policy (Q-59).
  - Edit group, and naming a group after sending: no rename action (Q-60, Q-49).
  - Delete conversation: no delete policy on `golf_conversations` (Q-63).
  - The event card in a thread: no writer (Q-64).
  - A group icon by type: no column (Q-64).
  - The check reaction: not one of the six stored reactions (Q-64).
  - The travel squad: no membership source (Q-51).
  - Assistant coaches in a new group: broadcasts add players only (Q-50).
  - "Admin" on a coach who didn't create the group (Q-64).
  - Schedule: can't prefill invitees (Q-54).

  Add member has existing actions that desktop doesn't use yet (Q-61).
- Phone shell (2026-09-29): `m.css` styles a More screen (`.m-me`, `.m-more`) that no board draws (Q-43). The design has no player tab bar (Q-40). The top-bar glass `rgb(247 245 239 / .9)` and the phone avatar colours have no `--ch-*` token yet; they go into the design system first (Q-45).
- 2026-09-29 (owner): After Clubhouse: forward-only migration to revoke `anon` grants on `golf_message_attachments` and exclude deleted messages from the attachment SELECT policy (security review of D-48). Not applied; the owner decides on apply.

- Qualifiers (live counts, 2026-09-29):
  - No per-round date column exists (Q-12).
  - No qualifier par exists (Q-13).
  - Of 215 completed qualifier rounds, 19 aren't 18 holes. Proposed: Avg is shown only over 18-hole rounds, and says so when some are excluded.
  - 14 rounds have no hole rows and 33 have fewer than 18 scored. Proposed: the scorecard says there's no hole-by-hole card instead of drawing blanks.
  - The entry deadline is metadata and never enforced. Proposed: the form's help text ("When players must confirm in") becomes "Shown to players; entry stays open until you close it".
  - "Selection opens once the first round is submitted" is not automatic. `selection_state` moves only when the coach advances it (13 of 18 live qualifiers are still `open`).

## Verification log

<!-- Append: date, screen, gate, what ran, result. -->
- 2026-09-29 · Stats (team, player) · desktop, wired: typecheck 0, eslint 0 errors, clubhouse:check clean, vitest 16/16. Preview at 924, 1280 and 1400px against stats-team-01..05 and stats-player-01..14; states empty, loading, early, self. No console errors.
- 2026-09-29 · Calendar · desktop, wired: typecheck 0, eslint 0 errors, clubhouse:check clean, vitest 21/21. Preview at 924, 1280 and 1400px against calendar-01..12 (week, day, month, agenda, event, overlap, attendance, editor); player view; states failed, partial, loading. No console errors.
- 2026-09-29 · Messages · desktop: typecheck 0, eslint 0 errors, clubhouse:check clean, vitest 21/21. Preview at 924, 1280 and 1400px against messages-01..04 (team thread, direct, group details, new group validation); send, react, edit, delete and attachments driven through the preview; states empty, failed. No console errors.
- 2026-09-29 · Fidelity pass (Home, Stats team, Calendar, Messages, shell) · desktop: rendered each handoff prototype and our preview side by side at 1280px and fixed what differed. Home subline, Message team and New event, agenda invitee details, "First tee 8:42 · 5 of 6 confirmed", "No rounds 9 days", the Full roster arrow and the stats link; the notifications bell; the sidebar readiness bar; team putting rings at the handoff's size; Longest putt made; Calendar "Checked"; the Messages typing avatar. typecheck 0, vitest logic 32/32, preview states bell empty, failed and filter. No console errors.
- 2026-09-29 · Settings · desktop: built from the design system at 1280px (coach: account, notifications, team, CoachHelm, preferences; player: account, golf profile, notifications); preview states player, noteam, failed, partial, assistant, failwrites, loading. Fixed a live bug found on the way: `push_announcements` was stripped on save and read as off (test added). typecheck 0.
- 2026-09-29 · Settings and shell · catalog: 76 Settings and 14 shell tests, each named by its number; clubhouse:check enforces the catalog. Found and fixed on the way: every Clubhouse toast rendered outside the Clubhouse root and so had no background; the browser's own email bubble covered ours; the photo coin lost its initials while the name was empty.
- 2026-09-29 · Roster · phone-spec, still `doing`: `phone/roster.md` rewritten from the owner's design. The three boards were rendered at 390 × 844, and 14 states were captured (sorts, inactive, long names, sheet with two and five requests, profile top and About, captain, early read, inactive). The current preview was captured at 390px (default, player open, invite, list, empty, failed, partial, loading). The gate stays `doing` because Q-31 to Q-39 are open and the decided foundation (D-40 onward) isn't on this branch yet. Later the same day, the spec was updated with the owner's foundation answers: five coach tabs with Roster under More, More still a sheet, red for destructive actions, no Safari bar, neutral phone avatars, and pull to refresh waiting for a design.
- 2026-09-29 · Roster · phone-spec, done: the owner answered Q-30 to Q-39 (D-50 to D-59), and the foundation is decided (D-40 onward). Every phone-spec box in `screens/roster.md` is checked. clubhouse:check is clean.
- 2026-09-29 · Roster · phone build, the parts that don't depend on the shell (the `phone` gate stays `todo` until the foundation lands and a device pass is done). Built: RosterPhone, RosterPhoneRow and RosterProfile (`useChPhone`, `?player=` in the URL), the phone skeleton, the Calendar 1:1 seed (D-52), the Stats `tab` parameter (D-53), and the Approve all loop (D-55, CH-3007). CH-3806 is catalogued. typecheck 0; eslint 0 on the changed files; `npx vitest run src/clubhouse` 295/295; clubhouse:check clean. `clubhouse:a11y` on :3106 is clean for roster (14 pages at 1280 and 390, including the phone profile and its menu), calendar (20; the known 390px week target-size remains) and stats-player (14). Preview at 390 × 844 compared with the design captures: list, inactive, SG sort, profile, About, early read, inactive profile, loading and failed. No console errors.
- 2026-09-29 · Roster · phone build on the foundation, after merging `agent/clubhouse-messages-mobile`. The interim pieces are gone. What's built: PhoneTop (‹ More, invite action); the pushed profile as a PhoneScreen and PhoneBar with usePhoneStackHistory; the join requests banner and a Modal sheet (Approve all, CH-3403 catalogued); and the ⋯ action sheet on Modal (View stats, Remove from team behind CH-3501). Join requests gain structured class, year and age fields. Checks: typecheck:fast 0; eslint 0; test:file roster 37/37; clubhouse:check clean. Browser and a11y are not run, waiting for a server slot.
- 2026-09-29 · Roster · phone, browser pass on :3106 (one server slot). The preview at 390 × 844 was captured and compared with the design boards: list, inactive, SG sort, requests sheet, profile, About, ⋯ sheet, early read, inactive profile, invite and loading. Back pops the pushed profile, and there are no console errors. `clubhouse:a11y roster` exit 0 (15 pages, 1280 and 390). The phone gate is `doing`: 430px, drag to dismiss (not in `ui/Modal`), toasts over content, and the device pass are still open.
- 2026-09-29 · Roster · final tracker pass (docs only; no servers, builds or scans). Gate cells match the evidence: phone-spec done, phone doing. The desktop gates are unchanged. The phone boxes in `screens/roster.md` and the open list in `phone/roster.md` name each owner: 430px and toasts, merge pass; drag to dismiss, foundation (b4b1b6a6b, arrives on merge); iPhone pass, owner; pull to refresh, design. The catalog (CH-3007, CH-3403, CH-3806 used and tested) and `SCREENS.md` (Roster ticked for coaches) match. clubhouse:check clean.
- 2026-09-29 · Stats (team) · old link: `/stats/team` opens the rebuilt Team stats for coaches. Compared the design project's `Stats.html`, `stats.jsx`, `stats.css`, `cal.css`, `depth.css`, `sidebar.css` and the colour and elevation tokens with `design/handoff/`: identical apart from the Qualifiers nav item (not built, owner). 
- 2026-09-29 · Stats (team) · fidelity, states, error-tracking, motion, accessibility, performance: the handoff prototype and our preview rendered and measured box by box at 924 and 1280px against stats-team-01..05. Fixed: the trend note and putting note margins (the base reset won), the players column (150px) and Team row, the leg cards' area fill and range, the putting rings (the design system's geometry, shaded by make rate, 360px, 12px labels, the page's depth), the grid subtitle's window, whole-stroke scores in the Scoring lens, heading colour. Built: the window switch offline (CH-4901) and slow (CH-4902); no benchmark for an unknown tour (CH-4210); one round-cache read instead of two, with id chunks in parallel; a Suspense inside each section, because a crash on the server render failed the whole page. typecheck 0, eslint 0 errors, vitest src/clubhouse 286/286, clubhouse:check 0, clubhouse:a11y 0 (105 pages), build 0. Then the route skeleton was sized to the loaded page: header, first card and trend card land in place at 924 to 1600px; the trend card had dropped 40px at 1280. A server-render crash test was added. vitest 287/287, typecheck 0, eslint 0, clubhouse:check 0, clubhouse:a11y stats 26 pages 0. The design project was not compared (DesignSync unavailable in that session).
- 2026-09-29 · Shell (every page) · error-tracking, D-24: the Suspense moved into `SectionBoundary` and the local Stats wrapper was removed. Two server-render tests (the primitive, and Team stats with five crashing sections) fail without it. Every preview (home, roster, stats, player, calendar, calendar-player, messages, messages-player, settings) was rendered before and after at 1280px: pixel-identical apart from the Messages typing dots mid-animation, with no console errors or hydration warnings. `stats?state=crash` went from 500 to 200 with all five notices. vitest src/clubhouse 288/288, typecheck 0, eslint 0, clubhouse:a11y 0 (105 pages).
- 2026-09-29 · Stats (team) · performance, motion: `StatsTeam` split into server sections (figures, putting, bests) and client islands (`StatsTeamIslands`: switch, Export, Try again, trend, legs, grid); the shell's motion features load lazily (D-25). Team client code 17.7 → 11.8 KB minified (esbuild, shared modules external). The production build's route client chunks went 2963.8 → 2958.6 KB (885.7 → 884.2 KB gzip). The Season bests copy and the putting rings are in no client chunk. The dev RSC payload for the preview grew 31 → 48 KB, because server sections are sent as markup, plus dev debug info; production can't be measured here (the preview 404s there). Parity: 26 Stats captures and 10 page captures, pre-split vs split, pixel-identical apart from the shimmer and typing-dot phases. CH-4901/4902, keyboard path and crash state re-run the same. Reduced motion is honoured by the app-wide rule (globals.css:2664) plus the shell's `data-motion` for the Settings switch. vitest src/clubhouse 288/288, typecheck 0, eslint 0, clubhouse:check 0, clubhouse:a11y 0 (105 pages), build 0.
- 2026-09-29 · Stats (team) · spec: the lead compared the design project through DesignSync. `Stats.html` matches `design/handoff/` apart from the Qualifiers nav item (not built, D-23); `stats.jsx`, `stats-sg.jsx`, `stats.css`, `cal.css`, `depth.css`, `sidebar.css` and the colour, elevation, typography, spacing and base tokens match. Later the same day the lead compared the rest: `styles.css`, `tokens/fonts.css`, `components/components.css` and `_ds_bundle.js` are byte-identical, and `stats-game.jsx`, `stats-game.css` and `stats-sheet.jsx` (player views) match by distinctive-line checks. Not compared: `roster-data.js` and `msg.css` (not used by Stats).
- 2026-09-29 · Stats (team) · spec: the design project, compared by the lead via DesignSync (88af5e29), 2026-09-29. Byte-identical to `design/handoff/`: `_ds/.../styles.css`, `tokens/fonts.css`, `components/components.css` (and its `design-system/` copy), `_ds_bundle.js`. By distinctive lines: `stats-game.jsx`, `stats-game.css`, `stats-sheet.jsx`. Earlier: `Stats.html` (apart from the Qualifiers nav item), `stats.jsx`, `stats-sg.jsx`, `stats.css`, `cal.css`, `depth.css`, `sidebar.css`, `roster.css`, and the colour, elevation, typography, spacing and base tokens. Not compared: `msg.css` (Stats doesn't load it). The player views can treat `stats-game` and `stats-sheet` as current.
- 2026-09-29 · Stats (team) · tracker pass (docs only, no servers): the row matches the checklist: spec, desktop, wired, states, error-tracking, motion, accessibility and performance are done; phone-spec, phone and verified are open. Each open box names its owner: phone design, owner, or the merge pass. The motion and islands evidence now cite `domMax` (314b03055) and D-26/D-27 (929e6681d). The catalog matches the code after the split, and `SCREENS.md` has Team stats and its old link ticked. clubhouse:check 0.
- 2026-09-29 · Foundation, Messages · phone-spec: the owner's `Messages Mobile.html` was served over http and every board and state was rendered at 390 × 844 @2x (`messages-00..22`, plus `messages-90`, derived without the Safari bar). This was redone after ccbd33465 changed the avatars. The preview was captured at 390px for coach and player (`messages-preview-*`) on a dev server on :3104, stopped afterwards. No page errors. Wrote `phone/foundation.md` and `phone/messages.md` as approved specs. The gate stays `doing` until Q-40 to Q-64 are answered.
- 2026-09-29 · Foundation, Messages · phone-spec done: the owner answered Q-40 to Q-64 (D-40 to D-49). The specs cite the decisions, each checklist's third box is ticked, and the doctrine now allows red for destructive actions (D-42). `clubhouse:check` exit 0.
- 2026-09-29 · Foundation, Messages · phone built (doing): the phone shell (D-40 to D-43) and Messages as a pushed stack (D-44 to D-49), with `getGolfConversationFiles` (participant check, RLS client, metadata only; security review found no Critical or High issue; its finding in this change, deleted files taking slots under the cap, is fixed; two pre-existing ones stay open: `getGolfMessageAttachments` returns storage paths and signed URLs for files on deleted messages, and `anon` holds table grants on `golf_message_attachments`). typecheck 0, eslint 0 errors, `npx vitest run src/clubhouse` 295/295 exit 0, the files action test 5/5, `clubhouse:check` 0, `clubhouse:a11y` on :3104 exit 0 (111 pages, the two known Calendar findings), `npm run build` 0. Left open: sheets don't drag to dismiss yet (a `Modal` gap) and the Bell is a popover on the phone; not yet checked on a real iPhone through `npm run ios:dev`.
- 2026-09-29 · Foundation · phone: sheets follow the finger and drag shut (CH-1611, `useSheetDrag`; the More sheet's framer drag had never run under `domAnimation`), spring back in 360ms, and don't drag with reduced motion; the bell is a modal sheet on the phone (CH-1811, CH-1612). typecheck:fast 0, `test:file` shell 33/33, `clubhouse:check` 0, `clubhouse:a11y shell` 0 (5 pages) and `shell messages` 0 (29 pages) on :3104, then stopped. Four of five phone boxes ticked; left: the check on a real iPhone through `npm run ios:dev`.
- 2026-09-29 · Foundation, Messages · tracker pass (docs only, no servers): the phone specs carry a build status, every open box names who owns it (the owner: the real-iPhone check and review; the merge pass: e2e, build, full suite, performance, live forced failures; the next agent slot: reduced motion and a keyboard walk), the phone-only states list their catalog numbers, and the shell catalog notes the bell sheet in the scan. Gate cells unchanged: both `phone` gates stay doing with one open box each. `clubhouse:check` exit 0.
- 2026-09-29 · Foundation, Messages · docs completed (no servers): the Foundation checklist went from 43 open boxes to 15, each tick citing a test, a catalog number, a file or a check, and each open box naming its owner (the owner: iPhone check, review, voice, mark-one-read failures; the merge pass: lazy motion, layout shift, live Sentry, a real-account browser pass; the next agent: desktop side by side, narrow-canvas measure, loader label test, section boundaries on the shell, press on the sheet Close coins, a keyboard walk). Messages: 8 open, each owned. `verified` moved to doing on both rows (the first box has its exit codes). `team-communications.md`: 20260907160000 is applied (read-only check of `schema_migrations`, `pg_proc` and `pg_policies`), `golf_user_on_conversation_team` left the drift exemption, and the D-45 and D-47 contracts, the files action and the queued attachment migration are recorded.
- 2026-09-29 · Messages · Foundation V2 classification (D-61): D-45 and D-47 are EXISTING (UI reuse of `createGolfTeamBroadcast`, `addGolfGroupMember` and `getGolfGroupAddCandidates`, unchanged since 79f6e1a07 and already used by Fairway; their policies are live). D-48 is HELD-FEATURE: `getGolfConversationFiles` returns "Not available" unless `isClubhouseFor(role)`, tested; plan `held/features/conversation-files.md`. The attachment fix is `held/data/message-attachments-hardening.md`, SQL NOT WRITTEN. typecheck:fast 0, `test:file` 54/54 (the files action 7, messages 47), `clubhouse:check` 0; `npm run build` for the changed `'use server'` file belongs to the merge pass.
- 2026-09-29 · Qualifiers · spec (doing), phone-spec (doing).
  - Rendered `Qualifiers.html` headless at 1280 and 924: 21 states each (list, filters, no match, live, scorecard, closed, reopened, upcoming, completed, create, validation, created).
  - Rendered `Qualifiers Mobile.html` at 390 × 844: 11 states, plus the five boards as drawn.
  - The only console warning is a missing React key inside the bundle's `RoundStrip`. Captures are kept outside the repo.
  - Checked read-only against the live schema: columns, CHECK constraints, RLS on the four qualifier tables and on `golf_rounds` and `golf_holes`, and aggregate counts with no names.
  - The design system was not compared with the design project (no DesignSync access in this session).
- 2026-09-29 · Qualifiers · desktop, wired, states, error-tracking, motion, accessibility and performance done; verified doing (a real coach account and owner review left). Coach and player, list, detail, create and edit.
  - Gates: typecheck:fast 0; eslint on the 31 changed files 0 (one warning, already in the preview page); vitest `src/clubhouse` plus the setup actions 342/342, exit 0; clubhouse:check 0; knowledge:check 0; `npm run build` 0 (the later commits change only CSS and markup); `clubhouse:a11y` against my own server on :3102 clean, 156 pages, 53 of them Qualifiers.
  - Compared 38 states at 1280 and 924 with the prototype captures. Fixed on the way: the heading size, the section-head spacing, the squad readout running out of its box, the textarea height, and a two-line "No rounds submitted".
  - Differences left, all decisions:
    - standings rank by to par, then strokes (D-33), so a player at +8 after one round sits above one at +10 after two;
    - Avg moved into the scorecards tray, and a Status column was added;
    - Course per round shows the tee and par, not a date;
    - no selection workspace button (D-32), and Lineups is hidden in the nav (D-33);
    - players are listed by last name;
    - a long date range wraps instead of being cut off;
    - not reproduced: the empty help line the design system keeps under every field, and the pin icon in the Course field.
  - Browser checks:
    - the keyboard reaches every control, and Esc closes the Close dialog and the course picker, returning focus;
    - the close, save and course-lookup failures were forced in the preview and seen in the console, with outbound reports blocked;
    - layout shift was 0.0001 or less on seven states.
  - Security review of the new setup actions: RLS client only, no service role, and verifyTeamAccess before any write, all met. Fixed from the review:
    - the squad size can't change under a confirm that lands at the same moment;
    - a player with a round in any status stays entered;
    - players never fetch the pick reasoning;
    - refusals no longer file as faults.
  - Left for a migration (owner): players can read `coach_reasoning` in the database, the entry-insert policy doesn't check the player's team, and the stranding trigger runs as the caller. These are logged in `memory/features/qualifiers.md`.
