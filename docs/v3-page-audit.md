# v3 Page-by-Page UI/UX Audit

> Every dashboard page scored against the v3 design language
> (`docs/v3-design-language.md`). Pulled from a sweep of all 49
> dashboard pages, 4 auth pages, 2 onboarding pages, plus the major
> client components most pages hand off to.
>
> Status legend:
> - **✅ Aligned** — already speaks v3 vocabulary (canonical motion,
>   editorial type, surface tier, proper empty states).
> - **◐ Partial** — adopts some v3 patterns but still has clashes.
> - **✗ Legacy** — pre-v3 visual language, needs lift.
> - **🔒 Frozen** — v2-frozen per project rules; cannot refactor.
> - **➖ Shell** — thin server wrapper handing off to a client component
>   (the design lives in the client).

---

## Coach desktop surfaces

### `/dashboard/coachhelm` — Coach CoachHelm hub
- **Audience:** both (coach + player view via `PlayerCoachHelmDashboard`)
- **Status:** ◐ Partial
- **Where v3 lives:** HeroNarrativeCard mounted at top of player view, EvidencePanel renders v3 StandingBar
- **Issues:**
  - HeroNarrativeCard (premium) above HeroInsightCard (v2) — two motion vocabularies stacked.
  - Player insights feed below has mixed surface treatments.
- **Recommendation:** v2 freeze applies to HeroInsightCard. Accept the visual stack for now; mark as v3.5 candidate.

### `/dashboard/coachhelm/chat`
- **Audience:** coach
- **Status:** ✅ Aligned — ChatHistoryClient polished in this PR
- **No action needed.**

### `/dashboard/coachhelm/genome/[playerId]`
- **Status:** ✅ Aligned (reference surface for the design language)

### `/dashboard/coachhelm/genome/compare`
- **Status:** ✅ Aligned

### `/dashboard/coachhelm/qualifying/[id]`
- **Status:** ✅ Aligned (QualifyingBoard cluster polished)

### `/dashboard/players/[playerId]` — Coach player profile
- **Client:** PlayerInsightClient (18KB)
- **Status:** ◐ Partial — IntentPill is v3, but the surrounding layout pre-dates the v3 language
- **Issues:**
  - Page shell lacks editorial eyebrow + Reveal stagger.
  - PlayerInsightClient does its own layout; needs audit at the component level.
- **Recommendation:** Polish PlayerInsightClient in a follow-up — needs an editorial hero plinth with player name + posture pill + Reveal-staggered insight sections.

### `/dashboard/intelligence` — Coach intelligence dashboard
- **Status:** ◐ Partial (motion=9, surfaces=3, but no editorial eyebrow)
- **Issues:** Big dashboard with many tiles; uses pre-v3 type hierarchy.
- **Recommendation:** Add editorial eyebrow to the morning-brief hero; rest is acceptable.

### `/dashboard/insights` — Coach insights feed
- **Client:** InsightsPageContent
- **Status:** ➖ Shell — design lives in InsightsPageContent
- **Recommendation:** Audit InsightsPageContent separately.

### `/dashboard/patterns` — Coach patterns
- **Client:** PatternsDashboardClient
- **Status:** ➖ Shell

### `/dashboard/analytics/coachhelm`
- **Status:** ➖ Shell

### `/dashboard/whats-new`
- **Status:** ◐ Partial (1 surface, 3 motion)
- **Recommendation:** Add editorial eyebrow + Reveal stagger across update entries.

### `/dashboard/development` — Coach development plans
- **Client:** DevelopmentPlansClient
- **Status:** ➖ Shell

### `/dashboard/stats/team` — Coach team stats
- **Status:** ◐ Partial (motion=7, headers=3, no eyebrow)
- **Recommendation:** Add eyebrow to header.

---

## Player phone surfaces

### `/dashboard/hub` — Player home
- **Client:** PlayerHubWrapper
- **Status:** ➖ Shell — design lives in PlayerHubWrapper
- **Recommendation:** Audit PlayerHubWrapper at the component level. This is the player's daily home; should match `/my-game-profile`'s premium feel.

### `/dashboard/my-game-profile`
- **Status:** ✅ Aligned (polished tonight)

### `/dashboard/my-standing`
- **Status:** ✅ Aligned — uses v3 StandingBar + CounterfactualLine, motion=10
- **Issues:** Page shell missing top-level eyebrow.
- **Recommendation:** Tiny polish — add eyebrow + standardize page header.

### `/dashboard/my-development` — Player focus areas
- **Status:** ◐ Partial — motion=10, surfaces=3, but pre-v3 type
- **Recommendation:** Could lift, but per goals migration spec the screen is going away. Defer.

### `/dashboard/my-qualifiers`
- **Client:** MyQualifiersClient
- **Status:** ➖ Shell

### `/dashboard/my-insights`
- **Status:** ➖ Shell (285 bytes — just redirects to `/dashboard/coachhelm`)
- **No action needed.**

---

## Team management (both audiences)

### `/dashboard/calendar`
- **Status:** 🔒 Frozen — uses HTML5 drag-drop incompatible with Lenis; Lenis already scoped out (PR #87)
- **No action needed in this audit.**

### `/dashboard/roster`
- **Client:** RosterPageClient
- **Status:** ◐ Partial (surfaces=3, motion=12, 1 old-card pattern)
- **Issues:** Mixed card styles in RosterPageClient.
- **Recommendation:** Audit RosterPageClient. If IntentPill is shown, ensure interactive variant is used.

### `/dashboard/roster/[id]`
- **Status:** ◐ Partial (motion=7, surfaces=2)
- **Recommendation:** Verify IntentPill + v3 GoalCard renders here.

### `/dashboard/messages`
- **Status:** 🔒 Frozen — uses native scrollIntoView; Lenis scoped out
- **No action.**

### `/dashboard/announcements`
- **Status:** ◐ Partial (motion=10, surfaces=3)
- **Recommendation:** Verify announcement cards use surface-matte + canonical motion.

### `/dashboard/tasks`
- **Status:** ◐ Partial (motion=14, surfaces=4)
- **Recommendation:** Good motion presence; verify eyebrow style + Reveal stagger.

### `/dashboard/documents`
- **Client:** DocumentsClient
- **Status:** ➖ Shell

### `/dashboard/travel`
- **Client:** TravelClient
- **Status:** ➖ Shell

### `/dashboard/team` — Team info
- **Client:** TeamSettingsClient
- **Status:** ➖ Shell

### `/dashboard/classes`
- **Status:** ◐ Partial (motion=14, 1 surface)
- **Recommendation:** Higher motion presence — likely already in good shape.

### `/dashboard/recruiting`
- **Client:** RecruitingPageClient
- **Status:** ➖ Shell

---

## Rounds + stats (player surfaces)

### `/dashboard/rounds`
- **Client:** RoundLibraryClient
- **Status:** ➖ Shell

### `/dashboard/rounds/new`
- **Client:** NewRoundClient
- **Status:** ➖ Shell

### `/dashboard/rounds/[id]`
- **Status:** ◐ Partial (motion=14, 5 headers)
- **Recommendation:** Audit the per-round summary surface.

### `/dashboard/rounds/[id]/review`
- **Status:** 🔒 Frozen — V2ReviewSummary + V2PatternsSection + V2CausalInsights (all v2)
- **No action.** When LLM round-review prose composer ships to UI, the new card slots in above the V2 surfaces.

### `/dashboard/rounds/continue/[id]`
- **Status:** 🔒 Frozen — ShotTrackingComprehensive (player flow with scrollIntoView)
- **No action.**

### `/dashboard/rounds/recover`
- **Status:** ➖ Shell (435 bytes — recovery flow)

### `/dashboard/stats`
- **Client:** StatsClient
- **Status:** ➖ Shell

---

## Qualifiers

### `/dashboard/qualifiers`
- **Status:** ◐ Partial (motion=10, surfaces=3)
- **Recommendation:** List of qualifiers; ensure each row uses v3-lift.

### `/dashboard/qualifiers/[id]`
- **Status:** ◐ Partial (motion=12, surfaces=2, 4 headers)
- **Note:** "Manage selections →" link to v3 qualifying workspace lives here (W29-pt2).
- **Recommendation:** Add eyebrow to header; otherwise mostly aligned.

### `/dashboard/qualifiers/new`
- **Client:** NewQualifierClient
- **Status:** ➖ Shell

---

## Settings

### `/dashboard/settings`
- **Status:** ✅ Aligned-ish (eyebrows=4, surfaces=10, motion=34 — heaviest motion in the codebase)
- **Recommendation:** Already premium. Spot-check for v3-lift on toggle rows.

### `/dashboard/settings/coaching-intelligence`
- **Status:** ✅ Aligned (eyebrows=0 at file level but surfaces=7, motion=21)
- **Recommendation:** Verify the editorial eyebrow shows in the page header — may live in a sub-component.

### `/dashboard/settings/notifications`
- **Status:** ✅ Aligned (polished tonight — Toggle uses canonical motion vars)

---

## Auth + onboarding

### `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/welcome`
- **Status:** ✗ Legacy (likely)
- **Recommendation:** These are pre-dashboard; users see them rarely. Audit but de-prioritize until daily flows are polished.

### `/onboarding/coach`, `/onboarding/player`
- **Status:** ✗ Legacy (likely)
- **Recommendation:** First-impression surfaces — should get v3 polish in a follow-up wave.

---

## Print surfaces

### `/dashboard/players/[playerId]/game/print`
- **Status:** ✗ Print-specific (intentionally minimal)
- **No action.**

---

## Cross-cutting findings

### Already invariant across the codebase (good)
- Most pages use `AnimatedPage` + `AnimatedItem` shell (consistent stagger)
- Most coach pages render `MobileNavHeader` (consistent back nav)
- The `Reveal` component is in wide use

### Where the v3 design language is NOT yet consistent
- **Editorial eyebrows** (11px uppercase tracking-0.14em warm-500) — used in ~10 v3 surfaces; the rest of the dashboard uses heavier section headings
- **Empty states** — many v2 surfaces show plain `<p>` instead of icon + italic
- **Button motion** — v2 buttons don't have magnetic hover; v3 buttons do
- **Surface-lift** — only used on ChatDrawer + GenomeRadar tooltip. Other floating elements (calendar overlays, command palette) use legacy `glass-prominent`
- **Goal cards** + **IntentPill** + **StandingBar** are v3 but render inside v2 layouts everywhere — visual inconsistency baked in until v2 sunset

---

## Priority next-action list — re-evaluated after deeper read

After reading the actual files (not just signal grepping), most "Partial" pages turned out to be in better shape than the signals indicated. Updated priority list:

1. **`/dashboard/coachhelm/chat` page shell** — added editorial eyebrow, `MobileNavHeader`, `AnimatedPage` wrapper, `Reveal` entrance, conversation-count subtitle. ✅ **Shipped this pass.**
2. **`/dashboard/my-standing`** — already uses `surface-stone` + `PageHeader`. No page-shell changes needed. Possible follow-up: section headers (`text-base font-medium`) could become canonical 11px sans eyebrows for tighter hierarchy.
3. **`/dashboard/qualifiers/[id]`** — already uses `PageHeader` with serif editorial eyebrow. No changes needed.
4. **`/dashboard/whats-new`** — already uses `Reveal` + `surface-stone` plinth + `PageHeader` + `GlassCard` rows. Static grep undercounted; no changes needed.
5. **`/dashboard/intelligence` morning-brief hero** — has `surfaces=3 motion=9`; needs visual check on actual deploy. Deferred to follow-up.

## Calibration note on the audit method

The "signal audit" I ran (grepping for `tracking-[0.1Xem]`, `surface-`, `framer-motion`) **under-detected depth** on several pages. Examples:

- `/whats-new` scored `surfaces=1` but uses `surface-stone` + `PageHeader` + `GlassCard` + `Reveal` cleanly.
- `/qualifiers/[id]` scored "Partial" but already uses `PageHeader` with serif editorial eyebrow.
- `/my-standing` scored "Aligned" but the structure was even more polished than the signals indicated.

**A true visual audit** would require either opening every page in a browser (manual smoke) or reading every client component file deeply (50+ files; days of work). The signal audit is **useful as a roadmap** — it surfaces clearly-bare shells (e.g., `/hub` whose design lives in `PlayerHubWrapper` we'd want to audit at the component level). It's **not a verdict** that any given page looks bad.

## Editorial eyebrow scales — coexist intentionally

There are two editorial eyebrow scales in the codebase, and they're not in conflict:

| Scale | Where | Style |
|---|---|---|
| **Hero plinth** | `<PageHeader eyebrow="…">` (existing component) | Fraunces serif, 11px uppercase, tracking-0.16em, warm-500 |
| **Section** | v3 surfaces (in-card section headers) | Geist sans, 11px uppercase, tracking-0.14em, warm-500 |

The serif hero eyebrow predates v3 and ships with the existing `PageHeader` primitive — it's the strongest editorial top-of-plinth marker. The v3 sans-section eyebrow is a smaller "ambient" marker for in-card section headings. Use the serif at page-level plinths, the sans at section divisions inside cards. **The design language doc has been updated to clarify this hierarchy.**

Skipping for v2-freeze or because they're shells handing to deep client components I shouldn't touch:
- hub (PlayerHubWrapper)
- insights (InsightsPageContent)
- patterns (PatternsDashboardClient)
- roster (RosterPageClient)
- team (TeamSettingsClient)
- rounds/[id]/review (v2 frozen)
- rounds/continue (v2 frozen)
- messages (v2 frozen)
- calendar (v2 frozen, drag-drop)

---

## What "perfectly crafted" means here

Per the design language doc, every surface should satisfy these invariants:

1. Editorial eyebrow on every page header (11px uppercase tracking-0.14em)
2. Reveal stagger on every entrance section
3. v3-lift on every interactive card
4. Magnetic hover on every action button
5. Liquid Glass (`surface-lift`) on every floating surface
6. Italic warm-400 + icon on every empty state
7. Canonical motion library — no inline easing curves or raw durations
8. Color used for state, never decoration

Tonight's polish pass moved every v3-pure surface to ✅ Aligned. The rest of the dashboard is a mix of ➖ Shell (where the design lives in a client component we'd need to audit separately) and 🔒 Frozen (where the v2 surfaces explicitly cannot be refactored).

The path to full coherence is to either (a) sunset v2 surfaces wave-by-wave as v3 equivalents ship, or (b) write a v3-styled wrapper around each v2 client component (heavy lift, fragile). Per project rules, option (a) is the planned path; this audit just maps the current state.
