import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const a = vi.hoisted(() => ({
  completeFocusArea: vi.fn(),
  reactivateFocusArea: vi.fn(),
  pauseGoal: vi.fn(),
  resumeGoal: vi.fn(),
  abandonGoal: vi.fn(),
  acknowledgeInsight: vi.fn(),
  dismissInsight: vi.fn(),
  verifyPlayerAccess: vi.fn(),
  verifyInsightAccess: vi.fn(),
}));
vi.mock('@/app/golf/actions/development', () => ({ completeFocusArea: a.completeFocusArea, reactivateFocusArea: a.reactivateFocusArea }));
vi.mock('@/app/golf/actions/v3/goals', () => ({ pauseGoal: a.pauseGoal, resumeGoal: a.resumeGoal, abandonGoal: a.abandonGoal }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ acknowledgeInsight: a.acknowledgeInsight, dismissInsight: a.dismissInsight }));
vi.mock('@/lib/auth/verify-player-access', () => ({ verifyPlayerAccess: a.verifyPlayerAccess, verifyInsightAccess: a.verifyInsightAccess }));

import { AVERY, COACH_USER, OTHER_TEAM, STRANGER, TEAM, coachWho, fakeSb, playerWho, toolCtx } from '../../context/__tests__/fake-sb';
import { developmentTools, dismissSignal, markSignalHandled, setFocusAreaStatus, setGoalState } from '../development-tasks';
import type { StoredProposal } from '../kit';

const FOCUS = '60000000-0000-4000-8000-000000000001';
const FOREIGN_FOCUS = '60000000-0000-4000-8000-000000000002';
const GOAL = '70000000-0000-4000-8000-000000000001';
const SIGNAL = '80000000-0000-4000-8000-000000000001';
const FOREIGN_SIGNAL = '80000000-0000-4000-8000-000000000002';

const db = (over: { focus?: string; goal?: string; signal?: string } = {}) =>
  fakeSb({
    golf_player_focus_areas: { rows: [{ id: FOCUS, player_id: AVERY, title: 'Lag putting', status: over.focus ?? 'active' }, { id: FOREIGN_FOCUS, player_id: STRANGER, title: 'Rival focus', status: 'active' }] },
    golf_goals: { rows: [{ id: GOAL, player_id: AVERY, title: 'Scoring average under 74', state: over.goal ?? 'active' }] },
    golf_coach_insights: { rows: [{ id: SIGNAL, team_id: TEAM, player_id: AVERY, title: 'Three-putts are up', status: over.signal ?? 'new' }, { id: FOREIGN_SIGNAL, team_id: OTHER_TEAM, player_id: STRANGER, title: 'Rival signal', status: 'new' }] },
  });
const fact = (p: StoredProposal, label: string) => p.facts.find((f) => f.label === label)?.value;
const stored = (p: StoredProposal) => JSON.parse(JSON.stringify(p)) as StoredProposal;
const set = (tables: ReturnType<typeof fakeSb>['tables'], table: string, id: string, patch: Record<string, unknown>) => Object.assign(tables[table]!.rows!.find((r) => r.id === id)!, patch);

beforeEach(() => {
  Object.values(a).forEach((f) => f.mockReset());
  a.verifyPlayerAccess.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'c' });
  a.verifyInsightAccess.mockResolvedValue({ allowed: true, teamId: TEAM });
});

describe('set_focus_area_status', () => {
  it('the card writes nothing, names the player and the focus area, and says what the player will see', async () => {
    const { sb, writes } = db();
    const p = await setFocusAreaStatus.plan(toolCtx(sb, coachWho()), { focus_area_id: FOCUS, status: 'completed' });
    expect(writes).toEqual([]);
    expect(a.completeFocusArea).not.toHaveBeenCalled();
    expect(p.summary).toBe('Mark Avery Lane’s focus area “Lag putting” as completed.');
    expect([fact(p, 'Player'), fact(p, 'Now'), fact(p, 'After')]).toEqual(['Avery Lane', 'Active', 'Completed']);
    expect(fact(p, 'The player sees')).toBe('It shows as completed on their development page. No notification is sent.');
    expect(p.notifications).toEqual([]);
    expect([p.recipients, p.delivery, p.visible_note]).toEqual([[], null, 'It shows as completed on their development page. No notification is sent.']);
    // The action's own gate was asked, for this player and this signed-in user.
    expect(a.verifyPlayerAccess).toHaveBeenCalledWith(AVERY, COACH_USER, sb);
  });

  it('completes through the app’s action; a second commit finds it done and does not call the action again', async () => {
    const { sb, tables, writes } = db();
    a.completeFocusArea.mockImplementation(async (id: string) => (set(tables, 'golf_player_focus_areas', id, { status: 'completed' }), { success: true }));
    const p = stored(await setFocusAreaStatus.plan(toolCtx(sb, coachWho()), { focus_area_id: FOCUS, status: 'completed' }));
    expect(await setFocusAreaStatus.commit(toolCtx(sb, coachWho()), p)).toMatchObject({ status: 'completed', summary: 'Avery Lane’s focus area “Lag putting” is completed. No notification is sent.' });
    expect((await setFocusAreaStatus.commit(toolCtx(sb, coachWho()), p)).status).toBe('completed');
    expect(a.completeFocusArea).toHaveBeenCalledExactlyOnceWith(FOCUS);
    expect(writes).toEqual([]);
  });

  it('reopens only a completed one, through the reopen action', async () => {
    await expect(setFocusAreaStatus.plan(toolCtx(db().sb, coachWho()), { focus_area_id: FOCUS, status: 'active' })).rejects.toThrow('Only a completed focus area can be reopened.');
    const { sb, tables } = db({ focus: 'completed' });
    a.reactivateFocusArea.mockImplementation(async (id: string) => (set(tables, 'golf_player_focus_areas', id, { status: 'active' }), { success: true }));
    const p = stored(await setFocusAreaStatus.plan(toolCtx(sb, coachWho()), { focus_area_id: FOCUS, status: 'active' }));
    expect((await setFocusAreaStatus.commit(toolCtx(sb, coachWho()), p)).summary).toBe('Avery Lane’s focus area “Lag putting” is active again. No notification is sent.');
    await expect(setFocusAreaStatus.plan(toolCtx(sb, coachWho()), { focus_area_id: FOCUS, status: 'active' })).rejects.toThrow('Only a completed focus area can be reopened.');
  });

  it('refuses a player, another team’s focus area, a coach the app would refuse, and reports a refusal at commit as nothing changed', async () => {
    const { sb, reads } = db();
    await expect(setFocusAreaStatus.plan(toolCtx(sb, playerWho(), 'player'), { focus_area_id: FOCUS, status: 'completed' })).rejects.toThrow('Only a coach can do that.');
    expect(reads).toEqual([]);
    await expect(setFocusAreaStatus.plan(toolCtx(sb, coachWho()), { focus_area_id: FOREIGN_FOCUS, status: 'completed' })).rejects.toThrow(/not one of your players/);
    const p = stored(await setFocusAreaStatus.plan(toolCtx(sb, coachWho()), { focus_area_id: FOCUS, status: 'completed' }));
    a.verifyPlayerAccess.mockResolvedValue({ allowed: false, reason: 'denied' });
    await expect(setFocusAreaStatus.plan(toolCtx(sb, coachWho()), { focus_area_id: FOCUS, status: 'completed' })).rejects.toThrow('You do not have access to that player.');
    a.verifyPlayerAccess.mockResolvedValue({ allowed: false, reason: 'unavailable' });
    await expect(setFocusAreaStatus.plan(toolCtx(sb, coachWho()), { focus_area_id: FOCUS, status: 'completed' })).rejects.toThrow(/could not be checked just now/);
    a.completeFocusArea.mockResolvedValue({ success: false, error: 'Forbidden' });
    expect(await setFocusAreaStatus.commit(toolCtx(sb, coachWho()), p)).toMatchObject({ status: 'failed', summary: 'Forbidden. Nothing was changed.' });
    await expect(setFocusAreaStatus.commit(toolCtx(sb, playerWho(), 'player'), p)).rejects.toThrow('Only a coach can do that.');
  });
});

describe('set_goal_state', () => {
  it('the card writes nothing and says what the player will see; closing keeps the coach’s reason', async () => {
    const { sb, writes } = db();
    const p = await setGoalState.plan(toolCtx(sb, coachWho()), { goal_id: GOAL, state: 'abandoned', reason: 'Switching  to a putting goal' });
    expect(writes).toEqual([]);
    expect(p.summary).toBe('Close Avery Lane’s goal “Scoring average under 74”.');
    expect([fact(p, 'Now'), fact(p, 'After'), fact(p, 'Reason kept with the goal')]).toEqual(['Active', 'Closed without being reached', 'Switching to a putting goal']);
    expect(fact(p, 'The player sees')).toBe('It leaves their active goals and shows as closed. No notification is sent.');
  });

  it('each state goes through its own action, once, and a refusal is reported as nothing changed', async () => {
    const { sb, tables } = db();
    a.pauseGoal.mockImplementation(async (id: string) => (set(tables, 'golf_goals', id, { state: 'paused' }), { ok: true }));
    a.resumeGoal.mockImplementation(async (id: string) => (set(tables, 'golf_goals', id, { state: 'active' }), { ok: true }));
    const pause = stored(await setGoalState.plan(toolCtx(sb, coachWho()), { goal_id: GOAL, state: 'paused', reason: null }));
    expect((await setGoalState.commit(toolCtx(sb, coachWho()), pause)).summary).toBe('Avery Lane’s goal “Scoring average under 74” is paused. No notification is sent.');
    expect((await setGoalState.commit(toolCtx(sb, coachWho()), pause)).status).toBe('completed');
    expect(a.pauseGoal).toHaveBeenCalledExactlyOnceWith(GOAL);
    const resume = stored(await setGoalState.plan(toolCtx(sb, coachWho()), { goal_id: GOAL, state: 'active', reason: null }));
    expect((await setGoalState.commit(toolCtx(sb, coachWho()), resume)).status).toBe('completed');
    const close = stored(await setGoalState.plan(toolCtx(sb, coachWho()), { goal_id: GOAL, state: 'abandoned', reason: 'Injury layoff plan changed' }));
    a.abandonGoal.mockResolvedValue({ ok: false, error: 'Goal not found or not permitted' });
    expect(await setGoalState.commit(toolCtx(sb, coachWho()), close)).toMatchObject({ status: 'failed', summary: 'Goal not found or not permitted. Nothing was changed.' });
    expect(a.abandonGoal).toHaveBeenCalledWith(GOAL, 'Injury layoff plan changed');
  });

  it('refuses a state the goal is already in, a resume of an active goal, a player and a coach the app would refuse', async () => {
    await expect(setGoalState.plan(toolCtx(db().sb, coachWho()), { goal_id: GOAL, state: 'active', reason: null })).rejects.toThrow('That goal is already active.');
    await expect(setGoalState.plan(toolCtx(db({ goal: 'achieved' }).sb, coachWho()), { goal_id: GOAL, state: 'paused', reason: null })).rejects.toThrow('Only an active goal can be paused.');
    await expect(setGoalState.plan(toolCtx(db().sb, playerWho(), 'player'), { goal_id: GOAL, state: 'paused', reason: null })).rejects.toThrow('Only a coach can do that.');
    a.verifyPlayerAccess.mockResolvedValue({ allowed: false, reason: 'denied' });
    await expect(setGoalState.plan(toolCtx(db().sb, coachWho()), { goal_id: GOAL, state: 'paused', reason: null })).rejects.toThrow('You do not have access to that player.');
  });
});

describe('set_goal_state: editing the reason before Confirm', () => {
  it('a close offers its reason and an edit plans again; a pause offers nothing; the state and the goal are never fields', async () => {
    const { sb, writes } = db();
    const p = stored(await setGoalState.plan(toolCtx(sb, coachWho()), { goal_id: GOAL, state: 'abandoned', reason: 'Switching to a putting goal' }));
    expect(p.editable?.map((f) => [f.key, f.label, f.value])).toEqual([['reason', 'Reason kept with the goal', 'Switching to a putting goal']]);
    const q = await setGoalState.revise!(toolCtx(sb, coachWho()), p, { reason: 'Injury: back in spring' });
    expect(fact(q, 'Reason kept with the goal')).toBe('Injury: back in spring');
    expect(writes).toEqual([]);
    expect(a.abandonGoal).not.toHaveBeenCalled();
    await expect(setGoalState.revise!(toolCtx(sb, coachWho()), p, { state: 'paused' })).rejects.toThrow('That cannot be changed on this card. Ask for it in words instead.');
    await expect(setGoalState.revise!(toolCtx(sb, playerWho(), 'player'), p, { reason: 'x' })).rejects.toThrow('Only a coach can do that.');
    expect((await setGoalState.plan(toolCtx(sb, coachWho()), { goal_id: GOAL, state: 'paused', reason: null })).editable).toBeUndefined();
  });
});

describe('mark_signal_handled', () => {
  it('the card says the player will see “Acknowledged” on their own page, and writes nothing', async () => {
    const { sb, writes } = db();
    const p = await markSignalHandled.plan(toolCtx(sb, coachWho()), { insight_id: SIGNAL });
    expect(writes).toEqual([]);
    expect(fact(p, 'About')).toBe('Avery Lane');
    expect(fact(p, 'The player sees')).toBe('On Avery Lane’s own CoachHelm page this signal reads “Acknowledged” in place of its priority. No notification is sent.');
    expect(a.verifyInsightAccess).toHaveBeenCalledWith(SIGNAL, COACH_USER, sb);
  });

  it('that sentence is still true of the app: the player’s loaders mark an acknowledged signal and the card draws the word', () => {
    const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
    expect(read('src/clubhouse/data/coachhelm-map.ts')).toContain("acknowledged: ins.status === 'acknowledged',");
    expect(read('src/clubhouse/data/coachhelm-shape.ts')).toContain("if (ins.acknowledged) return { cls: 'done', word: 'Acknowledged' };");
    expect(read('src/clubhouse/data/coachhelm-player.ts')).toContain('toChInsight(');
    expect(read('src/clubhouse/data/coachhelm-dive.ts')).toContain('toChInsight(');
  });

  it('marks it through the app’s action once; refuses another team’s signal, one already handled, a player, and a coach the app would refuse', async () => {
    const { sb, tables, writes } = db();
    a.acknowledgeInsight.mockImplementation(async (id: string) => (set(tables, 'golf_coach_insights', id, { status: 'acknowledged' }), { success: true }));
    const p = stored(await markSignalHandled.plan(toolCtx(sb, coachWho()), { insight_id: SIGNAL }));
    expect(await markSignalHandled.commit(toolCtx(sb, coachWho()), p)).toMatchObject({ status: 'completed', summary: '“Three-putts are up” is marked handled. No notification is sent.' });
    expect((await markSignalHandled.commit(toolCtx(sb, coachWho()), p)).status).toBe('completed');
    expect(a.acknowledgeInsight).toHaveBeenCalledExactlyOnceWith(SIGNAL);
    expect(writes).toEqual([]);
    await expect(markSignalHandled.plan(toolCtx(sb, coachWho()), { insight_id: SIGNAL })).rejects.toThrow('That signal is already marked handled.');
    // The gate passes it (say a wider policy), and the team is still compared on the row.
    await expect(markSignalHandled.plan(toolCtx(sb, coachWho()), { insight_id: FOREIGN_SIGNAL })).rejects.toThrow('That signal is not one of your team’s.');
    a.verifyInsightAccess.mockResolvedValue({ allowed: false, reason: 'denied' });
    await expect(markSignalHandled.plan(toolCtx(db().sb, coachWho()), { insight_id: SIGNAL })).rejects.toThrow('That signal is not one of your team’s.');
    await expect(markSignalHandled.plan(toolCtx(db().sb, playerWho(), 'player'), { insight_id: SIGNAL })).rejects.toThrow('Only a coach can do that.');
  });

  it('a failure that left nothing changed says so; one that could not be checked says that', async () => {
    const { sb, tables } = db();
    const p = stored(await markSignalHandled.plan(toolCtx(sb, coachWho()), { insight_id: SIGNAL }));
    a.acknowledgeInsight.mockResolvedValue({ success: false, error: 'Operation failed. Please try again.' });
    expect((await markSignalHandled.commit(toolCtx(sb, coachWho()), p)).summary).toBe('Operation failed. Please try again. Nothing was changed.');
    tables.golf_coach_insights = { error: { message: 'timeout' } };
    expect((await markSignalHandled.commit(toolCtx(sb, coachWho()), p)).summary).toMatch(/I could not check whether it went through: look in the CoachHelm board/);
  });
});

describe('dismiss_signal', () => {
  it('the card says it leaves the player’s own page too, that the record is kept, and writes nothing', async () => {
    const { sb, writes } = db();
    const p = await dismissSignal.plan(toolCtx(sb, coachWho()), { insight_id: SIGNAL });
    expect(writes).toEqual([]);
    expect(a.dismissInsight).not.toHaveBeenCalled();
    expect(fact(p, 'The player sees')).toBe('It also disappears from Avery Lane’s own CoachHelm page. No notification is sent.');
    expect(fact(p, 'The record')).toBe('The signal is kept, not deleted.');
    expect(fact(p, 'Bringing it back')).toBe('Only with Undo, in the few seconds after you confirm. After that no screen brings it back: the CoachHelm board’s own Undo works only for a signal dismissed on that board.');
    expect(p.undo).toEqual({ window: true, after: fact(p, 'Bringing it back') });
    expect([p.recipients, p.delivery]).toEqual([[], null]);
  });

  it('that is still how the app’s restore is reached: one caller, the Undo beside a signal dismissed on the board in that visit', () => {
    const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
    expect(read('src/clubhouse/screens/coachhelm/writes.ts')).toContain("undo: (insightId, lifecycle) => reactivateInsight(insightId, lifecycle, 'dismiss'),");
    const board = read('src/clubhouse/screens/coachhelm/parts.tsx');
    // The board remembers what it dismissed in its own state, and its Undo takes the signal from there.
    expect(board).toContain('if (normalise(res).success) setDismissed((d) => ({ ...d, [t.ins.id]: true }));');
    expect(board).toContain('const res = await writes.undo(t.ins.id, t.ins.lifecycle);');
    // Nothing in Fairway's screens or the Clubhouse data loaders calls the restore.
    for (const f of ['src/clubhouse/data/coachhelm.ts', 'src/components/golf/coachhelm/triage/TriageDesk.tsx']) expect(read(f)).not.toContain('reactivateInsight(');
  });

  it('that sentence is still the app’s one visibility rule: a dismissed signal is shown to nobody', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/coachhelm/v3/insight-visibility.ts'), 'utf8');
    expect(src).toContain(".neq('status', 'dismissed') as Q;");
    expect(src).toContain("export const VISIBLE_LIFECYCLE_STATES = ['detected', 'matured', 'addressed', 'resolved'] as const;");
    // And the player's page comes through that rule.
    expect(readFileSync(join(process.cwd(), 'src/clubhouse/data/coachhelm.ts'), 'utf8')).toContain("applyInsightVisibility(supabase.from('golf_coach_insights')");
  });

  it('dismisses through the app’s action once; refuses one already dismissed, another team’s, a player, and a coach the app would refuse', async () => {
    const { sb, tables, writes } = db();
    a.dismissInsight.mockImplementation(async (id: string) => (set(tables, 'golf_coach_insights', id, { status: 'dismissed' }), { success: true }));
    const p = stored(await dismissSignal.plan(toolCtx(sb, coachWho()), { insight_id: SIGNAL }));
    expect(await dismissSignal.commit(toolCtx(sb, coachWho()), p)).toMatchObject({ status: 'completed', summary: '“Three-putts are up” is dismissed. No notification is sent.' });
    expect((await dismissSignal.commit(toolCtx(sb, coachWho()), p)).status).toBe('completed');
    expect(a.dismissInsight).toHaveBeenCalledExactlyOnceWith(SIGNAL);
    expect(writes).toEqual([]);
    await expect(dismissSignal.plan(toolCtx(sb, coachWho()), { insight_id: SIGNAL })).rejects.toThrow('That signal is already dismissed.');
    await expect(dismissSignal.plan(toolCtx(sb, coachWho()), { insight_id: FOREIGN_SIGNAL })).rejects.toThrow('That signal is not one of your team’s.');
    await expect(dismissSignal.plan(toolCtx(db().sb, playerWho(), 'player'), { insight_id: SIGNAL })).rejects.toThrow('Only a coach can do that.');
    a.verifyInsightAccess.mockResolvedValue({ allowed: false, reason: 'denied' });
    await expect(dismissSignal.plan(toolCtx(db().sb, coachWho()), { insight_id: SIGNAL })).rejects.toThrow('That signal is not one of your team’s.');
    const other = db();
    a.verifyInsightAccess.mockResolvedValue({ allowed: true, teamId: TEAM });
    const q = stored(await dismissSignal.plan(toolCtx(other.sb, coachWho()), { insight_id: SIGNAL }));
    a.dismissInsight.mockResolvedValue({ success: false, error: 'Insight not found' });
    expect((await dismissSignal.commit(toolCtx(other.sb, coachWho()), q)).summary).toBe('Insight not found. Nothing was changed.');
  });
});

it('three tasks, in a fixed order', () => {
  expect(developmentTools().map((t) => [t.name, t.kind])).toEqual([['set_focus_area_status', 'task'], ['set_goal_state', 'task'], ['mark_signal_handled', 'task']]);
});
