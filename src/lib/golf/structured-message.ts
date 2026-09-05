/**
 * ============================================================================
 * Structured Helm messages — the shapes that ride `golf_messages.payload`
 * ----------------------------------------------------------------------------
 * A structured message IS a message. It uses the same row, the same RLS, the
 * same realtime channel and the same reply/reaction/search paths as text — the
 * only difference is that `kind` is not 'text' and `payload` carries an object.
 *
 * These types are the CONTRACT for that JSON. The database enforces that a
 * structured message has a payload at all (`golf_messages_payload_matches_kind`)
 * but Postgres will not check the shape of a jsonb blob, so anything reading
 * one has to treat it as untrusted and narrow it. `parseStructuredPayload`
 * below is the only sanctioned way in: it returns null rather than throwing,
 * because a malformed payload must degrade to "no card" and never take the
 * thread down with it.
 * ========================================================================== */

export type StructuredKind = 'system' | 'practice' | 'event' | 'rsvp' | 'poll' | 'travel';

/** Narration, not speech: "Coach moved practice to 3:30". No bubble, no author. */
export interface SystemPayload {
  text: string;
}

/** A practice or schedule change, linked to a real golf_events row. */
export interface PracticePayload {
  title: string;
  /** ISO. Rendered in the reader's timezone, never pre-formatted by the sender. */
  startsAt: string;
  endsAt?: string;
  location?: string;
  /** The real event this refers to. Absent means no "View in Calendar". */
  eventId?: string;
  notifiedCount?: number;
}

/** A generic calendar object — a tournament, a meeting, a qualifier. */
export interface EventPayload {
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  eventId?: string;
  /** Short lines of context: "Tee times posted", "Travel confirmed". */
  notes?: string[];
}

export interface RsvpPayload {
  title: string;
  startsAt?: string;
  location?: string;
  eventId?: string;
}

export interface PollOption {
  /** Stable key stored in golf_message_responses.choice — NOT the label. */
  key: string;
  label: string;
}

export interface PollPayload {
  question: string;
  options: PollOption[];
}

export interface TravelPayload {
  title: string;
  departsAt: string;
  location?: string;
  notes?: string;
}

export type StructuredPayload =
  | ({ kind: 'system' } & SystemPayload)
  | ({ kind: 'practice' } & PracticePayload)
  | ({ kind: 'event' } & EventPayload)
  | ({ kind: 'rsvp' } & RsvpPayload)
  | ({ kind: 'poll' } & PollPayload)
  | ({ kind: 'travel' } & TravelPayload);

/** The three answers an RSVP accepts. Closed, like the reaction vocabulary. */
export const RSVP_CHOICES = ['going', 'maybe', 'cant'] as const;
export type RsvpChoice = (typeof RSVP_CHOICES)[number];

export const RSVP_LABELS: Record<RsvpChoice, string> = {
  going: 'Going',
  maybe: 'Maybe',
  cant: "Can't",
};

/** A travel object's only answer. */
export const TRAVEL_ACK = 'ack';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/**
 * Narrow an untrusted `payload` for a given `kind`, or return null.
 *
 * Null means "render this as an ordinary message" — never an exception. A
 * malformed card is a cosmetic loss; a throw inside a message list unmounts the
 * conversation. Every branch requires the fields the renderer actually reads,
 * so a half-written payload cannot produce a card with blank headings.
 */
export function parseStructuredPayload(
  kind: string | null | undefined,
  payload: unknown,
): StructuredPayload | null {
  if (!kind || kind === 'text' || !isRecord(payload)) return null;

  switch (kind) {
    case 'system': {
      const text = str(payload.text);
      return text ? { kind: 'system', text } : null;
    }
    case 'practice': {
      const title = str(payload.title);
      const startsAt = str(payload.startsAt);
      if (!title || !startsAt) return null;
      return {
        kind: 'practice',
        title,
        startsAt,
        endsAt: str(payload.endsAt),
        location: str(payload.location),
        eventId: str(payload.eventId),
        notifiedCount:
          typeof payload.notifiedCount === 'number' && payload.notifiedCount >= 0
            ? payload.notifiedCount
            : undefined,
      };
    }
    case 'event': {
      const title = str(payload.title);
      const startsAt = str(payload.startsAt);
      if (!title || !startsAt) return null;
      return {
        kind: 'event',
        title,
        startsAt,
        endsAt: str(payload.endsAt),
        location: str(payload.location),
        eventId: str(payload.eventId),
        notes: Array.isArray(payload.notes)
          ? payload.notes.filter((n): n is string => typeof n === 'string')
          : undefined,
      };
    }
    case 'rsvp': {
      const title = str(payload.title);
      if (!title) return null;
      return {
        kind: 'rsvp',
        title,
        startsAt: str(payload.startsAt),
        location: str(payload.location),
        eventId: str(payload.eventId),
      };
    }
    case 'poll': {
      const question = str(payload.question);
      if (!question || !Array.isArray(payload.options)) return null;
      const options = payload.options
        .filter(isRecord)
        .map(o => ({ key: str(o.key), label: str(o.label) }))
        .filter((o): o is PollOption => Boolean(o.key && o.label));
      // A poll with fewer than two options is not a poll.
      return options.length >= 2 ? { kind: 'poll', question, options } : null;
    }
    case 'travel': {
      const title = str(payload.title);
      const departsAt = str(payload.departsAt);
      if (!title || !departsAt) return null;
      return {
        kind: 'travel',
        title,
        departsAt,
        location: str(payload.location),
        notes: str(payload.notes),
      };
    }
    default:
      return null;
  }
}

/**
 * "Today · 3:30–5:00 PM" — formatted in the READER's timezone from an ISO
 * instant, never pre-rendered by the sender. A coach in Eastern posting "3:30"
 * to a player who has travelled is the classic version of this bug.
 *
 * Explicit `en-US` per the repo's locale rule: an implicit locale renders
 * differently on the server and the client and shows up as a hydration
 * mismatch.
 */
export function formatEventWindow(startsAt: string, endsAt?: string): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return '';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const dayDiff = Math.round((startOfDay.getTime() - startOfToday.getTime()) / 86_400_000);

  const day =
    dayDiff === 0 ? 'Today'
      : dayDiff === 1 ? 'Tomorrow'
        : dayDiff === -1 ? 'Yesterday'
          : start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const time = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const end = endsAt ? new Date(endsAt) : null;
  const window =
    end && !Number.isNaN(end.getTime()) ? `${time(start)}–${time(end)}` : time(start);

  return `${day} · ${window}`;
}
