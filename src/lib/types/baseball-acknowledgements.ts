// =============================================================================
// src/lib/types/baseball-acknowledgements.ts
//
// HAND-WRITTEN Row/Insert/Update types for BaseballHelm event acknowledgements.
//
// We cannot regenerate database.ts against the live shared DB (no apply), so the
// canonical source for these types is the Wave 1 migration DDL:
//   supabase/migrations/20260624000040_baseball_timeline_and_acks.sql
//
// Table: baseball_event_acknowledgements
//   id              uuid PK default gen_random_uuid()
//   event_id        uuid NOT NULL  -> baseball_events(id) ON DELETE CASCADE
//   user_id         uuid NOT NULL  -> auth.users(id)      ON DELETE CASCADE
//   acknowledged_at timestamptz NOT NULL default now()
//   UNIQUE (event_id, user_id)
//
// A "read receipt / RSVP-ack": one row per (event, user). RLS:
//   - SELECT  : own rows OR team staff of the event's team
//   - INSERT  : user_id = auth.uid() (self only)
//   - UPDATE  : own rows (re-ack timestamp)
//   - DELETE  : own rows (withdraw)
//
// Owned by the Wave-4 Coach Command Center half (ui-systems). A single
// integration agent re-exports these from the type barrel later; do NOT edit
// src/lib/types/index.ts here.
// =============================================================================

/** A persisted acknowledgement row (read receipt) for a baseball event. */
export interface BaseballEventAcknowledgementRow {
  id: string;
  event_id: string;
  user_id: string;
  acknowledged_at: string;
}

/**
 * Insert shape. Only event_id is required from the caller; user_id is enforced
 * server-side to auth.uid() (RLS WITH CHECK), and id / acknowledged_at default
 * in the database. We model user_id as optional-but-allowed so the server
 * action can set it explicitly to the resolved user.
 */
export interface BaseballEventAcknowledgementInsert {
  id?: string;
  event_id: string;
  user_id?: string;
  acknowledged_at?: string;
}

/** Update shape — in practice only the re-ack timestamp is ever updated. */
export interface BaseballEventAcknowledgementUpdate {
  acknowledged_at?: string;
}

// =============================================================================
// Timeline EVENT acknowledgements
//
// Canonical source: supabase/migrations/20260624000430_baseball_timeline_event_acks.sql
//
// Table: baseball_timeline_event_acks
//   id                uuid PK default gen_random_uuid()
//   timeline_event_id uuid NOT NULL -> baseball_player_timeline_events(id) CASCADE
//   user_id           uuid NOT NULL -> auth.users(id)                      CASCADE
//   acknowledged_at   timestamptz NOT NULL default now()
//   UNIQUE (timeline_event_id, user_id)
//
// Distinct from baseball_event_acknowledgements (which is for CALENDAR events).
// This records "I have seen / acknowledged this TIMELINE event" — closing the
// source -> signal -> action -> timeline -> outcome loop at display. RLS:
//   - SELECT : own rows OR team staff of the underlying timeline event's team
//   - INSERT : user_id = auth.uid() AND the event is VISIBLE to me (a player can
//              never ack a staff_only row they cannot read)
//   - UPDATE : own rows (re-ack timestamp)
//   - DELETE : own rows (withdraw)
// =============================================================================

/** A persisted acknowledgement row (read receipt) for a player timeline event. */
export interface BaseballTimelineEventAckRow {
  id: string;
  timeline_event_id: string;
  user_id: string;
  acknowledged_at: string;
}

/**
 * Insert shape. Only timeline_event_id is required from the caller; user_id is
 * enforced server-side to auth.uid() (RLS WITH CHECK), and id / acknowledged_at
 * default in the database.
 */
export interface BaseballTimelineEventAckInsert {
  id?: string;
  timeline_event_id: string;
  user_id?: string;
  acknowledged_at?: string;
}

/** Update shape — in practice only the re-ack timestamp is ever updated. */
export interface BaseballTimelineEventAckUpdate {
  acknowledged_at?: string;
}
