import { describe, it, expect } from 'vitest';
import {
  planFocusArea,
  planTask,
  planAnnouncement,
  ActionPlanError,
} from '@/lib/coachhelm/v3/chat/action-planners';
import { CoachContextError } from '@/lib/coachhelm/v3/chat/context';
import type { CoachChatContext } from '@/lib/coachhelm/v3/chat/context';

const ctx: CoachChatContext = {
  coach_id: 'coach-1',
  user_id: 'user-1',
  team_id: 'team-1',
  team_name: 'Rini University',
  timezone: 'America/New_York',
  roster: [
    { id: 'p1', name: 'Nick Rini', first_name: 'Nick', last_name: 'Rini', graduation_year: 2027 },
    { id: 'p2', name: 'Sam Fox', first_name: 'Sam', last_name: 'Fox', graduation_year: 2028 },
  ],
};

/**
 * Every mutating action shares one contract: the coach must be able to read
 * exactly what will happen before it happens, and no id from outside their
 * roster may reach a write.
 */
describe('planFocusArea', () => {
  it('states the lifecycle, so a coach cannot mistake proposed for started', () => {
    const { proposal } = planFocusArea(ctx, {
      player_id: 'p1',
      title: 'Make rate inside 8 feet',
      area_type: 'putting',
      target_metric: 'putt_make_pct_3_8ft',
      current_value: 58,
      target_value: 70,
      target_rounds: 10,
    });
    expect(proposal.facts.find((f) => f.label === 'Status')?.value).toMatch(/Proposed/);
    expect(proposal.facts.find((f) => f.label === 'Status')?.value).toMatch(/Nick Rini accepts/);
  });

  it('shows the measurable target the coach is approving', () => {
    const { proposal } = planFocusArea(ctx, {
      player_id: 'p1',
      title: 'Putting',
      area_type: 'putting',
      target_metric: 'putt_make_pct_3_8ft',
      current_value: 58,
      target_value: 70,
    });
    expect(proposal.facts.find((f) => f.label === 'Target')?.value).toContain('70');
    expect(proposal.facts.find((f) => f.label === 'Target')?.value).toContain('58');
  });

  it('flags a missing measurable target rather than inventing one', () => {
    const { proposal } = planFocusArea(ctx, {
      player_id: 'p1',
      title: 'Putting',
      area_type: 'putting',
    });
    expect(proposal.missing).toEqual(['Measurable target']);
  });

  it('rejects a player outside the roster', () => {
    expect(() =>
      planFocusArea(ctx, { player_id: 'someone-else', title: 'x', area_type: 'putting' }),
    ).toThrow(CoachContextError);
  });

  it('refuses a contradictory timeframe instead of picking one', () => {
    expect(() =>
      planFocusArea(ctx, {
        player_id: 'p1',
        title: 'Putting',
        area_type: 'putting',
        target_date: '2026-09-01',
        target_rounds: 10,
      }),
    ).toThrow(ActionPlanError);
  });

  it('is idempotent for the same focus area on the same player', () => {
    const a = planFocusArea(ctx, { player_id: 'p1', title: 'Putting', area_type: 'putting' });
    const b = planFocusArea(ctx, { player_id: 'p1', title: 'Putting', area_type: 'putting' });
    expect(a.proposal.idempotency_key).toBe(b.proposal.idempotency_key);
    const other = planFocusArea(ctx, { player_id: 'p2', title: 'Putting', area_type: 'putting' });
    expect(other.proposal.idempotency_key).not.toBe(a.proposal.idempotency_key);
  });
});

describe('planTask', () => {
  it('assigns the whole active roster when nobody is named, and says so', () => {
    const { plan, proposal } = planTask(ctx, { title: 'Log your Tuesday round' });
    expect(plan.assignee_ids).toEqual(['p1', 'p2']);
    expect(proposal.facts.find((f) => f.label === 'Assigned to')?.value).toBe('All 2 active players');
  });

  it('names the assignees when only some are picked', () => {
    const { proposal } = planTask(ctx, { title: 'Range session', assign_to_player_ids: ['p2'] });
    expect(proposal.facts.find((f) => f.label === 'Assigned to')?.value).toBe('Sam Fox');
  });

  it('rejects an assignee outside the roster', () => {
    expect(() => planTask(ctx, { title: 'x', assign_to_player_ids: ['p1', 'intruder'] })).toThrow(
      CoachContextError,
    );
  });

  it('surfaces a missing due date rather than blocking on it', () => {
    const { proposal } = planTask(ctx, { title: 'Range session' });
    expect(proposal.missing).toEqual(['Due date']);
    expect(proposal.facts.find((f) => f.label === 'Due')?.missing).toBe(true);
  });

  it('needs a title', () => {
    expect(() => planTask(ctx, { title: '  ' })).toThrow(ActionPlanError);
  });
});

describe('planAnnouncement', () => {
  it('puts the FULL message body on the card, not a summary', () => {
    // A coach must approve the words their players will read, verbatim.
    const body = 'Practice moves to 4pm Thursday. Bring wedges and a range finder.';
    const { proposal } = planAnnouncement(ctx, { title: 'Practice change', body });
    expect(proposal.facts.find((f) => f.label === 'Message')?.value).toBe(body);
  });

  it('defaults to the whole team and states the count', () => {
    const { plan, proposal } = planAnnouncement(ctx, { title: 'Update', body: 'Body' });
    expect(plan.recipient_ids).toBeNull();
    expect(proposal.facts.find((f) => f.label === 'To')?.value).toContain('Rini University (2)');
  });

  it('states whether acknowledgement will be required', () => {
    const { proposal } = planAnnouncement(ctx, {
      title: 'Update',
      body: 'Body',
      requires_acknowledgement: true,
    });
    expect(proposal.facts.find((f) => f.label === 'Acknowledgement')?.value).toBe('Required');
    expect(proposal.notifications.join(' ')).toMatch(/acknowledge/i);
  });

  it('rejects a recipient outside the roster', () => {
    expect(() =>
      planAnnouncement(ctx, { title: 'x', body: 'y', recipient_player_ids: ['nope'] }),
    ).toThrow(CoachContextError);
  });

  it('needs a body — an empty update must never reach a Confirm button', () => {
    expect(() => planAnnouncement(ctx, { title: 'Title', body: '   ' })).toThrow(ActionPlanError);
  });
});
