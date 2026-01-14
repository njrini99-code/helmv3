# Craft Standards

Steve Jobs: "When you're a carpenter making a beautiful chest of drawers, you're not going to use a piece of plywood on the back, even though it faces the wall. You'll know it's there."

This is your quality benchmark. Polish everything, especially what's invisible.

---

## The Craft Mindset

### Premium Feel = Premium Price

Design quality isn't decoration. It's a feature that:
- **Builds trust** (quality signals competence)
- **Justifies pricing** (premium feel commands premium price)
- **Reduces churn** (people stay with tools they love)
- **Creates advocates** (delight drives word-of-mouth)

### Attention to Detail Compounds

```
Week 1: Small polish feels nice
Month 1: Consistency feels premium
Year 1: System feels inevitable
Year 3: Product feels industry-leading
```

**Quality is a long game.**

---

## Part I: Pixel-Perfect Execution

### Typography Standards

```css
/* SCALE: Use mathematical ratio */
--scale: 1.25; /* Major third */

--text-xs: 0.64rem;   /* 10px */
--text-sm: 0.8rem;    /* 13px */
--text-base: 1rem;    /* 16px */
--text-lg: 1.25rem;   /* 20px */
--text-xl: 1.563rem;  /* 25px */
--text-2xl: 1.953rem; /* 31px */
--text-3xl: 2.441rem; /* 39px */
--text-4xl: 3.052rem; /* 49px */

/* LINE HEIGHT: Readable */
--leading-tight: 1.2;  /* Headings */
--leading-normal: 1.5; /* Body */
--leading-relaxed: 1.75; /* Long-form */

/* LETTER SPACING: Optical */
--tracking-tight: -0.02em; /* Large headings */
--tracking-normal: 0;      /* Body */
--tracking-wide: 0.05em;   /* Small caps, labels */

/* MEASURE: Comfortable line length */
max-width: 65ch; /* 45-75 characters per line */
```

**Quality Check:**
- [ ] Text never smaller than 14px (except legal)
- [ ] Contrast ≥ 4.5:1 for body text
- [ ] Line height comfortable (not squished)
- [ ] Headings have clear hierarchy

---

### Spacing System

```css
/* 4px base unit */
--space-0: 0;
--space-1: 0.25rem;  /* 4px */
--space-2: 0.5rem;   /* 8px */
--space-3: 0.75rem;  /* 12px */
--space-4: 1rem;     /* 16px */
--space-5: 1.5rem;   /* 24px */
--space-6: 2rem;     /* 32px */
--space-8: 3rem;     /* 48px */
--space-10: 4rem;    /* 64px */
--space-12: 6rem;    /* 96px */
--space-16: 8rem;    /* 128px */

/* USE: Everything aligns to 4px grid */
padding: var(--space-4);
margin-bottom: var(--space-6);
gap: var(--space-3);
```

**Quality Check:**
- [ ] No random spacing (13px, 19px, 27px)
- [ ] Consistent vertical rhythm
- [ ] Clear visual grouping
- [ ] Breathing room (not cramped)

---

### Alignment Precision

```css
/* PIXEL ALIGNMENT */
/* Avoid subpixel rendering */
transform: translateX(0);     /* Good */
transform: translateX(0.5px); /* Bad (blurry) */

/* GRID ALIGNMENT */
display: grid;
grid-template-columns: repeat(12, 1fr);
/* Everything snaps to 12-column grid */

/* VERTICAL RHYTHM */
/* All vertical spacing on 4px grid */
margin-bottom: 1rem;   /* 16px ✓ */
margin-bottom: 1.5rem; /* 24px ✓ */
margin-bottom: 1.3rem; /* 20.8px ✗ */
```

**Quality Check:**
- [ ] Text baseline aligns across columns
- [ ] Icons align with text
- [ ] Buttons same height in button groups
- [ ] Edges align (no off-by-1px)

---

## Part II: State Design

Design **all states**, not just default.

### Complete State Coverage

```jsx
// BUTTON STATES
<Button
  state={
    idle |      // Default
    hover |     // Cursor over
    active |    // Mouse down
    focus |     // Keyboard focus
    disabled |  // Not interactive
    loading |   // Async action
    success |   // Action succeeded
    error       // Action failed
  }
/>
```

**For Every Interactive Element:**

1. **Idle** (default)
2. **Hover** (cursor feedback)
3. **Active** (pressed)
4. **Focus** (keyboard navigation)
5. **Disabled** (not available)
6. **Loading** (async operation)
7. **Success** (completed)
8. **Error** (failed)

### State Transition Quality

```css
/* SMOOTH TRANSITIONS */
transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);

/* WHAT CHANGES */
- Background color
- Border color
- Shadow
- Transform (subtle lift/press)
- Cursor

/* WHAT DOESN'T CHANGE */
- Size (causes layout shift)
- Position (disorienting)
- Font (jarring)
```

**Quality Check:**
- [ ] Every interactive element has all 8 states
- [ ] Transitions are smooth (no jank)
- [ ] Disabled state is obvious
- [ ] Loading state doesn't break layout
- [ ] Error state is clear and helpful

---

## Part III: Edge Case Design

Polish the invisible.

### Empty States

```jsx
// BAD
<div className="empty">
  No results found.
</div>

// GOOD
<EmptyState>
  <IllustrationIcon className="w-24 h-24 text-gray-300" />
  <h3 className="text-lg font-semibold mt-4">
    No projects yet
  </h3>
  <p className="text-gray-600 max-w-sm">
    Projects help you organize your work and collaborate with your team
  </p>
  <Button className="mt-6" onClick={createProject}>
    Create Your First Project
  </Button>
</EmptyState>
```

**Quality Standards:**
- Clear illustration/icon
- Helpful headline (not just "Empty")
- Explanation of what goes here
- Primary action to fill state
- Optional: Example/template shortcuts

---

### Loading States

```jsx
// BAD: Spinner only
<Spinner />

// GOOD: Skeleton loaders
<div className="space-y-4">
  <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
  <div className="h-4 bg-gray-200 rounded animate-pulse w-full" />
  <div className="h-4 bg-gray-200 rounded animate-pulse w-5/6" />
</div>

// BETTER: Progressive loading
<div>
  {/* Critical content loads first */}
  <Header />
  
  {/* Secondary content shows skeleton */}
  {isLoading ? (
    <Skeleton />
  ) : (
    <Content />
  )}
</div>
```

**Quality Standards:**
- Match layout of loaded content
- Skeleton dims match real content
- No layout shift when loads
- Progressive (show what's ready)
- Timeout fallback (if >5s, show error)

---

### Error States

```jsx
// BAD
<div className="error">Error</div>

// GOOD
<ErrorState>
  <AlertCircleIcon className="w-16 h-16 text-red-500" />
  <h3 className="text-lg font-semibold mt-4">
    Something went wrong
  </h3>
  <p className="text-gray-600 max-w-md">
    We couldn't load your projects. This might be a 
    temporary issue with your connection.
  </p>
  
  <div className="flex gap-4 mt-6">
    <Button onClick={retry}>
      Try Again
    </Button>
    <Button variant="ghost" onClick={contactSupport}>
      Contact Support
    </Button>
  </div>
  
  {isDev && (
    <details className="mt-8 text-xs text-gray-500">
      <summary>Error details</summary>
      <pre>{errorDetails}</pre>
    </details>
  )}
</ErrorState>
```

**Quality Standards:**
- Friendly (not scary) icon
- Human language (not error codes)
- What happened + why
- Clear recovery action
- Support escape hatch
- Dev details (only in dev mode)

---

### Success States

```jsx
// GOOD: Celebrate wins
<SuccessState>
  <Confetti /> {/* Brief animation */}
  <CheckCircleIcon className="w-16 h-16 text-green-500" />
  <h3 className="text-lg font-semibold mt-4">
    Project created! 🎉
  </h3>
  <p className="text-gray-600">
    You're all set to start adding tasks
  </p>
  
  <div className="flex gap-4 mt-6">
    <Button onClick={goToProject}>
      View Project
    </Button>
    <Button variant="ghost" onClick={createAnother}>
      Create Another
    </Button>
  </div>
</SuccessState>
```

**Quality Standards:**
- Celebrate (but don't overdo)
- Clear confirmation
- Next step obvious
- Quick escape to common action

---

## Part IV: Responsive Design

Mobile isn't an afterthought.

### Breakpoint Strategy

```css
/* MOBILE FIRST */
/* Base styles for mobile */
.card {
  padding: 1rem;
  font-size: 0.875rem;
}

/* Enhance for larger screens */
@media (min-width: 640px) {  /* sm */
  .card { padding: 1.5rem; }
}

@media (min-width: 768px) {  /* md */
  .card { 
    padding: 2rem;
    font-size: 1rem;
  }
}

@media (min-width: 1024px) { /* lg */
  .card { padding: 2.5rem; }
}
```

### Touch Target Standards

```css
/* MINIMUM 44×44px for touch */
button {
  min-width: 44px;
  min-height: 44px;
  padding: 0.75rem 1.5rem;
}

/* Increase tap spacing */
.nav-links a {
  padding: 1rem;  /* Not 0.5rem */
  margin: 0.25rem; /* Breathing room */
}
```

**Quality Check:**
- [ ] Touch targets ≥ 44×44px
- [ ] Spacing between interactive elements
- [ ] Gestures feel natural (swipe, pinch)
- [ ] No hover-only interactions on mobile
- [ ] Keyboard accessible on desktop

---

## Part V: Performance

Fast feels premium. Slow feels broken.

### Core Web Vitals

```
LCP (Largest Contentful Paint): < 2.5s
FID (First Input Delay): < 100ms
CLS (Cumulative Layout Shift): < 0.1
```

### Performance Budget

```js
// Image optimization
- Use WebP/AVIF
- Lazy load below fold
- Responsive images (srcset)
- CDN delivery

// Code splitting
- Route-based splitting
- Component lazy loading
- Tree shaking

// Rendering
- Use transform/opacity (GPU)
- Avoid layout thrashing
- Virtual scrolling for long lists
```

**Quality Check:**
- [ ] Lighthouse score ≥ 90
- [ ] Images optimized
- [ ] No layout shift on load
- [ ] Smooth 60fps interactions
- [ ] Fast on slow networks (throttle test)

---

## Part VI: Accessibility

Not optional. Premium products are inclusive.

### Semantic HTML

```html
<!-- BAD -->
<div onClick={handleClick}>Click me</div>

<!-- GOOD -->
<button onClick={handleClick}>Click me</button>
```

### ARIA Labels

```jsx
// Icon-only buttons need labels
<button aria-label="Close modal">
  <XIcon />
</button>

// Complex widgets need roles
<div role="dialog" aria-modal="true">
  <h2 id="modal-title">Confirm action</h2>
  <div role="document" aria-labelledby="modal-title">
    Content
  </div>
</div>
```

### Keyboard Navigation

```jsx
// All interactive elements keyboard accessible
- Tab to navigate
- Enter/Space to activate
- Escape to cancel
- Arrow keys for lists/menus

// Focus management
<Modal onOpen={() => {
  // Trap focus in modal
  focusTrap.activate();
}}>
```

**Quality Check:**
- [ ] Can navigate entire app with keyboard
- [ ] Focus indicators visible
- [ ] Screen reader announces correctly
- [ ] Color contrast meets WCAG AA
- [ ] No keyboard traps
- [ ] Skip links for navigation

---

## Part VII: Polish Checklist

Before shipping ANY feature:

### Visual Polish
- [ ] Typography scale applied consistently
- [ ] Spacing on 4px grid
- [ ] Colors from design tokens (no random hex)
- [ ] Icons same style/weight
- [ ] Illustrations consistent style
- [ ] No orphan words in headlines
- [ ] Line length comfortable (45-75 chars)

### Interaction Polish
- [ ] All 8 states designed (idle, hover, active, focus, disabled, loading, success, error)
- [ ] Transitions smooth (150-300ms)
- [ ] No layout shift
- [ ] Loading states (skeleton, not just spinner)
- [ ] Error states helpful (not scary)
- [ ] Success states celebrate
- [ ] Empty states guide

### Responsiveness
- [ ] Works on mobile (320px+)
- [ ] Touch targets ≥ 44px
- [ ] No horizontal scroll
- [ ] Images responsive
- [ ] Font sizes scale
- [ ] Navigation mobile-friendly

### Performance
- [ ] Lighthouse ≥ 90
- [ ] Images optimized
- [ ] Code split
- [ ] Fast on 3G
- [ ] No jank in animations

### Accessibility
- [ ] Keyboard navigable
- [ ] Screen reader friendly
- [ ] ARIA labels where needed
- [ ] Color contrast ≥ 4.5:1
- [ ] Focus indicators
- [ ] Reduced motion support

### Edge Cases
- [ ] Empty states designed
- [ ] Loading states designed
- [ ] Error states designed
- [ ] 404/500 pages designed
- [ ] Offline experience designed
- [ ] 1 item, 100 items, 10,000 items tested

---

## Part VIII: Quality Review Process

### Self-Review

1. **Visual scan** — Does it look premium?
2. **Interaction test** — Do all states work?
3. **Responsive check** — Works on mobile?
4. **Accessibility audit** — Keyboard + screen reader?
5. **Edge case test** — Empty, loading, error?
6. **Performance check** — Lighthouse score?

### Peer Review

Share with another designer/developer:
- Does this match our quality bar?
- Any rough edges?
- Missed states?
- Better approach?

### User Testing

5-user smoke test:
- Can they complete the task?
- Any confusion?
- Any delight?
- Would they use this?

---

## Critical Standards

1. **Pixel-perfect** — Every alignment matters
2. **All states** — Idle, hover, active, focus, disabled, loading, success, error
3. **Edge cases** — Empty, loading, error states polished
4. **Responsive** — Mobile isn't afterthought
5. **Fast** — Performance is UX
6. **Accessible** — Inclusive by default
7. **Systematic** — Use design tokens religiously

**The Goal**: User thinks "This feels expensive" even on free tier.
