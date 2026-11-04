'use client';

import { toChReadSummary } from '../data/coachhelm-read-view-shape';
import type { ChViewVoice } from '../data/coachhelm-views-shape';
import { ReadPage, ReadSkeleton } from '../screens/coachhelm/read/ReadPage';
import { ReadSummaryCard } from '../screens/coachhelm/read/ReadSummaryCard';
import { previewReadView } from './fixtures-coachhelm-read';

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 400));

/** One read with fake writes. Nothing reaches the server. */
export function PreviewCoachHelmRead({ state, viewer, q, screen }: { state?: string; viewer?: string; q?: string; screen?: string }) {
  const role = viewer === 'player' ? 'player' : 'coach';
  const view = previewReadView(q, role, state === 'gone', state);
  const voice: ChViewVoice = role === 'coach' ? { role: 'coach', playerId: view.head.playerId ?? '', name: view.head.name, first: view.head.first, line: '' } : { role: 'player' };
  if (state === 'loading') return <ReadSkeleton />;
  if (screen === 'board' && view.read)
    return (
      <main className="ch-hr is-phone">
        <div className="sheet">
          <ReadSummaryCard s={toChReadSummary(view.read, view.area, role)} who={role === 'coach' ? view.head.first : null} href="#" />
        </div>
      </main>
    );
  const load = state === 'failed' ? ({ status: 'failed' } as const) : state === 'off' ? ({ status: 'off', reason: null } as const) : ({ status: 'ready', data: view } as const);
  const ok = { success: true } as const;
  return <ReadPage load={load} voice={voice} writes={{ assign: () => wait(ok), dismiss: () => wait(ok), undo: () => wait(ok) }} />;
}
