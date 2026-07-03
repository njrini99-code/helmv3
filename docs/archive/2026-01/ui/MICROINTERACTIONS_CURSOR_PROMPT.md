# Helm Micro-Interactions — Targeted Cursor Prompt

Read this file and implement the missing micro-interactions for this Next.js app. The foundation (motion tokens, buttons, toasts, validated inputs) already exists. Focus on the specific gaps below.

---

## WHAT'S ALREADY DONE (Don't Touch)
- `src/lib/motion.ts` — Motion tokens ✅
- `src/components/ui/button.tsx` — Hover/active/loading ✅
- `src/components/ui/validated-input.tsx` — Animated validation ✅
- `src/components/ui/toast-notification.tsx` — Slide animations ✅
- `src/components/ui/skeleton.tsx` — Loading skeletons ✅
- `src/components/layout/sidebar.tsx` — Collapse + active states ✅
- `src/components/features/pipeline-card.tsx` — Drag + hover ✅

---

## TASK 1: Add Framer Motion Enter/Exit to Modals

**Files to update:**
- `src/components/ui/modal.tsx`
- `src/components/coach/PlayerDetailModal.tsx`
- `src/components/coach/NewConversationModal.tsx`
- Any other modal components

**Pattern to apply:**
```tsx
import { motion, AnimatePresence } from 'framer-motion';

// Backdrop
<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
      onClick={onClose}
    />
  )}
</AnimatePresence>

// Modal panel
<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      transition={{ duration: 0.2, ease: [0.33, 1, 0.68, 1] }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Modal content */}
    </motion.div>
  )}
</AnimatePresence>
```

---

## TASK 2: Add Table Row Hover States

**Files to update:**
- `src/components/ui/data-table.tsx`
- `src/components/ui/player-row.tsx`
- Any table in dashboard pages

**Pattern to apply:**
```tsx
<tr
  className={cn(
    "transition-colors duration-150",
    "hover:bg-slate-50",
    isSelected && "bg-green-50 hover:bg-green-100"
  )}
>
```

For selectable rows:
```tsx
<tr
  onClick={() => onSelect(id)}
  className={cn(
    "cursor-pointer transition-all duration-150",
    "hover:bg-slate-50",
    isSelected && "bg-green-50 ring-1 ring-inset ring-green-500/20"
  )}
>
```

---

## TASK 3: Add Dropdown/Select Animations

**Files to update:**
- `src/components/ui/select.tsx`
- Any custom dropdown components

**Pattern to apply:**
```tsx
<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15, ease: [0.33, 1, 0.68, 1] }}
      className="absolute top-full mt-1 w-full bg-white rounded-lg shadow-lg border py-1 z-50"
    >
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => handleSelect(option)}
          className={cn(
            "w-full px-3 py-2 text-left text-sm",
            "transition-colors duration-100",
            "hover:bg-slate-50",
            selected === option.value && "bg-green-50 text-green-700"
          )}
        >
          {option.label}
        </button>
      ))}
    </motion.div>
  )}
</AnimatePresence>
```

---

## TASK 4: Add Nav Item Active Indicator Animation

**File to update:**
- `src/components/navigation/nav-item.tsx`

**Pattern to apply (shared layout animation):**
```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface NavItemProps {
  href: string;
  icon: LucideIcon;
  label: string;
}

export function NavItem({ href, icon: Icon, label }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium',
        'transition-colors duration-150',
        isActive
          ? 'text-green-700'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      )}
    >
      {/* Animated background for active state */}
      {isActive && (
        <motion.div
          layoutId="nav-active-bg"
          className="absolute inset-0 bg-green-50 rounded-xl"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}
      <Icon className={cn('h-5 w-5 relative z-10', isActive ? 'text-green-600' : 'text-slate-400')} />
      <span className="relative z-10">{label}</span>
    </Link>
  );
}
```

---

## TASK 5: Add Progress Bar Component

**File to create:**
- `src/components/ui/progress-bar.tsx`

```tsx
'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number;
  max?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function ProgressBar({ 
  value, 
  max = 100, 
  showLabel, 
  size = 'md',
  className 
}: ProgressBarProps) {
  const percent = Math.min(Math.max((value / max) * 100, 0), 100);
  
  return (
    <div className={cn('space-y-1', className)}>
      {showLabel && (
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Progress</span>
          <span className="font-medium text-slate-900 tabular-nums">
            {Math.round(percent)}%
          </span>
        </div>
      )}
      <div className={cn(
        'bg-slate-200 rounded-full overflow-hidden',
        size === 'sm' ? 'h-1.5' : 'h-2'
      )}>
        <motion.div
          className="h-full bg-green-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
        />
      </div>
    </div>
  );
}
```

---

## TASK 6: Add Chart Tooltip Component

**File to update:**
- `src/components/charts/chart-tooltip.tsx`

```tsx
'use client';

import { motion } from 'framer-motion';

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string }>;
  label?: string;
}

export function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm"
    >
      {label && <p className="font-medium mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="text-slate-300">
          <span 
            className="inline-block w-2 h-2 rounded-full mr-2"
            style={{ backgroundColor: entry.color || '#16A34A' }}
          />
          {entry.name}: <span className="text-white font-medium">{entry.value}</span>
        </p>
      ))}
    </motion.div>
  );
}

// Usage with Recharts:
// <Tooltip content={<ChartTooltip />} />
```

---

## TASK 7: Add Empty State Animation

**File to update:**
- `src/components/ui/empty-state.tsx`

```tsx
'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn('flex flex-col items-center justify-center py-12 text-center', className)}
    >
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4"
      >
        <Icon className="h-6 w-6 text-slate-400" />
      </motion.div>
      <h3 className="text-lg font-medium text-slate-900">{title}</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-sm">{description}</p>
      {action && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-4"
        >
          {action}
        </motion.div>
      )}
    </motion.div>
  );
}
```

---

## TASK 8: Add Card Hover Lift to Feature Cards

**Files to check and update if missing hover:**
- `src/components/features/stat-card.tsx`
- `src/components/features/college-card.tsx`
- `src/components/features/player-card.tsx`
- `src/components/ui/card.tsx`

**Pattern to apply:**
```tsx
className={cn(
  "bg-white rounded-xl border border-slate-200 p-4",
  "transition-all duration-200 ease-out",
  "hover:shadow-md hover:-translate-y-0.5",
  // For clickable cards:
  "cursor-pointer active:scale-[0.98]"
)}
```

---

## TASK 9: Add Tooltip Component

**File to check:**
- `src/components/ui/tooltip.tsx`

If not animated, update to:
```tsx
'use client';

import { useState, useRef, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export function Tooltip({ content, children, side = 'top', delay = 200 }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const show = () => {
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
  };

  const hide = () => {
    clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  const positions = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className={cn(
              'absolute z-50 px-2 py-1 text-xs font-medium',
              'bg-slate-900 text-white rounded',
              'whitespace-nowrap pointer-events-none',
              positions[side]
            )}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

---

## TASK 10: Add Shake Animation CSS

**File to update:**
- `src/app/globals.css`

Add if not present:
```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-4px); }
  40%, 80% { transform: translateX(4px); }
}

.animate-shake {
  animation: shake 0.4s ease-in-out;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## IMPLEMENTATION ORDER

1. **globals.css** — Add shake animation + reduced motion (5 min)
2. **Modals** — Add enter/exit animations (15 min)
3. **Dropdowns** — Add open/close animations (10 min)
4. **Tables** — Add row hover states (10 min)
5. **Progress bar** — Create new component (5 min)
6. **Empty state** — Add fade-up animation (5 min)
7. **Cards** — Audit and add hover lift where missing (15 min)
8. **Tooltips** — Add if not animated (10 min)
9. **Nav item** — Add shared layout animation (10 min)
10. **Chart tooltip** — Add animation (5 min)

---

## TIMING REFERENCE

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Hover states | 150ms | ease-out |
| Tooltips | 100-150ms | ease-out |
| Dropdowns | 150ms | ease-out |
| Modals | 200ms | ease-out |
| Empty states | 400ms | smooth |
| Progress bars | 500ms | ease-out |

---

## CONSTRAINTS

- Kelly green: `#16A34A` / `green-600`
- No gamification (no confetti, celebrations)
- Professional tool aesthetic
- All animations under 300ms for UI feedback
- Always respect `prefers-reduced-motion`
