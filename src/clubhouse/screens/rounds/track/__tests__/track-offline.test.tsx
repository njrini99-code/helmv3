import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundHole } from '@/lib/types/golf';
import { RoundTracking, type RoundTrackingProps } from '../RoundTracking';
import { OfflineBanner } from '../../../../shell/OfflineBanner';
import { PhoneChromeProvider, usePhoneImmersive } from '../../../../shell/phone-chrome';
import { ToastProvider } from '../../../../ui/Toast';
import '../../../../__tests__/dialog-polyfill';

/**
 * F-0011 (audit 2026-10-29): offline, the shell's banner sat over the immersive shot screen's Exit and Card and pushed its
 * result chips under the bar. On an immersive screen the banner steps aside, and the track's own save line says it.
 */
Element.prototype.scrollIntoView ??= function () {};
vi.mock('@/app/golf/actions/shot-actions', () => ({ deleteShot: vi.fn(), updateShot: vi.fn() }));
vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));

const HOLES: RoundHole[] = [{ number: 1, par: 4, yardage: 380, score: null }];
const ROUND = { course: 'Finley GC', teeLabel: 'Blue', teeColor: 'blue' as const, type: 'practice' as const };

function Immersive({ children }: { children: React.ReactNode }) {
  usePhoneImmersive(true);
  return <>{children}</>;
}

let online = true;
beforeEach(() => {
  online = true;
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the shot screen offline (F-0011)', () => {
  it('no banner over an immersive screen; the save line says Offline', async () => {
    online = false;
    const props: RoundTrackingProps = { round: ROUND, holes: HOLES, currentHoleIndex: 0, onHoleComplete: vi.fn(async () => true), onNavigateToHole: vi.fn(), onAutoSave: vi.fn(async () => undefined) };
    render(
      <ToastProvider>
        <PhoneChromeProvider>
          <OfflineBanner />
          <Immersive>
            <RoundTracking {...props} />
          </Immersive>
        </PhoneChromeProvider>
      </ToastProvider>,
    );
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(document.querySelector('.ch-offline')).toBeNull();
    expect(document.querySelector('[data-ch-code="CH-11901"]')?.textContent).toMatch(/Offline/);
  });

  it('the banner still shows on a screen that is not immersive', async () => {
    online = false;
    render(
      <PhoneChromeProvider>
        <OfflineBanner />
      </PhoneChromeProvider>,
    );
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(document.querySelector('.ch-offline')).not.toBeNull();
  });
});
