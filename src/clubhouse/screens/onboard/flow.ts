'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { AFTER_ACCOUNT, EMPTY_PROGRAM, PLAN, pathOf, resumeStep, stepSatisfied, type CodeKind, type OnboardPath, type OnboardStep, type ProgramDetails, type RequestDetails } from './logic';

/**
 * Where someone is in sign-up, and what they have told us. The password is
 * never kept here. The rest survives a reload and the one route change sign-up
 * makes (the account is created on /golf/signup; a player finishes on
 * /golf/player, where the same screens pick up at "Your game"), in this tab's
 * sessionStorage only, and is cleared when the member card is issued.
 */
export interface Draft {
  intent: 'code' | 'request' | 'program' | null;
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
  /** A head coach's new program (/golf/coach), their title, and the team code the server issued when it was made. */
  prog: ProgramDetails;
  title: string;
  teamCode: string | null;
  /** Set once the account exists: Back never crosses it, and a reload resumes after it. */
  accountMade: boolean;
  joinedTeam: boolean | null;
  /** Why the server did not add the player to the team (its own words), when it did not; null otherwise. */
  joinError: string | null;
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
  prog: EMPTY_PROGRAM,
  title: '',
  teamCode: null,
  accountMade: false,
  joinedTeam: null,
  joinError: null,
};

export const DRAFT_KEY = 'ch.onboard.v1';
/** A new coach's own draft, so it can never be restored into sign up (and sign up's into this). */
export const COACH_DRAFT_KEY = 'ch.onboard.coach.v1';

export const isCoachStart = (start: OnboardStep): boolean => (PLAN.coach as readonly string[]).includes(start);

export interface FlowState {
  d: Draft;
  hist: OnboardStep[];
  dir: 'fwd' | 'back';
  /** Bumps on every move, so the question remounts and plays its entrance. */
  n: number;
}

type Action =
  | { t: 'patch'; patch: Partial<Draft> }
  /** `from` is the question that asked to move on: a second tap, or a choice's timer firing after Back, is ignored once it is no longer the current one. */
  | { t: 'next'; patch?: Partial<Draft>; to?: OnboardStep; from?: OnboardStep }
  | { t: 'back' }
  | { t: 'restore'; state: FlowState };

export const pathOfDraft = (d: Draft): OnboardPath => pathOf(d.intent, d.kind);

/** Back steps one question, but never back across the account once it exists. */
export function canGoBack(s: Pick<FlowState, 'd' | 'hist'>): boolean {
  if (s.hist.length < 2) return false;
  const prev = s.hist[s.hist.length - 2]!;
  return !(s.d.accountMade && !AFTER_ACCOUNT.has(prev));
}

export function reduceFlow(s: FlowState, a: Action): FlowState {
  switch (a.t) {
    case 'patch':
      return { ...s, d: { ...s.d, ...a.patch } };
    case 'next': {
      const cur = s.hist[s.hist.length - 1]!;
      if (a.from && a.from !== cur) return s;
      const d = { ...s.d, ...(a.patch ?? {}) };
      const plan = PLAN[pathOfDraft(d)];
      const i = plan.indexOf(cur);
      let to = a.to ?? plan[i >= 0 ? i + 1 : 1];
      // After the account exists, a question it already answers is not asked again (name, class) and the account is never remade.
      if (!a.to) {
        let at = plan.indexOf(to as OnboardStep);
        while (to && at >= 0 && stepSatisfied(to, d)) to = plan[++at];
      }
      if (!to) return { ...s, d };
      const kept = s.hist.filter((x) => plan.includes(x));
      // Going to a question already behind (Check my code, a name asked for again) returns to it rather than stacking a second copy.
      const at = kept.lastIndexOf(to);
      return { d, hist: at >= 0 ? kept.slice(0, at + 1) : [...kept, to], dir: 'fwd', n: s.n + 1 };
    }
    case 'back':
      return canGoBack(s) ? { ...s, hist: s.hist.slice(0, -1), dir: 'back', n: s.n + 1 } : s;
    case 'restore':
      return a.state;
  }
}

/**
 * What a signed-in player's draft becomes when the server's seed meets the one this tab kept. The server's account is the
 * truth for who they are, so its answers win where it has one; a blank from the server never wipes what was typed. The
 * team code is the exception: when the link carried one (`seed.code` present, even empty) it is the code, since a player
 * who moves from the men's to the women's team arrives with the new code over a draft that held the old.
 * A draft kept for a different email belongs to someone else on this tab and is not used at all.
 */
export function mergeResumed(saved: Draft | null, seed: Partial<Draft>): Draft {
  const mine = saved && (!saved.email || !seed.email || saved.email.trim().toLowerCase() === seed.email.trim().toLowerCase()) ? saved : null;
  const base: Draft = { ...EMPTY_DRAFT, ...(mine ?? {}) };
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(seed)) {
    if (k === 'code' || k === 'teamName') {
      out[k] = v ?? (k === 'code' ? '' : null);
    } else if (v !== '' && v !== null && v !== undefined) {
      out[k] = v;
    }
  }
  if (mine && seed.code !== undefined && seed.code !== mine.code) {
    // A new code is a new team: what the old one said is not carried over.
    out.joinedTeam = null;
    out.joinError = null;
  }
  return { ...(out as unknown as Draft), accountMade: true };
}

/** A saved draft, read defensively: anything malformed starts over. */
export function readDraft(raw: string | null): FlowState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<FlowState>;
    if (!v || !v.d || !Array.isArray(v.hist) || v.hist.length === 0) return null;
    const d = { ...EMPTY_DRAFT, ...v.d, req: { ...EMPTY_DRAFT.req, ...(v.d.req ?? {}) }, prog: { ...EMPTY_PROGRAM, ...(v.d.prog ?? {}) } };
    const plan = PLAN[pathOfDraft(d)];
    const hist = v.hist.filter((x): x is OnboardStep => (plan as readonly string[]).includes(x));
    if (hist.length === 0) return null;
    return { d, hist, dir: 'fwd', n: 0 };
  } catch {
    // A draft that no longer parses: the flow starts fresh.
    return null;
  }
}

function load(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    // Storage blocked: no saved draft.
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
  const [s, dispatch] = useReducer(reduceFlow, initial);
  const restored = useRef(false);
  // A new coach's draft is kept apart from sign up's.
  const key = isCoachStart(start) ? COACH_DRAFT_KEY : DRAFT_KEY;

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (!persist) return;
    const saved = readDraft(load(key));
    if (!saved) return;
    if (isCoachStart(start)) {
      // The wizard picks up where it was (today's /golf/coach does), with the account's own name and address under it.
      const d = { ...saved.d, intent: 'program' as const, accountMade: true, email: seed.email ?? saved.d.email, first: saved.d.first || seed.first || '', last: saved.d.last || seed.last || '' };
      dispatch({ t: 'restore', state: { ...saved, d } });
      return;
    }
    if (start === 'intro') {
      // A fresh sign-up page never resumes past the account: that belongs to /golf/player.
      if (saved.d.accountMade) return;
      dispatch({ t: 'restore', state: { ...saved, d: { ...saved.d, ...seed, code: seed.code || saved.d.code } } });
    } else {
      // Picking up after the account: keep what was answered, and start at the first question the account does not answer.
      const d = mergeResumed(saved.d, seed);
      const plan = PLAN[pathOfDraft(d)];
      const at = start === 'game' || start === 'name' || start === 'grad' ? resumeStep(d) : start;
      const i = plan.indexOf(at);
      if (i < 0) return;
      dispatch({ t: 'restore', state: { d, hist: plan.slice(0, i + 1) as OnboardStep[], dir: 'fwd', n: 0 } });
    }
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored.current || !persist) return;
    const step = s.hist[s.hist.length - 1];
    if (step === 'done' || step === 'staffdone' || step === 'sent' || step === 'cdone') save(key, null);
    else save(key, JSON.stringify({ d: s.d, hist: s.hist }));
  }, [s, persist, key]);

  const up = useCallback((patch: Partial<Draft>) => dispatch({ t: 'patch', patch }), []);
  const next = useCallback((patch?: Partial<Draft>, to?: OnboardStep, from?: OnboardStep) => dispatch({ t: 'next', patch, to, from }), []);
  const back = useCallback(() => dispatch({ t: 'back' }), []);

  const step = s.hist[s.hist.length - 1]!;
  const path = pathOfDraft(s.d);
  return { ...s, step, path, up, next, back, canBack: canGoBack(s) };
}
