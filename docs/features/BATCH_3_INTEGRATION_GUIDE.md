# Batch 3: Navigation & Layout - Integration Guide

This guide explains how to integrate the new Batch 3 navigation components into your Helm Sports Labs application.

## 📦 Components Overview

| Component | File | Purpose |
|-----------|------|---------|
| DarkSidebar | `dark-sidebar.tsx` | Main desktop navigation sidebar with dark theme |
| DarkHeader | `dark-header.tsx` | Top header with breadcrumbs and user menu |
| PillTabs | `pill-tabs.tsx` | Horizontal tab navigation with pill styling |
| DarkBreadcrumbs | `dark-breadcrumbs.tsx` | Standalone breadcrumb navigation |
| MobileBottomNav | `mobile-bottom-nav.tsx` | Fixed bottom navigation for mobile |
| MobileSidebarDrawer | `mobile-sidebar-drawer.tsx` | Slide-out drawer menu for mobile |
| Pagination | `pagination.tsx` | Page navigation for lists and tables |

---

## 🎨 Design System

All components follow the Batch 3 specification:

### Colors
- **Dark Background**: `#1C1917` (warm-900)
- **Glass Header**: `bg-white/80 backdrop-blur-xl`
- **Primary Green**: `#16A34A` (primary-600)
- **Borders**: `border-warm-200` or `border-white/10` (dark)
- **Text**: `text-warm-900` (headings), `text-warm-600` (body)

### Spacing
- **Header Height**: `h-16` (64px)
- **Sidebar Width**: `260px` expanded, `72px` collapsed
- **Border Radius**: `rounded-lg` (10px) for buttons, `rounded-[10px]` for nav items

---

## 🚀 Quick Start

### 1. Dashboard Layout with Sidebar & Header

Create a dashboard layout that includes the dark sidebar and header:

```tsx
// app/(dashboard)/layout.tsx
'use client';

import { DarkSidebar } from '@/components/layout/dark-sidebar';
import { DarkHeader } from '@/components/layout/dark-header';
import { MobileSidebarDrawer } from '@/components/layout/mobile-sidebar-drawer';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import { useState } from 'react';
import { HomeIcon, UsersIcon, CalendarIcon, MessageSquareIcon } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navSections = [
    {
      label: 'Main',
      items: [
        { label: 'Dashboard', href: '/dashboard', icon: HomeIcon },
        { label: 'Roster', href: '/dashboard/roster', icon: UsersIcon },
        { label: 'Calendar', href: '/dashboard/calendar', icon: CalendarIcon },
        { label: 'Messages', href: '/dashboard/messages', icon: MessageSquareIcon, badge: 3 },
      ],
    },
  ];

  const mobileNavItems = [
    { label: 'Home', href: '/dashboard', icon: HomeIcon },
    { label: 'Roster', href: '/dashboard/roster', icon: UsersIcon },
    { label: 'Calendar', href: '/dashboard/calendar', icon: CalendarIcon },
    { label: 'Messages', href: '/dashboard/messages', icon: MessageSquareIcon, badge: 3 },
  ];

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      {/* Desktop Sidebar */}
      <DarkSidebar sport="baseball" role="coach" />

      {/* Mobile Drawer */}
      <MobileSidebarDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        sport="baseball"
        role="coach"
        sections={navSections}
      />

      {/* Main Content */}
      <div className="lg:ml-[260px]">
        {/* Header */}
        <DarkHeader onMobileMenuToggle={() => setMobileMenuOpen(true)} />

        {/* Page Content */}
        <main className="pb-20 lg:pb-0">{children}</main>
      </div>

      {/* Mobile Bottom Nav */}
      <MobileBottomNav items={mobileNavItems} />
    </div>
  );
}
```

---

### 2. Using Pill Tabs

Add horizontal tab navigation within a page:

```tsx
// app/(dashboard)/dashboard/players/page.tsx
'use client';

import { PillTabs } from '@/components/layout/pill-tabs';
import { useState } from 'react';

export default function PlayersPage() {
  const [activeTab, setActiveTab] = useState('all');

  return (
    <div className="p-6">
      <PillTabs
        tabs={[
          { label: 'All Players', value: 'all', count: 24 },
          { label: 'Active', value: 'active', count: 18 },
          { label: 'Archived', value: 'archived', count: 6 },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Tab content based on activeTab */}
      <div className="mt-6">
        {activeTab === 'all' && <AllPlayersView />}
        {activeTab === 'active' && <ActivePlayersView />}
        {activeTab === 'archived' && <ArchivedPlayersView />}
      </div>
    </div>
  );
}
```

#### Href-based Tabs (for navigation)

```tsx
<PillTabs
  tabs={[
    { label: 'Overview', value: 'overview', href: '/dashboard/overview' },
    { label: 'Stats', value: 'stats', href: '/dashboard/stats' },
    { label: 'Videos', value: 'videos', href: '/dashboard/videos' },
  ]}
/>
```

---

### 3. Standalone Breadcrumbs

Use breadcrumbs independently from the header:

```tsx
import { DarkBreadcrumbs } from '@/components/layout/dark-breadcrumbs';
import { HomeIcon } from 'lucide-react';

// Auto-generate from pathname
<DarkBreadcrumbs />

// Custom breadcrumbs
<DarkBreadcrumbs
  items={[
    { label: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    { label: 'Players', href: '/dashboard/players' },
    { label: 'John Doe' },
  ]}
/>

// Without home link
<DarkBreadcrumbs showHome={false} />

// With slash separator
<DarkBreadcrumbs separator="slash" />
```

---

### 4. Pagination

Add pagination to lists and tables:

```tsx
import { Pagination, CompactPagination } from '@/components/layout/pagination';
import { useState } from 'react';

export default function PlayersList() {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = 20;

  return (
    <div>
      {/* Your list/table content */}
      <PlayerTable page={currentPage} />

      {/* Desktop pagination */}
      <div className="hidden md:block mt-6">
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          showFirstLast
        />
      </div>

      {/* Mobile pagination */}
      <div className="md:hidden mt-6">
        <CompactPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  );
}
```

---

## 📱 Mobile Responsiveness

### Viewport Breakpoints

- **Mobile**: `< 1024px` (lg breakpoint)
- **Desktop**: `>= 1024px`

### Mobile Navigation Strategy

1. **Hide desktop sidebar** on mobile: `hidden lg:flex`
2. **Show mobile drawer** when menu button clicked
3. **Show bottom nav** on mobile: `lg:hidden`
4. **Add bottom padding** to content: `pb-20 lg:pb-0`

### Example Mobile Setup

```tsx
<div className="min-h-screen">
  {/* Desktop sidebar - hidden on mobile */}
  <DarkSidebar sport="baseball" role="coach" />

  <div className="lg:ml-[260px]">
    {/* Header with mobile menu button */}
    <DarkHeader onMobileMenuToggle={() => setOpen(true)} />

    {/* Content with mobile bottom padding */}
    <main className="pb-20 lg:pb-0">{children}</main>
  </div>

  {/* Mobile drawer */}
  <MobileSidebarDrawer {...props} />

  {/* Mobile bottom nav */}
  <MobileBottomNav items={navItems} />
</div>
```

---

## 🎯 Component Props Reference

### DarkSidebar

```tsx
interface DarkSidebarProps {
  sport: 'baseball' | 'golf';
  role: 'coach' | 'player';
}
```

### DarkHeader

```tsx
interface DarkHeaderProps {
  onMobileMenuToggle?: () => void;
}
```

### PillTabs

```tsx
interface PillTabsProps {
  tabs: PillTab[];
  activeTab?: string;
  onChange?: (value: string) => void;
  variant?: 'default' | 'compact';
  className?: string;
}

interface PillTab {
  label: string;
  value: string;
  href?: string;
  count?: number;
  icon?: React.ComponentType<{ className?: string }>;
}
```

### MobileBottomNav

```tsx
interface MobileBottomNavProps {
  items: MobileNavItem[];
  className?: string;
}

interface MobileNavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}
```

### MobileSidebarDrawer

```tsx
interface MobileSidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  sport: 'baseball' | 'golf';
  role: 'coach' | 'player';
  sections: NavSection[];
  className?: string;
}
```

### Pagination

```tsx
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showFirstLast?: boolean;
  maxVisible?: number;
  className?: string;
}
```

---

## ✅ Best Practices

### 1. Consistent Spacing

```tsx
// Page padding
<div className="p-6">

// Section spacing
<div className="space-y-6">

// Card spacing
<div className="bg-white rounded-2xl p-6">
```

### 2. Active States

All navigation components automatically handle active states based on pathname:

```tsx
// DarkSidebar, DarkHeader, MobileBottomNav
// Automatically detect active route from usePathname()

// PillTabs - two options:
// Option 1: State-based (for view switching)
<PillTabs activeTab={activeTab} onChange={setActiveTab} />

// Option 2: Href-based (for navigation)
<PillTabs tabs={[{ href: '/page', ... }]} />
```

### 3. Mobile-First

Always include mobile navigation:

```tsx
// ✅ Good - includes mobile nav
<DarkSidebar />
<MobileSidebarDrawer />
<MobileBottomNav />

// ❌ Bad - desktop only
<DarkSidebar />
```

### 4. Accessibility

All components include:
- ARIA labels
- Keyboard navigation
- Focus states
- Screen reader support

```tsx
// Example: Mobile menu button
<button
  onClick={onMobileMenuToggle}
  aria-label="Toggle menu"
>
```

---

## 🔧 Customization

### Changing Colors

Update Tailwind config for custom colors:

```js
// tailwind.config.ts
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          600: '#16A34A', // Your brand color
        },
        warm: {
          // Your warm palette
        },
      },
    },
  },
};
```

### Custom Nav Sections

Create dynamic nav based on user role:

```tsx
const getNavSections = (role: string) => {
  if (role === 'coach') {
    return [
      {
        label: 'Recruiting',
        items: [
          { label: 'Discover', href: '/discover', icon: SearchIcon },
          { label: 'Watchlist', href: '/watchlist', icon: StarIcon },
        ],
      },
    ];
  }

  return [
    {
      label: 'Player',
      items: [
        { label: 'Journey', href: '/journey', icon: TrophyIcon },
      ],
    },
  ];
};
```

---

## 🐛 Troubleshooting

### Sidebar not showing

- Check: `hidden lg:flex` class on sidebar
- Check: `lg:ml-[260px]` on content wrapper
- Verify: sidebar width matches margin-left value

### Mobile drawer not closing

- Ensure `onClose` prop is provided
- Check: drawer closes on route change (built-in)
- Verify: backdrop click handler works

### Breadcrumbs not updating

- Component uses `usePathname()` from Next.js
- Ensure component is Client Component (`'use client'`)
- Check: route group folders like `(dashboard)` are filtered

### Pagination not working

- Verify: `currentPage` and `totalPages` props are correct
- Check: `onPageChange` callback updates state
- Ensure: `currentPage` is between 1 and `totalPages`

---

## 📚 Additional Resources

- **CLAUDE.md**: Full project documentation
- **UI_UX_PREMIUM_AUDIT_REPORT.md**: Design specifications
- **Component Source**: `/src/components/layout/`

---

## 🎉 Complete Example

Here's a full working example with all components:

```tsx
// app/(dashboard)/layout.tsx
'use client';

import { useState } from 'react';
import { DarkSidebar } from '@/components/layout/dark-sidebar';
import { DarkHeader } from '@/components/layout/dark-header';
import { MobileSidebarDrawer } from '@/components/layout/mobile-sidebar-drawer';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import {
  HomeIcon,
  UsersIcon,
  CalendarIcon,
  MessageSquareIcon,
  BarChart3Icon,
  TrophyIcon,
  SettingsIcon,
} from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navSections = [
    {
      label: 'Main',
      items: [
        { label: 'Dashboard', href: '/dashboard', icon: HomeIcon },
        { label: 'Roster', href: '/dashboard/roster', icon: UsersIcon },
        { label: 'Calendar', href: '/dashboard/calendar', icon: CalendarIcon },
        { label: 'Messages', href: '/dashboard/messages', icon: MessageSquareIcon, badge: 3 },
      ],
    },
    {
      label: 'Management',
      items: [
        { label: 'Statistics', href: '/dashboard/stats', icon: BarChart3Icon },
        { label: 'Games', href: '/dashboard/games', icon: TrophyIcon },
      ],
    },
  ];

  const mobileNavItems = [
    { label: 'Home', href: '/dashboard', icon: HomeIcon },
    { label: 'Roster', href: '/dashboard/roster', icon: UsersIcon },
    { label: 'Calendar', href: '/dashboard/calendar', icon: CalendarIcon },
    { label: 'Settings', href: '/dashboard/settings', icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      {/* Desktop Sidebar */}
      <DarkSidebar sport="baseball" role="coach" />

      {/* Mobile Drawer */}
      <MobileSidebarDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        sport="baseball"
        role="coach"
        sections={navSections}
      />

      {/* Main Content Area */}
      <div className="lg:ml-[260px] transition-all duration-300">
        {/* Header */}
        <DarkHeader onMobileMenuToggle={() => setMobileMenuOpen(true)} />

        {/* Page Content */}
        <main className="p-6 pb-24 lg:pb-6">{children}</main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav items={mobileNavItems} />
    </div>
  );
}
```

---

**Version**: 1.0
**Last Updated**: December 2024
**Batch**: 3 - Navigation & Layout
