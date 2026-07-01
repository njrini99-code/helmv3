# Fairway design-system review rules (cascades onto the root `.greptile/rules.md`)

**Fairway is the canonical design system for the entire product** — golf is the
reference implementation, and everything else (BaseballHelm, CoachHelm surfaces,
new features) must conform to it, not reinvent it. Source of truth:

- Components: `src/components/fairway/**` (app-shell `AppShell`/`PageContainer`/
  `FairwayTopBar`/`FairwayBottomNav`/`FairwaySidebar`, primitives, pages), the
  golf shell `src/app/golf/(dashboard)/FairwayDashboardShell.tsx`, and the live
  gallery of every primitive at `src/app/fairway-preview/page.tsx`.
- Tokens: `src/styles/design-tokens.css`, `src/styles/tokens.css` (scoped under
  `.fairway-ds` / `bg-canvas`; resolved via `@/lib/redesign/flag`).
- Design language + intent: `docs/v3-design-language.md`,
  `docs/redesign-playbook.md`, `docs/audits/FAIRWAY_PREMIUM_AUDIT_2026-06-14.md`.

## Always check on any UI PR (golf OR baseball OR shared)
- **Reuse Fairway, don't reinvent.** Before a PR adds a card/button/modal/sheet/
  table/empty-state/nav, check whether an equivalent already exists in
  `src/components/fairway/**` (or the `@/components/fairway` barrel). A net-new
  component that duplicates a Fairway primitive is design drift — flag it and cite
  the existing Fairway component.
- **Tokens, not raw values.** Colors/spacing/radii/shadows/typography come from the
  Fairway tokens (`design-tokens.css`) and the Tailwind theme, never inline hex,
  ad-hoc `px`, or one-off values. (ESLint `helm/no-arbitrary-text-px` /
  `helm/no-raw-button` catch some; you catch the cross-file/component-choice cases.)
- **Baseball must adopt Fairway.** BaseballHelm surfaces should use the Fairway
  app-shell + primitives (the same way golf uses `FairwayDashboardShell`), not a
  parallel bespoke shell or ad-hoc components. Flag a baseball UI that builds its
  own shell/primitive instead of the Fairway one.
- **Fairway scope.** Fairway styling only resolves inside the `.fairway-ds` scope
  (see `@/lib/redesign/flag`). A Fairway component rendered outside that scope will
  silently lose its tokens — flag it.
- **States + a11y.** Fairway components ship loading (skeleton, not spinner), empty,
  and error states, and are keyboard/screen-reader accessible. A new surface that
  drops those is incomplete against the design system.
- **The gallery is the contract.** `src/app/fairway-preview/page.tsx` renders every
  primitive in its states. A change to a Fairway primitive should be reflected
  there; the visual-regression check screenshots this page.

## Block if
- a PR introduces a bespoke component that duplicates an existing Fairway primitive
  (design fragmentation), or a parallel app-shell instead of the Fairway one;
- UI uses raw hex / ad-hoc spacing instead of Fairway tokens;
- a Fairway component is used outside the `.fairway-ds` scope (tokens won't resolve).

## Suggest (non-blocking) enhancements
- Migrating a still-legacy golf/baseball surface onto the Fairway shell/primitives.
- Adding a missing state (skeleton/empty/error) to match the Fairway standard.
- Promoting a genuinely reusable one-off into `src/components/fairway/**` so the next
  feature reuses it instead of re-building it.
