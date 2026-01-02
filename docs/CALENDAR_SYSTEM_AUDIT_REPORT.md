# Calendar System Audit Report

**Date:** January 1, 2026
**Auditor:** Claude Code
**Scope:** Comprehensive Calendar System Audit against Batch 6 Specifications

---

## Executive Summary

| Category | Status | Issues Found |
|----------|--------|--------------|
| Database Schema | **FAILED** | 6 dedicated tables missing |
| File Structure | **PARTIAL** | Baseball missing error.tsx |
| UI/UX Compliance | **PARTIAL** | Sizing correct, sync button not wired |
| Functionality | **FAILED** | Golf CRUD missing, filtering broken, no drag-drop |
| Dashboard Widgets | **PARTIAL** | Only Golf Coach has widget |
| Premium UI | **PARTIAL** | Glass cards present, drag-drop missing |
| Avatar Sidebar | **PARTIAL** | Renders correctly, sync not connected |
| Drag & Drop | **FAILED** | Not implemented at all |

---

## 1. Database Schema Verification

### 1.1 Expected Tables (per Batch 6 spec)

| Table | Status | Notes |
|-------|--------|-------|
| `calendar_events` | **MISSING** | Not implemented |
| `calendar_event_attendees` | **MISSING** | Not implemented |
| `calendar_sync_settings` | **MISSING** | Not implemented |
| `calendar_preferences` | **MISSING** | Not implemented |
| `calendar_sync_log` | **MISSING** | Not implemented |
| `calendar_notifications` | **MISSING** | Not implemented |

### 1.2 Actual Implementation

Instead of the unified calendar schema, the system uses **sport-specific tables**:

| Table | Exists | Description |
|-------|--------|-------------|
| `events` | **YES** | Baseball calendar events |
| `golf_events` | **YES** | Golf calendar events |

### 1.3 Schema Analysis

**`golf_events` table columns:**
- `id`, `team_id`, `title`, `event_type`
- `start_date`, `end_date`
- `location`, `description`
- `created_at`, `updated_at`

**`events` table columns:**
- Similar structure for baseball

### 1.4 RLS Policies

- Golf events: RLS policies exist for team-based access
- Baseball events: RLS policies exist for team-based access

---

## 2. File Structure Verification

### 2.1 Type Definitions

| File | Status | Location |
|------|--------|----------|
| `calendar.ts` | **EXISTS** | `src/lib/types/calendar.ts` |

**Contains:**
- `EventType` enum (13 types)
- `CalendarEvent` interface
- `CalendarEventAttendee` interface
- `TeamMember` interface
- `DayEvent` interface

### 2.2 Calendar Pages

| Dashboard Type | Page | Loading | Error |
|----------------|------|---------|-------|
| Baseball Coach | `src/app/baseball/(dashboard)/dashboard/calendar/page.tsx` | **YES** | **MISSING** |
| Baseball Player | Same page (role-conditional) | **YES** | **MISSING** |
| Golf Coach | `src/app/golf/(dashboard)/dashboard/calendar/page.tsx` | **YES** | **YES** |
| Golf Player | Same page (role-conditional) | **YES** | **YES** |

### 2.3 Calendar Components

**Golf Calendar (Premium Implementation):**

| Component | Status | Location |
|-----------|--------|----------|
| PremiumCalendarClient | **EXISTS** | `src/components/golf/calendar/PremiumCalendarClient.tsx` |
| CalendarAvatarSidebar | **EXISTS** | `src/components/golf/calendar/CalendarAvatarSidebar.tsx` |
| CalendarHeader | **EXISTS** | `src/components/golf/calendar/CalendarHeader.tsx` |
| WeekView | **EXISTS** | `src/components/golf/calendar/WeekView.tsx` |
| MonthView | **EXISTS** | `src/components/golf/calendar/MonthView.tsx` |
| DayView | **EXISTS** | `src/components/golf/calendar/DayView.tsx` |
| EventCard | **EXISTS** | `src/components/golf/calendar/EventCard.tsx` |
| CreateEventButton | **EXISTS** | `src/components/golf/calendar/CreateEventButton.tsx` |
| EventsList | **EXISTS** | `src/components/golf/calendar/EventsList.tsx` |
| WeeklyScheduleView | **EXISTS** | `src/components/golf/calendar/WeeklyScheduleView.tsx` |

**Baseball Calendar:**

| Component | Status | Location |
|-----------|--------|----------|
| CalendarView | **EXISTS** | `src/components/shared/CalendarView.tsx` |
| EventModal | **EXISTS** | `src/components/coach/EventModal.tsx` |

### 2.4 Utilities & Hooks

| File | Status | Location |
|------|--------|----------|
| event-styles.ts | **EXISTS** | `src/lib/calendar/event-styles.ts` |
| useCalendarEvents.ts | **EXISTS** | `src/hooks/useCalendarEvents.ts` |
| use-calendar-events.ts | **EXISTS** | `src/hooks/use-calendar-events.ts` |
| use-calendar-preferences.ts | **EXISTS** | `src/hooks/use-calendar-preferences.ts` |

### 2.5 API Routes

| Route | Status | Notes |
|-------|--------|-------|
| `/api/calendar/*` | **EXISTS** | `src/app/api/calendar/` directory |

---

## 3. UI/UX Specification Compliance

### 3.1 Avatar Sidebar (Golf) - DEEP ANALYSIS

#### 3.1.1 Visual Specifications

| Specification | Expected | Actual | Status |
|---------------|----------|--------|--------|
| Sidebar width | 72px | `w-[72px]` | **PASS** |
| Avatar size | 48×48px | `w-12 h-12` | **PASS** |
| Collapse toggle | Yes | Implemented | **PASS** |
| Animation | Smooth | `transition-all duration-300` | **PASS** |
| ALL button | Gradient | `bg-gradient-to-br from-primary-600` | **PASS** |
| Dividers | Gradient | `via-slate-300` | **PASS** |

#### 3.1.2 Sidebar Presence When No Team Members

| Scenario | Expected | Actual | Status |
|----------|----------|--------|--------|
| Empty team | Show sidebar with "ALL" + sync | Shows sidebar, "ALL" button | **PARTIAL** |
| Sync button visible | Yes | **NO - onSyncSettings not passed** | **FAIL** |
| Empty state message | "No team members" or similar | **MISSING - just blank space** | **FAIL** |

#### 3.1.3 Avatar Hover States

| Specification | Expected | Actual | Status |
|---------------|----------|--------|--------|
| Show name on hover | Tooltip with full name | **NOT IMPLEMENTED** | **FAIL** |
| Profile picture display | Show avatar_url or initials | Shows correctly | **PASS** |
| Initials fallback | First+Last initial | Implemented | **PASS** |

**Missing Hover Tooltip:**
```typescript
// Current implementation has NO title or tooltip:
<button
  key={member.id}
  onClick={() => handleMemberClick(member.id)}
  // NO title={`${member.first_name} ${member.last_name}`}
  // NO Tooltip wrapper
>
```

**Code Issue - page.tsx does not pass sync handler:**
```typescript
// src/app/golf/(dashboard)/dashboard/calendar/page.tsx lines 77-84
return (
  <PremiumCalendarClient
    initialEvents={events}
    teamMembers={teamMembers}
    // onSyncSettings NOT PASSED - sync button won't appear!
  />
);
```

#### 3.1.4 Sync Settings Button

| Specification | Expected | Actual | Status |
|---------------|----------|--------|--------|
| Sync button in sidebar | Yes | Component exists | **PASS** |
| Sync button connected | Yes | `onSyncSettings` prop not passed | **FAIL** |
| Sync modal | Opens settings | Not implemented | **FAIL** |

**Root Cause:** The `CalendarAvatarSidebar` component has `onSyncSettings` prop, but:
1. `PremiumCalendarClient` accepts it as optional
2. `page.tsx` does NOT pass it
3. Result: Sync button never renders

#### 3.1.5 Team Member Filtering - CRITICAL BUG

| Specification | Expected | Actual | Status |
|---------------|----------|--------|--------|
| Filter by member | Filter events | Returns all events always | **FAIL** |
| Multi-select | Filter multiple | Broken - same bug | **FAIL** |

**BUG in PremiumCalendarClient.tsx lines 35-40:**
```typescript
const filteredEvents = useMemo(() => {
  if (selectedMemberIds.length === 0 || selectedMemberIds.length === teamMembers.length) {
    return initialEvents;
  }
  return initialEvents; // BUG: Always returns ALL events!
  // Should filter: return initialEvents.filter(e => selectedMemberIds.includes(e.assigned_to));
}, [initialEvents, selectedMemberIds, teamMembers.length]);
```

The filtering logic is completely broken - selecting individual team members has no effect.

### 3.2 Week View (Golf)

| Specification | Expected | Actual | Status |
|---------------|----------|--------|--------|
| Time column width | 64px | `w-16` (64px) | **PASS** |
| Hour row height | 64px | `h-16` (64px) | **PASS** |
| Current time indicator | Red line | `h-0.5 bg-red-500` | **PASS** |
| Today highlight | Subtle | `bg-primary-50/30` | **PASS** |
| Business hours highlight | 8am-6pm | Implemented | **PASS** |

### 3.3 Event Styling

| Specification | Expected | Actual | Status |
|---------------|----------|--------|--------|
| Event type colors | 13 types | 13 defined in event-styles.ts | **PASS** |
| Practice | Green | `bg-green-100` | **PASS** |
| Match/Competition | Red | `bg-red-100` | **PASS** |
| Class blocked_time | No text | `showText: false` | **PASS** |

### 3.4 Month View (Golf)

| Specification | Expected | Actual | Status |
|---------------|----------|--------|--------|
| Cell height minimum | 100px | `min-h-[100px]` | **PASS** |
| Today highlight | Distinct | `bg-primary-50` ring | **PASS** |
| Event chips | Colored dots | Implemented | **PASS** |

### 3.5 Drag and Drop - COMPLETELY MISSING

| Specification | Expected | Actual | Status |
|---------------|----------|--------|--------|
| Drag events to reschedule | Yes | **NOT IMPLEMENTED** | **FAIL** |
| Drop on time slot | Yes | **NOT IMPLEMENTED** | **FAIL** |
| Drag between days | Yes | **NOT IMPLEMENTED** | **FAIL** |
| Visual feedback | Ghost element | **NOT IMPLEMENTED** | **FAIL** |
| Library used | react-dnd or similar | **NONE** | **FAIL** |

**Analysis:**
- Searched all calendar components for: `drag`, `drop`, `dnd`, `draggable`, `onDrag`
- **ZERO drag-and-drop functionality found**
- Events are click-only (and clicks just log to console)
- No rescheduling capability exists

**Files Checked:**
- `WeekView.tsx` - No drag handlers
- `DayView.tsx` - No drag handlers
- `MonthView.tsx` - No drag handlers
- `EventCard.tsx` - No draggable props
- `PremiumCalendarClient.tsx` - No drag state management

### 3.6 Premium UI Elements

| Element | Location | Status |
|---------|----------|--------|
| Glass card container | PremiumCalendarClient | **PASS** |
| Backdrop blur | `backdrop-blur-xl` | **PASS** |
| Rounded corners 20px | `rounded-[20px]` | **PASS** |
| Subtle shadow | Complex shadow | **PASS** |
| Gradient dividers | Avatar sidebar | **PASS** |
| Pill view toggle | CalendarHeader | **PASS** |
| Hover animations | Buttons | **PASS** |

**Premium Glass Card Implementation:**
```typescript
// PremiumCalendarClient.tsx line 88
<div className="flex-1 flex flex-col bg-white/70 backdrop-blur-xl border border-white/40
                rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.02),0_8px_16px_rgba(0,0,0,0.04)]">
```

**Missing Premium Features:**
- No drag-and-drop for event rescheduling
- No event edit modal with premium styling
- No smooth create event flow (button logs to console)

---

## 4. Functionality Verification

### 4.1 Baseball Calendar

| Feature | Coach | Player | Status |
|---------|-------|--------|--------|
| View events | **YES** | **YES** | **PASS** |
| Create events | **YES** | **NO** | **PASS** |
| Edit events | **YES** | **NO** | **PASS** |
| Delete events | **YES** | **NO** | **PASS** |
| Month view | **YES** | **YES** | **PASS** |
| Week view | **YES** | **YES** | **PASS** |
| List view | **YES** | **YES** | **PASS** |

### 4.2 Golf Calendar

| Feature | Coach | Player | Status |
|---------|-------|--------|--------|
| View events | **YES** | **YES** | **PASS** |
| Create events | **NO** | **NO** | **FAIL** |
| Edit events | **NO** | **NO** | **FAIL** |
| Delete events | **NO** | **NO** | **FAIL** |
| Month view | **YES** | **YES** | **PASS** |
| Week view | **YES** | **YES** | **PASS** |
| Day view | **YES** | **YES** | **PASS** |
| List view | **YES** | **YES** | **PASS** |
| Avatar filtering | **YES** | **YES** | **PASS** |

**Golf CRUD Issue:**
```typescript
// In PremiumCalendarClient.tsx - lines 66-68
const handleEventClick = (event: CalendarEvent) => {
  console.log('Event clicked:', event); // No actual functionality
};

// CreateEventButton exists but not wired to actual creation
```

### 4.3 Calendar Sync

| Feature | Status | Notes |
|---------|--------|-------|
| Google Calendar sync | **NOT IMPLEMENTED** | Tables missing |
| iCal sync | **NOT IMPLEMENTED** | Tables missing |
| External calendar import | **NOT IMPLEMENTED** | Tables missing |

### 4.4 RSVP/Attendance

| Feature | Status | Notes |
|---------|--------|-------|
| Event attendance tracking | **NOT IMPLEMENTED** | Attendees table missing |
| RSVP functionality | **NOT IMPLEMENTED** | No UI components |

---

## 5. Dashboard Widget Integration

### 5.1 Widget Presence by Dashboard

| Dashboard | Has Calendar Widget | Widget Type |
|-----------|---------------------|-------------|
| Golf Coach | **YES** | `<CalendarWidget />` component |
| Golf Player | **NO** | Missing |
| Baseball Coach | **PARTIAL** | Inline "Upcoming Events" section |
| Baseball Player | **NO** | Missing |

### 5.2 Widget Analysis

**Golf Coach Dashboard** (`src/app/golf/(dashboard)/dashboard/page.tsx:529-534`):
```typescript
<CalendarWidget events={calendarEvents} calendarUrl="/golf/dashboard/calendar" />
```
- Shows upcoming 3 events
- Links to full calendar
- Uses glass card styling

**Baseball Coach Dashboard**:
- Uses inline card with "Upcoming Events"
- Not the dedicated `CalendarWidget` component
- Different styling/implementation

**Player Dashboards (both sports)**:
- No calendar widget present
- Missing from sidebar/main content

---

## 6. Edge Cases & Error States

### 6.1 Loading States

| Page | Loading State | Status |
|------|---------------|--------|
| Golf Calendar | `loading.tsx` | **PASS** |
| Baseball Calendar | `loading.tsx` | **PASS** |

### 6.2 Error States

| Page | Error State | Status |
|------|-------------|--------|
| Golf Calendar | `error.tsx` | **PASS** |
| Baseball Calendar | `error.tsx` | **MISSING** |

### 6.3 Empty States

| Scenario | Handled | Status |
|----------|---------|--------|
| No events | Yes | **PASS** |
| No team | Redirects | **PASS** |
| Auth error | Error boundary | **PARTIAL** |

---

## 7. Issues Summary

### 7.1 Critical Issues

1. **Golf Calendar CRUD Missing**
   - Create event button in header logs to console only
   - `CreateEventButton` component EXISTS but is NOT USED
   - Edit/delete not implemented
   - Coach cannot manage golf events via UI

2. **Team Member Filtering Completely Broken**
   - `filteredEvents` in PremiumCalendarClient.tsx returns ALL events regardless of selection
   - Clicking team member avatars has no effect on displayed events
   - Bug location: lines 35-40 in PremiumCalendarClient.tsx

3. **Drag and Drop Not Implemented**
   - Zero drag-drop functionality in any calendar view
   - No library installed (react-dnd, @dnd-kit, etc.)
   - Events cannot be rescheduled by dragging
   - Critical for premium calendar UX

4. **Sync Settings Button Not Connected**
   - `onSyncSettings` prop exists in CalendarAvatarSidebar
   - But page.tsx does NOT pass it to PremiumCalendarClient
   - Sync button never renders
   - No sync modal or functionality

5. **6 Calendar Tables Missing**
   - `calendar_events` (unified table)
   - `calendar_event_attendees`
   - `calendar_sync_settings`
   - `calendar_preferences`
   - `calendar_sync_log`
   - `calendar_notifications`

### 7.2 High Priority Issues

6. **No Empty State for Avatar Sidebar**
   - When no team members exist, sidebar shows blank space
   - Should show "No team members" message or placeholder

7. **No Name Tooltip on Avatar Hover**
   - Hovering over team member avatars shows nothing
   - Should show tooltip with full name: "John Smith"
   - No `title` attribute or Tooltip component used

8. **Baseball Calendar Missing error.tsx**
   - No error boundary for baseball calendar
   - Crashes may show generic error

9. **Player Dashboards Missing Calendar Widget**
   - Golf Player: No widget
   - Baseball Player: No widget

10. **CreateEventButton Not Wired to Calendar**
    - Component exists with full CRUD: `src/components/golf/calendar/CreateEventButton.tsx`
    - Uses `createGolfEvent` server action (which exists and works)
    - But calendar page uses inline `onAddEvent` that just logs

### 7.3 Medium Priority Issues

11. **Inconsistent Widget Implementation**
    - Golf uses `CalendarWidget` component
    - Baseball uses inline card
    - Different UX across sports

12. **Calendar Sync Not Implemented**
    - Google Calendar integration missing
    - iCal export/import missing
    - Tables for sync settings don't exist

### 7.4 Low Priority Issues

13. **RSVP/Attendance Not Implemented**
    - No attendee tracking
    - No RSVP UI

14. **Event Click Does Nothing**
    - Clicking events only logs to console
    - No detail modal, no edit capability

---

## 8. Recommendations

### 8.1 Immediate Fixes (Critical)

1. **Wire CreateEventButton to Golf Calendar Page**
   ```typescript
   // In page.tsx, import and use CreateEventButton:
   import { CreateEventButton } from '@/components/golf/calendar/CreateEventButton';

   // Replace onAddEvent prop with actual component in the header
   // The CreateEventButton already calls createGolfEvent server action
   ```

2. **Fix Team Member Filtering Bug**
   ```typescript
   // In PremiumCalendarClient.tsx, fix filteredEvents:
   const filteredEvents = useMemo(() => {
     if (selectedMemberIds.length === 0 || selectedMemberIds.length === teamMembers.length) {
       return initialEvents;
     }
     // FIX: Actually filter by assigned team member
     return initialEvents.filter(event =>
       selectedMemberIds.includes(event.assigned_to_id)
     );
   }, [initialEvents, selectedMemberIds, teamMembers.length]);
   ```

3. **Connect Sync Settings Button**
   ```typescript
   // In page.tsx, pass onSyncSettings:
   <PremiumCalendarClient
     initialEvents={events}
     teamMembers={teamMembers}
     onSyncSettings={() => {/* open sync modal */}}
     onAddEvent={/* use CreateEventButton instead */}
   />
   ```

4. **Add Event Click Modal**
   ```typescript
   // Create EventDetailModal component
   // Wire handleEventClick to open modal instead of console.log
   ```

5. **Add Baseball Calendar error.tsx**
   ```typescript
   // Create src/app/baseball/(dashboard)/dashboard/calendar/error.tsx
   // Copy pattern from golf calendar error.tsx
   ```

6. **Add Empty State to Avatar Sidebar**
   ```typescript
   // In CalendarAvatarSidebar.tsx, add after the divider:
   {teamMembers.length === 0 && (
     <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
       <Users className="w-6 h-6 text-slate-300 mb-2" />
       <p className="text-xs text-slate-400">No team members</p>
     </div>
   )}
   ```

7. **Add Name Tooltip on Avatar Hover**
   ```typescript
   // Add title attribute to avatar button:
   <button
     key={member.id}
     title={`${member.first_name} ${member.last_name}`}
     onClick={() => handleMemberClick(member.id)}
     // ... rest of props
   >

   // OR use Tooltip component for better UX:
   <Tooltip content={`${member.first_name} ${member.last_name}`}>
     <button ...>
   </Tooltip>
   ```

### 8.2 Short-term Improvements

8. **Implement Drag and Drop**
   ```bash
   # Install library
   npm install @dnd-kit/core @dnd-kit/sortable
   ```
   ```typescript
   // Wrap EventCard with draggable
   // Add drop zones to time slots
   // Implement onDrop handler to update event time
   ```

9. **Add Calendar Widget to Player Dashboards**
   - Golf Player: Add `<CalendarWidget />` to dashboard
   - Baseball Player: Add calendar widget section

10. **Standardize Widget Implementation**
    - Use same `CalendarWidget` component for both sports
    - Ensure consistent UX

### 8.3 Future Enhancements

11. **Implement Unified Calendar Schema**
    - Create 6 calendar tables per spec
    - Migrate from sport-specific tables
    - Enable cross-sport calendar features

12. **Add Calendar Sync**
    - Google Calendar OAuth integration
    - iCal export functionality
    - Two-way sync support

13. **Implement RSVP System**
    - Attendee tracking
    - Email notifications
    - Confirmation UI

---

## 9. Compliance Matrix

| Requirement | Baseball Coach | Baseball Player | Golf Coach | Golf Player |
|-------------|----------------|-----------------|------------|-------------|
| View Calendar | **PASS** | **PASS** | **PASS** | **PASS** |
| Create Events | **PASS** | N/A | **FAIL** | N/A |
| Edit Events | **PASS** | N/A | **FAIL** | N/A |
| Delete Events | **PASS** | N/A | **FAIL** | N/A |
| Multiple Views | **PASS** | **PASS** | **PASS** | **PASS** |
| Dashboard Widget | **PARTIAL** | **FAIL** | **PASS** | **FAIL** |
| Error Handling | **FAIL** | **FAIL** | **PASS** | **PASS** |
| Loading States | **PASS** | **PASS** | **PASS** | **PASS** |
| Drag & Drop | **FAIL** | **FAIL** | **FAIL** | **FAIL** |
| Avatar Sidebar | N/A | N/A | **PARTIAL** | **PARTIAL** |
| Avatar Empty State | N/A | N/A | **FAIL** | **FAIL** |
| Avatar Hover Tooltip | N/A | N/A | **FAIL** | **FAIL** |
| Team Filtering | N/A | N/A | **FAIL** | **FAIL** |
| Sync Settings | N/A | N/A | **FAIL** | **FAIL** |
| Event Click Modal | **PASS** | **PASS** | **FAIL** | **FAIL** |

---

## 10. Conclusion

The calendar system is **SIGNIFICANTLY INCOMPLETE**. While the UI components for Golf are premium-styled with glass cards and proper sizing (72px sidebar, 48px avatars), the functionality is severely lacking:

### Critical Gaps:
1. **Golf CRUD Non-functional**: `CreateEventButton` component exists with working server action but is NOT used - the calendar header button just logs to console
2. **Drag-and-Drop Missing**: Zero implementation across all calendar views
3. **Filtering Broken**: Team member avatar selection has no effect due to bug in `filteredEvents`
4. **Sync Button Hidden**: `onSyncSettings` prop not passed from page.tsx

### What Works:
- Premium glass card UI styling
- Correct dimensions (72px sidebar, 48px avatars, 64px hour rows)
- Multiple views (day, week, month)
- Current time indicator
- Today highlighting
- Collapse/expand sidebar animation
- Event type color coding

### Priority Actions:
1. **Wire CreateEventButton** to calendar page (component exists, just needs import)
2. **Fix filtering bug** in PremiumCalendarClient.tsx line 39
3. **Pass onSyncSettings** prop from page.tsx
4. **Add event detail modal** (replace console.log with modal)
5. **Implement drag-and-drop** with @dnd-kit
6. Add baseball calendar error.tsx
7. Add calendar widgets to player dashboards

**Estimated Effort to Fix Critical Issues:**
- CreateEventButton wiring: 15 mins
- Filtering bug fix: 30 mins
- Sync settings connection: 1 hour
- Event detail modal: 2-3 hours
- Drag-and-drop: 8-12 hours

---

**End of Report**
