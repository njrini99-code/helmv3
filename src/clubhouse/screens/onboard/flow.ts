'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { AFTER_ACCOUNT, PLAN, pathOf, type CodeKind, type OnboardPath, type OnboardStep, type RequestDetails } from './logic';

/**
 * Where someone is in sign-up, and what they have told us. The password is
 * never kept here. The rest survives a reload and the one route change sign-up
 * makes (the account is created on /golf/signup; a player finishes on
 * /golf/player, where the same screens pick up at "Your game"), in this tab's
 * sessionStorage only, and is cleared when the member card is issued.
 */
export interface Draft {
  intent: 'code' | 'request' | null;
  code: string;
  kind: CodeKind | null;
  teamName: string | null;
  first: string;
  last: string;
  grad: number | null;
  email: string;
  hcp: number | null;
  city: string;
  state: string;
  photoUrl: string | null;
  req: RequestDetails;
  /** Set once the account exists: Back never crosses it, and a reload resumes after it. */
  accountMade: boolean;
  joinedTeam: boolean | null;
}

export const EMPTY_DRAFT: Draft = {
  intent: null,
  code: '',
  kind: null,
  teamName: null,
  first: '',
  last: '',
  grad: null,
  email: '',
  hcp: null,
  city: '',
  state: '',
  photoUrl: null,
  req: { who: null, first: '', last: '', school: '', coach: '', email: '', note: '' },
  accountMade: false,
  joinedTeam: null,
};

export const DRAFT_KEY = 'ch.onboard.v1';

export interface FlowState {
  d: Draft;
  hist: OnboardStep[];
  dir: 'fwd' | 'back';
  /** Bumps on every move, so the question remounts and plays its entrance. */
  n: number;
}

type Action =
  | { t: 'patch'; patch: Partial<Draft> }
  | { t: 'next'; patch?: Partial<Draft>; to?: OnboardStep }
  | { t: 'back' }
  | { t: 'restore'; state: FlowState };

export const pathOfDraft = (d: Draft): OnboardPath => pathOf(d.intent, d.kind);

/** Back steps one question, but never back across the account once it exists. */
export function canGoBack(s: Pick<FlowState, 'd' | 'hist'>): boolean {
  if (s.hist.length < 2) return false;
  const prev = s.hist[s.hist.length - 2]!;
  return !(s.d.accountMade && !AFTER_ACCOUNT.has(prev));
}

function reduce(s: FlowState, a: Action): FlowState {
  switch (a.t) {
    case 'patch':
      return { ...s, d: { ...s.d, ...a.patch } };
    case 'next': {
      const d = { ...s.d, ...(a.patch ?? {}) };
      const plan = PLAN[pathOfDraft(d)];
      const cur = s.hist[s.hist.length - 1]!;
      const i = plan.indexOf(cur);
      const to = a.to ?? plan[i >= 0 ? i + 1 : 1];
      if (!to) return { ...s, d };
      const kept = s.hist.filter((x) => plan.includes(x));
      return { d, hist: [...kept, to], dir: 'fwd', n: s.n + 1 };
    }
    case 'back':
      return canGoBack(s) ? { ...s, hist: s.hist.slice(0, -1), dir: 'back', n: s.n + 1 } : s;
    case 'restore':
      return a.state;
  }
}

/** A saved draft, read defensively: anything malformed starts over. */
export function readDraft(raw: string | null): FlowState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<FlowState>;
    if (!v || !v.d || !Array.isArray(v.hist) || v.hist.length === 0) return null;
    const d = { ...EMPTY_DRAFT, ...v.d, req: { ...EMPTY_DRAFT.req, ...(v.d.req ?? {}) } };
    const plan = PLAN[pathOfDraft(d)];
    const hist = v.hist.filter((x): x is OnboardStep => (plan as readonly string[]).includes(x));
    if (hist.length === 0) return null;
    return { d, hist, dir: 'fwd', n: 0 };
  } catch {
    return null;
  }
}

function load(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
/** Writes the draft straight away, for the moment just before sign-up changes route. */
export function saveDraftNow(state: Pick<FlowState, 'd' | 'hist'>): void {
  save(DRAFT_KEY, JSON.stringify(state));
}

function save(key: string, v: string | null) {
  try {
    if (v === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, v);
  } catch {
    /* private mode: the flow still works, it just does not survive a reload */
  }
}

/**
 * The flow. `start` is the first screen (the intro, or "Your game" when a new
 * player lands on /golf/player); `seed` fills what the server already knows.
 * The saved draft is read after mount (the server has no sessionStorage), so
 * the first paint always matches the server's.
 */
export function useFlow(start: OnboardStep, seed: Partial<Draft>, persist = true) {
  const d0 = { ...EMPTY_DRAFT, ...seed };
  const plan0 = PLAN[pathOfDraft(d0)];
  const i0 = plan0.indexOf(start);
  const initial: FlowState = { d: d0, hist: i0 >= 0 ? (plan0.slice(0, i0 + 1) as OnboardStep[]) : [start], dir: 'fwd', n: 0 };
  const [s, dispatch] = useReducer(reduce, initial);
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (!persist) return;
    const saved = readDraft(load(DRAFT_KEY));
    if (!saved) return;
    if (start === 'intro') {
      // A fresh sign-up page never resumes past the account: that belongs to /golf/player.
      if (saved.d.accountMade) return;
      dispatch({ t: 'restore', state: { ...saved, d: { ...saved.d, ...seed, code: seed.code || saved.d.code } } });
    } else {
      // Picking up after the account: keep what was answered, start at `start`.
      const d = { ...saved.d, ...seed, accountMade: true };
      const plan = PLAN[pathOfDraft(d)];
      const i = plan.indexOf(start);
      if (i < 0) return;
      dispatch({ t: 'restore', state: { d, hist: plan.slice(0, i + 1) as OnboardStep[], dir: 'fwd', n: 0 } });
    }
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored.current || !persist) return;
    const step = s.hist[s.hist.length - 1];
    if (step === 'done' || step === 'staffdone' || step === 'sent') save(DRAFT_KEY, null);
    else save(DRAFT_KEY, JSON.stringify({ d: s.d, hist: s.hist }));
  }, [s, persist]);

  const up = useCallback((patch: Partial<Draft>) => dispatch({ t: 'patch', patch }), []);
  const next = useCallback((patch?: Partial<Draft>, to?: OnboardStep) => dispatch({ t: 'next', patch, to }), []);
  const back = useCallback(() => dispatch({ t: 'back' }), []);

  const step = s.hist[s.hist.length - 1]!;
  const path = pathOfDraft(s.d);
  return { ...s, step, path, up, next, back, canBack: canGoBack(s) };
}
