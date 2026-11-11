'use client';

import { useEffect } from 'react';
import { manyHoles, rewriteDeep } from './stress';
import type { ChViewVoice } from '../data/coachhelm-views-shape';
import { CorrectionWritesProvider } from '../screens/coachhelm/Corrections';
import { ReadPage, ReadSkeleton } from '../screens/coachhelm/read/ReadPage';
import { previewReadHead, previewReadView } from './fixtures-coachhelm-read';

const wait = <T,>(v: T, ms = 400) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const never = <T,>() => new Promise<T>(() => {});
const ok = { success: true } as const;

/** The preview's own addresses for the three reads it holds; a neighbour on the list has no page of its own here. */
const Q_OF: Record<string, string> = { 'in-pen': 'penalties', 'in-slope': 'putts', 'in-approach': 'approach' };

/**
 * One read with fake writes. Nothing reaches the server. Every state in the design's studio has an address:
 *   coach   open | assigning | assigned | dismissed | stale | partfail | loading | failed | gone
 *   player  open | proposed | focus | stale | loading | failed | gone
 * and the page's own: off, no-rounds, stress. `assigning` and `dismissed` are states of the visit, so the preview presses the key once.
 */
export function PreviewCoachHelmRead({ state, viewer, q }: { state?: string; viewer?: string; q?: string }) {
  const role = viewer === 'player' ? 'player' : 'coach';
  const built = previewReadView(q, role, state === 'gone', state);
  const stressed = state === 'stress' ? rewriteDeep(built, manyHoles) : built;
  const view: typeof built =
    state === 'partfail' || state === 'rounds-failed' ? { ...stressed, failed: { ...stressed.failed, rounds: true } } : state === 'no-rounds' && stressed.read ? { ...stressed, read: { ...stressed.read, rounds: { total: 0, list: [] } } } : stressed;
  const voice: ChViewVoice = role === 'coach' ? { role: 'coach', ...previewReadHead(q) } : { role: 'player' };
  useEffect(() => {
    const act = state === 'assigning' ? 'assign' : state === 'dismissed' ? 'dismiss' : null;
    if (!act) return;
    const t = setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-ch-read-act="${act}"]`)?.click(), 60);
    return () => clearTimeout(t);
  }, [state]);
  if (state === 'loading') return <ReadSkeleton />;
  const load = state === 'failed' ? ({ status: 'failed' } as const) : state === 'off' ? ({ status: 'off', reason: null } as const) : ({ status: 'ready', data: view } as const);
  const hrefOf = (id: string) => `/clubhouse-preview/coachhelm-read?q=${Q_OF[id] ?? q ?? 'penalties'}&viewer=${role}`;
  return (
    <CorrectionWritesProvider value={{ record: () => wait({ status: 'recorded' } as never) }}>
      <ReadPage
        load={load}
        voice={voice}
        hrefOf={hrefOf}
        writes={{ assign: () => (state === 'assigning' ? never() : wait(ok)), dismiss: () => wait(ok, state === 'dismissed' ? 0 : 400), undo: () => wait(ok) }}
        playerWrites={{ accept: () => wait(ok, 900), decline: () => wait(ok) }}
      />
    </CorrectionWritesProvider>
  );
}
