# Lane A03 — Design system, dimensional materials, component craft, and visual standardization

Baseline SHA: `3c90f9f174ac103af5fafc600aebecd98243decc`. Read-only phase; no source files edited.
Evidence labels used strictly per the worker brief: `SOURCE`, `RISK`, `PROPOSAL`, `NOT_RUN`/`BLOCKED`.
No `OBSERVED`/`REPRODUCED` claims appear anywhere below (no device/browser/build available).

## Top 5 actionable findings

- **A03-001** (P1, SOURCE) — The root app only mounts the legacy `@/components/ui/sonner` `Toaster`
  (`src/app/layout.tsx:13,144`). `fairwayToast()` (the facade ~16 production files call, including
  native-shell `CapacitorProvider.tsx:16` and roster/CoachHelm flows) dispatches into sonner's
  global store, which renders through whichever `Toaster` is mounted — so it renders through the
  **old** matte toast, not Fairway's warm-glass `ToastStack` (`ToastStack.tsx:67-128`). The
  bottom-nav safe-area clearance fix `ToastStack` documents (`mobileOffset`, UI-6) never reaches
  users; the mounted `ui/sonner.tsx:44-90` Toaster uses a different, unverified offset mechanism.
- **A03-002** (P2, SOURCE) — `tailwind.config.ts:438-460` declares a second, `fw-*`-prefixed radius
  ramp and says the **canonical** Tailwind radii are "FORBIDDEN" on the Fairway path. The plan's own
  cited *material reference* component, `Segmented`, violates this at `segmented.tsx:142,217`
  (`rounded-md` instead of `rounded-fw-sm`); 31 sites across `fairway/**` do the same, with no
  ast-grep/eslint rule enforcing the ban.
- **A03-003** (P1, RISK/BLOCKED) — 133+ sites in the form primitives (`Combobox.tsx`,
  `NumberField.tsx`, `Checkbox.tsx`, `Switch.tsx`, `forms/styles.ts`) use `/NN` alpha-opacity
  shorthand on CSS-variable-backed colors (`ring-accent-500/70`, `border-fw-danger/60`). One
  component's own comment (`segmented.tsx` "on" dot) says this silently compiles to nothing;
  `tailwind.config.ts:20-34`'s `tokenColor()`/`color-mix()` doc says it was fixed. **Never compiled
  in this audit** — if the fix doesn't hold for `ring-*`/`border-*` the way it does for `bg-*`, every
  focus ring and invalid-state indicator in the form system is invisible.
- **A03-004** (P2, SOURCE, reconfirms G06/G08) — `Button`'s `asChild` (link) path drops haptic,
  busy-spinner rendering, and `disabled`/`type` forwarding entirely (`button.tsx:165-206`). Press-down
  still settles over the shared 180ms `fwTransition` duration — only the active easing curve changes
  (`_internal.ts:43-45,61-63`) — not the 0-60ms immediate press Section 8.3 proposes.
- **A03-005** (P2, SOURCE) — Two live, differently-numbered z-index ladders (`design-tokens.css`
  `--fw-z-*` vs `tokens.css` `--z-*`) remain unreconciled; two Radix popovers (Select, DatePicker)
  already had to escape both via an undocumented third `z-dropdown:1000` value
  (`date-picker.tsx:295-300`, `forms/styles.ts:128`) — direct evidence the collision is live, not
  theoretical.

## All findings

```yaml
id: A03-001
related_prior_ids: []
status: SOURCE_VERIFIED
severity: P1
confidence: source-confirmed structural fact; runtime pixel verification NOT_RUN (no browser)
evidence_label: SOURCE
baseline_sha: 3c90f9f174ac103af5fafc600aebecd98243decc
user_consequence: Every toast the app shows (round-review notes, roster invite/remove, CoachHelm focus-area save/delete, recruiting document upload, native-app capacitor lifecycle toasts) renders as the old "California-modern matte" style, not the crafted warm-glass ToastStack with per-type tone icons and haptic-matched semantics the design system claims is "the single, app-wide non-blocking toast surface."
source_files: [src/app/layout.tsx, src/components/fairway/feedback/ToastStack.tsx, src/components/ui/sonner.tsx]
source_ranges: [src/app/layout.tsx:13, src/app/layout.tsx:144, src/components/fairway/feedback/ToastStack.tsx:22-29, src/components/fairway/feedback/ToastStack.tsx:67-128, src/components/fairway/feedback/ToastStack.tsx:144-172, src/components/ui/sonner.tsx:44-90]
expected: fairwayToast()'s comment ("the single, app-wide non-blocking toast surface") implies its ToastStack instance is what's mounted at the root, so every fairwayToast call renders the warm-glass panel + tone icons + bottom-nav-safe mobile offset.
actual: src/app/layout.tsx imports and renders only `Toaster` from '@/components/ui/sonner' (line 13, mounted line 144). No file under src/app imports ToastStack except the fairway-preview demo page and one page-local mount in golf/(dashboard)/dashboard/classes/page.tsx. sonner is a single global toast queue; whichever Toaster component is mounted renders every toast() call regardless of which facade dispatched it, so fairwayToast()'s calls from CapacitorProvider.tsx, FairwayIntentControl.tsx, FairwayPlayerActionsMenu.tsx, FairwayJoinRequests.tsx, FairwayInvitePlayerButton.tsx, FocusAreaModal.tsx, FocusAreaCard.tsx, PlayersGridView.tsx, FairwayRecruitDocuments.tsx, FairwayRecruitFormSheet.tsx, golf/(dashboard)/dashboard/classes/page.tsx all render through ui/sonner's Toaster, not ToastStack.
mechanism: sonner keeps one process-wide toast store; `toast()`/`toast.success()` etc. push into that store, and whichever mounted <Toaster/> instance is subscribed renders the visible stack. The app mounts exactly one Toaster (ui/sonner's, at the root layout), so it is the one that renders in production regardless of which facade (fairwayToast vs the legacy `toast` export) issued the call.
proposed_fix: 'PROPOSAL: swap src/app/layout.tsx:13,144 to import Toaster from @/components/fairway/feedback/ToastStack instead of @/components/ui/sonner, after confirming (a) ui/sonner-specific consumers (haptic-on-success via triggerHaptic, ERROR_DURATION_MS=10s default, PERSIST sentinel, legacy toast/useToast API) have an equivalent in ToastStack or are migrated to fairwayToast first, and (b) the mobileOffset fix actually clears the bottom nav on-device (NOT_RUN here). This is a root-layout / shell chokepoint edit — request via A02/A00, not an A03 direct edit.'
owner_lane: A03 (decision + component); A02/A00 (root layout.tsx edit, shared chokepoint)
dependencies: [C08]
negative_tests: []
accessibility_check: ToastStack pins aria-live=polite explicitly (ToastStack.tsx:72-74); ui/sonner.tsx does the same (lines 52-55) — no regression on the aria-live channel either way, only visual styling and mobile-offset mechanism differ.
performance_check: NOT_RUN — swapping Toaster components is not expected to change render cost materially, but not measured.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

```yaml
id: A03-002
related_prior_ids: [tokens]
status: SOURCE_VERIFIED
severity: P2
confidence: source-confirmed
evidence_label: SOURCE
baseline_sha: 3c90f9f174ac103af5fafc600aebecd98243decc
user_consequence: The blessed 10/14/20/28 radius family (Section 8.2) is not actually load-bearing across the design system; 31 sites carry a numerically-similar but structurally different radius value that can silently diverge the moment either scale is retuned, producing inconsistent corner-rounding across otherwise-identical surfaces (e.g. circular avatar badges at rounded-2xl=20px next to cards at rounded-card=20px — same output today, no shared source of truth).
source_files: [tailwind.config.ts, src/components/fairway/controls/segmented.tsx, src/components/fairway/calendar/date-picker.tsx, src/components/fairway/app-shell/FairwaySidebar.tsx, src/components/fairway/pages/whats-new/FairwayWhatsNew.tsx, src/components/fairway/modules/Filmstrip.tsx, src/components/fairway/pages/calendar/FairwayMonthGrid.tsx, src/components/fairway/pages/coachhelm/FairwayPlayerInsight.tsx, src/components/fairway/pages/coachhelm/TeamCategoryLeakBand.tsx, src/components/fairway/pages/dashboard/FairwayCoachDashboard.tsx, src/components/fairway/pages/roster/FairwayPlayerCard.tsx, src/components/fairway/pages/roster/FairwayPlayerProfile.tsx, src/components/fairway/pages/roster/FairwayRosterSkeleton.tsx, src/components/fairway/app-shell/FairwayShellSkeleton.tsx, src/components/fairway/charts/AdoptionHeatGrid.tsx, src/components/fairway/charts/SegmentBar.tsx]
source_ranges: [tailwind.config.ts:438-460, segmented.tsx:142, segmented.tsx:217, date-picker.tsx:305, FairwaySidebar.tsx:236, FairwayWhatsNew.tsx:548, Filmstrip.tsx:56, FairwayMonthGrid.tsx:256, FairwayMonthGrid.tsx:312, FairwayPlayerInsight.tsx:697, TeamCategoryLeakBand.tsx:99, FairwayCoachDashboard.tsx:1056, FairwayPlayerCard.tsx:94, FairwayPlayerProfile.tsx:120, FairwayPlayerProfile.tsx:238, FairwayPlayerProfile.tsx:243, FairwayRosterSkeleton.tsx:41, FairwayShellSkeleton.tsx:137, AdoptionHeatGrid.tsx:200, SegmentBar.tsx:215]
expected: 'tailwind.config.ts:449-451 states explicitly: "raw-Tailwind radii (rounded-2xl/xl/md/lg/sm, rounded-[Npx]) are FORBIDDEN there [the Fairway flag-on path] — every Fairway callsite maps to one step below" (the fw-sm/fw-md/card/fw-lg ramp).'
actual: 31 rounded-{sm,md,lg,xl,2xl} occurrences inside src/components/fairway/**, including inside the Section 8.1-cited reference component Segmented itself (the selected-item text container and the moving pill, segmented.tsx:142 and :217, both use rounded-md — the canonical 10px step — instead of rounded-fw-sm). No ast-grep/eslint/ratchet rule found anywhere in .coderabbit/ast-grep/ or eslint.config.mjs targeting this.
mechanism: Two borderRadius scales are declared in the same tailwind.config.ts theme.extend.borderRadius block — one unprefixed (sm/md/lg/xl/2xl/3xl, values 6/10/12/16/20/24) intended for the rest of the app, one fw-prefixed (fw-sm/fw-md/card/fw-lg, values 10/14/20/28) intended exclusively for Fairway. Nothing at build or lint time distinguishes which files are "the Fairway flag-on path," so authors reach for whichever named utility autocompletes first.
proposed_fix: 'PROPOSAL: (1) fix the 31 current sites to their nearest fw-* equivalent (case-by-case: segmented.tsx:142/217 -> rounded-fw-sm to match its own track; avatar-badge rounded-2xl sites -> rounded-card since 20px is already the intended step). (2) Add the Section 8.4 ratchet: an ast-grep rule scoped to src/components/fairway/** that flags rounded-(sm|md|lg|xl|2xl|3xl|\[.*\]) and requires rounded-(fw-sm|fw-md|card|fw-lg|full) or an explicit inline exception comment.'
owner_lane: A03
dependencies: [C08]
negative_tests: []
accessibility_check: none — purely visual token drift, no AT-facing behavior change.
performance_check: none.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

```yaml
id: A03-003
status: BLOCKED
severity: P1
confidence: source shows the pattern is pervasive; whether it actually renders is NOT_RUN (requires a CSS build)
evidence_label: NOT_RUN
baseline_sha: 3c90f9f174ac103af5fafc600aebecd98243decc
user_consequence: If the alpha-opacity modifier does not compose correctly against color-mix()-wrapped CSS variables for ring-color/border-color utilities (only bg-color/text-color were the ones the tailwind.config.ts fix narrative names explicitly), every focus-visible ring and every invalid-field border across the form system silently renders with NO color at all — an invisible keyboard-focus indicator and an invisible validation-error border, on every text input, number field, combobox, checkbox and switch in the app.
source_files: [tailwind.config.ts, src/components/fairway/forms/Combobox.tsx, src/components/fairway/forms/NumberField.tsx, src/components/fairway/forms/Checkbox.tsx, src/components/fairway/forms/Switch.tsx, src/components/fairway/forms/styles.ts, src/components/fairway/controls/segmented.tsx]
source_ranges: [tailwind.config.ts:20-34, Combobox.tsx:106-107, Combobox.tsx:130-132, NumberField.tsx:39, NumberField.tsx:59-60, Checkbox.tsx:42, Switch.tsx:50, forms/styles.ts:61, segmented.tsx:233-240]
expected: tailwind.config.ts:20-34's tokenColor() doc claims color-mix(in oklab, var(--x) calc(<alpha-value> * 100%), transparent) makes every fw-token-backed color utility (bg/text/border/ring) opacity-composable via the standard /NN modifier syntax, superseding the earlier bug where raw var(--x) silently emitted no rule for 286 sites across 122 files.
actual: 133 occurrences of the /NN modifier on fw-token-backed colors across src/components/fairway/** were found by grep, concentrated in the form primitives' focus-ring and invalid-state classes (e.g. Combobox.tsx:106 `ring-accent-500/70`, forms/styles.ts:61 `data-[invalid]:border-fw-danger/60`). segmented.tsx:233-240 explicitly warns "never bg-fw-accent/30 or similar /NN alpha shorthand on a CSS-variable-backed color, which silently compiles to nothing in this repo's Tailwind config" — a claim that directly contradicts 133 production call sites betting the opposite. No CSS build was available in this read-only audit lease to settle which claim is currently true.
mechanism: Tailwind v3's opacity-modifier machinery substitutes <alpha-value> only for colors it recognizes as opacity-composable; whether ring-color and border-color core plugins apply the identical substitution path as background-color/text-color (which the fix narrative explicitly names) was not independently confirmed for this exact color-mix()-in-oklab formulation.
proposed_fix: 'PROPOSAL, urgent: build the app once (npm run build or a component snapshot) and inspect the compiled CSS for `.ring-accent-500\/70` / `.border-fw-danger\/60` (or equivalent DevTools computed-style check on a rendered focus ring) before any further craft work lands on top of these primitives. This is the single highest-value verification gate for the whole design-system audit (Section 8.4 "compile CSS for every new/changed class").'
owner_lane: A03 authors the fix if needed; A00/A12 own the actual build/compile gate since no lane may run a build in this phase.
dependencies: [C08]
negative_tests: []
accessibility_check: A failure here is a WCAG 2.4.7 (focus visible) and 1.4.11 (non-text contrast) regression across the entire form system — this is an accessibility-critical unknown, not merely cosmetic.
performance_check: none.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

```yaml
id: A03-004
related_prior_ids: [F08, F10, G06, G08, UX08, UX29]
status: SOURCE_VERIFIED
severity: P2
confidence: source-confirmed; no current call site combines asChild+disabled (grep-verified), so today it is a contract gap rather than an active visible bug
evidence_label: SOURCE
baseline_sha: 3c90f9f174ac103af5fafc600aebecd98243decc
user_consequence: A Button rendered asChild (wrapping a Next Link, ~20+ call sites e.g. FairwayPlayerCard.tsx:244, FairwayQualifierDetail.tsx:205/213/225/749, FairwayPlayerRoster.tsx:195) gets no tactile confirmation on tap (no fwHaptic), cannot show a busy spinner while a navigation-gated action resolves, and cannot be disabled through the component's own disabled prop — any future consumer passing busy or disabled to an asChild Button will silently get none of that state's visible/haptic behavior. Separately, every button's press-down (all consumers) settles over 180ms instead of the sub-100ms tactile snap Section 8.3 proposes.
source_files: [src/components/fairway/controls/button.tsx, src/components/fairway/controls/_internal.ts]
source_ranges: [button.tsx:165-170, button.tsx:175-183, button.tsx:196-198, _internal.ts:43-45, _internal.ts:61-63]
expected: Section 8.3 "the current Button's asChild feedback path differs from the button path" is flagged as something to measure/fix; Section 8.3 also proposes press motion begin immediately with 0-60ms settling.
actual: 'handleClick (button.tsx:165-170) only fires fwHaptic when NOT asChild. content (line 175-183) renders `busy ? <Spinner/> : leftIcon` only in the non-asChild branch; under asChild, `children` passes through untouched regardless of the busy prop. The prop spread at line 198 (`{...(asChild ? {} : { disabled: disabled || busy, type: ... })}`) means disabled/busy/type are never applied to the underlying element when asChild=true. fwPress (_internal.ts:61-63) only overrides `active:[transition-timing-function:var(--fw-ease-spring)]` — the transition-duration itself is inherited from fwTransition''s single [transition-duration:180ms] (line 43-45), so the active-state visual settle still takes 180ms, only its easing curve differs from the calmer base curve.'
proposed_fix: 'PROPOSAL: (1) Document (or fix) that asChild consumers must not pass busy/disabled — a compile-time never-typed prop restriction when asChild is true would make this a type error instead of a silent no-op. (2) Add a dedicated --fw-dur-press (~60ms) applied via an explicit active:[transition-duration:var(--fw-dur-press)] in fwPress, separate from the shared 180ms base, so press-down settles fast while release/hover keep the slower cinematic curve.'
owner_lane: A03
dependencies: [C08]
negative_tests: [T-asChild-busy-noop, T-asChild-disabled-noop]
accessibility_check: An asChild Button that a future consumer marks "disabled" would remain a fully operable, focusable, clickable link with no visual or semantic indication of disablement — a real WCAG concern if it is ever relied upon, though no such call site exists today.
performance_check: none.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

```yaml
id: A03-005
related_prior_ids: []
status: SOURCE_VERIFIED
severity: P2
confidence: source-confirmed
evidence_label: SOURCE
baseline_sha: 3c90f9f174ac103af5fafc600aebecd98243decc
user_consequence: A stacking-order bug (a popover/menu rendering behind a modal it was opened from, or a toast rendering behind a nav bar) is one z-index-utility typo away at any of the ~20+ files using either ladder's same-named class, and the fix pattern already used twice (an undocumented third z-dropdown:1000 escape value) is itself an unofficial third tier that isn't written down anywhere as part of the system.
source_files: [src/styles/tokens.css, src/styles/design-tokens.css, src/components/fairway/calendar/date-picker.tsx, src/components/fairway/forms/styles.ts, src/app/globals.css]
source_ranges: [tokens.css:230-252, design-tokens.css:274-286, date-picker.tsx:295-300, date-picker.tsx:305, forms/styles.ts:113-128, globals.css:1899]
expected: One z-index vocabulary for the whole app (Section 8.1/8.4 call for a single, reconciled system with ratcheted enforcement).
actual: 'tokens.css:250-252 defines --z-overlay:20, --z-modal:30, --z-toast:40 (exposed as Tailwind z-overlay/z-modal/z-toast utilities); design-tokens.css:285-286 defines a DIFFERENT ladder, --fw-z-base:0 through --fw-z-modal:50, --fw-z-toast:60, consumed via z-[var(--fw-z-*)] arbitrary values. Both files carry an identical code comment calling this "a known footgun." date-picker.tsx:295-300''s own comment describes a real, previously-fixed instance: a Radix Popover opened from inside a ModalShell rendered BEHIND the modal because the popover used z-modal (30, tokens.css ladder) while ModalShell paints at --fw-z-modal (50, design-tokens.css ladder) — fixed by escaping to a THIRD value, z-dropdown (1000, globals.css:1899), also used by Select (forms/styles.ts:128).'
mechanism: Two CSS custom-property ladders were introduced independently (one pre-Fairway, one Fairway-native) and never unified; Tailwind exposes both as same-shaped utility class names (z-modal exists as both a plain utility off tokens.css AND is reachable via z-[var(--fw-z-modal)] arbitrary syntax off design-tokens.css), so a class name alone does not tell a reader which ladder — or tier — it resolves to.
proposed_fix: 'PROPOSAL: pick ONE ladder (design-tokens.css --fw-z-* is the newer, more complete one — it already has base/sticky/nav/dropdown/overlay/modal/toast/command tiers) as canonical, formally add z-dropdown''s 1000 value as a named tier in it (it is currently a bare magic number in globals.css with no token), then delete the tokens.css ladder and its z-* Tailwind utilities, sweeping the ~20 files enumerated by the inventory sweep onto the surviving ladder. Add a Section 8.4 ratchet forbidding new z-[0-9] arbitrary literals and the retired utility names outside the one canonical token file.'
owner_lane: A03
dependencies: [C08]
negative_tests: []
accessibility_check: none directly, though a hidden-behind-modal popover can trap keyboard focus somewhere invisible.
performance_check: none.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

```yaml
id: A03-006
status: SOURCE_VERIFIED
severity: P3
confidence: source-confirmed
evidence_label: SOURCE
baseline_sha: 3c90f9f174ac103af5fafc600aebecd98243decc
user_consequence: A future engineer reading src/components/fairway/surfaces/surface.tsx's own docblock ("ADDITIVE ONLY — imported by nothing existing") could conclude Surface is safe to delete or rewrite without a migration sweep, when it is in fact mounted across 168 real import sites including live coach-facing screens (FocusAreaCard, PracticeRxPanel, FairwayMyDevelopment, FairwayGoalCard, FocusAreaModal, GoalsSection, FairwayPlayerDashboard, FairwayEffectiveness, CausalWhyPanel).
source_files: [src/components/fairway/surfaces/surface.tsx]
source_ranges: [surface.tsx:19-20]
expected: A component's own docblock should not misstate its consumption status once the component has shipped into real screens.
actual: 'surface.tsx:19-20 still reads "Pure presentation. Renders correctly inside a `.fairway-ds` scope on a bg-canvas page. ADDITIVE ONLY — imported by nothing existing." This is stale: Surface has 168 real import sites (verified by import-resolution, not bare grep) across coachhelm and dashboard pages.'
mechanism: The comment was accurate at the component's introduction and was never updated once consumers landed — a "trust the comment" trap AGENTS.md already warns about generally.
proposed_fix: 'PROPOSAL: delete the stale "imported by nothing existing" sentence from surface.tsx''s docblock.'
owner_lane: A03
dependencies: []
negative_tests: []
accessibility_check: none.
performance_check: none.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

```yaml
id: A03-007
status: SOURCE_VERIFIED
severity: P3
confidence: source-confirmed (static import analysis only; dynamic import() not checked)
evidence_label: SOURCE
baseline_sha: 3c90f9f174ac103af5fafc600aebecd98243decc
user_consequence: None directly visible to a user; these are candidate dead exports inflating the "duplicated primitive" surface a future engineer has to choose between when building a new screen.
source_files: [src/components/fairway/surfaces/surface.tsx, src/components/fairway/surfaces/glass-surface.tsx, src/components/fairway/forms/Select.tsx, src/components/fairway/forms/RadioGroup.tsx]
source_ranges: [surface.tsx (SurfaceHeader/Body/Footer), surfaces/index.ts:16-23, surfaces/surface.tsx Elevated export, surfaces/glass-surface.tsx, forms/index.ts:30, forms/index.ts:51]
expected: Section 8.4's ask to "find real mounted consumers before deprecating anything" implies the inverse is also worth recording: components with zero real consumers today.
actual: SurfaceHeader/SurfaceBody/SurfaceFooter, Elevated, and the surfaces-variant GlassSurface each have zero consumers beyond their own barrel re-export and (for Elevated/GlassSurface) the src/app/fairway-preview demo page. Select's SelectItem/SelectGroup and RadioGroup's Radio exports have zero consumers anywhere in src.
mechanism: Additive components/exports shipped ahead of a consumer landing, and no consumer has landed yet (or the composed-children pattern, e.g. Surface.Header/.Body/.Footer used as JSX children rather than named imports, was superseded by consumers just writing plain divs).
proposed_fix: 'PROPOSAL: either (a) find and convert 2-3 real consumers to prove the API before further investment, or (b) mark these explicitly @deprecated/candidate-for-removal in the barrel so the inventory does not silently grow. Do not delete without confirming no dynamic import() usage.'
owner_lane: A03
dependencies: []
negative_tests: []
accessibility_check: none.
performance_check: none.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

```yaml
id: A03-008
status: SOURCE_VERIFIED
severity: P3
confidence: source-confirmed
evidence_label: SOURCE
baseline_sha: 3c90f9f174ac103af5fafc600aebecd98243decc
user_consequence: Icons drawn from three different sources within the same screen family can differ subtly in stroke weight/optical size, undermining Section 8.2's "define icon size, stroke and optical alignment once per role."
source_files: [src/components/icons/index.tsx, src/components/fairway/command/icons.tsx]
source_ranges: [multiple; see inventory sweep]
expected: One shared icon set per Section 8.2.
actual: lucide-react (242 file-level consumers app-wide, 89 import occurrences within fairway/**), a hand-rolled inline-SVG set at src/components/icons/index.tsx (403 import occurrences app-wide, 46 within fairway/**), and a third, intentionally-scoped inline-SVG set at src/components/fairway/command/icons.tsx are all live. 14 files under fairway/pages/** import both lucide-react and @/components/icons in the same file.
mechanism: '@/components/icons predates lucide-react''s adoption and was never fully swept; command/icons.tsx is deliberately scoped per its own docblock ("ZERO cross-folder dependencies") so is a narrower, intentional exception, not part of this finding''s "un-reconciled" set.'
proposed_fix: 'PROPOSAL: audit which named icons in @/components/icons have no lucide-react equivalent (brand/sport-specific glyphs likely do not) and only require NEW icon usage to prefer lucide-react; do not force a blanket rip-and-replace of 403 existing call sites.'
owner_lane: A03
dependencies: []
negative_tests: []
accessibility_check: none.
performance_check: none.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

```yaml
id: A03-009
status: SOURCE_VERIFIED
severity: P3
confidence: source-confirmed
evidence_label: SOURCE
baseline_sha: 3c90f9f174ac103af5fafc600aebecd98243decc
user_consequence: Legacy shadcn-style ui/* primitives render on real player/coach mobile dashboard screens (not just the desktop admin/crm surface), so those specific controls do not carry Fairway's warm-tactile styling, focus ring, or haptic contract.
source_files: [src/app/golf/(dashboard)/dashboard/players/[playerId]/game/FingerprintHero.tsx, src/app/golf/(dashboard)/dashboard/my-development/LogProgressButton.tsx, src/app/golf/(dashboard)/dashboard/dev/haptics/page.tsx, src/app/golf/(dashboard)/dashboard/rounds/[id]/review/CoachNotesSection.tsx, src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx, src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx, src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client.tsx]
source_ranges: [FingerprintHero.tsx:53, LogProgressButton.tsx:12-14, dev/haptics/page.tsx:30, CoachNotesSection.tsx:17, rounds/[id]/review/page.tsx:22, new-round-client.tsx:34, continue-round-client.tsx:35]
expected: golf-dashboard .claude/rules/design-system.md says "Fairway is the only dashboard design system" for golf-dashboard surfaces.
actual: These 7 files under (dashboard)/dashboard/** (real player/coach mobile round-tracking and progress-logging screens, not admin/crm) import @/components/ui/button, @/components/ui/input, or @/components/ui/sonner instead of the Fairway equivalents.
mechanism: Pre-Fairway code paths in the live round-review/round-creation flow were not swept when Fairway was declared canonical.
proposed_fix: 'PROPOSAL: shared-change request to A05 (round setup/tracking owns these files) to swap these 7 imports to Fairway Button/Input/fairwayToast; A03 supplies the exact replacement props.'
owner_lane: A05 (file ownership); A03 (migration-map guidance)
dependencies: []
negative_tests: []
accessibility_check: none directly.
performance_check: none.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

```yaml
id: A03-010
status: SOURCE_VERIFIED
severity: P3
confidence: source-confirmed
evidence_label: SOURCE
baseline_sha: 3c90f9f174ac103af5fafc600aebecd98243decc
user_consequence: An error message in StandingStrip renders in a color that will not adapt if dark-mode/contrast tuning is ever done to the fw-danger-ink token, since it bypasses the token entirely.
source_files: [src/components/fairway/charts/StandingStrip.tsx]
source_ranges: [StandingStrip.tsx:443]
expected: 'design-system.md: "Banned in golf-dashboard surfaces: raw red-*/amber-*/rose-*/violet-*" and the fw-*-ink tokens exist specifically because "text-fw-success on bg-fw-success-bg measures 2.83:1; use these" (tailwind.config.ts comment).'
actual: 'StandingStrip.tsx:443 uses `text-danger` (the static #FF3B30 hex, non-theme-aware) instead of `text-fw-danger-ink`. It is the only such site found in src/components/fairway/** (1 of 81 fw-danger/success/warning-prefixed sites elsewhere).'
mechanism: success/warning/danger/destructive/info remain flat hex in tailwind.config.ts (not tokenColor()-wrapped, so they cannot flip under .dark), deliberately kept for the rest of the app's existing bg-success/text-danger usage; one Fairway file reached for the wrong (non-fw) name.
proposed_fix: 'PROPOSAL: change StandingStrip.tsx:443 to text-fw-danger-ink.'
owner_lane: A03
dependencies: []
negative_tests: []
accessibility_check: Flat #FF3B30 has not been verified against dark-canvas contrast in this audit (NOT_RUN); the fw-danger-ink token exists specifically because unadorned danger reds have failed AA before in this codebase.
performance_check: none.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

```yaml
id: A03-011
status: SOURCE_VERIFIED
severity: P3
confidence: source-confirmed
evidence_label: SOURCE
baseline_sha: 3c90f9f174ac103af5fafc600aebecd98243decc
user_consequence: Rows/cells/CTAs built on PressTarget (bento cells, matrix-board rows, filmstrip hole columns, spine CTA pills, notification rows, signal dossier/queue rows) get no tactile (haptic) confirmation on tap unless each consumer wires it individually, unlike Button which always fires fwHaptic('light').
source_files: [src/components/fairway/controls/press-target.tsx, src/components/fairway/controls/button.tsx]
source_ranges: [press-target.tsx:28-43, button.tsx:165-170]
expected: 'Section 6/8.3''s "press and motion roles... the ONE tactile language for I felt that" (segmented.tsx:48) implies one consistent haptic contract across pressable primitives.'
actual: PressTarget renders a plain <button> with only focus-ring/motion-reduce/disabled classes (press-target.tsx:34-38) and does not call fwHaptic anywhere in the file; Button's non-asChild path always fires fwHaptic('light') on click (button.tsx:165-170).
mechanism: PressTarget is documented as "the UNSTYLED pressable primitive" for composition-heavy list/grid rows where per-row haptic-on-every-tap may be undesirable (unverified design intent — PROPOSAL to confirm with owner, not asserted as a bug).
proposed_fix: 'PROPOSAL: confirm with the owner whether PressTarget rows should fire a lighter haptic than Button (e.g. only on selection-changing rows), then document the decision in press-target.tsx''s docblock either way so the asymmetry reads as deliberate rather than an oversight.'
owner_lane: A03
dependencies: [C06]
negative_tests: []
accessibility_check: none.
performance_check: none.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

## Coverage ledger

| Area | Status |
| --- | --- |
| `src/styles/design-tokens.css` (colors, radius, shadow, z-index, glass tokens) | PASS (read in full; z-index dual-ladder -> FINDING:A03-005) |
| `src/styles/tokens.css` (legacy type/spacing/z-index scale) | PASS (read in full; dual z-index ladder -> FINDING:A03-005) |
| `tailwind.config.ts` (colors/tokenColor/radius/type/spacing/shadow) | PASS (read in full; radius fork -> FINDING:A03-002; alpha-composability -> FINDING:A03-003; static semantic-color hex -> FINDING:A03-010 root cause) |
| `src/app/globals.css` (3157 lines) | NOT_RUN:not fully read line-by-line — spot-checked for z-dropdown, backdrop-blur/bg-white legacy-glass references only; a full pass is out of A03's time budget this phase |
| `controls/button.tsx`, `controls/_internal.ts` | PASS (read in full; FINDING:A03-004) |
| `controls/segmented.tsx` | PASS (read in full; FINDING:A03-002 origin site) |
| `controls/press-target.tsx` | PASS (read in full; FINDING:A03-011) |
| `controls/status-pill.tsx`, `badge.tsx`, `filter-pill.tsx`, `selectable-pill.tsx`, `avatar.tsx`, `slider.tsx`, `tabs.tsx`, `Toolbar.tsx`, `PlayerIdentity.tsx` | NOT_RUN:inventoried via consumer-count sweep only; full state-contract read (rest/press/pending/error/disabled) not individually verified for each — see NOT_RUN ledger |
| `surfaces/surface.tsx` (Surface/Inset/Elevated) | PASS (read in full; FINDING:A03-006, A03-007) |
| `surfaces/glass-surface.tsx` | NOT_RUN:inventoried, not fully read |
| `forms/Switch.tsx` | PASS (read in full) |
| `forms/Combobox.tsx`, `forms/NumberField.tsx`, `forms/Checkbox.tsx`, `forms/styles.ts` | PASS:grep-verified alpha-shorthand sites cited (FINDING:A03-003); full state-contract read NOT_RUN |
| `forms/Input.tsx`, `forms/Select.tsx`, `forms/RadioGroup.tsx`, `forms/Form.tsx`, `forms/FormField.tsx`, `forms/FormSection.tsx` | NOT_RUN:inventoried (dead-export findings A03-007 only), full read not performed |
| `overlays/ModalShell.tsx`, `overlays/Sheet.tsx`, `overlays/PopoverPanel.tsx`, `overlays/DiscardChangesModal.tsx` | NOT_RUN:consumer-count inventoried only; z-index interaction cited via date-picker.tsx's documented fix (FINDING:A03-005), not independently re-derived from ModalShell source |
| `feedback/ToastStack.tsx` | PASS (read in full; FINDING:A03-001) |
| `src/components/ui/sonner.tsx` | PASS (read in full; FINDING:A03-001) |
| `feedback/EmptyState.tsx`, `InsufficientData.tsx`, `InlineNotice.tsx`, `Skeleton.tsx`, `FeatureUnavailable.tsx`, `OnboardingStep.tsx`, `ReportProblemButton.tsx` | NOT_RUN:consumer-count inventoried only |
| `charts/*` (StandingStrip, Numeric, Readout, others) | PASS:spot-checked for arbitrary-value clustering and one raw-color site (FINDING:A03-010); full per-chart state-contract read NOT_RUN |
| `calendar/date-picker.tsx`, `calendar/calendar-surface.tsx` | PASS:read the z-index/radius/arbitrary-type-relevant sections cited above; full component NOT_RUN |
| `src/components/ui/*` (51 files) legacy-leakage into golf mobile routes | PASS:per-file consumer-count sweep completed and cited (FINDING:A03-009); did not read each ui/* file's own implementation |
| `src/components/fairway/command/*` (glass-surface.tsx, icons.tsx, command-menu.tsx, search-field.tsx) | NOT_RUN:noted as intentionally-scoped exceptions per their own docblocks; not independently audited beyond that |
| Cumulative gutter (page + shell + card padding stacking) | NOT_RUN:requires computed-layout inspection (rendered DOM/box model) not available without a browser; flagged as a required device/build check, no static citation attempted |
| Typography scale vs Section 8.2 proposed roles (17-20/26-30/16-17/13-14/32-44) | PARTIAL — tailwind.config.ts:339-347 canonical scale read and cited (h1 32/h2 24/h3 18/body-lg 17/body 15/body-sm 13/caption 12/eyebrow 11) — broadly matches the proposal's spirit (destination-label/page-heading/reading/secondary/principal-metric bands exist) though exact px values differ from the plan's illustrative ranges; no owner sign-off exists yet (PROPOSAL territory, Section 7) |
| Tabular numerals for comparable metrics | NOT_RUN:not grepped for font-variant-numeric/tabular-nums usage this phase |
| Dark-mode white-rim/mint-hover audit | PARTIAL — spot-checked FairwaySidebar.tsx border-white/[...] usage; determined these are the nav rail's own permanent-dark chrome (not a light-theme leak into a themed surface), so NOT a violation; a full page-by-page dark-mode diff was NOT_RUN (no runtime) |
| Motion timing vs Section 8.3 proposed ranges (press 0-60ms, release 100-180ms, selection travel 180-260ms, overlays 220-320ms) | PARTIAL — Button/press (FINDING:A03-004, 180ms not 0-60ms), Segmented pill (spring stiffness 450/damping 28/mass 0.6, not a fixed ms figure — physically plausible but not measured against the ms band), Surface interactive hover (240ms) and active (110ms) read and roughly in-band; ToastStack materialize (520ms) exceeds the 220-320ms overlay band — not separately filed as its own finding since ToastStack itself is unmounted (FINDING:A03-001 supersedes) |
| Section 12 seeds G06, G08, G26, A03-half-of-G20, UX25, UX32, UX35 | See dedicated section below |

### Dead/non-mounted paths (excluded from the PASS counts above)

`Surface.Header/Body/Footer`, `Elevated`, `GlassSurface` (surfaces variant), `Select.SelectItem/SelectGroup`, `RadioGroup.Radio`, `ToastStack` component itself (only the `fairwayToast` facade is live) — see FINDING:A03-001, A03-006, A03-007 for detail. Not counted as covered/PASS surface area.

## Section 12 seed verification

- **G06** (SOURCE — "Button-as-link and button paths differ in haptic/busy behavior") — **STILL PRESENT**, reconfirmed at this baseline: `button.tsx:165-183,196-198`. See FINDING:A03-004.
- **G08** (SOURCE/PROPOSAL — "Press inherits 180ms general transition instead of an explicit quick press role") — **STILL PRESENT**: `_internal.ts:43-45,61-63`. `fwPress` was since extracted and is now shared by every control family member (its own docblock says so, citing SelectablePill), which is a real improvement in *breadth* of coverage, but the *duration* itself is still the shared 180ms — only the easing curve changes on `:active`. See FINDING:A03-004.
- **G26** (PROPOSAL — "Add emitted-CSS, unknown utility, token-consumer and component-state verification") — **Partially actioned, partially open.** The `tokenColor()`/`color-mix()` fix in `tailwind.config.ts:20-34` is exactly this kind of verification work already landed for `bg-*`/`text-*` color-opacity composition (documented as fixing 286 prior sites). However the SAME verification was not (or not verifiably) extended to confirm `ring-*`/`border-*` compose identically — see FINDING:A03-003, which is the concrete, current instance of "emitted CSS is the truth" biting back. No CI-level compiled-CSS check exists yet (`docs:check`/ratchets do not compile Tailwind); this remains the single most important unimplemented piece of G26.
- **A03 half of G20** (OBSERVED — "Rounds/Calendar controls and generic cards dominate before actual records") — **CANNOT DETERMINE from A03's lease.** The primitive itself (`Surface`, padding rhythm `p-4/p-6/p-8`) is sound and configurable; whether a *specific screen* stacks five equal `Surface` cards before real Rounds/Calendar content is a composition decision made in the consuming page component, which is A04/A07's file lease, not a primitive defect. No fairway/** primitive was found that *forces* oversized generic cards — recommend A04/A07 verify against their own screen files.
- **UX25** ("repeated headings/truncation — A03 patterns, A04-A08 application") — **PARTIAL.** `Segmented`'s own history (segmented.tsx:341-344 comment) documents a *fixed* truncation bug ("No truncate: the label is what was being masked at 1 char wide"), so the primitive itself no longer truncates its own labels. A systematic sweep of every fairway/pages/** heading/label for truncation-under-large-text was **NOT_RUN** (would require large-text/zoom rendering, out of static-read reach) — defer to A12/device pass.
- **UX32** ("passive data affordances — A03 patterns, A06 application") — **No violation found at the primitive level.** The repo's `StatusPill`/dot idiom and `ToastStack`'s per-type tone icons (rather than color-only) are the documented, deliberate non-button-styling-for-passive-data pattern; a screen-level check for a specific passive metric wrongly styled as a button was NOT_RUN (A06's lease).
- **UX35** ("semantic materials — A03, owner-approved transformation specimens") — this is the deliverable in the "Visual transformation contract" section below (PROPOSAL, requires owner sign-off per the brief; not claimed as already delivered).

## Visual transformation contract (PROPOSAL)

Grounded entirely in tokens/components that exist today; no new fields, no fabricated data.

1. **Canvas -> content plane separation.** `bg-canvas` (design-tokens.css) already has luminance separation from `bg-surface`; the gap most screens are missing is consistent use of `Surface`'s two elevation modes (`elevation="border"` vs `"shadow"`, never both — `surface.tsx:94-99`) rather than ad hoc `bg-white/70`-style overrides (7 stray hits, cited in the inventory sweep). **Action:** standardize on `elevation="border"` for dense list/grid screens (Rounds, roster) and `elevation="shadow"` for hero/single-focus cards (Stats principal metric, Home next-event module) — this is the exact `--fw-shadow-card`/hairline duality Section 8.1 asks for, already implemented, just inconsistently chosen per screen.
2. **Recess.** `Inset` (`surfaces/surface.tsx:230-249`, `bg-surface-sunken`) and `Segmented`'s `TRACK_SUNKEN_SHADOW` (`segmented.tsx:171-172`, a genuine two-layer inset shadow, not a flat tint) are the correct recipe and already ship. **Action:** any screen still using a flat `bg-surface-sunken` div for a nested well without the inset-shadow treatment (round ledger sub-rows, hole-config nested fields — A05's files) should adopt `Inset` directly instead of hand-rolling the tint.
3. **Raised selection.** `SegmentedPill` (`segmented.tsx:207-253`) — solid `bg-surface` pill, `PILL_SHADOW` (outer soft + inset top-highlight), spring glide, dark-mode accent-thumb flip — is the reference recipe Section 8.1 names. **Action:** any other single-select control currently doing a plain color-swap (verified: `SelectablePill` did, per `_internal.ts`'s own history comment, until `fwPress` was extracted to give it tactile press feedback too) should be checked against this same raised-pill recipe where a "which one is selected" affordance is needed, not just a press acknowledgment.
4. **Primary action.** `accent-650`/`accent-750` (button.tsx:62-94) is already the AA-safe, non-theme-flipped solid-green recipe Section 8.1 asks for ("satin green, quiet highlight, clear pressed compression") — this is done and well-reasoned (the contrast-math comment trail in `button.tsx:62-94` is the kind of documented decision Section 2.2 wants). No further token work needed here; the remaining gap is press-timing (FINDING:A03-004), not color/material.
5. **Floating navigation/overlay.** `FairwayBottomNav` deliberately avoids blur for performance (`FairwayBottomNav.tsx:120-124`, a documented, correct call per Section 8.1's "no lost contrast... hidden home-indicator area"); `ToastStack`'s `--fw-glass-*` bounded translucency is the correct allow-listed glass recipe for a genuinely floating, non-reading surface — but it is not currently reaching users (FINDING:A03-001). **Action, priority order:** (a) fix the toast-mount gap first — it is the cheapest, highest-visibility "premium" lever available (a fully-built component sitting unused), (b) only then invest further design time in additional floating-glass surfaces.
6. **Radius discipline.** Section 8.1/8.2's dimensional/geometric intent is undermined less by the token values (10/14/20/28 are sound and already load-bearing at 291+ sites app-wide per the inventory sweep) than by the 31-site off-ramp onto the parallel canonical scale (FINDING:A03-002) — fixing that sweep is higher-leverage than adding new radius roles.
7. **Do not do:** blanket-blur any reading surface (none found doing so — the audit specifically checked and the one full-bleed blur, `FairwayRoundSubmitOverlay.tsx:222`, is a modal scrim over a completion screen, not a reading surface, and is an allowed use); do not replace the system typeface with a serif per Section 1.3 (no evidence any component currently does — not found).

## Token/primitive migration map

| Role | Canonical import | Deprecated/competing | Call sites to move |
| --- | --- | --- | --- |
| Card/container | `@/components/fairway/surfaces` `Surface` | `bg-white/70 backdrop-blur-xl` inline glass (4 remaining sites, all self-aware retirement comments); `src/components/golf/coachhelm/v3/StandingBar/Card.tsx` local `Card` | `StandingBar/Card.tsx` consumers (not enumerated this phase — A03 lease didn't extend to `coachhelm/v3/**`; flag as shared-change candidate) |
| Radius (card/list-row/chip/modal) | `rounded-fw-sm` / `rounded-fw-md` / `rounded-card` / `rounded-fw-lg` | `rounded-sm/md/lg/xl/2xl/3xl` and `rounded-[Npx]` inside `fairway/**` | The 31 sites cited in FINDING:A03-002's `source_ranges` |
| Toast | `@/components/fairway/feedback/ToastStack` (`ToastStack` component + `fairwayToast` facade) | `@/components/ui/sonner` (`Toaster`, `toast`, `useToast`) | `src/app/layout.tsx:13,144` (the actual mount — FINDING:A03-001); then the 7 mobile-dashboard files in FINDING:A03-009 still calling the legacy `toast`/`useToast` API directly |
| Button/link-button | `@/components/fairway/controls` `Button`/`IconButton` | `@/components/ui/button` | `FingerprintHero.tsx:53`, `LogProgressButton.tsx:13`, `dev/haptics/page.tsx:30` (FINDING:A03-009) |
| Input | `@/components/fairway/forms` `Input`/`NumberField` | `@/components/ui/input` | `LogProgressButton.tsx:12` (FINDING:A03-009) |
| Icon | `lucide-react` (preferred for new usage) | `@/components/icons` (403 existing sites — do not mass-migrate, see FINDING:A03-008) | New call sites only |
| z-index | `--fw-z-*` (`design-tokens.css`) — PROPOSAL to also formally fold in `z-dropdown:1000` as a named tier | `--z-*` / `z-overlay`/`z-modal`/`z-toast` Tailwind utilities (`tokens.css`) | ~20 files enumerated in the inventory sweep (FINDING:A03-005) |
| Semantic status color (success/warning/danger) | `fw-success`/`fw-warning`/`fw-danger` + their `-ink`/`-bg` pairs | `success`/`warning`/`danger`/`destructive`/`info` (static hex, non-theme-aware) | `StandingStrip.tsx:443` (FINDING:A03-010) is the only fairway/** straggler found |

## Component inventory (mounted-consumer counts)

*(Full detail gathered by a delegated read-only sweep this session; counts are import-resolution counts — i.e. a real `import {X} from '<resolved fairway path>'` or barrel — not bare-word grep. See each row's citation for where to re-verify.)*

| Component | Real consumers (total) | Pages/screens | Elsewhere/tests | Note |
| --- | --- | --- | --- | --- |
| Button/IconButton | 192 / 32 | 91 / 14 | 101 / 18 | canonical, healthy |
| Segmented | 36 | 15 | 21 | reference recipe; has FINDING:A03-002 |
| StatusPill | 112 | 35 | 77 | canonical |
| Badge/Chip | 41 / 16 | 20 / 13 | 21 / 3 | canonical |
| Surface / Inset | 168 / 47 | -- | -- | canonical; stale docblock (FINDING:A03-006) |
| Surface.Header/Body/Footer | ~1 (barrel only) | 0 | 0 | candidate dead (FINDING:A03-007) |
| Elevated | 2 (demo + barrel) | 0 | 0 | candidate dead (FINDING:A03-007) |
| GlassSurface (surfaces variant) | 2 (demo + barrel) | 0 | 0 | candidate dead (FINDING:A03-007) |
| ModalShell | 33 | 20 | 13 | canonical |
| Sheet | 22 | -- | -- | canonical |
| ToastStack (component) | 2 (both demo/local, not root) | 0 real | 0 | FINDING:A03-001 |
| fairwayToast (facade) | ~16 | most | some | renders through wrong Toaster (FINDING:A03-001) |
| InlineNotice | 110 | 42 | 68 | canonical |
| EmptyState | 92 | 46 | 46 | canonical |
| Skeleton family | 99+ | 25+ | 74+ | canonical |
| Switch | 10 | -- | -- | canonical, well-built (see report body) |
| NumberField | 6 | 5 | 1 | canonical; alpha-shorthand risk (FINDING:A03-003) |
| SelectItem/SelectGroup | 0 | 0 | 0 | dead export (FINDING:A03-007) |
| Radio (RadioGroup family) | 0 | 0 | 0 | dead export (FINDING:A03-007) |
| PressTarget | 9 | 0 | 9 | no haptic by default (FINDING:A03-011) |
| Tabs family | 5 | 1 | 4 | low adoption vs. Segmented -- confirm Tabs is still the intended pattern for its 4 non-golf consumers, or fold into Segmented |

## Actual-component quality lab -- spec (Section 6, A03 bullet 4)

**PROPOSAL** -- none of this exists yet; it is the deliverable, not a claim of current coverage.

A lab route (e.g. `src/app/fairway-preview/page.tsx` already exists and is the closest current analog -- verified it renders `ToastStack`, `Elevated`, `GlassSurface` demos today, confirming it is the one place those "dead" exports actually mount) should be extended, using **real imports only**, to render every primitive in this state matrix, driven by deterministic fixtures (fixed strings/numbers, no `Math.random()`/`Date.now()`):

| Component | States to render side-by-side |
| --- | --- |
| Button (both `button` and `asChild` paths) | rest, hover, focus-visible, active/press, disabled, busy, with/without leftIcon, with/without rightIcon, each of the 4 variants |
| NumberField | rest, focus, valid, `data-invalid`, disabled, with a cleared/empty buffer (per G10's "yardage clears to 0" family of bugs -- A05's data problem, but the *visual* invalid/empty state belongs in this lab) |
| Segmented | 2-option, 4-option (overflow/scroll case per its own fixed H7 bug), disabled option, keyboard-focus ring, reduced-motion (pill snaps, no spring) |
| Switch | off, on, disabled-off, disabled-on, focus-visible |
| Calendar day cell (`FairwayMonthGrid` day cell, real import) | empty day, single event, overflow (N+ more), today, selected, out-of-month |
| Round ledger row (real import from `pages/rounds`) | normal, unfinished/resumable, error/failed-sync |
| Metric/Readout (`instrument/Readout.tsx`) | populated, zero (distinguished from unavailable), unavailable/insufficient-sample |
| Chart (one `TrendChart` or `Sparkline` real import) | populated, empty, loading skeleton, error |
| Overlay (`ModalShell`, `Sheet`) | opening, open, closing, with a nested Select/Combobox popover (regression-testing the z-index fix in FINDING:A03-005) |
| Shell chrome (`FairwayBottomNav`) | rest, one-tab-pending (G05 territory, A02-owned -- lab should still render it to catch a *visual* regression even though the fix is A02's) |

Each state must be reachable by URL/query param or a visible in-page toggle (not devtools-only), so an owner-approval screenshot pass (Section 7's "before/after state sheet") can be taken without special tooling, and so A12 can drive it headlessly for computed-style/contrast assertions per FINDING:A03-003.

## Required states per shared primitive (Section 8.3)

Confirmed/observed in source for the primitives actually read this phase; a primitive not listed was not individually re-verified against the full 8.3 list this phase (see coverage ledger).

| Primitive | rest | hover | pressed | selected | disabled | pending/busy | error | keyboard-focus | reduced-motion | theme (dark) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Button (non-asChild) | y | y | y (180ms, not 0-60ms) | n/a | y | y (spinner) | n/a (danger variant only) | y | y | y (accent-750 fix documented) |
| Button (asChild) | y | y (inherited class) | y | n/a | n (FINDING:A03-004) | n (FINDING:A03-004) | n/a | y | y | y |
| Segmented item | y | y | y | y | y (opacity-40) | n/a | n/a | y | y (pill snaps) | y (accent thumb flip, documented owner directive) |
| Switch | y | n/a (base-ui) | n/a | y (checked) | y | n/a | n/a | y | not explicitly checked | not explicitly checked |
| NumberField/Combobox/Checkbox | y | not verified | not verified | n/a/y | not verified | not verified | y (`data-invalid`) | y -- **contingent on FINDING:A03-003** | not verified | not verified |
| PressTarget | y | consumer-supplied | consumer-supplied | consumer-supplied | y | n/a | n/a | y | y | consumer-supplied |

## Contracts requested

- **C08 (Material/control)** -- needs to formally name: (1) which radius ladder is canonical (resolve FINDING:A03-002), (2) which z-index ladder is canonical (resolve FINDING:A03-005), (3) an explicit "emitted-CSS verified" checklist item before any new token-backed opacity-modifier pattern ships (resolve FINDING:A03-003's open question as policy going forward, not just this one instance).
- **C06 (Feedback)** -- needs to state whether `PressTarget`-based rows are exempt from the "one haptic owner" rule or should adopt it (FINDING:A03-011).

## Shared changes requested

| File | Owning lane | What A03 needs |
| --- | --- | --- |
| `src/app/layout.tsx:13,144` | A02/A00 (root shell chokepoint) | Swap `Toaster` import from `@/components/ui/sonner` to `@/components/fairway/feedback/ToastStack`, after confirming haptic/duration-default parity (FINDING:A03-001) |
| 7 files in FINDING:A03-009 | A05 (round setup/tracking file lease) | Swap `ui/button`, `ui/input`, `ui/sonner` imports to the Fairway equivalents A03 names in the migration map |
| `src/components/golf/coachhelm/v3/StandingBar/Card.tsx` | CoachHelm-owning lane (A06) | Confirm whether this local `Card` should retire onto `Surface` -- not independently investigated further this phase, flagged from the duplicate-primitive sweep only |

## Open questions for the owner

- Is the `ToastStack`/`fairwayToast` mount gap (FINDING:A03-001) an intentional staged rollout (i.e., ToastStack was built but deliberately not yet flipped on), or an oversight? This changes whether it's a P1 repair or a "flip the flag when ready" note.
- Section 7's proposed type scale (17-20/26-30/16-17/13-14/32-44) differs numerically from the shipped canonical scale (18/24/18/17/15/13/12/11 for h3/h2/h3-again/body-lg/body/body-sm/caption/eyebrow) -- is the shipped scale the intended target already, or does the owner want the plan's illustrative ranges actually retuned?

## Messaging referrals

None found. No messaging-specific file (`FairwayMessages.tsx`, `MessageComposer.tsx`, `MessageThreadPane.tsx`, `FairwayNewMessageSheet.tsx`) was read or altered in this pass; `messaging/pages/messages/*` appeared only in the component-inventory sweep's directory listing, not in any finding above.

## NOT_RUN ledger

| Check | Missing dependency | Next owner |
| --- | --- | --- |
| Whether `ring-*`/`border-*` opacity-modifier utilities on `color-mix()`-wrapped CSS-variable colors actually compile to a working rule (FINDING:A03-003) | A CSS build (`npm run build` or equivalent) -- not permitted in this read-only audit lease | A00/A12 (build gate), then A03 (fix if broken) |
| Full computed-style/contrast verification of any color, shadow, or focus-ring in light/dark | No browser/device in this phase | A12 (device pass), A03 (fix) |
| Cumulative-gutter (page + shell + card padding stacking) measurement | Requires rendered box-model inspection | A12/device pass |
| Tabular-numerals usage audit across metric displays | Not grepped this phase (time-boxed) | A03, next pass |
| Full dark-mode white-rim/mint-hover sweep across every fairway/pages/** file | No runtime theme toggle available; only source-level `dark:` class spot-checks were performed | A12/device pass |
| Whether the `src/components/ui/*` file set has consumers via the `@/components/ui` barrel form (not just per-file imports) | Barrel-import counting not implemented in this pass's script | A03, next pass |
| Whether any "dead" export (`Surface.Header/Body/Footer`, `Elevated`, `GlassSurface`, `SelectItem/SelectGroup`, `Radio`) is reached via a dynamic `import()` | Static-analysis tooling only; no bundler introspection available | A03, next pass |
| `src/app/globals.css` full read (3157 lines) | Time-boxed this phase to targeted greps only | A03, next pass |
