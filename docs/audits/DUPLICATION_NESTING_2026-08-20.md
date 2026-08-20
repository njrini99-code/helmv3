# Duplication & Nesting Audit — 2026-08-20

Scope: logic duplicated across 2+ locations that must agree and can drift, and
structural bloat (god-files, god-functions, deep nesting). Read-only; no files
edited. All numbers below are measured, not estimated — commands are listed so
they can be re-run.

## How I searched

- Enumeration via `git ls-files` and search via `git grep` exclusively — both
  honour `.gitignore`, so `.worktrees/`, `.claude/worktrees/`, and `.deepsec/`
  were never scanned. Verified before searching:
  ```
  git check-ignore -v .worktrees        → .gitignore:5
  git check-ignore -v .claude/worktrees → .gitignore:103
  git check-ignore -v .deepsec          → .gitignore:14
  ```
  `find . -iname '*.worktrees*'` does show `./.worktrees` and `./.deepsec` on
  disk (they exist, ~4k+ phantom copies of `src/`), confirming why plain
  `find`/`ls` would have been unsafe — every `git ls-files` / `git grep` call
  in this audit avoided them by construction.
- 3,899 tracked `.ts`/`.tsx` files under `src/` (`git ls-files 'src/**/*.ts'
  'src/**/*.tsx' | wc -l`), 7,216 tracked files total.
- Structural metrics (function boundaries, bracket-depth) were computed with a
  small brace-matching script over each candidate file, not eyeballed — see
  Tier 3 for the method and its one caveat (ternary continuation lines
  inflate a naive whitespace-depth measure; the bracket-depth number
  reported is the corrected one).
- Every claimed duplicate/divergence below was opened and read at the quoted
  line numbers before being included.

## Summary

- **2 Tier-1 findings** — the same rule computed in 2+ places that currently
  disagree, one of them a live, unfixed bug (`getInitials`), the other a
  self-documented, still-open divergence (task-overdue timezone).
- **3 Tier-2 findings** — duplication that agrees today but has no shared
  source of truth, so it *will* drift: an inline auth+coach-lookup pattern
  repeated **143 times** across `src/app/golf/actions/*.ts` with no wrapper
  (baseball has one, used 309 times), `formatDate` hand-rolled in **45+**
  files, and a 4-way `getInitials` split.
- **Tier 3** — one 1,990-line single function (`assembleAdminDashboardData`),
  a family of golf action files in the 2,700–8,000 line range with no
  baseball-side counterpart at that scale, and a structural asymmetry: golf's
  business logic sits almost entirely in flat action files, baseball's is
  decomposed into `read-models/`/`adapters/`/`aggregates/` plus a shared
  action wrapper.
- **5 explicitly-rejected candidates** — pairs that look like duplication at a
  glance and are correctly separate; each was opened and checked, not assumed.

---

## Tier 1 — divergence that is or will become a bug

### 1.1 `getInitials`: a fixed bug still ships from two admin panels

The "coach display name with a parenthetical, e.g. `Coach (Demo)`, renders as
`C(` instead of two letters" bug has been found and fixed **independently at
least five times** in this codebase, with an explicit paper trail:

- `src/components/ui/avatar.tsx:50-58` (canonical, exported) — strips
  `[^\p{L}\s'-]+` before splitting into words, with a comment explaining
  exactly why: *"a display name like 'Coach (Demo)' otherwise tokenizes to
  ['Coach', '(Demo)'], and the last token's first character is '(', producing
  'C(' instead of two real letters."*
- `src/components/fairway/controls/avatar.tsx:81-82` — same fix, same comment.
- `src/components/golf/calendar/CalendarAvatarSidebar.tsx:22-23,128` — *"Never
  index `last_name[0]` directly"* for exactly this reason.
- `src/components/golf/calendar/PremiumCalendarClient.tsx:1185` — same guard.
- `src/components/fairway/app-shell/FairwaySidebar.tsx:252` — references the
  "C(" rendering bug as already fixed in the rail.
- `src/lib/types/calendar.ts:91-130` — documents `splitDisplayName()` handling
  the `"(Demo)"` tail as a known input shape.

But two files in the **admin panel** — the surface most likely to actually
show a coach named "Coach (Demo)" — carry a byte-identical, pre-fix
`getInitials` that never received the update:

- `src/app/golf/admin/components/TeamUserDirectory.tsx:63-71`
- `src/app/golf/admin/components/UserDetailPanel.tsx:27-35`

```ts
function getInitials(name: string | null, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
      : (parts[0]?.[0] ?? '?').toUpperCase();
  }
  return (email[0] ?? '?').toUpperCase();
}
```

For `name = "Coach (Demo)"`: `parts = ["Coach", "(Demo)"]`, length ≥ 2, so the
result is `parts[0][0] + parts[-1][0]` = `"C" + "("` = **`"C("`** — the exact
bug the other five call sites were patched against. `getInitials(member.name,
member.email)` is called at `TeamUserDirectory.tsx:189,421` and
`getInitials(name, email)` at `UserDetailPanel.tsx:125`, both rendering coach
avatar initials in the admin coach/user directory, where demo-account names
following the `"X (Demo)"` convention are a documented, live data shape (see
the `(Demo)` grep hits above, plus `src/lib/golf/duplicate-roster-members.ts`'s
own docblock referencing `Demo University Golf (Pat)` as a real production
row).

**Fix**: delete both local copies, import `getInitials` from
`@/components/ui/avatar`. Its signature (`name: string`) doesn't take the
`email` fallback the admin copies use, so the call sites need a one-line
`name || email` before calling it — a five-minute change, not a redesign.

*(A third, non-identical variant lives at
`src/app/golf/admin/components/tracer/TracerRoundInspector.tsx:100-105`,
called on `round.player_name` — player names are less likely to carry a
`(Demo)` suffix, so this one is Tier 2 duplication rather than a confirmed
live bug, but it should consolidate onto the same canonical helper.)*

### 1.2 Golf task "overdue": team-zone vs viewer-zone, self-documented and still live

`src/lib/golf/task-overdue.ts` is unusually explicit about this — its own
docblock (lines 4–56) documents that the product's *intended* rule is
"overdue" decided on the **team's** timezone, and lists a **currently
existing exception**:

- `src/app/golf/(dashboard)/dashboard/team-hub/page.tsx:274` and
  `src/app/golf/actions/player-hub-data.ts:273` (also
  `dashboard-data.ts:776,1204` via an inlined equivalent string-compare) all
  use **`isGolfTaskOverdueInZone(dueDate, teamTimeZone)`** — team-zone,
  correct.
- `src/components/fairway/pages/team/FairwayTeamInfo.tsx:346` uses
  **`isGolfTaskOverdue(task.due_date, now)`** — the *viewer's* zone (`now` is
  the browser's ambient clock), per the same file's own comment at
  `task-overdue.ts:41-53`: *"this is a known divergence, not the intended
  rule... for a player travelling outside the team's zone the same task can
  carry a different badge here than on their hub — up to one day apart."*

Verified both call sites are live and reachable today (Team Info page is
`/dashboard/team` per `golf-feature-ownership.md`, not a redirect shim). Net
effect: a player who travels — e.g. an away tournament in a different time
zone from the team's home zone — can see a task marked "overdue" on
`/dashboard/team` (Team Info) while the same task shows as on-time on the
Team Hub / Player Hub, or vice versa, for up to 24 hours around the due date.
This is tracked technical debt (the docblock explains the reason: `team` prop
on that page carries no timezone, and threading one through means touching
`TeamForClient`, three `golf_teams` selects, and seven test call sites), not
a new discovery — but it is a real, currently-shipping divergence in a rule
that is supposed to be one product decision, worth flagging so it doesn't
silently drop off the backlog.

---

## Tier 2 — duplication worth consolidating

### 2.1 Golf actions inline auth+coach-lookup boilerplate; baseball already solved this

Baseball centralizes "authenticate, resolve the caller's role/team,
capability-check" into one wrapper:

```
git grep -c 'withBaseballAction' -- 'src/**/*.ts' 'src/**/*.tsx'   → 309 call sites
```
(`src/lib/baseball/with-baseball-action.ts`, 725 lines — the shared
implementation.)

Golf has no equivalent. Every golf action function repeats the pattern
inline:

```
git grep -o 'supabase.auth.getUser()' -- 'src/app/golf/actions/*.ts' | wc -l     → 336
git grep -o 'supabase.auth.getUser()' -- 'src/app/baseball/actions/*.ts' | wc -l → 65
git grep -c "from('golf_coaches')" -- 'src/app/golf/actions/*.ts' | awk -F: '{s+=$2} END{print s}'  → 143
```

`golf.ts` alone repeats the identical four-line "look up `golf_coaches` by
`user_id`" query at least 19 times (lines 2269, 2580, 2840, 3164, 3561, 3685,
3802, 3883, 3971, 4245, 4581, 4599, 4645, 5048, 5120, 5189, 5272, 7781, plus
the parallel-query form at 4415), e.g.:

```ts
// golf.ts:2269 and again, verbatim, at 2580, 2840...
const { data: coach } = await supabase
  .from('golf_coaches')
  .select('id, organization_id')
  .eq('user_id', user.id)
  .maybeSingle();
```

Of the 19 in `golf.ts`, 10 use `.maybeSingle()` and 7 use `.single()` for the
*exact same lookup* with no apparent reason for the split — checked the
`.single()` sites (3561, 5048, 5120) for a live bug: they all guard with
`if (coachError || !coach)`, so today the 0-row case degrades identically
either way. It is still a real inconsistency (a `.single()` 0-row result
throws a Postgrest `PGRST116` error object that gets logged as a query
failure at some call sites via `logServerError`, purely as an artifact of
which lookup style a given function happened to copy) and a maintenance trap:
the next person to copy one of the `.single()` call sites as a template, and
who *doesn't* also copy the `coachError ||` guard, reintroduces a real bug.

**Fix**: extract the lookup into one helper (`getCoachByUserId(supabase,
userId)`) and, longer-term, a `withGolfAction` wrapper mirroring baseball's —
the golf side is the one still paying the inline-boilerplate tax baseball
already retired.

### 2.2 `formatDate` reimplemented in 45+ files, no shared source of truth

```
git grep -n 'function formatDate\|const formatDate' -- 'src/**/*.ts' 'src/**/*.tsx' | grep -v '.test.' | wc -l   → 45
```

Sampled implementations show real behavioral variance in how each one guards
(or doesn't) the "DATE-only column parsed as UTC midnight, rendered a day
early west of Greenwich" pitfall — the exact bug class `task-overdue.ts`
spends four paragraphs documenting for a different function:

- `src/app/golf/admin/components/admin-utils.ts:25-33` and
  `src/app/golf/admin/components/DataFreshnessAlerts.tsx:33-40` both guard:
  ``dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00` `` before
  constructing the `Date`.
- `src/components/fairway/pages/qualifiers/FairwayQualifiers.tsx:90-98`
  guards differently (manual Y/M/D parse + local `Date` constructor) with a
  comment citing hydration-mismatch issues `#30/#126`.
- `src/app/baseball/(dashboard)/dashboard/pipeline/PipelineClient.tsx:125-128`
  and `.../watchlist/WatchlistClient.tsx:114-117` do **not** guard — but
  checked their call sites (`item.updated_at`, `item.added_at`,
  `item.created_at`) and those are `timestamptz` columns, not bare dates, so
  the missing guard is not a live bug there (see Explicitly Rejected below —
  flagged and then cleared, not assumed).

No call site imports from a shared date-formatting module despite one
existing for adjacent concerns (`src/lib/golf/date-only.ts`,
`src/lib/golf/timezone.ts`). Each of the 45 reimplementations is a fresh
chance to get the DATE-vs-timestamptz distinction wrong; three of the five
sampled already show three different defensive strategies for the same
underlying problem. Worth a single shared `formatDate(value, {dateOnly})`
utility rather than 45 independent chances to relearn the UTC-midnight trap.

### 2.3 `getInitials` — 4 independent implementations beyond the Tier-1 pair

Beyond the two byte-identical, bug-carrying copies in 1.1:

- `src/components/golf/calendar/AvailabilityDayView.tsx:88-90` — a fourth
  variant, different signature (`{first_name, last_name}` object, not a
  string), same purpose (roster-member avatar initials).
- `src/app/golf/admin/components/tracer/TracerRoundInspector.tsx:100-105` — a
  third variant with its own single-name edge case handling.

Five variants of "turn a name into 1-2 initial letters" across the golf
surface, one canonical (`src/components/ui/avatar.tsx`) and four
reimplementations, none importing the canonical. Consolidate onto one helper
with two thin adapters for the two input shapes (string vs. `{first,last}`).

---

## Tier 3 — nesting / god-files (measured)

Method: brace/paren/bracket-depth tracked per line with comments and string
contents stripped first (script logic below); function boundaries found by
matching `function` declarations to their closing brace. This corrects a
whitespace-only pass that over-counts wherever a multi-line ternary chain
indents its continuation lines — `golf-stats-calculator-shots.ts` looked like
17 levels deep by raw leading-whitespace and is actually 9 by real bracket
depth; the 17 was ternary continuation-line indentation
(`golf-stats-calculator-shots.ts:2262-2264`), not control-flow nesting.

| File | Lines | Max bracket depth | Notable |
|---|---|---|---|
| `src/lib/types/database.ts` | 21,431 | — | Supabase-generated; excluded from judgment |
| `src/app/golf/actions/golf.ts` | 8,037 | 12 (L2095) | 103 function-like decls, 41 exported actions, no shared wrapper (see 2.1) |
| `src/app/golf/actions/insights.ts` | 4,959 | 9 (L939) | `generateTeamInsightsImpl` 328 lines (843–1170); `buildStatInsightsForTeam` 267 lines (3496–3762) |
| `src/app/golf/actions/admin-data.ts` | 3,908 | 11 (L1830) | **`assembleAdminDashboardData`: 1,990 lines, L1918–3907 — one function** |
| `src/lib/utils/golf-stats-calculator-shots.ts` | 3,166 | 9 (L2417) | `calculateHoleStatsFromShots` 281 lines; ternary-chain distance-bucketing (see above) |
| `src/app/golf/actions/stats-data.ts` | 2,841 | 8 (L1431) | `getTeamComparisonImpl` 312 lines; `queryDetailedStatsWithClient` 275; `getSprayChartDataImpl` 263 |
| `src/components/fairway/pages/settings/FairwaySettingsGeneral.tsx` | 2,787 | 11 (L1803) | 10 components in one file; largest (`FairwaySettingsGeneral`) 406 lines; 84 `useState`/`useEffect` calls in the file |
| `src/app/golf/actions/teams.ts` | 2,728 | 8 (L461) | `createTeamJoinRequestImpl` 216 lines; `joinGolfTeamImpl` 211 |
| `src/lib/coachhelm/v2/orchestrator.ts` | 2,636 | 10 (L1124) | one class, ~30 methods, mostly <100 lines each — a god-**class** (alerts + round review + learning + recommendations + reasoning all owned by one `CoachHelmIntelligence`), not a god-function |
| `src/lib/baseball/read-models/player-passport.ts` | 1,438 | 10 (L1223) | baseball's largest read-model; largest function 151 lines — smaller and more decomposed than any golf actions file above |

**The standout**: `assembleAdminDashboardData`
(`src/app/golf/actions/admin-data.ts:1918-3907`) is a single, unbroken
1,990-line function assembling the entire admin dashboard payload — scalars,
signups-by-week, rounds-by-type, player-onboarding breakdowns, cohort
matrices, session heatmaps, error detection, BI funnel — inline, with 21
nested arrow-function callbacks (`.map`/`.filter`/`.reduce`) rather than
named, independently-testable helpers. Verified by reading lines 1918–1960
(function open) and 3880–3908 (function close, `return {...}` object
literal). This is the single largest function-shaped unit found in the
codebase and the clearest nesting/structure finding in this audit.

**Structural asymmetry (golf vs. baseball)**: golf's business logic sits
almost entirely in flat `src/app/golf/actions/*.ts` files (five of them
above 2,700 lines). Baseball decomposed the equivalent logic into
`src/lib/baseball/read-models/*` (largest: `player-passport.ts` at 1,438
lines, largest function 151 lines), `adapters/`, `aggregates/`, plus the
shared `withBaseballAction` wrapper (2.1). This isn't a claim that baseball
is bug-free — its read-model files are still substantial — but the
concentration of 1,000+ and 2,000+ line single functions is specific to the
golf action-file layer, and tracks with golf lacking the decomposition
pattern baseball already adopted.

---

## Explicitly rejected

Checked and cleared — included so the next reader doesn't re-flag them.

1. **`resolve-team.ts` / `resolve-team-server.ts`, golf vs. baseball**
   (`src/lib/golf/resolve-team{,-server}.ts` vs.
   `src/lib/baseball/resolve-team{,-server}.ts`). Read both `-server` files
   in full: both are thin, near-identical wrappers that read a per-product
   cookie (`ACTIVE_TEAM_COOKIE` vs `ACTIVE_BASEBALL_TEAM_COOKIE`) and delegate
   to a per-product `resolveCoachActiveTeamId`. Golf's header comment
   explicitly says it "mirrors the SHAPE of BaseballHelm's proven hub
   pattern" — this is deliberate parallel structure, not accidental
   duplication, and the two resolvers correctly encode different
   staffing/role tables per product. Not a divergence.

2. **`nav-registry.ts`, golf vs. baseball** (585 vs. 1,366 lines). Read both
   file headers: golf's explicitly states it has "no capability gating and no
   program-type variants" by design (flat, always-visible declarations),
   while baseball's explicitly implements both (`isModuleEnabled`,
   `getProgramVariant`, `orderCoachNav`). The size and shape difference is
   documented, intentional product divergence, not a rule that should agree.

3. **`formatDate` in baseball's `PipelineClient.tsx` /
   `WatchlistClient.tsx`** — initially looked like the same "golf has the
   UTC-midnight-shift fix, baseball is missing it" pattern as the
   `getInitials` case (2.2 above). Checked the actual call sites
   (`item.updated_at`, `item.added_at`, `item.created_at`) rather than
   assuming: these are `timestamptz` columns carrying real instants, not
   `DATE` columns, so `new Date(dateString)` without the day-only guard is
   correct there. Confirmed via `task-overdue.ts`'s own warning that this
   exact expression "is a bug in one sport and right in the other, decided
   entirely by the column type" — applied that test rather than pattern-
   matching on the missing guard alone.

4. **`duplicate-roster-members.ts`** (`src/lib/golf/duplicate-roster-members.ts`,
   golf-only, feature #1477). No baseball file of this name or purpose
   exists (`git ls-files | grep -i duplicate` returns only this file and its
   test). Not evidence of a missing baseball parity — it's a one-off,
   golf-specific detector for a golf-specific signup pattern (personal vs.
   institutional email re-registration), documented as such in its own
   docblock with real production examples.

5. **`surface-registry.ts` consumers** — CLAUDE.md claims every CoachHelm
   AI/Stats nav consumer imports from `src/lib/golf/surface-registry.ts`
   rather than hand-writing labels/hrefs. Spot-checked via `git grep -l
   'canonicalName\|surface-registry'` across golf pages/components/lib: 19
   files reference it (rail, sub-nav, `CommandPalette`-adjacent nav
   component, breadcrumb-relevant pages, `nav-registry.ts` itself). No
   hand-written duplicate label/href was found in the sampled set — the
   stated architecture holds up under a spot-check, not just an assertion.

---

## Commands to reproduce the headline numbers

```bash
git ls-files 'src/**/*.ts' 'src/**/*.tsx' | wc -l                                          # 3899
git ls-files 'src/**/*.ts' 'src/**/*.tsx' | xargs wc -l | sort -rn | head -50               # size histogram
git grep -o 'supabase.auth.getUser()' -- 'src/app/golf/actions/*.ts' | wc -l                # 336
git grep -o 'supabase.auth.getUser()' -- 'src/app/baseball/actions/*.ts' | wc -l            # 65
git grep -o 'withBaseballAction(' -- 'src/**/*.ts' 'src/**/*.tsx' | wc -l                   # 309
git grep -c "from('golf_coaches')" -- 'src/app/golf/actions/*.ts' | awk -F: '{s+=$2} END{print s}'  # 143
git grep -n 'function formatDate\|const formatDate' -- 'src/**/*.ts' 'src/**/*.tsx' | grep -v '.test.' | wc -l  # 45
git grep -n 'function getInitials\|const getInitials' -- 'src/**/*.ts' 'src/**/*.tsx'       # 6 (incl. canonical)
```
