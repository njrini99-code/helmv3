# Helm Sports Labs - UI System

> Complete design system specifications for building the Helm Sports Labs platform.

---

## Design Philosophy

**Clean, professional, modern.** This should feel like Linear, Mercury, or Notion - not a generic sports template.

Key principles:
1. **Restraint** - Kelly Green is the only accent color. Everything else is neutral.
2. **Clarity** - Information hierarchy through typography and spacing, not color.
3. **Polish** - Subtle shadows, smooth transitions, consistent spacing.
4. **Functionality** - Every element has a purpose. No decoration for decoration's sake.

---

## Color Palette

### Primary (Kelly Green)

| Name | Hex | Usage |
|------|-----|-------|
| `primary-50` | `#F0FDF4` | Hover backgrounds, subtle highlights |
| `primary-100` | `#DCFCE7` | Badge backgrounds, progress bars |
| `primary-200` | `#BBF7D0` | Light accents |
| `primary-500` | `#22C55E` | Secondary green (icons) |
| `primary-600` | `#16A34A` | **Primary** - Buttons, links, active states |
| `primary-700` | `#15803D` | Hover state for primary |
| `primary-800` | `#166534` | Active/pressed state |

### Backgrounds

| Name | Hex | Usage |
|------|-----|-------|
| `bg-cream` | `#FAF6F1` | Page background |
| `bg-white` | `#FFFFFF` | Card backgrounds |

### Text

| Name | Hex | Usage |
|------|-----|-------|
| `text-dark` | `#1C1917` | Headings, primary text |
| `text-medium` | `#57534E` | Body text, descriptions |
| `text-light` | `#78716C` | Muted text, captions |
| `text-placeholder` | `#A8A29E` | Input placeholders |

### Borders

| Name | Hex | Usage |
|------|-----|-------|
| `border-default` | `#E7E5E4` | Card borders, dividers |
| `border-light` | `#F5F5F4` | Subtle separators |
| `border-focus` | `#16A34A` | Focus rings |

### Status (Functional Only)

| Name | Hex | Usage |
|------|-----|-------|
| `error` | `#DC2626` | Error text, destructive actions |
| `error-light` | `#FEE2E2` | Error backgrounds |
| `success` | `#16A34A` | Success states (same as primary) |

---

## Typography

### Font Stack

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

### Scale

| Name | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| `h1` | 32px | 700 | 1.2 | Page titles |
| `h2` | 24px | 600 | 1.3 | Section titles |
| `h3` | 20px | 600 | 1.4 | Card titles |
| `h4` | 16px | 600 | 1.4 | Subsection titles |
| `body` | 14px | 400 | 1.5 | Default text |
| `body-sm` | 13px | 400 | 1.5 | Secondary text |
| `caption` | 12px | 500 | 1.4 | Labels, captions |
| `overline` | 11px | 600 | 1.3 | Overlines, tags |

### Tailwind Classes

```html
<!-- Headings -->
<h1 class="text-3xl font-bold text-stone-900">Page Title</h1>
<h2 class="text-2xl font-semibold text-stone-900">Section</h2>
<h3 class="text-xl font-semibold text-stone-900">Card Title</h3>

<!-- Body -->
<p class="text-sm text-stone-600">Body text</p>
<p class="text-xs text-stone-500">Caption text</p>

<!-- Labels -->
<span class="text-xs font-medium uppercase tracking-wide text-stone-500">
  Label
</span>
```

---

## Spacing

### Scale

```
4px   = 1    (space-1)
8px   = 2    (space-2)
12px  = 3    (space-3)
16px  = 4    (space-4)
20px  = 5    (space-5)
24px  = 6    (space-6)
32px  = 8    (space-8)
40px  = 10   (space-10)
48px  = 12   (space-12)
64px  = 16   (space-16)
```

### Usage Guidelines

| Context | Spacing |
|---------|---------|
| Inside cards | 20-24px padding |
| Between cards | 16-24px gap |
| Section spacing | 32-48px |
| Page margins | 24-32px |
| Form field gaps | 16px |
| Button padding | 12px vertical, 20px horizontal |

---

## Border Radius

| Name | Value | Usage |
|------|-------|-------|
| `rounded-sm` | 6px | Small elements, badges |
| `rounded-md` | 8px | Buttons, inputs |
| `rounded-lg` | 12px | Cards, dropdowns |
| `rounded-xl` | 16px | Large cards |
| `rounded-2xl` | 20px | Main content cards |
| `rounded-full` | 9999px | Avatars, pills |

---

## Shadows

```css
/* Subtle - inputs, small cards */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);

/* Default - cards at rest */
--shadow-md: 0 2px 8px rgba(0, 0, 0, 0.06);

/* Elevated - cards on hover, dropdowns */
--shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.08);

/* High - modals, popovers */
--shadow-xl: 0 8px 32px rgba(0, 0, 0, 0.10);
```

### Tailwind

```html
<div class="shadow-sm">Subtle</div>
<div class="shadow-md">Default</div>
<div class="shadow-lg">Elevated</div>
<div class="shadow-xl">High</div>
```

---

## Components

### Button

```tsx
// Primary
<button className="
  bg-green-600 text-white
  px-5 py-2.5 rounded-lg
  font-medium text-sm
  hover:bg-green-700
  active:bg-green-800
  disabled:bg-stone-300 disabled:cursor-not-allowed
  transition-colors
">
  Primary Button
</button>

// Secondary
<button className="
  bg-white text-stone-700
  border border-stone-200
  px-5 py-2.5 rounded-lg
  font-medium text-sm
  hover:bg-stone-50 hover:border-stone-300
  transition-colors
">
  Secondary Button
</button>

// Ghost
<button className="
  text-stone-600
  px-3 py-2 rounded-lg
  font-medium text-sm
  hover:bg-stone-100
  transition-colors
">
  Ghost Button
</button>

// Destructive
<button className="
  bg-red-600 text-white
  px-5 py-2.5 rounded-lg
  font-medium text-sm
  hover:bg-red-700
  transition-colors
">
  Delete
</button>

// Icon Button
<button className="
  w-9 h-9 rounded-lg
  flex items-center justify-center
  text-stone-500
  hover:bg-stone-100 hover:text-stone-700
  transition-colors
">
  <Icon className="w-5 h-5" />
</button>
```

**States:**
- Default: As shown
- Hover: Darker background
- Active: Even darker, slight scale(0.98)
- Disabled: Gray, 50% opacity, cursor-not-allowed
- Loading: Spinner replaces content

---

### Input

```tsx
// Default
<input className="
  w-full px-4 py-2.5
  bg-white border border-stone-200 rounded-lg
  text-sm text-stone-900
  placeholder:text-stone-400
  focus:outline-none focus:ring-2 focus:ring-green-600/20 focus:border-green-600
  transition-colors
" />

// With Label
<div className="space-y-1.5">
  <label className="text-sm font-medium text-stone-700">
    Email Address
  </label>
  <input className="..." />
</div>

// With Error
<div className="space-y-1.5">
  <label className="text-sm font-medium text-stone-700">
    Email Address
  </label>
  <input className="
    ... border-red-500 focus:ring-red-500/20 focus:border-red-500
  " />
  <p className="text-xs text-red-600">Please enter a valid email</p>
</div>

// Search
<div className="relative">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
  <input className="... pl-10" placeholder="Search..." />
</div>
```

---

### Card

```tsx
// Default Card
<div className="
  bg-white rounded-2xl
  border border-stone-200
  shadow-md
  p-6
">
  {children}
</div>

// Interactive Card
<div className="
  bg-white rounded-2xl
  border border-stone-200
  shadow-md
  p-6
  hover:shadow-lg hover:-translate-y-0.5
  transition-all duration-200
  cursor-pointer
">
  {children}
</div>

// Glass Card (use sparingly)
<div className="
  bg-white/60 backdrop-blur-xl
  rounded-2xl
  border border-white/50
  shadow-lg
  p-6
">
  {children}
</div>
```

---

### Badge

```tsx
// Default (Gray)
<span className="
  inline-flex items-center
  px-2.5 py-0.5 rounded-full
  text-xs font-medium
  bg-stone-100 text-stone-700
">
  Default
</span>

// Success (Green)
<span className="
  inline-flex items-center
  px-2.5 py-0.5 rounded-full
  text-xs font-medium
  bg-green-100 text-green-700
">
  Active
</span>

// Error (Red)
<span className="
  inline-flex items-center
  px-2.5 py-0.5 rounded-full
  text-xs font-medium
  bg-red-100 text-red-700
">
  Error
</span>
```

---

### Avatar

```tsx
// With Image
<div className="w-10 h-10 rounded-full overflow-hidden bg-stone-100">
  <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
</div>

// Fallback (Initials)
<div className="
  w-10 h-10 rounded-full
  bg-green-100 text-green-700
  flex items-center justify-center
  font-medium text-sm
">
  JS
</div>

// Sizes
<div className="w-8 h-8 ...">Small</div>
<div className="w-10 h-10 ...">Medium</div>
<div className="w-12 h-12 ...">Large</div>
<div className="w-16 h-16 ...">XLarge</div>
```

---

### Stat Card

```tsx
<div className="bg-white rounded-2xl border border-stone-200 shadow-md p-5">
  <div className="flex items-center gap-4">
    {/* Icon */}
    <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
      <Users className="w-6 h-6 text-green-600" />
    </div>
    
    {/* Content - Right aligned */}
    <div className="flex-1 text-right">
      <p className="text-xs font-medium text-stone-500 mb-1">
        Profile Views
      </p>
      <p className="text-2xl font-bold text-stone-900">
        127
      </p>
      <span className="inline-flex items-center text-xs font-medium text-green-600 mt-1">
        <ArrowUp className="w-3 h-3 mr-0.5" />
        23%
      </span>
    </div>
  </div>
</div>
```

---

### Player Card

```tsx
<div className="
  bg-white rounded-2xl border border-stone-200 shadow-md
  p-4
  hover:shadow-lg hover:-translate-y-0.5
  transition-all duration-200
  cursor-pointer
">
  {/* Header */}
  <div className="flex items-start gap-3 mb-4">
    <Avatar src={player.avatarUrl} name={player.name} size="lg" />
    <div className="flex-1 min-w-0">
      <h3 className="font-semibold text-stone-900 truncate">
        {player.name}
      </h3>
      <p className="text-sm text-stone-600">
        {player.position} | {player.gradYear}
      </p>
      <p className="text-xs text-stone-500">
        {player.school}, {player.state}
      </p>
    </div>
    <button
      onClick={handleWatchlist}
      className="text-stone-400 hover:text-green-600 transition-colors"
    >
      <Heart className={cn("w-5 h-5", isWatchlisted && "fill-green-600 text-green-600")} />
    </button>
  </div>
  
  {/* Metrics */}
  <div className="grid grid-cols-3 gap-2 mb-4">
    <div className="text-center p-2 bg-stone-50 rounded-lg">
      <p className="text-xs text-stone-500">FB</p>
      <p className="font-semibold text-stone-900">94</p>
    </div>
    <div className="text-center p-2 bg-stone-50 rounded-lg">
      <p className="text-xs text-stone-500">ERA</p>
      <p className="font-semibold text-stone-900">1.82</p>
    </div>
    <div className="text-center p-2 bg-stone-50 rounded-lg">
      <p className="text-xs text-stone-500">K/9</p>
      <p className="font-semibold text-stone-900">12.9</p>
    </div>
  </div>
  
  {/* Badges */}
  <div className="flex gap-2">
    {player.hasVideo && (
      <Badge variant="default">
        <Video className="w-3 h-3 mr-1" />
        Video
      </Badge>
    )}
    {player.verified && (
      <Badge variant="success">
        <Check className="w-3 h-3 mr-1" />
        Verified
      </Badge>
    )}
  </div>
</div>
```

---

### Tabs

```tsx
<div className="border-b border-stone-200">
  <nav className="flex gap-6">
    {tabs.map(tab => (
      <button
        key={tab.id}
        onClick={() => setActiveTab(tab.id)}
        className={cn(
          "py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
          activeTab === tab.id
            ? "border-green-600 text-green-600"
            : "border-transparent text-stone-600 hover:text-stone-900"
        )}
      >
        {tab.label}
      </button>
    ))}
  </nav>
</div>
```

---

### Modal

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center">
  {/* Backdrop */}
  <div 
    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
    onClick={onClose}
  />
  
  {/* Content */}
  <div className="
    relative bg-white rounded-2xl shadow-xl
    w-full max-w-lg mx-4
    max-h-[90vh] overflow-auto
  ">
    {/* Header */}
    <div className="flex items-center justify-between p-6 border-b border-stone-200">
      <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
      <button
        onClick={onClose}
        className="text-stone-400 hover:text-stone-600 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
    
    {/* Body */}
    <div className="p-6">
      {children}
    </div>
    
    {/* Footer */}
    <div className="flex justify-end gap-3 p-6 border-t border-stone-200">
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button variant="primary" onClick={onConfirm}>Confirm</Button>
    </div>
  </div>
</div>
```

---

### Sidebar

```tsx
<aside className="
  fixed left-0 top-0 bottom-0
  w-64 bg-white border-r border-stone-200
  flex flex-col
">
  {/* Logo */}
  <div className="p-6 border-b border-stone-200">
    <Logo />
  </div>
  
  {/* Mode Toggle (if applicable) */}
  <div className="p-4">
    <ModeToggle mode={mode} onChange={setMode} />
  </div>
  
  {/* Navigation */}
  <nav className="flex-1 p-4 space-y-1 overflow-auto">
    {navItems.map(item => (
      <NavItem
        key={item.href}
        href={item.href}
        icon={item.icon}
        label={item.label}
        active={pathname === item.href}
        badge={item.badge}
      />
    ))}
  </nav>
  
  {/* User */}
  <div className="p-4 border-t border-stone-200">
    <UserMenu user={user} />
  </div>
</aside>
```

---

### Mode Toggle

```tsx
<div className="
  flex p-1 bg-stone-100 rounded-lg
">
  <button
    onClick={() => setMode('recruiting')}
    className={cn(
      "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all",
      mode === 'recruiting'
        ? "bg-green-600 text-white shadow-sm"
        : "text-stone-600 hover:text-stone-900"
    )}
  >
    Recruiting
  </button>
  <button
    onClick={() => setMode('team')}
    className={cn(
      "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all",
      mode === 'team'
        ? "bg-green-600 text-white shadow-sm"
        : "text-stone-600 hover:text-stone-900"
    )}
  >
    Team
  </button>
</div>
```

---

### Empty State

```tsx
<div className="flex flex-col items-center justify-center py-16 text-center">
  <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-4">
    <Icon className="w-8 h-8 text-stone-400" />
  </div>
  <h3 className="text-lg font-semibold text-stone-900 mb-2">
    {title}
  </h3>
  <p className="text-sm text-stone-600 mb-6 max-w-sm">
    {description}
  </p>
  <Button variant="primary" onClick={onAction}>
    {actionLabel}
  </Button>
</div>

// Examples:
// Watchlist empty: "No players yet" + "Find your first recruit"
// Messages empty: "No messages" + "Start a conversation"
// Results empty: "No players match your filters" + "Clear filters"
```

---

### Skeleton

```tsx
// Text skeleton
<div className="h-4 bg-stone-200 rounded animate-pulse w-32" />

// Avatar skeleton
<div className="w-10 h-10 bg-stone-200 rounded-full animate-pulse" />

// Card skeleton
<div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-4">
  <div className="flex items-center gap-4">
    <div className="w-12 h-12 bg-stone-200 rounded-full animate-pulse" />
    <div className="space-y-2 flex-1">
      <div className="h-4 bg-stone-200 rounded animate-pulse w-24" />
      <div className="h-3 bg-stone-200 rounded animate-pulse w-32" />
    </div>
  </div>
  <div className="space-y-2">
    <div className="h-4 bg-stone-200 rounded animate-pulse" />
    <div className="h-4 bg-stone-200 rounded animate-pulse w-3/4" />
  </div>
</div>
```

---

### Toast

```tsx
// Success
<div className="
  flex items-center gap-3 
  bg-white rounded-lg shadow-lg border border-stone-200
  px-4 py-3
">
  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
    <Check className="w-4 h-4 text-green-600" />
  </div>
  <p className="text-sm font-medium text-stone-900">Added to watchlist</p>
</div>

// Error
<div className="
  flex items-center gap-3 
  bg-white rounded-lg shadow-lg border border-red-200
  px-4 py-3
">
  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
    <X className="w-4 h-4 text-red-600" />
  </div>
  <div>
    <p className="text-sm font-medium text-stone-900">Failed to save</p>
    <p className="text-xs text-stone-500">Please try again</p>
  </div>
</div>
```

---

## Animations

### Transitions

```css
/* Default transition for interactive elements */
transition-colors duration-150

/* For transforms (hover lifts) */
transition-all duration-200

/* For modals/drawers */
transition-all duration-300
```

### Framer Motion Presets

```tsx
// Page transition
const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

// Stagger children
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

// Scale on tap
<motion.button whileTap={{ scale: 0.98 }}>
  Click me
</motion.button>
```

---

## Responsive Breakpoints

| Name | Width | Usage |
|------|-------|-------|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Large desktop |
| `2xl` | 1536px | Extra large |

### Layout Patterns

```tsx
// Desktop: Sidebar + Content
<div className="flex min-h-screen">
  <Sidebar className="hidden lg:block w-64" />
  <main className="flex-1 lg:ml-64">
    {children}
  </main>
</div>

// Mobile: Bottom nav
<div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t">
  <BottomNav />
</div>
```

---

## Icons

Use **Lucide React** exclusively.

```tsx
import { 
  Home,
  Search,
  Users,
  Heart,
  MessageSquare,
  Calendar,
  Video,
  Settings,
  ChevronRight,
  Plus,
  X,
  Check,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

// Default size
<Icon className="w-5 h-5" />

// Small
<Icon className="w-4 h-4" />

// Large
<Icon className="w-6 h-6" />
```

---

## Do's and Don'ts

### Do

✅ Use Kelly Green only for primary actions and highlights
✅ Keep cards clean with adequate whitespace
✅ Use shadows subtly to create depth
✅ Maintain consistent spacing throughout
✅ Use skeletons for loading states
✅ Provide helpful empty states with CTAs
✅ Make touch targets at least 44x44px

### Don't

❌ Use multiple accent colors
❌ Overuse the glass effect
❌ Add decorative elements
❌ Use spinners (use skeletons instead)
❌ Leave dead-end empty states
❌ Forget hover/focus states
❌ Ignore mobile responsiveness
