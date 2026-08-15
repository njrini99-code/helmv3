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
  | 'showcase'   // Baseball-specific (recruiting-facing — event-ink 'pursuit')
  | 'tryout'     // Baseball-specific (recruiting-facing — event-ink 'pursuit')
  | 'other';

export type RSVPStatus = 'accepted' | 'declined' | 'tentative' | 'pending';

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

/**
 * Splits a single `full_name` display column into a `{ first_name, last_name }`
 * pair, for the handful of calendar components that still expect discrete
 * given/family fields instead of the canonical `full_name` above (see
 * `TeamMember` in `CalendarAvatarSidebar.tsx` / `PremiumCalendarClient.tsx`,
 * and their consumers under `src/components/fairway/pages/calendar/`).
 *
 * This is a best-effort heuristic, NOT a real name parser — a single text
 * column cannot be reliably decomposed into "given name" + "family name" for
 * every real name (compound surnames like "van der Berg", single-word names,
 * honorifics, parenthetical annotations like "(Demo)" tacked onto placeholder
 * accounts, etc).
 *
 * The one guarantee it makes is RECONSTRUCTABILITY: `first_name` is the first
 * whitespace-delimited token and `last_name` is everything after it, so
 * `` `${first_name} ${last_name}`.trim() `` always reproduces the original
 * (trimmed) input. That is what lets a consumer render the real, complete
 * name — see the invite grid in `FairwayEventEditor.tsx`.
 *
 * What it does NOT guarantee: that `last_name` is a clean, letter-led
 * surname suitable for indexing. `splitDisplayName('Coach (Demo)')` returns
 * `{ first_name: 'Coach', last_name: '(Demo)' }` — a faithful, reconstructable
 * split, but `last_name[0]` is `'('`, not a letter. Consumers that abbreviate
 * a name to initials MUST use `safeInitial()` below rather than indexing
 * `[0]` directly — that exact mismatch previously rendered a coach's
 * placeholder name as "Coach (." in the event editor's invite grid.
 */
export function splitDisplayName(fullName: string | null | undefined): {
  first_name: string;
  last_name: string;
} {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed) return { first_name: '', last_name: '' };
  const parts = trimmed.split(/\s+/);
  return {
    first_name: parts[0] ?? '',
    last_name: parts.slice(1).join(' '),
  };
}

/**
 * Safe single-character initial for avatar/abbreviation UI.
 *
 * Returns `value`'s own leading character, uppercased — but ONLY when that
 * leading character is actually a letter or digit. Returns `''` for an empty
 * string, a single-word name with no last name, or a value that starts with
 * punctuation (e.g. the `(Demo)` tail of a `splitDisplayName()` result).
 *
 * `TeamMember.last_name` is not a guaranteed surname — for a name like
 * "Coach (Demo)" it holds the literal string "(Demo)" (see
 * `splitDisplayName` above). Blindly indexing `last_name[0]` for an initial
 * rendered that as "(", producing "Coach (." in the live app. `safeInitial`
 * refuses to turn punctuation into an initial; callers get a shorter (never
 * mangled) abbreviation instead.
 */
export function safeInitial(value: string | null | undefined): string {
  const char = (value ?? '').trim().charAt(0);
  return /[\p{L}\p{N}]/u.test(char) ? char.toUpperCase() : '';
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

// Event type metadata for styling and display
export interface EventTypeConfig {
  label: string;
  color: string; // Tailwind color class
  bgColor: string;
  /** Small leading category dot (replaces the former left-border stripe). */
  dotColor: string;
  /** 3px soft halo for the dot — dotColor's family at ~18% alpha (v3 accent-dot ring). */
  dotRingColor: string;
  textColor: string;
  showText: boolean; // false for classes/blocked time
}
