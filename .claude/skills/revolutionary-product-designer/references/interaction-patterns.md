# Interaction Patterns

Deep dive on motion, choreography, and interaction design that feels inevitable.

## Motion as Language

Motion communicates relationships, continuity, and outcomes. Poor motion creates confusion. Great motion feels like physics.

### The Four Purposes of Motion

1. **Orient**: Where did it come from? Where is it going?
2. **Confirm**: Did the action succeed or fail?
3. **Explain**: What changed and why?
4. **Delight**: Brand character (use sparingly)

**Critical Rule**: If motion doesn't serve one of these purposes, remove it.

---

## Timing Personality

Motion timing reveals brand character. Choose one easing curve family and apply consistently.

### Easing Families

```css
/* TECHNICAL/PRECISE (Linear, Figma) */
--ease-technical: cubic-bezier(0.25, 0, 0.25, 1);
/* Use for: Data viz, technical products, precision tools */
/* Feels: Exact, controlled, deliberate */

/* SMOOTH/LUXE (Stripe, Apple) */
--ease-luxe: cubic-bezier(0.33, 1, 0.68, 1);
/* Use for: Premium products, editorial content */
/* Feels: Confident, expensive, refined */

/* PLAYFUL/BOUNCY (Framer, consumer apps) */
--ease-bouncy: cubic-bezier(0.68, -0.55, 0.265, 1.55);
/* Use for: Creative tools, social apps, games */
/* Feels: Energetic, fun, expressive */

/* SHARP/SNAPPY (Vercel, dev tools) */
--ease-snappy: cubic-bezier(0.4, 0, 0.2, 1);
/* Use for: Developer tools, dashboards, productivity */
/* Feels: Fast, responsive, efficient */
```

### Duration Standards

```css
/* Microinteractions (hover, focus) */
--duration-micro: 150ms;

/* Small elements (dropdowns, tooltips) */
--duration-small: 220ms;

/* Medium elements (modals, sheets) */
--duration-medium: 320ms;

/* Large elements (page transitions) */
--duration-large: 400ms;

/* Marketing/storytelling */
--duration-marketing: 600ms;
```

**Rule**: Faster = more responsive feel. Don't go slower than 400ms unless storytelling.

---

## State Transitions

Every interactive element has states. Design ALL of them.

### Button State Choreography

```jsx
// IDLE → HOVER
transition: all 150ms var(--ease-snappy);
- Background lightens 5%
- Border strengthens
- Subtle lift (translateY -1px)
- Shadow grows slightly

// HOVER → ACTIVE
transition: all 100ms var(--ease-snappy);
- Scale 98%
- Shadow shrinks
- Background darkens 3%

// ACTIVE → LOADING
transition: all 200ms var(--ease-snappy);
- Spinner fades in
- Text fades out
- Button width stable (no layout shift)
- Cursor: not-allowed

// LOADING → SUCCESS
transition: all 300ms var(--ease-luxe);
- Check icon fades in
- Green background
- Brief pause (800ms)
- Return to idle or advance workflow

// LOADING → ERROR
transition: all 250ms cubic-bezier(0.68, -0.55, 0.265, 1.55);
- Red border pulse
- Shake animation (-5px, +5px, -3px, +3px, 0)
- Error message slides in below
- Focus trapped for accessibility
```

### Input State Choreography

```css
/* IDLE */
border: 1px solid var(--gray-300);
background: white;

/* FOCUS */
transition: all 150ms var(--ease-snappy);
border: 1px solid var(--primary);
box-shadow: 0 0 0 3px var(--primary-alpha-10);
/* Ring appears, not border width change (prevents layout shift) */

/* ERROR */
border: 1px solid var(--red-500);
box-shadow: 0 0 0 3px var(--red-alpha-10);
/* Error message: slide down + fade in */
animation: slideDownFade 200ms var(--ease-snappy);

/* SUCCESS (optional, for validation) */
border: 1px solid var(--green-500);
/* Check icon: fade in at right edge */
/* Brief (1s), then return to normal */

/* DISABLED */
opacity: 0.5;
cursor: not-allowed;
background: var(--gray-50);
```

---

## Orchestration Patterns

Don't reveal everything at once. **Stagger** for attention and hierarchy.

### Page Load Orchestration

```jsx
// HERO SECTION
<h1 style={{ animationDelay: '0ms' }}>    // Title first
<p style={{ animationDelay: '200ms' }}>   // Subtitle 200ms later
<button style={{ animationDelay: '400ms' }}> // CTA 400ms later

// Animation
@keyframes fadeSlideUp {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-in {
  animation: fadeSlideUp 600ms var(--ease-luxe) both;
}
```

### List Reveals

```jsx
// Stagger each item by 50ms
{items.map((item, i) => (
  <div
    key={item.id}
    style={{ 
      animationDelay: `${i * 50}ms`,
      animationDuration: '400ms'
    }}
    className="fade-slide-up"
  >
    {item.content}
  </div>
))}

// Stop at 10-15 items max (avoid animation soup)
```

### Modal Entrance

```css
/* BACKDROP */
animation: fadeIn 200ms var(--ease-snappy);

/* PANEL */
animation: scaleIn 300ms var(--ease-luxe) 100ms; /* 100ms delay after backdrop */

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
```

---

## Advanced Interaction Patterns

### Drag and Drop

```jsx
// PICKUP
- Scale 105%
- Rotate 2deg
- Shadow grows (lifted)
- Cursor: grabbing
- Duration: 150ms

// DRAGGING
- Ghost at original position (opacity: 0.3)
- Active element follows cursor
- Drop zones highlight on hover

// DROP
- Snap to position (spring physics)
- Flash success color briefly
- Duration: 300ms
```

### Swipe Actions (Mobile)

```jsx
// REVEAL ON SWIPE
- Actions slide in from edge
- Primary action (delete) = full swipe
- Secondary actions (archive, pin) = partial swipe
- Haptic feedback at thresholds
- Spring back if released early
```

### Infinite Scroll

```jsx
// LOAD MORE
- Skeleton rows appear (no spinner)
- New content fades in
- Smooth height transition
- Scroll position maintained
- Loading indicator only if >500ms delay
```

### Optimistic UI

```jsx
// IMMEDIATE FEEDBACK
1. Update UI instantly (assume success)
2. Show subtle loading indicator
3. If fails: rollback + show error
4. If succeeds: confirm quietly

// Example: Like button
onClick: () => {
  setLiked(true)              // Immediate
  setCount(count + 1)          // Immediate
  api.like(id)                 // Background
    .catch(() => {
      setLiked(false)          // Rollback
      setCount(count)          // Rollback
      showError()              // Notify
    })
}
```

---

## Microinteraction Library

### Hover Lift (Cards, Buttons)

```css
.card {
  transition: all 200ms var(--ease-snappy);
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0,0,0,0.1);
}
```

### Icon Spin (Refresh, Loading)

```css
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.loading-icon {
  animation: spin 1s linear infinite;
}
```

### Success Pulse

```css
@keyframes successPulse {
  0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
  70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
  100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

.success {
  animation: successPulse 600ms var(--ease-luxe);
}
```

### Shake (Error)

```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
  20%, 40%, 60%, 80% { transform: translateX(5px); }
}

.error {
  animation: shake 400ms var(--ease-snappy);
}
```

### Confetti (Celebration)

```jsx
// Use canvas-confetti library
import confetti from 'canvas-confetti';

confetti({
  particleCount: 100,
  spread: 70,
  origin: { y: 0.6 }
});
```

---

## Accessibility Requirements

### Reduced Motion

**CRITICAL**: Always respect prefers-reduced-motion.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Focus States

```css
/* Visible focus ring for keyboard navigation */
*:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

/* Remove for mouse clicks */
*:focus:not(:focus-visible) {
  outline: none;
}
```

---

## Performance Guidelines

### Use Transform and Opacity Only

```css
/* FAST - GPU accelerated */
transform: translateY(-4px);
opacity: 0.5;

/* SLOW - triggers reflow */
margin-top: -4px;
height: 200px;
```

### Will-Change for Complex Animations

```css
.complex-animation {
  will-change: transform, opacity;
}

/* Remove after animation completes */
.animation-done {
  will-change: auto;
}
```

### Intersection Observer for Scroll Animations

```jsx
const { ref, inView } = useInView({
  threshold: 0.1,
  triggerOnce: true
});

<section ref={ref} className={inView ? 'fade-in' : 'opacity-0'}>
```

---

## Motion Budget

Pick 2-4 transition types and reuse consistently:

1. **Fade/slide** — Overlays, modals, dropdowns
2. **Hover lift** — Cards, buttons
3. **Expand/collapse** — Accordions, details
4. **Page transitions** — Route changes (optional)

**Avoid**:
- Bounce on every click
- Different easing per element
- Overly long durations (>400ms for product UI)
- Motion without purpose

**Quality Gate**: Can you remove the motion and still have a great product? If yes, the motion is decorative. Make it purposeful or remove it.
