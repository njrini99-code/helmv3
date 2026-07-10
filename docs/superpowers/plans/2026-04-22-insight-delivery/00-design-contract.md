<!--
STATUS: SUPERSEDED
DATE: 2026-07-10
SUPERSEDED BY / WHY: Entry point for the docs/superpowers/plans/2026-04-22-insight-delivery/ directory (with FOUNDATION-DONE.md) — a completed-wave April planning doc, absorbed into and superseded by the later 2026-06 CoachHelm audits (COACHHELM_FULL_VALIDITY_AND_FACET_AUDIT_2026-06-06.md, COACHHELM_MASTER_ENGINE_FEATURE_REMEDIATION_AUDIT_2026-06-21.md).
KEPT FOR HISTORY -- do not delete this file.
-->

# Insight Delivery Phase — Design Contract

> **Read this BEFORE writing any code.** Every team plan in this directory references this contract.

**Goal:** Replace the four parallel insight-presentation languages (`AIInsightsPanel`, `InsightCard`-coach, `AlertCard`, `V2*` round-review boxes) with **one** `InsightCard` primitive. Add a hero-card pattern. Surface a single high-impact insight on the player Hub. Every surface reads from the new evidence-backed `golf_coach_insights` rows (NOT in-memory `ComposedInsight`).

**End-state vibe:** Player opens the app → Hub shows ONE insight that matters today. Taps "Try gate drill." Done. Or taps the insight → expanded view → context, evidence, drill, history. Coaches get the same primitive in compact density on alerts, default in insights feed, hero on per-player view.

**The one primitive replaces four:**
- `src/components/golf/coachhelm/player/AIInsightsPanel.tsx` (player feed)
- `src/components/golf/coachhelm/insights/InsightCard.tsx` (coach feed) — RENAMED legacy
- `src/components/golf/coachhelm/alerts/AlertCard.tsx` (coach alerts)
- `src/components/golf/coachhelm/round-review/V2CausalInsights.tsx` (round review)
- `src/components/golf/coachhelm/round-review/V2PatternsSection.tsx`
- `src/components/golf/coachhelm/round-review/V2PredictionCard.tsx`

---

## Universal rules — every surface follows these

### Rule 1 — One primitive: `InsightCard`

Path: `src/components/golf/coachhelm/insight-card/InsightCard.tsx` (NEW directory).

Props:

```typescript
export interface InsightCardProps {
  insight: EvidenceInsight;            // canonical shape — see below
  density?: 'compact' | 'default' | 'hero';   // default: 'default'
  audience: 'player' | 'coach';        // changes copy + actions
  showDrills?: boolean;                // default: true; lifecycle 'matured' shows; hide for tentative
  showActions?: boolean;               // default: audience === 'player'
  onAction?: (action: InsightAction, insightId: string) => Promise<void> | void;
  onClick?: (insightId: string) => void;   // optional whole-card click handler
  className?: string;
}

export type InsightAction =
  | 'rate_helpful' | 'rate_not_helpful' | 'acknowledged' | 'dismissed'
  | 'create_focus_area' | 'view_drill' | 'open_details';

export interface EvidenceInsight {
  id: string;                          // golf_coach_insights.id (REQUIRED — no in-memory shapes anymore)
  player_id: string;
  category: 'putting' | 'tee' | 'approach' | 'short_game' | 'scoring' | 'pressure' | 'course_management';
  title: string;
  content: string;
  signature: string;
  evidence: InsightEvidence;           // from @/lib/coachhelm/v2/insights/types
  metadata: Record<string, unknown> | null;   // may contain { movement: { from, to, direction, percent_change } }
  lifecycle_state: 'tentative' | 'detected' | 'matured' | 'addressed' | 'resolved' | 'archived';
  status: 'active' | 'acknowledged' | 'dismissed' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  // Player view only:
  player_feedback?: { rating: 'helpful' | 'not_helpful' | 'dismissed' | 'acknowledged'; created_at: string } | null;
  // Drill attachments (pre-fetched, max 3):
  drills?: Array<{ id: string; title: string; duration_min: number; slug: string; difficulty: string }>;
}
```

### Rule 2 — Density variants

| Density | When to use | Visual |
|---|---|---|
| `compact` | List items in feeds, secondary cards under a hero, Hub alert-row companion | One row: tone-icon · title (truncate) · evidence-chip · CTA · chevron |
| `default` | Standard feed item (current AIInsightsPanel/InsightCard density) | Full card: header + 1-line content + EvidencePanel compact + drill chips + collapsible expand |
| `hero` | One per screen — top insight on Hub, top of CoachHelm, round-review takeaway | Tall card: display-serif title (~32px), large strokes-impact metric, full content, expanded EvidencePanel inline, prominent drill chips, primary action button |

### Rule 3 — Drills surface in collapsed default + hero (not 2 clicks deep)

Old: insight → expand → "Show details" → drill cards. Two explicit user actions.

**New:** drill chips render inline in the collapsed `default` and `hero` densities:

```
┌──────────────────────────────────────┐
│  🎯  6-10ft putting          [↓]     │
│  You make 38% (D2: 52%)              │
│  📊 47 putts · 30 days · ~2.1/round  │
│  🏌️ [Gate drill 10m] [Ladder 15m] +1 │
└──────────────────────────────────────┘
```

Tap chip → bottom sheet with drill detail + "Add to my plan" button.
Tap card → expand for full evidence grid + reasoning chain + history.

`compact` density omits drills (reserves space for the row layout) — a chevron-tap promotes to `default`.

### Rule 4 — Movement pill when present

Engine emits `metadata.movement = { from, to, direction: 'up'|'down', percent_change }` on dedup-update. Render a small pill below the title:

```
↑ +6pt since 12 days ago    (green for improving, amber for declining-on-bad-metric)
```

Direction interpretation depends on metric polarity (more is better for make_pct; less is better for severity). Helper:
```typescript
function isImprovement(direction: 'up' | 'down', metric: string): boolean {
  // make_pct, fw_pct, gir_pct, etc → up = improvement
  // severity, score_to_par, miss_severity → down = improvement
  if (/severity|score_to_par|miss|stddev|dispersion/.test(metric)) return direction === 'down';
  return direction === 'up';
}
```

### Rule 5 — Why? popover (collapsed-card visible)

Always-visible inline `[ Why? ]` chip on `default` + `hero`. Tap → popover (mobile: bottom sheet) showing:

- The reasoning chain if present (`metadata.reasoning_chain[]`)
- Otherwise: a generated explanation from the evidence shape — *"Fired because 47 putts in 30 days at 38% vs 52% D2 average → 14pt gap. Confidence 78% (large sample, recent, low variance)."*

Builds trust without adding visual weight to the resting state.

### Rule 6 — Audience-aware copy + actions

**Player view:**
- 2nd-person tense: "Your bunker save % is 0%"
- Actions: `Helpful` / `Got it` / `Dismiss` / `Try drill →`
- No "Create Focus Area" (coach action)

**Coach view:**
- 3rd-person if a player is the subject: "Jake's bunker save % is 0%"
- Actions: `Acknowledge` / `Dismiss` / `Create Focus Area` / `Discuss with player →` (deep links to messages)
- Adds player-name avatar in header

The same INSIGHT row drives both — the component swaps copy via the `audience` prop. No content duplication.

### Rule 7 — Tone visual mapping (preserve existing)

| Tone derived from | Visual |
|---|---|
| `priority === 'urgent'` OR `category === 'pressure' AND strokes_impact > 2` | Red accent, pulse dot |
| `priority === 'high'` OR `strokes_impact * confidence > 1.0` | Amber accent |
| `lifecycle_state === 'resolved'` | Green/celebratory, no actions, "Resolved {N} days ago" |
| `your_value > comparison_value` AND positive metric | Green/encouraging |
| Default | Warm-tone neutral |

Helper `deriveTone(insight)` lives in the primitive. Existing `toneConfig` map carries over.

### Rule 8 — Wired to NEW system (no in-memory `ComposedInsight`)

Every fetcher MUST query `golf_coach_insights WHERE evidence IS NOT NULL` with `lifecycle_state IN ('detected', 'matured', 'addressed', 'resolved')`. **NEVER** fetch from the in-memory `analysis.insights` engine output for delivery — only for backfill jobs.

The previous phase's `loadEvidenceBackedInsights` helper in `actions/insights.ts` becomes the canonical fetcher. Refactor it into:

```typescript
// src/app/golf/actions/insight-delivery.ts (NEW)
export async function getTopInsightForPlayer(playerId: string): Promise<EvidenceInsight | null>;
export async function getInsightsForPlayer(playerId: string, opts?: { limit?: number; categories?: string[]; minConfidence?: number; window_days?: number; }): Promise<EvidenceInsight[]>;
export async function getInsightsForCoach(coachId: string, opts?: { limit?: number; categories?: string[]; player_id?: string; }): Promise<EvidenceInsight[]>;
export async function getRoundTakeawayInsight(playerId: string, roundId: string): Promise<EvidenceInsight | null>;
```

Each pre-fetches drills via `golf_insight_drill_attachments → golf_drills` to avoid waterfall.

`getTopInsightForPlayer` ranking: `WHERE lifecycle_state IN ('matured', 'detected') ORDER BY (evidence->>'strokes_impact')::numeric * (evidence->>'confidence')::numeric DESC LIMIT 1`.

Insights with `priority='urgent'` always win regardless of score.

### Rule 9 — Display-serif font, surgically

Add **Fraunces** variable (single weight 600, single subset) used ONLY for:
- Hero card title
- Strokes-impact numerals on hero cards
- (Future: Fingerprint section headings)

```typescript
// src/lib/fonts.ts (NEW)
import { Fraunces } from 'next/font/google';
export const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-fraunces',
  display: 'swap',
});
```

Mounted in root layout via `${fraunces.variable}`. Used as `font-[family-name:var(--font-fraunces)]` only on the specific elements above. Body type stays system/sans (perf budget).

### Rule 10 — Motion budget

| Moment | Treatment |
|---|---|
| Hero card mount | 1 staggered reveal (title → metric → content → drills, 60ms apart) |
| Card expand | Existing height spring (preserve) |
| Drill chip tap | Subtle scale-down (0.98) |
| Movement pill | One-shot fade-in on first render only |
| Resolved state | Confetti only when LIFECYCLE TRANSITION happens (not every visit) — track via `metadata.celebration_shown_at` |

No scroll-jacking. No background motion (perf on iOS Capacitor).

---

## Team boundaries (no overlapping files)

| Team | Owns |
|---|---|
| **Foundation** | `src/components/golf/coachhelm/insight-card/InsightCard.tsx` (NEW), `HeroInsightCard.tsx` (NEW), `WhyPopover.tsx` (NEW), `MovementPill.tsx` (NEW), `tone-derivation.ts` (NEW), `src/app/golf/actions/insight-delivery.ts` (NEW), `src/lib/fonts.ts` (NEW), root `layout.tsx` (Fraunces font hook only), tests |
| **Hub** | `src/components/golf/player-hub/HubInsightSignalCard.tsx` (NEW), edits to `PlayerHub.tsx` (slot + dismiss state), no other files |
| **CoachHelm Dashboard** | `src/app/golf/(dashboard)/dashboard/coachhelm/components/PlayerCoachHelmDashboard.tsx` (refactor to use HeroInsightCard + InsightCard list); the existing `AIInsightsPanel.tsx` is replaced (delete after migration confirmed) |
| **Round Review** | `src/components/golf/coachhelm/round-review/RoundTakeaway.tsx` (NEW — replaces V2CausalInsights/V2PatternsSection/V2PredictionCard for primary surfacing); `RoundReviewDisplay.tsx` (rewire); leave the old V2* components as a 1-line re-export wrapper for backwards compat or delete |

---

## Sequencing

**Foundation must finish first** (Hub / Dashboard / Review all import the primitive).

After Foundation hand-off, Hub + Dashboard + Review run in parallel.

---

## Done criteria

- [ ] One `InsightCard` primitive renders correctly in `compact`, `default`, `hero` densities
- [ ] Drill chips visible in collapsed `default` + `hero` (not 2 clicks deep)
- [ ] Movement pill renders when `metadata.movement` present
- [ ] Why? chip + popover working
- [ ] Audience switching: same insight row renders correctly with `audience='player'` and `audience='coach'`
- [ ] `getTopInsightForPlayer` returns the highest `strokes_impact * confidence` matured insight (or urgent priority)
- [ ] Hub signal card appears for players with at least one matured evidence-backed insight; hides otherwise
- [ ] PlayerCoachHelmDashboard shows ONE hero card at top + secondary cards below; old AIInsightsPanel either deleted or unwired
- [ ] Round review shows ONE hero takeaway card; secondary cards collapsed by default
- [ ] All `getInsightsFor*` queries filter `evidence IS NOT NULL` and `lifecycle_state IN ('detected','matured','addressed','resolved')`
- [ ] Fraunces loaded once; rendered only on hero titles + impact numerals
- [ ] Tests: each primitive density variant + audience variant has a snapshot/RTL test
- [ ] Live smoke: open Hub as the high-data player → see signal card; open `/coachhelm` → see hero; open round review → see takeaway
- [ ] No `(supabase as any)` introduced
- [ ] No `console.error` for handled errors (use `logServerError`)
