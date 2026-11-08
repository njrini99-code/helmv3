import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { evidenceBlocks, roundsTable } from '../data/coachhelm-chat-thread';
import type { ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';

// Player Ask, staging, 2026-11-08: "What did I shoot in my last round?" drew a table of Date / Course / Round type and no score.

const detail = (rounds: Array<Record<string, unknown>>) => ({
  player: { player_id: 'p1', name: 'Cole Bennett' },
  rounds,
});
const row = (over: Record<string, unknown> = {}) => ({
  round_id: 'r1', date: '2026-10-21', course: 'Pines', round_type: 'tournament', holes: 18, counts_in_averages: true,
  total_score: 73, to_par: 1, putts: 30, sg_total: -2.72, ...over,
});
const envelope = (rounds: Array<Record<string, unknown>>): ToolEnvelope => ({
  summary: 'Your last round.', measurements: [], series: [], detail: detail(rounds), coverage: 'complete', coverage_note: null, as_of: '2026-11-08T02:00:00.000Z',
});

describe('a list of rounds is a table of what the rounds scored', () => {
  it('has the score, to par, putts and strokes gained the question is about', () => {
    expect(roundsTable(detail([row()]), 'Your last round.')).toEqual({
      caption: 'Your last round.',
      columns: ['Date', 'Course', 'Score', 'To par', 'Putts', 'Strokes gained'],
      rows: [['Oct 21', 'Pines', '73', '+1', '30', expect.stringMatching(/^[−-]2\.7/)]],
    });
  });

  it('is what the thread draws for a recent-rounds read', () => {
    const [block] = evidenceBlocks(envelope([row(), row({ date: '2026-10-06', total_score: 69, to_par: -3, putts: 27, sg_total: 1.4 })]));
    expect(block).toMatchObject({ kind: 'table', title: 'Your last round.' });
    const table = (block as { table: { columns: string[]; rows: string[][] } }).table;
    expect(table.columns).toContain('Score');
    expect(table.rows.map((r) => r[table.columns.indexOf('Score')])).toEqual(['73', '69']);
    expect(table.rows[1]![table.columns.indexOf('To par')]).toMatch(/^[−-]3$/);
  });

  it('leaves out a column no round has a figure for, and shows a missing one as missing', () => {
    const t = roundsTable(detail([row({ putts: null, sg_total: null }), row({ putts: null, sg_total: null, total_score: null, to_par: null })]), 'x')!;
    expect(t.columns).toEqual(['Date', 'Course', 'Score', 'To par']);
    expect(t.rows[1]![2]).not.toBe('73');
  });

  // Player Ask, staging, 2026-11-08: "Your last 10 recorded rounds." drew 8 rows; and "How many three-putts did I have?" had no column to answer from.
  it('draws every round the read lists, so a title of 10 rounds has 10 rows', () => {
    const ten = Array.from({ length: 10 }, (_, i) => row({ date: `2026-10-${String(21 - i).padStart(2, '0')}`, sg_total: i < 2 ? null : -1 }));
    const t = roundsTable(detail(ten), 'Your last 10 rounds that count in Stats.')!;
    expect(t.rows).toHaveLength(10);
    const [block] = evidenceBlocks(envelope(ten));
    expect((block as { table: { rows: unknown[] } }).table.rows).toHaveLength(10);
  });

  it('has a 3-putts column when the rounds carry it, a round with none recorded shows missing, and a round with 0 putts never shows 0', () => {
    const t = roundsTable(detail([row({ three_putts: 2 }), row({ date: '2026-10-06', putts: 0, three_putts: null })]), 'x')!;
    expect(t.columns).toContain('3-putts');
    const col = (name: string) => t.rows.map((r) => r[t.columns.indexOf(name)]);
    expect(col('3-putts')[0]).toBe('2');
    expect(col('3-putts')[1]).not.toBe('0');
    expect(col('Putts')[1]).not.toBe('0');
    // No round has it: no column.
    expect(roundsTable(detail([row()]), 'x')!.columns).not.toContain('3-putts');
  });

  it('is not a rounds table without scores, and falls back to the record table', () => {
    expect(roundsTable(detail([{ date: '2026-10-21', course: 'Pines' }]), 'x')).toBeNull();
    expect(roundsTable({ events: [{ title: 'a' }] }, 'x')).toBeNull();
  });
});
