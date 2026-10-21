import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
// The live write is the server action; every test here hands the chips its own.
vi.mock('@/app/golf/actions/coachhelm-corrections', () => ({ recordCoachHelmCorrection: vi.fn() }));
const flagOn = vi.hoisted(() => ({ value: true }));
vi.mock('@/lib/coachhelm/v3/corrections/flag', () => ({ CORRECTIONS_FLAG: 'coachhelm_corrections_v1', isCorrectionsEnabled: () => flagOn.value }));

import type { CorrectionResult } from '@/lib/coachhelm/v3/corrections/input';
import { readCorrections } from '../../../data/coachhelm-corrections';
import { correctionsOf, ENGINE_OFF, laterRoundsLeft, type ChCorrections, type ChCorrectionsInput } from '../../../data/coachhelm-engine-shape';
import { toChInsight } from '../../../data/coachhelm-map';
import { haptic } from '../../../lib/haptics';
import { PREVIEW_TOUR, slope } from '../../../preview/fixtures-coachhelm';
import { PREVIEW_DIVE_CORRECTIONS, PREVIEW_HELM_COACH_CORRECTIONS } from '../../../preview/fixtures-coachhelm-engine';
import { CorrectionChips, CorrectionWritesProvider, answerLine } from '../Corrections';
import { FocusCard } from '../parts';
import type { ChCorrectionWrites } from '../writes';

const READ_ID = '00000000-0000-4000-8000-000000000001';
const COACH: ChCorrectionsInput = { role: 'coach', latest: null, laterRounds: null };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  flagOn.value = true;
});

function writesThat(answer: CorrectionResult | Error) {
  const record = vi.fn(async () => {
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return { record, writes: { record } satisfies ChCorrectionWrites };
}

function withWrites(writes: ChCorrectionWrites, node: ReactNode) {
  return render(<CorrectionWritesProvider value={writes}>{node}</CorrectionWritesProvider>);
}

describe('correction chips: the shape', () => {
  it('gives the coach all five chips and the player only the two the action takes from them', () => {
    expect(correctionsOf(READ_ID, COACH).kinds).toEqual(['not_this', 'wrong_cause', 'already_on_it', 'snooze', 'confirm']);
    expect(correctionsOf(READ_ID, { ...COACH, role: 'player' }).kinds).toEqual(['not_this', 'confirm']);
  });

  it('holds a read back only for a coach whose last answer is Show later', () => {
    expect(correctionsOf(READ_ID, { role: 'coach', latest: { kind: 'snooze', reason: null }, laterRounds: 2 }).laterRounds).toBe(2);
    expect(correctionsOf(READ_ID, { role: 'coach', latest: { kind: 'confirm', reason: null }, laterRounds: 2 }).laterRounds).toBeNull();
    expect(correctionsOf(READ_ID, { role: 'player', latest: { kind: 'snooze', reason: null }, laterRounds: 2 }).laterRounds).toBeNull();
  });

  it('counts Show later down over two rounds, then shows the read again', () => {
    expect(laterRoundsLeft(0)).toBe(2);
    expect(laterRoundsLeft(1)).toBe(1);
    expect(laterRoundsLeft(2)).toBeNull();
    expect(laterRoundsLeft(5)).toBeNull();
  });

  it('puts the chips on a card with every engine flag off, and nothing without them', () => {
    const row = slope('p-1');
    const plain = toChInsight(row, { tour: PREVIEW_TOUR, engine: { flags: ENGINE_OFF, now: '2026-10-19T00:00:00Z' } });
    expect(plain.engine).toBeUndefined();
    const withChips = toChInsight(row, { tour: PREVIEW_TOUR, engine: { flags: ENGINE_OFF, now: '2026-10-19T00:00:00Z', corrections: COACH } });
    expect(withChips.engine).toEqual({ corrections: { insightId: row.id, role: 'coach', kinds: expect.any(Array), latest: null, laterRounds: null } });
  });

  it('says an answer quietly, with the reason under Not this', () => {
    expect(answerLine({ kind: 'not_this', reason: 'not_important' })).toBe('Your answer: Not this, not important.');
    expect(answerLine({ kind: 'confirm', reason: null })).toBe('Your answer: Good read.');
  });
});

describe('correction chips: taps', () => {
  const c: ChCorrections = correctionsOf(READ_ID, COACH);

  it('draws five true buttons with names that say what each does', () => {
    const { writes } = writesThat({ status: 'recorded', id: 'x' });
    withWrites(writes, <CorrectionChips c={c} />);
    const group = screen.getByRole('group', { name: 'Is this read right?' });
    expect(within(group).getAllByRole('button')).toHaveLength(5);
    expect(screen.getByRole('button', { name: /^Show later: hide this read for 2 rounds$/ })).toBeTruthy();
  });

  it('opens the reason picker on Not this and records the reason picked', async () => {
    const user = userEvent.setup();
    const { writes, record } = writesThat({ status: 'recorded', id: 'x' });
    withWrites(writes, <CorrectionChips c={c} />);
    const notThis = screen.getByRole('button', { name: /^Not this: say why/ });
    await user.click(notThis);
    expect(notThis.getAttribute('aria-expanded')).toBe('true');
    expect(record).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Not this: not important' }));
    expect(record).toHaveBeenCalledWith({ insightId: READ_ID, kind: 'not_this', reason: 'not_important' });
    expect((await screen.findByRole('status')).textContent).toBe('Your answer: Not this, not important.');
    expect(haptic).toHaveBeenCalledWith('success');
    // Append-only: no Undo is offered, only a new answer.
    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Change your answer on this read' })).toBeTruthy();
  });

  it('rolls a failed save back and says so', async () => {
    const user = userEvent.setup();
    const { writes } = writesThat({ status: 'failed', error: 'nope' });
    withWrites(writes, <CorrectionChips c={c} />);
    await user.click(screen.getByRole('button', { name: /^Good read/ }));
    expect((await screen.findByRole('alert')).textContent).toBe('That answer didn’t save. Try again.');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^(Not this|Wrong cause|Already on it|Show later|Good read)/ })).toHaveLength(5);
    expect(haptic).toHaveBeenCalledWith('error');
  });

  it('treats a write that throws as a failed save', async () => {
    const user = userEvent.setup();
    const { writes } = writesThat(new Error('network'));
    withWrites(writes, <CorrectionChips c={c} />);
    await user.click(screen.getByRole('button', { name: /^Wrong cause/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('takes the chips away when the action answers not available (the held table is missing)', async () => {
    const user = userEvent.setup();
    const { writes } = writesThat({ status: 'not_available', reason: 'table_missing' });
    const { container } = withWrites(writes, <CorrectionChips c={c} />);
    await user.click(screen.getByRole('button', { name: /^Already on it/ }));
    await act(async () => {});
    expect(container.querySelector('.ch-hl-cx')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(haptic).not.toHaveBeenCalledWith('error');
  });
});

describe('correction chips on the coach card', () => {
  const jonah = () => PREVIEW_HELM_COACH_CORRECTIONS.corrections!.players.list.find((p) => p.top.id === 'in-slope')!.top;

  it('hides the read at once on Show later and brings it back when the save fails', async () => {
    const user = userEvent.setup();
    let fail: (r: CorrectionResult) => void = () => {};
    const record = vi.fn(() => new Promise<CorrectionResult>((r) => (fail = r)));
    withWrites({ record }, <FocusCard ins={jonah()} who="Jonah" />);
    expect(screen.queryByText(/Held back for now/)).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Show later/ }));
    expect(screen.getByText(/Held back for now/).textContent).toMatch(/after 2 more rounds are posted/);
    await act(async () => fail({ status: 'failed', error: 'x' }));
    expect(screen.queryByText(/Held back for now/)).toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('draws a read held back after a reload with the rounds left, and its answer', () => {
    const held = PREVIEW_HELM_COACH_CORRECTIONS['corrections-later']!.players.list.find((p) => p.top.id === 'in-slope')!.top;
    const { writes } = writesThat({ status: 'recorded', id: 'x' });
    withWrites(writes, <FocusCard ins={held} who="Jonah" />);
    expect(screen.getByText(/Held back for now/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Your answer: Show later.');
  });

  it('gives a player on their own Deep dive read only Not this and Good read', () => {
    const read = PREVIEW_DIVE_CORRECTIONS.list[0]!.base;
    expect(read.engine?.corrections?.kinds).toEqual(['not_this', 'confirm']);
  });
});

describe('readCorrections (the loader)', () => {
  const sb = (answer: { data: unknown; error: unknown }) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'gt']) chain[m] = vi.fn(() => chain);
    chain.order = vi.fn(async () => answer);
    return {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u-1' } } })) },
      from: vi.fn(() => chain),
    } as unknown as Parameters<typeof readCorrections>[0];
  };
  const reads = [{ id: READ_ID, playerId: 'p-1' }];

  beforeEach(() => {
    flagOn.value = true;
  });

  it('reads nothing with the flag off', async () => {
    flagOn.value = false;
    const client = sb({ data: [], error: null });
    expect(await readCorrections(client, { role: 'coach', teamIds: ['t-1'], reads })).toBeNull();
    expect((client as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it('hides the chips when the held table is missing, without throwing', async () => {
    for (const code of ['42P01', 'PGRST205']) {
      expect(await readCorrections(sb({ data: null, error: { code } }), { role: 'coach', teamIds: ['t-1'], reads })).toBeNull();
    }
  });

  it('maps each read to the viewer and their last answer', async () => {
    const rows = [
      { insight_id: READ_ID, kind: 'confirm', reason: null, created_at: '2026-10-19T00:00:00Z' },
      { insight_id: READ_ID, kind: 'not_this', reason: 'wrong', created_at: '2026-10-18T00:00:00Z' },
    ];
    const out = await readCorrections(sb({ data: rows, error: null }), { role: 'player', teamIds: ['t-1'], reads });
    expect(out?.get(READ_ID)).toEqual({ role: 'player', latest: { kind: 'confirm', reason: null }, laterRounds: null });
  });
});
