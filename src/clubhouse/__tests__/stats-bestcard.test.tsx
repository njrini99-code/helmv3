import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BestCardShare, type ChBestCard } from '../screens/stats/BestCard';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

const card: ChBestCard = { who: 'Jonah O.', score: 72, toPar: 'E', course: 'Pinehurst No. 8', date: 'Sep 9', attest: 'Attested by Coach Reyes' };
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);

function show() {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <BestCardShare card={card} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}

describe('P005-C2 the personal-best card', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AA==');
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['x'], { type: 'image/png' })));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'share');
  });

  it('CH-5810 opens a labelled sheet with the card as an image that names the best', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Share best score' }));
    await waitFor(() => expect(code('CH-5810')).not.toBeNull());
    expect(screen.getByRole('img', { name: /72 by Jonah O\., Pinehurst No\. 8, Sep 9/ })).toBeTruthy();
    expect(document.body.textContent).toContain('no school or team name');
  });

  it('CH-5005 a share that fails says so; closing the share sheet does not', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockRejectedValue(new Error('blocked')) });
    show();
    await user.click(screen.getByRole('button', { name: 'Share best score' }));
    await user.click(await screen.findByRole('button', { name: 'Share' }));
    await waitFor(() => expect(code('CH-5005')).not.toBeNull());
    expect(code('CH-5005')!.textContent).toMatch(/Couldn’t share the card/);
  });
});
