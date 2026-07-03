# Fairway Premium Completeness Audit

**Date:** 2026-06-14
**Author:** Design Director (synthesis of 10-agent study — 5 in-code craft audits + 5 external premium-reference briefs)
**System under review:** Fairway design system (`src/components/fairway/**`, `src/styles/design-tokens.css`, `tailwind.config.ts`) — GolfHelm's live production UI.
**The bar:** Steve-Jobs attention-to-detail. The product must read as handcrafted by a top-tier 50,000-person product org — not vibe-coded. Light, airy, premium, modern, consistent.

---

## Verdict

**Fairway is a genuinely well-built system sitting at roughly 7/10 against the premium bar — and the remaining 3 points are almost entirely SYSTEMATIZATION and TRUTH-TELLING, not a rebuild.** The primitives (Surface, MetricCard, Button, ViewHeader, Tabs/Segmented, ModalShell/Sheet, Skeleton, the warm-OKLCH 2-layer shadow + lit top-edge, disciplined single-green accent, tabular-nums) are handcrafted. What betrays the "vibe-coded" tell is the SEAMS: a type system that loads two fonts it never paints, a signature eyebrow flourish drawn 8 different ways, no shared page-container so 8 content widths fight the top bar, motion tokens that exist but aren't consumed, a cold-white shimmer on a warm-cream canvas, and dormant native capability (haptics, sheet detents) that's installed but never called.

The five themes that would most signal handcrafted quality — what Steve would notice first — are:

1. **Tell the truth in the type system, then tune it optically.** Stop shipping Fraunces + General Sans bytes that paint zero pixels (the tokens already committed to Apple system SF Pro — the loads are dead weight), then fix the optical-tracking curve so small text gets air and display text gets tight. This is the single biggest "system font, untuned" tell and the loudest "the code claims a voice it doesn't have" tell, fixed together.
2. **One frame, one rhythm.** A single `PageContainer` primitive collapsing 8 content widths → 2 and aligning the page H1 to the glass top-bar's left rule. Right now the two flagship dashboards literally don't share a left edge. Nothing reads "assembled by one hand" like a consistent frame.
3. **One signature flourish, drawn once.** The eyebrow/overline — the most-repeated small element in the system — is rendered with 8 letter-spacing values and 2 weights. Collapse it to ONE `<Eyebrow>` recipe. An overline the eye reads as a typographic fingerprint must look identical every time.
4. **Warm everything — including loading and glass.** The cold pure-white shimmer sweep and the cold-white glass speculars (top bar, tooltip, hero card) contradict the warm-cream material the tokens fight for. Route every sheen and skeleton through the warm tokens. This is the clearest "who built this?" temperature tell.
5. **Make the motion physical and choreographed where it matters.** Consume the `--fw-*` motion tokens (they're barely used — 37 var refs vs 63 hardcoded literals), add a true CSS `linear()` spring, give flagship grids a first-mount-only stagger, and wire the installed-but-dormant haptics. The header choreographs today and the content beneath it just appears.

The work is mostly token edits + shared primitives + codemods — broad reach, low behavioral risk. Executed, Fairway clears the premium bar.

---

## External-research principles distilled (the cross-reference lens)

Findings backed by a verified Apple/Linear/Vercel/Stripe/Mercury/1X technique are ranked higher. The briefs converge hard on a handful of moves:

- **Optical tracking is a CURVE, not a constant (Apple SF + Geist + Mercury).** Tracking goes negative above ~20px and slightly positive below ~14px; crossover ~15-16px. Fairway's display (-0.025em) is too loose at the top and its footnote/caption sit at 0em where they want +0.002 to +0.014em. The 44px hero numeral carries ZERO tracking. Cheap, high-impact, invisible-when-wrong.
- **Inverse-weight ramp (1X / Mercury).** The LARGER the type, the LIGHTER the weight — premium reads at ~380-440 on display/h1, not baked 600. Big-and-light is the strongest "effortless premium" tell. (High-caution against the brand-locked editorial register — gate in the preview gallery.)
- **True spring via CSS `linear()` (Apple HIG).** cubic-bezier cannot model overshoot+settle. Two tokens: a no-overshoot settle (~480ms) for reveals/overlays and a one-overshoot pop (~420ms) for taps. `@supports`-gated with the existing cubic-bezier as fallback.
- **Vibrancy hierarchy on glass (Apple Materials).** Never paint opaque ink on a translucent material; use 4 alpha levels on the same warm ink so the backdrop bleeds through. Keep blur at the 22px ceiling (already correct).
- **Functional interaction-role color steps (Geist/Vercel).** Reserve neutral surface/border hover+active as tokens so states stop being hand-authored per component and drifting. Keep the SINGLE green; the discipline is in disciplined neutral states.
- **Restraint = the brand (Vercel/Linear/Stripe).** A 6-slot accent allow-list (CTA, active nav, KPI value, selection, focus ring, chart-gained). ~95% neutral canvas. Air + choreographed-once reveals do the work, not decoration.
- **Native-feel = wiring dormant capability (iOS/Capacitor brief).** Haptics (installed, never called), vaul sheet detents (no default snapPoints → every sheet opens full-height), iOS large-title scroll-collapse (tokens exist, unused), 44pt tap floor, safe-area as a lint-able token.
- **"Fly, don't teleport" continuity (Family/Apple).** Sign-aware ≤12px directional panel transitions, button label morph, list→detail shared `layoutId`. Reuses curves already shipped.
- **Lock the craft in CI, SaaS-free (iOS brief).** Playwright `toHaveScreenshot()` on the unauthed `/fairway-preview` gallery (reduced-motion + gradient-off for determinism) + ast-grep/semgrep token-guard rules so the consolidation can't silently regress.

---

## Per-dimension summary

### Typography & hierarchy — 6.5/10
Real 9-step scale with baked leading/tracking/weight, handcrafted masthead, tabular-nums discipline. But: (1) **Fraunces + General Sans are loaded and attached to `<html>` yet painted on ZERO pixels** — the tokens already resolved to pure Apple system SF Pro (the explicit "Fraunces dropped" comment at design-tokens.css:211 confirms intent), so these are dead bytes + a swap cost; (2) the eyebrow has 8 tracking values + 2 weights; (3) no display-numeral token (6 hardcoded sizes 28-72px); (4) heading tracking/weight overridden ad-hoc; (5) `font-light` on the single-weight Fragment Mono is a silent no-op (6 sites); (6) optical tracking curve is wrong on the small end (Apple/Geist/Mercury all agree). The font fix has SHIFTED from "rebind the vars" to "delete the unused loads + scrub the Fraunces docstrings" because the system has clearly committed to SF Pro.

### Color, depth, elevation & material — 7/10
Handcrafted warm-OKLCH 2-layer shadows, lit-edge `--fw-shadow-card`, strict glass allow-list, disciplined single green. But: (1) `text-text-tertiary` is 4.02:1 on cream (below AA) and dropped to 2.4-2.9:1 by `/50-/80` opacity in 9 component sites — a real legibility failure; (2) glass specular is cold pure-white in 3 canonical consumers (TopBar, ChartTooltip, hero glass.ts) contradicting the warm-cream specular tokens; (3) two of five surface tiers (surface-tint ΔL 0.010, elevated ΔL 0.006) are perceptually invisible; (4) FairwayCoursePicker leaks the legacy `primary-*` green (6 sites) — the one live exception to "greens consolidated"; (5) dark cockpit reuses warm light-card shadows that vanish on near-black; (6) the lit-edge isn't the default for all resting cards.

### Motion & micro-interactions — 7/10
Handcrafted, reduced-motion-safe primitive layer (NumberFlow, Tabs/Segmented layoutId glide, spring overlays). But: (1) motion tokens barely consumed — 37 `var(--fw-dur*)` refs vs 63 hardcoded duration literals that drift (180/240/280/520ms); (2) skeleton shimmer is a COLD WHITE linear 2s sweep on warm cream; (3) flagship pages have NO entrance/stagger — KPI grids, roster, hub pop in flat while the header choreographs; (4) 24 `animate-pulse` boxes vs the bespoke shimmer Skeleton; (5) sidebar active marker pops per-row (no layoutId glide unlike Tabs); (6) FairwayCoursePicker uses `AnimatePresence mode="wait"` — the exact flash bug RouteTransition documents and forbids; (7) press metaphor forks (translate-y vs scale vs nothing); (8) the `--fw-ease-spring` token is used exactly once.

### Layout, spacing, grid & alignment — 6/10
Disciplined primitives (p-6/p-8, border-OR-shadow, 4px token scale, min-w-0/truncate hygiene). But the PAGE layer betrays it: (1) **NO shared page-container** — 8 content widths (760-1536px), a Cartesian product of gutters, and the player vs coach dashboards disagree on left edge (48px vs 32px) AND neither aligns to the top bar (32px); (2) inconsistent section rhythm including off-scale `gap-7` (4 page sites, falls through to Tailwind default); (3) 6-up KPI grid keeps full-card p-6 (cramped); (4) MetricCard duplicated as bespoke tiles in 3 pages; (5) ad-hoc px-1 micro-gutters; (6) two divergent player-card layouts; (7) non-responsive grid-cols-2 KPI grids on desktop.

### Component states, forms & polish — 7/10
Honest empty/insufficient/loading/error states, no-CLS reserved message rows, full state contracts on primitives, real ARIA. But: (1) two competing focus-ring recipes (forms 70%/offset-1 vs controls solid/offset-2 + a third inset variant); (2) four page forms reimplement a divergent `fieldCls` using `focus:` not `focus-visible:`; (3) loading split 50/50 Skeleton vs animate-pulse; (4) one-off bouncing-dots busy state; (5) raw `warm-*` palette leaks (~25 sites); (6) empty-state title typography drifts across 3 siblings; (7) lucide + 19 inline glyphs at scattered stroke widths; (8) 81 raw `<button>` in pages, several with no focus-visible (EventEditor title input has `outline-none` + no ring — a hard a11y gap); (9) `::selection` raw hex; (10) sm controls below 44px touch floor.

---

## Prioritized findings

Ranked by impact-to-effort with risk as tiebreaker. Impact 1-5 (5 = most visible premium tell). Effort S/M/L. Platform tags: all / desktop / mobile / ios.

| Rank | Title | Fix (concrete) | Impact | Effort | Risk | Platform |
|---|---|---|---|---|---|---|
| 1 | Fonts loaded but painted on zero pixels (the type system claims a voice it doesn't have) | DELETE `frauncesDisplay` + `generalSans` from `fonts.ts` and the two `.variable` attaches in `layout.tsx:103` (tokens already committed to Apple SF Pro per design-tokens.css:211). Scrub every "Fraunces"/"General Sans" docstring (view-header, Readout, FormSection, calendar-surface). Stops shipping 2 unused font files + a swap. | 5 | M | medium | all |
| 2 | No shared page-container — 8 widths, gutters fight the top bar | Add `PageContainer` (`mx-auto w-full max-w-[1200px] px-6 pt-8 pb-10 sm:px-8 lg:px-12`) with a 2-token `width` prop (`standard` 1200 / `prose` 760) and default content slot `flex flex-col gap-10`. Match gutter to TopBar (`px-6 lg:px-8` → align both to `lg:px-12`). Migrate all ~21 page roots. Collapses 8 widths→2 and aligns chrome. | 5 | M | medium | all |
| 3 | Optical letter-spacing curve wrong on small + display (the "system font, untuned" tell) | In `tailwind.config.ts` fontSize: display -0.025→-0.03em; add +tracking to footnote/caption/caption-2 (+0.002 to +0.014em); confirm iOS scale agrees. Backed by Apple SF + Geist + Mercury verified curves. One-line-per-token, app-wide. | 5 | S | low | all |
| 4 | Eyebrow flourish drawn 8 ways (151 tracking overrides) | Create `<Eyebrow>` (or `.fw-eyebrow`) = `text-eyebrow font-semibold uppercase text-text-tertiary`, tracking lives only in the token (bump to 0.08em). Codemod ~220 sites to drop inline `tracking-[...]`/`font-medium`/`normal-case`. Lint-ratchet: `text-eyebrow` may not co-class `tracking-`. | 4 | M | low | all |
| 5 | text-tertiary fails AA (4.02:1) + dropped to 2.4-2.9:1 by opacity | Darken token one stop to ~`oklch(0.52 0.015 70)` (≈4.6:1). Add `--fw-color-text-quaternary` for decorative dim cases. Replace `text-text-tertiary/70|80` and `opacity-50` empty states (9 sites) with solid tertiary. ESLint flag `text-text-tertiary/[0-9]`. | 5 | M | medium | all |
| 6 | Cold-white skeleton shimmer on warm cream | Recolor `bg-shimmer` to `oklch(1 0.01 90 / 0.45)` warm specular; slow + ease `shimmer 2.4s cubic-bezier(0.4,0,0.2,1) infinite`. Keep `motion-reduce:before:hidden`. One change, every loading surface reads warm-premium. | 4 | S | low | all |
| 7 | Glass specular is cold pure-white in 3 canonical consumers | Route every sheen through warm tokens: glass.ts:66, FairwayTopBar:49, ChartTooltip (border/inset/bg) → `var(--fw-glass-highlight)`/`--fw-glass-border`/`--fw-glass-bg-strong`. One warm specular everywhere. | 4 | S | low | all |
| 8 | Flagship pages have no entrance/stagger | Add a CSS-only stagger: container utility applying `animate-fade-up` to children with incremental `animation-delay` (cap ~6, `motion-reduce:animate-none`). Apply to dashboard KPI grid, top-players, roster grid, hub cards. ~10-15 lines/page, zero JS animation cost. Reuse existing `animate-fade-up` keyframe. First-mount-only (never re-animate on poll/sort). | 4 | M | low | all |
| 9 | Motion tokens barely consumed — 63 hardcoded duration literals drift | Add Tailwind utilities backed by the vars (`duration-fast`→`var(--fw-dur-fast)`, `ease-soft`→`var(--fw-ease-soft)`). Rewrite `fwTransition`/Surface/MetricCard to use them. Read JS curves (motion.ts, overlays/_shared.ts) from one shared constants module. Promote the 240ms card-hover to a real `--fw-dur-hover` token. | 4 | M | medium | all |
| 10 | Off-scale + inconsistent section rhythm (gap-7/gap-8/gap-10) | Standardize: `gap-10` top-level (via PageContainer default), `gap-6` intra-section. Delete all `gap-7` (4 page sites — off the named scale). Add lint-ratchet against `gap-7/9/11`, `px-7`. | 4 | M | low | all |
| 11 | Page forms reimplement divergent fieldCls (focus: not focus-visible:) | Replace local `fieldCls`/`labelCls` in EventEditor, NewRoundEntry, ItineraryModal, HoleConfig with canonical Input + FormField (or import `fieldControlBase`/`labelClasses`). At minimum: `focus:ring-accent-500/25` → canonical `focus-visible:ring-2 ring-accent-500/70 ring-offset-1`, `rounded-fw-md`→`rounded-fw-sm`. Create/Edit Event is a top-3 surface. | 4 | M | medium | all |
| 12 | 6-up KPI tiles keep full-card p-6 (cramped) | Add `density='compact'` to MetricCard (`p-6`→`p-4`, value type down one step); use in FairwayKeyMetricsGrid, or drop to `lg:grid-cols-4`. Add `truncate` to the eyebrow label span so long labels don't wrap + de-align baselines. | 4 | S | low | all |
| 13 | Add a display-numeral scale token (6 hardcoded sizes 28-72px) | Add `num-sm/md/lg/hero` (28/40/56/72, lineHeight + -0.02em baked, hero -0.028em per Geist) to `tailwind.config.ts`. Point Readout SIZE_VALUE + Numeric hero at them; codemod raw `text-[56/64/72px]` page sites. Collapse orphan 44/64px to the nearest rung. | 4 | M | low | all |
| 14 | Wire the dormant haptic layer (installed, never called) | New `src/lib/fairway/haptics.ts` `fwHaptic(kind)`: Capacitor.isNativePlatform() → Haptics, else `navigator.vibrate`, else no-op; respect reduce-motion. Call `selection` in Segmented/Tabs/Switch/Radio/Checkbox, `light` in primary Button onClick, `medium` in destructive confirms, `success`/`error` in ToastStack by tone. Event handlers only, never render. | 4 | M | low | ios |
| 15 | Give bottom Sheets iOS detents (no default snapPoints → all open full-height) | Add `peek` prop to `Sheet.tsx` defaulting `snapPoints={[0.5,1]}` on `side='bottom'`; thread `pb-[env(safe-area-inset-bottom)]` into SheetFooter; `dismissible={false}` on composers/forms so a stray scrim-tap never nukes unsaved input. Apply at MessageComposer, EventDetailDrawer, ShotEntry, Penalty/EditShot modals. | 4 | M | medium | mobile |
| 16 | Loading split 50/50 Skeleton vs animate-pulse (24 raw sites) | Replace `animate-pulse rounded-* bg-surface-sunken` blocks with `<Skeleton/>`/`<SkeletonCard/>`/`<SkeletonList/>`. MetricCard.loading → shimmer shapes. InsightCard, command-menu, ChartFrame, StandingStrip, calendar. One shimmer everywhere. | 3 | M | low | all |
| 17 | FairwayCoursePicker leaks legacy primary-* green (6 sites) | Sweep onto Fairway tokens: `text-primary-600`→`text-accent-700`, `ring-primary-500`→`ring-border-focus`, `focus:border-primary-500`→`focus:border-accent-500`, `focus:ring-primary-500/12`→`ring-accent-500/25`. Add `primary-` to no-legacy lint for `fairway/**`. | 3 | S | low | all |
| 18 | Two competing focus-ring recipes (+ a third) | Promote ONE `fwFocusRing` consumed everywhere: `focus-visible:ring-2 ring-border-focus ring-offset-2 ring-offset-canvas`. Replace `ring-accent-500/70`+offset-1 in forms, Combobox, NumberField stepper, RadioGroup. (Pairs with rank 31 Apple-halo upgrade.) | 3 | M | low | all |
| 19 | Upgrade focus ring to soft Apple HALO (1px keyline + ~4px glow) | Extend `--fw-glow-accent` into a layered halo: `0 0 0 1px var(--accent), 0 0 0 4px color-mix(accent 30%, transparent)`. On dark sidebar scope use accent-400 + cream inner keyline. Keyboard-only. Flows to every control via fwFocusRing. | 3 | M | low | all |
| 20 | 44pt tap floor leak (CLOSE_BUTTON_CLASS h-9 w-9 = 36px) | Add a `hit-slop` utility (`before:absolute before:-inset-1.5 before:content-['']`) to `_internal.ts`. Apply to overlay/drawer close (currently 36px), interactive pills/badges, dense table row actions, compact calendar day cells. Visual size unchanged, hit area reaches 44px. | 3 | M | low | ios |
| 21 | Sidebar active marker pops per-row (no layoutId glide) | Give the active marker (and nav pill bg) a shared `layoutId` `motion.span` with `transition={{type:'spring',stiffness:380,damping:34}}`, undefined under reduced motion — mirroring tabs.tsx. Scope layoutId per sidebar instance (mobile vs desktop). | 3 | M | medium | all |
| 22 | FairwayCoursePicker uses AnimatePresence mode="wait" (the documented flash bug) | Drop `mode="wait"`; crossfade the two stages (keep both mounted, toggle opacity/position) or use the RouteTransition single-keyed pattern with overlapping initial→animate. Never an empty frame mid-task. | 3 | S | low | all |
| 23 | Press metaphor forks (translate-y vs scale-95 vs nothing) | Pick ONE: the system's `active:translate-y-[0.5px]`. Replace CoursePicker `hover:scale-105 active:scale-95` with IconButton/standard press. Add press + `active:bg-surface-tint` settle to clickable DataTable rows (currently no tactile confirm). | 3 | S | low | all |
| 24 | Add true CSS linear() spring tokens | Add `--fw-spring-settle` (180/26, ~480ms) + `--fw-spring-pop` (220/18, ~420ms) as sampled `linear()` alongside the existing cubic-bezier (kept as `@supports` fallback). Wire pop into press (button/segmented/tabs), settle into overlay/glass enter. | 3 | M | medium | all |
| 25 | Functional interaction-role color tokens (Geist) | Add `--fw-color-surface-hover/-active`, `--fw-color-border-hover` (oklch L ±2-3%) so components use `bg-surface hover:bg-surface-hover active:bg-surface-active` instead of hand-deriving. Refactor button variantStyles, data-table row hover. Keep the single green. | 3 | M | medium | all |
| 26 | 81 raw <button> in pages, several with zero focus-visible | Swap real actions to Button/IconButton or apply fwFocusRing. EventEditor title input (`outline-none`, no ring) gets canonical focus treatment — hard a11y gap on a primary field. ESLint flag `<button>` without focus-visible in `pages/**`. | 3 | M | medium | all |
| 27 | iOS large-title scroll-collapse header (tokens exist, unused) | Add `largeTitle` ViewHeader variant: in-flow `text-large-title`, on scroll past ~52px cross-fade into the TopBar center via `useScroll`/`useTransform`; instant swap under reduced-motion. Apply on mobile renders of dashboard/hub/roster/coachhelm. | 3 | L | medium | ios |
| 28 | Surface-tint + elevated tiers perceptually invisible | Re-space ramp ≥0.012-0.015 L per step. Make elevated genuinely brightest+warmer (menus read lifted); pull surface-tint warmer/deeper (`oklch(0.968 0.026 84)`) so the plinth reads as a toasted band. Verify the full canvas→sunken→surface→tint→elevated stack rendered together. | 3 | S | medium | all |
| 29 | Dark cockpit reuses warm light-card shadows (invisible on black) | Add `--fw-shadow-dark-raise` (deeper, cooler) under `.on-dark`; point CoachHelm hero at it. Give StandingStrip an on-dark variant (lighter inset rim, no warm drop) and drop border-OR-shadow at rest. | 3 | M | medium | all |
| 30 | Safe-area as a lint-able token (hand-written env() in ~10 files) | Adopt `tailwindcss-safe-area` (p-safe/pb-safe); confirm `viewport-fit=cover` in layout.tsx; pin one `--fw-safe-*` source for sticky bars/toasts/FAB. Refactor the bespoke `env()`+calc strings. | 3 | M | low | ios |
| 31 | Directional ("fly, don't teleport") panel/route transitions | Add `directionalPanelVariants(reduced, dir)` next to revealVariants: incoming from x:+12, outgoing to x:-12 (sign-aware), ≤12px, ease-glide 280ms, reduced→opacity-only. Apply to tabs panel body + view-header-segments; match the Segmented pill spring feel. | 3 | M | medium | all |
| 32 | MetricCard duplicated as bespoke tiles in 3 pages | Replace bespoke tiles (KeyMetricsGrid, PlayerInsight, RoundSubmitOverlay) with the real MetricCard + new `density` prop; add `displayValue?: ReactNode` escape hatch for string values. One tile recipe app-wide. | 3 | M | low | all |
| 33 | Raw warm-* palette leaks into pages (~25 sites) | Map raw warm steps to roles: warm-800/900→text-primary, 700/600→secondary, 500/400→tertiary, border-warm→border-strong/subtle. Lint-ratchet ban `(text|bg|border|ring)-warm-[0-9]` in `fairway/**`. | 2 | S | low | all |
| 34 | Heading tracking/weight overridden ad-hoc | Decide intended display weight (consider 500 per inverse-weight brief — preview-gated), set it in the token, codemod heading sites to drop inline tracking/weight. Migrate FairwayMyDevelopment off raw legacy text-sm/warm-700. Lint: headings may not co-occur `tracking-[`/`font-(light|normal|bold)`. | 3 | M | medium | all |
| 35 | font-light on Fragment Mono is a silent no-op (6 sites) | Drop `font-light` from all 6 `font-fw-mono` sites (Fragment Mono ships weight 400 only). If a lighter hero numeral is wanted, use the display sans face, not a synthetic-thin mono. | 2 | S | low | all |
| 36 | One-off bouncing-dots busy state | Render MessageComposer send as `<IconButton variant='primary' busy={sending}>`; drop the hand-rolled button + 3 animate-bounce spans + non-DS `ring-offset-surface`. (Typing-indicator dots stay — distinct semantic.) | 2 | S | low | all |
| 37 | Default numeric face is mono (reads "terminal") | Optional (preview-gated): default KPI numbers to `font-fw-sans tabular-nums` weight 500, keep mono behind `variant='ledger'` for leaderboards/DataTable. Works with NumberFlow. (1X/Mercury reading; brand-locked — A/B in gallery.) | 3 | M | medium | all |
| 38 | Empty-state title typography drifts across 3 siblings | One headline scale: roomy `font-fw-display text-h3`, compact `text-body-lg font-medium`. Align icon-chip sizes (h-12/h-10) + bg-surface-sunken text-tertiary. DataTableEmpty/Error delegate to `<EmptyState variant='subtle'/>`. | 2 | S | low | all |
| 39 | Make the lit-edge the default for all resting cards | Apply `[box-shadow:var(--fw-shadow-card)]` in InstrumentPanel `.panel` base + StandingStrip; audit `border border-border-subtle` resting cards. Expose a single `card` utility so no hand-rolled card opts out. | 2 | M | low | all |
| 40 | Iconography mixes lucide + 19 inline glyphs, scattered stroke widths | Normalize ALL icons to viewBox 24 + strokeWidth 1.5 (the in-house contract); pass `strokeWidth={1.5}` on every lucide use. ast-grep flag lucide without strokeWidth 1.5 in `fairway/**`. | 2 | M | low | all |
| 41 | Apply ease-spring token to all toggles (used once today) | Apply the spring overshoot to checkbox tick draw, radio dot, FilterPill selected glyph (scale 0.6→1 on data-selected), motion-reduce gated. | 2 | S | low | all |
| 42 | Two divergent player-card layouts | Consolidate on one FairwayPlayerCard primitive; lock name to `font-fw-sans text-body-lg font-semibold`, list gap to `gap-4/5` (on-scale). | 3 | M | low | all |
| 43 | Non-responsive grid-cols-2 KPI grids waste desktop width | Give KPI/stat `grid-cols-2` the responsive ramp `md:grid-cols-3 lg:grid-cols-4`. Leave true 2-field form rows pinned. | 2 | S | low | desktop |
| 44 | Tactile spring-press on primary CTA (active:scale-[0.975]) | Define `fwPress` in `_internal.ts`; layer `active:scale-[0.975] [transition-timing-function:var(--fw-ease-spring)] motion-reduce:active:scale-100` on the primary button (on top of the existing 0.5px translate). Mirror across Switch/Checkbox/Segment. | 2 | S | low | all |
| 45 | RoundSubmitOverlay cold-white scrim + legacy red-200 | `bg-white/20`→warm cream scrim `bg-surface/15`; `text-red-200`→`color-mix(danger 55%, white)` so over-par tracks the danger token. | 2 | S | low | all |
| 46 | ::selection raw hex + warm-400 legacy focus-ring | `::selection` → `color-mix(in oklch, var(--fw-color-accent-500) 16%, transparent)`; retire the warm-400 `.focus-ring` utility inside Fairway in favor of fwFocusRing. | 1 | S | low | all |
| 47 | sm controls below 44px touch floor | sm = desktop-secondary only; any sm control that's a primary mobile touch target → bump to md or extend hit area via `before:-inset-1.5`. Document the rule. | 1 | M | low | ios |

---

## Quick wins (first hour — highest impact-to-effort, low risk)

These are all S-effort, low-risk, broadly-applied-via-tokens, and each one is visible across the whole app:

1. **Delete the unused Fraunces + General Sans loads** (rank 1) — remove from `fonts.ts` + `layout.tsx:103`, scrub docstrings. Stops shipping dead font bytes; makes the type system honest. (One caveat: confirm `fraunces`/`playfair`/`dmSans` other-app consumers stay — only drop the two Fairway-specific unused vars.)
2. **Fix the optical-tracking curve** (rank 3) — one line per token in `tailwind.config.ts`: display→-0.03em, add +tracking to footnote/caption/caption-2. The single most visible "engineered by experts" tell.
3. **Warm the skeleton shimmer** (rank 6) — recolor `bg-shimmer` to a warm cream specular + slow/ease the keyframe. Every loading surface in the app instantly reads warm-premium.
4. **Warm the glass speculars** (rank 7) — swap the 3 cold-white consumers (TopBar, ChartTooltip, glass.ts) to the warm `--fw-glass-*` tokens. One temperature everywhere.
5. **Sweep FairwayCoursePicker off legacy primary-\*** (rank 17) — 6 token swaps; closes the last live exception to "greens consolidated."
6. **Drop the no-op font-light on Fragment Mono** (rank 35) — 6 sites; removes dead classes that mislead future authors.
7. **Add the 6-up KPI truncate + compact padding** (rank 12) — `truncate` on the eyebrow label span + `p-4` for the dense grid; fixes the most visibly cramped surface.

Total: well under an hour, zero behavioral risk, and the app looks measurably more handcrafted (warm loading, warm glass, tighter big type, honest fonts) before any structural work begins.

---

## Free tools / skills worth adopting

All free, most already installed — the gap is WIRING, not new dependencies.

- **`tailwindcss-safe-area` (mvllow, MIT)** — `p-safe`/`pb-safe`/`h-screen-safe` emitting `env(safe-area-inset-*)` with the iOS 11-13 `constant()` fallback. Replaces the hand-written calc strings in ~10 files. (rank 30)
- **`tailwindcss-fluid-type` (davidhellmann, MIT)** — `clamp()`-based fluid type so text respects iOS Dynamic Type / browser zoom (WCAG 1.4.4). Convert the fixed-px tokens to rem-anchored clamp.
- **`@capacitor/haptics` (already installed v8)** — `impact`/`selectionChanged`/`notification`; no-ops on non-Taptic devices. Currently called from ZERO Fairway primitives — wire via one `fwHaptic` util. (rank 14)
- **`vaul` (already installed v1.1)** — snapPoints/detents + drag-to-dismiss already handled; the gap is configuring default detents, not the lib. (rank 15)
- **Playwright `toHaveScreenshot()` (already installed)** — visual-regression on the unauthed `/fairway-preview` gallery. Pin determinism: fixed viewport (390px iPhone + 1280 desktop), `emulateMedia({reducedMotion:'reduce'})`, gradient-off via a `?vr=1` query, `maxDiffPixelRatio ~0.01`, baselines committed from CI Linux (not local mac, to avoid font-AA flake). SaaS-free.
- **ast-grep + semgrep (already wired via .coderabbit + Review Gate)** — author token-guard rules: ban raw hex, `bg-white`/`bg-black`, `slate-/zinc-/gray-/emerald-/green-N` and `primary-` inside `fairway/**`, and arbitrary `shadow-[`/`rounded-[`. Converts "already consolidated" into an enforced invariant.
- **`stylelint-declaration-strict-value` (free)** — require `var(--fw-*)` for color/box-shadow/border-radius in `.css`.
- **`@axe-core/playwright` + `eslint-plugin-jsx-a11y` (both installed)** — keep + extend per-route as demo-auth fixtures land.
- **`prettier-plugin-tailwindcss` (MIT)** — canonical class order keeps dense className strings consistent.
- **React 19 `useOptimistic` (built-in)** — instant-mutation "no spinner" feel on dismiss/toggle/log-progress.
- **CSS `linear()` spring generator (Carmen Ansio approach)** — tiny build-time util to mint `--fw-spring-*` tokens from physics params. (rank 24)
- **Lint references / review lenses (NOT auto-generators over the locked tokens):** the community `impeccable`/`design-taste`/`frontend-design` skills are useful as a critique pass, not as generators.
- **`src/app/fairway-preview/page.tsx`** — the live unauthed render-every-primitive gallery is the single most valuable existing asset: A/B every change here (especially the preview-gated, brand-risk ones: inverse-weight headings, mono→sans numerals, canvas-cooling) before shipping.

---

## Implementation status (2026-06-14, this session)

All on branch `fix/picker-premium-redesign` (PR #293, NOT merged). Every change
tsc + eslint clean and screenshot-verified in `/fairway-preview` (desktop +
mobile). Shipped in themed waves:

- **Card elevation + micro-interactions** (pre-audit, commit 62350017): deeper warm 2-layer shadows, a lit warm-white top edge on light cards (`--fw-shadow-card`), and a glide-eased 240ms / 2px hover lift + 110ms tactile press on Surface + MetricCard.
- **Wave A** (51692b83): optical tracking curve (rank 3 — display −0.03em + small-end +tracking), warm skeleton shimmer (rank 6), warm glass speculars (rank 7), drop no-op mono `font-light` (rank 35), CoursePicker off legacy `primary-*` green (rank 17).
- **Wave B** (8bd95059): surface-tier re-spacing so tint/elevated read (rank 28), tactile spring-press on every Button (rank 44).
- **Wave C** (e5859027): `fwHaptic` native haptic layer wired into Segmented + toast tones (rank 14, first wiring).
- **Wave D** (3132dbf4): `PageContainer` (theme 2) + `Eyebrow` (theme 3) systematization primitives, demonstrated in the preview "Foundations" section.
- **Wave E** (c612eac8): MetricCard `density='compact'` + truncating overline; applied to the cramped 6-up KeyMetricsGrid (rank 12/32).

Also earlier this session: brand-green KPI value faces, and 2 native browser
dialogs (confirm + prompt) replaced with Fairway dialogs.

**Queued — needs an eyes-on pass (page-level, can't be headlessly verified on authed routes):** migrate the ~21 page roots onto `PageContainer` (rank 2) and the ~220 inline eyebrows onto `<Eyebrow>` (rank 4); the remaining haptic wiring (Button/Switch/Checkbox/Radio/Tabs — rank 14); sheet detents (rank 15); skeleton consolidation (rank 16); focus-ring unification + halo (rank 18/19); section-rhythm + form-field unification (rank 10/11); icon-stroke normalization (rank 40); warm-* role-token mapping (rank 33 — NOTE the warning-tone warm-800 is a *deliberate* dark-on-amber recipe, keep it).

**Preview-gated / brand-risk (do NOT default-merge — A/B in the gallery):** inverse-weight headings (rank 34), mono→sans default numerals (rank 37), cooling the canvas (rank 31). The team is brand-locked on warm + editorial.

---

## Notes on stale / corrected findings

- **Font finding direction has flipped since the audit was written.** The audit assumed Fraunces/General Sans were INTENDED but mis-bound. Live source (design-tokens.css:208-211: *"Apple system sans — the real built by Steve Jobs type ... NO serif (Fraunces dropped)"*) shows the system has DECIDED on Apple SF Pro. So the correct fix is to DELETE the unused loads + scrub docstrings (rank 1), not rebind the vars. Lower risk, same payoff.
- **The brand-risk findings (inverse-weight headings, mono→sans default numerals, cooling the canvas toward oat) are flagged preview-gated/optional** — the warm cream + editorial register is brand-locked and the team has repeatedly chosen warmer/heavier. Treat as reviewer-gated experiments validated in `/fairway-preview`, never as default merges.
- **Already-shipped this session (correctly NOT re-recommended):** brand-green KPI faces, the lit-edge 2-layer card elevation + 240ms/2px hover + 110ms press, the 2 native-dialog replacements, green consolidation, a11y lint-ratchet to 0, 0 console.*.
