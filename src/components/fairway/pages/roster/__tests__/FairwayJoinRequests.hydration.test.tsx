import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FairwayJoinRequests } from '@/components/fairway/pages/roster/FairwayJoinRequests';
import type { JoinRequestData } from '@/app/golf/actions/teams';

// Presentation-only component, but it imports the mutation actions by value.
vi.mock('@/app/golf/actions/teams', () => ({
  acceptJoinRequest: vi.fn(),
  rejectJoinRequest: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

/**
 * Regression for the React #418 Helm Bridge incident on `roster_management`
 * (fingerprint 9a9bd9d5, last seen 2026-07-21).
 *
 * The "requested Nm ago" label read `new Date()` during render. This is a
 * 'use client' component, so that value differs between the server pass and
 * the client's first pass — a guaranteed text-node mismatch.
 *
 * Asserts the invariant rather than the copy: server markup must not depend
 * on the wall clock.
 */

const requests: JoinRequestData[] = [
  {
    id: 'req-1',
    team_id: 'team-1',
    player_id: 'player-1',
    status: 'pending',
    message: 'Would love to join.',
    created_at: '2026-07-21T06:00:00.000Z',
    player: {
      id: 'player-1',
      first_name: 'Avery',
      last_name: 'Stone',
      graduation_year: 2028,
      hometown: 'Austin',
      state: 'TX',
      handicap: 2,
    },
  } as unknown as JoinRequestData,
];

function ssr() {
  return renderToString(<FairwayJoinRequests requests={requests} enableModal={false} />);
}

describe('FairwayJoinRequests server render (React #418 regression)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('produces identical markup no matter what time the server renders at', () => {
    vi.setSystemTime(new Date('2026-07-21T06:05:00.000Z'));
    const first = ssr();

    // Crosses the "5m ago" -> "3h ago" boundary that produced the incident.
    vi.setSystemTime(new Date('2026-07-21T09:12:00.000Z'));
    const second = ssr();

    expect(second).toBe(first);
  });

  it('emits no relative time label on the server pass', () => {
    vi.setSystemTime(new Date('2026-07-21T06:05:00.000Z'));
    const html = ssr();

    expect(html).not.toMatch(/\bago\b/);
    expect(html).not.toContain('Just now');
  });
});
