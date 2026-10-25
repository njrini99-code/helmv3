// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/app/golf/actions/round-live', () => ({ setLiveShare: vi.fn(), setLivePrefs: vi.fn(), setNextLiveShare: vi.fn() }));

import '../../../../__tests__/dialog-polyfill';
import type { LiveSharePorts } from '../../../../live/share-ports';
import { ExitSheet } from '../round-sheets';
import { LiveShareSheet, useRoundSharing } from '../LiveShareSheet';

afterEach(cleanup);

const ROUND = '00000000-0000-4000-8000-000000000001';
const ok = (share: 'off' | 'coaches' | 'team', clamped = false) => ({ success: true as const, data: { share, seq: 4, clamped } });
const ports = (over: Partial<LiveSharePorts> = {}): LiveSharePorts => ({
  loadPrefs: vi.fn(async () => ({ practiceShare: 'off' as const })),
  loadRoundShare: vi.fn(async () => 'coaches' as const),
  setNext: vi.fn(),
  setShare: vi.fn(async (_id, share) => ok(share)),
  setPrefs: vi.fn(),
  ...over,
});

describe('In-round Sharing sheet (CH-16660 to CH-16666)', () => {
  it('a change applies at once and is sent for this round only (not remembered)', async () => {
    const user = userEvent.setup();
    const p = ports();
    const onChanged = vi.fn();
    render(<LiveShareSheet open onClose={() => {}} roundId={ROUND} type="practice" level="coaches" ports={p} onChanged={onChanged} />);
    await user.click(screen.getByRole('radio', { name: 'Coaches and team' }));
    expect(screen.getByRole('radio', { name: 'Coaches and team' }).getAttribute('aria-checked')).toBe('true');
    await waitFor(() => expect(p.setShare).toHaveBeenCalledWith(ROUND, 'team', false));
    expect(onChanged).toHaveBeenCalledWith('team');
  });

  it('a refusal returns the control to what it was and says why', async () => {
    const user = userEvent.setup();
    const p = ports({ setShare: vi.fn(async () => ({ success: false as const, error: 'Sharing was changed too many times on this round.', code: 'CH-16665' as const, retryable: false })) });
    render(<LiveShareSheet open onClose={() => {}} roundId={ROUND} type="practice" level="coaches" ports={p} onChanged={() => {}} />);
    await user.click(screen.getByRole('radio', { name: 'Not live' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Sharing was changed too many times on this round.');
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Coaches' }).getAttribute('aria-checked')).toBe('true'));
  });

  it('a qualifier shows the floor and the caption; Done closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<LiveShareSheet open onClose={onClose} roundId={ROUND} type="qualifier" level="coaches" ports={ports()} onChanged={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Not live' }).hasAttribute('disabled')).toBe(true);
    expect(document.querySelector('[data-ch-code="CH-16662"]')?.textContent).toBe('Qualifier rounds are always shown to coaches.');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('the Exit sheet’s Sharing row', () => {
  const exit = (sharing?: { label: string; onChange: () => void }) =>
    render(<ExitSheet open course="Pine Hollow" holes={[]} currentNumber={1} discarding={false} discardError={null} onSave={() => {}} onKeep={() => {}} onDiscard={() => {}} sharing={sharing} />);

  it('shows the level in words and opens the sheet', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    exit({ label: 'Coaches', onChange });
    await user.click(screen.getByRole('button', { name: /Sharing/ }));
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByText('Coaches now. Who sees this round live.')).toBeTruthy();
  });

  it('has no row when sharing is not there', () => {
    exit(undefined);
    expect(screen.queryByRole('button', { name: /Sharing/ })).toBeNull();
  });
});

describe('useRoundSharing', () => {
  it('offers a row once the level loads, never for a tournament or a round with no id yet', async () => {
    const p = ports();
    const { result } = renderHook(() => useRoundSharing({ roundId: ROUND, type: 'practice', ports: p }));
    expect(result.current.row).toBeUndefined();
    await waitFor(() => expect(result.current.row?.label).toBe('Coaches'));
    act(() => result.current.row?.onChange());

    expect(renderHook(() => useRoundSharing({ roundId: null, type: 'practice', ports: p })).result.current.row).toBeUndefined();
    const t = renderHook(() => useRoundSharing({ roundId: ROUND, type: 'tournament', ports: p }));
    await waitFor(() => expect(p.loadRoundShare).toHaveBeenCalledWith(ROUND, 'tournament'));
    expect(t.result.current.row).toBeUndefined();
  });

  it('has no row when the live table is not there (the read answers null)', async () => {
    const p = ports({ loadRoundShare: vi.fn(async () => null) });
    const { result } = renderHook(() => useRoundSharing({ roundId: ROUND, type: 'practice', ports: p }));
    await waitFor(() => expect(p.loadRoundShare).toHaveBeenCalled());
    expect(result.current.row).toBeUndefined();
  });
});
