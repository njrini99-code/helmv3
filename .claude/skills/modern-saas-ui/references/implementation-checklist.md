# Modern SaaS UI Implementation Checklist

Production-oriented checklist for tokens, components, motion, accessibility, and performance.

---

## 1. Foundations (Tokens + Layout)

- [ ] Define spacing scale tokens (4/8/12/16/24/32/48/64)
- [ ] Define radii tokens (8/12/16/24) and apply consistently
- [ ] Define elevation tokens (shadow-0/1/2) and hover elevation
- [ ] Define border tokens (1px neutral; stronger on hover/focus)
- [ ] Define blur/material tokens (blur-sm, blur-md) and usage rules
- [ ] Define typography scale + line heights; document max line length rules
- [ ] Define semantic color roles (bg, surface, text, muted, border, accent, success, warning, danger)
- [ ] Document responsive grid rules (12-col, breakpoints, container widths, density per breakpoint)

---

## 2. Motion System

- [ ] Choose product motion scheme (fast + subtle) and marketing scheme (slower + expressive)
- [ ] Define motion tokens: duration-fast (150ms), duration-med (220ms), duration-slow (320ms)
- [ ] Define easing tokens and keep consistent across components
- [ ] Implement `prefers-reduced-motion` fallbacks (remove non-essential movement/parallax; shorten transitions)
- [ ] Create reusable patterns: fade+translate, scale-in dialogs, shared layout transitions, list item insert/remove

---

## 3. Components (Primitives)

- [ ] **Button** (primary/secondary/ghost/destructive) with hover/active/focus/disabled/loading states
- [ ] **IconButton** with tooltip + screen-reader label
- [ ] **Input/Textarea** with label, helper text, error + success states, clear focus ring
- [ ] **Select/Combobox** with keyboard navigation + search
- [ ] **Checkbox/Switch/Radio** with accessible hit targets and focus states
- [ ] **Tabs** with clear active indicator and optional subtle motion
- [ ] **Badge/Tag** with semantic variants
- [ ] **Avatar** (image + fallback initials)
- [ ] **Separator/Divider** tokens for density control
- [ ] **Tooltip and Popover** (focus handling, escape close, click outside)

---

## 4. Components (Composed SaaS UI)

- [ ] **Card system** (default, interactive, optional glass/chrome variant)
- [ ] **Data table**: sorting, filtering, empty state, loading state, keyboard focus clarity
- [ ] **Pagination** or infinite scroll with explicit loading and end states
- [ ] **Modal dialog**: focus trap, escape close, scroll lock, accessible heading
- [ ] **Drawer/Side sheet** for secondary tasks (filters/details/edit forms)
- [ ] **Toast system** (success/error/warning) with optional action (Undo/Retry)
- [ ] **Command palette** (Ctrl/Cmd+K) for navigation and global actions
- [ ] **Breadcrumbs** for deep navigation and clarity
- [ ] **Stepper/progress indicator** for onboarding flows
- [ ] **Empty states** for every zero-data screen (contextual + actionable)

---

## 5. Premium Surfaces + Microinteractions

- [ ] **Bento section templates**: hero card + supporting cards + tertiary cards (consistent spacing/radius)
- [ ] **Glass** used for chrome surfaces only unless content is short; verify readability in light/dark modes
- [ ] **Button press** feels physical (tiny scale/translate + shadow shift)
- [ ] **Inline validation** is calm and explains how to fix issues
- [ ] **Save/sync status** is explicit (saving → saved → retry on error)
- [ ] **Skeleton loading** for lists/dashboards where users expect content quickly

---

## 6. Accessibility + Performance QA

- [ ] Keyboard navigation works everywhere; focus order is logical; no focus traps outside dialogs
- [ ] Focus indicators are visible against all surfaces (including glass)
- [ ] Color contrast validated for text/icons and semantic states (success/warning/error)
- [ ] Hit targets meet touch guidance (≥44px where relevant)
- [ ] Animations avoid layout thrash; transform/opacity used for motion
- [ ] Heavy media (video/3D) is lazy-loaded; static fallbacks exist

---

## Token Reference

```css
/* Spacing Scale */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
--space-8: 32px;
--space-12: 48px;
--space-16: 64px;

/* Border Radius */
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 24px;

/* Shadows */
--shadow-0: none;
--shadow-1: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06);
--shadow-2: 0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06);
--shadow-3: 0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05);

/* Motion */
--duration-fast: 150ms;
--duration-med: 220ms;
--duration-slow: 320ms;
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);

/* Blur */
--blur-sm: 8px;
--blur-md: 16px;
--blur-lg: 24px;
```

---

## Glass Surface Recipe

```css
.glass-surface {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(var(--blur-md));
  -webkit-backdrop-filter: blur(var(--blur-md));
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: var(--shadow-1);
}

/* Dark mode variant */
.glass-surface-dark {
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
```

---

## Reduced Motion Fallback

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
