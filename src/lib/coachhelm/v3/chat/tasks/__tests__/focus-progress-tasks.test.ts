import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const a = vi.hoisted(() => ({
  completeFocusArea: vi.fn(),
  reactivateFocusArea: vi.fn(),
  updateFocusAreaProgress: vi.fn(),
  recordFocusAreaOutcome: vi.fn(),
  verifyPlayerAccess: vi.fn(),
  verifyInsightAccess: vi.fn(),
}));
vi.mock('@/app/golf/actions/development', () => ({
  completeFocusArea: a.completeFocusArea,
  reactivateFocusArea: a.reactivateFocusArea,
  updateFocusAreaProgress: a.updateFocusAreaProgress,
  recordFocusAreaOutcome: a.recordFocusAreaOutcome,
}));
vi.mock('@/app/golf/actions/v3/goals', () => ({ pauseGoal: vi.fn(), resumeGoal: vi.fn(), abandonGoal: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ acknowledgeInsight: vi.fn(), dismissInsight: vi.fn() }));
vi.mock('@/lib/auth/verify-player-access', () => ({ verifyPlayerAccess: a.verifyPlayerAccess, verifyInsightAccess: a.verifyInsightAccess }));

import { AVERY, COACH_USER, STRANGER, TEAM, coachWho, fakeSb, playerWho, toolCtx } from '../../context/__tests__/fake-sb';
import { logFocusProgress, recordFocusOutcome } from '../development-tasks';
import type { StoredProposal } from '../kit';

const FOCUS = '60000000-0000-4000-8000-000000000001';
const FOREIGN_FOCUS = '60000000-0000-4000-8000-000000000002';
const SIGNAL = '80000000-0000-4000-8000-000000000001';

type Row = Record<string, unknown>;
const focus = (over: Row = {}): Row => ({ id: FOCUS, player_id: AVERY, title: 'Lag putting', status: 'active', current_value: 34, target_value: 30, target_metric: 'three putts in a nine-hole drill', progress_notes: null, outcome_status: null, from_insight_id: null, ...over });
const db = (over: Row = {}) =>
  fakeSb({
    golf_player_focus_areas: { rows: [focus(over), focus({ id: FOREIGN_FOCUS, player_id: STRANGER, title: 'Rival focus' })] },
    golf_coach_insights: { rows: [{ id: SIGNAL, team_id: TEAM, player_id: AVERY, title: 'Three-putts are up', status: 'acknowledged', outcome_status: null }] },
  });
const fact = (p: StoredProposal, label: string) => p.facts.find((f) => f.label === label)?.value;
const stored = (p: StoredProposal) => JSON.parse(JSON.stringify(p)) as StoredProposal;
const set = (tables: ReturnType<typeof fakeSb>['tables'], table: string, id: string, patch: Row) => Object.assign(tables[table]!.rows!.find((r) => r.id === id)!, patch);
const source = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');

beforeEach(() => {
  Object.values(a).forEach((f) => f.mockReset());
  a.verifyPlayerAccess.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'c' });
});

describe('log_focus_progress', () => {
  it('the card writes nothing and shows the value now, the value after, the target, the note word for word and what the player sees', async () => {
    const { sb, writes } = db();
    const p = await logFocusProgress.plan(toolCtx(sb, coachWho()), { focus_area_id: FOCUS, value: 31, note: '  Pace was much better on Tuesday  ' });
    expect(writes).toEqual([]);
    expect(a.updateFocusAreaProgress).not.toHaveBeenCalled();
    expect(p.summary).toBe('Set Avery Lane’s focus area “Lag putting” to 31, with a note.');
    expect([fact(p, 'Player'), fact(p, 'Now'), fact(p, 'After'), fact(p, 'Target'), fact(p, 'Note')]).toEqual(['Avery Lane', '34', '31', '30', 'Pace was much better on Tuesday']);
    expect(fact(p, 'Tracking')).toBe('By hand. The value stays until someone changes it.');
    expect(fact(p, 'The player sees')).toBe('The value 31 on this focus area on their own page. The note is saved with the entry; the focus area card shows an entry’s value and date, not its note. No notification is sent.');
    expect([p.recipients, p.delivery, p.notifications, p.visible_note]).toEqual([[], null, [], fact(p, 'The player sees')]);
    expect(a.verifyPlayerAccess).toHaveBeenCalledWith(AVERY, COACH_USER, sb);
  });

  it('says so when the app measures the value from rounds and can replace a typed one', async () => {
    const p = await logFocusProgress.plan(toolCtx(db({ target_metric: 'gir_pct' }).sb, coachWho()), { focus_area_id: FOCUS, value: 61, note: null });
    expect(fact(p, 'Tracking')).toBe('From the player’s rounds. The app writes this value itself when it has rounds to measure, so the one entered here can be replaced the next time the page is opened.');
    expect(fact(p, 'Note')).toBeUndefined();
    expect(fact(p, 'The player sees')).toBe('The value 61 on this focus area on their own page. No notification is sent.');
    // The driver that does it, and the two moments it runs.
    expect(source('src/lib/golf/progress-drivers.ts')).toMatch(/safe to call on page view[\s\S]{0,80}AND from the nightly cron/);
  });

  it('a note alone keeps the value; no value and nothing to keep, nothing at all, and the same value again are refused', async () => {
    const p = await logFocusProgress.plan(toolCtx(db().sb, coachWho()), { focus_area_id: FOCUS, value: null, note: 'Looked sharp' });
    expect(p.summary).toBe('Add a note to Avery Lane’s focus area “Lag putting”.');
    expect([fact(p, 'Now'), fact(p, 'After'), (p.input as { value: number }).value]).toEqual(['34', '34', 34]);
    await expect(logFocusProgress.plan(toolCtx(db({ current_value: null }).sb, coachWho()), { focus_area_id: FOCUS, value: null, note: 'Looked sharp' })).rejects.toThrow(/has no value yet/);
    await expect(logFocusProgress.plan(toolCtx(db().sb, coachWho()), { focus_area_id: FOCUS, value: null, note: null })).rejects.toThrow('Give a value, a note, or both.');
    await expect(logFocusProgress.plan(toolCtx(db().sb, coachWho()), { focus_area_id: FOCUS, value: 34, note: null })).rejects.toThrow('That focus area is already at 34.');
  });

  it('writes through the app’s action once; a second commit finds the entry and does not write it again', async () => {
    const { sb, tables, writes } = db();
    a.updateFocusAreaProgress.mockImplementation(async (id: string, value: number, options?: { note?: string }) => {
      set(tables, 'golf_player_focus_areas', id, { current_value: value, ...(options?.note ? { progress_notes: { entries: [{ at: '2026-11-10T20:00:00.000Z', value, note: options.note }] } } : {}) });
      return { success: true };
    });
    const p = stored(await logFocusProgress.plan(toolCtx(sb, coachWho()), { focus_area_id: FOCUS, value: 31, note: 'Pace was much better' }));
    const receipt = await logFocusProgress.commit(toolCtx(sb, coachWho()), p);
    expect(receipt).toMatchObject({ status: 'completed', summary: 'Avery Lane’s focus area “Lag putting” is at 31. The note is saved with it. No notification is sent.', created: [{ kind: 'focus_area', count: 1, id: FOCUS, label: 'Lag putting' }] });
    expect((await logFocusProgress.commit(toolCtx(sb, coachWho()), p)).status).toBe('completed');
    expect(a.updateFocusAreaProgress).toHaveBeenCalledExactlyOnceWith(FOCUS, 31, { note: 'Pace was much better' });
    expect(writes).toEqual([]);
    // A value with no note passes no options, as the app's own button does.
    const q = stored(await logFocusProgress.plan(toolCtx(sb, coachWho()), { focus_area_id: FOCUS, value: 30, note: null }));
    await logFocusProgress.commit(toolCtx(sb, coachWho()), q);
    expect(a.updateFocusAreaProgress).toHaveBeenLastCalledWith(FOCUS, 30, undefined);
  });

  it('refuses a player, another team’s focus area, a coach the app would refuse, and a focus area that cannot take progress, in the action’s words', async () => {
    const { sb, reads } = db();
    await expect(logFocusProgress.plan(toolCtx(sb, playerWho(), 'player'), { focus_area_id: FOCUS, value: 31, note: null })).rejects.toThrow('Only a coach can do that.');
    expect(reads).toEqual([]);
    await expect(logFocusProgress.plan(toolCtx(sb, coachWho()), { focus_area_id: FOREIGN_FOCUS, value: 31, note: null })).rejects.toThrow(/not one of your players/);
    a.verifyPlayerAccess.mockResolvedValue({ allowed: false, reason: 'denied' });
    await expect(logFocusProgress.plan(toolCtx(sb, coachWho()), { focus_area_id: FOCUS, value: 31, note: null })).rejects.toThrow('You do not have access to that player.');
    a.verifyPlayerAccess.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'c' });
    const sentences: Record<string, string> = { proposed: 'This focus area hasn’t been accepted by the player yet.', declined: 'This focus area was declined by the player.', completed: 'This focus area is already completed.', archived: 'This focus area cannot be updated in its current state.' };
    const app = source('src/app/golf/actions/development.ts');
    expect(app).toContain("const ACTIONABLE_FOCUS_AREA_STATUSES = ['active', 'in_progress', 'paused'] as const;");
    for (const [status, sentence] of Object.entries(sentences)) {
      await expect(logFocusProgress.plan(toolCtx(db({ status }).sb, coachWho()), { focus_area_id: FOCUS, value: 31, note: null })).rejects.toThrow(sentence);
      expect(app).toContain(sentence.replace('’', "'"));
    }
    for (const status of ['active', 'in_progress', 'paused']) await expect(logFocusProgress.plan(toolCtx(db({ status }).sb, coachWho()), { focus_area_id: FOCUS, value: 31, note: null })).resolves.toBeTruthy();
  });

  it('a refusal by the action at commit is reported as it was said, with nothing changed', async () => {
    const { sb } = db();
    const p = stored(await logFocusProgress.plan(toolCtx(sb, coachWho()), { focus_area_id: FOCUS, value: 31, note: null }));
    a.updateFocusAreaProgress.mockResolvedValue({ success: false, error: 'This focus area is already completed.' });
    expect(await logFocusProgress.commit(toolCtx(sb, coachWho()), p)).toMatchObject({ status: 'failed', summary: 'This focus area is already completed. Nothing was changed.' });
    a.updateFocusAreaProgress.mockResolvedValue({ success: false, error: 'Forbidden' });
    expect(await logFocusProgress.commit(toolCtx(sb, coachWho()), p)).toMatchObject({ status: 'failed', summary: 'You do not have access to that player. Nothing was changed.' });
    await expect(logFocusProgress.commit(toolCtx(sb, playerWho(), 'player'), p)).rejects.toThrow('Only a coach can do that.');
    expect((await logFocusProgress.commit(toolCtx(sb, coachWho()), { ...p, input: { focus_area_id: 'nope' } })).summary).toBe('This card could not be read back, so it was not run. Nothing was changed.');
  });

  it('what the card says a player sees is what the app’s pages draw', () => {
    // The player's plan board prints the value.
    expect(source('src/components/golf/coachhelm/home/HubPlanBoard.tsx')).toContain('`Now ${area.current_value}`');
    // The focus area card reads an entry's date and value, and no entry's note.
    const card = source('src/components/fairway/pages/coachhelm/FocusAreaCard.tsx');
    expect(card).toContain('for (const e of focusArea.progressHistory ?? []) add(e.at, e.value);');
    expect(card).not.toMatch(/\be\.note\b|entry\.note\b/);
  });
});

describe('record_focus_outcome', () => {
  it('the card writes nothing and says it completes the focus area, reaches the signal it came from, and what the player sees', async () => {
    const { sb, writes } = db({ from_insight_id: SIGNAL });
    const p = await recordFocusOutcome.plan(toolCtx(sb, coachWho()), { focus_area_id: FOCUS, outcome: 'worsened' });
    expect(writes).toEqual([]);
    expect(a.recordFocusAreaOutcome).not.toHaveBeenCalled();
    expect(p.summary).toBe('Record “Got worse” for Avery Lane’s focus area “Lag putting” and mark it completed.');
    expect([fact(p, 'Player'), fact(p, 'Outcome'), fact(p, 'Status')]).toEqual(['Avery Lane', 'Got worse', 'Active now. Recording an outcome marks it completed.']);
    expect(fact(p, 'CoachHelm')).toBe('The outcome is also recorded on the signal this focus area came from, and the signal is counted as acted on. CoachHelm uses recorded outcomes to show what has worked.');
    expect(fact(p, 'The player sees')).toBe('The focus area shows as completed on their development page. The signal it came from can read “Got worse” on their own CoachHelm page. No notification is sent.');
    expect([p.recipients, p.delivery, p.notifications]).toEqual([[], null, []]);
    expect(a.verifyPlayerAccess).toHaveBeenCalledWith(AVERY, COACH_USER, sb);
  });

  it('a focus area with no signal behind it says so, and one already completed only gains the outcome', async () => {
    const p = await recordFocusOutcome.plan(toolCtx(db({ status: 'completed' }).sb, coachWho()), { focus_area_id: FOCUS, outcome: 'improved' });
    expect(p.summary).toBe('Record “Improved” for Avery Lane’s focus area “Lag putting”.');
    expect(fact(p, 'Status')).toBe('Already completed. Only the outcome is added.');
    expect(fact(p, 'CoachHelm')).toBe('This focus area did not come from a signal, so only the focus area carries the outcome.');
    expect(fact(p, 'The player sees')).toBe('The focus area already shows as completed on their development page. No notification is sent.');
  });

  it('refuses one never accepted, one declined, one with an outcome already, a player and another team’s', async () => {
    await expect(recordFocusOutcome.plan(toolCtx(db({ status: 'proposed' }).sb, coachWho()), { focus_area_id: FOCUS, outcome: 'improved' })).rejects.toThrow('This focus area hasn’t been accepted by the player yet.');
    await expect(recordFocusOutcome.plan(toolCtx(db({ status: 'declined' }).sb, coachWho()), { focus_area_id: FOCUS, outcome: 'improved' })).rejects.toThrow('This focus area was declined by the player.');
    await expect(recordFocusOutcome.plan(toolCtx(db({ status: 'completed', outcome_status: 'no_change' }).sb, coachWho()), { focus_area_id: FOCUS, outcome: 'improved' })).rejects.toThrow('An outcome is already recorded for that focus area: No change.');
    const { sb, reads } = db();
    await expect(recordFocusOutcome.plan(toolCtx(sb, playerWho(), 'player'), { focus_area_id: FOCUS, outcome: 'improved' })).rejects.toThrow('Only a coach can do that.');
    expect(reads).toEqual([]);
    await expect(recordFocusOutcome.plan(toolCtx(sb, coachWho()), { focus_area_id: FOREIGN_FOCUS, outcome: 'improved' })).rejects.toThrow(/not one of your players/);
    // The app records an outcome on a completed focus area and on no other closed state.
    expect(source('src/app/golf/actions/development.ts')).toMatch(/const OUTCOME_RECORDABLE_FOCUS_AREA_STATUSES = \[\s*\.\.\.ACTIONABLE_FOCUS_AREA_STATUSES,\s*'completed',\s*\] as const;/);
  });

  it('records through the app’s action once; a second commit finds both halves and does not record again', async () => {
    const { sb, tables, writes } = db({ from_insight_id: SIGNAL });
    a.recordFocusAreaOutcome.mockImplementation(async (id: string, outcome: string) => {
      set(tables, 'golf_player_focus_areas', id, { status: 'completed', outcome_status: outcome });
      set(tables, 'golf_coach_insights', SIGNAL, { outcome_status: outcome });
      return { success: true };
    });
    const p = stored(await recordFocusOutcome.plan(toolCtx(sb, coachWho()), { focus_area_id: FOCUS, outcome: 'improved' }));
    expect(await recordFocusOutcome.commit(toolCtx(sb, coachWho()), p)).toMatchObject({ status: 'completed', summary: '“Improved” is recorded for Avery Lane’s focus area “Lag putting”, and it is completed. No notification is sent.', created: [{ kind: 'focus_area', id: FOCUS }] });
    expect((await recordFocusOutcome.commit(toolCtx(sb, coachWho()), p)).status).toBe('completed');
    expect(a.recordFocusAreaOutcome).toHaveBeenCalledExactlyOnceWith(FOCUS, 'improved');
    expect(writes).toEqual([]);
  });

  it('when the signal half fails the receipt is partial and says which half is there; confirming again runs the action again', async () => {
    const { sb, tables } = db({ from_insight_id: SIGNAL });
    const halfFailed = 'Outcome saved on the focus area, but crediting the source insight failed. Please try again.';
    expect(source('src/app/golf/actions/development.ts')).toContain(halfFailed);
    a.recordFocusAreaOutcome.mockImplementationOnce(async (id: string, outcome: string) => (set(tables, 'golf_player_focus_areas', id, { status: 'completed', outcome_status: outcome }), { success: false, error: halfFailed }));
    const p = stored(await recordFocusOutcome.plan(toolCtx(sb, coachWho()), { focus_area_id: FOCUS, outcome: 'improved' }));
    const first = await recordFocusOutcome.commit(toolCtx(sb, coachWho()), p);
    expect(first).toMatchObject({
      status: 'partial',
      summary: '“Improved” is recorded on Avery Lane’s focus area “Lag putting”, and it is completed, but it could not be added to the signal it came from. Confirm again to add it there.',
      partial_failures: ['The outcome was not added to the signal this focus area came from.'],
    });
    a.recordFocusAreaOutcome.mockImplementationOnce(async (_id: string, outcome: string) => (set(tables, 'golf_coach_insights', SIGNAL, { outcome_status: outcome }), { success: true }));
    expect((await recordFocusOutcome.commit(toolCtx(sb, coachWho()), p)).status).toBe('completed');
    expect(a.recordFocusAreaOutcome).toHaveBeenCalledTimes(2);
  });

  it('a refusal by the action is nothing changed, and a failure with nothing written says so', async () => {
    const { sb } = db();
    const p = stored(await recordFocusOutcome.plan(toolCtx(sb, coachWho()), { focus_area_id: FOCUS, outcome: 'no_change' }));
    a.recordFocusAreaOutcome.mockResolvedValue({ success: false, error: 'Focus area not found or not permitted' });
    expect(await recordFocusOutcome.commit(toolCtx(sb, coachWho()), p)).toMatchObject({ status: 'failed', summary: 'Focus area not found or not permitted. Nothing was changed.' });
    a.recordFocusAreaOutcome.mockResolvedValue({ success: false, error: 'Failed to record outcome. Please try again.' });
    expect(await recordFocusOutcome.commit(toolCtx(sb, coachWho()), p)).toMatchObject({ status: 'failed', summary: 'Failed to record outcome. Please try again. Nothing was changed.' });
    await expect(recordFocusOutcome.commit(toolCtx(sb, playerWho(), 'player'), p)).rejects.toThrow('Only a coach can do that.');
  });

  it('the words on the card are the words the player’s Deep dive uses, and that page draws them', () => {
    const shape = source('src/clubhouse/data/coachhelm-dive-shape.ts');
    for (const line of ["improved: { word: 'Improved'", "no_change: { word: 'No change'", "worsened: { word: 'Got worse'"]) expect(shape).toContain(line);
    expect(source('src/clubhouse/screens/coachhelm/views/DeepDive.tsx')).toContain('{i.outcome.word}');
  });
});
