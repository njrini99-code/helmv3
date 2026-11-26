'use client';

import * as Sentry from '@sentry/nextjs';
import type { ChSignal, SignalKind, SignalOutcome } from '@/lib/admin/clubhouse/signal';
import { isNativeApp } from '@/lib/utils/capacitor';
import { CH_PHONE_QUERY } from './phone-query';

/**
 * Clubhouse signals, client side (Bridge plan §4.1-§4.4). A signal is one thing that happened on a Clubhouse page: a
 * state drawn, a toast, an action's start or outcome, a crash, a view, a vital, a frustration or a tap on a numbered
 * control. `chSignal` queues one; the queue posts to `/api/ch/signal` every 10 s, at 20, and with sendBeacon when the
 * page is hidden. Nothing here throws, awaits or slows a tap: every step is wrapped, and a signal that can't be built is
 * dropped.
 *
 * Off until the shell says otherwise (`configureSignals`, from the `clubhouse_signals` kill switch). Signals sent before
 * the shell has configured (a child's effect runs before its parent's) wait in a short buffer and take the shell's
 * page and role once it does, or are dropped when the switch is off.
 */

export const SIGNAL_ENDPOINT = '/api/ch/signal';
/** The queue posts at this many envelopes, or after FLUSH_MS, whichever comes first. */
export const FLUSH_AT = 20;
export const FLUSH_MS = 10_000;
/** The most envelopes one post carries (the route's MAX_BATCH). */
const POST_MAX = 50;
/** Envelopes kept after they are sent, carried again as context with a later failure (the route's MAX_CONTEXT). */
const RING = 50;
/** Signals waiting for the shell to configure, and envelopes waiting to post, are capped so a stuck page can't grow them. */
const PENDING_MAX = 50;
const QUEUE_MAX = 200;
/** sendBeacon refuses bodies over 64 KB; a post that big goes by keepalive fetch, which has the same cap, then plain. */
const BEACON_MAX = 60_000;
const MESSAGE_MAX = 2000;
const TRAIL_MAX = 12;
const TRAIL_ITEM_MAX = 200;
const DURATION_MAX = 600_000;
const STORE_KEY = 'ch-signal-session';

const CODE = /^(?:CH-\d{4,5}|\d{5,6})$/;
const PAGE = /^P\d{3}$/;
const SURFACE = /^[a-z][\w-]*(?:\.[\w-]+)+$/;
const CONTROL = /^CTL-P\d{3}-\d{3}$/;
const ACT = /^[\w.:-]{1,80}$/;
const SERVER_CODE = /^[A-Z0-9]{3,10}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RELEASE = /^[\w.-]{1,64}$/;
const HEX32 = /^[0-9a-f]{32}$/;

export type SignalRole = ChSignal['role'];

export type ChSignalInput = {
  kind: SignalKind;
  code?: string;
  outcome?: SignalOutcome;
  /** A surface (`messages.composer`), as chReport takes it. */
  surface?: string;
  control?: string;
  /** The `useAction` name, or a vital's metric name. */
  act?: string;
  durationMs?: number;
  /** A Postgres or PostgREST code the server answered with. */
  serverCode?: string;
  message?: string;
  /** The failure also went to chReport, which wrote its row: the route stamps that row rather than writing another. */
  reported?: boolean;
  /** A page other than the shell's current one. */
  page?: string;
};

/** What chReport carries as `chSignal`, so the route can find the row it wrote and stamp it. */
export type ChSignalRef = { sessionId: string; seq: number; code?: string; page: string; act?: string };

type Config = { enabled: boolean; role: SignalRole; teamId: string | null; page: string; userId: string | null };

type Pending = { input: ChSignalInput; seq: number; at: number; trail: string[] | undefined; page: string | undefined };

type State = {
  config: Config | null;
  session: { id: string; seq: number; user?: string | null } | null;
  pending: Pending[];
  queue: ChSignal[];
  ring: ChSignal[];
  trail: string[];
  timer: ReturnType<typeof setTimeout> | null;
  listening: boolean;
};

const state: State = { config: null, session: null, pending: [], queue: [], ring: [], trail: [], timer: null, listening: false };

function randomHex32(): string {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let out = '';
    while (out.length < 32) out += Math.floor(Math.random() * 16).toString(16);
    return out;
  }
}

/** This tab's session: one id per tab, kept in sessionStorage so a reload carries on its numbering. */
function session(): { id: string; seq: number } {
  if (state.session) return state.session;
  let stored: { id?: unknown; seq?: unknown } | null;
  try {
    stored = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? 'null');
  } catch {
    stored = null;
  }
  const user = state.config?.userId ?? null;
  // A session belongs to one signed-in person: a stored session of someone else (a shared iPad) starts afresh.
  const sameUser = (stored as { user?: unknown } | null)?.user === user;
  const id = sameUser && typeof stored?.id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(stored.id) ? stored.id : randomHex32();
  const seq = sameUser && typeof stored?.seq === 'number' && Number.isInteger(stored.seq) && stored.seq >= 0 ? stored.seq : 0;
  state.session = { id, seq, user };
  return state.session;
}

/** Keeps the numbering for a reload, only once the shell has turned signals on, so a tab with them off stores nothing. */
function persist(): void {
  if (!state.config?.enabled || !state.session) return;
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify({ id: state.session.id, seq: state.session.seq, user: state.session.user ?? null }));
  } catch {
    // Private mode or a full store: the numbering still holds for this page.
  }
}

function nextSeq(): { id: string; seq: number } {
  const s = session();
  const seq = s.seq;
  s.seq += 1;
  persist();
  return { id: s.id, seq };
}

function release(): string {
  const r = process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? '';
  return RELEASE.test(r) ? r : 'unknown';
}

function platform(): ChSignal['platform'] {
  try {
    const ua = navigator.userAgent;
    if (isNativeApp()) return /android/i.test(ua) ? 'other' : 'ios-app';
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios) return 'ios-safari';
    if (/Android|Mobi/i.test(ua)) return 'other';
    return 'desktop';
  } catch {
    return 'other';
  }
}

function matches(query: string): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

function replayId(): string | undefined {
  try {
    // The replay integration is app-wide (instrumentation-client.ts) and may not be recording this session.
    const id = Sentry.getReplay?.()?.getReplayId?.();
    return typeof id === 'string' && HEX32.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

function isFailure(kind: SignalKind, outcome: SignalOutcome | undefined): boolean {
  return kind === 'crash' || outcome === 'failure';
}

function codeOptional(kind: SignalKind, outcome: SignalOutcome | undefined): boolean {
  return kind === 'view' || kind === 'tap' || (kind === 'action' && outcome === 'start');
}

function trailEntry(input: ChSignalInput): string {
  return [input.kind, input.outcome, input.code ?? input.act ?? input.control].filter(Boolean).join(' ').slice(0, TRAIL_ITEM_MAX);
}

/** A step for the failure trail: what the coach did just before something broke (chTrail feeds it too). */
export function noteSignalTrail(message: string): void {
  try {
    state.trail.push(String(message).slice(0, TRAIL_ITEM_MAX));
    if (state.trail.length > TRAIL_MAX) state.trail.splice(0, state.trail.length - TRAIL_MAX);
  } catch {
    // Never let a breadcrumb break the caller.
  }
}

/** One envelope the route's schema accepts, or null when what was sent can't make one. */
function build(p: Pending, config: Config): ChSignal | null {
  const { input } = p;
  const page = p.page && PAGE.test(p.page) ? p.page : config.page;
  if (!PAGE.test(page)) return null;
  const code = input.code && CODE.test(input.code) ? input.code : undefined;
  if (!code && !codeOptional(input.kind, input.outcome)) return null;
  const s = session();
  const env: ChSignal = {
    v: 1,
    kind: input.kind,
    page,
    role: config.role,
    sessionId: s.id,
    seq: p.seq,
    at: p.at,
    release: release(),
    platform: platform(),
    viewport: matches(CH_PHONE_QUERY) ? 'phone' : 'desk',
    online: typeof navigator === 'undefined' || navigator.onLine !== false,
    reducedMotion: matches('(prefers-reduced-motion: reduce)'),
    animationsOff: typeof document !== 'undefined' && document.documentElement.dataset.motion === 'off',
  };
  if (code) env.code = code;
  if (input.outcome) env.outcome = input.outcome;
  if (input.surface && SURFACE.test(input.surface) && input.surface.length <= 80) env.surface = input.surface;
  if (input.control && CONTROL.test(input.control)) env.control = input.control;
  if (input.act && ACT.test(input.act)) env.act = input.act;
  if (config.teamId && UUID.test(config.teamId)) env.teamId = config.teamId;
  if (typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)) env.durationMs = Math.min(DURATION_MAX, Math.max(0, Math.round(input.durationMs)));
  if (input.serverCode && SERVER_CODE.test(input.serverCode)) env.serverCode = input.serverCode;
  if (isFailure(input.kind, input.outcome)) {
    if (input.message) env.message = String(input.message).slice(0, MESSAGE_MAX);
    if (p.trail?.length) env.trail = p.trail;
    if (input.reported) env.reported = true;
    const replay = replayId();
    if (replay) env.replayId = replay;
  }
  return env;
}

function schedule(): void {
  if (state.queue.length >= FLUSH_AT) {
    queueMicrotask(() => flushSignals());
    return;
  }
  if (state.timer || state.queue.length === 0) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    flushSignals();
  }, FLUSH_MS);
}

function enqueue(env: ChSignal): void {
  state.queue.push(env);
  if (state.queue.length > QUEUE_MAX) state.queue.splice(0, state.queue.length - QUEUE_MAX);
  schedule();
}

function post(body: string): void {
  try {
    if (body.length <= BEACON_MAX && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(SIGNAL_ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
    }
  } catch {
    // Fall through to fetch.
  }
  try {
    void fetch(SIGNAL_ENDPOINT, {
      method: 'POST',
      body,
      keepalive: body.length <= BEACON_MAX,
      credentials: 'same-origin',
      headers: { 'content-type': 'text/plain' },
    }).catch(() => undefined);
  } catch {
    // Nothing left to try: the signal is lost, and nothing the coach did is.
  }
}

/** Post what is queued now. `ended`: the page is going away (pagehide), which closes the session's open actions. */
export function flushSignals(ended = false): void {
  try {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    if (!state.config?.enabled) return;
    while (state.queue.length > 0) {
      const batch = state.queue.splice(0, POST_MAX);
      const last = state.queue.length === 0;
      const sent = new Set(batch.map((s) => s.seq));
      const context = batch.some((s) => isFailure(s.kind, s.outcome)) ? state.ring.filter((s) => !sent.has(s.seq)) : [];
      const payload: { signals: ChSignal[]; context?: ChSignal[]; ended?: true } = { signals: batch };
      if (context.length) payload.context = context.slice(-RING);
      if (ended && last) payload.ended = true;
      post(JSON.stringify(payload));
      state.ring.push(...batch.map(({ message: _m, trail: _t, ...rest }) => rest as ChSignal));
      if (state.ring.length > RING) state.ring.splice(0, state.ring.length - RING);
    }
  } catch {
    // A post that can't be built is dropped; the page carries on.
  }
}

function listen(): void {
  if (state.listening || typeof window === 'undefined') return;
  state.listening = true;
  try {
    window.addEventListener('pagehide', () => flushSignals(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushSignals();
    });
  } catch {
    // No page events: the timer still flushes.
  }
}

/**
 * The shell's word on whether signals go out, and as whom. Called on every page, role or team change; the first call
 * with `enabled` sends what waited for it, and `enabled: false` drops everything queued.
 */
export function configureSignals(next: { enabled: boolean; role: string; teamId?: string | null; page: string; userId?: string | null }): void {
  try {
    const role: SignalRole = next.role === 'coach' || next.role === 'player' ? next.role : 'signed-out';
    const userId = next.userId ?? null;
    // Someone else signed in on this tab: their signals start a session of their own (security review of #2611, M4).
    // The first configure adopts the session the page started before the shell knew who it was.
    if (state.config && state.session && (state.config.userId ?? null) !== userId) {
      if (state.queue.length) flushSignals();
      state.session = null;
    } else if (state.session && !state.config) state.session.user = userId;
    state.config = { enabled: next.enabled, role, teamId: next.teamId ?? null, page: next.page, userId };
    if (!next.enabled) {
      state.pending = [];
      state.queue = [];
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
      return;
    }
    listen();
    persist();
    const waiting = state.pending;
    state.pending = [];
    for (const p of waiting) {
      const env = build(p, state.config);
      if (env) enqueue(env);
    }
  } catch {
    // Misconfigured: nothing goes out.
  }
}

/**
 * Queue one signal. Returns where it sits in this tab's session, for chReport to carry, or null when signals are off
 * or what was sent can't make an envelope. Never throws.
 */
export function chSignal(input: ChSignalInput): ChSignalRef | null {
  try {
    if (state.config && !state.config.enabled) return null;
    // Before the shell says signals are on, a signal waits in memory but has no place yet to report: nothing reaches
    // chReport, the error logs or Sentry while the switch is off (security review of #2611, L1).
    if (typeof window === 'undefined') return null;
    const failure = isFailure(input.kind, input.outcome);
    const trail = failure && state.trail.length ? state.trail.slice(-TRAIL_MAX) : undefined;
    noteSignalTrail(trailEntry(input));
    const { id, seq } = nextSeq();
    const p: Pending = { input, seq, at: Date.now(), trail, page: input.page };
    const page = (input.page && PAGE.test(input.page) ? input.page : state.config?.page) ?? 'P001';
    if (!state.config) {
      state.pending.push(p);
      if (state.pending.length > PENDING_MAX) state.pending.splice(0, state.pending.length - PENDING_MAX);
    } else {
      const env = build(p, state.config);
      if (!env) return null;
      enqueue(env);
    }
    if (!state.config?.enabled) return null;
    const ref: ChSignalRef = { sessionId: id, seq, page };
    if (input.code) ref.code = input.code;
    if (input.act) ref.act = input.act;
    return ref;
  } catch {
    return null;
  }
}

let reporting: ChSignalRef | null = null;

/**
 * Runs `report` (a chReport call) as the report of the signal at `ref`, so the row it writes carries that signal's
 * place and the route stamps it instead of writing a second one. Callers' chReport arguments stay as they were.
 */
export function reportingSignal(ref: ChSignalRef | null, report: () => void): void {
  const before = reporting;
  reporting = ref;
  try {
    report();
  } finally {
    reporting = before;
  }
}

/** The signal whose report is being written right now, if a reportingSignal call is running one. */
export function currentReportSignal(): ChSignalRef | null {
  return reporting;
}

/** Tests only: forget everything this module holds. */
export function resetSignalsForTests(): void {
  if (state.timer) clearTimeout(state.timer);
  state.config = null;
  state.session = null;
  state.pending = [];
  state.queue = [];
  state.ring = [];
  reporting = null;
  state.trail = [];
  state.timer = null;
  state.listening = false;
}
