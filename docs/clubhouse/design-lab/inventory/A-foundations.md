# Slice A: Clubhouse design foundations (read-only inventory)

Scope: `src/clubhouse/styles/*.css` (70 files incl. `__tests__`, 105,516 lines; `tokens.css` 1,657, `shell.css` 4,447, `ui.css` 3,040, `controls.css` 2,161), `src/clubhouse/lib/fonts.ts`, `shell/TypeScaleScript.tsx`, `design/refresh/DESIGN_LANGUAGE.md` (DL, 335 lines).
Tier: source inspection only. No browser, no Safari, no device. Nothing below is a rendered observation.
Method: ripgrep/grep over a concatenation of all `styles/*.css` (counts say "all CSS"), `config/clubhouse/css-ratchet.json`, `styles/__tests__/raw-colour-baseline.json`. `npm run clubhouse:css` could not run (no `node_modules`: `postcss` missing), so ratchet numbers are read from the committed JSON (verified as recorded, not re-measured).
Locked owner calls (ivory gradient over linen #e8e3d5, ivory cards #faf7ef, nothing white, green corner mist, one Practice toggle, no Larger Text option, no thick left border, Player Home locked, coach Home = Player Home) are not questioned.

---
## 1. Token inventory

`tokens.css` defines 728 unique `--ch-*` names (verified: `grep -oE '^\s*--ch-...' | sort -u`; 672 at column-0/2-space indentation form used for comparisons). Blocks (verified, tokens.css):

| Block | Lines | Purpose |
|---|---|---|
| `[data-ui='clubhouse']` light root | 10-1100 | ~657 names |
| `html[data-fw-theme='dark'] [data-ui='clubhouse']` | 1101-1410 | ~246 names; 243 overlap with light |
| phone `@media (max-width:820px), (max-height:500px) and (pointer:coarse)` | 1411, 1494, 1508, 1517 | phone type roles, spacing |
| `data-motion='off'` | 1426-1458 | zero durations |
| `html:has([data-ui])` | 1459-1503 | page-level vt vars, html/body paint |
| `prefers-reduced-transparency` | 1532-1549 (+ `:root[data-reduce-transparency]` 1550) | glass becomes `--ch-bg-page` |
| `min-width:414px` | 1563 | 20px page edge |
| `min-resolution` 2dppx / 3dppx | 1570 / 1576 | hairline 0.5px / 0.333px |
| `prefers-contrast: more` | 1582 | stronger borders, opaque glass |
| `max-resolution:1.5dppx` | 1643 | weights 450/560 for 1x screens |

Group sizes by prefix (verified, count of definitions in tokens.css): type 49+17, dur 49, chart 39(+8), on-(green/dark/fill) 38, elevation 36, green 32, page 25, score 22, light 22, feature 20, ledger 18(+10), track 17, ink 17, ivory 16, switch 15, champagne 15, hm 14, bg 14, ease 13, glass 12(+12), danger 12, btn 12, space 11, crh 11, border 11(+8), well 10, warn 10, primary 10, plan 10, ask 10, accent 10, z 9, yr 9, tab 9, stage 9, selected 9, seg 9, ring 9, nav 9, ms 9, board 9, scrim 8, radius 8, text 7, gap 7, separator 6.

### 1.1 Groups

| Group | Tokens (examples, tokens.css line) | Notes |
|---|---|---|
| Colour scale | `--ch-ivory-0..400` (16), `--ch-ink-950..300` (49-57), `--ch-green-*` (32, e.g. green-500 `#1f6b45` line 69, dark `#6db488` line 1207), `--ch-champagne-*`, `--ch-forest-800/900`, `--ch-on-fill-0..100` | Scales are literal hex; ivory-0 equals card (`#faf7ef`). `--ch-on-fill-0` is `#ffffff` (line 27). |
| Semantic colour | `--ch-text-*` (7), `--ch-accent*`, `--ch-chart-*` (gain/loss/flat/line/zero/track/par/gilt), `--ch-score-*` (22), `--ch-danger-*` (12), `--ch-warn-*` (10), `--ch-flag`, `--ch-yr-*` (9, class years), `--ch-plan-group-*`, `--ch-run-group-*` | Doctrine-aligned (gain=green, loss=amber, red=errors). Two parallel naming systems for the same job: `--ch-selected-*` vs `--ch-bg-selected` vs `--ch-sel`; `--ch-card-bg` vs `--ch-bg-surface` vs `--ch-overlay-bg #faf8f2` (a fourth ivory) vs `--ch-ivory-0`. |
| Surfaces | `--ch-workspace`, `--ch-bg-page` (189), `--ch-bg-surface` (194), `--ch-bg-elevated` (196), `--ch-bg-subtle` (201), `--ch-bg-inset`, `--ch-bg-hover`, `--ch-bg-selected` (206), `--ch-card-bg`, `--ch-overlay-bg`, `--ch-sheet-bg` (993), `--ch-feature-bg`, `--ch-well-bg`, `--ch-glass-bg` (680), `--ch-page-paint` (608) | Page paint: `var(--ch-light-canvas), var(--ch-light-paper), var(--ch-workspace)` (608). Used by only 11 declarations in all CSS. |
| Text | `--ch-text-primary/secondary/tertiary/disabled/placeholder/on-accent` (217-224), `--ch-on-green-ink*`, `--ch-feature-ink-2/3` | |
| Borders | `--ch-border-hairline` (241), `-subtle` (243), `-control` (246), `-strong` (247), `-focus` (320), `-focus-on-dark` (322), `--ch-card-ring` (764), `--ch-separator*`, `--ch-hairline-w` (649, 1px; 0.5px at 2dppx line 1572; 0.333px at 3dppx line 1578) | |
| Radii | `--ch-radius-sm 8 / md 12 / lg 16 / xl 20 / full 999px`, plus `xs 4`, `bubble 18`, `tail 6` (628-637) | 8 tokens, DL says five steps + three exceptions. |
| Spacing | `--ch-space-1..12` = 4,8,12,16,20,24,32,40,48 (440-449; note names skip 7, 9, 11), `--ch-gap-*` (7), `--ch-page-x-phone`, `--ch-measure-text 68ch / reading 760 / page 1200 / wide 1360` (451-456), `--ch-sidebar-w 232` (525), `--ch-rail-w 56` (527), `--ch-ms-px-3..22` (825-832, raw-px aliases for Messages) | No 2px or 6px token though 2px (1,339 raw uses) and 6px (935) are heavily used. |
| Elevation / shadow | `--ch-elevation-card` (679), `--ch-elevation-raised` (717), `--ch-scrim`, `--ch-card-shadow`, `--ch-shadow-sm/md/lg`, `--ch-sheet-shadow`, +36 `--ch-elevation-*` variants (board, chip-hover, choice-hover, control, feature, field-hover, floating-focus, framed, glass-card, glass-edge, lifted, mark, plate, reading, row-card-hover, sheet, strip...) | DL says three elevations; tokens ship 36 named elevation tokens plus shadow-sm/md/lg and `crh-*-shadow`. Alias-or-not not checked per token (inferred some are aliases). |
| Opacity | no `--ch-opacity-*`/`--ch-alpha-*` tokens (verified: 0 matches) | 139 `opacity:0`, 111 `opacity:1`, then raw 0.55 (24), 0.5 (19), 0.6 (17), 0.7 (14), 0.4, 0.85, 0.45, 0.38, 0.35... Disabled is `--ch-text-disabled` colour (ink-300) but also raw opacity. |
| z-index | `--ch-z-raised 10, panel 30, sticky 40, dock 50, popover 60, overlay 80, sheet 90, toast 100, skip 110` (1080-1089) | 121 numeric z-index declarations vs 45 token ones (see 2). |
| Motion | `--ch-dur-press 110ms, quick 180, base 260, release 280, marks 360, reveal 520` (1026-1031), `--ch-ease-ios` (1032), `--ch-ease-out` (1033), legacy `--ch-ease-io` (1043), `--ch-ease-typing`, `--ch-dur-*` 49 total incl. msg-time 150, msg-rule 200, msg-pill-out 250, key-out 160, word 320, story-body 420, typing 1200, story 5200, keyboard 480; spring aliases (1057-1064) | Doctrine says "twelve-token vocabulary"; 49 `--ch-dur-*` and 13 `--ch-ease-*` exist. Retiring ones are ratcheted by `motion-gate.test.ts`. |
| Breakpoints | none as tokens (CSS custom properties cannot be used in `@media`); phone/desk split is the literal string `(max-width: 820px), (max-height: 500px) and (pointer: coarse)` repeated 221 times (verified) and `(min-width: 821px) and ((min-height: 501px) or (pointer: fine))` 128 times | JS twin `useChPhone` / `lib/phone-query.ts` (referenced in css-quality.mjs comment). |
| Chart palette | `--ch-chart-gain/-fill/-loss/-loss-fill/-flat/-line/-zero/-track/-par/-gilt/-flag`, `--ch-separator-chart`, `--ch-score-*-fill` (eagle, birdie, under), `--ch-yr-sr/jr/so/fr` | Chart palette is semantic (gain/loss/flat), no categorical series scale beyond class years and practice groups A-F (`--ch-run-group-*`, `--ch-pl-g*`, `--ch-plan-group-b..f` plus `-night`). |
| Type | 9 role tokens (422-434) + 49 numeric steps `--ch-type-11..34` x {plain, -medium, -strong} (356-402) + `--ch-track-*` (~25) + `--ch-lead-*` (tight 1.1, figure 0.9, caption 1.4, label 1.3, serif-m 1.15, detail-eyebrow 22px) + `--ch-fw-400/500/600/700` + `--ch-wdth-display/dense` | `--ch-font-serif` exists and aliases sans (337). |

### 1.2 Light vs dark coverage (verified for counts, inferred for meaning)

- Light root ~657 names, dark root ~246, 243 shared. 414 light names have no dark twin (comm on name lists).
- Most are aliases resolved through a re-pointed primitive (`--ch-text-primary: var(--ch-ink-900)` lives only in light, because the dark block re-points `--ch-ink-900` at 1196). So "light only" is not "missing".
- The real gap: 298 light-block tokens hold a literal hex/rgb; 106 of them have no dark override (list in the data; examples: `--ch-board-bg`, `--ch-danger-ink/hover/press/fill-top/fill-bottom`, `--ch-feature-ink/-2/-3/gain/loss`, `--ch-stage-*`, `--ch-on-green-*`, `--ch-print-*`, `--ch-hero-mint`, `--ch-plan-group-*` (have `-night` siblings, so a second dark mechanism), `--ch-qc-live-*`, `--ch-switch-on`, `--ch-topbar-paper`). Many are intentionally theme-independent (on-green ink, print, stage); the danger family and `--ch-danger-ink` having no dark value is a candidate gap (inferred; not rendered). Dark mode for Increase Contrast is not expressed: the `prefers-contrast: more` block (1582-1642) sets light values (`rgb(28 25 18 / ...)`, `#6b675f`) with no dark counterpart (verified lines 1582-1600; dark twin not found).
- Dark attribute is `data-fw-theme='dark'`, a Fairway-named hook. The rule file says never read non-`--ch-*` custom properties; an attribute is not a property, so no formal violation, but the dark theme depends on a Fairway-owned name (`lib/handoff.ts:53` reads it too). Verified.

### 1.3 Defined but unused / used but undefined (verified by name matching across `src/clubhouse` css/ts/tsx; `var(--ch-x` references)

- Defined in tokens.css and never referenced by `var(--ch-...)` anywhere in `src/clubhouse`: **57 of 672**. Examples: `--ch-ask-card`, `--ch-ask-mine-a/b`, `--ch-bubble-join`, `--ch-coin-ring`, `--ch-control-bg`, `--ch-crh-btn-pri-shadow`, `--ch-crh-card-shadow`, `--ch-dur-busy-min` (named in doctrine; used from JS `CH_BUSY` probably, inferred), `--ch-dur-marks`, `--ch-dur-spring-pop/-send`, `--ch-ease-spring-pop/-send`, `--ch-light-drift*`, `--ch-nav-well-*`, `--ch-on-dark-*` (4), `--ch-page-top-coachhelm`, `--ch-phone-tabbar-bg`, `--ch-reveal-offset/-rise/-step`, `--ch-run-group-b/c`, `--ch-scrollbar-thumb*`, `--ch-skel-sheen`, `--ch-space-12`, `--ch-switch-on`, `--ch-track-caption`, `--ch-type-12-medium`, `--ch-type-20`, `--ch-type-22-strong`, `--ch-type-28`, `--ch-type-34`, `--ch-warn-ring`. Some may be read from JS by string (`getPropertyValue`) so treat as candidates, not dead.
- Used by `var(--ch-x` but not defined at line start in any CSS or quoted in TS: **149 names** (raw list). Most are per-component custom properties set inline in TSX or mid-line (`--ch-cols`, `--ch-hf-o`, `--ch-ox-*`, `--ch-sun-*` set by `lib/light.ts:132`), so noise. Genuinely suspicious (no definition found, or only in a fallback):
  - `--ch-champagne-600` used `stats.css:4943` with fallback `var(--ch-text-tertiary)`; token does not exist (verified).
  - `--ch-bubble-theirs-shadow` used `messages.css:3448` as `filter:` with no fallback; undefined (verified: no other occurrences) so the declaration is dropped.
  - `--ch-on-accent` used `messages.css:4128` with `#fff` fallback; real token is `--ch-text-on-accent` (typo-class drift, verified).
  - `--ch-gain-tint`, `--ch-white-ish`, `--ch-space-0`, `--ch-on-green-glass`, `--ch-pl-ink` (this one is set inline in `coachhelm-plan.css:14` so fine). `--ch-space-0` and bare prefix hits (`--ch-space-`, `--ch-radius-`, `--ch-track-`, `--ch-type-`, `--ch-z-`, `--ch-dur-`) are string-built names (inferred; template usage not inspected).
  - `.ch-cp-sheet` (`coachhelm-plan.css:14`) is an intentional light-locked print island: redefines its own ink/accent/gain palette with literals including `background:#FFFEFB` (a near-white the DL bans) and `--ch-pl-g-on:#FFFFFF`; it sets `color-scheme:light`, so it ignores dark mode by design (verified).

---
## 2. Token compliance (verified counts)

### 2.1 Totals

| Measure | Count | Source |
|---|---|---|
| Hex colour literals, all CSS | 937 (tokens.css holds 401 of these) | grep |
| Hex literals in page stylesheets (ratchet) | 513 | `css-ratchet.json` sum `hex` |
| `rgb(`/`rgba(` calls, all CSS | 1,271 (tokens.css 280) | grep |
| `hsl(` | 0 | grep |
| `color-mix(` | 224 | grep |
| Literals counted by `raw-colour.test.ts` baseline | 1,542 across 33 files | `raw-colour-baseline.json` |
| `box-shadow:` declarations | 2,107; 674 lack `var(--ch-` | grep |
| Raw shadow per ratchet (any layer not a token) | 1,148 across 54 files | `css-ratchet.json` |
| `border-radius:` declarations | 2,115; `50%` 255, `0` 190, `inherit` 36 | grep |
| Raw radius per ratchet | 5 (practice 2, stats 1, messages 1, home 1) | `css-ratchet.json`; matches DL "five left" |
| Raw duration/cubic-bezier per ratchet | 178 (auth-tokens 88, onboard-tokens 80, then 3/3/2/2) | ratchet; `auth-tokens.css`/`onboard-tokens.css` carry them as ceilings |
| `@keyframes` outside motion.css | 48 (auth.css 15, ...) | ratchet |
| `transition:` / `animation:` declarations | 507 / 225 | grep |
| Numeric `z-index` declarations | 121 (value 1: 63, 2: 16, 0: 11, -1: 10, 3: 7, 5: 6, 4: 4+3) vs token `var(--ch-z-*)` ~45 | grep |
| `font-size:` declarations | 330; raw `px` 49 (12px 16, 14px 6, 13px 5, 17px 4+4...) | grep |
| Raw `font:` shorthand with a literal weight | 171 (`font: 600 ...` 47, `700` 39, `500` 33, `400` 28 in one pass; another 22 where the size is not line start) | grep |
| Spacing declarations (padding/margin/gap) | 9,344; containing `var(--ch-space-*)`: 635 (6.8%); containing a raw `Npx`: 6,811 | grep |
| `!important` | 83 | grep |
| `#fff`/`#ffffff` literals | 47 (39+8); `rgb(255 255 255 / a)` highlights ~140 | grep |
| Near-white banned by DL §10 (`#fffefb`, `#fdfcf8`) | `#FFFEFB` 1 + `#fffefb` 1 + `#fdfcf8` 5 | grep |
| Inline `style={{` in TSX (non-test) | 504; with hex/rgb inside the same line: 0; `fontSize:` 3, `borderRadius:` 3, `zIndex:` 4, `transition:` 36 | grep. Inline styles are mostly custom-property setters. |
| `#rrggbb` literals in non-test TS/TSX | 310 in 12 files; `screens/auth/SceneLayers.tsx` 105, `auth/scene-sky.ts` 11, `rounds/card/draw-card.ts` 9, `ui/HelmMark.tsx` 4, `stats/BestCard.tsx` 4 | grep (canvas/SVG art, mostly legitimate) |

### 2.2 Top 15 offending files

Combined view from `css-ratchet.json` (hex, raw-shadow, raw-motion) and `raw-colour-baseline.json` (all colour literals):

| # | File | Colour literals (baseline) | hex (ratchet) | raw-shadow | raw-motion |
|---|---|---|---|---|---|
| 1 | stats.css | 144 | 72 | 103 | - |
| 2 | onboard.css | 135 | 65 | - | - |
| 3 | ui.css | 124 | 58 | - | 0 |
| 4 | home.css | 107 | - | 62 | - |
| 5 | rounds.css | 97 | 33 | 76 | - |
| 6 | classes.css | 96 | 51 | 54 | - |
| 7 | rounds-setup.css | 89 | - | 57 | - |
| 8 | shell.css | 89 | 26 | - | - |
| 9 | calendar.css | 77 | 12 | 83 | - |
| 10 | qualifiers.css | 66 | - | 58 | - |
| 11 | auth.css | 65 | 14 | 21 | 3 |
| 12 | rounds-track.css | - | 33 | 53 | - |
| 13 | coachhelm-plan.css | 45 | 40 | - | - |
| 14 | controls.css | 45 | 17 | - | - |
| 15 | auth-tokens.css / onboard-tokens.css | - | 1 / - | - | 88 / 80 |

("-" = not in the top 8 of that metric; I only extracted the top 8 per metric.)

Highest single shadow offender: `stats.css` 103 raw shadows. Total raw shadow 1,148 vs DL's "three elevations only": the claim holds for tokens, not for pages.

### 2.3 What is enforced (verified)

- `config/stylelint.clubhouse.config.mjs:5-11`: deliberately small stylelint: no duplicate properties/custom props, `property-no-unknown`, `block-no-empty`, `color-no-invalid-hex`, `function-calc-no-unspaced-operator`, `keyframe-declaration-no-important`. It enforces no design token at all.
- `scripts/clubhouse/css-quality.mjs` + `config/clubhouse/css-ratchet.json` (`npm run clubhouse:css`): strict ratchet (can only fall) for `raw-radius` and `raw-shadow`; ceilings for `raw-motion` and `keyframes`; also counts `hex`, `svg-overflow-visible`, `crh-negative-margin`. `needsShadowToken` (css-quality.mjs) exempts inset shadows and any layer whose 3rd number (blur) is 0, so rings, hairlines, insets are free.
- `styles/__tests__/raw-colour.test.ts` with `raw-colour-baseline.json`: literal colours per page stylesheet may only fall (1,542 recorded).
- `legacy-type-roles.test.ts`, `look-feel-pass-css.test.ts` (type steps), `motion-gate.test.ts`, `motion-durations-pinned.test.ts`, `segmented-weight-css.test.ts`, `page-colour.test.ts` (nothing >= #fcfcfc / contrast at darkest light), `depth.test.ts`, `chart-mark-contrast.test.ts`, `scripts/clubhouse/{radius-steps,spacing-scale,type-roles,hairlines,material-inventory,pressed-hover}.mjs` (exist; spacing-scale is a codemod, dry run by default).
- Not enforced anywhere I found: z-index tokens (121 raw), opacity, spacing tokens (only a one-off codemod to the 4pt grid), font-size px outside the 12 steps (pinned by `look-feel-pass-css.test.ts` per doc; I did not read it), min tap target.

---
## 3. Typography forensic

### 3.1 Families and loading (verified `lib/fonts.ts`)

| Face | Loader | Config | Role |
|---|---|---|---|
| Instrument Sans | `next/font/google` | `weight:'variable'`, `axes:['wdth']`, `subsets:['latin']`, `display:'swap'`, var `--ch-font-instrument` (fonts.ts:11-16) | everything |
| JetBrains Mono | `next/font/google` | weight 500 only, `preload:false`, swap | desktop key hints (3 `font-family` uses of `--ch-font-mono`) |
| Norican | `next/font/google` | 400, swap | sidebar "Golfhelm" script wordmark (owner 2026-10-16) |
| "Clubhouse Separator" | `next/font/local` | two OTFs (400 and 700, ~1.4KB each), `unicode-range: U+00B7`, `adjustFontFallback:false`, `fallback: []` | middle dot only; first in `--ch-font-sans` (tokens.css:334) |

- Stack: `--ch-font-sans: var(--ch-font-separator, var(--ch-font-instrument)), var(--ch-font-instrument), ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif` (tokens.css:334).
- Fallback metrics: Instrument Sans uses next/font's default (adjustFontFallback is on by default for Google fonts, so a size-adjusted fallback is generated; inferred from Next behaviour, not inspected in build output). The separator face explicitly turns it off.
- `display:'swap'` on all: text shows in the fallback then reflows; with only the `ui-sans-serif`/system fallback, a size-adjust font is the only guard. No `optional`/`fallback` display tuning. Whether the swap is visible on iPhone Safari was not measured.
- Variable axes: `wdth` axis is loaded, used via `--ch-wdth-display ('wdth' 96)` and `--ch-wdth-dense ('wdth' 88)` (tokens.css:415-416) in 132 `font-variation-settings` declarations (8 name the token, the rest literal `'wdth' 96`, e.g. `auth.css:349`). DL says nothing about the width axis. Weight axis is fully variable (100-700 range), and the 1x-screen block ships non-standard weights 450 and 560 (tokens.css:1645-1652) contradicting DL §6 "Weights are 400, 500, 600 and 700 only".
- Font count loaded on a Clubhouse page: up to 4 families (plus 2 separator files). DL §6 says "Instrument Sans only"; Norican, JetBrains Mono and the separator are undocumented there. hero-tones.css still sets `font: 400 38px/1.05 var(--ch-font-serif)` (a serif name that resolves to sans) and `color:#4f5a52`.
- `font-family:` appears only 27 times in all CSS (`font:` shorthand carries the family through the role tokens).

### 3.2 The nine roles (tokens.css:422-434, phone overrides 1519-1524) — verified

| Role | Desktop | Phone |
|---|---|---|
| large-title | 700 40/46, track -0.02em | 700 34/41 |
| title | 600 22/28, -0.01em | same |
| headline | 600 16/22 | 600 17/22 |
| body | 400 15/22 | 400 17/24 |
| callout | 500 14/20 | 500 15/20 |
| footnote | 500 13/18 | same |
| caption | 500 12/16, +0.01em | same |
| figure-hero | 600 56/1, -0.025em | 600 44/1 |
| figure | 600 15/20 | 600 17/22 |

Observations: body 15 vs callout 14 vs footnote 13 vs caption 12: four sizes within 3px, differentiated mainly by weight (400/500/500/500). Body is the only 400 role; everything else is 500+ ("Secondary text is weight 500 for contrast on ivory"). So there are effectively two weight tiers (400 for prose, 500/600 for the rest) and hierarchy is size + semibold, with colour contributing very little (see 3.6).

### 3.3 Adoption of the roles vs legacy steps (verified)

| Measure | Count |
|---|---|
| `font: var(--ch-type-<role>)` (nine roles) | 834 |
| `font: var(--ch-type-<NN>[-medium|-strong])` (legacy numeric steps) | 2,788 |
| of which plain `--ch-type-NN` | 1,342 |
| `-strong` suffixed uses (600) | 1,064 |
| `-medium` suffixed uses (500) | 382 |
| Raw `font: <weight> <size>` shorthand | 171 |
| Distinct `font-size:` values in all CSS | 46 (incl. `calc(N * var(--ch-type-k))` forms; N in 11,12,13,14,15,16,17,20,22,28,34,38,40,48,56) |
| Raw `px` font sizes | 49 declarations |
| Most-used legacy token | `--ch-type-13` 682, `-14` 251, `-15-strong` 216, `-15` 206, `-14-strong` 196, `-13-strong` 189, `-14-medium` 160 |

So 77% of font shorthands still use the pre-refresh scale; the nine roles are 23%. Legacy by file: `stats.css` 189, `coachhelm-ask-v2.css` 162, `rounds.css` 152, `home.css` 150, `practice.css` 125, `coachhelm-plan.css` 119, `messages.css` 113, `stats-redesign.css` 94. The ratchet only counts down, there is no deadline in the repo. Also `calc(38 * k)` (4), `calc(48 * k)` (2) appear outside the pinned 12-step list (11,12,13,14,15,16,17,20,22,28,30,34; DL says 40+ is free so 38/48: 38 is not free).

Distinct `font-weight:` values (longhand): 600 (149+3 +37 via `var(--ch-fw-600)`), 500 (54+7), 700 (18+5), 400 (13+12), `inherit` 13. Shorthand adds 450/560 under 1.5dppx. So 600 is the dominant weight everywhere (about 45% of longhand declarations and 1,064+ of shorthands).

### 3.4 Letter-spacing and line-height

- Letter-spacing: tokenised per step: `--ch-track-15` used 508 times, `-16` 133, `-11` 108, `-17` 105, `-13` 80, `-20` 78, `-14` 46, `-22` 41; raw `0` 70, `-0.03em` 57, `-0.02em` 54, `-0.01em` 40. Values: track-11 +0.01em, 12-14 0, 15-17 -0.01em, 20-22 -0.02em, 28-34 -0.03em (tokens.css:359-403). The nine-role tokens have their own `--ch-track-large-title/title/caption/figure-hero` (only `-caption` is unused: listed in 1.3). The role tokens are bundled `font:` shorthands, so letter-spacing never travels with the role; every rule needs a second declaration. Inferred: that is why numeric-step track tokens are used 508 times.
- Line-height: `var(--ch-lead-tight)` (1.1) is declared 680 times, `--ch-lead-caption` (1.4) 215, `--ch-lead-label` (1.3) 35, raw `1` 9, `1.4/1.5/1.3` 10, `44px`/`36px` 4. Because `font:` shorthand includes its own line-height (e.g. 13/18), these extra `line-height` declarations are overrides after the shorthand; 680 overrides at 1.1 is 1.1 x 13px = 14.3px, tighter than the role's 18px leading. I did not map which selectors; inferred from the count that this is a pattern for single-line labels, and an risk for wrapped text. Not verified in render.
- Tracking: `text-transform: uppercase` count is 0 (verified), consistent with the DL "no tracked caps".

### 3.5 Tabular figures

- `font-variant-numeric: tabular-nums`: 502 declarations + 1 `lining-nums tabular-nums` + 1 `!important`; `.ch-num` class (base area, ~line 2385-2392 of the concatenated css) forces `tabular-nums` and `font-feature-settings:'tnum' !important` (the only 2 `font-feature-settings`).
- Role tokens do not carry tabular figures: `--ch-type-figure` / `-figure-hero` are used only 20 times; the comment says "Figures are tabular wherever they are drawn" but a `font:` shorthand resets `font-variant-numeric` (the `.ch-num` comment says exactly that, in `!important`). Therefore tabular is opt-in per rule (502 sites) rather than inherited by the figure roles. Where it is missed: any `font: var(--ch-type-NN)` rule showing a number with no accompanying `tabular-nums`. I could not enumerate such rules statically (needs selector-to-content mapping); the number of figure-bearing rules vs 502 is unknown. Never tested (see end).

### 3.6 Text colour on ivory (values from DL generated table, which `clubhouse:check` keeps in sync; I did not recompute ratios)

| Token | Light | on card #faf7ef | on linen #e8e3d5 | Dark | on dark card |
|---|---|---|---|---|---|
| primary | #1c1b18 | 16.09 | 13.43 | #f1ecdf | 12.92 |
| secondary | #3a3833 | 10.94 | 9.13 | #e2dccd | 11.14 |
| tertiary | #46433d | 9.21 | 7.69 | #d0c9b8 | 9.24 |
| ink-500/placeholder | #55524b | 7.28 | 6.08 | #c4bdad | 8.15 |

Secondary to tertiary is a 1.7 ratio step (10.94 vs 9.21), tertiary to placeholder 1.3. Four text tones sit between 16:1 and 7:1; all pass 4.5 by a wide margin, but contrast is not carrying the hierarchy: the tones are nearly one shade of dark. (`--ch-ink-400 #8f8b81` and `-300` exist for disabled only.) This is a deliberate accessibility choice (DL target 4.9) but it removes the "quiet" tier iOS apps use (secondaryLabel is ~60% alpha). In dark, tertiary (9.24) is within 2 points of secondary (11.14).

### 3.7 text-wrap, truncation

- `text-wrap: balance` 56 (+1), `pretty` 109 (+1), `wrap` 2. Nothing sets a global default (`h1-h3 balance`, `p pretty`) that I found; it is per rule (inferred, not exhaustively checked).
- Truncation: `text-overflow: ellipsis` 186; `line-clamp` 84. No shared utility token for the pattern (inferred).

### 3.8 Dynamic Type (`shell/TypeScaleScript.tsx`, `lib/type-scale.ts`) — verified

- Boot script in `<head>`: runs only when path is `/golf/dashboard*` or `/clubhouse-preview*` AND `(pointer: coarse)` matches; creates a span with `font: -apple-system-body`, reads computed px; if `<= 17` (DEFAULT_BODY_PX) it does nothing; else `k = min(23/17, s/17)` (cap 1.3529; DL says XXL 1.36 and tells readers to treat 1.35/1.353 as 1.36: 0.5% drift) and sets `--ch-type-scale` on `<html>` rounded to 3 places.
- Upward only (type-scale.ts: "F-0014, CR-03: phone text is never under 12px"): users who choose a smaller Text Size than default get the default. DL §6 says text "follows iPhone Text Size" without stating this.
- Not followed: it is gated to coarse pointers, so iPad with a trackpad/Mac or a desktop browser never scales; `-apple-system-body` only resolves in WebKit (`if(!e.style.font) return`), so Chrome/Android users get 1.0.
- `--ch-type-k: calc(var(--ch-type-scale, 1) * 1rem / 16)` (tokens.css:343): note `* 1rem/16` also binds the scale to the browser root font size, so a user-increased root font size also scales (inferred).
- Caveats: `max(16px, calc(16*k))` forms (7+1 uses) keep inputs >= 16px (iOS focus zoom guard); sizes under `calc(11*k)` at k<1 are clamped at the 12 step per comment. Only the `font`-shorthand pathways follow k; the 49 raw `px` font-sizes and the `Npx` line-heights (`44px`, `36px`) do not scale (verified by definition).

---
## 4. Surfaces, elevation, lighting

### 4.1 Role map (tokens.css; values light / dark from DL generated table)

| Role | Token | Light | Dark |
|---|---|---|---|
| Page canvas | `--ch-page-paint` over `--ch-workspace` | #e8e3d5 + light + paper tint | #131814 (`--ch-bg-page` #111512, a second dark page: 1.03:1 apart) |
| Card | `--ch-card-bg` = `--ch-bg-surface` | #faf7ef | #212722 |
| Overlay paper | `--ch-overlay-bg` | #faf8f2 (literal, tokens.css near line 40-50) | raised |
| Raised | `--ch-bg-elevated` | #fcfaf5 | #2c322d |
| Recessed tile/well | `--ch-bg-subtle` / `--ch-well-bg` | #f1ede2 / #ddd8ca | #181d19 / #0d110e |
| Selected | `--ch-bg-selected` | #ebe4d2 | #2c322d (same as raised: dark selected is indistinguishable from an elevated surface in token terms) |
| Scrim | `--ch-scrim` | rgb(28 25 18 / .24) | rgb(2 6 4 / .58) |
| Feature | `--ch-feature-bg` | #0b3a25 | #123d29 |
| Glass | `--ch-glass-bg` (680) | `color-mix(in oklab, workspace 78%, transparent)` + `blur(20px) saturate(140%)` | same recipe |

Dark `--ch-bg-selected` equals `--ch-bg-elevated` (#2c322d) and dark `--ch-btn-secondary-bg` equals both: three roles, one colour (verified DL table; DL gives selected-on-page 1.37 in dark, 1.01 in light, so in light the selected row is nearly invisible against the page and relies on the non-colour cue the DL requires).

### 4.2 Elevation and depth

- Card: `0 0 0 1px ring, 0 1px 2px .05, 0 4px 12px -4px .08` light; ring only in dark (1341). Raised: ring + `0 2px 6px .06` + `0 12px 32px -8px .18` light; ring + `0 12px 32px -8px .55` dark (717, 1344).
- Dark cards are separated from the page by a 1.18:1 fill step plus an 8% ring only; no highlight edge. (Light uses shadows, dark rings: two different depth mechanisms.)
- DL claims "no lit inset rim" yet `--ch-light-rim`, `--ch-light-rim-soft` exist (set transparent under Increase Contrast, tokens.css near 1600) and `--ch-well-shadow` / `--ch-seg-on-shadow` use inset highlights `rgb(255 255 255 / .55)` and `0 1px 0 #fff` (the toggle, allowed by DL).
- 2,107 `box-shadow` declarations; 674 are not wholly tokens; 1,148 raw shadow layers are recorded as acceptable debt. Shadow sets in tokens: 36 `--ch-elevation-*` + `shadow-sm/md/lg` etc.

### 4.3 Glass / backdrop-filter

- `backdrop-filter` occurrences: 72 declarations: 44 `var(--ch-glass-filter)`, 28 `none` (resets), 2 messages-scrim variants, plus 38 `-webkit-backdrop-filter` lines (so some declarations are unprefixed-only; Safari has shipped the unprefixed property since 18, fine for iOS 18+, inferred minimum target not checked).
- Reduce Transparency fallback: verified. `@media (prefers-reduced-transparency: reduce)` (9 matches incl. combos) and `:root[data-reduce-transparency]` (JS-set attribute, since Safari does not implement the media query: inferred) set `--ch-glass-bg` to `--ch-bg-page`, `--ch-glass-blur: 0px`. Increase Contrast does the same (1582-1590). Good: one token flip covers 44 sites. The two messages scrim sites use `--ch-scrim-blur-msg`, also zeroed. `backdrop-filter: blur(1px)` appears inside an `@supports`-style guard (1).
- `filter: blur` 4 occurrences; `mix-blend-mode` 1.

### 4.4 Gradients and borders

- `linear-gradient` 237, `radial-gradient` 53, `conic-gradient` 2 (all CSS). DL §10 bans "a gradient behind text inside a card"; the page paint, toggle thumb, feature art and masks explain most of these. I did not classify them (inferred; no check script for it).
- Borders vs shadows: card edge is a box-shadow ring (`--ch-card-ring`, 8% ink, 1.17:1), not a border, so cards do not change size on forced-colors; `forced-colors: active` has 4 blocks (+1 combined with prefers-contrast). Hairline widths: `--ch-hairline-w` 1px / 0.5px at 2dppx / 0.333px at 3dppx; used 1,040 times (verified); 0.333px is below what many displays rasterise (inferred; a Safari/iPhone check was never done here).
- Inner shadows (inset): used by wells, field rings (`--ch-ring-field: inset 0 0 0 var(--ch-hairline-w) var(--ch-border-subtle)`, line 656), exempt from the ratchet.

### 4.5 Whites (DL: "nothing is white")

- `#fff`/`#ffffff` literals 47 + `rgb(255 255 255 / a)` highlights ~140; `--ch-print-paper #ffffff` (tokens.css:~29, print only), `--ch-text-on-accent #ffffff` light (224, text on primary key, fine), `--ch-on-fill-0 #ffffff` (27), `--ch-run-group-on #ffffff`, `--ch-pl-g-on #FFFFFF`, `.ch-cp-sheet background #FFFEFB` (`coachhelm-plan.css:14`, the banned near-white; it is the printable plan sheet, in a light-locked island), `#fdfcf8` x5 (`--ch-attach-glyph` etc.). `page-colour.test.ts` holds the surfaces; 47 white text literals on greens are legitimate, but nothing in tooling distinguishes text-white from surface-white in page CSS (inferred).

---
## 5. Geometry and spacing

### 5.1 Spacing
- Scale tokens: 4,8,12,16,20,24,32,40,48 (`--ch-space-1..12`; names skip 7, 9, 11). DL and `spacing-scale.mjs` use the 4pt grid with steps 2,4,6,8,12,16,20,24,32,40,48.
- Real usage of px in all CSS (any property): `8px` 2,178, `12px` 1,816, `16px` 1,791, `2px` 1,339, `4px` 1,262, `6px` 935, `1px` 844, `44px` 587, `24px` 458, `20px` 439, `32px` 409, `3px` 205, `40px` 191, `36px` 187, `28px` 167, `22px` 164, `14px` 151, `48px` 145, `52px` 142, `56px` 134, `64px` 132. (820/821/500/501 are media-query numbers.) Off-grid values still in volume: 3px (205), 22px (164), 28px (167), 14px (151), 36px (187).
- Spacing declarations: 9,344; only 635 reference a space token (6.8%). The token is aspirational; the scale is enforced by a one-off codemod, not a gate (I found no test counting off-scale spacing; `clubhouse:check` may, not read).
- DL rhythm claims (24pt between cards, 16/20pt card padding, 52/64 rows, 44 targets): `44px` appears 587 times and `min-height|min-width: 44px` 248 times (verified). Gap tokens: `--ch-gap-section 32`, `-phone 32`, `-phone-snug 24`, `-phone-tight 16`, `-group 12`, `--ch-gap-grid 16` (506-524): the section gap is 32 while DL §2 law 6 states 24pt between cards. Both exist; which one is a "card gap" vs a "section gap" is unstated (inferred drift).
- Page edge: `--ch-page-x-phone: var(--ch-space-4)` 16px, 20px at >= 414px (tokens.css:512, 1563) as DL says (verified).

### 5.2 Radii
- Tokens 8/12/16/20/full + xs 4, bubble 18, tail 6.
- Usage (2,115 declarations): `--ch-radius-lg` 417, `-sm` 362, `-md` 351, `-full` 314, `50%` 255, `0` 190, `-xl` 103, `inherit` 36, `-xs` 16, and compound `xl xl 0 0` 12, `0 0 lg lg` 8. 5 raw radii remain (ratchet). Radii are essentially clean: the best-enforced foundation.
- Nested radius (inner = outer - padding): not auditable statically. Cards are 16 with 16-20 padding (Surface), so an inner tile with `--ch-radius-md` 12 at 16 inset would be 12 where the ideal is max(16-16,…)=small, but the DL (§4) fixes tile radius 12 inside a 16 card regardless of inset. Rule: concentric rounding is not in the language at all (verified: no mention in DL; `radius-steps.mjs` checks step membership, not nesting). Inferred issue; not rendered.
- `border-radius: 50%` (255) alongside `--ch-radius-full` (314): two ways to make a circle/pill; DL §10 bans raw `999px`, not `50%`.

### 5.3 Containers, grid, breakpoints
- Containers: `--ch-measure-text 68ch`, `-reading 760px`, `-page 1200px`, `-wide 1360px`; sidebar 232, rail 56.
- Breakpoints: the canonical split is 820/821 (phone vs desk). Distinct `min-width`/`max-width` px values in `@media`: **82** distinct "(min|max)-width: Npx" clauses and **~75 distinct numeric widths** (29.98, 58, 60, 95.98, 97.98, 179.98, 260, 280, 290, 300, 340, 345, 350, 359, 360, 372, 380, 388, 389, 399, 400, 414, 420, 440, 480, 500, 520, 559, 560, 599, 600, 620, 632, 640, 641, 644, 660, 668, 719, 720, 721, 724, 760, 767, 780, 800, 820, 821, 844, 860, 861, 880, 900, 901, 940, 960, 980, 1000, 1023, 1024, 1060, 1080, 1100, 1101, 1116, 1120, 1179, 1180, 1181, 1192, 1193, 1200, 1280, 1400, 1680). Counts: `max-width:820px` 230, `min-width:821px` 145, `640` 31/34, `900` 20/21, `860` 11, `1180` 11, `1024` 11, `414` 8. Plus 1,089 `@media` blocks in total: `(hover: hover)` 512, phone query 221, desk query 128, `prefers-reduced-motion` 65, `print` 13.
  The odd values (29.98, 95.98, 97.98, 179.98 are container-ish/measure queries; 1192/1193 and 1116 are lane-specific narrow-desktop rules per DL "Team, Read, Lenses go full at 1180, Ask at 1280") show that every page chooses its own width. DL names exactly 820 plus per-lane notes. Verified counts, interpretation inferred.
- Container queries: not counted (not searched); `@container` usage not inventoried.

---
## 6. Interaction foundations (verified counts, all CSS)

| Area | Finding |
|---|---|
| Focus | `:focus-visible` 426 rules, `:focus` 488 (the latter includes `:focus-within`, `:focus-visible`... substring match so inflated); global `.ch-root :focus-visible { outline:2px solid var(--ch-border-focus); outline-offset:2px }` (`base.css:123-125`). `outline: 2px solid var(--ch-border-focus)` 216, `...on-dark` 29, `--ch-ring-own` 8, dashed ink-500 1.5px 3. `outline:none`/`0`: 67 (49 + 18) places remove the outline; each should be backed by a box-shadow ring (e.g. `--ch-ring-field-focus` 0 0 0 1px + 4px halo, line 657) but I did not verify each. Focus colour: green-500 #1f6b45 (6.04:1 on card, 5.04 on linen); dark #6db488; 2px, halo token `--ch-focus-halo` (0.13 light/0.2 dark). |
| Cursor | `cursor:pointer` 400, `default` 67, `progress` 9, `not-allowed` 9, `grab/grabbing` 7/7, `text` 6, `ew-resize` 2, `crosshair` 2. Pointer cursor is set per-rule, not by a global `button, [role=button]` rule (inferred; not exhaustively checked). |
| touch-action | `manipulation` 61, `none` 22, `pan-y` 17 (+1 `pan-y pinch-zoom`). 61 manipulation sites vs 397 pointer-cursor sites suggests tap-delay removal is not blanket (inferred; modern iOS removes the 300ms with width=device-width viewport, so likely benign). |
| `-webkit-tap-highlight-color` | `transparent` 26 sites (per rule, not global); iOS default grey flash can appear on any other tappable element (inferred). |
| user-select | `none` 43; `-webkit-touch-callout:none` 11. |
| Selection colour | `base.css:119-122`: `.ch-root ::selection { background: var(--ch-green-100); color: var(--ch-ink-900) }`. Only one place; no dark variant needed since `--ch-green-100` is re-pointed in dark (line `--ch-selected-pill-bg: var(--ch-green-100)` in dark block shows it is redefined; not value-checked). |
| `accent-color` | 3; `color-scheme` 2 (one is the print sheet's `light`, one `dark` at the dark block). Native controls follow `color-scheme` only in two places. |
| Scrollbar | 60 `scrollbar-*`/`::-webkit-scrollbar` uses; scrollbar tokens `--ch-scrollbar-thumb*` are defined but unused (1.3). |
| Tap target | `min-(height|width): 44px` 248 uses. |
| Hover | `@media (hover: hover)` 512 wrappers; good touch hygiene (hover never sticks). |

---
## 7. DESIGN_LANGUAGE.md vs shipped tokens: drift list

| # | DL claim (line) | Shipped reality | Verdict |
|---|---|---|---|
| 1 | "Tertiary ... it and the placeholder share `--ch-ink-500` (S1.7)" (DL:41) | `--ch-text-tertiary: var(--ch-ink-600)` (tokens.css:219), `--ch-text-placeholder: var(--ch-ink-500)` (223); DL's own generated table shows tertiary `#46433d` and ink-500 `#55524b` | Prose is stale; verified |
| 2 | Large title: law 2 says "30px large title" for desk (DL:26) vs law 1 "40px desk title" (DL:25) and the type table 40/46 (DL:159) | tokens.css:422 is 40/46 | DL internal contradiction; code = 40 |
| 3 | §5.2 and §8: large title "never scales" (DL:218) vs §8 "Title scales to 86% and fades" (DL:255) | not checked in `shell/large-title.tsx` | DL internal contradiction |
| 4 | Motion §8: push 462ms with "`--ch-ease-spring-smooth` (the `linear()` spring)" (DL:252) and "tokens.css 1094-1108 override block" (DL:259) | `.claude/rules/clubhouse.md`: linear() springs are gone, push is 520 on the iOS curve; `--ch-ease-spring-smooth: var(--ch-ease-ios)` (tokens.css:1057); reduced-motion zeroing block is at 1426-1458, not 1094-1108 | stale prose; verified line numbers |
| 5 | "Instrument Sans only" (DL:228) | + Norican wordmark, + JetBrains Mono, + separator OTF (fonts.ts) | undocumented faces; verified |
| 6 | "Weights are 400, 500, 600 and 700 only" (DL:228) | 450 and 560 defined for `max-resolution:1.5dppx` (tokens.css:1645-1652) | verified contradiction (maybe intentional) |
| 7 | Nine roles replace numeric steps; steps only fall (DL:230) | 2,788 numeric-step `font:` uses vs 834 role uses; 49 raw `px` sizes; 46 distinct font-size values vs the 12 pinned steps | adoption 23%; verified |
| 8 | "Three elevations and no others" (DL:27,190) | 36 `--ch-elevation-*` tokens, `--ch-shadow-sm/md/lg`, `--ch-card-shadow`, 1,148 raw shadow layers | verified; DL says "Every other token is an alias of one of them, or none": not verified per token |
| 9 | "Five radii" (DL:192) | 8 radius tokens (xs, bubble, tail documented as exceptions); `50%` used 255 times | documented; 50% undocumented |
| 10 | "A drop shadow written in a page stylesheet instead of a token is counted ... may only fall" (DL:190) | true, but 1,148 remain | true; scale of debt undocumented |
| 11 | XXL = 1.36 (DL:332) | 23/17 = 1.3529 (type-scale.ts:6) | 0.5% drift; DL notes it |
| 12 | "Text Size ... follows iPhone Text Size" (DL:169,228) | only upward from default; gated to coarse pointers on `/golf/dashboard*` and `/clubhouse-preview*`; WebKit only | undocumented limits |
| 13 | "Colours come from tokens only" (DL:43) | 513 hex + 1,271 rgb functions in all CSS; baseline of 1,542 literals in 33 page files | ratcheted, not met |
| 14 | "24pt between cards" (DL:34) | `--ch-gap-section: 32` and `-phone: 32`, `-snug: 24` (tokens.css:507-523) | tokens carry both; rule unclear |
| 15 | "Nothing is white ... none lighter than #fcfaf5" (DL:26) | `--ch-on-fill-0 #ffffff`, `--ch-print-paper #fff`, `.ch-cp-sheet #FFFEFB` | exempt islands (print, ink-on-green); not marked in DL |
| 16 | Reduce Transparency solid page (DL:188) | verified (tokens.css:1532-1561) | match |
| 17 | Breakpoint: phone to 820 (DL:331) | 820/821 canonical; 75 other widths in use | match for the core, wide variance around it |
| 18 | Hairline | DL says hairlines "inset 16"; tokens add 0.5/0.333px device hairlines that DL does not mention | undocumented |
| 19 | Page paint used by every page, pushed screen, copy (DL:26) | only 11 `var(--ch-page-paint)` references in CSS | consistent if centralised; not traced |
| 20 | DL §3 mist "at most 240px" | `desk-green-corner.test.ts` exists | not re-verified |

The generated tables (DL:54-170) match tokens.css by construction (check script); the drift is in the prose around them and in the sections not generated (§5-§9).

---
## 8. Foundation weaknesses, ranked by impact

1. **Type system is two systems.** 2,788 numeric-step `font:` uses vs 834 role uses; 46 distinct font-size values; 49 raw px sizes; 171 raw `font:` shorthands with literal weights (`tokens.css:356-402` vs `:422-434`; counts above). The nine-role claim in DL/MOTION-AND-VISUAL is aspirational; the ratchet allows no growth but has no deadline. Impact: every screen's hierarchy is decided per rule.
2. **Roles do not carry tracking, tabular figures or leading.** Role tokens are `font:` shorthands (tokens.css:422-434); `--ch-track-*` and `--ch-lead-*` and `tabular-nums` (502 sites) are applied by hand. 680 `line-height: var(--ch-lead-tight)` overrides after shorthands, `--ch-track-15` 508 times. Easy to drift, impossible to lint without a role-aware rule.
3. **Hierarchy is size plus semibold, contrast is flat.** Text tones step 16.09 / 10.94 / 9.21 / 7.28 (DL table); 600 weight is the dominant weight (about 45% longhand, 1,064 `-strong` shorthands); only body is 400; four sizes within 12-15px. No genuinely quiet tier.
4. **Shadow/elevation system is a claim, not a state.** DL "three elevations" vs 36 `--ch-elevation-*` tokens, 2,107 `box-shadow` declarations, 1,148 raw layers (css-ratchet.json). Biggest: stats.css 103, calendar.css 83, rounds.css 76, home.css 62.
5. **Colour literal debt.** 513 page-sheet hex, 1,542 literals baseline, 1,271 `rgb(`; `stats.css` 144, `onboard.css` 135, `ui.css` 124 (the shared UI sheet itself carries 58 hex). Dark-mode correctness depends on each of those being theme-safe: 106 literal tokens in the light block have no dark twin and `.ch-cp-sheet` is hard-locked light.
6. **Spacing is not tokenised.** 635 of 9,344 spacing declarations use `--ch-space-*`; 6,811 raw px; off-grid 3/14/22/28/36px still heavy; no 2px/6px tokens despite 1,339 and 935 uses; `--ch-space-*` skips 7, 9, 11. Gap between cards is 24 in DL, 32 in `--ch-gap-section`.
7. **Breakpoints are unmanaged.** ~75 distinct widths over 1,089 `@media` blocks; the 820/821 phone/desk strings are pasted 349 times with a landscape clause; no custom-media or build-time constant (inferred: PostCSS `custom-media` not seen). One change to the phone definition touches 349+ sites.
8. **Token hygiene.** 57 defined-unused tokens, ~149 var() names undefined (noise-heavy; at least `--ch-bubble-theirs-shadow` at `messages.css:3448`, `--ch-champagne-600` at `stats.css:4943`, `--ch-on-accent` at `messages.css:4128`, `--ch-gain-tint`, `--ch-white-ish` are real defects), and duplicates: `--ch-card-bg`/`--ch-bg-surface`/`--ch-overlay-bg`(#faf8f2)/`--ch-ivory-0`; `--ch-selected-*`/`--ch-bg-selected`/`--ch-sel`; page `--ch-bg-page` vs `--ch-workspace` differ in dark (#111512 vs #131814).
9. **Dark mode is a second, thinner system.** Cards separated by ring plus a 1.18:1 fill step; dark `--ch-bg-selected` = `--ch-bg-elevated` = `--ch-btn-secondary-bg` (#2c322d); dark card has no shadow layers (tokens.css:1341); dark theme gated on the Fairway-named `data-fw-theme`; Increase Contrast block has no dark counterpart (tokens.css:1582-1642).
10. **Motion token sprawl.** 49 `--ch-dur-*` and 13 `--ch-ease-*` vs the "twelve-token vocabulary"; 178 raw durations in `auth-tokens.css`/`onboard-tokens.css`; 48 keyframes outside motion.css (ceilings only).
11. **z-index is mostly raw.** 121 numeric declarations (63 are `1`), only about 45 use the `--ch-z-*` ladder; no ratchet.
12. **Fonts: four faces, swap with no verified fallback metrics.** `display:'swap'` everywhere (fonts.ts), separator face disables fallback adjust (fonts.ts:48), width axis used in 132 declarations but absent from DL; weights 450/560 off-doctrine; hero-tones.css still sets `font: 400 38px ... var(--ch-font-serif)` on a serif name.
13. **Dynamic Type is upward-only and coarse-only.** `lib/type-scale.ts:9-24`, `TypeScaleScript.tsx`: a smaller Text Size or desktop zoom is never followed; raw px text (49) and px line-heights (44px/36px) never scale; `rem` is tied to root size via `--ch-type-k`.
14. **Focus is left to per-rule discipline.** 67 `outline:none/0` sites and 426 `:focus-visible` rules around a single global rule (`base.css:123`); tap highlight cleared on 26 rules not globally; `cursor:pointer` per rule (400).
15. **Opacity unmanaged.** No opacity tokens; raw 0.35 to 0.85 in at least 10 flavours (0.55 x24, 0.5 x19, 0.6 x17, 0.7 x14, 0.4, 0.85, 0.45, 0.38, 0.35); disabled is both a colour token and opacity.
16. **Nested radius and concentric corners not part of the language.** Tile 12 in card 16 regardless of padding; `50%` (255) vs `--ch-radius-full` (314).
17. **DL prose drift (items 1-6 in section 7).** Two internal contradictions (title 30 vs 40; "never scales" vs "scales to 86%"), a wrong override-block line reference, stale spring language. Anyone building from the prose rather than the tokens gets the wrong thing.
18. **Hairline 0.333px at 3dppx** (tokens.css:1576-1578) may rasterise inconsistently; never tested on device.

## 9. Never tested (not examined by this inventory, nobody has shown evidence in these files)

- Any rendered output: no WebKit, Safari, Simulator or iPhone measurement. All "looks" claims, contrast of tertiary on the real light at its darkest, glass on device, the 0.333px hairline, font swap reflow (CLS), wdth axis rendering.
- Whether `next/font` generates a size-adjusted fallback for Instrument Sans in the production build (default true; not read from build output) and the visible swap on first paint.
- Which tabular-number sites are missing `tabular-nums` (needs selector-to-DOM mapping).
- Concentric radius correctness in rendered cards, tiles inside tiles.
- The 106 literal-colour tokens with no dark twin and the 298 literals: dark-mode contrast in render; Increase Contrast in dark; forced-colors rendering of ring-only card edges.
- Whether every `outline:none` (67) has a replacement focus ring (keyboard walk).
- Text Size at XXL x every page: overflow of the px line-heights and the px font-sizes; Text Size below default; iPad / external-keyboard behaviour (coarse-pointer gate).
- `@container` usage, `print` CSS (13 print blocks), RTL, Dynamic Island / safe-area tokens (not in scope of this slice).
- Whether unused tokens (57) are read from JS by `getPropertyValue`.
- The 349 repeated phone/desk media strings against `lib/phone-query.ts` for exact parity.
- `npm run clubhouse:css`, `clubhouse:check`, and the unit tests were not run (no `node_modules` in this checkout); every ratchet figure is read from committed JSON.
- Gradient classification (237 linear, 53 radial) against the "no gradient behind text" ban.
