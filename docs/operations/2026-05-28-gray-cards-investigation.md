# Gray Cards Investigation — 2026-05-28

## TL;DR

The user reported card surfaces across the dashboard looked "awful — gray, not warm cream." Root cause was a **token disconnect** between two parallel glass-surface systems: the CSS variables in `globals.css` had been pivoted to the Apr 2026 California-modern brief (cream-derived `rgba(247, 245, 242, …)`), but the **Tailwind `glass` color palette in `tailwind.config.ts` was still emitting pure white** `rgba(255, 255, 255, 0.7)`. The canonical `<GlassCard>` primitive consumes the Tailwind tokens via `bg-glass` — not the CSS variables — so every card rendered as white-translucent over a warm-cream gradient page, which the eye reads as desaturated gray.

**Matched hypothesis: H2 (Tailwind tokens overriding the cream).**

## Investigation Path

### Brand expectation
`CLAUDE.md:14` — "California-modern × neo-futurism — **warm cream + helm green, matte surfaces**."
`globals.css:108-120` — CSS vars correctly pivoted:
```css
--glass-subtle-bg:    rgba(247, 245, 242, 0.62);  /* cream-100 derived */
--glass-standard-bg:  rgba(247, 245, 242, 0.78);
--glass-prominent-bg: rgba(251, 250, 247, 0.92);
```

### Hypothesis check

| # | Hypothesis | Result |
|---|-----------|--------|
| H1 | Cards using wrong utility class (`bg-card`/`bg-gray-*`) | Partial. The canonical primitive is correct — but the token it consumes was wrong. |
| **H2** | **Tailwind tokens overriding the cream** | **CONFIRMED.** See below. |
| H3 | PRs #121/#123/#126 polish work introduced gray | No. Diffs touched motion/stagger only. |
| H4 | Dark-mode side-effects | No. No `dark:` classes on cards; `darkMode: ["class"]` requires explicit opt-in. |
| H5 | Backdrop blur picking up white parent | Symptom, not cause. Even with correct backdrop, the white-tinted overlay washed the cream out. |

### Root cause (file:line)

`tailwind.config.ts:122-139` (before fix):
```ts
glass: {
  subtle: 'rgba(255, 255, 255, 0.55)',      // ← pure white, not cream
  DEFAULT: 'rgba(255, 255, 255, 0.7)',      // ← pure white, not cream
  prominent: 'rgba(255, 255, 255, 0.8)',    // ← pure white, not cream
  white: 'rgba(255, 255, 255, 0.7)',
  'white-strong': 'rgba(255, 255, 255, 0.85)',
  medium: 'rgba(255, 255, 255, 0.5)',
  border: 'rgba(255, 255, 255, 0.4)',       // ← white hairline, not sand inset
  'border-strong': 'rgba(255, 255, 255, 0.5)',
  'border-prominent': 'rgba(255, 255, 255, 0.6)',
  ...
}
```

`src/components/ui/glass-card.tsx:14-18` — primary variant:
```tsx
primary: cn(
  "bg-glass backdrop-blur-glass",            // ← resolved to white
  "border border-glass-border-strong",       // ← resolved to white border
  ...
)
```

This is the only canonical card primitive used by Alerts (`CoachAlertCenter`), Insights (`InsightCard`, `InsightListView`, `FocusAreaCard`, `InsightFiltersPanel`, `InsightExportModal`), Patterns (`PatternCard`, `PatternDashboard`, `PatternTimeline`, `PatternByPlayerView`), CoachHelm (`RoundReviewDisplay`, `RoundStatsComparison`, `ShotAnalyticsPanel`, `CoachHelmAnalyticsDashboard`, `TeamCompositeCard`, `TeamShotOverview`, `ShotAnalysisCard`, `PerformancePrediction`, `RecentRoundReviews`, `V2InsightsFeed`) and ~16 more surfaces.

### Why it reads as gray

The 4-stop body gradient (`globals.css:188-197`) runs `#FFFEFA → #FDF9F0 → #FAF5EB → #F5F0E6`. When `rgba(255, 255, 255, 0.7)` paints over that warmer cream, the eye sees a **desaturated, slightly cool-shifted neutral** — perceptually "gray washed-out off-white" against the warm gradient surround. The `rgba(255, 255, 255, 0.5)` border ring reinforces the effect with a ghostly white edge.

The `globals.css` `.glass-standard` CSS-utility class was correct — but `<GlassCard>` doesn't use it. It uses `bg-glass` (Tailwind utility). So the production surface bypassed the corrected tokens entirely.

## Fix

`tailwind.config.ts:122-153` — point the Tailwind `glass` palette at the cream-derived RGB values that match `--glass-*-bg` / `--glass-*-border` in `globals.css`. Border tones move to cream-400 (`rgb(207, 200, 184)`) for the "sand inset" feel from the brief. Legacy aliases (`white`, `white-strong`, `medium`) also retarget so any older callers automatically pick up the pivot. `glass.dark` stays unchanged; it's used by dark-surface modals.

After:
```ts
glass: {
  subtle: 'rgba(247, 245, 242, 0.62)',       // cream-100 derived
  DEFAULT: 'rgba(247, 245, 242, 0.78)',
  prominent: 'rgba(251, 250, 247, 0.92)',    // cream-50 derived
  white: 'rgba(247, 245, 242, 0.78)',
  'white-strong': 'rgba(251, 250, 247, 0.92)',
  medium: 'rgba(247, 245, 242, 0.55)',
  border: 'rgba(207, 200, 184, 0.40)',       // cream-400 — sand inset
  'border-strong': 'rgba(207, 200, 184, 0.45)',
  'border-prominent': 'rgba(207, 200, 184, 0.55)',
  dark: 'rgba(28, 25, 23, 0.97)',
  input: 'rgba(251, 250, 247, 0.85)',
}
```

This makes `bg-glass` and `.glass-standard` render the same warm-cream surface — single source of truth. Motion / hover-lift work landed in PRs #121, #123, #126 is unchanged.

## Files changed

- `tailwind.config.ts` — glass palette pivot (only block touched)

## Files NOT changed (intentional)

- `src/components/ui/glass-card.tsx` — canonical primitive is correct, just needed its tokens to point at the right value
- `src/components/ui/card.tsx` — the shadcn-ish Card already uses warm tokens (`bg-cream-100/75`, `border-warm-200`)
- `src/app/globals.css` — CSS vars were already correct under the Apr 2026 pivot; left alone

## Verification

- `npm run typecheck` — clean (exit 0)
- `npm run lint` — clean (43 warnings, exact budget)
- No tests touch the glass palette (`grep` for `bg-glass`/`GlassCard` in `*.test.tsx`/`*.test.ts` returns nothing)

## Follow-ups for the user

1. **Visual smoke-test the surfaces.** PR preview should be eyeballed on `/dashboard`, `/dashboard/alerts`, `/dashboard/insights`, `/dashboard/coachhelm`, `/my-standing`, `/dashboard/patterns` to confirm the warm cream surface returns across every `<GlassCard>` site.
2. **Admin/tracer surfaces** (`src/app/golf/admin/components/tracer/*.tsx`, `CalendarView.tsx`) still use hard-coded `bg-white/65 inset_0_1px_0_rgba(255,255,255,0.7)`. These are admin-only and not in the user-reported gray zone, but for full consistency they should follow the same `cream-100/78`+`cream-400` recipe. Suggest a follow-up cleanup pass.
3. **Legacy aliases (`glass.white`, `glass.white-strong`, `glass.medium`)** now point at cream values. If any one-off surface relied on the literal-white tint (e.g. specific marketing scene), check it — most callers will benefit from the pivot.
4. **Consider deleting CSS-var `--glass-*-bg`** in a future cleanup: now that Tailwind tokens and the CSS utility classes converge, the two paths are redundant. Cheapest option: keep both, document the equivalence.
