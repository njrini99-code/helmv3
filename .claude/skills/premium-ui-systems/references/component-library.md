# Component Library

Systematic patterns for consistent, premium components.

## Button System

### Hierarchy (Critical Rule: ONE primary per section)

```tsx
// PRIMARY - Main action
<button className="
  px-4 py-2 rounded-lg
  bg-gray-900 text-white font-medium
  hover:bg-gray-800
  focus:ring-2 focus:ring-gray-900 focus:ring-offset-2
  transition-all duration-150
  disabled:opacity-50 disabled:cursor-not-allowed
">
  Create Project
</button>

// SECONDARY - Alternative actions
<button className="
  px-4 py-2 rounded-lg
  bg-white border border-gray-300 text-gray-700 font-medium
  hover:bg-gray-50 hover:border-gray-400
  focus:ring-2 focus:ring-gray-900 focus:ring-offset-2
  transition-all duration-150
">
  Cancel
</button>

// TERTIARY/GHOST - Low emphasis
<button className="
  px-4 py-2 rounded-lg
  text-gray-700 font-medium
  hover:bg-gray-100
  focus:ring-2 focus:ring-gray-900 focus:ring-offset-2
  transition-all duration-150
">
  Learn More
</button>

// DESTRUCTIVE - Dangerous actions
<button className="
  px-4 py-2 rounded-lg
  bg-red-600 text-white font-medium
  hover:bg-red-700
  focus:ring-2 focus:ring-red-600 focus:ring-offset-2
  transition-all duration-150
">
  Delete
</button>
```

### Button States

All buttons need these states:
- **Hover**: Visual feedback (bg change, lift)
- **Active**: Pressed state
- **Focus**: Keyboard navigation (ring)
- **Disabled**: Reduced opacity, no pointer
- **Loading**: Spinner, disabled interaction

```tsx
function Button({ loading, disabled, ...props }) {
  return (
    <button
      disabled={disabled || loading}
      className="
        relative px-4 py-2 rounded-lg
        bg-gray-900 text-white
        hover:bg-gray-800
        active:scale-95
        focus:ring-2 focus:ring-gray-900 focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-all duration-150
      "
      {...props}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner className="w-4 h-4 animate-spin" />
        </span>
      )}
      <span className={loading ? 'opacity-0' : ''}>
        {props.children}
      </span>
    </button>
  );
}
```

---

## Card System

### Solid Cards (Default - for content)

```tsx
// BASIC CARD
<div className="
  p-6 rounded-2xl
  border border-gray-200
  bg-white
  shadow-sm
  hover:shadow-md hover:-translate-y-0.5
  transition-all duration-200
">
  <h3 className="text-lg font-semibold mb-2">Card Title</h3>
  <p className="text-gray-600">Card content goes here</p>
</div>

// INTERACTIVE CARD (clickable)
<button className="
  w-full text-left p-6 rounded-2xl
  border border-gray-200
  bg-white
  shadow-sm
  hover:shadow-lg hover:-translate-y-1 hover:border-gray-300
  focus:ring-2 focus:ring-gray-900 focus:ring-offset-2
  transition-all duration-200
">
  <h3 className="text-lg font-semibold mb-2">Clickable Card</h3>
  <p className="text-gray-600">Entire card is interactive</p>
</button>

// KPI CARD (data display)
<div className="
  p-6 rounded-2xl
  border border-gray-200
  bg-white
  shadow-sm
">
  <div className="text-sm text-gray-600 mb-1">Total Revenue</div>
  <div className="text-3xl font-bold mb-2">$45,231</div>
  <div className="flex items-center text-sm">
    <span className="text-green-600 font-medium">↑ 12.5%</span>
    <span className="text-gray-500 ml-2">vs last month</span>
  </div>
</div>
```

### Glass Cards (Chrome only - nav, modals, overlays)

```tsx
// GLASS NAV CARD
<div className="
  p-6 rounded-2xl
  border border-white/20
  backdrop-blur-md bg-white/70
  shadow-sm
  supports-[backdrop-filter]:bg-white/70
  supports-[backdrop-filter]:backdrop-blur-md
">
  Content
</div>

// GLASS MODAL/SHEET
<div className="
  p-6 rounded-2xl
  border border-white/30
  backdrop-blur-lg bg-white/80
  shadow-lg
">
  Modal content on glass, but inputs/tables inside on solid!
</div>
```

**Critical**: Glass cards need:
1. Border highlight (`border-white/20`)
2. Backdrop blur (`backdrop-blur-md`)
3. Translucent bg (`bg-white/70`)
4. Fallback for no backdrop-filter support
5. Test over busiest possible background

---

## Input System

### Text Inputs

```tsx
// STANDARD INPUT
<input
  type="text"
  className="
    w-full px-3 py-2 rounded-lg
    border border-gray-300
    bg-white
    text-gray-900 placeholder-gray-400
    focus:border-gray-900 focus:ring-1 focus:ring-gray-900
    disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
    transition-colors duration-150
  "
  placeholder="Enter text..."
/>

// INPUT WITH LABEL
<label className="block">
  <span className="text-sm font-medium text-gray-700 mb-1.5 block">
    Email Address
  </span>
  <input
    type="email"
    className="w-full px-3 py-2 rounded-lg border border-gray-300
               focus:border-gray-900 focus:ring-1 focus:ring-gray-900
               transition-colors"
  />
</label>

// INPUT WITH ERROR
<label className="block">
  <span className="text-sm font-medium text-gray-700 mb-1.5 block">
    Password
  </span>
  <input
    type="password"
    className="w-full px-3 py-2 rounded-lg border border-red-500
               focus:border-red-500 focus:ring-1 focus:ring-red-500
               transition-colors"
    aria-invalid="true"
    aria-describedby="password-error"
  />
  <p id="password-error" className="mt-1.5 text-sm text-red-600">
    Password must be at least 8 characters
  </p>
</label>
```

### Select / Dropdown

```tsx
<select className="
  w-full px-3 py-2 rounded-lg
  border border-gray-300
  bg-white
  text-gray-900
  focus:border-gray-900 focus:ring-1 focus:ring-gray-900
  transition-colors
">
  <option>Option 1</option>
  <option>Option 2</option>
</select>
```

### Checkbox / Radio

```tsx
// CHECKBOX
<label className="flex items-center gap-2 cursor-pointer">
  <input
    type="checkbox"
    className="
      w-4 h-4 rounded
      border-gray-300
      text-gray-900
      focus:ring-2 focus:ring-gray-900
    "
  />
  <span className="text-sm text-gray-700">Accept terms</span>
</label>

// RADIO
<label className="flex items-center gap-2 cursor-pointer">
  <input
    type="radio"
    name="option"
    className="
      w-4 h-4
      border-gray-300
      text-gray-900
      focus:ring-2 focus:ring-gray-900
    "
  />
  <span className="text-sm text-gray-700">Option A</span>
</label>
```

---

## Table System

### Data Table (Always solid background)

```tsx
<div className="overflow-x-auto rounded-lg border border-gray-200">
  <table className="w-full bg-white">
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
          Name
        </th>
        <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
          Status
        </th>
        <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
          Actions
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-200">
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3 text-sm text-gray-900">John Doe</td>
        <td className="px-4 py-3 text-sm">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Active
          </span>
        </td>
        <td className="px-4 py-3 text-sm">
          <button className="text-gray-600 hover:text-gray-900">Edit</button>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### Table with Sticky Header

```tsx
<div className="max-h-96 overflow-auto rounded-lg border border-gray-200">
  <table className="w-full bg-white">
    <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
      {/* headers */}
    </thead>
    <tbody>
      {/* rows */}
    </tbody>
  </table>
</div>
```

---

## Modal System

```tsx
// MODAL BACKDROP + PANEL
<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
  {/* Backdrop */}
  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
  
  {/* Modal Panel */}
  <div className="
    relative z-10 w-full max-w-lg
    p-6 rounded-2xl
    bg-white border border-gray-200
    shadow-xl
  ">
    {/* Header */}
    <div className="flex items-start justify-between mb-4">
      <h2 className="text-xl font-semibold">Modal Title</h2>
      <button className="text-gray-400 hover:text-gray-600">
        <XIcon className="w-5 h-5" />
      </button>
    </div>
    
    {/* Content */}
    <div className="mb-6">
      <p className="text-gray-600">Modal content goes here</p>
    </div>
    
    {/* Actions */}
    <div className="flex gap-3 justify-end">
      <button className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50">
        Cancel
      </button>
      <button className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800">
        Confirm
      </button>
    </div>
  </div>
</div>
```

---

## Badge / Tag System

```tsx
// STATUS BADGES
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
  Active
</span>

<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
  Pending
</span>

<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
  Error
</span>

<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
  Inactive
</span>
```

---

## Toast / Notification System

```tsx
// SUCCESS TOAST
<div className="
  p-4 rounded-lg
  bg-green-50 border border-green-200
  shadow-md
  flex items-start gap-3
">
  <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0" />
  <div className="flex-1">
    <p className="text-sm font-medium text-green-900">Success!</p>
    <p className="text-sm text-green-700 mt-1">Your changes have been saved.</p>
  </div>
  <button className="text-green-600 hover:text-green-800">
    <XIcon className="w-5 h-5" />
  </button>
</div>

// ERROR TOAST
<div className="
  p-4 rounded-lg
  bg-red-50 border border-red-200
  shadow-md
  flex items-start gap-3
">
  <XCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0" />
  <div className="flex-1">
    <p className="text-sm font-medium text-red-900">Error</p>
    <p className="text-sm text-red-700 mt-1">Something went wrong.</p>
  </div>
</div>
```

---

## Loading States

```tsx
// SPINNER
<svg className="animate-spin h-5 w-5 text-gray-900" viewBox="0 0 24 24">
  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
</svg>

// SKELETON LOADER
<div className="space-y-3">
  <div className="h-4 bg-gray-200 rounded animate-pulse" />
  <div className="h-4 bg-gray-200 rounded animate-pulse w-5/6" />
  <div className="h-4 bg-gray-200 rounded animate-pulse w-4/6" />
</div>

// LOADING OVERLAY
<div className="relative">
  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10">
    <Spinner className="w-8 h-8 text-gray-900" />
  </div>
  {/* Content being loaded */}
</div>
```

---

## Empty States

```tsx
<div className="flex flex-col items-center justify-center py-12 text-center">
  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
    <InboxIcon className="w-8 h-8 text-gray-400" />
  </div>
  <h3 className="text-lg font-medium text-gray-900 mb-2">No messages yet</h3>
  <p className="text-sm text-gray-600 mb-6 max-w-sm">
    When you receive messages, they'll appear here.
  </p>
  <button className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800">
    Send Your First Message
  </button>
</div>
```

---

## Critical Component Rules

1. **Button hierarchy**: ONE primary per section
2. **Solid backgrounds**: All data (tables, forms) on solid, never glass
3. **Focus states**: All interactive elements need visible focus rings
4. **Loading states**: Buttons, overlays, skeleton loaders
5. **Error states**: Forms need error feedback
6. **Empty states**: Lists/tables need empty state design
7. **Touch targets**: Minimum 44×44px for interactive elements
8. **Hover feedback**: All clickable elements need hover state
9. **Disabled states**: Visual + cursor change + no interaction
10. **Reduced motion**: Support `prefers-reduced-motion`
