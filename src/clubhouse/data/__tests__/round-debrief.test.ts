import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CoachHelm chs-30's loader: with `coachhelm_reads_v1_copy` off, or for a coach, or with CoachHelm off for the player, it reads
 * nothing and answers null, so the round review is exactly what it was. On, it reads the player's earlier rounds, their top open
 * read and its drill, and a failed part drops only its own line.
 */

vi.mock('server-only', () => ({}));
vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
const m = vi.hoisted(() => ({ flag: false, gate: 'on' as 'on' | 'off' | 'failed', visible: vi.fn(), dismissed: vi.fn() }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (k: string) => k === 'coachhelm_reads_v1_copy' && m.flag }));
vi.mock('../coachhelm', () => ({
  loadPlayerHelmGate: async () => ({ status: m.gate }),
  loadVisible: (...a: unknown[]) => m.visible(...a),
  loadPlayerDismissed: (...a: unknown[]) => m.dismissed(...a),
}));

import { loadRoundDebrief } from '../round-debrief';
import { PREVIEW_REVIEW } from '../../preview/fixtures-round-review';

type Answer = { data?: unknown; error?: unknown };
const fake = (tables: Record<string, Answer>) => {
  const reads: string[] = [];
  const from = (t: string) => {
    reads.push(t);
    const chain: object = new Proxy(
      {},
      {
        get(_, key: string) {
          if (key === 'then') return (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null, ...tables[t] }).then(ok);
          return () => chain;
        },
      },
    );
    return chain;
  };
  return { client: { from } as never, reads };
};

const read = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  player_id: 'preview-player',
  category: 'scoring',
  title: 'Par 5 scoring',
  content: '',
  signature: 'v3:par5',
  evidence: { metric: 'scoring_par_5', your_value: 5.6, comparison_value: 5, metric_label: 'Par 5 scoring', sample_n: 20, unit: 'strokes' },
  metadata: null,
  lifecycle_state: 'detected',
  status: 'active',
  priority: 'medium',
  acknowledged_at: null,
  resolved_at: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
});
const history = Array.from({ length: 6 }, (_, i) => ({ id: `h${i}`, round_date: '2026-10-01', total_score: 78, front_nine: 39, back_nine: 39, holes_played: 18, total_putts: 33 + (i % 2), total_fairways_hit: 7, total_fairways: 14, total_gir: 9 + (i % 2), total_gir_possible: 18, score_to_par: 6 }));

beforeEach(() => {
  m.flag = true;
  m.gate = 'on';
  m.visible.mockReset().mockResolvedValue({ rows: [read()], error: false });
  m.dismissed.mockReset().mockResolvedValue({ ids: new Set(), error: false });
});

describe('loadRoundDebrief', () => {
  it('reads nothing with the flag off, for a coach, or with CoachHelm off for the player', async () => {
    for (const [flag, role, gate] of [
      [false, 'player', 'on'],
      [true, 'coach', 'on'],
      [true, 'player', 'off'],
      [true, 'player', 'failed'],
    ] as const) {
      m.flag = flag;
      m.gate = gate;
      const f = fake({});
      expect(await loadRoundDebrief(f.client, PREVIEW_REVIEW, { role })).toBeNull();
      expect(f.reads).toEqual([]);
      expect(m.visible).not.toHaveBeenCalled();
    }
  });

  it('on, says the moved number, the top read with this round’s change, the facts and the read’s drill', async () => {
    const f = fake({
      golf_rounds: { data: history },
      golf_insight_drill_attachments: { data: [{ rank: 1, drill: { title: 'Wedge ladder', duration_min: 15 } }] },
      golf_player_focus_areas: { data: [{ title: 'Lag putting' }] },
    });
    const d = await loadRoundDebrief(f.client, PREVIEW_REVIEW, { role: 'player' });
    expect(d?.moved?.value).toBe(`${PREVIEW_REVIEW.greens?.hit} of 18 greens`);
    expect(d?.read).toMatchObject({ id: 'i1', title: 'Par 5 scoring' });
    expect(d?.read?.change).toMatch(/^Par 5s today: /);
    expect(d?.next).toBe('Wedge ladder · 15 min');
  });

  it('leaves out a read the player dismissed and a failed history, line by line', async () => {
    m.dismissed.mockResolvedValue({ ids: new Set(['i1']), error: false });
    const f = fake({ golf_rounds: { error: { message: 'down' } }, golf_player_focus_areas: { data: [{ title: 'Lag putting' }] } });
    const d = await loadRoundDebrief(f.client, PREVIEW_REVIEW, { role: 'player' });
    expect(d).toMatchObject({ moved: null, read: null, next: 'Lag putting' });
    expect(d?.facts).not.toBeNull();
  });
});
