# GolfHelm Premium Scrub — Remediation Plan (2026-06-21)

Closes the 447-finding premium scrub (`GOLFHELM_PREMIUM_SCRUB_2026-06-21.md` /
`FINDINGS.csv`) — every live Fairway dashboard feature to **Layer 3 (Polished)**,
zero hard-gate FAILs. Strategy chosen: **systemic-first, then the whole backlog.**

## Why systemic-first

The gap is not random — the same Layer-3 essentials are missing across most features.
~263 of 447 findings collapse into **7 shared-primitive clusters**. Build/​upgrade the
primitive once, adopt it everywhere, and most features jump a layer with far less code
and zero divergence (which also fixes the design-system-coherence holistic finding).

| Cluster | Findings | crit/high | The shared fix |
|---|---:|---|---|
| **S4** a11y: focus/keyboard/contrast | 80 | 13/18 | keyboard-operable interactive-card primitive + global focus-ring token (2px,3:1) + modal focus trap/restore + contrast token fixes |
| **U** design-token/foundation | 54 | 5/19 | token sweep (no arbitrary bg-white/text-[px]/hex/emerald), spacing/radii/type discipline, reskin reused legacy widgets |
| **D** data-honesty | 43 | 5/14 | honest sourcing, no fabricated 0/—, correct deltas/trends/tz |
| **S2** loading skeletons | 39 | 6/18 | shape-matched `Skeleton` set + route `loading.tsx` for every data route |
| **S1** empty states | 27 | 8/10 | one premium `EmptyState` (icon+message+primary CTA) adopted everywhere |
| **S3** error + retry | 19 | 6/5 | route `error.tsx` + inline error+retry; kill cheerful-empty-masks-failure |
| **S7** pagination honesty | 19 | 1/7 | paginate past 1000-cap + "showing N of M" disclosure |
| **S6** optimistic feedback + undo | 15 | 1/8 | shared optimistic-mutation + undo-toast pattern for row/triage actions |
| **S5** mobile/responsive | 29 | 0/2 | responsive pass + ≥44px touch targets |

Remaining ~120 are per-feature wiring (W, 11 crit), completeness (C), Nielsen (N),
microcopy (M) — handled in Waves 1–3.

## Collision strategy

These hot files carry many findings and must each be owned by ONE batch (serialized),
never split across parallel batches:

- `FairwayCoachHelmSignals.tsx` (28) — the shared Alerts/Patterns/Insights surface → **one owner** (Batch 1A)
- `FairwayCoachDashboard.tsx` (10), `PlayersGridView.tsx` (9), `FairwayTeamStats.tsx` (9), `FairwayStatsCockpit.tsx` (9), `FairwayPlayerHub.tsx` (8), `FairwayDocuments.tsx` (8), `FairwayDashboardShell.tsx` (8) — each owned by its feature batch.

Each batch = a branch off `main`, **file-disjoint** from concurrent batches, gated, one PR.

---

## WAVE 0 — Shared premium primitives (build first; everything else depends on these)

Mostly NEW or shared-component files → low collision, lands before adoption.

| Batch | Builds | Files (own) |
|---|---|---|
| **0A** | Premium `EmptyState` (icon + message + primary CTA + secondary) | `src/components/fairway/feedback/EmptyState.tsx` (+ variants) |
| **0B** | Skeleton system — shape-matched skeletons + a `loading.tsx` per data route | `src/components/ui/skeleton.tsx`, new `.../<route>/loading.tsx` files |
| **0C** | Error pattern — shared `ErrorState` (message + retry) + route `error.tsx` template | `src/components/fairway/feedback/ErrorState.tsx`, new `.../<route>/error.tsx` |
| **0D** | Interactive-card a11y primitive (role/tabindex/Enter-Space, focus ring) + fix `InsightCard` | `src/components/fairway/cards-insight/InsightCard.tsx`, a11y card wrapper |
| **0E** | Optimistic-mutation + undo-toast hook | `src/hooks/golf/use-optimistic-action.ts` (new), ToastStack undo |
| **0F** | Global focus-ring + contrast tokens; `prefers-reduced-motion` audit | token CSS, `tailwind`/theme tokens |

Gate 0: tsc/lint/unit + a Storybook/route smoke; these primitives ship with tests.

---

## WAVE 1 — Per-feature criticals + primitive adoption (the bulk)

One batch per feature-area. Each batch: adopt the Wave-0 primitives (empty/loading/
error/focus) on that surface **and** fix its criticals + dead wiring. File-disjoint.

| Batch | Feature(s) | Owns (hot file) | Criticals to close |
|---|---|---|---|
| **1A** | Alerts + Patterns + Insights | `FairwayCoachHelmSignals.tsx`, `InsightCard.tsx` | bulk actions, keyboard cards, per-row feedback+undo, category deep-link, limit:100 pagination, skeleton (≈10 crit/high across 3 features) |
| **1B** | Coach Dashboard Home | `FairwayCoachDashboard.tsx` + dashboard loading/error | KPI delta chips, recent-rounds row interaction, join-request banner, skeleton, fetch-error state |
| **1C** | Messaging | `FairwayMessages*`, `messages.ts` | 4 criticals (attachments/unread/states/wiring) |
| **1D** | Documents | `FairwayDocuments.tsx`, `documents.ts` | 4 criticals (signed download/is_public/states/wiring) |
| **1E** | Player Hub | `FairwayPlayerHub.tsx` | 2 crit + skeleton/empty/error |
| **1F** | Development Plans | `PlayersGridView.tsx` | delete-focus-area handler, ?player= scoped landing, route skeleton |
| **1G** | Player Profile + Genome | `FairwayPlayerInsight.tsx`, `GenomeDetailView.tsx`, player-game | zero-rounds profile, standing bar, cross-surface nav, skeletons |
| **1H** | Intelligence Hub | `IntelligenceCommandCenter.tsx` (+ FairwayBrief) | design-system reskin, getTeamOverview error-not-empty |
| **1I** | Coaching Intelligence Settings | `FairwaySettingsCoachingIntelligence.tsx` + reused widgets | philosophy load/save error, slider/weighting wiring, legacy-widget reskin |
| **1J** | Announcements · Tasks · Travel · Team Info · Settings · What's New | each feature file | 2 crit each (states/wiring/legacy reskin) — split into ≤3 file-disjoint sub-batches |
| **1K** | Calendar · Roster · Qualifiers · My-Qualifiers · Rounds-Review · Classes · Personal-Stats · CoachHelm-Analytics · Player-CoachHelm · My-Development · Course-Library · Team-Stats · Recruiting · Round-Tracking | each feature file | 1 crit + highs each — split into file-disjoint sub-batches |

Gate 1 (every batch): `tsc` rc=0 · eslint 0-err + lint-ratchet held · `npm run test:run` green · `next build` green · the feature's three states + keyboard pass manually re-checked.

---

## WAVE 2 — Completeness (high → Layer 3)

The 127 high findings not closed in Wave 1: missing sub-features (filters that filter,
exports that export, search that searches), pagination disclosure, cross-feature
integration links (calendar↔travel↔qualifiers, insights↔development↔players↔genome,
rounds↔stats↔standing), bulk ops, mobile parity. Batched per feature-area, file-disjoint.

## WAVE 3 — Polish + holistic (medium/low)

131 medium + 132 low: microcopy pass (human/on-brand empty+error copy), motion budget,
delight (remember prefs, undo coverage), and the holistic sweeps — design-system
coherence re-check (should be largely closed by Wave 0), IA/nav consistency, the
remaining a11y mediums. Final harsh re-scrub (re-run this workflow) to confirm every
feature reaches Layer 3 and premium_ready flips to ✅.

---

## Verification

- Per batch: tsc · eslint+ratchet · unit · build (the full gate that caught the cross-PR
  test break last cycle — run the FULL suite, not a scoped subset).
- Per wave: merge all wave batches into an integration worktree, run full suite + build
  on the combined tree (individually-green batches can collectively break).
- Final: re-run `golfhelm-premium-scrub` workflow → require 31/31 premium_ready.
- Behavioral/visual: each PR's Vercel preview (the rendered-UI check static analysis can't do).

## Sequencing

Wave 0 (primitives) → Wave 1 (adopt + criticals) → Wave 2 (completeness) → Wave 3
(polish) → re-scrub. Wave 0 must land first (Wave 1 imports the primitives). Within a
wave, batches run in parallel where file-disjoint; hot-file owners serialized.

## Rough size

~6 primitive batches + ~20 feature batches (Waves 1–2, some split) + ~6 polish/holistic
batches ≈ **30+ gated PRs**. Autonomy: **plan-approved, then full-auto → gated PRs**
(no auto-merge to prod) per your selection.
