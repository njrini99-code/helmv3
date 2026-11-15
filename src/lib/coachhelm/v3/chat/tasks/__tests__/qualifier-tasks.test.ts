import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const a = vi.hoisted(() => ({ setQualifierCoachPick: vi.fn(), verifyTeamAccess: vi.fn() }));
vi.mock('@/app/golf/actions/v3/qualifying', () => ({ setQualifierCoachPick: a.setQualifierCoachPick }));
vi.mock('@/lib/auth/verify-player-access', () => ({ verifyTeamAccess: a.verifyTeamAccess }));

import { AVERY, BLAKE, COACH_USER, OTHER_TEAM, STRANGER, TEAM, coachWho, fakeSb, playerWho, toolCtx } from '../../context/__tests__/fake-sb';
import type { StoredProposal } from '../kit';
import { qualifierTools, setQualifierPick } from '../qualifier-tasks';

const Q = '30000000-0000-4000-8000-000000000001';
const FOREIGN_Q = '30000000-0000-4000-8000-000000000002';
const db = (over: { state?: string; slots?: number; picks?: string[]; entries?: string[] } = {}) =>
  fakeSb({
    golf_qualifiers: { rows: [{ id: Q, team_id: TEAM, name: 'Fall qualifier', selection_state: over.state ?? 'closed', selection_slots_coach_pick: over.slots ?? 2 }, { id: FOREIGN_Q, team_id: OTHER_TEAM, name: 'Rival qualifier', selection_state: 'closed', selection_slots_coach_pick: 2 }] },
    golf_qualifier_entries: { rows: (over.entries ?? [AVERY, BLAKE]).map((player_id) => ({ qualifier_id: Q, player_id })) },
    golf_qualifier_selections: { rows: [...(over.picks ?? []).map((player_id) => ({ qualifier_id: Q, player_id, selection_type: 'coach_pick' })), { qualifier_id: Q, player_id: BLAKE, selection_type: 'top_score' }] },
  });
const fact = (p: StoredProposal, label: string) => p.facts.find((f) => f.label === label)?.value;
const stored = (p: StoredProposal) => JSON.parse(JSON.stringify(p)) as StoredProposal;
const input = { qualifier_id: Q, player_id: AVERY, reasoning: 'Best  ball-striker in wind' };

beforeEach(() => {
  a.setQualifierCoachPick.mockReset();
  a.verifyTeamAccess.mockReset().mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'c' });
});

describe('set_qualifier_coach_pick', () => {
  it('the card writes nothing; shows the places, the reason, who can read it and what players see before the selection is confirmed', async () => {
    const { sb, writes } = db();
    const p = await setQualifierPick.plan(toolCtx(sb, coachWho()), input);
    expect(writes).toEqual([]);
    expect(a.setQualifierCoachPick).not.toHaveBeenCalled();
    expect(p.summary).toBe('Make Avery Lane a coach’s pick for Fall qualifier.');
    expect(fact(p, 'Pick places')).toBe('1 of 2 used after this');
    expect(fact(p, 'Reason')).toBe('Best ball-striker in wind');
    expect(fact(p, 'Who can read the reason')).toBe('Coaches only. It is never shown to players.');
    expect(fact(p, 'Players see')).toMatch(/^Nothing yet\. The squad shows on the qualifier’s board only after you confirm the selection/);
    expect(fact(p, 'Scores')).toBe('No score or standing changes.');
    expect([p.recipients, p.delivery, p.visible_to]).toEqual([[], null, 'coaches']);
    expect(a.verifyTeamAccess).toHaveBeenCalledWith(TEAM, COACH_USER, sb);
  });

  it('says players see it at once when the selection is already confirmed', async () => {
    const p = await setQualifierPick.plan(toolCtx(db({ state: 'selected' }).sb, coachWho()), input);
    expect(fact(p, 'Players see')).toBe('The selection is already confirmed, so Avery Lane shows as selected on the qualifier’s board at once. No notification is sent.');
  });

  it('what the card says players see is still how the board reads selections', () => {
    const src = readFileSync(join(process.cwd(), 'src/clubhouse/data/qualifiers.ts'), 'utf8');
    expect(src).toMatch(/selectionState === 'selected'\s*\?\s*supabase\.from\('golf_qualifier_selections'\)/);
    expect(src).toContain("reasoning: input.role === 'coach' ? (reasonsRes.reasons.get(s.player_id) ?? null) : null,");
  });

  it('saves through the app’s action once; a second commit finds the pick and does not call it again', async () => {
    const { sb, tables, writes } = db();
    a.setQualifierCoachPick.mockImplementation(async (qualifier_id: string, player_id: string) => (tables.golf_qualifier_selections!.rows!.push({ qualifier_id, player_id, selection_type: 'coach_pick' }), { ok: true }));
    const p = stored(await setQualifierPick.plan(toolCtx(sb, coachWho()), input));
    expect(await setQualifierPick.commit(toolCtx(sb, coachWho()), p)).toMatchObject({ status: 'completed', summary: 'Avery Lane is a coach’s pick for Fall qualifier. The selection is not confirmed by this.' });
    expect((await setQualifierPick.commit(toolCtx(sb, coachWho()), p)).status).toBe('completed');
    expect(a.setQualifierCoachPick).toHaveBeenCalledExactlyOnceWith(Q, AVERY, 'Best ball-striker in wind');
    expect(writes).toEqual([]);
  });

  it('draws no card for a pick the app would refuse', async () => {
    const plan = (sb: unknown, i = input, who: unknown = coachWho()) => setQualifierPick.plan(toolCtx(sb, who), i);
    await expect(plan(db({ state: 'open' }).sb)).rejects.toThrow(/open once the qualifier is closed/);
    await expect(plan(db({ entries: [BLAKE] }).sb)).rejects.toThrow('Avery Lane is not entered in Fall qualifier.');
    await expect(plan(db({ picks: [AVERY] }).sb)).rejects.toThrow('Avery Lane is already a coach’s pick for Fall qualifier.');
    await expect(plan(db({ picks: [BLAKE], slots: 1 }).sb)).rejects.toThrow('All 1 coach’s pick places for Fall qualifier are taken (Blake Ortiz). Take one back on the Qualifiers screen first.');
    await expect(plan(db().sb, { ...input, reasoning: '   ' })).rejects.toThrow(/needs a reason/);
    await expect(plan(db().sb, { ...input, player_id: STRANGER })).rejects.toThrow('That player is not on your active roster.');
    await expect(plan(db().sb, { ...input, qualifier_id: FOREIGN_Q })).rejects.toThrow(/not one of your team’s/);
    a.verifyTeamAccess.mockResolvedValue({ allowed: false, reason: 'denied' });
    await expect(plan(db().sb)).rejects.toThrow('Only this team’s coaches can make a pick.');
    await expect(setQualifierPick.plan(toolCtx(db().sb, playerWho(), 'player'), input)).rejects.toThrow('Only a coach can do that.');
  });

  it('a refusal by the action at commit is reported with its reason and nothing claimed', async () => {
    const { sb } = db();
    const p = stored(await setQualifierPick.plan(toolCtx(sb, coachWho()), input));
    a.setQualifierCoachPick.mockResolvedValue({ ok: false, error: 'player has no scored round in this qualifier' });
    expect(await setQualifierPick.commit(toolCtx(sb, coachWho()), p)).toMatchObject({ status: 'failed', summary: 'player has no scored round in this qualifier. Nothing was changed.' });
    await expect(setQualifierPick.commit(toolCtx(sb, playerWho(), 'player'), p)).rejects.toThrow('Only a coach can do that.');
    expect(qualifierTools().map((t) => [t.name, t.kind])).toEqual([['set_qualifier_coach_pick', 'task']]);
  });
});

describe('set_qualifier_coach_pick: editing the reason before Confirm', () => {
  it('the card offers the reason only; an edit plans again with the team check and writes nothing', async () => {
    const { sb, writes } = db();
    const p = JSON.parse(JSON.stringify(await setQualifierPick.plan(toolCtx(sb, coachWho()), input))) as StoredProposal;
    expect(p.editable?.map((f) => [f.key, f.label, f.value, f.required])).toEqual([['reasoning', 'Reason', 'Best ball-striker in wind', true]]);
    a.verifyTeamAccess.mockClear();
    const q = await setQualifierPick.revise!(toolCtx(sb, coachWho()), p, { reasoning: 'Has played this course most' });
    expect(fact(q, 'Reason')).toBe('Has played this course most');
    expect(a.verifyTeamAccess).toHaveBeenCalledWith(TEAM, COACH_USER, sb);
    expect(writes).toEqual([]);
    expect(a.setQualifierCoachPick).not.toHaveBeenCalled();
    // The player and the qualifier are the request, not fields; a pick needs a reason.
    await expect(setQualifierPick.revise!(toolCtx(sb, coachWho()), p, { player_id: BLAKE })).rejects.toThrow('That cannot be changed on this card. Ask for it in words instead.');
    await expect(setQualifierPick.revise!(toolCtx(sb, coachWho()), p, { reasoning: '' })).rejects.toThrow('Reason is not a value this card can take.');
  });
});
