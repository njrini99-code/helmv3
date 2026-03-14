# GolfHelm UI/UX Consistency Audit Report

**Date:** 2026-03-14
**Scope:** Auth, Onboarding, Coach Dashboard, Player Dashboard, Design Tokens

---

## Executive Summary

**Overall Grade: B-**

The core design system (brand colors, glassmorphism, warm palette) is well-defined and mostly followed. However, significant drift exists between pages built at different times — the login page predates the responsive pattern, the join flow looks like a different app, and 4+ competing page header implementations create visual inconsistency. The biggest systemic issue is **4,124 `slate-` (cool gray) usages mixed with 9,521 `warm-` usages** — 30% of grays are off-brand.

### Issue Counts by Severity

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 Critical | 11 | Broken on mobile, blank page flashes, visual inconsistency |
| 🟠 High | 58 | Noticeable inconsistency, off-brand colors, missing patterns |
| 🟡 Medium | 45+ | Minor polish, spacing variance, dead code |
| 🟢 Good | 30+ | Correctly implemented, no action needed |

### Top 10 Systemic Issues

1. **Slate/Warm Gray Mixing** — 4,124 `slate-*` usages in a warm-branded app (Design Tokens)
2. **4+ Page Header Implementations** — MobileNavHeader, golf-mobile-page-header CSS, raw markup, no header (Coach + Player)
3. **Glass Opacity Sprawl** — 17 unique `bg-white/` opacity values instead of 3 defined tiers (Design Tokens)
4. **Join Flow Design Mismatch** — No glassmorphism, no animations, raw HTML elements (Onboarding)
5. **Login Page Not Mobile-Responsive** — Only auth page missing responsive adjustments (Auth)
6. **4 Different Glass Card Systems** — PremiumGlassCard, glass-standard, Card variant="glass", inline glass (Player)
7. **Button Radius Inconsistency** — `rounded-[10px]` vs `rounded-xl` vs `rounded-lg` across auth + dashboards (All)
8. **Container Max-Width Divergence** — 6 different max-widths with no clear rules (Coach + Player)
9. **H1 Weight Mismatch** — `font-bold` vs `font-semibold` across pages (Coach + Player)
10. **Empty State Pattern Divergence** — Icon shape, bg, title weight/size all vary (Player)

---

## Section 1: Auth / Sign-In Pages

### 🔴 Critical

| # | Issue | File | Line | Current | Fix |
|---|-------|------|------|---------|-----|
| 1 | Button radius mismatch | `golf-sign-in-form.tsx` vs `forgot-password/page.tsx` | 169, 256 | `rounded-[10px]` vs `rounded-xl` | Standardize to `rounded-xl` |
| 2 | Input height mismatch in same form | `golf-sign-in-form.tsx` | 114, 149 | Email `<input>` py-3 vs Password `<Input>` py-2.5 | Both use `<Input>` component |
| 3 | Login page not mobile-responsive | `login/page.tsx` | multiple | No responsive size variants | Add `text-lg sm:text-xl`, `p-6 sm:p-8`, `rounded-2xl sm:rounded-3xl` |

### 🟠 High

| # | Issue | File | Fix |
|---|-------|------|-----|
| 4 | Off-brand `teal-400` in orbs | `forgot-password/page.tsx:65`, `reset-password/page.tsx:78` | Change to `primary-400` |
| 5 | Off-brand `emerald-*` in password strength | `password-strength-indicator.tsx:56-113` | Change all `emerald-*` to `primary-*` |
| 6 | H1/H2/subtitle sizes inconsistent | `login/page.tsx` vs others | Match `text-lg sm:text-xl` / `text-xl sm:text-2xl` / `text-sm sm:text-base` |
| 7 | Button font-weight mixed | login/signup `font-medium` vs forgot/reset `font-semibold` | Standardize `font-semibold` |
| 8 | Button shadow mixed | login `shadow-sm` vs forgot `shadow-lg shadow-primary-600/25` | Standardize `shadow-lg shadow-primary-600/25` |
| 9 | All `loading.tsx` use `min-h-screen` | 4 files | Change to `min-h-dvh` |
| 10 | All `error.tsx` use `min-h-screen` | 4 files | Change to `min-h-dvh` |
| 11 | Submit buttons missing `focus-visible:ring` | `golf-sign-in-form.tsx:169`, `golf-sign-up-form.tsx:316` | Add `focus-visible:ring-2 focus-visible:ring-primary-500` |
| 12 | `<button>` nested inside `<Link>` | `forgot-password/page.tsx:194-209` | Use `<Link>` styled as button |

---

## Section 2: Onboarding

### 🔴 Critical

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | `min-h-screen` on all join pages (7 files) | `join/page.tsx`, `join/[code]/*.tsx`, all error.tsx | Change to `min-h-dvh` |
| 2 | Join flow has NO glassmorphism | `join/page.tsx`, `join/[code]/*.tsx` | Add `bg-auth-golf`, `auth-glass-card`, framer-motion animations |

### 🟠 High

| # | Issue | Files | Fix |
|---|-------|-------|-----|
| 3 | Join uses raw `<button>`/`<input>` | 3 join files | Use `<Button>`, `<Input>` components |
| 4 | Join card `rounded-2xl` vs onboarding `rounded-3xl` | join pages | Match `rounded-3xl` |
| 5 | No safe area insets on join/error pages | join + error pages | Add `env(safe-area-inset-bottom)` |
| 6 | StepIndicator duplicated between coach/player | `coach/page.tsx:67-119`, `player/page.tsx:65-118` | Extract shared component |
| 7 | Dead `onboarding-*` color tokens | `tailwind.config.ts:118-132` | Remove (never referenced) |
| 8 | Join flow has no logo or animations | join pages | Add GolfHelm logo + framer-motion |

---

## Section 3: Coach Dashboard

### 🔴 Critical

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | H1 weight mismatch: `font-bold` vs `font-semibold` | `CoachDashboard.tsx:328`, `alerts/page.tsx:238`, `stats-client.tsx:949` | Standardize `font-semibold` |
| 2 | 4 competing page header patterns | Multiple files | Standardize on `MobileNavHeader` or `golf-mobile-page-header` |
| 3 | Alerts loading returns `null` (blank flash) | `alerts/page.tsx:210` | Return skeleton loader |

### 🟠 High (28 issues)

Key items:
- Calendar duplicates background gradient inline (remove it)
- 5 files use raw glass Tailwind instead of `glass-standard` class
- 7 header background/styling inconsistencies
- 5 files use raw `toggleMobile` instead of `<MobileMenuButton />`
- 4 files use `backdrop-blur-xl` (24px) instead of `backdrop-blur-glass` (16px)
- 7 files have `console.error` outside error boundaries
- Settings sidebar active state won't match sub-pages
- 4 different stat card implementations

---

## Section 4: Player Dashboard

### 🔴 Critical

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | My Dev + Settings headers use `backdrop-blur-sm` (4px) | `my-development/page.tsx:102`, `settings/page.tsx:254` | Use `golf-mobile-page-header` (`backdrop-blur-xl`) |
| 2 | 6+ page header implementations | Multiple | Standardize on `MobileNavHeader` |

### 🟠 High

| # | Issue | Fix |
|---|-------|-----|
| 3 | Container max-width: Hub `3xl` vs Dashboard `7xl` vs Rounds `5xl` | Establish width rules by page type |
| 4 | Empty state divergence: icon shape, bg, title weight all vary | Standardize pattern |
| 5 | Button inconsistency: `rounded-xl` vs `rounded-lg`, varying padding | Use `<Button>` component everywhere |
| 6 | PlayerDashboard H1 undersized: `text-lg` vs `text-xl` everywhere else | Match `text-xl md:text-2xl font-semibold` |
| 7 | 4 different glass card implementations | Consolidate to `glass-standard` + `PremiumGlassCard` |
| 8 | Player Hub not in sidebar nav | Add to `playerNavItems` |
| 9 | `alert()` in production code | `classes/page.tsx:193,229` → use `useToast()` |

---

## Section 5: Design Tokens

### 🔴 Critical

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 1 | **4,124 `slate-*` usages** mixed with 9,521 `warm-*` | 30% of grays are cool-toned in a warm brand | Migrate all `slate-*` to `warm-*` equivalents |

### 🟠 High

| # | Issue | Fix |
|---|-------|-----|
| 2 | 17 unique `bg-white/` opacity values (should be 3) | Standardize to `bg-white/55` (subtle), `bg-white/70` (standard), `bg-white/80` (prominent) |
| 3 | Off-brand greens: `#169B45`, `#1B7D2F`, `rgba(16,185,129,*)` | Replace all with `#16A34A` variants |
| 4 | `rounded` = 4px while `rounded-sm` = 8px (inverted) | Fix in tailwind.config.ts |
| 5 | 3 parallel shadow systems (tailwind, tokens.css, globals.css) | Consolidate to tailwind config only |
| 6 | Custom glass blur tokens barely used (22 times) vs generic (412 times) | Migrate to `backdrop-blur-glass-*` tokens |
| 7 | `font-normal` only 39 uses — everything is medium/semibold | Add `font-normal` to body text for hierarchy |
| 8 | 56 unique text-color classes | Reduce to 8-12 |

---

## Prioritized Fix Plan

### Sprint 1 — Critical + High (Ship Quality)

1. **Standardize page headers** — Create `PageHeader` component wrapping `golf-mobile-page-header`, use everywhere
2. **Fix login page responsiveness** — Add all missing responsive variants
3. **Redesign join flow** — Add glassmorphism, animations, design system components
4. **Fix `min-h-screen` → `min-h-dvh`** — All loading.tsx, error.tsx, join pages
5. **Fix input height mismatch** — Sign-in form both fields use `<Input>`
6. **Standardize button radius** — Pick `rounded-xl` globally for primary buttons
7. **Fix H1 weight** — `font-semibold` everywhere, not `font-bold`
8. **Fix off-brand colors** — `teal-400` → `primary-400`, `emerald-*` → `primary-*`

### Sprint 2 — Consistency (Polish)

9. **Start slate → warm migration** — Begin with highest-traffic pages
10. **Consolidate glass cards** — `glass-standard` for most, `PremiumGlassCard` for featured
11. **Standardize empty states** — Same icon shape, bg, title pattern
12. **Consolidate stat cards** — 4 → 2 implementations
13. **Standardize glass opacities** — 17 → 3 values
14. **Remove dead onboarding tokens** from tailwind.config.ts
15. **Fix container max-widths** — Rules: forms=`2xl`, lists=`4xl`, dashboards=`7xl`

### Backlog — Low Priority

16. Remove 3 parallel shadow systems
17. Add breadcrumbs to deep pages
18. Fix `rounded` base value inversion
19. Add `font-normal` to body text
20. Extract shared StepIndicator component
21. Replace `alert()` with `useToast()` in classes page
22. Add Player Hub to sidebar nav
