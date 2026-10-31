// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/app/golf/actions/round-live', () => ({ setLiveShare: vi.fn(), setLivePrefs: vi.fn(), setNextLiveShare: vi.fn() }));

import type { LiveSharePorts } from '../../../../live/share-ports';
import { LiveShareField } from '../LiveShareField';

afterEach(cleanup);

const ports = (over: Partial<LiveSharePorts> = {}): LiveSharePorts => ({
  loadPrefs: vi.fn(async () => ({ practiceShare: 'off' as const })),
  loadRoundShare: vi.fn(async () => 'off' as const),
  setNext: vi.fn(async (share) => ({ success: true as const, data: { share, seq: null, clamped: false } })),
  setShare: vi.fn(),
  setPrefs: vi.fn(),
  ...over,
});

describe('Round setup: Show this round live to (CH-16660 to CH-16663, CH-16684)', () => {
  it('draws nothing until sharing exists: the prefs read answers null', async () => {
    const p = ports({ loadPrefs: vi.fn(async () => null) });
    const { container } = render(<LiveShareField type="practice" ports={p} />);
    await waitFor(() => expect(p.loadPrefs).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
    expect(p.setNext).not.toHaveBeenCalled();
  });

  it('practice: three choices, the default is the player’s own, and the helper lines read as written', async () => {
    const p = ports({ loadPrefs: vi.fn(async () => ({ practiceShare: 'coaches' as const })) });
    render(<LiveShareField type="practice" ports={p} />);
    const group = await screen.findByRole('radiogroup', { name: 'Show this round live to' }).catch(() => null);
    expect(screen.getByText('Show this round live to')).toBeTruthy();
    expect((group ?? document.body).textContent).toContain('Not live');
    expect(screen.getByRole('radio', { name: 'Coaches' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Coaches and team' }).hasAttribute('disabled')).toBe(false);
    expect(document.querySelector('[data-ch-code="CH-16663"]')?.textContent).toBe('They see your score and the hole you’re on, not your location.');
    expect(document.querySelector('[data-ch-code="CH-16684"]')?.textContent).toBe('Not live keeps this round off live views. Your team can still open it in Rounds.');
  });

  it('tells the database the shown value once when it first appears, and again on every change', async () => {
    const user = userEvent.setup();
    const p = ports();
    render(<LiveShareField type="practice" ports={p} />);
    await waitFor(() => expect(p.setNext).toHaveBeenCalledWith('off', false));
    await user.click(screen.getByRole('radio', { name: 'Coaches and team' }));
    await waitFor(() => expect(p.setNext).toHaveBeenLastCalledWith('team', true));
    expect(p.setNext).toHaveBeenCalledTimes(2);
  });

  it('changing the level offers "Use this for future practice rounds", on by default; turning it off sends remember false', async () => {
    const user = userEvent.setup();
    const p = ports();
    render(<LiveShareField type="practice" ports={p} />);
    await waitFor(() => expect(p.setNext).toHaveBeenCalled());
    expect(screen.queryByRole('switch', { name: 'Use this for future practice rounds' })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Coaches' }));
    const remember = await screen.findByRole('switch', { name: 'Use this for future practice rounds' });
    expect((remember as HTMLInputElement).checked).toBe(true);
    await user.click(remember);
    await waitFor(() => expect(p.setNext).toHaveBeenLastCalledWith('coaches', false));
  });

  it('a qualifier is always shown to coaches: Not live and team are unavailable, with the caption (CH-16662), and nothing is sent', async () => {
    const p = ports();
    render(<LiveShareField type="qualifier" ports={p} />);
    await screen.findByText('Qualifier rounds are always shown to coaches.');
    expect(screen.getByRole('radio', { name: 'Coaches' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Not live' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('radio', { name: 'Coaches and team' }).hasAttribute('disabled')).toBe(true);
    expect(document.querySelector('[data-ch-code="CH-16684"]')).toBeNull();
    expect(p.setNext).not.toHaveBeenCalled();
  });

  it('a tournament has no control, only the line', async () => {
    render(<LiveShareField type="tournament" ports={ports()} />);
    await screen.findByText('Coaches see tournament rounds live.');
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('a refusal puts the control back to the level it had and says so (CH-16664)', async () => {
    const user = userEvent.setup();
    const setNext = vi
      .fn()
      .mockResolvedValueOnce({ success: true, data: { share: 'off', seq: null, clamped: false } })
      .mockResolvedValueOnce({ success: false, error: 'Couldn’t change sharing. Try again.', code: 'CH-16664', retryable: true });
    render(<LiveShareField type="practice" ports={ports({ setNext })} />);
    await waitFor(() => expect(setNext).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('radio', { name: 'Coaches' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Couldn’t change sharing. Try again.');
    expect(alert.getAttribute('data-ch-code')).toBe('CH-16664');
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Not live' }).getAttribute('aria-checked')).toBe('true'));
  });
});
