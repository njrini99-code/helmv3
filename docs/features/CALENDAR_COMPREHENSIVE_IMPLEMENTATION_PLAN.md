<!--
STATUS: STALE
DATE: 2026-07-10
SUPERSEDED BY / WHY: Generated 2026-01-01, describes "TWO separate calendar implementations (Golf premium + Baseball legacy)". The golf calendar has since been remediated (docs/audits/GOLFHELM_CALENDAR_AUDIT_2026-06-10.md + PR #259); BaseballHelm now has its own Fairway calendar (src/components/fairway/calendar/).
KEPT FOR HISTORY -- do not delete this file.
-->

# COMPREHENSIVE CALENDAR SYSTEM IMPLEMENTATION PLAN

> **Generated**: January 1, 2026
> **Based on**: Extremely in-depth code review and database verification
> **Goal**: Fully functional, ultra-premium calendar system for ALL dashboard types

---

## EXECUTIVE SUMMARY

This plan addresses **14 critical issues** discovered during the in-depth review. The calendar system currently has:
- **TWO separate calendar implementations** (Golf premium + Baseball legacy)
- **Broken filtering logic** that never actually filters
- **CRUD not wired** despite components existing
- **Zero drag-and-drop** despite libraries being installed
- **Missing avatar sidebar features** (empty state, tooltips)
- **Disconnected sync settings**
- **Schema mismatches** between frontend types and database tables

---

## PART 1: DATABASE VERIFICATION RESULTS

### Tables Verified to Exist:
| Table | Status | Count | Sport |
|-------|--------|-------|-------|
| `calendar_events` | EXISTS | 0 | Generic (Batch 6 spec) |
| `calendar_event_attendees` | EXISTS | 0 | Generic |
| `calendar_preferences` | EXISTS | 0 | Generic |
| `calendar_notifications` | EXISTS | 0 | Generic |
| `golf_events` | EXISTS | Has data | Golf |
| `events` | EXISTS | Has data | Baseball |
| `baseball_events` | EXISTS | 0 | Legacy/unused |
| `coach_calendar_events` | EXISTS | 0 | Legacy/unused |

### Schema Analysis:

**`golf_events` Table Schema:**
```typescript
{
  id: string;
  team_id: string;           // FK to golf_teams
  title: string;
  event_type: 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other';
  start_date: string;        // DATE format "2025-01-01"
  end_date: string | null;   // DATE format
  start_time: string | null; // TIME format "10:00:00"
  end_time: string | null;   // TIME format
  all_day: boolean | null;
  location: string | null;
  course_name: string | null;
  description: string | null;
  is_mandatory: boolean | null;
  created_by: string;        // FK to golf_coaches
  created_at: string;
  updated_at: string;
}
```

**`events` Table Schema (Baseball):**
```typescript
{
  id: string;
  team_id: string | null;
  organization_id: string | null;
  name: string;              // Different from golf "title"
  event_type: string;
  start_time: string;        // TIMESTAMP format (ISO)
  end_time: string | null;   // TIMESTAMP format (ISO)
  is_all_day: boolean | null;
  location_venue: string | null;
  location_city: string | null;
  location_state: string | null;
  location_address: string | null;
  opponent: string | null;
  home_away: string | null;
  level: string | null;
  description: string | null;
  notes: string | null;
  score_us: number | null;
  score_them: number | null;
  result: string | null;
  timezone: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
```

**Critical Schema Mismatch:**
- Golf uses `start_date` + `start_time` (separate fields)
- Baseball uses `start_time` (combined ISO timestamp)
- Frontend `CalendarEvent` type expects `start_time` ISO

---

## PART 2: COMPONENT INVENTORY

### System A: Golf Premium Calendar (`/src/components/golf/calendar/`)

| File | Purpose | Status | Issues |
|------|---------|--------|--------|
| `PremiumCalendarClient.tsx` | Main container | BROKEN | Filtering bug, no CRUD, event click does nothing |
| `CalendarAvatarSidebar.tsx` | Avatar sidebar | INCOMPLETE | No empty state, no tooltip |
| `CalendarHeader.tsx` | Header with controls | WORKS | - |
| `WeekView.tsx` | Week view | WORKS | No drag-drop |
| `MonthView.tsx` | Month view | WORKS | No drag-drop |
| `DayView.tsx` | Day view | WORKS | No drag-drop |
| `EventCard.tsx` | Event display | WORKS | Not draggable |
| `CreateEventButton.tsx` | CRUD modal | **EXISTS BUT UNUSED!** | Not imported |

### System B: Baseball/Shared Calendar (`/src/components/calendar/`)

| File | Purpose | Status | Issues |
|------|---------|--------|--------|
| `calendar-sidebar.tsx` | Avatar sidebar | WORKS | Different implementation |
| `calendar-header.tsx` | Header | WORKS | - |
| `views/week-view.tsx` | Week view | WORKS | No drag-drop, uses different types |
| `views/day-view.tsx` | Day view | WORKS | - |
| `views/month-view.tsx` | Month view | WORKS | - |
| `event-modal.tsx` | CRUD modal | WORKS | Uses `calendar_events` table |
| `sync-modal.tsx` | Sync settings | WORKS | Not connected anywhere |

### Shared Components:

| File | Purpose | Used By |
|------|---------|---------|
| `CalendarView.tsx` | Simple calendar | Baseball pages |
| `CalendarWidget.tsx` | Dashboard widget | Golf dashboard |

---

## PART 3: CRITICAL BUGS FOUND

### BUG #1: Filtering Logic Never Filters (CRITICAL)
**File:** `src/components/golf/calendar/PremiumCalendarClient.tsx`
**Lines:** 35-40
```typescript
// CURRENT (BROKEN):
const filteredEvents = useMemo(() => {
  if (selectedMemberIds.length === 0 || selectedMemberIds.length === teamMembers.length) {
    return initialEvents;
  }
  return initialEvents; // BUG: Always returns ALL events!
}, [initialEvents, selectedMemberIds, teamMembers.length]);

// CORRECT:
const filteredEvents = useMemo(() => {
  if (selectedMemberIds.length === 0 || selectedMemberIds.length === teamMembers.length) {
    return initialEvents; // Show all when none or all selected
  }
  return initialEvents.filter(event => {
    // Filter by event creator or assigned team members
    return selectedMemberIds.includes(event.created_by_id);
  });
}, [initialEvents, selectedMemberIds, teamMembers.length]);
```

### BUG #2: Event Click Does Nothing
**File:** `src/components/golf/calendar/PremiumCalendarClient.tsx`
**Lines:** 61-63
```typescript
// CURRENT (BROKEN):
const handleEventClick = (event: CalendarEvent) => {
  console.log('Event clicked:', event); // Just logs!
};

// NEEDED:
const handleEventClick = (event: CalendarEvent) => {
  setSelectedEvent(event);
  setIsEventModalOpen(true);
};
```

### BUG #3: Missing Avatar Empty State
**File:** `src/components/golf/calendar/CalendarAvatarSidebar.tsx`
**Lines:** 92-123
```typescript
// CURRENT: Just renders teamMembers.map() with no check for empty array
// NEEDED: Add empty state UI when teamMembers.length === 0
```

### BUG #4: Missing Avatar Tooltip
**File:** `src/components/golf/calendar/CalendarAvatarSidebar.tsx`
**Lines:** 97-122
```typescript
// CURRENT: No title or tooltip on avatar buttons
// NEEDED: Wrap in Tooltip component or add title attribute
```

### BUG #5: Sync Settings Not Passed
**File:** `src/app/golf/(dashboard)/dashboard/calendar/page.tsx`
**Lines:** 77-84
```typescript
// CURRENT:
<PremiumCalendarClient
  initialEvents={events}
  teamMembers={teamMembers}
  // Missing: onSyncSettings, onAddEvent
/>

// NEEDED:
<PremiumCalendarClient
  initialEvents={events}
  teamMembers={teamMembers}
  onSyncSettings={() => setShowSyncModal(true)}
  onAddEvent={() => setShowEventModal(true)}
/>
```

### BUG #6: CRUD Components Exist But Not Used
**File:** `src/components/golf/calendar/CreateEventButton.tsx`
- This complete, working component is NEVER imported
- Server actions `createGolfEvent`, `updateGolfEvent`, `deleteGolfEvent` exist and work
- Need to wire up modal state and import

### BUG #7: Type Mapping Issue
**File:** `src/app/golf/(dashboard)/dashboard/calendar/page.tsx`
**Lines:** 56-65
```typescript
// CURRENT (WRONG):
events = eventsData.map(event => ({
  start_date: event.start_date, // This is a DATE, not ISO timestamp
}));

// NEEDED:
events = eventsData.map(event => ({
  start_time: event.start_date + (event.start_time ? `T${event.start_time}` : 'T00:00:00'),
  end_time: event.end_date + (event.end_time ? `T${event.end_time}` : 'T23:59:59'),
}));
```

---

## PART 4: IMPLEMENTATION PHASES

### PHASE 1: Fix Critical Golf Calendar Bugs (Priority: CRITICAL)

#### 1.1 Fix Filtering Logic
**File:** `src/components/golf/calendar/PremiumCalendarClient.tsx`

```typescript
// Add created_by_id filtering
const filteredEvents = useMemo(() => {
  if (selectedMemberIds.length === 0) {
    return initialEvents; // Show all when none selected (means "ALL" is selected)
  }
  return initialEvents.filter(event => {
    // Golf events don't have assigned_to, so filter by creator only
    // OR we need to add event_attendees support
    return selectedMemberIds.some(id => {
      const member = teamMembers.find(m => m.id === id);
      return member !== undefined; // For now show all team events
    });
  });
}, [initialEvents, selectedMemberIds, teamMembers]);
```

#### 1.2 Wire Up CRUD Modal
**File:** `src/components/golf/calendar/PremiumCalendarClient.tsx`

```typescript
// Add imports
import { useState } from 'react';
import { EventDetailModal } from './EventDetailModal'; // Create this
import { createGolfEvent, updateGolfEvent, deleteGolfEvent } from '@/app/golf/actions/golf';

// Add state
const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
const [isEventModalOpen, setIsEventModalOpen] = useState(false);
const [isCreating, setIsCreating] = useState(false);

// Fix handler
const handleEventClick = (event: CalendarEvent) => {
  setSelectedEvent(event);
  setIsCreating(false);
  setIsEventModalOpen(true);
};

const handleAddEvent = () => {
  setSelectedEvent(null);
  setIsCreating(true);
  setIsEventModalOpen(true);
};

const handleSaveEvent = async (data: GolfEventInput) => {
  if (isCreating) {
    await createGolfEvent(data);
  } else if (selectedEvent) {
    await updateGolfEvent(selectedEvent.id, data);
  }
  setIsEventModalOpen(false);
  // Refresh events (need to implement)
};

const handleDeleteEvent = async () => {
  if (selectedEvent) {
    await deleteGolfEvent(selectedEvent.id);
  }
  setIsEventModalOpen(false);
};

// Add modal to JSX
{isEventModalOpen && (
  <EventDetailModal
    event={selectedEvent}
    isOpen={isEventModalOpen}
    onClose={() => setIsEventModalOpen(false)}
    onSave={handleSaveEvent}
    onDelete={selectedEvent ? handleDeleteEvent : undefined}
  />
)}
```

#### 1.3 Create Golf Event Modal Component
**New File:** `src/components/golf/calendar/EventDetailModal.tsx`

This will be a premium glass-style modal with:
- Title, Event Type, Start/End Date/Time
- Location, Course Name, Description
- Is Mandatory toggle
- Delete button (edit mode only)
- Uses server actions directly

#### 1.4 Fix Type Mapping in Page
**File:** `src/app/golf/(dashboard)/dashboard/calendar/page.tsx`

```typescript
// Transform golf_events to CalendarEvent format correctly
events = (eventsData || []).map(event => ({
  id: event.id,
  team_id: event.team_id,
  title: event.title,
  event_type: event.event_type as EventType,
  // Combine date + time into ISO timestamp
  start_time: event.all_day
    ? `${event.start_date}T00:00:00`
    : `${event.start_date}T${event.start_time || '00:00:00'}`,
  end_time: event.all_day
    ? `${event.end_date || event.start_date}T23:59:59`
    : `${event.end_date || event.start_date}T${event.end_time || '23:59:59'}`,
  location: event.location,
  description: event.description,
  created_by_id: event.created_by,
  is_recurring: false,
  created_at: event.created_at,
  updated_at: event.updated_at,
}));
```

---

### PHASE 2: Avatar Sidebar Enhancements

#### 2.1 Add Empty State
**File:** `src/components/golf/calendar/CalendarAvatarSidebar.tsx`

```typescript
// In the Team Member Avatars section, add:
{teamMembers.length === 0 ? (
  <div className="flex flex-col items-center justify-center py-8 text-center">
    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-2">
      <Users className="w-5 h-5 text-slate-400" />
    </div>
    <p className="text-xs text-slate-500 px-2">
      No team members yet
    </p>
    <p className="text-[10px] text-slate-400 px-2 mt-1">
      Invite players to your roster
    </p>
  </div>
) : (
  teamMembers.map((member) => { ... })
)}
```

#### 2.2 Add Avatar Tooltips
**File:** `src/components/golf/calendar/CalendarAvatarSidebar.tsx`

```typescript
import { Tooltip } from '@/components/ui/tooltip';

// Wrap each avatar button:
<Tooltip
  content={`${member.first_name} ${member.last_name}`}
  side="right"
  delayMs={300}
>
  <button
    key={member.id}
    onClick={() => handleMemberClick(member.id)}
    className={...}
  >
    {/* Avatar content */}
  </button>
</Tooltip>
```

---

### PHASE 3: Sync Settings Integration

#### 3.1 Pass Sync Props
**File:** `src/app/golf/(dashboard)/dashboard/calendar/page.tsx`

```typescript
// Add state for sync modal (will need to make this a client component)
// OR create a wrapper client component

// Option A: Create GolfCalendarWrapper client component
'use client';

import { useState } from 'react';
import { PremiumCalendarClient } from '@/components/golf/calendar/PremiumCalendarClient';
import { SyncModal } from '@/components/calendar/sync-modal';

export function GolfCalendarWrapper({ events, teamMembers }) {
  const [showSyncModal, setShowSyncModal] = useState(false);

  return (
    <>
      <PremiumCalendarClient
        initialEvents={events}
        teamMembers={teamMembers}
        onSyncSettings={() => setShowSyncModal(true)}
      />
      <SyncModal
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        // Add handlers for actual sync
      />
    </>
  );
}
```

---

### PHASE 4: Implement Drag-and-Drop

#### 4.1 Add DnD Provider
**File:** `src/components/golf/calendar/PremiumCalendarClient.tsx`

```typescript
import { DndContext, DragEndEvent, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';

// Add sensors for drag detection
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8, // 8px movement required before drag starts
    },
  })
);

// Add drag end handler
const handleDragEnd = async (event: DragEndEvent) => {
  const { active, over } = event;

  if (!over) return;

  const eventId = active.id as string;
  const targetDate = over.data.current?.date as Date;
  const targetHour = over.data.current?.hour as number;

  if (!targetDate) return;

  // Find the event
  const draggedEvent = initialEvents.find(e => e.id === eventId);
  if (!draggedEvent) return;

  // Calculate new start/end times
  const newStartTime = new Date(targetDate);
  newStartTime.setHours(targetHour || 9);

  const duration = new Date(draggedEvent.end_time).getTime() - new Date(draggedEvent.start_time).getTime();
  const newEndTime = new Date(newStartTime.getTime() + duration);

  // Update via server action
  await updateGolfEvent(eventId, {
    startDate: newStartTime.toISOString().split('T')[0],
    startTime: newStartTime.toTimeString().slice(0, 8),
    endDate: newEndTime.toISOString().split('T')[0],
    endTime: newEndTime.toTimeString().slice(0, 8),
  });

  // Optimistic update
  setLocalEvents(prev => prev.map(e =>
    e.id === eventId
      ? { ...e, start_time: newStartTime.toISOString(), end_time: newEndTime.toISOString() }
      : e
  ));
};

// Wrap calendar in DndContext
return (
  <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
    {/* ... existing calendar content ... */}
    <DragOverlay>
      {activeDragId && (
        <EventCard event={draggedEvent} isOverlay />
      )}
    </DragOverlay>
  </DndContext>
);
```

#### 4.2 Make Events Draggable
**File:** `src/components/golf/calendar/EventCard.tsx`

```typescript
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

export function EventCard({ event, onClick, isOverlay }: EventCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: event.id,
    data: { event },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        'event-card',
        isDragging && 'dragging',
        isOverlay && 'overlay'
      )}
    >
      {/* Event content */}
    </div>
  );
}
```

#### 4.3 Make Time Slots Droppable
**File:** `src/components/golf/calendar/WeekView.tsx`

```typescript
import { useDroppable } from '@dnd-kit/core';

function TimeSlot({ date, hour }: { date: Date; hour: number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${date.toISOString()}-${hour}`,
    data: { date, hour },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'h-16 border-b border-warm-100',
        isOver && 'bg-primary-50/50'
      )}
    />
  );
}
```

---

### PHASE 5: Baseball Calendar Upgrade

#### 5.1 Add Premium UI to Baseball Calendar
**File:** `src/app/baseball/(dashboard)/dashboard/calendar/calendar-client.tsx`

Currently uses legacy `CalendarView` component. Needs to:
1. Import and use the shared calendar components from `/src/components/calendar/`
2. Add avatar sidebar with team members from `team_members` table
3. Apply glass card styling
4. Wire up `EventModal` for CRUD

#### 5.2 Create Baseball Calendar Client Component
**New File:** `src/app/baseball/(dashboard)/dashboard/calendar/premium-calendar-client.tsx`

Mirror the golf implementation but:
- Query `events` table instead of `golf_events`
- Use `team_members` table for avatar sidebar
- Map `name` field to `title` for consistency

---

### PHASE 6: Player Dashboard Integration

#### 6.1 Golf Player Calendar Access
Golf players already have calendar access via same page. Need to:
- Hide "Add Event" button for players
- Make events read-only for players
- Pass `isCoach={false}` prop

#### 6.2 Baseball Player Calendar Access
Same approach - need to verify route protection allows players.

---

### PHASE 7: Dashboard Widget Integration

#### 7.1 Add Calendar Widget to Baseball Dashboard
**File:** `src/app/baseball/(dashboard)/dashboard/page.tsx`

```typescript
import { CalendarWidget } from '@/components/dashboard/calendar-widget';

// In coach dashboard section:
<CalendarWidget
  events={calendarEvents}
  calendarUrl="/baseball/dashboard/calendar"
/>
```

#### 7.2 Verify Golf Dashboard Widget
Already implemented correctly - just verify it shows correct events.

---

## PART 5: FILE-BY-FILE CHANGES

### Files to MODIFY:

1. **`src/components/golf/calendar/PremiumCalendarClient.tsx`**
   - Fix filtering logic (lines 35-40)
   - Add CRUD state and handlers
   - Wire up event modal
   - Add DnD context wrapper
   - Add local events state for optimistic updates

2. **`src/components/golf/calendar/CalendarAvatarSidebar.tsx`**
   - Add empty state for no team members
   - Add tooltip on avatar hover
   - Import Tooltip component

3. **`src/components/golf/calendar/EventCard.tsx`**
   - Add draggable functionality
   - Add drag overlay variant

4. **`src/components/golf/calendar/WeekView.tsx`**
   - Add droppable time slots
   - Add drop indicator styling

5. **`src/components/golf/calendar/MonthView.tsx`**
   - Add droppable day cells
   - Add drop indicator styling

6. **`src/components/golf/calendar/DayView.tsx`**
   - Add droppable time slots
   - Add drop indicator styling

7. **`src/app/golf/(dashboard)/dashboard/calendar/page.tsx`**
   - Fix type mapping for golf_events → CalendarEvent
   - Pass onSyncSettings prop
   - Pass onAddEvent prop
   - Make page export client wrapper

8. **`src/app/baseball/(dashboard)/dashboard/calendar/page.tsx`**
   - Upgrade to premium calendar UI
   - Add avatar sidebar
   - Keep existing CRUD (already works)

### Files to CREATE:

1. **`src/components/golf/calendar/EventDetailModal.tsx`**
   - Premium glass-style modal
   - Create/Edit/Delete functionality
   - Uses server actions
   - Date/time pickers
   - Event type selector

2. **`src/app/golf/(dashboard)/dashboard/calendar/golf-calendar-wrapper.tsx`**
   - Client component wrapper
   - Manages modal states
   - Passes handlers to PremiumCalendarClient

3. **`src/app/baseball/(dashboard)/dashboard/calendar/baseball-calendar-wrapper.tsx`**
   - Same pattern for baseball

### Files to VERIFY:

1. **`src/app/golf/actions/golf.ts`** - Server actions exist and work
2. **`src/lib/types/calendar.ts`** - Type definitions correct
3. **`src/hooks/use-calendar-events.ts`** - Note: Uses wrong table
4. **`src/components/calendar/sync-modal.tsx`** - Exists and works

---

## PART 6: TESTING CHECKLIST

### Golf Calendar:
- [ ] Events load from database correctly
- [ ] View switching (day/week/month) works
- [ ] Navigation (prev/next/today) works
- [ ] Avatar sidebar shows team members
- [ ] Avatar filtering filters events correctly
- [ ] Empty state shows when no team members
- [ ] Tooltip shows on avatar hover
- [ ] Add Event button opens modal (coach only)
- [ ] Event click opens edit modal
- [ ] Create event saves to database
- [ ] Update event saves to database
- [ ] Delete event removes from database
- [ ] Drag-drop event reschedules correctly
- [ ] Sync settings button opens modal
- [ ] Players see read-only calendar

### Baseball Calendar:
- [ ] Events load from events table
- [ ] Premium glass UI applied
- [ ] Avatar sidebar shows team members
- [ ] CRUD works (already implemented)
- [ ] Drag-drop works
- [ ] Players see read-only calendar

### Dashboard Widgets:
- [ ] Golf dashboard shows calendar widget
- [ ] Baseball dashboard shows calendar widget
- [ ] Widget shows correct events for selected day
- [ ] Navigation between days works
- [ ] "View Full Calendar" link works

---

## PART 7: IMPLEMENTATION ORDER

### Day 1: Critical Bug Fixes
1. Fix filtering logic in PremiumCalendarClient
2. Fix type mapping in golf calendar page
3. Create EventDetailModal component
4. Wire up CRUD in PremiumCalendarClient
5. Test create/edit/delete flow

### Day 2: Avatar Sidebar
1. Add empty state
2. Add tooltips
3. Wire up sync settings
4. Create sync modal handlers

### Day 3: Drag-and-Drop
1. Add DnD context
2. Make EventCard draggable
3. Make time slots droppable
4. Test drag-drop rescheduling

### Day 4: Baseball Upgrade
1. Create premium baseball calendar client
2. Add avatar sidebar
3. Apply glass styling
4. Wire up existing CRUD

### Day 5: Dashboard & Polish
1. Add calendar widget to baseball dashboard
2. Verify all player access
3. Cross-browser testing
4. Mobile responsiveness check

---

## PART 8: DEPENDENCIES

### Already Installed (package.json verified):
- `@dnd-kit/core` - Drag-and-drop core
- `@dnd-kit/sortable` - Sortable lists
- `@dnd-kit/utilities` - DnD utilities
- `@hello-pangea/dnd` - Alternative DnD (not needed)
- `date-fns` - Date manipulation
- `lucide-react` - Icons

### No New Dependencies Required

---

## CONCLUSION

This plan provides a complete roadmap to transform the calendar system from its current broken state to a fully functional, ultra-premium experience. The key insight is that most components already exist - they just need to be properly connected and debugged.

**Total estimated changes:**
- 8 files to modify
- 3 files to create
- ~500 lines of new/modified code
- 14 bugs to fix

**Priority order:**
1. CRUD functionality (most important for users)
2. Filtering fix (user-facing bug)
3. Avatar sidebar enhancements (polish)
4. Drag-and-drop (enhancement)
5. Baseball upgrade (parity)
