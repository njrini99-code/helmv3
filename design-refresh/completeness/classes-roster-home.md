# Lane report: classes-roster-home (Classes, Roster, coach Home)

Completeness pass, 4 Nov 2026. Files changed, all inside `pkg/design-refresh/classes-roster-home/`: `02-PLAN.md`, `05-SCREENS.md`, `06-SCREEN-SPECS.md`, `07-MOTION.md`, `08-ACCEPTANCE.md`. Each has a pointer under its H1 and one section titled `## Completeness pass, 4 Nov 2026` at the end. `03-DATA-CHECKS.md` and `04-FIDELITY-SPEC.md` were not changed: every new state reads data today's loaders already load, and the CP rows name the field they use. No shared top-level file, other lane, `design-refresh/` original or `redesign-package-src/` was touched.

Ids added: 05 CP.1 to CP.6 (39 inventory rows, 33 state matrices, an entry table, a bell and push table, a handoff table); 06 CP-6.1 to CP-6.16; 07 M-CRH-46 to M-CRH-58, never-animate rules 13 to 15, interrupt cases 25 to 29; 08 CP-1 to CP-74 with a per-PR map; 02 CP-02.1 to CP-02.8.

## 1. Matrix

| Item ID | Kind | States covered before | Gaps found | What I added (file and CP ids) |
|---|---|---|---|---|
| Lane flag (S-ALL.flag-off) | state | none: the lane had no flag, so SHARED-8 could not hold | no flag, no gating rule, no flag-off proof | 05 CP.1 and S-ALL.flag-off; 02 CP-02.1 (`clubhouse_classes_roster_home_v1`, `crh` prop, `data-ch-crh="on"`, CSS under `[data-ch-crh='on']`, preview `&crh=0|1`); 08 CP-1 to CP-4 |
| S-ALL.deeplink | entry | today's URLs listed, no arrival or Back rule | no at-rest arrival, no Back order, no cold start, no stale target | 05 CP.3; 07 M-CRH-46, 53; 02 CP-02.4; 08 CP-5 to CP-12 |
| Notifications (join request, join approved, availability, class schedule) | entry | none | no landing, stale or role rule | 05 CP.3 bell and push table; 02 CP-02.5; 08 CP-13 to CP-15 |
| S-ALL.keyboard, S-ALL.voiceover | interaction | none | no focus ring, tab order, dialog focus, names | 05 matrices; 06 CP-6.1, CP-6.10; 07 M-CRH-50, 52; 08 CP-70 to CP-74 |
| S-ALL.toast, S-ALL.busy | state | toasts as today, no double-submit rule | double tap, slow, offline | 05; 06 CP-6.8, CP-6.11; 07 M-CRH-51; 08 CP-46 |
| S-ALL.day-rollover | state | none | midnight and 1 Aug while open | 05; 07 M-CRH-55; 02 CP-02.8; 08 CP-47, CP-48 |
| S-ALL.mid-width | layout | 390, 430, 1280 only | 768 to 1279 | 05; 06 CP-6.15; 08 CP-49 |
| S-CLASSES.coach | route | not listed | a coach on /classes | 05 (legacy page, unchanged) |
| S-CLASSES.no-term, .term-edges, .partial | state | default, empty, failed | no term, before start, after end, partial reads | 05; 06 CP-6.6, CP-6.7; 08 CP-50 to CP-52 |
| S-CLASSES.team-items | inline | drawn, tap rule unstated | link or not | 05; 08 CP-23 |
| S-CLASSES.sheet-stack, .gone | sheet, state | single sheets | sheet over sheet, class deleted while open | 05; 07 M-CRH-56, 57; 08 CP-53, CP-54 |
| S-ROSTER.requests.none, .one, .elsewhere, .failed | state | the list with several | zero, one, already handled, failed | 05; 06 CP-6.5; 07 M-CRH-47; 08 CP-55 to CP-57 |
| S-ROSTER.profile.deeplink, .missing, .removed | entry, state | profile by tap only | URL arrival, bad id, removed mid-session | 05; 06 CP-6.8; 07 M-CRH-49; 08 CP-7, CP-8, CP-58 |
| S-ROSTER.profile.note-dirty, .availability-failed, .order | confirm, result, layout | not drawn | unsaved note, failed write, card order | 05; 06 CP-6.13; 07 M-CRH-48, 58; 08 CP-38, CP-59, CP-60 |
| S-ROSTER.role-guard, .alias | state, route | not listed | player opening coach params; `/roster/<id>` | 05; 08 CP-9, CP-10 |
| S-ROSTER.desktop-search, .desktop-tools, .print | state, controls | desktop default only | no results, tools, print | 05; 06 CP-6.14; 08 CP-61 to CP-63 |
| S-HOME.since, .later, .no-events, .today-empty | inline | not listed | today's cards and empty states | 05; 08 CP-64, CP-65 |
| S-HOME.day-actions, .queue-failed, .part-failed | links, state | not listed | Nudge, Message, Directions; failed reads | 05; 06 CP-6.9; 08 CP-66 to CP-68 |
| S-HOME.round-links | links | Message, Round recap drawn | CoachHelm, Player stats | 05; 06 CP-6.12; 08 CP-69 |
| S-HOME.player-boundary | boundary | undefined | bar and shared exports | 05; 02 CP-02.3; 08 CP-24 |
| S-HOME.desktop | screen | 05 and 06 §11.4, no file plan | no 02 plan | 02 CP-02.2 |
| 3 Nov not-drawn rows (sheets, confirms, status card, peek, class line, live card, capsules, offline) | various | 05 rules, no acceptance | no checks | 08 CP-25 to CP-45 |
| Stale rows | fixes | | 05: route-error, requests one, class-line, requests empty row; 06: §9, §14 row 31; 08: item 98; 02: §5.1 `.ch-rs-attn`, R1, R2, R3, R17 | fixed in place with `(fixed 4 Nov: ...)` |

## 2. Gaps filled

73: 39 new screen and state IDs, 21 existing IDs that had no acceptance (08 CP-25 to CP-45), 1 missing file plan (desktop Home), and 12 stale or wrong rows fixed in place.

## 3. Handoffs

| From | To | Trigger | Context carried | Back | Other lane's flag off |
|---|---|---|---|---|---|
| Roster profile and peek "View stats" | stats-home S-STATS.coach | tap | `?player=<id>` | Back or edge swipe: Roster, profile at rest, scroll restored. The Stats bar's own "‹ Team" key goes to Team Stats | today's Stats page, same URL |
| Profile Recent rounds "All {n}" | stats-home Rounds | tap | `?player=<id>&window=season&tab=rounds` | Stats summary first, then Roster with the profile | today's Stats, Rounds |
| Home "The team's game" names | stats-home SG detail | tap | `?player=<id>&tab=game` | Stats summary, then Home at its scroll | today's Your game tab |
| Home "Team stats" | stats-home Team Stats | tap | none | Home at its scroll | today's Team Stats |
| Profile, peek, round sheet "Message" | Messages compose | tap | the player as recipient (no per-conversation URL) | the opener as it was | today's Messages |
| Home Up next "Nudge", "Message" | Messages compose | tap | `/messages?prefill=`, draft only | Home at its scroll | today's Messages |
| Profile CoachHelm panel, peek, round sheet | Lenses S-FILE | tap | player id (and `insight`) via today's hrefs | profile at rest, or Home | today's Deep dive |
| Lenses "Open {first}'s profile" | Roster profile | tap | `/roster?player=<id>` | "‹ Roster" to the list; browser Back to the file | today's profile, same URL |
| Home Waiting on you: join requests | Roster requests | tap | `roster?tab=requests` | Home | n/a |
| Home Waiting on you: replies, tasks, posts | Calendar event, Team Hub tasks, Team Hub announcements | tap | today's hrefs | Home | n/a |
| Home Waiting on you: Ask, Practice plans, Messages, Team Board | none | none | the queue has no such rows; their items land in existing capsules, Today and Up next | n/a | n/a |
| Home Up next, Today, Later, week | Calendar event or day; plan on the event page when `golf_practice_plans` is on | tap | event id, date | Home at its scroll | event page as today |
| Home strip "CoachHelm" | Team Board landing | capsule | none | section change, not a push | today's CoachHelm |
| Classes team items | none | none | information only | n/a | n/a |
| Classes saves | Calendar | write | `syncClassToCalendar` as today | n/a | n/a |
| Player Home | stats-home | n/a | this lane changes only the bar, and only when player Home's hero paints `--ch-frame` | n/a | stats-home off: player bar stays main |

Contradictions seen:
- Stats coach bar "‹ Team" goes to Team Stats when the coach came from Roster. Browser Back and edge swipe are right; only the key is off. Logged as a call below.
- BUILD_BRIEF PR 10 says player Home's bar "follows". With stats-home off or not built, that would put a `--ch-frame` bar over today's `--ch-green-800` player hero. I scoped it (02 CP-02.3): the player rule needs a `data-ch-hero-flat` attribute that stats-home PR 6 sets in `PlayerHomePhone.tsx`. That line is in stats-home's lane, so it needs their row.
- stats-home and messages have no lane flag of their own that this lane can key "other flag off" on. I wrote the off case as "today's page at the same URL", which holds whatever their gate is.

## 4. Needs a shared-file change

1. BUILD_BRIEF PR 7, add after "Nothing else changes.": "The lane flag `clubhouse_classes_roster_home_v1` (release, default false everywhere) is added in this PR and gates PRs 7 to 10; see `classes-roster-home/02-PLAN.md` CP-02.1." Why: SHARED-8 needs a flag and the brief names none for PRs 7 to 10.
2. START_HERE row 4 (PR 7 to 10): add "flag `clubhouse_classes_roster_home_v1`". Same reason.
3. BUILD_BRIEF PR 10 title: "Coach Home (phone and desktop)", and add "Desktop: 06 §11.4." Why: 05 S-HOME.desktop sits in PR 10.
4. BUILD_BRIEF PR 10, replace "(player Home's bar follows; check it in PR 6's shots)" with "(player Home's bar follows only when PR 6's flat hero is on, keyed on `data-ch-hero-flat`; check it in PR 6's shots)". Why: no seam with either lane off.
5. BUILD_BRIEF PR 6, add: "Set `data-ch-hero-flat` on player Home's root when the flat `--ch-frame` hero renders." Why: the hook for item 4. The stats-home lane should add the matching row.

## 5. Calls only Nick can make

| Question | Options | Pick |
|---|---|---|
| Does the `classYearLabel` repeat fix ship behind the lane flag or alone? It reaches about 9 callers outside this lane | (a) behind the flag; (b) its own fix, live | (a), so flag off stays main |
| Stats coach bar "‹ Team" when the coach came from Roster | (a) leave it as today; (b) "‹ Roster" when the referrer is Roster | (a), stats-home says the bar must not change, and Back already works |

## 6. START_HERE and BUILD_BRIEF check

START_HERE maps PRs 7 to 10 to this folder, and BUILD_BRIEF has a section for each. Every 05 ID maps to PR 7, 8, 9 or 10, except four that are unchanged by design and need no PR: S-CLASSES.coach (legacy page), S-ROSTER.alias, S-ALL.toast, and the bell and pull to refresh. Gaps: S-HOME.desktop is in PR 10, but BUILD_BRIEF titles PR 10 "phone" and 02 had no file plan for it. CP-02.2 adds the plan; shared item 3 fixes the title. S-CLASSES.desktop is in PR 9 only as a "kept as is" check, so PR 9's "phone" title is accurate. 02's line 526 and R17 said to keep `.ch-rs-attn`, which goes against DECISIONS and BUILD_BRIEF PR 8, so both are fixed in place.

Memory: none used.
