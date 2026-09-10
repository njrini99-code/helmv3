<!-- markdownlint-disable MD013 -->
# Qualifiers, `/golf/dashboard/qualifiers` (coach) — v3 field sheet

File of record: `src/components/fairway/pages/qualifiers/FairwayQualifiers.tsx`. Loader: `src/app/golf/(dashboard)/dashboard/qualifiers/page.tsx`. Superseded specs: `qualifiers.md`, `qualifiers.mobile.md` (both described the v2 hero-card pass; this replaces both under LANGUAGE.md's field-sheet language).

Every field cited below is already in the `qualifiers: GolfQualifier[]` prop this page receives **today** — the loader does `supabase.from('golf_qualifiers').select('*')` (`page.tsx:57-59`) against `GolfQualifier = Tables<'golf_qualifiers'>` (`src/lib/types/golf.ts:47`), and the full row shape is at `src/lib/types/database.ts:15713-15733`. That row already carries `entry_deadline`, `selection_state`, `selection_slots_total`, `selection_slots_coach_pick` and `num_rounds` — none of them rendered anywhere in the current component (confirmed: `grep -n "entry_deadline\|selection_state\|num_rounds\|selection_slots" FairwayQualifiers.tsx` returns nothing) even though they already arrive on every page load. This spec's entire composition is built from that unused half of the row. **No loader change is required.**

## The question

Which qualifier is setting the lineup right now, when does its field lock, and is the roster decision already made.

## Masthead

Bare on the canvas, per LANGUAGE.md item 1.

- **Eyebrow**: `QUALIFIERS` — the existing `ViewHeader eyebrow="Qualifiers"` copy (`FairwayQualifiers.tsx:254`), kept verbatim, uppercase caption per the language.
- **Title**: `Lineup decisions.` — the existing `ViewHeader title` copy (`FairwayQualifiers.tsx:255`), `text-display`. Not fabricated; this is the page's real name today.
- **Primary action**: the existing coach-only "Create qualifier" `Button` (`CREATE_HREF`, `FairwayQualifiers.tsx:66,221-228`) moves to the eyebrow row, right, per LANGUAGE.md item 1. No overflow menu exists on this page today and none is invented.
- **Facts line** (mono caption, one line, below the verdict): `{qualifiers.length} qualifiers on file.` — the one honest total that is not already one of the four stage readouts below (which split into Active/Concluded; this is their sum, stated once, the way Home's facts line states a total the readouts don't restate individually, `FairwayCoachDashboard.tsx:272-276`).

### The verdict sentence

Built by a new pure function `buildQualifiersVerdict`, page-local next to the existing pure helpers (new file `qualifiers-field-logic.ts`, mirroring `coach-home-logic.ts`'s `buildVerdict`, `coach-home-logic.ts:158-189`). Inputs, all derived from data already in the prop:

- `hero: GolfQualifier | null` — the **existing** hero-selection logic, reused verbatim: prefer the one `status === 'in_progress'` qualifier, else the `status === 'upcoming'` one with the soonest `start_date` (`FairwayQualifiers.tsx:189-197`, fields `status` at `database.ts:15730`, `start_date` at `database.ts:15729`).
- `activeCount`, `concludedCount` — the **existing** derived counts (`FairwayQualifiers.tsx:143-149`).
- `daysUntil(dateStr)` — a new pure helper, local-midnight parsed the same way `formatDate` already is (`FairwayQualifiers.tsx:100-108`) to avoid the exact UTC/local hydration bug that function's own comment documents (#30/#126) — not a new field, a new day-diff over an existing field.

Template, evaluated top to bottom, each clause appended only when its condition holds:

1. Hero clause (always evaluated):
   - No hero (`activeCount === 0`): `"No qualifier is active right now."`
   - Hero is live (`hero.status === 'in_progress'`): `"{hero.name} is live."` — `hero.name` links to `/golf/dashboard/qualifiers/{hero.id}` (`detailHref`, `FairwayQualifiers.tsx:67`).
   - Hero is upcoming: `"{hero.name} opens {formatDate(hero.start_date)}."` — same link.
2. Entry-deadline clause (only when hero is upcoming AND `hero.entry_deadline` is non-null — never shown for a live hero, since the entry period is definitionally over once play has started, and never fabricated when the field is null):
   - `daysUntil > 0`: `" Entries close {formatDate(hero.entry_deadline)}, {daysUntil} {daysUntil===1?'day':'days'} away."`
   - `daysUntil === 0`: `" Entries close today."`
   - `daysUntil < 0`: `" Entries closed {formatDate(hero.entry_deadline)}."`
3. Lineup-state clause (only when hero exists): `" The lineup is {selectionStateLabel(hero.selection_state ?? 'open')}."` where `selectionStateLabel` maps the real `QUALIFIER_SELECTION_STATES` enum (`src/lib/coachhelm/v3/qualifying/types.ts:12-17`) to prose: `open → "open"`, `scoring → "scoring"`, `closed → "closed, awaiting picks"`, `selected → "decided"`. The `?? 'open'` fallback mirrors the existing defensive read at `qualifiers/[id]/page.tsx:209`, not a new assumption.
4. Pipeline clause (always): `" {activeCount} active, {concludedCount} concluded."`

Worked examples:

- Live, decided: *"Baker Invitational Qualifier is live. The lineup is decided. 2 active, 5 concluded."*
- Upcoming, deadline in 3 days, still open: *"Fall Qualifier opens Oct 4, 2026. Entries close Sep 30, 2026, 3 days away. The lineup is open. 3 active, 4 concluded."*
- Upcoming, no deadline set: *"Spring Qualifier opens Oct 4, 2026. The lineup is open. 1 active, 6 concluded."*
- Nothing active: *"No qualifier is active right now. 0 active, 6 concluded."*

Only one name appears in the verdict (the hero qualifier's own name, linked to its page) because no player identity reaches this loader at all — the list query is `golf_qualifiers.*` with no join to `golf_qualifier_entries` or `golf_players` (contrast the detail route, which does join both: `qualifiers/[id]/page.tsx:62-69`). Naming a qualifier instead of a person is the honest reading of "name people and numbers" for the one screen where the named objects are events, not players.

## The stage

**New page-local instrument, `QualifyingField`** (file `src/components/fairway/pages/qualifiers/QualifyingField.tsx`). No registered primitive fits: `ScoreField` is the closest analog (a shared date axis, one row per subject, LANGUAGE.md's reference instrument) but its bars encode a **signed magnitude against a par baseline** (`ScoreField.tsx:151-155`), and a qualifier has no magnitude — only a time extent. `QualifyingField` reuses `ScoreField`'s axis math directly rather than reinventing it: `dateFraction` is an exported function (`ScoreField.tsx:40-46`) and is imported verbatim to place every mark; nothing about percentage geometry, the min-one-day-span guard, or the motion tokens is re-derived.

**What it plots.** One row per qualifier from the current view (Active or All, see below), each row is one horizontal bar on a shared date axis — the field's entire pipeline in one strip, the way `ScoreField` shows the whole roster's rounds in one strip.

**What each mark encodes:**

- **Position and length (the bar).** Two nested segments, both built from real per-row fields (`start_date`, `end_date`, `entry_deadline`, `database.ts:15719,15720,15729`):
  - Outer track: `min(entry_deadline, start_date)` → `end_date ?? start_date` — the whole life of the qualifier, waiting period included. `min(...)` clamps a data anomaly (a deadline recorded after the start date) so the bar never runs backwards.
  - Inner segment: `start_date` → `end_date ?? start_date` — the actual play window — rendered at full opacity, centered inside the outer track, which is rendered at 20% opacity of the same hue. This is why the bar has real length even for a one-day event with a set deadline: the waiting period from deadline to start is usually weeks, and it is now visible.
  - When `entry_deadline` is null, the outer track collapses to equal the inner segment — a single solid bar at the play span only, minimum width 6px so a same-day qualifier stays visible (mirrors `ScoreField`'s `MIN_BAR_PX` pattern, `ScoreField.tsx:28`). This is a deliberately different look (no visible "waiting" shading) from a row that has a tracked deadline — the honest way to show "we never captured when entries closed" rather than fabricating one.
- **Color (both segments, same hue, two opacities as above).** Two data hues only, per LANGUAGE.md: `status === 'in_progress'` → `bg-accent-500` (green, the live mark); `status === 'upcoming'` AND `daysUntil(entry_deadline)` is between 0 and 7 inclusive → `bg-fw-warning` (amber, "act now"); every other `upcoming` row and every `completed` row → `bg-text-tertiary/70` (the same neutral achromatic mark `ScoreField` already uses for an even/flat round, `ScoreField.tsx:171`, not counted as a third data hue). `accent-500` reused for both the live bar and the Today line (below) is not a second deep-green panel — `ScoreField` itself reuses `accent-500` for both its under-par bars and its own Today tick (`ScoreField.tsx:168,293`) — the ban is on a green *surface*, not a repeated ink color.
- **Height.** A constant 8px pill, vertically centered in a 44px row (matches `ScoreField`'s 44px mobile bar height and general touch-target floor).
- **Baseline.** A 1px hairline through the row's vertical center (`bg-border-strong`, exact treatment `ScoreField.tsx:253`) — not a par-zero line, since there is no signed value here. It exists only as the rail the bar sits on; position along it is the entire value, there is nothing to cap vertically (no analog to `scoreFieldCap` — a qualifier's bar never grows "taller," only longer).
- **Today.** An interior full-height vertical rule (`bg-accent-500`, 1px) at `dateFraction(today, domain)` with a small "Today" label beneath — an *interior* marker, not the right-edge label `ScoreField` uses, because this domain extends into the future (upcoming qualifiers exist beyond today, unlike rounds). Any generated axis tick whose label would land within roughly 6% of the Today line's position has its own label suppressed (tick mark kept, text dropped); Today's own label always wins that space.
- **Right-end readout.** One column, right-aligned mono, header `Spots`: `spots_available` (`database.ts:15728`), em-dash when null. Unlike `ScoreField`'s two end columns (`Avg` + `Trend` — a magnitude and its direction of change), a qualifier row has exactly one static per-row fact worth stating beside the bar: capacity. A second column (`num_rounds`) was considered and dropped — see Risks; it moves to the table instead.

**Row order** (top to bottom): live qualifiers first (by `start_date` ascending), then upcoming qualifiers by `start_date` ascending, then (Active view only) the 5 most recently concluded by `start_date` descending. Ties at identical `start_date` break alphabetically by name — deterministic, and matching the existing precedent that `ScoreField`'s own rows are ordered by standing, not date (`coach-home-logic.ts:111-118`); only the horizontal axis, never row order, carries the date.

**View control** (LANGUAGE.md item 2, "the view control at the right" — absent from the v2 spec, added here): a `Segmented` "Active / All" in the stage header, exactly the responsive pattern Home already uses for its date range (desktop `Segmented`, phone collapses to a `Menu`, `FairwayCoachDashboard.tsx:375-394`). Default `Active`: every `upcoming`/`in_progress` row plus the 5 most recently concluded (`RECENT_CONCLUDED_LIMIT = 5`, the same constant and the same slice the ledger's third column reuses, below — one source of truth). `All`: every qualifier in the list (unfiltered by the table's own search, see The table). The axis domain recomputes on toggle: `domain.start = min(entry_deadline ?? start_date)` across the rows currently shown, `domain.end = max(today, max(end_date ?? start_date))` across those rows, both run through `dateFraction`'s existing min-one-day-span guard (`ScoreField.tsx:41-42`) verbatim.

**What a mark links to.** The whole row is a `<Link>` to `/golf/dashboard/qualifiers/{id}` (`detailHref`, `FairwayQualifiers.tsx:67`) — the read-only detail/leaderboard page, matching what the table's row link does below. (The ledger's "Needs a decision" column links somewhere more specific — the selection workspace — see below; the stage is a look-at-the-field instrument, not a worklist.)

**Degrade, one row.** The instrument renders unchanged: one bar, domain collapsed to that row's own span (still guarded to at least one day), Today drawn wherever it falls relative to that single span (before, inside, or after it).

**Degrade, no rows.** Never reached. The page's existing full-empty branch (`qualifiers.length === 0`, `FairwayQualifiers.tsx:265-288`) fires before the masthead or stage render at all, and — because `qualifiers.length > 0` guarantees every remaining row is classified as either active or concluded (`isActiveStatus`'s `?? 'upcoming'` fallback, `FairwayQualifiers.tsx:139-140`, leaves no row unclassified) — both the Active and All views always have at least one row whenever the stage renders. The stage's row set is deliberately **not** filtered by the table's search box below (see The table), which is what makes this guarantee hold; conflating the two would reintroduce a genuine zero-row case the stage would need to handle.

**Why this beats a table.** A table of `start_date`/`end_date`/`entry_deadline` columns makes a coach read three dates per row and compute overlap and urgency by hand. Here, position and segment length show duration and overlap directly, the track-vs-play-window split shows how long a qualifier has been (or will be) open for entries at a glance, the amber recoloring shows which ones need action inside a week without arithmetic, and the interior Today line shows what's already past versus what's still ahead in one read — the same argument `ScoreField`'s own header comment makes for rounds (`ScoreField.tsx:3-15`).

**Entrance motion.** The same staggered scale-in `ScoreField` already uses for its bars, adapted to a horizontal grow: `initial={{ scaleX: 0, opacity: 0 }}`, `transformOrigin: 'left'`, `animate={{ scaleX: 1, opacity: 1 }}`, `transition={{ duration: DURATION.short, delay: Math.min(index, STAGGER_CAP) * STAGGER_STEP, ease: EASE_CINEMATIC }}` — exact constants reused verbatim (`STAGGER_STEP = 0.012`, `STAGGER_CAP = 16`, `ScoreField.tsx:30-31`; `DURATION`, `EASE_CINEMATIC`, `src/lib/coachhelm/v3/motion.ts:40,49`), guarded by the same `useReducedMotionGuard()` hook `ScoreField.tsx:22,207` already calls.

## Readouts

Four, in the stage's right column (`FieldReadouts` visual recipe reused, `coach-home-parts.tsx:102-134`: eyebrow label, big mono number, caption note — no delta on any of them, since none has a real historical series to compare against and inventing one is banned). Chosen to be **whole-pipeline scalars**, disjoint from the ledger's row-level worklists below (the ledger owns "which ones" and "how many days"; the readouts own "how many total").

1. **Active** — `activeCount`, source `FairwayQualifiers.tsx:143,148` (field `status`, `database.ts:15730`). No delta: a same-instant count, not a trend.
2. **Concluded** — `concludedCount`, source `FairwayQualifiers.tsx:144,149`. No delta.
3. **Open spots** — sum of `spots_available` across the qualifiers counted in Active, treating a null as 0 in the sum (field `database.ts:15728`). Note: when one or more of those qualifiers has `spots_available == null`, the caption reads `"excludes {k} with no spot count set"` rather than silently understating the total. No delta.
4. **Travel squad** — `hero?.selection_slots_total ?? null` (field `database.ts:15726`), em-dash when there is no hero. Note, when present: `"{hero.selection_slots_coach_pick} coach picks"` (field `database.ts:15725`). No delta.

## The ledger row

Three bare columns, unequal widths, `grid-cols-12` with `lg:col-span-5/4/3`, divided by `lg:divide-x lg:divide-border-subtle`, stacked with horizontal hairlines on phone — the exact grid recipe `FairwayCoachDashboard.tsx:434-449` already implements for Home's three-column ledger.

**A · Needs a decision** (`lg:col-span-5`). Rows: qualifiers with `status` in `{upcoming, in_progress}` AND `selection_state !== 'selected'`, sorted `start_date` ascending, capped at 6 (mirrors the existing `attentionOrder` cap pattern, `coach-home-logic.ts:121-125`). Each row: qualifier name (link) + `selectionStateLabel(selection_state)` as a caption. Link target: `/golf/dashboard/coachhelm/qualifying/{id}` — the real selection-workspace route (`src/app/golf/(dashboard)/dashboard/coachhelm/qualifying/[id]/page.tsx`), not the read-only detail page, because this column is an action list: "go make this decision." Empty states: `activeCount === 0` → `"No active qualifier right now."`; otherwise (every active qualifier already `selected`) → `"Every active qualifier has a decided lineup."`

**B · Locking soon** (`lg:col-span-4`). Rows: `status === 'upcoming'` AND `entry_deadline` non-null AND `daysUntil(entry_deadline)` between 0 and 30 inclusive (`LOCKING_SOON_WINDOW_DAYS = 30` — wider than the stage's 7-day urgent-color threshold, so a coach sees a deadline coming before its bar turns amber), sorted soonest-first, capped at 5. Each row: name (link) + a `{N}d` mono countdown. Link target: `/golf/dashboard/qualifiers/{id}` (detail — informational, not an edit surface). This adds the literal day-count number the stage's position can only approximate visually. Empty states: `activeCount === 0` → `"No active qualifier right now."`; no active qualifier has a deadline in the window → `"No entry deadlines coming up."`

**C · Recently concluded** (`lg:col-span-3`). Rows: the same `RECENT_CONCLUDED_LIMIT = 5` slice the stage's Active view already computes (`allConcluded` sorted `start_date` descending, `FairwayQualifiers.tsx:144`, the loader's own native order, `page.tsx:61`) — one source of truth, reused, not recomputed. Each row: name (link) + `end_date ?? start_date` formatted. Link target: `/golf/dashboard/qualifiers/{id}`. Empty state: `"No qualifiers concluded yet."` (matches the existing empty copy, `FairwayQualifiers.tsx:423`).

None of these three columns restate a number the stage shows: the stage's only per-row number is `Spots`, which appears in none of A/B/C; A and B state facts (`selection_state`, day-count) the stage encodes only as color and position, never as digits; C names five objects the stage also plots, exactly the way Home's `RoundsLedgerTable` also lists rounds `ScoreField` already plots — the reference page does this deliberately (`FairwayCoachDashboard.tsx` sections 2 and 4 share every round).

## The table

Replaces the current Active/Concluded seam-list `Surface` (`FairwayQualifiers.tsx:375-430`) with one dense `<table>` per LANGUAGE.md item 4: uppercase caption header over a `border-strong` rule, hairline rows, mono numerals right-aligned, one row is one link.

**Caption row**: `ALL QUALIFIERS` (left) with the existing search + status controls relocated into it (right) — the same `SearchField` and three-`FilterPill` group already implemented (`FairwayQualifiers.tsx:301-345`), reused verbatim, just moved from a standalone `Toolbar` region into the table's own header instead of a fourth independent page region. This filtering is independent of the stage's Active/All toggle (see The stage) — the table's search narrows the table only.

Columns, left to right:

| Column | Align | Below md | Below lg | Source |
|---|---|---|---|---|
| Name | left, truncate | shown | shown | `name`, `database.ts:15722` |
| Status | left, `StatusPill` | shown | shown | `status` via `qualifierStatusMeta`, `qualifier-status.ts:37-51` |
| Start | right, mono | shown (compact) | shown | `start_date`, `database.ts:15729` |
| End | right, mono | **hidden** | shown | `end_date`, `database.ts:15719` |
| Entry deadline | right, mono | **hidden** | shown | `entry_deadline`, `database.ts:15720` — new to the UI, already in the row |
| Rounds | right, mono | **hidden** | shown | `num_rounds`, `database.ts:15723` — see Risks |
| Spots | right, mono | **hidden** | shown | `spots_available`, `database.ts:15728` (existing column, `FairwayQualifiers.tsx:576-578`) |
| Course | left, truncate | **hidden** | **hidden**, `lg:table-cell` | `course_name`, `database.ts:15715` (existing, `FairwayQualifiers.tsx:580-582`) |
| Lineup | left, caption | **hidden** | **hidden**, `lg:table-cell` | `selectionStateLabel(selection_state)`, `database.ts:15727` |

**Row link**: the accessible pattern `RoundsLedgerTable` already uses, not the current div-based whole-row `<Link>` — `<tr onClick={() => router.push(href)}>` with a real `<Link>` in the Name cell for keyboard/focus (`coach-home-parts.tsx:264-273`), since this section is now a real `<table>` rather than a list of link-wrapped divs.

**Row count / "view all"**: 10 rows, same priority order as the stage (live, then upcoming ascending, then concluded descending), matching the current search/status filter. `View all {N}` expands the same table in place rather than navigating away — there is no separate "all qualifiers" destination to link to; this page already is that listing. This reuses the existing `concludedVisible` / `CONCLUDED_PAGE_SIZE` state mechanism (`FairwayQualifiers.tsx:137,177-178,400-414`), generalized from "the concluded bucket only" to "the whole table."

## Phone

Same order, one column: masthead, stage, readouts, ledger, table.

- **Masthead**: unchanged, already one column.
- **The stage**: `QualifyingField`'s identity (name + `StatusPill`) stacks above the full-width bar strip, and the `Spots` end-column moves up beside the identity row — the exact CSS-only reflow `ScoreField` already ships (`grid-cols-[minmax(0,1fr)_auto_auto]` on phone versus `md:grid-cols-[var(--sf-identity)...]` on desktop, the bar area as `col-span-3` under the identity row, `ScoreField.tsx:234,252`). Axis ticks drop to monthly cadence only below `md` (regardless of the domain's actual span, to avoid crowding a ~360px strip); the Today-line collision rule (suppress a colliding tick's label, keep Today's) applies identically. The `Segmented` view control collapses into the `Menu` fallback exactly as Home's does (`FairwayCoachDashboard.tsx:378-394`).
- **Readouts**: the same 2×2 typographic grid `FieldReadouts` already renders below `lg` (`grid-cols-2 gap-x-6`, `coach-home-parts.tsx:104`), sitting above the stage's instrument on phone per LANGUAGE.md's phone rule.
- **The ledger row**: stacks to one column, horizontal hairlines between A/B/C instead of vertical dividers (`divide-x` becomes `divide-y`, same LANGUAGE.md rule item 3).
- **The table**: `End`, `Entry deadline`, `Rounds`, `Spots`, `Course` and `Lineup` all drop via the `hidden md:table-cell` / `hidden lg:table-cell` classes in the column table above; `Name` and `Status` remain, `Start` remains in its compact single-date form.

Every branch above is a Tailwind breakpoint class (`md:`, `lg:`), never JS state: confirmed no `useMediaQuery`, `matchMedia`, `window.innerWidth` or similar exists anywhere in the qualifiers folder today (`grep -rn "useMediaQuery\|innerWidth\|matchMedia\|window\.\|isMobile\|isDesktop" src/components/fairway/pages/qualifiers/*.tsx` returns nothing), and this spec introduces none.

## What this deletes

- `QualifierHero` (the `Elevated` live-qualifier block, `FairwayQualifiers.tsx:496-532`) — replaced by the masthead verdict plus the stage.
- The Active/Concluded seam-list `Surface`, its `SeamHeading` (`FairwayQualifiers.tsx:442-448`) and `QualifierRow` (`FairwayQualifiers.tsx:541-594`) — replaced by the dense table.
- `QualifierMeta` (the calendar/spots/course icon row used inside the hero, `FairwayQualifiers.tsx:453-484`) — its `formatDate` call is reused, its icon-row presentation retires.
- The standalone `Toolbar` region (`FairwayQualifiers.tsx:299-346`) as an independent page region — its `SearchField` and `FilterPill` trio are reused verbatim but relocated into the table's own caption row.
- The `meta` count-chip prop passed to `ViewHeader` (`FairwayQualifiers.tsx:231-248,261`) — superseded by the masthead's verdict sentence and single-fact facts line.
- The "no matches left after filtering, only the hero survived → render nothing" branch (`FairwayQualifiers.tsx:370-373`) — with search now scoped to the table only (not the hero/stage), this branch's premise (the hero disappearing along with the filtered list) no longer applies.

Kept, unchanged: `qualifierStatusMeta` (`qualifier-status.ts`), `formatDate`, `detailHref`, `CREATE_HREF`, the coach-only gating (`isCoach`), the full-empty `EmptyState` for zero qualifiers (`FairwayQualifiers.tsx:265-288`), and the "no matches" `EmptyState` for the table's own search (`FairwayQualifiers.tsx:350-369`, now scoped to the table instead of the whole page).

## Risks

- **`num_rounds` reliability is unresolved, which is exactly why it is not in the stage.** `qualifiers/[id]/page.tsx:187-192` reads it defensively with a comment calling it "a Feature-G column not yet in the generated types (migration unapplied)," while `database.ts:15723` lists `num_rounds: number` as a required (non-optional, non-nullable) `Row` field. One of these is stale. Before shipping the `Rounds` table column, confirm in every environment that the migration adding `num_rounds` is applied and the generated types are current — if not, the column should render an em-dash fallback rather than a possibly-wrong number, matching the defensive read already at `qualifiers/[id]/page.tsx:187-192`.
- **The "Concluded" count and the ledger's "Recently concluded" slice are all-time, not seasonal.** The loader has no season boundary — `.order('start_date', { ascending: false }).limit(1000)` (`page.tsx:61-67`) — so a multi-year program's `concludedCount` readout and the verdict's "{N} concluded" clause could include qualifiers from prior seasons, reading as if they belong to the current one. Not a defect to fix here, but worth flagging before a coach relies on the number as "this season's" tally.
- **`entry_deadline` is nullable and, per the current grep, has never been surfaced in this UI before.** Its accuracy for older qualifiers created before the column was in use is unverified; a null is handled honestly throughout (no waiting-segment shading, no ledger row, no masthead clause) but a *wrong* non-null value would silently mis-color a bar or mis-state a countdown. Worth a quick data spot-check before shipping.
- **Two simultaneous `in_progress` qualifiers are technically possible** (nothing in the schema enforces at most one) — the existing hero-selection logic only ever names one in the verdict (`FairwayQualifiers.tsx:189-197`, reused as-is). The stage still draws every live row correctly (each gets its own accent-500 bar); only the masthead's single named hero would under-report a genuine second live qualifier. Flag for coach-facing QA rather than a required fix, since the underlying data shape makes it rare in practice (one qualifying event at a time per team).
- **Declined enhancement, stated so it isn't silently assumed later**: an entrant-count or leaderboard peek on this list page (what the prior `qualifiers.md` spec wanted and flagged as a data risk) is deliberately **not** part of this composition — the list loader has no join to `golf_qualifier_entries` or `golf_rounds`. Adding one later would mean joining `golf_qualifier_entries` the way `qualifiers/[id]/page.tsx:62-69` already does for the detail route, plus a rounds-by-`qualifier_id` query like `qualifiers/[id]/page.tsx:106-111` — a real loader change, out of scope here, and not required by anything in this spec.

**newFields: none.** Every fact this spec uses — `start_date`, `end_date`, `entry_deadline`, `status`, `spots_available`, `num_rounds`, `selection_state`, `selection_slots_total`, `selection_slots_coach_pick`, `course_name`, `name`, `id` — already arrives in the `qualifiers` prop today, because the loader selects `*` (`page.tsx:57-59`) against the full `golf_qualifiers` row (`database.ts:15713-15733`). Nothing here requires a schema change, a new query, or a new join.
