# UI Improvements Implementation — Cursor Prompt

Read `docs/25_UI_IMPROVEMENTS.md` for the complete list. This prompt guides you through implementation.

---

## CRITICAL CONTEXT

### What's Already Done
- ✅ Dashboard gradient (`bg-dashboard-gradient`) — cream → amber → green, in globals.css
- ✅ Three-tier glass CSS classes — `glass-subtle`, `glass-standard`, `glass-prominent` in globals.css
- ✅ Baseball dashboard glassmorphism — all cards use `glass-standard` with shine effects
- ✅ Micro-interactions foundation — buttons, toasts, validated inputs, skeletons
- ✅ Motion tokens — `duration-fast`, `duration-base`, `ease-out` in tailwind.config.ts

### What's Broken
- ❌ Golf dashboards use plain `bg-white` — blocking the beautiful gradient
- ❌ Shine effects are copy-pasted inline, not componentized
- ❌ Login pages are plain white cards
- ❌ Onboarding cards have minimal hover feedback
- ❌ CinematicIntro has no skip button (11 seconds unskippable)

---

## IMPLEMENTATION ORDER

Complete these in order. Each builds on the previous.

---

## PHASE 1: Golf Glassmorphism Parity (P0)

**Source of truth:** `src/app/baseball/(dashboard)/dashboard/page.tsx`

**Target files:**
- `src/app/golf/(dashboard)/dashboard/page.tsx` ← START HERE
- All files in `src/app/golf/(dashboard)/dashboard/*/page.tsx`

### Pattern to Apply

**Find this (Golf currently):**
```tsx
className="bg-white rounded-2xl border border-slate-200/60 ..."
```

**Replace with:**
```tsx
className="relative glass-standard rounded-2xl overflow-hidden ..."
```

**Add shine effect inside each glass container:**
```tsx
<div className="relative glass-standard rounded-2xl overflow-hidden">
  {/* Shine effect - REQUIRED */}
  <div
    className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
    style={{
      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
    }}
  />
  {/* Rest of content */}
</div>
```

### Specific Components to Update in Golf Dashboard

1. **MetricCard** — Replace `bg-white` with `glass-standard`, add shine
2. **QuickActionCard** (default variant) — Replace `bg-white border` with `glass-standard`
3. **Section containers** (Recent Rounds, Top Performers, Activity Feed) — Add glass + shine
4. **RoundRow wrapper div** — Add glass + shine

### Do NOT Apply Glass To:
- Data table rows (keep hover states only)
- Input fields
- The dark "primary" variant of QuickActionCard (keep `bg-slate-900`)

---

## PHASE 2: ShineEffect Component (P0)

**Create:** `src/components/ui/shine-effect.tsx`

```tsx
export function ShineEffect() {
  return (
    <div
      className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
      style={{
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
      }}
    />
  );
}
```

Then refactor Baseball and Golf dashboards to use `<ShineEffect />` instead of inline divs.

---

## PHASE 3: Login Page Premium Upgrade (P0)

**Files:**
- `src/app/baseball/(auth)/login/page.tsx`
- `src/app/golf/(auth)/login/page.tsx`

### Changes:
1. Add atmospheric gradient orb behind form:
```tsx
<div className="absolute top-1/4 -right-32 w-96 h-96 bg-golden-300/20 rounded-full blur-3xl" />
```

2. Update form card to use glass:
```tsx
<div className="relative glass-standard rounded-2xl p-8 shadow-lg overflow-hidden">
  <ShineEffect />
  {/* form content */}
</div>
```

3. Add logo scale animation on load:
```tsx
<motion.img
  initial={{ scale: 0.9, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
  src="/helm-baseball-logo.png"
  ...
/>
```

---

## PHASE 4: Onboarding Hover States (P1)

**File:** `src/app/baseball/(onboarding)/coach-onboarding/components/OnboardingCard.tsx`

### Enhance hover state:
```tsx
<motion.button
  className={`
    ... existing classes ...
    transition-all duration-200
    hover:shadow-lg hover:-translate-y-0.5
    hover:border-onboarding-kelly-green
  `}
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
>
  {/* Add shine sweep on hover (optional advanced) */}
</motion.button>
```

---

## PHASE 5: CinematicIntro Skip Button (P1)

**File:** `src/app/baseball/(onboarding)/coach-onboarding/components/CinematicIntro.tsx`

### Add skip button that appears after 2 seconds:

```tsx
const [showSkip, setShowSkip] = useState(false);

useEffect(() => {
  const skipTimer = setTimeout(() => setShowSkip(true), 2000);
  return () => clearTimeout(skipTimer);
}, []);

// In the JSX, add:
<AnimatePresence>
  {showSkip && (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onComplete}
      className="fixed bottom-8 right-8 text-white/60 hover:text-white text-sm flex items-center gap-1 transition-colors z-50"
    >
      Skip <span className="text-xs">→</span>
    </motion.button>
  )}
</AnimatePresence>
```

---

## PHASE 6: Error Shake Animation (P2)

Already defined in globals.css as `animate-shake`. Apply to form inputs on error.

**Files to update:**
- `src/components/ui/validated-input.tsx`
- Login page forms
- Onboarding forms

```tsx
<input
  className={cn(
    "...",
    error && "animate-shake border-red-500"
  )}
/>
```

---

## PHASE 7: Dashboard Header Glass (P2)

**File:** `src/components/layout/dashboard-header.tsx`

Currently uses `bg-white/80 backdrop-blur-md`. Update to use glass-prominent:

```tsx
<header className="sticky top-0 z-30 glass-prominent border-b border-white/20">
```

---

## VERIFICATION CHECKLIST

After each phase, verify:
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] Glass cards show gradient through them
- [ ] Shine effects visible at top of cards
- [ ] Hover states feel responsive (150-200ms)
- [ ] Reduced motion is respected
- [ ] Golf and Baseball look identical in quality

---

## REFERENCE FILES

| What | Where |
|------|-------|
| Glass CSS classes | `src/app/globals.css` (search for `glass-subtle`) |
| Dashboard gradient | `src/app/globals.css` (search for `bg-dashboard-gradient`) |
| Baseball dashboard (source of truth) | `src/app/baseball/(dashboard)/dashboard/page.tsx` |
| Motion tokens | `src/lib/motion.ts` |
| Button micro-interactions | `src/components/ui/button.tsx` |

---

## CONSTRAINTS

- **Kelly green:** `#16A34A` / `green-600` — for focus states, active indicators, accents
- **No gamification:** No confetti, celebrations, badges
- **Professional aesthetic:** Subtle, inevitable, Linear/Vercel quality
- **Animation budget:** All UI feedback under 300ms
- **Reduced motion:** Always respect `prefers-reduced-motion`

---

## START HERE

Begin with Phase 1: Open `src/app/golf/(dashboard)/dashboard/page.tsx` and apply glassmorphism to match Baseball.
