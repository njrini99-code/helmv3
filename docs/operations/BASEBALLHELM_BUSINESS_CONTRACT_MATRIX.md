# BaseballHelm Business/Product-Truth Contract Matrix (#377)

> Pinning tests, not aspirational tests. Every row below ties a business
> invariant to its source-of-truth module(s) and the contract test that pins
> it against the REAL implementation. When a contract fails after a
> refactor, the refactor (or this matrix + the contract) needs a deliberate
> decision — never a silent skip. See `src/contracts/baseball/README.md` for
> the lane's testing conventions.
>
> Related: `docs/operations/BASEBALL_STATS_SOURCE_OF_TRUTH.md` (canonical
> read/write paths for stats) is the narrative companion to the "Stat math &
> honesty" section below.

---

## 1. Stat math & honesty

| Contract | Source of truth | Contract test |
|---|---|---|
| AVG = H/AB, SLG from total bases, OBP = (H+BB+HBP)/(AB+BB+HBP+SF), OPS = OBP+SLG, ISO = SLG−AVG | `finalizeBatting` — `src/lib/baseball/read-models/stats-center.ts` | `src/contracts/baseball/stats/batting-invariants.test.ts` |
| Null-honesty: every derived batting rate is `null` (never `0`/`.000`) on a zero denominator | `finalizeBatting`, `emptyBatting` — same file | same file (above) |
| ERA = ER×9/IP, WHIP = (BB+H)/IP, K/9, BB/9 — `null` when IP=0 | `finalizePitching` — `src/lib/baseball/read-models/stats-center.ts` | `src/contracts/baseball/stats/pitching-invariants.test.ts` |
| Box-score SAVE path (`games.ts`) computes the SAME AVG/OBP/SLG/OPS/ERA/WHIP/K9/BB9 formulas as the Stats Center read model | `computeBattingRates`/`computePitchingRates` (private) — `src/app/baseball/actions/games.ts` | both files above (static text contract — the helpers are not exported; see "needs decision" row 1 below) |
| `baseball_player_season_stats` does NOT distinguish game vs scrimmage; `getStatsCenter` derives `battingOfficial`/`pitchingOfficial` (game-typed only) vs `battingAll`/`pitchingAll` (game+scrimmage) from box-score rows joined to `baseball_games.game_type` | `getStatsCenter` — `src/lib/baseball/read-models/stats-center.ts` | `src/contracts/baseball/stats/game-vs-practice-separation.test.ts` |
| A game row with no `game_type` defaults to official (`'game'`), never silently scrimmage | `getStatsCenter` — same file | same file (above) |
| Full unit-level derivation coverage (catching/fielding/baserunning honesty, RC, wOBA, etc.) | same file | `src/lib/baseball/__tests__/stats-center-derivations.test.ts` (pre-existing unit test; not duplicated in the contracts lane) |

**Needs decision #1 — `computeBattingRates`/`computePitchingRates` are not exported.**
The plan called for importing these helpers directly from `games.ts`, but
they are private (no `export`). The contract pins them via a static
`readFileSync` + literal-formula match instead of an import. **Decision
needed:** either (a) export them so a future refactor that silently changes
the box-score-save formula breaks a REAL import-based test instead of a
text-match, or (b) accept the static-text contract as sufficient because the
box-score save path is scheduled to be unified with `stats-center.ts`'s
finalizers. Until decided, a refactor that renames these functions (without
changing their formulas) will break this contract even though product truth
is unchanged — a known false-positive risk of the static-text approach.

**Needs decision #2 — `ip` (innings pitched) has no traditional-notation
normalization.** College box scores conventionally enter partial innings as
"X.1"/"X.2" (⅓/⅔), but `games.ts`'s CSV parser does
`getFloat('innings_pitched')` verbatim and `finalizePitching`/`addPitching`
treat `ip` as a continuous decimal with no thirds conversion anywhere in the
codebase. Two 0.2-inning (⅔) relief outings sum to `0.4`, not the
baseball-true `1.333...`. This is pinned as ground truth (not "innings are
normalized", which is not true today) in
`src/contracts/baseball/stats/pitching-invariants.test.ts`. **Decision
needed:** either standardize on true-decimal entry (and validate/convert at
import time) or add an explicit outs-based accumulator. Left undecided, ERA/
WHIP/K9/BB9 are subtly wrong for any pitcher with partial-inning appearances
recorded in traditional notation.

---

## 2. Source-trust & import lineage

| Contract | Source of truth | Contract test |
|---|---|---|
| Every committed stat row carries `source`, `source_trust_level`, `source_visibility`, `source_match_confidence`, `source_match_tier` | `applyImportPlan` (`commitImport`) — `src/app/baseball/actions/imports.ts` | `src/contracts/baseball/source-trust/import-stamping.test.ts` |
| An UNREGISTERED import source falls back to `ADAPTER_DEFAULT_POLICY` (`unreviewed`/`staff_only`), never an inflated trust level | `loadSourcePolicy`, `ADAPTER_DEFAULT_POLICY` — same file | same file (above) |
| `required_review=true` HOLDS the run: stages the full plan (mapping + matches + headers + rows) on `baseball_stat_uploads`, writes **zero** `baseball_player_stats` rows | `commitImport` (review-hold branch) — same file | `src/contracts/baseball/source-trust/lineage-and-raw-file.test.ts`; also pre-existing `src/app/baseball/actions/__tests__/imports-registry.test.ts` |
| The server NEVER trusts a client-supplied file hash — `CommitImportArgs` carries no hash field; `fingerprintBody` recomputes SHA-256 over the exact bytes stored | `fingerprintBody`, `bodyToStoredBytes` — `src/lib/baseball/adapters/file-fingerprint.ts`; `CommitImportArgs` — `src/app/baseball/actions/imports.ts` | `src/contracts/baseball/source-trust/lineage-and-raw-file.test.ts` |
| A committed run writes the lineage row (`baseball_stat_uploads`) with `mapping_config` + a before/after rollback `snapshot` | `applyImportPlan` — same file | same file (above) |
| A committed run upserts `baseball_player_external_ids` (team-scoped, `onConflict: team_id,source_id,external_id`) for deterministic future matching | `applyImportPlan` — same file | same file (above) |
| Disabled-source guard on both import paths | `assertImportSourceAllowed` — `src/app/baseball/actions/imports.ts` + `stat-event-imports.ts` | pre-existing `src/contracts/baseball/route-shell.contract.test.ts` (`Baseball business-trust contracts (#377)` describe block) |

---

## 3. CoachHelm / signal evidence

| Contract | Source of truth | Contract test |
|---|---|---|
| Only `medium`/`high`/`urgent` engine candidates promote to a `baseball_signals` triage row; `low` never creates triage work | `signalFromInsight` / `PROMOTE_PRIORITIES` (private) — `src/lib/baseball/signal-from-insight.ts` | `src/contracts/baseball/coachhelm/signal-evidence.test.ts` |
| A numeric signal with `sample_n < SIGNAL_SAMPLE_TOO_SMALL_THRESHOLD` (6) gets `disposition: 'sample_too_small'` — surfaced, never authoritative | same file | same file (above) |
| Every promoted signal carries `source_refs` derived from the insight's evidence, plus (when persisted) a citation back to the insight row | `buildSignalSourceRefs` — same file | same file (above) |
| `calcConfidence` honest mode (`factors_measured === false`) never fabricates a variance floor; a genuinely decayed `recency < 1` is still honored | `calcConfidence` — `src/lib/coachhelm/shared/evidence-types.ts` | same file (above) |
| Insight rows cite `source_refs`; CoachHelm actions seed baseline metrics at conversion; outcome sweep uses the improvement-sign registry; Stats Center read model is staff-gated with explicit envelopes | `src/lib/coachhelm/baseball/generators/composites.ts`, `src/app/baseball/actions/coachhelm-actions.ts`, `src/lib/baseball/coachhelm/outcome-sweep.ts`, `src/lib/baseball/read-models/stats-center.ts` | pre-existing `src/contracts/baseball/coachhelm-product-truth.contract.test.ts` (#384) |

**Needs decision #3 — `PROMOTE_PRIORITIES` is private.** Like the stat-math
helpers above, the promotion-priority set is not exported. The contract pins
it through `signalFromInsight`'s observable behavior (call with each
priority, assert promote/drop) rather than importing the constant, which is
the more robust approach here (it exercises real behavior, not a text
match) — no decision needed, documented for completeness.

---

## 4. Honest empty / failure states

| Contract | Source of truth | Contract test |
|---|---|---|
| A player with zero captured box-score lines gets `noData: true` on their Stats Center row — never a fabricated `.000` line | `getStatsCenter` — `src/lib/baseball/read-models/stats-center.ts` | `src/contracts/baseball/product-trust/honest-empty-state.test.ts` |
| `computeOPS` (cold-streak rule) prefers the explicit `ops` column, else `obp+slg`, else `null` — and the loader SKIPS the player rather than treating a missing OPS as `0` | `computeOPS` (private) — `src/app/baseball/actions/operational-signals.ts` | same file (above; static-text contract — see needs-decision #1's same rationale) |
| The CoachHelm engine run's master AI switch OFF short-circuits the ENTIRE run BEFORE any DB read: `success: true, generated: 0, aiDisabled: true` (never a healthy-looking empty result indistinguishable from "ran and found nothing") | `runBaseballEngineCore` — `src/lib/baseball/coachhelm/engine-run.ts`; `decideAiGenerationAllowed` — `src/lib/baseball/ai-policy.ts` | same file (above) |
| Command Center / Daily Brief / Stats Center clients distinguish `error` from empty state; canonical read models expose `authorized` + `error` envelopes | `src/components/baseball/command-center/*.tsx`, `src/lib/baseball/read-models/{command-center,stats-center,signal-inbox}.ts` | pre-existing `src/contracts/baseball/product-trust.contract.test.ts` |

---

## 5. Coach/player/team access scope

| Contract | Source of truth | Contract test |
|---|---|---|
| `getStatsCenter` is staff-only: a caller not on `baseball_team_coach_staff` for the requested team gets `authorized: false` + zero rows (no partial/leaked read); an unauthenticated caller gets the same envelope | `isTeamStaff`, `getStatsCenter` — `src/lib/baseball/read-models/stats-center.ts` | `src/contracts/baseball/access/scope-enforcement.test.ts` |
| Rows returned are limited to `baseball_team_members` of the REQUESTED team — a player on a different team never leaks into the result | `getStatsCenter` — same file | same file (above) |
| `updateMyPlayerProfile` writes ONLY against the server-resolved `ctx.activePlayerId` — a caller-supplied `id` in the patch payload is never honored | `updateMyPlayerProfile` — `src/app/baseball/actions/player-access.ts` | same file (above) |
| The profile patch whitelist (`EDITABLE_PROFILE_FIELDS`, derived from the zod schema) drops admin-only columns (`team_id`, `recruiting_activated`, `id`, …) from the patch | same file | same file (above) |
| `activateRecruitingExposure`/`deactivateRecruitingExposure`/`getTeamSeasonStatsForViewer` are gated via `withBaseballAction({ requiredPlayerAccess })`, never trust a caller-supplied player/team id | same file | covered by `withBaseballAction`'s own access-gate tests (not re-pinned here — out of scope for this contract file, which focuses on the mutation-payload whitelist) |

**Needs decision #4 — `getStatsCenter` drops non-member box-score rows
STRUCTURALLY, not explicitly.** The accumulation loop
(`for (const line of battingLines) { ... ensureAcc(line.player_id) ...}`)
keys purely on `player_id` from box-score rows scoped by `team_id`/`game_id`
— it does NOT check that `player_id` is a current `baseball_team_members` row
for the team. A box-score row for a player who has since left the roster (or
a data-entry error writing the wrong `player_id`) silently disappears from
`rows` only because the row-BUILDING loop iterates `members`, not because the
accumulation step rejected it. The accumulated-but-orphaned stats are neither
surfaced nor flagged. **Decision needed:** is a silently-dropped orphan
acceptable (current behavior), or should `getStatsCenter` surface an explicit
"N box-score rows reference players not on the current roster" count so a
roster change doesn't silently erase a player's contributed stats from the
team's view? No contract pins a SPECIFIC behavior here because the current
behavior is incidental, not designed.

**Needs decision #5 — `getPlayerPeekData` (`src/app/baseball/actions/player-peek.ts`)
has NO team-membership assertion between the viewing coach and the target
player.** The function checks only that the caller is an authenticated user
with a `baseball_coaches` row; it then reads `baseball_players` by a
caller-supplied `playerId` with no scoping to a team the coach is staff on,
and no recruiting-watchlist/scouting-relationship check. Any authenticated
coach can peek any player's profile (including health-adjacent fields like
`gpa`, `bats`/`throws`, and engagement telemetry) by id. **Decision needed:**
is the Player Peek panel intentionally a cross-program scouting surface (the
entire BaseballHelm recruiting model is built on coaches viewing players
outside their own program), or should it be scoped to "players visible to
this coach via recruiting exposure / an active watchlist relationship"? No
contract test pins a specific access boundary here because the product
intent is genuinely ambiguous from the code alone — this row exists so the
gap is not silently rediscovered later.

---

## Running the lane

```bash
npx vitest run --project unit src/contracts/baseball/
```

Auto-discovered by the existing `unit` Vitest project
(`src/**/*.test.{ts,tsx}` include glob in `vitest.config.ts`) — no config
change required.
