/**
 * The Clubhouse signal envelope (plan §4.1) and the checks the ingest route runs before anything is stored.
 *
 * One envelope is one thing that happened on a Clubhouse page: a state drawn, a toast, an action's start or outcome,
 * a crash, a view, a vital, a frustration or a tap on a numbered control. The client batches them; `POST /api/ch/signal` (plan §4.4) parses the
 * batch here, drops what doesn't fit and counts it, then redacts free text the same way `/api/log-error` does.
 *
 * Unknown fields are stripped, not stored: the envelope is the whole list of what the route may keep.
 */
import { z } from 'zod';
import { redactFreeTextForStorage } from '@/lib/observability/redact-pii';

export const SIGNAL_KINDS = ['state', 'toast', 'action', 'crash', 'view', 'vital', 'frustration', 'tap'] as const;
export const SIGNAL_OUTCOMES = ['start', 'success', 'failure', 'offline', 'busy', 'stopped-waiting', 'retry', 'cancelled'] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];
export type SignalOutcome = (typeof SIGNAL_OUTCOMES)[number];

/** The most envelopes one batch may carry. The client flushes at 20; a pagehide flush can carry a little more. */
export const MAX_BATCH = 50;
/** Failure messages are cut to this before they are stored, as `/api/log-error` cuts `message`. */
export const MESSAGE_MAX = 2000;
/** The earlier envelopes a batch with a failure may carry, so the session's timeline starts before it (plan §4.5). */
export const MAX_CONTEXT = 50;
/** The breadcrumbs a failure keeps: the last 12 (plan §4.1). */
export const TRAIL_MAX = 12;
export const TRAIL_ITEM_MAX = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A catalog code (CH- and four or five digits) or, for a row with no CH code, its five- or six-digit Bridge ID. */
const code = z.string().regex(/^(?:CH-\d{4,5}|\d{5,6})$/);

const envelope = z.object({
  v: z.literal(1),
  /**
   * Left out only where the server names it: an action's start (no outcome yet), a view (the page's own ready ID) and
   * a tap (its control).
   */
  code: code.optional(),
  kind: z.enum(SIGNAL_KINDS),
  outcome: z.enum(SIGNAL_OUTCOMES).optional(),
  page: z.string().regex(/^P\d{3}$/),
  /**
   * The screen it fired on, as a route key (src/clubhouse/lib/signal-route.ts): a route template and, for a query view
   * that is its own screen, the view's parameter names. The ingest keeps it only where the graph lists it on `page`.
   */
  route: z.string().regex(/^\/golf(?:\/[\w.[\]-]+)*(?:\?[\w=&|-]+)?$/).max(120).optional(),
  surface: z.string().regex(/^[a-z][\w-]*(?:\.[\w-]+)+$/).max(80).optional(),
  control: z.string().regex(/^CTL-P\d{3}-\d{3}$/).optional(),
  /** The `useAction` name; the route resolves it to an ACT- ID. */
  act: z.string().regex(/^[\w.:-]+$/).max(80).optional(),
  role: z.enum(['coach', 'player', 'signed-out']),
  teamId: z.string().regex(UUID).optional(),
  userId: z.string().regex(UUID).optional(),
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  seq: z.number().int().nonnegative(),
  at: z.number().int().positive(),
  release: z.string().regex(/^[\w.-]{1,64}$/),
  platform: z.enum(['ios-app', 'ios-safari', 'desktop', 'other']),
  viewport: z.enum(['phone', 'desk']),
  online: z.boolean(),
  reducedMotion: z.boolean(),
  animationsOff: z.boolean(),
  durationMs: z.number().int().nonnegative().max(600_000).optional(),
  /** A Postgres or PostgREST code: 42501, 23P01, PGRST116. */
  serverCode: z.string().regex(/^[A-Z0-9]{3,10}$/).optional(),
  message: z.string().max(8000).optional(),
  trail: z.array(z.string().max(500)).max(50).optional(),
  /**
   * A failure the client already sent to `/api/log-error` (chReport) under this envelope's session and seq: counted and
   * kept in the timeline here, but never written as a second `admin_events` row. The route stamps the Bridge columns on
   * that row instead.
   */
  reported: z.boolean().optional(),
  sentryEventId: z.string().regex(/^[0-9a-f]{32}$/).optional(),
  replayId: z.string().regex(/^[0-9a-f]{32}$/).optional(),
});

/** Whether an envelope of this kind and outcome may leave its code to the server. */
export function codeIsOptional(s: { kind: SignalKind; outcome?: SignalOutcome }): boolean {
  return s.kind === 'view' || s.kind === 'tap' || (s.kind === 'action' && s.outcome === 'start');
}

export const chSignalSchema = envelope.refine((s) => s.code !== undefined || codeIsOptional(s), { message: 'code is required', path: ['code'] });

export type ChSignal = z.infer<typeof chSignalSchema>;

/** A failure keeps its message and trail and becomes an `admin_events` row; everything else is only counted. */
export function isFailureSignal(s: Pick<ChSignal, 'kind' | 'outcome'>): boolean {
  return s.kind === 'crash' || s.outcome === 'failure';
}

export type BatchResult =
  | {
      ok: true;
      signals: ChSignal[];
      /** Envelopes sent before, carried again with a failure for its timeline: stored as events, never counted twice. */
      context: ChSignal[];
      /** Sent as the page was hidden or closed. */
      ended: boolean;
      dropped: number;
    }
  | { ok: false; reason: 'not-a-batch' | 'empty' | 'too-many' };

function parseAll(raw: unknown[]): { kept: ChSignal[]; dropped: number } {
  const kept: ChSignal[] = [];
  let dropped = 0;
  for (const item of raw) {
    const parsed = chSignalSchema.safeParse(item);
    if (parsed.success) kept.push(parsed.data);
    else dropped += 1;
  }
  return { kept, dropped };
}

/**
 * Parse one posted batch: `{ signals: [...], context?: [...], ended?: true }`. A batch that isn't that shape, is
 * empty, or carries more than MAX_BATCH signals is dropped whole; inside a good batch, each envelope that doesn't fit
 * is dropped and counted, and the rest go on. Context past MAX_CONTEXT is cut to its newest.
 */
export function parseSignalBatch(body: unknown): BatchResult {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { signals?: unknown }).signals)) return { ok: false, reason: 'not-a-batch' };
  const b = body as { signals: unknown[]; context?: unknown; ended?: unknown };
  if (b.signals.length === 0) return { ok: false, reason: 'empty' };
  if (b.signals.length > MAX_BATCH) return { ok: false, reason: 'too-many' };
  const signals = parseAll(b.signals);
  const context = Array.isArray(b.context) ? parseAll(b.context.slice(-MAX_CONTEXT)) : { kept: [], dropped: 0 };
  return { ok: true, signals: signals.kept, context: context.kept, ended: b.ended === true, dropped: signals.dropped + context.dropped };
}

/**
 * What may be stored of one envelope. Free text is kept only on a failure, cut to length and redacted with the same
 * helper `/api/log-error` uses (embedded URL secrets stripped, emails masked). A redaction that fails stores a
 * placeholder, never the raw text.
 */
export function redactSignal(s: ChSignal, onRedactionError?: (error: unknown) => void): ChSignal {
  const { message, trail, ...rest } = s;
  if (!isFailureSignal(s)) return rest;
  const out: ChSignal = { ...rest };
  if (message) out.message = redactFreeTextForStorage(message, MESSAGE_MAX, onRedactionError);
  if (trail?.length) out.trail = trail.slice(-TRAIL_MAX).map((t) => redactFreeTextForStorage(t, TRAIL_ITEM_MAX, onRedactionError));
  return out;
}
