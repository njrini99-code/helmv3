// BATCH 6: Calendar System Types

export type CalendarView = 'day' | 'week' | 'month';

export type EventType =
  | 'game'
  | 'practice'
  | 'scrimmage'
  | 'recruiting_visit'
  | 'camp'
  | 'tournament'
  | 'meeting'
  | 'workout'
  | 'class'
  | 'blocked_time'
  | 'qualifier'  // Golf-specific
  | 'travel'     // Golf-specific
  | 'other';

export type RSVPStatus = 'accepted' | 'declined' | 'tentative' | 'pending';

export type SyncDirection = 'push' | 'pull' | 'both';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  event_type: EventType;
  start_time: string; // ISO 8601
  end_time: string; // ISO 8601
  location?: string | null;
  created_by_id: string;
  organization_id?: string | null;
  team_id?: string | null;

  // Recurrence
  is_recurring: boolean;
  recurrence_rule?: string; // RRULE format
  parent_event_id?: string;

  // External sync
  google_event_id?: string;
  apple_event_id?: string;

  // Metadata
  created_at: string;
  updated_at: string;
}

export interface CalendarEventAttendee {
  id: string;
  event_id: string;
  user_id: string;
  rsvp_status: RSVPStatus;
  notified_at?: string;
  responded_at?: string;

  // Populated from join
  user?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
}

export interface CalendarPreferences {
  id: string;
  user_id: string;
  default_view: CalendarView;
  sidebar_collapsed: boolean;
  selected_avatars: string[]; // user_ids to filter by
  show_weekends: boolean;
  start_hour: number; // 0-23
  end_hour: number; // 0-23

  // Sync settings
  google_connected: boolean;
  google_calendar_id?: string;
  google_sync_direction?: SyncDirection;
  google_last_sync?: string;

  apple_connected: boolean;
  apple_calendar_url?: string;
  apple_sync_direction?: SyncDirection;
  apple_last_sync?: string;

  created_at: string;
  updated_at: string;
}

export interface CalendarNotification {
  id: string;
  user_id: string;
  event_id: string | null;
  notification_type: string;
  title: string | null;
  message: string | null;
  sent_at: string | null;
  read_at: string | null;
  action_url: string | null;
  created_at: string | null;

  // Populated from join
  event?: CalendarEvent;
  actor?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
}

export interface TeamMember {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url?: string;
  role?: 'player' | 'coach' | 'staff';
}

export interface DayEvent {
  event: CalendarEvent;
  attendees: CalendarEventAttendee[];
  topOffset: number; // px from top of day column
  height: number; // px height
  columnIndex: number; // for overlapping events
  totalColumns: number; // total overlapping events at this time
}

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  count?: number;
  until?: string; // ISO 8601
  byDay?: string[]; // ['MO', 'WE', 'FR']
  byMonthDay?: number[];
  byMonth?: number[];
}

export interface CalendarSync {
  provider: 'google' | 'apple';
  connected: boolean;
  calendarId?: string;
  direction: SyncDirection;
  lastSync?: string;
  status: 'idle' | 'syncing' | 'error';
  errorMessage?: string;
}

export interface EventFormData {
  title: string;
  description: string;
  event_type: EventType;
  start_time: Date;
  end_time: Date;
  location: string;
  attendee_ids: string[];
  is_recurring: boolean;
  recurrence_rule?: RecurrenceRule;
}

// Event type metadata for styling and display
export interface EventTypeConfig {
  label: string;
  color: string; // Tailwind color class
  bgColor: string;
  borderColor: string;
  textColor: string;
  showText: boolean; // false for classes/blocked time
}
