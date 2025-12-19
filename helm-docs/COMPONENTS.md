# Helm Sports Labs - Component Library

> Complete component inventory with states, variants, and specifications.

---

## UI Primitives

### Button

**File:** `components/ui/button.tsx`

**Variants:**
| Variant | Usage |
|---------|-------|
| `primary` | Main actions (Save, Submit, Create) |
| `secondary` | Secondary actions (Cancel, Back) |
| `ghost` | Subtle actions (View All, Clear) |
| `destructive` | Dangerous actions (Delete, Remove) |
| `icon` | Icon-only buttons |

**Sizes:**
| Size | Padding | Font |
|------|---------|------|
| `sm` | px-3 py-1.5 | text-xs |
| `default` | px-5 py-2.5 | text-sm |
| `lg` | px-6 py-3 | text-base |

**States:**
| State | Appearance |
|-------|------------|
| Default | Base variant styles |
| Hover | Darker background |
| Active | Even darker, scale(0.98) |
| Disabled | 50% opacity, cursor-not-allowed |
| Loading | Spinner replaces content |

**Props:**
```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'icon';
  size?: 'sm' | 'default' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}
```

---

### Input

**File:** `components/ui/input.tsx`

**Variants:**
| Variant | Usage |
|---------|-------|
| `default` | Standard text input |
| `search` | With search icon |
| `password` | With visibility toggle |

**States:**
| State | Appearance |
|-------|------------|
| Default | White bg, gray border |
| Focus | Green border, green ring |
| Error | Red border, red ring |
| Disabled | Gray bg, cursor-not-allowed |

**Props:**
```typescript
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}
```

---

### Select

**File:** `components/ui/select.tsx`

**States:**
| State | Appearance |
|-------|------------|
| Default | White bg, dropdown arrow |
| Open | Border highlight, dropdown visible |
| Disabled | Gray bg |

**Props:**
```typescript
interface SelectProps {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}
```

---

### Checkbox

**File:** `components/ui/checkbox.tsx`

**States:**
| State | Appearance |
|-------|------------|
| Unchecked | Empty box |
| Checked | Green bg, white check |
| Indeterminate | Green bg, white dash |
| Disabled | Gray, no interaction |

**Props:**
```typescript
interface CheckboxProps {
  checked?: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label?: string;
  onChange?: (checked: boolean) => void;
}
```

---

### Toggle

**File:** `components/ui/toggle.tsx`

**States:**
| State | Appearance |
|-------|------------|
| Off | Gray track, white knob left |
| On | Green track, white knob right |
| Disabled | 50% opacity |

**Props:**
```typescript
interface ToggleProps {
  checked?: boolean;
  disabled?: boolean;
  label?: string;
  onChange?: (checked: boolean) => void;
}
```

---

### Badge

**File:** `components/ui/badge.tsx`

**Variants:**
| Variant | Colors |
|---------|--------|
| `default` | Gray bg, gray text |
| `success` | Green bg, green text |
| `error` | Red bg, red text |

**Props:**
```typescript
interface BadgeProps {
  variant?: 'default' | 'success' | 'error';
  children: React.ReactNode;
  icon?: React.ReactNode;
}
```

---

### Avatar

**File:** `components/ui/avatar.tsx`

**Sizes:**
| Size | Dimensions |
|------|------------|
| `sm` | 32x32px |
| `md` | 40x40px |
| `lg` | 48x48px |
| `xl` | 64x64px |

**States:**
| State | Appearance |
|-------|------------|
| Loaded | Image displayed |
| Loading | Skeleton pulse |
| Fallback | Initials on green bg |

**Props:**
```typescript
interface AvatarProps {
  src?: string;
  alt?: string;
  name?: string; // For fallback initials
  size?: 'sm' | 'md' | 'lg' | 'xl';
}
```

---

### Card

**File:** `components/ui/card.tsx`

**Variants:**
| Variant | Usage |
|---------|-------|
| `default` | Standard card |
| `interactive` | Clickable with hover effect |
| `glass` | Glassmorphism effect |

**Props:**
```typescript
interface CardProps {
  variant?: 'default' | 'interactive' | 'glass';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
}
```

---

### Modal

**File:** `components/ui/modal.tsx`

**Sizes:**
| Size | Max Width |
|------|-----------|
| `sm` | 400px |
| `md` | 500px |
| `lg` | 600px |
| `xl` | 800px |
| `full` | 100% - padding |

**Props:**
```typescript
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  children: React.ReactNode;
  footer?: React.ReactNode;
}
```

---

### Dropdown

**File:** `components/ui/dropdown.tsx`

**Props:**
```typescript
interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
}

interface DropdownItem {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  divider?: boolean;
}
```

---

### Tabs

**File:** `components/ui/tabs.tsx`

**Props:**
```typescript
interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

interface Tab {
  id: string;
  label: string;
  badge?: number;
  disabled?: boolean;
}
```

---

### Toast

**File:** `components/ui/toast.tsx`

**Variants:**
| Variant | Icon | Colors |
|---------|------|--------|
| `success` | Check | Green |
| `error` | X | Red |
| `info` | Info | Gray |

**Props:**
```typescript
interface ToastProps {
  variant: 'success' | 'error' | 'info';
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number; // Default 4000ms
}
```

---

### Skeleton

**File:** `components/ui/skeleton.tsx`

**Variants:**
| Variant | Shape |
|---------|-------|
| `text` | Rectangle, h-4 |
| `avatar` | Circle |
| `card` | Large rectangle |
| `custom` | Any dimensions |

**Props:**
```typescript
interface SkeletonProps {
  variant?: 'text' | 'avatar' | 'card' | 'custom';
  width?: string | number;
  height?: string | number;
  className?: string;
}
```

---

### Progress

**File:** `components/ui/progress.tsx`

**Props:**
```typescript
interface ProgressProps {
  value: number; // 0-100
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}
```

---

### Tooltip

**File:** `components/ui/tooltip.tsx`

**Props:**
```typescript
interface TooltipProps {
  content: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
}
```

---

## Layout Components

### Sidebar

**File:** `components/layout/sidebar.tsx`

**Sections:**
- Logo
- Mode Toggle (if applicable)
- Navigation Items
- User Menu

**Props:**
```typescript
interface SidebarProps {
  navigation: NavSection[];
  user: User;
  mode?: 'recruiting' | 'team';
  onModeChange?: (mode: 'recruiting' | 'team') => void;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType;
  badge?: number;
  locked?: boolean;
}
```

---

### Header

**File:** `components/layout/header.tsx`

**Props:**
```typescript
interface HeaderProps {
  title?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
}

interface Breadcrumb {
  label: string;
  href?: string;
}
```

---

### ModeToggle

**File:** `components/layout/mode-toggle.tsx`

**Props:**
```typescript
interface ModeToggleProps {
  mode: 'recruiting' | 'team';
  onChange: (mode: 'recruiting' | 'team') => void;
}
```

---

### TeamSwitcher

**File:** `components/layout/team-switcher.tsx`

**Props:**
```typescript
interface TeamSwitcherProps {
  teams: Team[];
  currentTeam: Team;
  onChange: (team: Team) => void;
}
```

---

## Dashboard Components

### StatCard

**File:** `components/dashboard/stat-card.tsx`

**Props:**
```typescript
interface StatCardProps {
  label: string;
  value: string | number;
  change?: {
    value: number;
    type: 'percent' | 'absolute';
  };
  icon: React.ComponentType;
  onClick?: () => void;
}
```

---

### ActivityFeed

**File:** `components/dashboard/activity-feed.tsx`

**Props:**
```typescript
interface ActivityFeedProps {
  activities: Activity[];
  loading?: boolean;
  filters?: string[];
  activeFilter?: string;
  onFilterChange?: (filter: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

interface Activity {
  id: string;
  type: 'view' | 'follow' | 'top5' | 'camp';
  actor: {
    id: string;
    name: string;
    avatarUrl?: string;
    position?: string;
    gradYear?: number;
    state?: string;
  };
  action: string;
  createdAt: string;
}
```

---

### PipelineBoard

**File:** `components/dashboard/pipeline-board.tsx`

**Props:**
```typescript
interface PipelineBoardProps {
  pipeline: {
    watchlist: PipelinePlayer[];
    priority: PipelinePlayer[];
    offer_extended: PipelinePlayer[];
    committed: PipelinePlayer[];
  };
  onDragEnd: (playerId: string, newStage: PipelineStage) => void;
  onPlayerClick: (playerId: string) => void;
}
```

---

### WelcomeCard

**File:** `components/dashboard/welcome-card.tsx`

**Props:**
```typescript
interface WelcomeCardProps {
  userName: string;
  programName: string;
  profileCompletion?: number;
  quickActions?: QuickAction[];
}
```

---

## Player Components

### PlayerCard

**File:** `components/player/player-card.tsx`

**States:**
| State | Appearance |
|-------|------------|
| Default | Standard display |
| Hover | Lift effect |
| On Watchlist | Filled heart |
| In Compare | Check badge |
| Committed | "Committed" badge |
| Loading | Skeleton |

**Props:**
```typescript
interface PlayerCardProps {
  player: PlayerSummary;
  showWatchlistButton?: boolean;
  isWatchlisted?: boolean;
  onWatchlistToggle?: () => void;
  onCompareAdd?: () => void;
  inCompare?: boolean;
  onClick?: () => void;
}
```

---

### PlayerProfile

**File:** `components/player/player-profile.tsx`

**Tabs:**
- Overview
- Stats
- Video
- Timeline
- Notes (coach view only)

**Props:**
```typescript
interface PlayerProfileProps {
  player: Player;
  viewerType: 'coach' | 'player' | 'public';
  onWatchlistToggle?: () => void;
  onCompareAdd?: () => void;
  onMessage?: () => void;
}
```

---

### ComparisonGrid

**File:** `components/player/comparison-grid.tsx`

**Props:**
```typescript
interface ComparisonGridProps {
  players: Player[];
  onAddPlayer: () => void;
  onRemovePlayer: (playerId: string) => void;
  onSave: (comparison: Comparison) => void;
  maxPlayers?: number; // Default 4
}
```

---

### PlayerMetrics

**File:** `components/player/player-metrics.tsx`

**Props:**
```typescript
interface PlayerMetricsProps {
  metrics: {
    pitchVelo?: number;
    exitVelo?: number;
    sixtyTime?: number;
    [key: string]: number | undefined;
  };
  verified?: boolean;
  layout?: 'grid' | 'inline';
}
```

---

## Video Components

### VideoPlayer

**File:** `components/video/video-player.tsx`

**Props:**
```typescript
interface VideoPlayerProps {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  onEnded?: () => void;
  onTimeUpdate?: (currentTime: number) => void;
}
```

---

### VideoUploader

**File:** `components/video/video-uploader.tsx`

**States:**
| State | UI |
|-------|-----|
| Idle | Upload dropzone |
| Dragging | Highlighted dropzone |
| Uploading | Progress bar |
| Processing | Processing indicator |
| Ready | Success message |
| Error | Error message + retry |

**Props:**
```typescript
interface VideoUploaderProps {
  onUploadComplete: (videoId: string) => void;
  onError: (error: Error) => void;
  maxSize?: number; // Default 500MB
  acceptedTypes?: string[];
}
```

---

### ClipTool

**File:** `components/video/clip-tool.tsx`

**Props:**
```typescript
interface ClipToolProps {
  videoId: string;
  videoSrc: string;
  duration: number;
  onSave: (clip: NewClip) => void;
  onCancel: () => void;
}

interface NewClip {
  title: string;
  startTime: number;
  endTime: number;
  tags: string[];
  visibility: 'private' | 'team' | 'public';
}
```

---

### VideoLibrary

**File:** `components/video/video-library.tsx`

**Props:**
```typescript
interface VideoLibraryProps {
  videos: Video[];
  clips: Clip[];
  onVideoClick: (videoId: string) => void;
  onClipClick: (clipId: string) => void;
  onUpload: () => void;
  editable?: boolean;
}
```

---

## Form Components

### ProfileForm

**File:** `components/forms/profile-form.tsx`

**Tabs:**
- Basic Info
- Physical
- Metrics
- Academics
- Content

**Props:**
```typescript
interface ProfileFormProps {
  player: Player;
  onSave: (data: PlayerUpdate) => void;
  loading?: boolean;
}
```

---

### CampForm

**File:** `components/forms/camp-form.tsx`

**Props:**
```typescript
interface CampFormProps {
  camp?: Camp; // For editing
  onSubmit: (data: CampData) => void;
  onCancel: () => void;
  loading?: boolean;
}
```

---

### DevPlanForm

**File:** `components/forms/dev-plan-form.tsx`

**Props:**
```typescript
interface DevPlanFormProps {
  playerId: string;
  plan?: DevPlan; // For editing
  onSubmit: (data: DevPlanData) => void;
  onCancel: () => void;
}
```

---

### MessageComposer

**File:** `components/forms/message-composer.tsx`

**Props:**
```typescript
interface MessageComposerProps {
  onSend: (message: NewMessage) => void;
  placeholder?: string;
  allowAttachments?: boolean;
  disabled?: boolean;
}
```

---

### FilterPanel

**File:** `components/forms/filter-panel.tsx`

**Props:**
```typescript
interface FilterPanelProps {
  filters: FilterConfig[];
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  onClear: () => void;
  onSave?: () => void;
}

interface FilterConfig {
  key: string;
  label: string;
  type: 'select' | 'multiselect' | 'range' | 'checkbox' | 'chips';
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}
```

---

## Shared Components

### EmptyState

**File:** `components/shared/empty-state.tsx`

**Props:**
```typescript
interface EmptyStateProps {
  icon: React.ComponentType;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}
```

---

### ErrorState

**File:** `components/shared/error-state.tsx`

**Props:**
```typescript
interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}
```

---

### LoadingState

**File:** `components/shared/loading-state.tsx`

**Props:**
```typescript
interface LoadingStateProps {
  message?: string;
}
```

---

### ConfirmDialog

**File:** `components/shared/confirm-dialog.tsx`

**Props:**
```typescript
interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}
```

---

### SearchBar

**File:** `components/shared/search-bar.tsx`

**Props:**
```typescript
interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  debounceMs?: number; // Default 300
}
```

---

### Pagination

**File:** `components/shared/pagination.tsx`

**Props:**
```typescript
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}
```

---

### InfiniteScroll

**File:** `components/shared/infinite-scroll.tsx`

**Props:**
```typescript
interface InfiniteScrollProps {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  children: React.ReactNode;
  loader?: React.ReactNode;
  endMessage?: React.ReactNode;
}
```

---

### USMap

**File:** `components/shared/us-map.tsx`

**Props:**
```typescript
interface USMapProps {
  data?: Record<string, number>; // state -> count
  selectedState?: string;
  onStateClick: (state: string) => void;
  colorScale?: 'green' | 'gray';
}
```

---

### Calendar

**File:** `components/shared/calendar.tsx`

**Views:**
- Month
- Week
- Agenda

**Props:**
```typescript
interface CalendarProps {
  events: CalendarEvent[];
  view: 'month' | 'week' | 'agenda';
  onViewChange: (view: 'month' | 'week' | 'agenda') => void;
  onDateChange: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  onSlotClick?: (date: Date) => void;
}
```

---

## Component Guidelines

### File Structure

```
components/
├── ui/
│   └── button.tsx
│       ├── Button component
│       ├── buttonVariants (cva)
│       └── ButtonProps interface
```

### Naming Conventions

- Components: PascalCase (`PlayerCard.tsx`)
- Props interfaces: ComponentNameProps (`PlayerCardProps`)
- Event handlers: on[Event] (`onClick`, `onSubmit`)
- Boolean props: is/has prefix (`isLoading`, `hasError`)

### State Pattern

```typescript
// Use loading, error, empty states
if (loading) return <Skeleton />;
if (error) return <ErrorState message={error.message} onRetry={refetch} />;
if (!data.length) return <EmptyState {...emptyProps} />;
return <ActualContent data={data} />;
```

### Accessibility

Every interactive component must have:
- ARIA labels where appropriate
- Keyboard navigation support
- Focus management
- Color contrast compliance

```typescript
<button
  aria-label="Add to watchlist"
  aria-pressed={isWatchlisted}
  onKeyDown={handleKeyDown}
>
  <Heart />
</button>
```
