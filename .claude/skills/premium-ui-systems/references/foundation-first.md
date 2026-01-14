# Foundation-First Workflow

The systematic approach to building premium UI that avoids "vibe-coded" aesthetics.

## Core Principle

**Premium UI feels inevitable**—built on coherent hierarchy, spacing, typography, and conventions. "Vibe-coded" UI applies effects first and solves structure later.

**Research-backed**: Nielsen Norman Group, Material Design, and WCAG all emphasize hierarchy and systematic design over decorative effects.

---

## The Foundation-First Sequence

### Phase 1: Hierarchy (Most Critical)

**Goal**: Make one thing dominant per screen. Use scale, weight, spacing, placement.

**Actions**:
1. Identify the primary action/information on each screen
2. Make it 2-3× larger/heavier/more prominent than secondary elements
3. Group related elements with consistent proximity
4. Use whitespace to separate hierarchy levels

**Test**: Grayscale test—if meaning collapses without color/effects, hierarchy is weak.

**Anti-patterns**:
- Three equally-weighted CTAs
- No visual grouping (everything same spacing)
- Random size/weight changes
- Primary action buried in chrome

---

### Phase 2: Spacing System

**Goal**: Systematic density that expresses grouping and priority.

**Actions**:
1. Adopt spacing scale: 4/8/12/16/24/32/48/64px
2. Apply consistently: cards, modals, tables, forms, sections
3. Major sections get larger spacing than minor groupings
4. Dense data (tables) stays compact; atmospheric UI gets breath

**Spacing Rules**:
```css
/* Component spacing */
--gap-xs: 4px;   /* inline elements */
--gap-sm: 8px;   /* form field spacing */
--gap-md: 16px;  /* card padding */
--gap-lg: 24px;  /* section spacing */
--gap-xl: 32px;  /* major sections */

/* Apply in components */
.card { padding: var(--gap-md); gap: var(--gap-sm); }
.section { padding: var(--gap-xl); gap: var(--gap-lg); }
```

**Anti-patterns**:
- Random padding values (13px, 19px, 27px)
- Same spacing for all hierarchy levels
- Inconsistent gaps in repeated components

---

### Phase 3: Typography Scale

**Goal**: Clear size hierarchy with 3-4 sizes maximum.

**Actions**:
1. Define type scale:
   - Display (48-64px) — Hero headlines
   - Heading (24-32px) — Section titles
   - Body (16px) — Primary content
   - Small (14px) — Captions, metadata
2. Use consistently across product
3. Limit font families to 2 maximum (display + body)
4. Ensure line-height supports readability (1.5 for body, 1.2 for headings)

**Type Scale Example**:
```css
--text-xs: 12px;
--text-sm: 14px;
--text-base: 16px;
--text-lg: 18px;
--text-xl: 20px;
--text-2xl: 24px;
--text-3xl: 30px;
--text-4xl: 36px;
```

**Anti-patterns**:
- Using all 9 sizes in type scale
- Inconsistent font weights
- Multiple display fonts
- Line-height too tight for body text

---

### Phase 4: Color System

**Goal**: One brand accent, neutral scale, semantic colors.

**Actions**:
1. Define brand accent (primary CTA, links, focus states)
2. Neutral gray scale (9 shades: 50-900)
3. Semantic colors (success, warning, error) only when needed
4. Backgrounds stay neutral or atmospheric (gradients for marketing)

**Color Tokens**:
```css
/* Brand */
--color-primary: #your-brand;
--color-primary-hover: /* darker */;

/* Neutrals (gray scale) */
--gray-50: #fafafa;
--gray-100: #f4f4f5;
--gray-200: #e4e4e7;
--gray-300: #d4d4d8;
--gray-400: #a1a1aa;
--gray-500: #71717a;
--gray-600: #52525b;
--gray-700: #3f3f46;
--gray-800: #27272a;
--gray-900: #18181b;

/* Semantic (use sparingly) */
--color-success: #10b981;
--color-warning: #f59e0b;
--color-error: #ef4444;
```

**Anti-patterns**:
- Multiple competing brand colors
- Random colors for different sections
- Low-contrast accent colors
- Semantic colors for non-semantic use

---

### Phase 5: Consistency Standards

**Goal**: Components behave the same way everywhere.

**Actions**:
1. Define button hierarchy (primary/secondary/tertiary) and stick to it
2. Standardize component geometry (radii, borders, shadows)
3. Match interaction patterns (hover/focus/active states)
4. Follow conventions unless you have measurable reason not to

**Component Standards**:
```css
/* Radii */
--radius-sm: 6px;   /* inputs, badges */
--radius-md: 8px;   /* buttons */
--radius-lg: 12px;  /* cards */
--radius-xl: 16px;  /* modals */

/* Borders */
--border-width: 1px;
--border-color: var(--gray-200);

/* Shadows */
--shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
--shadow-md: 0 4px 6px rgba(0,0,0,0.07);
--shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
```

**Anti-patterns**:
- Different radii for same component type
- Buttons that look clickable but aren't
- Inconsistent hover states
- Novel patterns without clear benefit

---

## After Foundation Is Solid

Only after Phases 1-5 are complete, add:

### Controlled Effects

**Glass/Blur**: Only for chrome (nav, toolbars, overlays)
**Motion**: 2-4 transition types, consistently applied
**Glow**: Primary CTA hover, focus rings only
**Gradients**: Marketing backgrounds, not over dense content

### One Hero Moment

Marketing pages can have ONE special effect:
- 3D object with cursor tracking
- Scroll-driven animation chapter
- Interactive demo/visualization

Product UI rarely needs hero moments—focus on clarity.

---

## Quality Checklist

Before calling UI "done":

**Foundation**:
- [ ] Grayscale test passes (hierarchy clear without color)
- [ ] Spacing scale applied consistently
- [ ] Typography scale used throughout (3-4 sizes max)
- [ ] One brand accent, neutral scale established
- [ ] Component patterns standardized

**Accessibility**:
- [ ] Text contrast ≥ 4.5:1 (WCAG AA)
- [ ] Interactive elements ≥ 3:1
- [ ] Focus indicators visible
- [ ] Reduced motion support
- [ ] Touch targets ≥ 44×44px

**Polish**:
- [ ] Glass only on chrome
- [ ] Motion budget: 2-4 types max
- [ ] Effects don't reduce legibility
- [ ] Consistent interaction patterns

---

## Common Failure Modes

### Symptom: "Looks like a template"
**Diagnosis**: Inconsistent tokens
**Fix**: Audit all radii, spacing, shadows—normalize to system

### Symptom: "Too busy"
**Diagnosis**: Weak hierarchy
**Fix**: Grayscale test → strengthen primary element scale/weight

### Symptom: "Feels cheap"
**Diagnosis**: Low contrast on glass effects
**Fix**: Test over busiest background → increase opacity or go solid

### Symptom: "Demo reel energy"
**Diagnosis**: Motion without purpose
**Fix**: Cut to 2-4 meaningful transitions

### Symptom: "Doesn't feel cohesive"
**Diagnosis**: Mixed conventions
**Fix**: Standardize: one button hierarchy, one card style, one modal pattern

---

## Progressive Enhancement

Start with solid, accessible foundation. Add enhancement layers:

1. **Base**: Semantic HTML, accessible forms, clear hierarchy
2. **Style**: Systematic tokens, consistent components
3. **Interaction**: Purposeful motion, clear states
4. **Polish**: Selective glass/glow, one hero moment

Each layer should enhance, not replace, the one below.

---

## References

- Nielsen Norman Group: [Visual Hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/)
- Nielsen Norman Group: [5 Principles of Visual Design](https://www.nngroup.com/articles/principles-visual-design/)
- Nielsen Norman Group: [Form White Space](https://www.nngroup.com/articles/form-design-white-space/)
- Material Design: [Spacing](https://m3.material.io/foundations/layout/understanding-layout/spacing)
- WCAG: [1.4.3 Contrast](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- WCAG: [1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)
