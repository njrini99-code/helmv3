// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ getFeedback: () => undefined, addBreadcrumb: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));
vi.mock('@/app/golf/actions/round-live', () => ({ setLiveShare: vi.fn(), setLivePrefs: vi.fn(), setNextLiveShare: vi.fn() }));

import '../../../__tests__/dialog-polyfill';
import type { LiveSharePorts } from '../../../live/share-ports';
import { ToastProvider } from '../../../ui/Toast';
import { LiveRoundsCard, LiveRoundsGroup } from '../LiveRounds';

afterEach(cleanup);

const ports = (over: Partial<LiveSharePorts> = {}): LiveSharePorts => ({
  loadPrefs: vi.fn(async () => ({ practiceShare: 'off' as const })),
  loadRoundShare: vi.fn(),
  setNext: vi.fn(),
  setShare: vi.fn(),
  setPrefs: vi.fn(async (share) => ({ success: true as const, data: { practiceShare: share } })),
  ...over,
});

describe('Settings: Live rounds (player)', () => {
  it('draws nothing until sharing exists (the prefs read answers null)', async () => {
    const p = ports({ loadPrefs: vi.fn(async () => null) });
    const { container } = render(
      <ToastProvider>
        <LiveRoundsCard ports={p} />
      </ToastProvider>,
    );
    await waitFor(() => expect(p.loadPrefs).toHaveBeenCalled());
    expect(container.querySelector('#set-live')).toBeNull();
  });

  it('two rows: Practice rounds is a menu of the three levels, Qualifier rounds reads Coaches with the reason', async () => {
    render(
      <ToastProvider>
        <LiveRoundsCard ports={ports({ loadPrefs: vi.fn(async () => ({ practiceShare: 'coaches' as const })) })} />
      </ToastProvider>,
    );
    const select = (await screen.findByLabelText('Practice rounds')) as HTMLSelectElement;
    expect(select.value).toBe('coaches');
    expect([...select.options].map((o) => o.text)).toEqual(['Not live', 'Coaches', 'Coaches and team']);
    expect(screen.getByText('Qualifier rounds')).toBeTruthy();
    expect(screen.getByText('Qualifier rounds are always shown to coaches.')).toBeTruthy();
  });

  it('choosing a level saves the default', async () => {
    const user = userEvent.setup();
    const p = ports();
    render(
      <ToastProvider>
        <LiveRoundsCard ports={p} />
      </ToastProvider>,
    );
    const select = await screen.findByLabelText('Practice rounds');
    await user.selectOptions(select, 'team');
    await waitFor(() => expect(p.setPrefs).toHaveBeenCalledWith('team'));
    expect((select as HTMLSelectElement).value).toBe('team');
  });

  it('a refusal puts the menu back (and the toast says what failed, CH-16664)', async () => {
    const user = userEvent.setup();
    const p = ports({ setPrefs: vi.fn(async () => ({ success: false as const, error: 'Couldn’t change sharing. Try again.', code: 'CH-16664' as const, retryable: true })) });
    render(
      <ToastProvider>
        <LiveRoundsCard ports={p} />
      </ToastProvider>,
    );
    const select = (await screen.findByLabelText('Practice rounds')) as HTMLSelectElement;
    await user.selectOptions(select, 'coaches');
    await waitFor(() => expect(select.value).toBe('off'));
  });

  it('the phone group names the same two rows', async () => {
    render(
      <ToastProvider>
        <LiveRoundsGroup ports={ports()} />
      </ToastProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Live rounds' })).toBeTruthy();
    expect(screen.getByText('Practice rounds')).toBeTruthy();
    expect(screen.getByText('Qualifier rounds')).toBeTruthy();
  });
});
