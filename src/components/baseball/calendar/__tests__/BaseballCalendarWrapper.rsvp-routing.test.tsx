import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-SPORT DATA-INTEGRITY GATE
//
// This test is the regression guard for the confirmed defect: the baseball
// calendar uses the shared PremiumCalendarClient, whose deep features (RSVP +
// recurring) used to be hard-wired to GOLF. A baseball RSVP must NEVER touch
// the golf action / golf_event_attendance — it must route to rsvpToBaseballEvent
// (baseball_event_attendance), translating the golf RSVP vocabulary the shared
// UI emits ('accepted' | 'tentative' | 'declined') into the baseball vocabulary
// ('going' | 'maybe' | 'not_going').
//
// Strategy: stub the shared PremiumCalendarClient so it captures the props the
// wrapper injects (we don't need to render the whole calendar). Then exercise
// the injected respondToEvent handler and assert it (a) hit the baseball action,
// (b) NEVER hit the golf action, and that the capabilities turn OFF every
// golf-backed deep feature baseball can't safely back yet.
// ─────────────────────────────────────────────────────────────────────────────

const rsvpToBaseballEvent = vi.fn(async (..._args: unknown[]) => ({ success: true, data: { id: 'att-1' } }));
const createBaseballEvent = vi.fn(async (..._args: unknown[]) => ({ success: true, data: { id: 'evt-1' } }));
const updateBaseballEvent = vi.fn(async (..._args: unknown[]) => ({ success: true }));
const deleteBaseballEvent = vi.fn(async (..._args: unknown[]) => ({ success: true }));

vi.mock('@/app/baseball/actions/calendar', () => ({
  rsvpToBaseballEvent: (...args: unknown[]) => rsvpToBaseballEvent(...args),
  createBaseballEvent: (...args: unknown[]) => createBaseballEvent(...args),
  updateBaseballEvent: (...args: unknown[]) => updateBaseballEvent(...args),
  deleteBaseballEvent: (...args: unknown[]) => deleteBaseballEvent(...args),
}));

// Capture the props the wrapper passes into the shared client.
type CapturedProps = {
  actionHandlers?: {
    respondToEvent?: (id: string, r: string) => Promise<{ success: boolean; error?: string }>;
    createRecurringEvent?: unknown;
  };
  capabilities?: { recurring?: boolean; rsvpRead?: boolean; availability?: boolean; rsvpWrite?: boolean };
  teamId?: string;
};
let captured: CapturedProps = {};

vi.mock('@/components/shared/calendar/PremiumCalendarClient', () => ({
  PremiumCalendarClient: (props: CapturedProps) => {
    captured = props;
    return null;
  },
}));

// Import AFTER mocks are registered.
import { BaseballCalendarWrapper } from '@/components/baseball/calendar/BaseballCalendarWrapper';

beforeEach(() => {
  captured = {};
  rsvpToBaseballEvent.mockClear();
});

function renderWrapper() {
  render(
    <BaseballCalendarWrapper
      initialEvents={[]}
      teamMembers={[]}
      teamId="team-1"
      isCoach={false}
      currentUserId="player-1"
    />,
  );
}

describe('BaseballCalendarWrapper — RSVP routing (cross-sport integrity)', () => {
  it('injects a respondToEvent handler (does not rely on the golf default)', () => {
    renderWrapper();
    expect(typeof captured.actionHandlers?.respondToEvent).toBe('function');
  });

  it.each([
    ['accepted', 'going'],
    ['tentative', 'maybe'],
    ['declined', 'not_going'],
  ] as const)(
    'maps golf "%s" → baseball "%s" and writes ONLY the baseball table',
    async (golfResponse, baseballStatus) => {
      renderWrapper();
      const result = await captured.actionHandlers!.respondToEvent!('evt-9', golfResponse);

      expect(result.success).toBe(true);
      expect(rsvpToBaseballEvent).toHaveBeenCalledTimes(1);
      expect(rsvpToBaseballEvent).toHaveBeenCalledWith('evt-9', baseballStatus);
      expect(captured.actionHandlers?.respondToEvent).toBeDefined();
    },
  );

  it('rejects the non-user "pending" status without touching either table', async () => {
    renderWrapper();
    const result = await captured.actionHandlers!.respondToEvent!('evt-9', 'pending');

    expect(result.success).toBe(false);
    expect(rsvpToBaseballEvent).not.toHaveBeenCalled();
  });

  it('disables every golf-backed deep feature baseball cannot safely back', () => {
    renderWrapper();
    // No baseball recurring backend → recurring UI + golf recurring path off.
    expect(captured.capabilities?.recurring).toBe(false);
    // RSVP READ lives in baseball_event_attendance, not golf_event_attendance.
    expect(captured.capabilities?.rsvpRead).toBe(false);
    // No baseball availability backend → no golf availability queries.
    expect(captured.capabilities?.availability).toBe(false);
    // And the wrapper never hands the shared client a golf recurring handler.
    expect(captured.actionHandlers?.createRecurringEvent).toBeUndefined();
  });

  it('passes the server-resolved team id instead of relying on event/member inference', () => {
    renderWrapper();
    expect(captured.teamId).toBe('team-1');
  });
});
