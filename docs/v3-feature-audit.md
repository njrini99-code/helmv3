# v3 Feature Audit — Premium UX Scorecard

> Each shipped v3 feature scored against the three founder manifestos.
> Format: a one-line description, the manifesto principles it most
> needs to honor, the current state, and the concrete improvements to
> ship in this polish wave (or the next).
>
> Scoring legend:
> - ✅ Honors the principle
> - ◐ Partial — works but doesn't lean in
> - ✗ Misses — needs work
> - — Not applicable to this surface

---

## Inventory

| # | Wave | Feature | Has UI |
|---|---|---|---|
| 1 | W13 | StandingBar (Card / Inline / Hero) | ✓ |
| 2 | W16 | /my-standing page | ✓ |
| 3 | W17 | CounterfactualLine | ✓ |
| 4 | W18-19 | GoalCard + GoalCreationModal | ✓ |
| 5 | W27 | IntentPill + IntentDrawer | ✓ |
| 6 | W29 | QualifyingBoard cluster | ✓ |
| 7 | W31 | HeroNarrativeCard | ✓ |
| 8 | W32 | ChatDrawer + history + composer + bubbles | ✓ |
| 9 | W34 | GenomeRadar + persona + dim grid + 3 pages | ✓ |
| 10 | W42 | Notification prefs settings | ✓ |

Schema/cron waves (W9-12, W14-15, W18, W20, W21-26, W28+W30.5, W33, W35-36, W38, W39-41) have no direct UI surface to audit.

---

## 1. StandingBar — `src/components/golf/coachhelm/v3/StandingBar/*`

**What it is:** the universal "you vs team vs PGA" visualization. Renders on every quantitative coach insight + on the player /my-standing page.

| Principle | Score | Notes |
|---|---|---|
| Everything has mass | ◐ | Renders cleanly but has no entrance animation when it lands on a Tier-1 insight. Should fade-up like the rest of the v3 hierarchy. |
| Continuity of perception | ✅ | Stable across surfaces; user sees the same component everywhere. |
| Attention is sacred | ✅ | Compact + ambient. Doesn't shout. |
| Calm confidence | ✅ | Restrained type, no over-decoration. |
| Motion has meaning | ◐ | No motion currently — values just appear. |
| Surfaces are materials | ✅ | Rendered as part of the parent EvidencePanel surface. |
| Interaction should feel rewarded | — | Read-only. |

**Improvements to ship:**
- Add a per-value scale-in on mount (the marker animates from 0→player position) — uses canonical EASE_CINEMATIC at DURATION.short.

## 2. /my-standing page — `src/app/golf/(dashboard)/dashboard/my-standing/page.tsx`

**What it is:** the player's full standings matrix grouped by category. Phone-first.

| Principle | Score | Notes |
|---|---|---|
| Everything has mass | ◐ | Section list appears but no stagger. |
| Continuity of perception | ✅ | Matches the genome page's grouping vocabulary. |
| Attention is sacred | ✅ | Eyebrow + heading + body discipline. |
| Calm confidence | ✅ | Restrained spacing on phone. |
| Reduce invisible friction | ◐ | Empty state when a player has 0 standing rows is just text. |

**Improvements:**
- Reveal stagger across category sections (already discoverable via PR diff; verify it's wired).
- Empty state gets a tiny "more rounds needed" icon.

## 3. CounterfactualLine — `src/components/golf/coachhelm/v3/CounterfactualLine.tsx`

**What it is:** the "Closing this gap → 75.2 → 74.5 avg (≈4 wks)" secondary line. Auto-suppressed below 0.3 strokes/round.

| Principle | Score | Notes |
|---|---|---|
| Attention is sacred | ✅ | Lighter weight than headline, like the spec demands. |
| Calm confidence | ✅ | One line, no decoration. |
| Motion has meaning | ◐ | Static. A subtle fade-in when the parent insight reveals would tie it to the headline. |

**Improvements:**
- Inherits parent entrance via wrapping component.

## 4. GoalCard + GoalCreationModal — `src/components/golf/coachhelm/v3/GoalCard/*`

**What it is:** the unified Goals primitive that replaced focus areas + drill compliance. Coach + player both interact with these.

| Principle | Score | Notes |
|---|---|---|
| Everything has mass | ◐ | Card sits well but lacks `v3-lift` on hover. |
| Continuity of perception | ✅ | Same card across all surfaces. |
| Interaction should feel rewarded | ◐ | Modal opens with default Next/React transition. |
| State should never disappear | ✅ | Goal state persists across navigation. |

**Improvements:**
- Add `v3-lift` class + Framer Motion `whileHover={liftHover}` on the card.
- Modal uses `surface-lift` + `drawerVariants` for entrance.

## 5. IntentPill + IntentDrawer — `src/components/golf/coachhelm/v3/IntentPill/*`

**What it is:** the coach-only "Bubble / Maintain / Develop / Breakout / Rehab" narrative-goal pill per player, with a drawer to set posture + notes.

| Principle | Score | Notes |
|---|---|---|
| Attention is sacred | ✅ | Pill is ambient on a roster row. |
| Motion has meaning | ◐ | Drawer probably opens with default transition. |
| Interaction should feel rewarded | ◐ | Could use canonical motion. |

**Improvements:**
- IntentDrawer uses canonical drawerVariants + surface-lift.

## 6. QualifyingBoard cluster — `src/components/golf/coachhelm/v3/QualifyingBoard/*`

**What it is:** the W29 selection workspace. Header + state bar + leaderboard + coach picks panel.

| Principle | Score | Notes |
|---|---|---|
| Everything has mass | ✅ | Polished tonight — Reveal stagger across sections, magnetic buttons, animated row entrance. |
| Continuity of perception | ✅ | State pill crossfades on advance. |
| Attention is sacred | ✅ | Top-N gradient highlights without screaming. |
| Calm confidence | ✅ | Italic empty states, restrained type. |
| Motion has meaning | ✅ | Drawer-style reasoning editor reveals when "Pick" is tapped. |
| Surfaces are materials | ✅ | `surface-matte` for cards, hairline dividers. |
| Interaction should feel rewarded | ✅ | Magnetic buttons + colored drop-shadows keyed to action color. |
| Reduce invisible friction | ✅ | Confirm button tooltip-explains why it's disabled. |

**Status:** Reference surface for the v3 design language. Other surfaces should match this bar.

## 7. HeroNarrativeCard — `src/components/golf/coachhelm/v3/HeroNarrativeCard.tsx`

**What it is:** the AI-generated paragraph above the player CoachHelm dashboard. Renders fallback first, swaps to LLM prose once it resolves.

| Principle | Score | Notes |
|---|---|---|
| Everything has mass | ✅ | Hero variant entrance (12px rise, 680ms). |
| Continuity of perception | ✅ | Fallback text shows immediately; crossfade to LLM. |
| Attention is sacred | ✅ | "Today" eyebrow + AI badge in corner — never shouts. |
| Motion has meaning | ✅ | Shimmer during LLM round-trip signals "thinking." |
| Calm confidence | ✅ | One paragraph, no buttons. |
| Designed, not generated | ✅ | The ✦ glyph is a specific choice. |

**Status:** Reference surface. Done.

## 8. ChatDrawer + history + composer + bubbles — `src/components/golf/coachhelm/v3/Chat/*`

**What it is:** the coach-only chat surface with 10 tool routes.

| Principle | Score | Notes |
|---|---|---|
| Everything has mass | ✅ | Drawer slides from right via drawerVariants. |
| Continuity of perception | ✅ | Launcher position = drawer origin (spatial continuity). |
| Surfaces are materials | ✅ | Drawer uses Liquid Glass `surface-lift`. |
| Reduce invisible friction | ✅ | Quick-prompt chips on empty state. |
| Motion has meaning | ✅ | Tool-call pill shows the agent's work. |
| Interaction should feel rewarded | ✅ | Launcher button magnetic hover + tap press. |
| Attention is sacred | ◐ | Bubbles render but don't stagger when a new conversation loads. |

**Improvements remaining:**
- ChatMessageList — bubble entrance stagger (canonical enterVariants).
- ChatComposer — focus ring at primary-500/40 + send button magnetic.
- ChatHistoryClient — left-rail Reveal entrance.

## 9. GenomeRadar + persona + dim grid + 3 pages — `src/components/golf/coachhelm/v3/Genome/*`

**What it is:** the player's 8-dim radar with persona panel + dimension grid. Three routes (coach, player, compare).

| Principle | Score | Notes |
|---|---|---|
| Everything has mass | ✅ | Polygon scales up from origin; dot stagger; ring fade-in. |
| Surfaces are materials | ✅ | Polygon has glow filter; surface-stone hero plinth. |
| Designed, not generated | ✅ | Locked-spoke ghost markers, "Awaiting weather data" instead of just null. |
| Continuity of perception | ✅ | Same radar component handles 1 OR 2 series for compare. |
| Calm confidence | ✅ | 8 spokes max; restrained type. |

**Improvements remaining:**
- Compare page player-picker has functional but plain rows. Add hover lift.
- /my-game-profile empty state is just a sentence. Add an icon.

## 10. Notification prefs settings — `src/app/golf/(dashboard)/dashboard/settings/notifications/*`

**What it is:** 10×3 toggle grid + quiet-mode hero.

| Principle | Score | Notes |
|---|---|---|
| Interaction should feel rewarded | ✅ | Toggle uses canonical CSS motion vars + glow on checked. |
| State should never disappear | ✅ | Optimistic toggle (UI updates instantly, server confirms). |
| Calm confidence | ✅ | Cool grid; no decoration. |
| Everything has mass | ◐ | Sections appear without stagger. |

**Improvements:**
- Reveal stagger across the two sections.

---

## Priority order for remaining tonight's work

Picked by **highest leverage × user contact frequency**:

1. **ChatMessageList bubbles** — every chat message is one of these. (5 min)
2. **ChatComposer focus ring + send polish** — every send goes through this. (5 min)
3. **ChatHistoryClient** — every coach uses chat history. (10 min)
4. **/my-game-profile empty state + entrance** — player's first impression of the genome surface. (5 min)
5. **Genome compare page picker rows** — coach lineup decisions. (5 min)
6. **GoalCard hover lift** — every focus-area surface shows these. (5 min)
7. **StandingBar entrance** — universal surface, every quantitative insight has one. (5 min)

After that:
- Full typecheck + tests + build
- Single PR titled "v3 premium UI polish (Doctrine I-III canonical refactor)"

## What "shipped" looks like

Every surface in this audit will, after this PR:
- Use canonical motion vocabulary (no inline `cubic-bezier`, no raw durations)
- Have an entrance animation that makes the element feel like it "arrived" rather than "appeared"
- Have at least one feedback affordance (hover lift, tap press, or both) if interactive
- Use the correct surface tier (`surface-stone` for plinths, `surface-matte` for cards, `surface-lift` for floating)
- Use the editorial type hierarchy (eyebrow / heading / body)
- Use italic warm-400 for empty states (never bold, never CAPS)
- Use color only for state, never for decoration

That coherence — every surface obeying the same physics — is what makes the user feel "they paid attention."
