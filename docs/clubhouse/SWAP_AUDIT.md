# Clubhouse complete-swap audit

The finding register for the owner's swap audit (`GolfHelm_Clubhouse_Complete_Swap_Audit.md`, 2026-09-30). The owner chose "fix as I go": each finding fixed on the branch carries its commit and regression test. Owner decisions are logged in `PROGRESS.md` as Q-n. The CHANGELOG (`CHANGELOG.md`) lists each fix.

Evidence labels: **Source-confirmed**, **Reproduced** (with test and SHA), **Documented, not reverified**, **Risk to test**, **Owner decision**, **Passed**, **Blocked / not exercised**.

## 1. Baselines

| Baseline | SHA | How it was established |
| --- | --- | --- |
| Production (served) | `6ee77e98e` | `npm run release:status`, at session start |
| main | `c706fc80e` | `origin/main` |
| Clubhouse candidate (#2102) | `c221d1ca2` | `agent/clubhouse` |
| Release train | PR #2110, `agent/release-train` at `c0f1b17fe` (#2102, #2104 round engine, #2108 security, #2109 stats engine, plus the audit fixes) | local `next build` exit 0 at `24a4bbca2` (later commits: docs, lint layout, the Hub read fix, one test timeout); CI rerunning at `c0f1b17fe` |

**Production flag state:** `golf_clubhouse_ui` and `golf_clubhouse_front_door` are off in production and on in preview and development (`config/feature-flags.yml`). Per Q-4, production stays off until the owner has done a live preview pass. A train deploy therefore ships the flag-off (Fairway) experience plus the shared fixes. Every finding below that says "flag on" affects no customer until the flag is flipped.

## 2. Scorecard (audit §20)

| Gate | Status | Evidence |
| --- | --- | --- |
| Baseline | **Passed** | §1 |
| Complete shell swap | **Open**: route gaps in §3; the owner decides build, alias or retire (after this audit) | route table §3 |
| Round preservation | **Database contracts Passed**: CI pgTAP at `c0f1b17fe` (every migration applied, held included) passed `golf_round_lifecycle_contract` (direct writes cannot complete a round; completed history cannot be edited; only the atomic path completes), `golf_round_submit_identity` (a stale retry cannot retarget a round's type, qualifier or slot), `golf_qualifier_round_slot_integrity` (no duplicate active qualifier round) and `golf_atomic_snapshot_integrity`. Client fault paths are covered by fake-backed Clubhouse tests (`round-entry-*`). **Open**: F-02 (recovery unreachable with the flag on); F-14 fixed | F-02, F-14 |
| Calendar | **Blocked / not exercised** at runtime (no isolated DB session run yet); source reviewed; deep link `?event=` wired | §3 notifications |
| Stats and visuals | **Source reviewed**; parity register `pages/P005-stats-player/PARITY.md` (87 rows); formula fixtures not rerun at the train SHA | PARITY.md |
| Qualifiers | **Open**: F-03 tie inconsistency, source-confirmed; the tie policy is an owner decision | F-03 |
| Messages | Deep link `?conversation=` verified in source and by `messages.test.tsx`; two-session realtime **not exercised** | §3 |
| CoachHelm | **Open**: F-04 views not rebuilt | F-04 |
| Migrations | **Passed**: no train code reads a held column; every RPC the app calls exists in production or has a verified fallback; CI applied the whole migration set, held included, and all 86 pgTAP suites passed at `c0f1b17fe`; squawk and SQL lint clean | §5 |
| Phone/accessibility | **Blocked / not exercised**: needs the owner's iPhone pass on the preview | — |
| Build/regression | Local `test:all`: 13 failures in 8 files, fixed (F-15..F-20). First CI run on #2110 added F-21..F-25, all fixed or owner-decided; `next build` exit 0 locally | §4 |
| Cutover/rollback | Release package in §6; rollback = flag off (Clubhouse) or redeploy `6ee77e98e` (owner) | §6 |
| Legacy retirement | **Not ready**: no retirement until every row in §3 has a destination (F-13) | F-13 |

## 3. Role × route table (F-01)

`isRebuilt(path, role)` in `src/clubhouse/shell/nav.ts` decides whether the Clubhouse shell draws a route. Anything else renders the NotRebuilt placeholder when the flag is on. An alias is `redirectToClubhouse` in a route layout (`src/clubhouse/routes/alias.ts`).

### Rebuilt (flag on)

- **Coach:** `/golf/dashboard`, `coachhelm` (plus `?view=ask`), `calendar`, `messages`, `roster`, `recruiting`, `stats`, `stats/team`, `qualifiers` (plus `new`, `[id]`, `[id]/edit`, `[id]/selection`), `team-hub`, `settings` (plus `notifications`, `coaching-intelligence`), `rounds/[uuid]`.
- **Player:** `/golf/dashboard`, `coachhelm`, `calendar`, `team-hub`, `messages`, `rounds`, `rounds/new`, `rounds/[uuid]`, `rounds/continue/[uuid]`, `classes`, `stats`, `qualifiers`, `my-qualifiers`, `settings` (plus both sub-pages).
- **Aliased:** `tasks`, `announcements`, `documents` and `travel` go to Team Hub tabs; `roster/[id]` goes to `stats?player=`; `rounds/[id]/review` goes to `rounds/[id]`; `coachhelm/chat` goes to `coachhelm?view=ask` (coach).

### Not rebuilt with the flag on (owner decides after this audit)

| Route | Role | Today (flag on) | Suggested destination |
| --- | --- | --- | --- |
| `/rounds/recover` | player | NotRebuilt | **Build** (P0, F-02): a Clubhouse recover screen over `lib/offline/indexed-db` + `shot-storage` + `round-missing-recovery` |
| `/intelligence` (and `/alerts`, `/insights`, `/patterns`, `/analytics/coachhelm`, `/development`, which redirect to it) | coach | NotRebuilt | Alias to `coachhelm` (`?player=` kept) |
| `coachhelm?view=development\|profile\|standing\|deep-dive`; `/my-development`, `/my-game-profile`, `/my-standing` | player | NotRebuilt (F-04) | Alias: development and deep dive go to `coachhelm`; profile and standing go to `stats`. Or build |
| `/players/[id]`, `/players/[id]/game`, `/game/print`, `/genome`; `/coachhelm/genome/[id]` | coach | NotRebuilt | Alias to `stats?player=<id>` |
| `/coachhelm/genome/compare` | coach | NotRebuilt | Owner: retire or build |
| `/team` | both | NotRebuilt | Coach: `settings?section=team`; player: `settings?section=golf` |
| `/rounds` | coach | NotRebuilt (v2 has no coach library, Q-79) | Alias to `stats/team` |
| `/coachhelm/chat` | player | NotRebuilt | Alias to `coachhelm` |
| `/courses` | coach | NotRebuilt | Owner: build or retire (course management) |
| `/whats-new` | both | NotRebuilt | Retire, or alias to Home |
| `/hub`, `/my-insights` | both | redirect to rebuilt routes | none needed |
| `/dev/haptics`, `[...missing]` | — | dev and catch-all | none needed |

### Live notification destinations (production, read-only, last 180 days)

| Destination | Rows | Flag-on status |
| --- | --- | --- |
| `calendar?event=<id>` | 2,566 | **Passed (source)**: `calendar/page.tsx` passes `event` to `ClubhouseCalendarRoute` |
| `messages?conversation=<id>` | 2,250 | **Passed (source + test)**: `Messages.tsx` opens the thread; `messages.test.tsx` covers it |
| `calendar` | 443 | rebuilt |
| `announcements` | 136 | aliased to Team Hub (announcements tab) |
| `coachhelm` | 94 | rebuilt |
| `roster` | 65 | rebuilt. `roster?tab=requests` (code source) is **ignored** by Clubhouse Roster; requests show in the Roster header instead (P2) |
| `team` | 3 | **NotRebuilt** (see table) |

Code-only link sources not seen in recent rows: `tasks?task=<id>` (the alias drops `task`; P2), `intelligence*`, `my-development`, `coachhelm?view=development`.

## 4. Findings

| ID | Sev | Label | Finding | Disposition |
| --- | --- | --- | --- | --- |
| F-01 | Blocker (flag on) | Source-confirmed | NotRebuilt for supported routes (§3). | Owner picks build, alias or retire per row, after the audit |
| F-02 | P0 (flag on) | Source-confirmed | With the flag on, a player cannot reach round recovery. `NewRound`/`ContinueRound` send the engine's `recover` destination to `/rounds` (`ENGINE_ROUTES`). `RoundsLibrary` reads server rounds only (in-progress `limit(20)`) and never reads `getPendingRounds`, `getFailedRounds` or `getRoundRecoverySnapshots`. A round saved only on the device can be neither seen nor restored in Clubhouse. | Open: build the recover screen (the §3 row). Stop condition for a player flag flip |
| F-03 | P1 | Source-confirmed | Leaderboard `buildBoard` (`screens/qualifiers/model.ts`) shares positions on equal to-par and total, orders ties by rounds played then name, and sets the automatic slots by that order. Selection `rankCandidates` (`lib/coachhelm/v3/qualifying/loader.ts`) assigns unique ranks in input order after to-par and total, and `classifySlots` uses them. A tie across the last automatic slot can put a different player in by each view. | Owner decision (Q-104). Oracle test to be written with the chosen rule |
| F-04 | P1 | Source-confirmed | `routes/coachhelm.tsx` `VIEWS_NOT_REBUILT`: development, profile, standing, deep-dive. | Owner decision (§3) |
| F-05 | P0 gate | Documented, not reverified | Authenticated writes on the candidate, fault injection and the iPhone pass have not run. | Preview pass by the owner (§6); local-Supabase journeys still to do |
| F-06 | P0 gate | Source-confirmed | `e2e/golf-round.spec.ts` drives Fairway controls against the configured DB. | Not certifying Clubhouse; a Clubhouse e2e is still needed |
| F-07 | P1 | Source-confirmed | Held numeric migrations (countable cache, test-round exclusion, putting, SG) change derived figures. | Stay held. The train does not depend on them (§5) |
| F-08 | P1 | Risk to test | The coach CoachHelm loader shows one top insight a player; counts can exceed the reachable items. | Not reverified tonight |
| F-09 | P2 | Documented | P013 WIRING described bugs already fixed in code. | Code is the evidence; WIRING to be reconciled |
| F-10 | P1 | Source-confirmed | The train changes shared code (round engine #2104, stats engine #2109, security #2108, `formatToPar`). | The flag-off slice runs in `test:all` (green after F-15..F-20) |
| F-11 | P1 | Documented | Attachment hardening SQL is not written (`held/data/message-attachments-hardening.md`: HELD). | Stays open. Qualifier hardening is held with a working fallback (§5) |
| F-12 | P2 | Risk to test | Messages drafts live in a component `Map`: kept across conversation switches, lost across reloads. | Not exercised |
| F-13 | P1 | Source-confirmed | The flag's `cleanup_plan` and `purpose` say "coach"; `isClubhouseFor` covers coach and player. | Fixed in docs: the flag text now names both roles and ties retirement to §3 (this commit) |
| F-14 | **P0 (flag on)** | Source-confirmed, fixed | Only Fairway's `OfflineProvider` started the sync engine. In Clubhouse, a queued round, hole or shot synced only while a round screen was open (no interval, no initial sync after a reload). | **Fixed** `940f86f8c`: `shell/OfflineSync.tsx`, mounted in `ClubhouseShell`. Test `offline-sync.test.tsx` |
| F-15 | P1 (CI) | Reproduced | The reduced-motion guard failed on 15 Clubhouse files. All of them gate on `useChReducedMotion`, which the guard didn't know. | **Fixed** `5dc014faa`: registered as a verified delegate |
| F-16 | P2 | Reproduced | `formatToPar` declared twice (Clubhouse copy). | **Fixed**: one implementation in `lib/golf/format-to-par.ts`. Fairway's integer inputs print unchanged |
| F-17 | P2 | Reproduced | `message-mute` actions were not wrapped with `withAdminObserved`. | **Fixed** and registered under messaging |
| F-18 | P2 | Reproduced | `qualifiers/[id]/selection` had no error or loading boundary. | **Fixed** |
| F-19 | P2 (tests) | Reproduced | Three Fairway page tests hit the Clubhouse branch, because the flag is on in tests. | **Fixed**: they pin the gate off. Clubhouse's own empty-vs-error behaviour on those screens is **Risk to test** (not reverified) |
| F-20 | P2 (guard) | Reproduced | Migration-header guard: four files had no `VERIFY:` or `ROLLBACK:` line (two pre-existing on main, so main's guard was already red). | **Fixed** (comment-only edits) |
| F-21 | P1 | Reproduced (CI ast-grep + static check on #2110) | Team Hub's attendance and task-assignment reads asked for `.limit(2000)` / `.limit(5000)`; PostgREST returns at most 1000, so a large team's RSVP and task counts were cut short. | **Fixed** `43cd77f83`: `fetchAllRowsResult` ordered by id. Test `hub-paged-reads.test.ts` |
| F-22 | P2 (CI) | Reproduced (#2110) | Held migrations failed squawk (a constraint added without `NOT VALID`; `begin`/`commit` inside the tool's transaction) and raised sqlfluff by 182 (LT02/LT05/CP02). | **Fixed** `9b39e3ce2`, `89cc93f49`: layout only; squawk 0 issues |
| F-23 | P2 (CI) | Reproduced (#2110) | Semgrep's definer rule mis-anchors on a header comment in held `20260930150000` (the function does set `search_path`). | Owner chose an inline `nosemgrep` (Q-107) |
| F-24 | P2 (CI) | Reproduced (#2110) | Markdown lint up about 13.6k across Clubhouse docs, 11.6k of it long table lines. | Blank-line rules auto-fixed; the owner approved a one-time `markdown:ratchet --update` (Q-107) |
| F-25 | P3 (CI) | Reproduced (#2110) | Calendar test 10703 loops every write scenario and passed the 5s default on CI. | 20s timeout on that test, assertions unchanged |
| F-26 | P3 (CI) | Reproduced (CodeQL on #2110) | `scripts/clubhouse/registry.mjs` escaped `\|` in table cells without escaping `\\` first (`js/incomplete-sanitization`, two sites). | **Fixed** `1db53f553`; no generated doc changed; registry tests 15/15 |

## 5. Schema compatibility (flag-off deploy with no migration applied)

- No source file outside tests reads a column added only by a held migration (`availability*`, `rank_factors`, attribution interval).
- Every `.rpc()` the app calls exists in production except five pre-existing, non-golf names and `golf_qualifier_selection_reasons` (held D-35). `readQualifierSelectionReasons` falls back to the column when the function is missing (PGRST202), and fails loudly after the apply.
- Held migrations stay held. For an owner-run apply, the order and conditions are in `supabase/migrations/HELD.md` and `docs/operations/APPLY_PATH.md`.

## 6. Release package (tonight)

See `docs/clubhouse/RELEASE_2026-09-30.md`.

## Links

Parity: `pages/P005-stats-player/PARITY.md` · Clickables: `CLICKABLES.md` · Catalogs: `catalog/` · Contracts: `pages/*/CONTRACT.md` · Decisions: `PROGRESS.md`.
