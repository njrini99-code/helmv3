# Color Consistency System — Deep Dive

## The Three-Layer Token Architecture

Premium SaaS apps (shadcn/ui and other editorial dashboards) all use a layered token system. This prevents the #1 cause of color drift: developers picking "close enough" colors instead of referencing a single source of truth.

```
Layer 1: Primitives    → Raw color values (--green-600: #16A34A)
Layer 2: Semantics     → Purpose-based names (--color-interactive: var(--green-600))
Layer 3: Components    → Component-specific (bg-interactive, text-text-secondary)
```

**Components should ONLY reference Layer 2/3** — never Layer 1 raw values directly.

---

## Full Token Definition (GolfHelm Example)

```css
/* globals.css */
:root {
  /* ─── Layer 1: Primitive Values ─── */
  --green-500: #22c55e;
  --green-600: #16A34A;
  --green-700: #15803D;
  --warm-50:  #fafaf9;
  --warm-100: #f5f5f4;
  --warm-200: #e7e5e4;
  --warm-300: #d6d3d1;
  --warm-500: #78716c;
  --warm-700: #44403c;
  --warm-900: #1c1917;
  --cream:    #FFFEFA;
  --red-600:  #DC2626;
  --amber-500:#F59E0B;
  --blue-500: #3B82F6;

  /* ─── Layer 2: Semantic Tokens ─── */

  /* Surfaces (backgrounds) */
  --color-surface:           var(--cream);
  --color-surface-secondary: var(--warm-50);
  --color-surface-muted:     var(--warm-100);

  /* Glass tiers */
  --color-glass-subtle:    rgba(255, 255, 255, 0.55);
  --color-glass-standard:  rgba(255, 255, 255, 0.7);
  --color-glass-prominent: rgba(255, 255, 255, 0.8);

  /* Text */
  --color-text-primary:   var(--warm-900);
  --color-text-secondary: var(--warm-500);
  --color-text-muted:     var(--warm-300);
  --color-text-inverse:   white;

  /* Interactive (buttons, links, active states) */
  --color-interactive:       var(--green-600);
  --color-interactive-hover: var(--green-700);
  --color-interactive-light: rgba(22, 163, 74, 0.1);

  /* Borders */
  --color-border:        var(--warm-200);
  --color-border-subtle: rgba(255, 255, 255, 0.2);
  --color-border-strong: var(--warm-300);

  /* Status */
  --color-success: var(--green-600);
  --color-error:   var(--red-600);
  --color-warning: var(--amber-500);
  --color-info:    var(--blue-500);

  /* Focus */
  --color-focus-ring: rgba(22, 163, 74, 0.5);
}
```

---

## Tailwind Config Mapping

```typescript
// tailwind.config.ts — extend with semantic tokens
export default {
  theme: {
    extend: {
      colors: {
        'surface':           'var(--color-surface)',
        'surface-secondary': 'var(--color-surface-secondary)',
        'text-primary':      'var(--color-text-primary)',
        'text-secondary':    'var(--color-text-secondary)',
        'text-muted':        'var(--color-text-muted)',
        'interactive':       'var(--color-interactive)',
        'interactive-hover': 'var(--color-interactive-hover)',
        'border':            'var(--color-border)',
        'border-subtle':     'var(--color-border-subtle)',
        'success':           'var(--color-success)',
        'error':             'var(--color-error)',
        'warning':           'var(--color-warning)',
        'info':              'var(--color-info)',
      },
    },
  },
}
```

---

## Color Drift Audit Process

### Step 1: Run the grep audit
```bash
# Count different gray families (should only be one: warm-*)
grep -rn "text-gray-\|text-neutral-\|text-warm-\|text-stone-\|text-zinc-" \
  --include="*.tsx" src/ | \
  sed 's/.*\(text-[a-z]*-\).*/\1/' | sort | uniq -c | sort -rn

# Expected output: ALL should be text-warm-*
# If you see text-gray- or text-neutral-, those need migration

# Count different green usages
grep -rn "green-[0-9]" --include="*.tsx" src/ | \
  sed 's/.*\(green-[0-9]*\).*/\1/' | sort | uniq -c | sort -rn

# Expected: green-600 for primary, green-700 for hover, green-500 for light
# If you see green-400, green-800 etc. → migration needed

# Find hardcoded hex values (worst offenders)
grep -rn "\[#[0-9a-fA-F]" --include="*.tsx" src/ | head -30
```

### Step 2: Categorize findings
- **Critical**: Different primary greens on buttons (users notice immediately)
- **High**: Different text grays (creates "messy" feeling)
- **Medium**: Different backgrounds (subtle but cumulative)
- **Low**: Different border colors (barely noticeable)

### Step 3: Migrate
Replace raw values with token references, starting from Critical down to Low.

---

## Common Color Drift Patterns to Fix

| Bad | Good | Why |
|-----|------|-----|
| `bg-[#16A34A]` | `bg-interactive` | Token is the single source |
| `text-gray-500` | `text-text-secondary` | Wrong gray family + not semantic |
| `bg-white` | `bg-surface` or `bg-white/70` | bg-white is only for solid cards |
| `border-gray-200` | `border-border` | Consistent border color |
| `hover:bg-green-700` | `hover:bg-interactive-hover` | Hover color should be centralized |
| `text-red-500` | `text-error` | Status colors need tokens too |
