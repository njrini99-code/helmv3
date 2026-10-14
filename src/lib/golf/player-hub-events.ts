import type { Json } from '@/lib/types/database';

/**
 * The rows `get_player_hub_events` returns. The generated types say only `Json` (the function returns one jsonb
 * array), so the shape is checked here, at the boundary, instead of being asserted onto the call.
 *
 * Source: supabase/migrations/20260527000000_prod_public_baseline.sql (`jsonb_build_object` per event, `[]` when
 * there are none). `is_mandatory` is always false there: golf_events has no such column.
 */
export type HubRsvpStatus = 'pending' | 'accepted' | 'declined' | 'tentative';

export interface HubEventRow {
  id: string;
  event_id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  is_mandatory: boolean;
  /** null means the player has no attendance row: not invited, so there is nothing to reply to. */
  rsvp_status: HubRsvpStatus | null;
  going_count: number;
  maybe_count: number;
}

/**
 * golf_event_attendance_status_check allows nine values; the hub speaks four. The three older synonyms map to the
 * reply they mean. Any other value (excused, unexcused, or one added later) is still an invitation, so it reads as
 * pending: turning it into null would hide an event the player was invited to (src/clubhouse/data/hub.ts treats
 * null as "not invited").
 */
const RSVP_ALIASES: Readonly<Record<string, HubRsvpStatus>> = {
  pending: 'pending',
  accepted: 'accepted',
  declined: 'declined',
  tentative: 'tentative',
  attending: 'accepted',
  not_attending: 'declined',
  maybe: 'tentative',
};

function isObject(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: Json | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function count(value: Json | undefined): number | null {
  if (value == null) return 0;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Parses the RPC's result. `null` data is no events (as before). Anything that is not the documented array of
 * events returns `{ ok: false }`, so the caller treats it as a failed read rather than an empty hub.
 */
export function parsePlayerHubEvents(data: Json | null): { ok: true; rows: HubEventRow[] } | { ok: false; reason: string } {
  if (data == null) return { ok: true, rows: [] };
  if (!Array.isArray(data)) return { ok: false, reason: `expected an array, got ${typeof data}` };

  const rows: HubEventRow[] = [];
  for (const [index, item] of data.entries()) {
    if (!isObject(item)) return { ok: false, reason: `event ${index} is not an object` };
    const id = str(item.id);
    const title = str(item.title);
    const eventType = str(item.event_type);
    const startTime = str(item.start_time);
    if (!id || title == null || eventType == null || !startTime) {
      return { ok: false, reason: `event ${index} is missing id, title, event_type or start_time` };
    }
    const going = count(item.going_count);
    const maybe = count(item.maybe_count);
    if (going == null || maybe == null) return { ok: false, reason: `event ${index} has a non-numeric count` };
    const rawRsvp = str(item.rsvp_status);
    rows.push({
      id,
      event_id: str(item.event_id) ?? id,
      title,
      event_type: eventType,
      start_time: startTime,
      end_time: str(item.end_time),
      location: str(item.location),
      is_mandatory: item.is_mandatory === true,
      rsvp_status: rawRsvp == null ? null : (RSVP_ALIASES[rawRsvp] ?? 'pending'),
      going_count: going,
      maybe_count: maybe,
    });
  }
  return { ok: true, rows };
}
