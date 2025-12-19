# CLAUDE.md - Helm Sports Labs

> **This file tells Claude CLI everything it needs to build Helm Sports Labs.**
> Drop this folder into your project root and start building with `claude`.

---

## ⚠️ CRITICAL OPERATIONAL RULES

**Follow these rules at ALL times during development:**

### 1. When Unsure, Refer Back to Documents
- If you're uncertain about design, colors, components, or implementation → **re-read this file (CLAUDE.md)**
- If you're uncertain about database schema → **re-read SCHEMA.sql**
- If you're uncertain about code structure → **re-read KICKSTART.md**
- If you're uncertain about user flows → **re-read FLOWS.md**
- If you're uncertain about API endpoints → **re-read API_REFERENCE.md**
- **NEVER guess.** Always verify against the documentation first.

### 2. When Stuck, Ask the User
- If documentation doesn't answer your question → **ASK ME IN THE CHAT**
- If you encounter an error you can't resolve → **ASK ME IN THE CHAT**
- If you're unsure which approach to take → **ASK ME IN THE CHAT**
- If requirements seem ambiguous → **ASK ME IN THE CHAT**
- **Do NOT proceed with assumptions.** It's better to ask than to build something wrong.

### 3. Test After EVERY Step
- After creating a file → **verify it compiles without errors**
- After adding a component → **test that it renders correctly**
- After implementing a feature → **test the complete user flow end-to-end**
- After connecting to the database → **verify data loads correctly**
- After adding auth → **test login, logout, and protected routes**
- **Run `npm run dev` and check the browser after each significant change.**
- **If something breaks, fix it BEFORE moving to the next step.**

### 4. End-to-End Verification
Before considering ANY feature complete, verify:
- [ ] No TypeScript errors
- [ ] No console errors in browser
- [ ] All buttons/links work
- [ ] Data loads from database (not just mock data)
- [ ] Loading states display correctly
- [ ] Error states handled gracefully
- [ ] Works for both Coach and Player roles (if applicable)

### 5. Communication Style
- Tell me what you're about to do BEFORE doing it
- Tell me the result AFTER completing each step
- If tests fail, show me the error and your proposed fix
- Summarize progress at logical checkpoints

---

## Project Overview

**Helm Sports Labs** is a premium athletic development and recruiting platform for baseball. It connects high school players with college coaches, enabling team management, player development tracking, video showcases, and recruiting workflows.

**Tech Stack:**
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (Auth, Database, Storage)
- Vercel (Deployment)

---

# COMPLETE UI DESIGN SYSTEM

## Design Philosophy

**MUST BE:** Clean, warm, professional, refined, spacious, modern
**INSPIRED BY:** Linear, Notion, Stripe, Mercury, Vercel
**NEVER USE:** Dark mode, glassmorphism, glowing effects, gradients, chunky icons, neon colors, busy patterns

---

## Color System

### Background Colors (Warm Cream Palette)
```css
--bg-page: #FDFCFA;         /* Page background - use for body */
--bg-section: #F8F7F4;      /* Section backgrounds, alternating areas */
--bg-hover: #F2F0EC;        /* Hover states for interactive elements */
--bg-active: #EBE9E4;       /* Active/pressed states */
--bg-card: #FFFFFF;         /* Card backgrounds - always white */
```

**Usage:**
- Page background: `bg-cream-50` (#FDFCFA)
- Cards: Always `bg-white`
- Inputs when focused: `bg-white`
- Hover on buttons/rows: `bg-cream-100`

### Text Colors (Warm Grays)
```css
--text-primary: #1A1A1A;    /* Headlines, important text, names */
--text-secondary: #525252;  /* Body text, descriptions */
--text-tertiary: #858585;   /* Secondary info, timestamps, labels */
--text-quaternary: #ABABAB; /* Disabled text, placeholders, hints */
```

**Usage:**
- Page titles, names, important data: `text-gray-900`
- Body paragraphs, descriptions: `text-gray-600`
- Labels, secondary info: `text-gray-500`
- Placeholders, disabled: `text-gray-400`

### Border Colors
```css
--border-light: #ECEAE6;    /* Default borders, dividers */
--border-medium: #E0DED9;   /* Hover borders, more visible */
--border-dark: #D4D1CC;     /* Focus borders (use with brand focus ring) */
```

**Usage:**
- Card borders: `border-border-light`
- Input borders: `border-border` (medium)
- Hover state: `border-border-dark`
- Dividers: `border-border-light`

### Brand Colors (Kelly Green)
```css
--brand-50: #F0FDF4;        /* Background tints, badges */
--brand-100: #DCFCE7;       /* Light backgrounds */
--brand-200: #BBF7D0;       /* Badge backgrounds */
--brand-500: #22C55E;       /* Secondary brand uses */
--brand-600: #16A34A;       /* PRIMARY BRAND COLOR - buttons, links, accents */
--brand-700: #15803D;       /* Hover states on brand elements */
--brand-800: #166534;       /* Active/pressed states */
```

**Usage:**
- Primary buttons: `bg-brand-600 hover:bg-brand-700`
- Links: `text-brand-600 hover:text-brand-700`
- Focus rings: `ring-brand-50 border-brand-500`
- Success badges: `bg-brand-50 text-brand-700 border-brand-100`
- Active nav items: `bg-brand-50 text-brand-700`

### Semantic Colors
```css
/* Success - use brand green */
--success-bg: #F0FDF4;
--success-text: #15803D;
--success-border: #BBF7D0;

/* Warning */
--warning-bg: #FFFBEB;
--warning-text: #B45309;
--warning-border: #FDE68A;

/* Error */
--error-bg: #FEF2F2;
--error-text: #B91C1C;
--error-border: #FECACA;

/* Info */
--info-bg: #EFF6FF;
--info-text: #1D4ED8;
--info-border: #BFDBFE;
```

---

## Typography System

### Font Family
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
letter-spacing: -0.011em; /* Apply to all body text */
```

### Font Sizes
```css
--text-2xs: 11px;    /* Fine print, badges, timestamps */
--text-xs: 13px;     /* Labels, secondary info */
--text-sm: 14px;     /* Body text, inputs, buttons */
--text-base: 15px;   /* Default body text */
--text-lg: 17px;     /* Subheadings, card titles */
--text-xl: 20px;     /* Section titles */
--text-2xl: 24px;    /* Page titles */
--text-3xl: 30px;    /* Hero headings */
--text-4xl: 36px;    /* Large hero text */
```

### Font Weights
```css
--font-normal: 400;      /* Body text */
--font-medium: 500;      /* Buttons, labels, emphasis */
--font-semibold: 600;    /* Headings, names, important */
/* NEVER use 700+ weights - keep it refined */
```

### Typography Usage Guide
| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Page title | text-2xl (24px) | semibold (600) | gray-900 |
| Page subtitle | text-sm (14px) | normal (400) | gray-500 |
| Section heading | text-lg (17px) | semibold (600) | gray-900 |
| Card title | text-base (15px) | semibold (600) | gray-900 |
| Body text | text-sm (14px) | normal (400) | gray-600 |
| Label | text-sm (14px) | medium (500) | gray-700 |
| Helper text | text-xs (13px) | normal (400) | gray-500 |
| Badge text | text-xs (13px) | medium (500) | varies |
| Button text | text-sm (14px) | medium (500) | varies |
| Input text | text-sm (14px) | normal (400) | gray-900 |
| Placeholder | text-sm (14px) | normal (400) | gray-400 |
| Stat value | text-2xl (24px) | semibold (600) | gray-900 |
| Stat label | text-sm (14px) | normal (400) | gray-500 |

---

## Spacing System

### Base Spacing Scale (in pixels and Tailwind)
```css
0: 0px       /* 0 */
1: 4px       /* 1 */
1.5: 6px     /* 1.5 */
2: 8px       /* 2 */
2.5: 10px    /* 2.5 */
3: 12px      /* 3 */
4: 16px      /* 4 */
5: 20px      /* 5 */
6: 24px      /* 6 */
8: 32px      /* 8 */
10: 40px     /* 10 */
12: 48px     /* 12 */
16: 64px     /* 16 */
```

### Spacing Usage Guide
| Context | Padding/Margin | Tailwind |
|---------|---------------|----------|
| Page padding | 32px | `p-8` |
| Card padding | 24px | `p-6` |
| Card header padding | 16px 24px | `px-6 py-4` |
| Button padding (md) | 8px 16px | `px-4 py-2` |
| Button padding (sm) | 6px 10px | `px-2.5 py-1.5` |
| Input padding | 10px 12px | `px-3 py-2.5` |
| Between cards | 16px | `gap-4` |
| Between sections | 24px | `gap-6` or `mb-6` |
| Between form fields | 16px | `space-y-4` |
| Icon to text | 8px | `gap-2` |
| Badge padding | 2px 8px | `px-2 py-0.5` |
| Modal padding | 24px | `p-6` |
| Sidebar width | 240px | `w-60` |
| Header height | 64px | `h-16` |

---

## Border Radius System

```css
--radius-sm: 6px;     /* Badges, small buttons */
--radius-DEFAULT: 8px; /* Inputs, standard buttons */
--radius-md: 10px;    /* Cards, containers */
--radius-lg: 12px;    /* Large cards, modals */
--radius-xl: 14px;    /* Hero sections */
--radius-2xl: 16px;   /* Large modals */
--radius-full: 9999px; /* Avatars, pills */
```

### Radius Usage Guide
| Element | Radius | Tailwind |
|---------|--------|----------|
| Button (sm) | 6px | `rounded-md` |
| Button (md) | 8px | `rounded-lg` |
| Button (lg) | 12px | `rounded-xl` |
| Input | 8px | `rounded-lg` |
| Card | 12px | `rounded-xl` |
| Modal | 16px | `rounded-2xl` |
| Badge | 4px | `rounded` |
| Avatar | 9999px | `rounded-full` |
| Pill/Tag | 9999px | `rounded-full` |

---

## Shadow System

```css
--shadow-xs: 0 1px 2px rgba(0,0,0,0.04);
--shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
--shadow-md: 0 4px 6px -1px rgba(0,0,0,0.04), 0 2px 4px -1px rgba(0,0,0,0.02);
--shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.04), 0 4px 6px -2px rgba(0,0,0,0.02);
--shadow-xl: 0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.02);
```

### Shadow Usage Guide
| Element | Shadow | Tailwind |
|---------|--------|----------|
| Button (primary) | shadow-sm | `shadow-sm` |
| Button (secondary) | shadow-xs | `shadow-xs` |
| Card (default) | none | (border only) |
| Card (hover) | shadow-md | `shadow-md` |
| Dropdown | shadow-lg | `shadow-lg` |
| Modal | shadow-xl | `shadow-xl` |
| Toast | shadow-lg | `shadow-lg` |

---

## Icon System

### CRITICAL RULES
1. **Stroke width: 1.5px** - NEVER use 2px (too chunky)
2. **Custom SVG only** - NO icon libraries (no Lucide, Heroicons, FontAwesome)
3. **Consistent sizing** - Use the size scale below
4. **Current color** - Use `stroke="currentColor"` for flexibility

### Icon Sizes
```css
xs: 14px   /* Inside small buttons, inline with text-xs */
sm: 16px   /* Inside standard buttons, inline with text-sm */
md: 18px   /* Default, standalone icons */
lg: 20px   /* Featured icons, stat cards */
xl: 24px   /* Large standalone, empty states */
```

### Icon Template
```tsx
interface IconProps extends React.SVGAttributes<SVGElement> {
  size?: number;
}

export function IconName({ size = 18, ...props }: IconProps) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* paths here */}
    </svg>
  );
}
```

### Required Icons (build these)
```
Navigation: Home, Search, Users, Message, Chart, Settings, LogOut
Actions: Plus, Check, X, Edit, Trash, Star, Filter, Send
Arrows: ChevronRight, ChevronLeft, ChevronDown, ChevronUp
Content: User, Mail, Phone, MapPin, Calendar, Clock, Video, Link, ExternalLink
Social: Instagram, Twitter
Status: Eye, Bell, Award, Target, GraduationCap, Building
```

---

## Component Specifications

### Button Component

**Variants:**
| Variant | Background | Text | Border | Hover |
|---------|-----------|------|--------|-------|
| primary | brand-600 | white | none | brand-700 |
| secondary | white | gray-900 | border-light | cream-100 bg |
| ghost | transparent | gray-600 | none | cream-200 bg |
| danger | red-600 | white | none | red-700 |

**Sizes:**
| Size | Padding | Font | Radius |
|------|---------|------|--------|
| sm | px-2.5 py-1.5 | text-xs | rounded-md |
| md | px-4 py-2 | text-sm | rounded-lg |
| lg | px-5 py-3 | text-base | rounded-xl |

**States:**
- Default: Normal appearance
- Hover: Background shifts, subtle transform
- Focus: Ring (brand-50) + border (brand-500)
- Active: Slightly darker background
- Disabled: 50% opacity, cursor-not-allowed
- Loading: Show spinner, disable interaction

```tsx
// Button className pattern
className={cn(
  'inline-flex items-center justify-center gap-2 font-medium transition-all rounded-lg',
  'disabled:opacity-50 disabled:cursor-not-allowed',
  variant === 'primary' && 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  variant === 'secondary' && 'bg-white text-gray-900 border border-border hover:bg-cream-100 shadow-xs',
  variant === 'ghost' && 'bg-transparent text-gray-600 hover:bg-cream-200',
  variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
  size === 'sm' && 'px-2.5 py-1.5 text-xs',
  size === 'md' && 'px-4 py-2 text-sm',
  size === 'lg' && 'px-5 py-3 text-base',
)}
```

### Input Component

**Appearance:**
- Background: white
- Border: border-light (1px)
- Radius: rounded-lg (8px)
- Padding: px-3 py-2.5
- Font: text-sm

**States:**
- Default: border-border
- Hover: border-border-dark
- Focus: border-brand-500 + ring-2 ring-brand-50 + bg-white
- Error: border-red-500 + ring-red-50
- Disabled: bg-cream-100 + opacity-50

**With Label:**
```tsx
<div className="w-full">
  <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
  <input className="input" />
  {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
  {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
</div>
```

### Card Component

**Default Card:**
```tsx
<div className="bg-white border border-border-light rounded-xl">
  <div className="px-6 py-4 border-b border-border-light">
    <h3 className="font-semibold text-gray-900">{title}</h3>
  </div>
  <div className="p-6">{children}</div>
</div>
```

**Hover Card (clickable):**
```tsx
<div className="bg-white border border-border-light rounded-xl transition-all hover:border-border hover:shadow-md hover:-translate-y-0.5 cursor-pointer">
```

### Badge Component

**Variants:**
| Variant | Background | Text | Border |
|---------|-----------|------|--------|
| default | cream-200 | gray-700 | none |
| success | brand-50 | brand-700 | brand-100 |
| warning | amber-50 | amber-700 | amber-100 |
| error | red-50 | red-700 | red-100 |
| info | blue-50 | blue-700 | blue-100 |

**Styling:**
```tsx
className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded"
```

### Avatar Component

**Sizes:**
| Size | Dimensions | Font |
|------|------------|------|
| xs | w-6 h-6 | text-2xs |
| sm | w-8 h-8 | text-xs |
| md | w-10 h-10 | text-sm |
| lg | w-12 h-12 | text-base |
| xl | w-16 h-16 | text-lg |
| 2xl | w-24 h-24 | text-2xl |

**Fallback (initials):**
```tsx
<div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-medium text-sm">
  {initials}
</div>
```

### Modal Component

**Structure:**
```tsx
// Overlay
<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div className="fixed inset-0 bg-black/50" onClick={onClose} />
  
  // Modal
  <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
    // Header
    <div className="flex items-center justify-between px-6 py-4 border-b border-border-light">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <button className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-cream-100">
        <IconX size={20} />
      </button>
    </div>
    
    // Content
    <div className="p-6">{children}</div>
    
    // Footer (optional)
    <div className="flex justify-end gap-3 px-6 py-4 border-t border-border-light">
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button onClick={onSubmit}>Confirm</Button>
    </div>
  </div>
</div>
```

**Sizes:**
- sm: max-w-md (448px)
- md: max-w-lg (512px)
- lg: max-w-2xl (672px)
- xl: max-w-4xl (896px)

### Select Component

**Appearance:** Same as Input, plus:
- Chevron icon on right
- Custom dropdown styling

```tsx
<select className="input appearance-none pr-10 bg-[url('data:image/svg+xml,...')] bg-no-repeat bg-right">
```

### Textarea Component

**Appearance:** Same as Input, plus:
- resize-none (controlled height)
- min-height for multiline
- rows={4} default

---

## Layout Patterns

### Page Layout
```tsx
<div className="min-h-screen bg-cream-50">
  <Sidebar />  {/* Fixed, w-60, left-0 */}
  <main className="ml-60">
    <Header />  {/* Sticky, h-16, top-0 */}
    <div className="p-8">
      {/* Page content */}
    </div>
  </main>
</div>
```

### Sidebar Structure
- Width: 240px (w-60)
- Background: white
- Border: right, border-light
- Position: fixed, full height
- Z-index: 40
- Sections: Logo (h-16), Nav (flex-1), User (border-t)

### Header Structure
- Height: 64px (h-16)
- Background: white
- Border: bottom, border-light
- Position: sticky, top-0
- Z-index: 30
- Content: Title/breadcrumb (left), Search + Avatar (right)

### Grid Patterns
```tsx
// Stats grid (4 columns)
<div className="grid grid-cols-4 gap-4">

// Card grid (2 columns)
<div className="grid grid-cols-2 gap-4">

// Two-thirds / one-third
<div className="grid grid-cols-3 gap-6">
  <div className="col-span-2">Main</div>
  <div>Sidebar</div>
</div>

// Pipeline columns
<div className="grid grid-cols-4 gap-4">
```

---

## Animation & Transitions

### Default Transition
```css
transition-all duration-200 ease-in-out
/* Tailwind: transition-all */
```

### Hover Animations
```tsx
// Card lift
"hover:-translate-y-0.5 hover:shadow-md"

// Button press
"active:scale-[0.98]"

// Link underline
"hover:underline"

// Background change
"hover:bg-cream-100"
```

### Loading States
```tsx
// Spinner
<svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
</svg>

// Skeleton
<div className="animate-pulse bg-cream-200 rounded h-4 w-full" />
```

### Page Transitions
- No page transitions - keep it snappy
- Content should appear immediately

---

## State Patterns

### Empty State
```tsx
<div className="flex flex-col items-center justify-center py-12 text-center">
  <div className="w-12 h-12 rounded-full bg-cream-200 flex items-center justify-center mb-4 text-gray-400">
    <Icon size={24} />
  </div>
  <h3 className="text-base font-medium text-gray-900 mb-1">{title}</h3>
  <p className="text-sm text-gray-500 mb-4 max-w-sm">{description}</p>
  <Button>{actionLabel}</Button>
</div>
```

### Loading State (Page)
```tsx
<div className="flex items-center justify-center h-[calc(100vh-4rem)]">
  <svg className="animate-spin h-8 w-8 text-brand-600">...</svg>
</div>
```

### Loading State (Inline)
```tsx
<div className="flex items-center justify-center py-12">
  <svg className="animate-spin h-6 w-6 text-brand-600">...</svg>
</div>
```

### Error State
```tsx
<div className="p-4 bg-red-50 border border-red-100 rounded-lg">
  <p className="text-sm text-red-700">{error}</p>
</div>
```

### Success Toast
```tsx
<div className="fixed bottom-4 right-4 p-4 bg-white border border-brand-100 rounded-xl shadow-lg">
  <div className="flex items-center gap-3">
    <IconCheck className="text-brand-600" />
    <p className="text-sm text-gray-900">{message}</p>
  </div>
</div>
```

---

## Z-Index System

```css
--z-base: 0;
--z-dropdown: 10;
--z-sticky: 20;
--z-fixed: 30;
--z-header: 30;
--z-sidebar: 40;
--z-modal-backdrop: 50;
--z-modal: 50;
--z-toast: 60;
```

---

## Responsive Breakpoints

```css
sm: 640px   /* Mobile landscape */
md: 768px   /* Tablet */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
2xl: 1536px /* Wide screens */
```

For this app: **Desktop-first**. Sidebar collapses at `lg` breakpoint.

---

## Form Patterns

### Form Layout
```tsx
<form className="space-y-4">
  <Input label="Field 1" />
  <Input label="Field 2" />
  <div className="grid grid-cols-2 gap-4">
    <Input label="Half Field" />
    <Input label="Half Field" />
  </div>
  <Textarea label="Long Field" />
  {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
  <div className="flex justify-end gap-3 pt-4">
    <Button variant="secondary">Cancel</Button>
    <Button type="submit">Save</Button>
  </div>
</form>
```

### Validation
- Show errors below fields: `<p className="mt-1 text-xs text-red-600">`
- Highlight invalid inputs: `border-red-500`
- Show success: optional green checkmark

---

## Table Patterns

### Simple Table
```tsx
<div className="bg-white border border-border-light rounded-xl overflow-hidden">
  <table className="w-full">
    <thead className="bg-cream-50">
      <tr>
        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Header</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-border-light">
      <tr className="hover:bg-cream-50">
        <td className="px-6 py-4 text-sm text-gray-900">Content</td>
      </tr>
    </tbody>
  </table>
</div>
```

### List Table (no headers)
```tsx
<div className="bg-white border border-border-light rounded-xl divide-y divide-border-light">
  <div className="px-6 py-4 flex items-center gap-4 hover:bg-cream-50">
    {/* Row content */}
  </div>
</div>
```

---

## Navigation Patterns

### Sidebar Nav Item
```tsx
<Link 
  href={href}
  className={cn(
    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
    isActive 
      ? 'bg-brand-50 text-brand-700' 
      : 'text-gray-600 hover:bg-cream-100 hover:text-gray-900'
  )}
>
  <Icon size={18} />
  {label}
</Link>
```

### Tabs
```tsx
<div className="flex gap-1 p-1 bg-cream-100 rounded-lg">
  <button className={cn(
    'px-4 py-2 text-sm font-medium rounded-md transition-colors',
    isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
  )}>
    Tab Label
  </button>
</div>
```

---

## DO's and DON'Ts

### DO ✅
- Use warm cream backgrounds (#FDFCFA)
- Use 1.5px stroke icons
- Keep shadows subtle (0.02-0.04 opacity)
- Use Inter font with proper letter-spacing
- Add transition-all to interactive elements
- Use consistent 8px spacing increments
- Make buttons and cards have generous padding
- Use brand-600 (#16A34A) as primary color
- Test all states (hover, focus, disabled, loading)
- Keep forms clean with proper spacing
- Use white cards on cream backgrounds

### DON'T ❌
- Use pure white (#FFFFFF) for page backgrounds
- Use 2px stroke icons (too chunky)
- Use heavy shadows (> 0.1 opacity)
- Use font weights above 600
- Skip loading/error states
- Use random spacing values
- Make elements feel cramped
- Use gradients, glows, or glassmorphism
- Use icon libraries (Lucide, Heroicons, etc.)
- Use dark mode
- Use pure black for text (use gray-900)
- Use borders heavier than 1px

---

## Quick Reference Classes

### Common Tailwind Combinations
```tsx
// Page background
"min-h-screen bg-cream-50"

// Card
"bg-white border border-border-light rounded-xl"

// Card with hover
"bg-white border border-border-light rounded-xl transition-all hover:border-border hover:shadow-md hover:-translate-y-0.5 cursor-pointer"

// Button primary
"inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 shadow-sm transition-all disabled:opacity-50"

// Input
"w-full px-3 py-2.5 text-sm bg-white border border-border rounded-lg placeholder:text-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"

// Label
"block text-sm font-medium text-gray-700 mb-1.5"

// Section title
"text-lg font-semibold text-gray-900"

// Body text
"text-sm text-gray-600"

// Secondary text
"text-sm text-gray-500"

// Muted text
"text-xs text-gray-400"

// Badge (success)
"inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-brand-50 text-brand-700 border border-brand-100"

// Divider
"border-t border-border-light"

// Avatar placeholder
"w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-medium"

// Stat card value
"text-2xl font-semibold text-gray-900"

// Stat card label
"text-sm text-gray-500"
```

---

## Reference Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | This file - main reference |
| `KICKSTART.md` | Complete code for all features |
| `SCHEMA.sql` | Database schema |
| `API_REFERENCE.md` | API endpoints |
| `COMPONENTS.md` | Component specs |
| `FLOWS.md` | User flows |

---

## Quick Start

```bash
# 1. Open project in Cursor
# 2. Tell Cursor to read CLAUDE.md first
# 3. Execute KICKSTART.md phases

> Read CLAUDE.md thoroughly, then execute KICKSTART.md from Phase 0 through Phase 34. 
> Test after each phase. If unsure about anything, ask me.
```

**Let's build something great.**
