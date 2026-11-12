'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect, useRef } from 'react';
import { CH_MS, CH_SPRING_SETTLE_MS } from '../../lib/motion';
import { recordsOnRead } from '../../lib/prefetch-guard';
import type { ChMotionMode } from '../../lib/reduced-motion';
import { bringIntoView, endLanding, findLandedRow, forgetLanding, getLandings, holdLanding, isLandingHome, landingHome, landLanding, LANDING_LATE_MS, LANDING_MARK_MS, LANDING_UNSEEN_MS, markRow, rowKeys, saveLanding, useLandings, type Landing, type LandsHint } from './landing';
import { BEAT_MS } from './qc-timing';

/** What a task card says as it moves on: the server's receipt at each step, and Undo, which only the card knows. */
export type TaskPhase = 'held' | 'saved' | 'undone' | 'failed';
export interface TaskPhaseMeta {
  tool: string;
  /** The server's word on where the thing lives (`proposal.lands`). */
  lands?: LandsHint | null;
  label: string;
  day?: string | null;
  /** The player the thing belongs to, when it lives on one player's page. */
  subject?: string | null;
  heldUntil?: string | null;
  /** The saved row's id, when the receipt carries one. */
  id?: string | null;
}

/**
 * Whether a card's report is something happening now. The shared card says where it stands when it is first drawn as well
 * as when it changes, so a thread read back from the server reports every old card once. Only these are events: a hold whose
 * window is still open; a change that follows a hold seen in this sitting; and a card's first word straight after this
 * sitting's Confirm (a task that saves with no hold). A stored receipt, a reloaded Undo (`cancelled`) or an old failure
 * lands nothing, says nothing on the key and marks no row.
 */
export function phaseIsNow(before: TaskPhase | undefined, phase: TaskPhase, o: { heldUntil: string | null; confirmedNow: boolean; now?: number }): boolean {
  if (before === phase) return false;
  if (phase === 'held') return !!o.heldUntil && Date.parse(o.heldUntil) > (o.now ?? Date.now());
  return before === 'held' || (before === undefined && o.confirmedNow && phase !== 'undone');
}

interface Run {
  observer: MutationObserver | null;
  timers: ReturnType<typeof setTimeout>[];
  /** The row is in the page and waits for the panel to be out of its way. */
  row: HTMLElement | null;
  /** The row took the place of a slot the coach could see: the lit ground is handed over, not raised again. */
  handed: boolean;
  marked: boolean;
}

/**
 * Moment 8 (QUICK-CHAT.md): the page behind as the proof. Mounted with the session, so it outlives every route change.
 * It never holds a copy of a screen's data: the page re-reads its own loader (`router.refresh`, what every home uses),
 * and this only finds the row that read produced, brings it into view and marks it once.
 */
export function useLandingDriver({ pathname, open, mode, canRecede, recede, announce }: { pathname: string; open: boolean; mode: ChMotionMode; canRecede: () => boolean; recede: () => void; announce: (line: string) => void }) {
  const router = useRouter();
  const landings = useLandings();
  const runs = useRef(new Map<string, Run>());
  /** The coach has worked on the page since Confirm: it is theirs, and is not scrolled for them. */
  const touched = useRef(false);
  const live = useRef({ pathname, open, mode, canRecede, recede, announce, router });
  live.current = { pathname, open, mode, canRecede, recede, announce, router };

  const active = landings.length > 0;
  useEffect(() => {
    if (!active) return;
    const mark = (e: Event) => {
      const t = e.target as Element | null;
      if (t?.closest?.('.ch-qcs')) return;
      touched.current = true;
    };
    const opts = { capture: true, passive: true } as const;
    for (const type of ['pointerdown', 'wheel', 'keydown', 'touchmove'] as const) window.addEventListener(type, mark, opts);
    return () => {
      for (const type of ['pointerdown', 'wheel', 'keydown', 'touchmove'] as const) window.removeEventListener(type, mark, opts);
    };
  }, [active]);

  const finish = useCallback((key: string) => {
    const run = runs.current.get(key);
    run?.observer?.disconnect();
    run?.timers.forEach(clearTimeout);
    runs.current.delete(key);
  }, []);

  /** MO-8-2, once the eye can get there: the panel is closed, or has passed half way out. */
  const show = useCallback(
    (l: Landing) => {
      const run = runs.current.get(l.key);
      if (!run?.row || run.marked || !run.row.isConnected) return;
      run.marked = true;
      const row = run.row;
      if (!touched.current) bringIntoView(row, live.current.mode !== 'full');
      markRow(row, live.current.mode, { handed: run.handed });
      live.current.announce(`Added to ${l.place}: ${l.label}.`);
      run.timers.push(
        setTimeout(() => {
          finish(l.key);
          forgetLanding(l.key);
        }, LANDING_MARK_MS),
      );
    },
    [finish],
  );

  const start = useCallback(
    (l: Landing, arrived: boolean) => {
      if (runs.current.has(l.key)) return;
      const run: Run = { observer: null, timers: [], row: null, handed: false, marked: false };
      runs.current.set(l.key, run);
      // Messages draws its own outgoing bubble: its arrival is the landing (QUICK-CHAT.md default 8).
      if (l.kind === 'message') {
        finish(l.key);
        forgetLanding(l.key);
        return;
      }
      const reread = () => {
        if (!recordsOnRead(live.current.pathname)) startTransition(() => live.current.router.refresh());
      };
      // Arriving by Open is a fresh read already; landing in place asks the page for its own loader again. When the panel is
      // about to step away, the page is asked in the frame the panel starts to go: the re-read's work then falls under a close
      // that is already running on the compositor, never in front of it (measured: asked first, the close started 250 ms late).
      const recedes = !arrived && live.current.open && live.current.canRecede();
      if (!arrived && !recedes) reread();
      const slot = document.querySelector<HTMLElement>(`[data-ch-slot="${CSS.escape(l.key)}"]`);
      // MO-8-3 starts in the frame of the save, while the panel is still over the page.
      if (slot && !touched.current) bringIntoView(slot, live.current.mode !== 'full');
      if (recedes)
        run.timers.push(
          setTimeout(() => {
            live.current.recede();
            reread();
          }, BEAT_MS),
        );
      const look = (): boolean => {
        const now = getLandings().find((x) => x.key === l.key);
        if (!now) return true;
        const row = findLandedRow(document, now);
        if (!row) return false;
        // MQ-8-8: before this frame paints, so there is never a frame with both and never one with neither.
        const at = document.querySelector<HTMLElement>(`[data-ch-slot="${CSS.escape(l.key)}"]`);
        // A slot that was showing and lit ("Saved") hands its ground to the row: one object, not a blink between two.
        run.handed = !!at && !at.hidden && !live.current.open;
        if (at) at.hidden = true;
        run.row = row;
        run.observer?.disconnect();
        run.observer = null;
        landLanding(l.key);
        // Handed over: the mark is on the row in this same frame. Otherwise it waits for the panel to be half way out.
        if (run.handed) show(now);
        else if (!live.current.open) run.timers.push(setTimeout(() => show(now), arrived ? 0 : CH_MS.field / 2));
        return true;
      };
      const begin = () => {
        if (look()) return;
        run.observer = new MutationObserver(() => void look());
        run.observer.observe(document.getElementById('ch-canvas') ?? document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ch-row'] });
      };
      // A pushed page is looked at when its push has ended (MO-8-5).
      if (arrived) run.timers.push(setTimeout(begin, live.current.mode === 'full' ? CH_SPRING_SETTLE_MS : 0));
      else begin();
      run.timers.push(setTimeout(() => (run.row ? undefined : reread()), LANDING_LATE_MS));
      run.timers.push(
        setTimeout(() => {
          if (run.row) return;
          finish(l.key);
          endLanding(l.key, 'late');
        }, LANDING_LATE_MS * 2),
      );
      run.timers.push(
        setTimeout(() => {
          if (run.marked) return;
          finish(l.key);
          forgetLanding(l.key);
        }, LANDING_UNSEEN_MS),
      );
    },
    [finish, show],
  );

  // A saved landing starts when its home is the page: at once when it was saved here, or when Open has brought the coach there.
  const wasPath = useRef(pathname);
  useEffect(() => {
    const arrived = wasPath.current !== pathname;
    wasPath.current = pathname;
    for (const l of landings) if (l.phase === 'saved' && isLandingHome(l, pathname)) start(l, arrived && !runs.current.has(l.key));
  }, [landings, pathname, start]);

  // `ST-8.landed.unseen`: the row was real while the panel stayed open; the mark plays when the panel leaves.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      for (const l of getLandings()) if (l.phase === 'landed') show(l);
    }, CH_MS.field / 2);
    return () => clearTimeout(t);
  }, [open, show]);

  useEffect(() => {
    const all = runs.current;
    return () => {
      for (const key of [...all.keys()]) finish(key);
    };
  }, [finish]);

  /** The card moved on. */
  return useCallback(
    (key: string, phase: TaskPhase, meta: TaskPhaseMeta) => {
      if (phase === 'held') {
        const home = landingHome(meta.tool, meta.lands);
        touched.current = false;
        holdLanding({ key, tool: meta.tool, lands: meta.lands, label: meta.label, day: meta.day, subject: meta.subject, heldUntil: meta.heldUntil ?? null, before: home && isLandingHome(home, live.current.pathname) ? rowKeys(document, home.kind) : null });
      } else if (phase === 'saved') {
        saveLanding({ key, tool: meta.tool, lands: meta.lands, label: meta.label, id: meta.id, day: meta.day, subject: meta.subject });
        // Saved for a home the coach is not on: it waits for Open, and not for ever.
        setTimeout(() => (runs.current.has(key) ? undefined : forgetLanding(key)), LANDING_UNSEEN_MS);
      }
      else {
        finish(key);
        endLanding(key, phase);
      }
    },
    [finish],
  );
}
