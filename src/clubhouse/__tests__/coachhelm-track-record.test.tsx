import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The coach's Track record (P013, ?view=track-record, flag coachhelm_track_record_v1): the words, every numbered state, the loader and the board's link. */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm' }));
const phoneState = vi.hoisted(() => ({ on: false }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => phoneState.on, CH_PHONE_QUERY: '(max-width: 820px)' }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const gate = vi.hoisted(() => ({ current: { status: 'on' } as { status: 'on' } | { status: 'off'; off: { by: 'team'; reason: string | null } } | { status: 'failed' } }));
vi.mock('../data/coachhelm', () => ({ loadCoachHelmGate: vi.fn(async () => gate.current) }));

/** A minimal Supabase stand-in: the one RPC and the two tables the loader reads. */
type Answer = { data: unknown; error: { code?: string; message?: string } | null };
const db = vi.hoisted(() => ({
  rpc: { data: [], error: null } as Answer,
  insights: { data: [], error: null } as Answer,
  corrections: { data: [], error: null } as Answer,
  calls: [] as string[],
}));
vi.mock('@/lib/supabase/server', () => {
  const chain = (answer: () => Answer) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'in', 'order', 'range', 'eq']) q[m] = () => q;
    q.then = (ok: (a: Answer) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(answer()).then(ok, bad);
    return q;
  };
  return {
    createClient: async () => ({
      rpc: (fn: string) => {
        db.calls.push(`rpc:${fn}`);
        return Promise.resolve(db.rpc);
      },
      from: (table: string) => {
        db.calls.push(`from:${table}`);
        return chain(() => (table === 'golf_coach_insights' ? db.insights : db.corrections));
      },
    }),
  };
});

import { loadCoachTrackRecord } from '../data/coachhelm-track-record';
import { familyLabel, sinceWord, type ChTrackRecord } from '../data/coachhelm-track-record-shape';
import { TrackRecord } from '../screens/coachhelm/views/TrackRecord';
import { PREVIEW_TRACK_RECORD, PREVIEW_TRACK_RECORD_EARLY, PREVIEW_TRACK_RECORD_EMPTY, PREVIEW_TRACK_RECORD_UNAVAILABLE, trackLoad } from '../preview/fixtures-coachhelm-track';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const all = (c: string) => [...document.querySelectorAll(`[data-ch-code="${c}"]`)];
const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <div className="ch-root" data-ui="clubhouse">
      {node}
    </div>
  </LazyMotion>
);
const ready = (d: ChTrackRecord) => {
  if (d.state !== 'ready') throw new Error('not ready');
  return d;
};

beforeEach(() => {
  phoneState.on = false;
  router.push.mockClear();
  logServer.mockClear();
  gate.current = { status: 'on' };
  db.rpc = { data: [], error: null };
  db.insights = { data: [], error: null };
  db.corrections = { data: [], error: null };
  db.calls = [];
});
afterEach(cleanup);

describe('the words', () => {
  it('the program line reads as 02 §9 has it, with the not-yet-rechecked count', () => {
    const d = ready(PREVIEW_TRACK_RECORD);
    expect(d.since).toBe('Aug 1');
    expect(d.program).toBe('Since Aug 1 CoachHelm showed 53 reads on this team. 30 held when rechecked, 8 cleared on their own, 4 were contradicted by later rounds. 11 not rechecked yet.');
    expect(d.unrated).toBe('4 reads were shown before reads carried a level, so they count above and in no level below.');
  });

  it('the strip: five levels, "12 of 14 held" where there are enough, "Not enough yet" with its count where not; never a percent', () => {
    const d = ready(PREVIEW_TRACK_RECORD);
    expect(d.rungs.map((r) => [r.word, r.line])).toEqual([
      ['Seen repeatedly', '12 of 14 held'],
      ['Observed', '11 of 15 held'],
      ['Likely', '5 of 10 held'],
      ['Working hypothesis', 'Not enough yet'],
      ['Not enough yet', 'Not enough yet'],
    ]);
    expect(d.rungs[0]!.sub).toBe('Target: at least 8 in 10 hold; on target');
    expect(d.rungs[1]!.sub).toBe('Target: at least 7 in 10 hold; on target');
    expect(d.rungs[2]!.sub).toBe('Target: at least 6 in 10 hold; below target');
    expect(d.rungs[3]!.sub).toBe('2 of 6 rechecked so far. Judged from 10');
    expect(d.rungs[4]!.sub).toBe('0 of 3 rechecked so far. Judged from 10');
    expect(d.rungs[3]!.bar).toBeNull();
    expect(d.rungs[0]!.bar).toEqual({ held: 12, of: 14, target: 8 });
    expect(JSON.stringify(d)).not.toContain('%');
  });

  it('the staff’s corrections, and how many of the Not this and Wrong cause reads cleared on their own later', () => {
    expect(ready(PREVIEW_TRACK_RECORD).corrections).toBe(
      'Your staff marked 3 not this, 1 wrong cause, 1 already on it, 2 good reads; 2 of the not this and wrong cause reads cleared on their own later.',
    );
    expect(ready(PREVIEW_TRACK_RECORD_EARLY).corrections).toBeNull();
  });

  it('families: named, most shown first, counts under the name', () => {
    const d = ready(PREVIEW_TRACK_RECORD);
    expect(d.families.map((f) => [f.label, f.line])).toEqual([
      ['Putting by distance', '18 of 22 held'],
      ['Approach misses', '10 of 17 held'],
      ['Tee strategy', 'Not enough yet'],
      ['Scoring by par', 'Not enough yet'],
      ['Scrambling', 'Not enough yet'],
    ]);
    expect(d.families[0]!.sub).toBe('22 shown · 3 cleared · 1 contradicted · 2 good reads');
    expect(d.families[2]!.sub).toBe('6 shown · 2 rechecked');
  });

  it('today’s production shape: reads shown, none with a level, none rechecked', () => {
    const d = ready(PREVIEW_TRACK_RECORD_EARLY);
    expect(d.program).toBe(
      'Since Aug 1 CoachHelm showed 18 reads on this team. None has been rechecked yet: a read is rechecked once its player has 3 more rounds, or 20 more attempts in its family.',
    );
    expect(d.rungs.every((r) => r.line === 'Not enough yet' && r.sub.startsWith('None shown since Aug 1'))).toBe(true);
  });

  it('a family not in the label list reads as its type in sentence case', () => {
    expect(familyLabel('three_putt_chain')).toBe('Three putt chain');
    expect(sinceWord('2026-08-01')).toBe('Aug 1');
  });
});

describe('the screen', () => {
  it('CH-13960 to CH-13964: the page, the strip with bars only where judged, the corrections and the families', () => {
    render(wrap(<TrackRecord load={trackLoad(PREVIEW_TRACK_RECORD)} />));
    expect(screen.getByRole('heading', { level: 1, name: 'Track record' })).toBeTruthy();
    expect(code('CH-13960')).toBeTruthy();
    expect(all('CH-13961')).toHaveLength(3);
    expect(all('CH-13962')).toHaveLength(2);
    expect(document.querySelectorAll('.ch-htr-bar__target')).toHaveLength(3);
    expect(code('CH-13963')?.textContent).toContain('Your staff marked 3 not this');
    expect(code('CH-13964')?.querySelectorAll('li')).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'CoachHelm' }).getAttribute('href')).toBe('/golf/dashboard/coachhelm');
    expect(document.body.textContent).not.toContain('%');
  });

  it('corrections not recorded yet says so, never "0 not this"', () => {
    render(wrap(<TrackRecord load={trackLoad(PREVIEW_TRACK_RECORD_EARLY)} />));
    expect(code('CH-13963')?.textContent).toBe('Corrections are not recorded yet, so Not this and Good read are not counted here.');
  });

  it('CH-13965 off, CH-13966 failed, CH-13967 not available, CH-13968 nothing shown', () => {
    render(wrap(<TrackRecord load={{ status: 'off', reason: null }} />));
    expect(code('CH-13965')).toBeTruthy();
    cleanup();
    render(wrap(<TrackRecord load={{ status: 'failed' }} />));
    expect(code('CH-13966')?.textContent).toContain('The track record didn’t load');
    cleanup();
    render(wrap(<TrackRecord load={trackLoad(PREVIEW_TRACK_RECORD_UNAVAILABLE)} />));
    expect(code('CH-13967')?.textContent).toContain('isn’t switched on yet');
    cleanup();
    render(wrap(<TrackRecord load={trackLoad(PREVIEW_TRACK_RECORD_EMPTY)} />));
    expect(code('CH-13968')?.textContent).toContain('No reads shown since Aug 1');
  });
});

describe('loadCoachTrackRecord', () => {
  const lifecycle = { checkpoints_seen: 2, checkpoints_held: 2, last_checkpoint_at: '2026-10-12T00:00:00Z' };

  it('reads the shown reads, their rows and corrections, and counts them', async () => {
    db.rpc = { data: [{ insight_id: 'a', last_shown_at: '2026-10-10T00:00:00Z', shown_ladder: 'observed' }, { insight_id: 'b', last_shown_at: '2026-10-10T00:00:00Z', shown_ladder: null }], error: null };
    db.insights = {
      data: [
        { id: 'a', insight_type: 'putt_distance', ladder: 'observed', lifecycle },
        { id: 'b', insight_type: 'approach_miss', ladder: null, lifecycle: null },
      ],
      error: null,
    };
    db.corrections = { data: [{ insight_id: 'a', author_user_id: 'c1', author_role: 'coach', kind: 'confirm', created_at: '2026-10-01T00:00:00Z' }], error: null };
    const out = await loadCoachTrackRecord({ coachId: 'coach', teamId: 'team', now: new Date('2026-10-21T00:00:00Z') });
    expect(db.calls).toEqual(['rpc:golf_coachhelm_shown_reads', 'from:golf_coach_insights', 'from:golf_coachhelm_corrections']);
    if (out.status !== 'ready' || out.data.state !== 'ready') throw new Error('not ready');
    expect(out.data.program).toBe('Since Aug 1 CoachHelm showed 2 reads on this team. 1 held when rechecked, 0 cleared on their own, 0 were contradicted by later rounds. 1 not rechecked yet.');
    expect(out.data.corrections).toBe('Your staff marked 1 good read.');
  });

  it('a missing function is "not available"; a missing corrections table leaves corrections out; neither is logged', async () => {
    db.rpc = { data: null, error: { code: 'PGRST202', message: 'not found' } };
    expect(await loadCoachTrackRecord({ coachId: 'coach', teamId: 'team' })).toEqual({ status: 'ready', data: { state: 'unavailable' } });
    db.rpc = { data: [{ insight_id: 'a', last_shown_at: '2026-10-10T00:00:00Z', shown_ladder: null }], error: null };
    db.insights = { data: [{ id: 'a', insight_type: 'putt_distance', ladder: null, lifecycle: null }], error: null };
    db.corrections = { data: null, error: { code: '42P01', message: 'missing' } };
    const out = await loadCoachTrackRecord({ coachId: 'coach', teamId: 'team' });
    expect(out.status === 'ready' && out.data.state === 'ready' && out.data.corrections).toBeNull();
    expect(logServer).not.toHaveBeenCalled();
  });

  it('a read that failed is the view failing (logged), never zeros', async () => {
    db.rpc = { data: null, error: { code: '57014', message: 'timeout' } };
    expect(await loadCoachTrackRecord({ coachId: 'coach', teamId: 'team' })).toEqual({ status: 'failed' });
    db.rpc = { data: [{ insight_id: 'a', last_shown_at: '2026-10-10T00:00:00Z', shown_ladder: null }], error: null };
    db.corrections = { data: null, error: { code: '57014', message: 'timeout' } };
    expect(await loadCoachTrackRecord({ coachId: 'coach', teamId: 'team' })).toEqual({ status: 'failed' });
    expect(logServer).toHaveBeenCalledTimes(2);
  });

  it('follows the CoachHelm gate and reads nothing when it is off or failed', async () => {
    gate.current = { status: 'off', off: { by: 'team', reason: 'Paused' } };
    expect(await loadCoachTrackRecord({ coachId: 'coach', teamId: 'team' })).toEqual({ status: 'off', reason: 'Paused' });
    gate.current = { status: 'failed' };
    expect(await loadCoachTrackRecord({ coachId: 'coach', teamId: 'team' })).toEqual({ status: 'failed' });
    expect(db.calls).toEqual([]);
  });
});
