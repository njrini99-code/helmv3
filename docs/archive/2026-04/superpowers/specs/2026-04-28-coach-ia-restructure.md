# Coach CoachHelm IA Restructure — Design Memo

**Date:** 2026-04-28
**Author:** Agent 15 (design analysis only — no code changes proposed)
**Status:** Recommendation pending product decision
**Scope:** Information architecture for the seven coach-facing CoachHelm surfaces

---

## 1. Problem statement

Coach feedback: "the whole CoachHelm UI feels unorganized." Tonight's surgical pass
(timeframe badges, source chips, dedupe between What's New and the alert feed,
hierarchy fixes) made each surface look better in isolation, but the *set* of
surfaces still doesn't tell a coherent story. There are seven routes, three of
them answer overlapping questions, and only two are exposed in the sidebar
(`GolfSidebar.tsx` lines 45, 48 — "CoachHelm AI" → `/intelligence`, "Development"
→ `/development`). The rest are reached through deep links or stale bookmarks.

This memo inventories each surface, groups them by the coach mental model, and
recommends an IA path.

---

## 2. Surface inventory

| Route | Primary file | Purpose | Coach question answered | Overlap |
|---|---|---|---|---|
| `/dashboard/insights` | `dashboard/insights/page.tsx` + `InsightsPageContent.tsx` | Master, filterable feed of evidence-backed insights for the coach. Search, filters, bulk acknowledge/dismiss, export, focus-area conversion. Reads via `getInsightsForCoach` (action `insight-delivery`). | "Show me everything CoachHelm has flagged, let me triage." | Same data source as `/alerts`. |
| `/dashboard/alerts` | `dashboard/alerts/page.tsx` (client) | Older "Player Alerts" feed; same data via `getInsightsForCoach`, severity tabs, hero+stack layout. Has a "Scan Team" button that calls `generateAlerts`. Not in the sidebar. | "What needs my attention right now (severity-led)?" | 95% redundant with `/insights`; the only unique affordance is the Scan Team trigger. |
| `/dashboard/patterns` | `dashboard/patterns/page.tsx` + `PatternsDashboardClient.tsx` | Pattern library — coach-facing validation/management of `golf_patterns_v2` (validate/dispute/promote). | "Are the patterns CoachHelm has detected real?" | Some patterns surface as insights too — but the *action* (validate vs. acknowledge) is distinct. |
| `/dashboard/intelligence` | `dashboard/intelligence/page.tsx` | "CoachHelm AI" landing surface in the sidebar. Renders `TeamCompositeCard`, `TeamShotOverview`, `TeamCategoryView`, plus `IntelligenceCommandCenter` widget. Team-level rollups by category. | "How is my team trending across categories?" | Pulls from category insights (`getTeamCategoryInsights`); leaks into per-player insight surfaces. |
| `/dashboard/analytics/coachhelm` | `dashboard/analytics/coachhelm/page.tsx` | Effectiveness of the AI itself: insight outcomes, prediction accuracy, pattern impact (`coachhelm-analytics.ts`). | "Is CoachHelm actually helping? How accurate are its calls?" | Distinct lens — meta, not player-facing. |
| `/dashboard/development` | `dashboard/development/page.tsx` + `development-client.tsx` | Coach-curated focus areas (`golf_player_focus_areas`) per player, with stats prepop. | "What am I working on with each player?" | Insights can be *promoted* into focus areas — this is the action sink, not an insight surface. |
| `/dashboard/whats-new` | `dashboard/whats-new/page.tsx` | New lifecycle activity feed (last 7 days): insights detected/resolved/matured, patterns validated, focus areas created/completed. | "What changed on my team this week?" | Pulls events from the same lifecycle that powers Insights/Patterns/Development — but framed as a chronological digest, not a triage list. |

---

## 3. Coach mental-model grouping

Coaches (per recent feedback and the existing sidebar copy) think in three modes:

**Today / Operate ("what needs me now")**
`/insights`, `/alerts`, `/whats-new`. All triage-flavored, all evidence-backed,
all read from insight + lifecycle events.

**Trends / Understand ("how is my team / my AI's mental model")**
`/intelligence`, `/patterns`. Team-level shape and the patterns underneath.

**Effectiveness / Trust ("is the AI working")**
`/analytics/coachhelm`. Meta — closes the loop on whether insights changed
behavior.

**Action / Curate ("what I'm working on with each player")**
`/development`. The downstream sink for everything above.

The present nav exposes `/intelligence` and `/development` only, which means
coaches see the "Understand" entry point and the "Curate" entry point, but the
"Operate" cluster (insights, alerts, what's-new) and the "Effectiveness" cluster
(analytics) are effectively buried. That mismatch is the root of "feels
unorganized."

---

## 4. IA options

### Option A — Aggressive consolidation (2 surfaces)

Collapse the seven routes into two top-level CoachHelm destinations:

- **`/dashboard/coachhelm`** (rename `/intelligence`): single hub with three
  tabs — "Today" (merged Insights + What's New feed + Scan Team button from
  Alerts), "Trends" (current `/intelligence` rollups + Patterns inline as a
  sub-tab), and "Effectiveness" (current `/analytics/coachhelm` content).
- **`/dashboard/development`**: unchanged — the action sink stays its own
  destination because focus areas have a distinct CRUD workflow.

`/alerts`, `/patterns`, `/intelligence`, `/analytics/coachhelm`, `/whats-new`,
`/insights` all redirect to the new tabbed hub with the right tab pre-selected.

**Tradeoffs:**
- Pros: matches the mental model 1:1, kills the "where do I go?" decision
  fatigue, makes the sidebar one row instead of two.
- Cons: large blast radius. Bookmarks to `/insights?priority=urgent` need query
  preservation through the redirect. The Insights filter UI is heavy
  (`InsightFiltersPanel`, `InsightSearchBar`, `InsightListView`,
  `InsightBulkActions`, `InsightExportModal`) — fitting it inside a tab without
  losing density is non-trivial. Patterns has its own dispute/validate
  workflow that may not feel right as a sub-tab. Will need a feature flag to
  ship safely.

### Option B — Grouping only (keep all 7 routes, restructure nav)

Keep every route. Update `GolfSidebar.tsx` (lines 44-59) to expose a "CoachHelm"
section with three children:

- **CoachHelm AI** (`/intelligence`) — landing
- **Insights** (`/insights`) — promoted from hidden to first-class
- **What's New** (`/whats-new`) — promoted from hidden to first-class

Move secondary surfaces to a "More" overflow or expose them as cross-links from
the landing page:

- Patterns → linked from `IntelligenceCommandCenter`
- Analytics → linked from a "How accurate is CoachHelm?" footer card on
  `/intelligence`
- Alerts → **deprecate**, redirect to `/insights` (it's 95% the same data; the
  Scan Team button moves to the Insights toolbar)

Add cross-links between sibling surfaces (Insights → Patterns context, Insights
→ "Promote to focus area" → Development, Intelligence → Analytics).

**Tradeoffs:**
- Pros: small blast radius, keeps deep links and bookmarks intact, no big
  migration. Solves the discoverability half of the problem cheaply.
- Cons: doesn't solve overlap — `/insights` and `/intelligence` still
  technically answer adjacent questions, and `/whats-new` vs `/insights` is
  still two feeds in the same cluster (we deduped them tonight, but they're
  still two entries in the nav).

### Option C — Status quo + cleanup (minimum viable)

- Drop `/alerts` (redirect to `/insights`) — it's redundant with the new
  Insights surface.
- Add `/whats-new` to the sidebar under "CoachHelm AI" as a sub-item or
  inline header link.
- Polish the existing nav copy: rename "CoachHelm AI" → "CoachHelm" (the "AI"
  suffix has been migrated into the Helm brand), add a tooltip explaining
  "Team intelligence."
- Cross-link from `/intelligence` to `/insights`, `/patterns`, and
  `/analytics/coachhelm` via clearly labeled cards in the existing layout.

**Tradeoffs:**
- Pros: zero migration risk. Ships in a day. Gets the user the discoverability
  win for What's New and stops the duplicate Alerts feed.
- Cons: doesn't fix the underlying "two adjacent answers to the same question"
  problem. The user said "feels unorganized" — this only nudges the perception.

---

## 5. Recommendation

**Recommend Option B (grouping + Alerts deprecation).** Reasoning:

1. The mental-model mismatch is real but the *content* of each surface is
   already correct — Insights has heavy filter UX that earns its own page,
   Patterns has a distinct validate/dispute workflow, Analytics is a meta
   dashboard with its own visual language. Folding them into tabs (Option A)
   risks regressing each one's usability while we're still iterating on them.
2. The cheapest, highest-impact fix is making the surfaces *discoverable* and
   *related*, not unifying them. Today the sidebar shows two of seven — that
   is the bug.
3. Killing `/alerts` is uncontroversial and removes the most jarring
   redundancy. Tonight's dedupe work between Alerts and What's New already
   hints at this direction.

**Blast radius if we go Option B:**
- `GolfSidebar.tsx` — add 2 entries, optionally group under a "CoachHelm"
  parent.
- `/alerts` route — replace `page.tsx` with a `redirect('/golf/dashboard/insights')`.
  Move the "Scan Team" affordance into the Insights toolbar.
- Cross-link cards on `/intelligence` and `/insights` — additive.
- **No route renames**, **no bookmark breakage** other than `/alerts` (which
  was already hidden from the sidebar so external bookmark exposure is low).
- **No player-surface impact** — none of these routes are player-visible
  (`/coachhelm`, `/my-development`, `/my-qualifiers` all live on a separate
  branch in `GolfSidebar.tsx` lines 65-72).

We should revisit Option A in 2-3 quarters once Insights' filter UX is
stable enough to live inside a tab, or once usage data shows that coaches
genuinely don't context-switch between Insights/Intelligence/Patterns.

---

## 6. Open questions for product

1. **Alerts deprecation:** is anyone relying on the `/alerts` URL externally
   (email links, integrations)? If yes, keep the redirect long-term; if no,
   we can sunset it after a release.
2. **What's New scope:** should it stay 7 days, or grow into a full activity
   log? Today's implementation hard-codes 7 in `getWhatsNewForCoach`.
3. **Patterns visibility:** should `/patterns` be a full sidebar entry or
   stay a contextual link from `/intelligence`? Coaches who actively
   validate patterns may want it pinned.
4. **Sidebar grouping:** does the existing sidebar primitive support a
   collapsible "CoachHelm" section, or do we need to add one? (Quick read of
   `GolfSidebar.tsx` suggests it's a flat list today — adding nesting is its
   own design decision.)
5. **Analytics positioning:** is `/analytics/coachhelm` the right home, or
   should it live under a future generic `/analytics` parent alongside
   team/player stats? Decision affects whether the route stays or moves.
6. **Naming:** "CoachHelm AI" vs "CoachHelm" vs "Intelligence" — do we have a
   product-side preference yet? The sidebar uses "CoachHelm AI"; the page
   header on `/intelligence` says "CoachHelm AI"; the docs say "CoachHelm."

---

## 7. Files referenced

- `src/app/golf/(dashboard)/dashboard/insights/page.tsx`
- `src/app/golf/(dashboard)/dashboard/insights/InsightsPageContent.tsx`
- `src/app/golf/(dashboard)/dashboard/alerts/page.tsx`
- `src/app/golf/(dashboard)/dashboard/patterns/page.tsx`
- `src/app/golf/(dashboard)/dashboard/intelligence/page.tsx`
- `src/app/golf/(dashboard)/dashboard/development/page.tsx`
- `src/app/golf/(dashboard)/dashboard/analytics/coachhelm/page.tsx`
- `src/app/golf/(dashboard)/dashboard/whats-new/page.tsx`
- `src/components/golf/layout/GolfSidebar.tsx` (lines 44-80 — coach + player nav arrays)
- `src/app/golf/actions/insight-delivery.ts` (`getInsightsForCoach`)
- `src/app/golf/actions/whats-new.ts` (`getWhatsNewForCoach`)
- `src/app/golf/actions/coachhelm-analytics.ts`
- `src/app/golf/actions/team-category-insights.ts`
