'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { savePracticePlanDraft } from '@/app/golf/actions/coachhelm-practice-plans';
import { savePracticePlan } from '@/app/golf/actions/practice-plans';
import type { PlanBodyV2, PlanWhy } from '@/lib/coachhelm/v3/practice-plan/model';
import type { BuilderStep } from './builder-model';

export type SaveStatus = 'saved' | 'saving' | 'offline' | 'failed' | 'stale';
const DEBOUNCE_MS = 800;
const MAX_TRIES = 3;

interface Snapshot {
  title: string;
  step: BuilderStep;
  body: PlanBodyV2;
  why: Record<string, PlanWhy>;
}

const storeKey = (planId: string) => `ch-prc-draft-${planId}`;
/** Kept for a tab that goes offline; reading or writing it can throw in a private window, and the plan still works without it. */
const remember = (planId: string, s: Snapshot) => {
  try {
    window.sessionStorage.setItem(storeKey(planId), JSON.stringify(s));
  } catch {
    /* no storage: the edit stays in memory */
  }
};
const forget = (planId: string) => {
  try {
    window.sessionStorage.removeItem(storeKey(planId));
  } catch {
    /* nothing to clear */
  }
};
export function restoredDraft(planId: string): Snapshot | null {
  try {
    const raw = window.sessionStorage.getItem(storeKey(planId));
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

/**
 * S-PRC.bld-save-status: saves 800ms after the last edit, with the version it was read at. Another coach's save is "stale" (CH-13580), never overwritten.
 * Offline keeps the plan in this tab and saves on reconnect (CH-13084); three failures in a row ask (CH-13080). A kept suggestion's Why goes to the coach-only
 * column through the draft save, so it never reaches the body a player reads. `preview`: nothing reaches a server.
 */
export function useAutosave({ planId, version, snapshot, preview = false }: { planId: string; version: number; snapshot: Snapshot; preview?: boolean }) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const latest = useRef(snapshot);
  const saved = useRef(JSON.stringify(snapshot));
  const savedWhy = useRef(JSON.stringify(snapshot.why));
  const versionRef = useRef(version);
  const inFlight = useRef<Promise<void> | null>(null);
  const tries = useRef(0);
  const timer = useRef<number | null>(null);
  latest.current = snapshot;

  const run = useCallback(async (): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const go = async () => {
      const snap = latest.current;
      const json = JSON.stringify(snap);
      if (json === saved.current) return setStatus('saved');
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        remember(planId, snap);
        return setStatus('offline');
      }
      setStatus('saving');
      try {
        const whyJson = JSON.stringify(snap.why);
        const res = whyJson !== savedWhy.current
          ? await savePracticePlanDraft({ eventId: null, planId, version: versionRef.current, title: snap.title, draft: { body: snap.body, why: snap.why, version: versionRef.current }, folder: 'Practice plans' })
          : await savePracticePlan({ planId, expectedVersion: versionRef.current, title: snap.title, step: snap.step, body: snap.body });
        if (!res.success) {
          if ('stale' in res && res.stale) return setStatus('stale');
          if (/changed|latest|another coach/i.test(res.error)) return setStatus('stale');
          tries.current += 1;
          if (tries.current >= MAX_TRIES) return setStatus('failed');
          timer.current = window.setTimeout(() => void run(), 2000);
          return;
        }
        tries.current = 0;
        versionRef.current = res.version;
        saved.current = json;
        savedWhy.current = whyJson;
        forget(planId);
        if (JSON.stringify(latest.current) === json) setStatus('saved');
        else timer.current = window.setTimeout(() => void run(), DEBOUNCE_MS);
      } catch {
        tries.current += 1;
        if (tries.current >= MAX_TRIES) setStatus('failed');
        else timer.current = window.setTimeout(() => void run(), 2000);
      }
    };
    const p = go().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = p;
    return p;
  }, [planId]);

  const json = JSON.stringify(snapshot);
  useEffect(() => {
    if (preview || json === saved.current) return;
    setStatus('saving');
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void run(), DEBOUNCE_MS);
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, [json, preview, run]);

  useEffect(() => {
    if (preview) return;
    const online = () => void run();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [preview, run]);

  /** Back and Publish wait for what's pending, for up to 2 seconds. Offline, Back leaves and the tab keeps the plan. */
  const flush = useCallback(async (): Promise<number> => {
    if (timer.current != null) window.clearTimeout(timer.current);
    if (!preview) await Promise.race([run(), new Promise((done) => window.setTimeout(done, 2000))]);
    return versionRef.current;
  }, [preview, run]);

  const retry = useCallback(() => {
    tries.current = 0;
    void run();
  }, [run]);

  return { status: preview ? ('saved' as const) : status, flush, retry };
}
