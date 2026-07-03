# Micro-Interactions Usage Guide

This guide shows how to use the newly implemented micro-interactions system across Helm Sports Labs.

## Quick Import

```typescript
// Import all components from single location
import {
  Button,
  ValidatedInput,
  Skeleton,
  Progress,
  toast,
  NavItem,
  MetricCard
} from '@/components/ui';
```

## 1. Button Component

### Basic Usage

```tsx
import { Button } from '@/components/ui/button';

// Primary button (Kelly green)
<Button>Save Changes</Button>

// Secondary button
<Button variant="secondary">Cancel</Button>

// Ghost button
<Button variant="ghost">Learn More</Button>

// Danger button
<Button variant="danger">Delete Account</Button>
```

### With Loading State

```tsx
const [loading, setLoading] = useState(false);

<Button loading={loading} onClick={handleSave}>
  Save Changes
</Button>
```

### Sizes

```tsx
<Button size="sm">Small</Button>
<Button size="md">Medium (default)</Button>
<Button size="lg">Large</Button>
```

**Micro-interactions:**
- ✨ Hover: Lifts -0.5px with shadow glow
- ✨ Active: Scales to 98%
- ✨ Loading: Spinner with text transparency

---

## 2. ValidatedInput Component

### With Error State

```tsx
import { ValidatedInput } from '@/components/ui/validated-input';

const [email, setEmail] = useState('');
const [error, setError] = useState('');

<ValidatedInput
  label="Email Address"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  error={error}
  placeholder="you@example.com"
/>
```

### With Success State

```tsx
<ValidatedInput
  label="Password"
  type="password"
  success={passwordValid}
/>
```

**Micro-interactions:**
- ✨ Focus: Label turns green, border animates to green with ring
- ✨ Error: Icon scales in, border turns red, error message slides down
- ✨ Success: Green checkmark icon scales in

---

## 3. Toast Notifications

### Simple Usage

```tsx
import { toast } from '@/components/ui/toast';

// Success toast
toast.success('Profile updated successfully');

// Error toast
toast.error('Failed to save changes');

// Warning toast
toast.warning('Your session will expire soon');

// Info toast
toast.info('New features available');
```

### With Description

```tsx
toast.success(
  'Profile Updated',
  'Your changes have been saved successfully'
);
```

### Using the Hook

```tsx
import { useToast } from '@/components/ui/toast';

function MyComponent() {
  const { addToast } = useToast();

  const handleAction = () => {
    addToast({
      type: 'success',
      title: 'Action completed',
      description: 'Your request was processed',
      duration: 3000, // Custom duration
    });
  };
}
```

**Micro-interactions:**
- ✨ Entrance: Slides down + scales from 95% + fades in (220ms)
- ✨ Exit: Slides up + scales to 95% + fades out
- ✨ Stack: Smooth layout animation when multiple toasts appear

---

## 4. Skeleton Loaders

### Basic Skeleton

```tsx
import { Skeleton } from '@/components/ui/skeleton';

<Skeleton className="h-8 w-48" />
```

### Table Skeleton

```tsx
import { TableSkeleton } from '@/components/ui/skeleton';

<TableSkeleton rows={5} cols={4} />
```

### Card Skeleton

```tsx
import { CardSkeleton } from '@/components/ui/skeleton';

<CardSkeleton />
```

### Custom Pattern

```tsx
<div className="space-y-4">
  <Skeleton className="h-6 w-1/3" /> {/* Title */}
  <Skeleton className="h-4 w-full" /> {/* Line 1 */}
  <Skeleton className="h-4 w-2/3" /> {/* Line 2 */}
</div>
```

**Micro-interactions:**
- ✨ Subtle pulse animation for loading feedback

---

## 5. Progress Bar

### Basic Usage

```tsx
import { Progress } from '@/components/ui/progress';

<Progress value={75} max={100} />
```

### With Label

```tsx
<Progress value={uploadProgress} showLabel />
```

### Custom Styling

```tsx
<Progress
  value={completionRate}
  showLabel
  className="w-full"
/>
```

**Micro-interactions:**
- ✨ Smooth width animation (500ms with ease-out curve)
- ✨ Spring-based transitions as value changes

---

## 6. Navigation Item

### Basic Usage

```tsx
import { NavItem } from '@/components/navigation/nav-item';
import { Home, Settings, User } from 'lucide-react';

<nav>
  <NavItem href="/dashboard" icon={Home} label="Dashboard" />
  <NavItem href="/settings" icon={Settings} label="Settings" />
  <NavItem href="/profile" icon={User} label="Profile" />
</nav>
```

**Micro-interactions:**
- ✨ Active indicator slides smoothly between items (spring animation)
- ✨ Kelly green highlight for active state
- ✨ Hover states on inactive items

---

## 7. Metric Card (Count-Up)

### Basic Usage

```tsx
import { MetricCard } from '@/components/charts/metric-card';

<MetricCard
  value={1234}
  label="Total Views"
/>
```

### With Prefix/Suffix

```tsx
<MetricCard
  value={99.5}
  label="Completion Rate"
  suffix="%"
/>

<MetricCard
  value={49.99}
  label="Monthly Revenue"
  prefix="$"
/>
```

**Micro-interactions:**
- ✨ Smooth count-up animation when value changes
- ✨ Spring physics (stiffness: 100, damping: 30)
- ✨ Hover shadow effect

---

## 8. Chart Tooltip

### Usage with Recharts

```tsx
import { LineChart, Line, Tooltip } from 'recharts';
import { ChartTooltip } from '@/components/charts/chart-tooltip';

<LineChart data={data}>
  <Line dataKey="value" stroke="#16A34A" />
  <Tooltip content={<ChartTooltip />} />
</LineChart>
```

**Micro-interactions:**
- ✨ Smooth fade + slide animation on appearance
- ✨ Dark background for contrast

---

## Design Principles

### ✅ DO

- Use Kelly green (`#16A34A`) for primary actions
- Keep animations under 300ms for UI feedback
- Respect `prefers-reduced-motion` (built-in)
- Only animate `transform` and `opacity` for performance
- Use timing utilities: `duration-fast` (150ms), `duration-base` (220ms)

### ❌ DON'T

- Don't use celebration/confetti animations (not professional)
- Don't create custom timing curves (use provided utilities)
- Don't animate layout-affecting properties (width, height, padding)
- Don't stack multiple animations on one element
- Don't use animations longer than 500ms for UI feedback

---

## Accessibility

All components include:
- ✅ `prefers-reduced-motion` support
- ✅ Keyboard navigation
- ✅ Focus-visible states
- ✅ ARIA attributes where appropriate
- ✅ Screen reader friendly

---

## Performance

All animations:
- ✅ Use GPU acceleration (`transform`, `opacity`)
- ✅ Avoid layout thrashing
- ✅ Include `will-change` only when necessary
- ✅ Clean up properly (no memory leaks)

---

## Migration from Old Components

### Old Toast Provider Pattern

```tsx
// ❌ OLD (still works for backward compatibility)
import { ToastProvider, useToast } from '@/components/ui/toast';

function App() {
  return (
    <ToastProvider>
      <YourApp />
    </ToastProvider>
  );
}

function Component() {
  const { showToast } = useToast();
  showToast('Message', 'success');
}
```

```tsx
// ✅ NEW (preferred)
import { toast } from '@/components/ui/toast';

function Component() {
  toast.success('Message');
}
```

---

## Complete Example

```tsx
'use client';

import { useState } from 'react';
import {
  Button,
  ValidatedInput,
  Progress,
  toast,
  MetricCard
} from '@/components/ui';

export function ProfileForm() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleSubmit = async () => {
    setLoading(true);

    try {
      // Your API call here
      await updateProfile({ email });
      toast.success('Profile updated', 'Your changes have been saved');
    } catch (err) {
      toast.error('Update failed', 'Please try again');
      setError('Invalid email address');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard value={1234} label="Profile Views" />
        <MetricCard value={89} label="Connections" />
        <MetricCard value={95.5} label="Completion" suffix="%" />
      </div>

      {/* Form */}
      <ValidatedInput
        label="Email Address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
      />

      {uploadProgress > 0 && (
        <Progress value={uploadProgress} showLabel />
      )}

      <div className="flex gap-3">
        <Button variant="secondary">Cancel</Button>
        <Button loading={loading} onClick={handleSubmit}>
          Save Changes
        </Button>
      </div>
    </div>
  );
}
```

---

## Questions?

Refer to:
- `CURSOR_MASTER_PROMPT.md` - Full implementation spec
- `src/lib/motion.ts` - Motion tokens and variants
- Component source files for detailed implementation

---

**Built with ❤️ for Helm Sports Labs**
