# Change ledger — player_coachhelm_development

## 2026-08-26 — log-progress drawers stop autofocusing the measurement field on touch

- SHA: 596913022.
- Change: both LogProgressDrawer copies (FairwayMyDevelopment.tsx and
  golf/coachhelm/home/DevelopmentDrill.tsx) gate the measurement input's
  autoFocus on a fine pointer.
- Why: on iPhone the numeric keypad popped over the drawer before the
  player had read the field's context (owner TestFlight report,
  same class as the event editor).

## 2026-09-07 — route `loading.tsx` fallbacks reshaped to the real first paint

- SHA: 6eccdf03d.
- Change: this feature's route Suspense fallbacks (`dashboard/coachhelm`, `dashboard/my-development`) were reshaped.
  No route, table, server action, data flow or business rule changed — the
  edits are confined to `loading.tsx` skeleton geometry and its ARIA
  wrapper.
- Why: the fallbacks were shape-matched to each page's SETTLED layout
  rather than the markup that paints at t=0. For a `'use client'` page
  holding its own `loading` state, the Suspense fallback is replaced by
  that component's loading branch, so reserving the populated geometry
  caused the layout shift the fallback exists to prevent. A route whose
  `page.tsx` is a pure `permanentRedirect` shim now renders `bg-canvas`
  only — no geometry, no `<h1>` for a screen that never mounts.
- Verification: every edited file was adversarially re-verified against
  its page's source, twice for the files that failed the first pass.
  typecheck 0, lint 0, build 0.

## 2026-09-23 — repair-plan §14.12: observed-outcome language fix (InsightCard OutcomeBadge)

- SHA: 961d255b1.
- Change: `src/components/golf/coachhelm/insight-card/InsightCard.tsx`'s
  `OutcomeBadge` rendered "Saved {impact} strokes/rd" once a player/coach
  marked a focus area's originating insight `improved`
  (`golf_coach_insights.outcome_status`, a human self-report via
  `recordFocusAreaOutcomeImpl` in `src/app/golf/actions/development.ts` —
  unrelated to `golf_insight_outcome_attribution`/`method_version`).
  `impact` is `evidence.strokes_impact`, the insight's GENERATION-TIME
  counterfactual estimate ("strokes recoverable per round IF this were
  fixed" — never re-measured post-outcome), so the badge presented that old
  estimate as if it were a just-proven measured saving. Changed to
  "Improved · ~{impact} str/rd at stake" — the same hedged phrasing this
  card, `EvidencePanel.tsx`, and `DiagnosisPanel.tsx` already use everywhere
  else `strokes_impact` is shown. Also corrected a stale comment claiming
  `outcome_status`/`outcome_measured_at` weren't yet projected by
  `INSIGHT_SELECT` (`insight-delivery.ts`) and that the badge "silently
  no-ops" — both columns have been selected for a while; the badge is live
  (`FairwayPlayerInsight.tsx` renders this exact card, `audience="coach"`),
  just previously untested.
- Also audited (repair-plan §14.12 sweep) and found no other live
  violation in coach/player UI or the CoachHelm chat surface: the trust
  ladder (`deriveTrustStatus`, N9) and `MovementPill` already use honest,
  hedged language; `FocusAreaCard.tsx`/`RosterHealthHeader.tsx`'s
  "Improved"/"Worsened" tally labels are a human's own self-report echoed
  back, not a system claim; `DiagnosisPanel.tsx`'s "Caused by" is root-cause
  diagnosis (a different axis, its own honest measured-fact-vs-hypothesis
  design) and was deliberately left untouched, named as a candidate for a
  separate future review rather than folded into this slice; admin-only
  `effectiveness_score`/`improvement_rate` dashboards are a different,
  internal audience and out of scope.
- New guard: `src/test/coachhelm/observed-outcome-language.test.ts` — an
  AST walk (TypeScript compiler API) over string/template literals and
  JSX text under `components/golf/coachhelm`, `components/fairway/pages/
  coachhelm`, and `lib/coachhelm/v3/chat`, failing on "proven", "caused
  by", "guaranteed", or a quantified "Saved N strokes" claim. Deliberately
  NOT a raw-text regex — comments and identifiers are never visited by the
  walk, so ~40 unrelated developer-prose hits (causal-relationships
  imports, surface-lift CSS, the admin /errors "proven" lifecycle spine)
  never need an allowlist entry.
- Verification: see the matching test-ledger entry for exact counts.
  `npm run typecheck:fast` clean, `npx eslint` clean on touched files.
  Build not run locally (session rule) — CI's Next build job covers it.

## 2026-09-23 — #2023 re-review (rev-2023): guard patterns widened + 5 more real violations fixed

- SHA: (pending push).
- Change: rev-2023 fix-first, before A9 slice 3.
  1. MUST: `observed-outcome-language.test.ts`'s FORBIDDEN patterns missed
     real rewordings. `sav(?:ed|ing) ... str(?:okes?|\/rd)` now also
     matches the "str/rd" abbreviation (not just spelled-out "strokes"),
     PLUS a second pattern for the REVERSED order ("1.2 strokes saved").
     `proven` widened to `prov(?:en|ed|es|e)` so "proved"/"proves"/"prove"
     are caught too, not just the exact word "proven". Re-running the
     widened guard against the real tree (no fixture) surfaced 6 REAL,
     previously-undetected violations, all in `FairwayEffectiveness.tsx` —
     see the fixes below.
  2. MUST: `DiagnosisPanel.tsx:177`'s "Caused by" (for `causality_level ===
     'observed_sequence'`) was allowlisted rather than fixed. Reworded to
     "Preceded by" — an observed temporal sequence (root_cause happening
     before symptom in the recorded shot data) is a measured FACT but
     still not a controlled measurement, so it can't back a causal claim.
     The file-level allowlist is REMOVED entirely — no file in this
     codebase is allowlisted by the guard any more. Checked the other
     `causality_level` value (`inferred_hypothesis`, the only other one —
     `CausalityLevel` is a 2-value union): already honest ("Likely
     because"), no fix needed.
  3. SHOULD: `InsightCard.tsx`'s `OutcomeBadge` — `outcome_status` is set
     by `recordFocusAreaOutcomeImpl`, in practice always a COACH's manual
     grade (its only 2 UI callers, both under `components/fairway/pages/
     coachhelm/`, no player-facing caller). Relabeled: "Improved" →
     "Coach marked improved · ~N str/rd at stake"; "Outcome regressed" →
     "Coach marked worsened". `no_change` stays unrendered (design
     decision, unchanged) but a matching `OUTCOME_LABELS.no_change` exists
     for consistency if that's ever revisited.
  4. SHOULD: `SCAN_ROOTS` widened to `components/golf/player-hub` and
     `lib/coachhelm/v3/{brief,composite,insights}` — zero hits today, adds
     future-violation coverage for near-zero cost.
  5. SHOULD: documented the AST walker's real sibling-JSX-ELEMENT gap (as
     opposed to sibling text/expression NODES within one element, which
     IS caught) — a phrase split across two adjacent tags would be missed.
  6. SHOULD: both `player_coachhelm_development` ledger entries' "SHA:
     (pending push)" replaced with the real SHA (961d255b1) now that it's
     known.
  6 real violations found and fixed by the widened guard, all in
  `FairwayEffectiveness.tsx` (none were the abbreviated/reversed shape —
  the widened word-conjugation pattern caught them): "proved accurate" →
  "were accurate" (×2, the hero sentence + the Ribbon takeaway — each
  resolved prediction's accuracy is directly checkable, "proved" overstated
  what a hit RATE demonstrates); "strokes saved"/"Strokes saved"/
  "strokes-saved impact" (×4 — a caption, a StatTile label, two
  empty-state descriptions) → "str/rd impact (est.)" / "Stroke impact
  (est.)" / "stroke-impact estimate" — `totalStrokesSaved`
  (`coachhelm-analytics.ts`) sums each resolved pattern's GENERATION-TIME
  `stroke_impact` estimate, never a post-resolution measurement, so
  "saved" was the exact same overclaim `OutcomeBadge`'s original bug made,
  just aggregated across patterns instead of per-insight.
- Verification: see the matching test-ledger entry for exact counts.
  `npm run typecheck:fast` clean, `npx eslint` clean on touched files,
  full coachhelm/golf-actions/golf-components/fairway-coachhelm regression
  sweep clean (240 files / 2240 passed / 6 skipped, pre-existing). Build
  not run locally (session rule) — CI's Next build job covers it.
