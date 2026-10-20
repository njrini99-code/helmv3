import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GolfUserProvider } from '@/contexts/golf-user-context';
import { getSyncSessionPlayer } from '@/lib/offline/session-player';

/** Swap audit §14 D9: React's development double effect cleared the offline drain's player until the next render. */
describe('GolfUserProvider sync player', () => {
  const userData = { userId: 'u1', role: 'player', teamId: 't1', coachId: null, playerId: 'p1', avatarUrl: null, name: 'P' } as never;

  it('stays set under StrictMode (mount, cleanup, mount) and clears on unmount', () => {
    const { unmount } = render(
      <StrictMode>
        <GolfUserProvider userData={userData}>
          <span />
        </GolfUserProvider>
      </StrictMode>,
    );
    expect(getSyncSessionPlayer()).toBe('p1');
    unmount();
    expect(getSyncSessionPlayer()).toBeNull();
  });
});
