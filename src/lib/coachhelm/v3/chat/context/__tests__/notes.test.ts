import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const actions = vi.hoisted(() => ({ saveCoachFact: vi.fn(), deleteCoachFact: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-ask', () => actions);

import { modelToolFor } from '../../engine/model';
import { NOTE_MAX_COUNT, firstTurnNotes, noteRefusal, noteTools, readStandingNotes, removeNote, saveNote, toneSentence } from '../notes';
import { COACH_ID, OTHER_TEAM, TEAM, coachWho, fakeSb, playerWho, toolCtx } from './fake-sb';

const FACTS = 'golf_coachhelm_coach_facts';
const row = (id: string, text: string, over: Record<string, unknown> = {}) => ({ id, coach_id: COACH_ID, team_id: TEAM, text, created_at: `2026-11-0${id.slice(-1)}T10:00:00Z`, ...over });

/** The table with this coach's notes, another coach's on the same team, and this coach's on another team. */
const db = (mine: Array<[string, string]> = [['n1', 'Qualifying is 54 holes and the low four count.'], ['n2', 'Lead with the number, then one sentence.']]) =>
  fakeSb({
    [FACTS]: { rows: [...mine.map(([id, text]) => row(id, text)), row('x1', 'Another coach’s private note', { coach_id: 'someone-else' }), row('x2', 'My note for my other team', { team_id: OTHER_TEAM })] },
    golf_coachhelm_chat_conversations: { rows: [{ id: 'conv-1', tone: 'detailed' }, { id: 'conv-2', tone: null }] },
  });

beforeEach(() => {
  actions.saveCoachFact.mockReset();
  actions.deleteCoachFact.mockReset();
});

/** The app's action, standing in: it writes the row the next read will see, as the real one does. */
const actionsOn = (tables: ReturnType<typeof fakeSb>['tables']) => {
  let n = 0;
  actions.saveCoachFact.mockImplementation(async ({ teamId, text }: { teamId: string; text: string }) => {
    const id = `saved-${++n}`;
    tables[FACTS]!.rows!.push(row(id, text, { team_id: teamId }));
    return { success: true, id };
  });
  actions.deleteCoachFact.mockImplementation(async (id: string) => {
    tables[FACTS]!.rows = tables[FACTS]!.rows!.filter((r) => r.id !== id);
    return { success: true };
  });
};

describe('reading the coach’s notes', () => {
  it('returns this coach’s notes for this team only, and the conversation’s tone', async () => {
    const { sb } = db();
    const knows = await readStandingNotes(sb, coachWho() as never, 'conv-1');
    expect(knows?.facts.map((f) => f.id)).toEqual(['n1', 'n2']);
    expect(knows?.tone).toBe('detailed');
    expect((await readStandingNotes(sb, coachWho() as never, 'conv-2'))?.tone).toBe('straight');
    // The same coach on their other team reads that team's note and none of these.
    expect((await readStandingNotes(sb, { ...coachWho(), team_id: OTHER_TEAM } as never, null))?.facts.map((f) => f.id)).toEqual(['x2']);
  });

  it('a first-turn message lists them in the coach’s words, one line each, with no id', async () => {
    const { sb } = db([['n1', 'Qualifying is 54 holes\nand the low four count.'], ['n2', 'Lead with the number.']]);
    const text = firstTurnNotes(await readStandingNotes(sb, coachWho() as never, null))!;
    expect(text.split('\n')).toEqual([expect.stringMatching(/^The coach’s standing notes, in their own words\./), '1. Qualifying is 54 holes and the low four count.', '2. Lead with the number.']);
    expect(text).not.toMatch(/n1|n2|[0-9a-f]{8}-/);
    expect(text).toMatch(/never repeat them to a player/);
  });

  it('no notes means no message, and the tone still has its sentence', async () => {
    const { sb } = db([]);
    const knows = await readStandingNotes(sb, coachWho() as never, 'conv-1');
    expect(firstTurnNotes(knows)).toBeNull();
    expect(toneSentence(knows)).toMatch(/^Tone: detailed\./);
  });

  it.each([
    ['the table is not there (migration not applied)', { code: '42P01', message: 'relation "golf_coachhelm_coach_facts" does not exist' }],
    ['the read fails', { message: 'timeout' }],
  ])('%s: there are simply no notes, and nothing throws', async (_what, error) => {
    const { sb } = fakeSb({ [FACTS]: { error } });
    const knows = await readStandingNotes(sb, coachWho() as never, 'conv-1');
    expect(knows).toBeNull();
    expect(firstTurnNotes(knows)).toBeNull();
    expect(toneSentence(knows)).toBeNull();
  });

  it('the tone column missing (the same migration) also means no notes', async () => {
    const { sb } = fakeSb({ [FACTS]: { rows: [row('n1', 'A note')] }, golf_coachhelm_chat_conversations: { error: { code: '42703', message: 'column "tone" does not exist' } } });
    expect(await readStandingNotes(sb, coachWho() as never, 'conv-1')).toBeNull();
  });

  it('a client that throws is no notes, not a failed turn', async () => {
    const broken = { from: () => { throw new Error('down'); } } as never;
    expect(await readStandingNotes(broken, coachWho() as never, null)).toBeNull();
  });
});

describe('save_note', () => {
  it('saves through the app’s own action for this team, answers with the list as it now stands, and hands the thread a chip', async () => {
    const { sb, tables, writes } = db();
    actionsOn(tables);
    const out = await saveNote.run(toolCtx(sb, coachWho()), { text: '  Keep answers to three sentences.  ' });
    expect(actions.saveCoachFact).toHaveBeenCalledExactlyOnceWith({ teamId: TEAM, text: 'Keep answers to three sentences.' });
    // The tool itself writes nothing through the client: the action is the only write path.
    expect(writes).toEqual([]);
    expect(out.evidence).toBe(false);
    expect(out.summary).toBe('Saved. The coach sees it as a chip and can remove it. The coach’s notes are now:\n1. Qualifying is 54 holes and the low four count.\n2. Lead with the number, then one sentence.\n3. Keep answers to three sentences.');
    expect(out.parts).toEqual([{ type: 'data-coach-note', id: 'coach-note-saved-1', data: { op: 'saved', note_id: 'saved-1', text: 'Keep answers to three sentences.' } }]);
  });

  it('does not save the same note twice', async () => {
    const { sb, tables } = db();
    actionsOn(tables);
    const out = await saveNote.run(toolCtx(sb, coachWho()), { text: 'lead with the number, then one sentence.' });
    expect(actions.saveCoachFact).not.toHaveBeenCalled();
    expect(out.summary).toMatch(/^That is already one of the coach’s notes\./);
    expect(out.parts).toBeUndefined();
  });

  it('without the migration it says so in plain words and calls nothing', async () => {
    const { sb } = fakeSb({ [FACTS]: { error: { code: '42P01', message: 'missing' } } });
    const out = await saveNote.run(toolCtx(sb, coachWho()), { text: 'Keep answers short.' });
    expect(out.summary).toMatch(/^Standing notes are not switched on for this team yet/);
    expect(out.coverage).toBe('unavailable');
    expect(actions.saveCoachFact).not.toHaveBeenCalled();
  });

  it('a save the action refuses is reported as not saved', async () => {
    const { sb } = db();
    actions.saveCoachFact.mockResolvedValue({ success: false, error: 'That wasn’t saved. Try again.' });
    const out = await saveNote.run(toolCtx(sb, coachWho()), { text: 'Keep answers short.' });
    expect(out.summary).toMatch(/could not be saved just now\. Nothing was saved/);
    expect(out.parts).toBeUndefined();
    actions.saveCoachFact.mockRejectedValue(new Error('boom'));
    expect((await saveNote.run(toolCtx(sb, coachWho()), { text: 'Keep answers shorter.' })).summary).toMatch(/Nothing was saved/);
  });

  it('keeps the list short enough to read every conversation', async () => {
    const { sb } = db(Array.from({ length: NOTE_MAX_COUNT }, (_, i) => [`m${i}`, `Note number ${i}`] as [string, string]));
    const out = await saveNote.run(toolCtx(sb, coachWho()), { text: 'One more.' });
    expect(out.summary).toMatch(/already has 30 notes/);
    expect(actions.saveCoachFact).not.toHaveBeenCalled();
  });

  it.each([
    ['Avery Lane is recovering from wrist surgery, go easy on range volume.'],
    ['Blake is on academic probation this term.'],
    ['Ortiz has anxiety before qualifiers.'],
    ['Text Avery’s dad at 555-201-3344 about travel.'],
    ['The team portal password is birdie123.'],
    ['Email results to parents@example.com every Monday.'],
  ])('will not write down: %s', async (text) => {
    const { sb } = db();
    const out = await saveNote.run(toolCtx(sb, coachWho()), { text });
    expect(out.summary).toMatch(/Nothing was saved/);
    expect(out.coverage).toBe('unavailable');
    expect(actions.saveCoachFact).not.toHaveBeenCalled();
  });

  it('keeps a team rule that names nobody, and a name with nothing private beside it', () => {
    const who = coachWho() as never;
    expect(noteRefusal(who, 'Anyone coming back from injury skips the sprint block.')).toBeNull();
    expect(noteRefusal(who, 'Avery Lane is the team captain this season.')).toBeNull();
    // A capitalised name is a name; the ordinary word is not ("will" beside a player called Will).
    expect(noteRefusal({ ...coachWho(), roster: [{ id: 'w', name: 'Will Hart', first_name: 'Will', last_name: 'Hart', graduation_year: null }] } as never, 'Players will be suspended from travel for missing study hall.')).toBeNull();
  });
});

describe('remove_note', () => {
  it('removes the one note a few words pick out, through the app’s action', async () => {
    const { sb, tables, writes } = db();
    actionsOn(tables);
    const out = await removeNote.run(toolCtx(sb, coachWho()), { note: 'qualifying holes' });
    expect(actions.deleteCoachFact).toHaveBeenCalledExactlyOnceWith('n1');
    expect(writes).toEqual([]);
    expect(out.summary).toBe('Removed “Qualifying is 54 holes and the low four count.”. The coach’s notes are now:\n1. Lead with the number, then one sentence.');
    expect(out.parts).toEqual([{ type: 'data-coach-note', id: 'coach-note-n1', data: { op: 'removed', note_id: 'n1', text: 'Qualifying is 54 holes and the low four count.' } }]);
  });

  it('removes nothing when several match or none does, and never another coach’s or another team’s note', async () => {
    const { sb, tables } = db([['n1', 'Qualifying is 54 holes.'], ['n2', 'Qualifying counts the low four.']]);
    actionsOn(tables);
    expect((await removeNote.run(toolCtx(sb, coachWho()), { note: 'qualifying' })).summary).toMatch(/^2 notes match that; ask the coach which one\. Nothing was removed\./);
    expect((await removeNote.run(toolCtx(sb, coachWho()), { note: 'tee times' })).summary).toMatch(/^No note matches that\. Nothing was removed\./);
    expect((await removeNote.run(toolCtx(sb, coachWho()), { note: 'Another coach’s private note' })).summary).toMatch(/^No note matches that/);
    expect((await removeNote.run(toolCtx(sb, coachWho()), { note: 'My note for my other team' })).summary).toMatch(/^No note matches that/);
    expect(actions.deleteCoachFact).not.toHaveBeenCalled();
  });
});

describe('a player has no notes', () => {
  it('is offered no note tool', () => {
    expect(noteTools(playerWho() as never)).toEqual([]);
    expect(noteTools(coachWho() as never).map((t) => t.name)).toEqual(['save_note', 'remove_note']);
  });

  it('reads nothing, and both tools refuse a player’s context without touching the table', async () => {
    const { sb, reads, writes } = db();
    expect(await readStandingNotes(sb, playerWho() as never, 'conv-1')).toBeNull();
    const saved = await saveNote.run(toolCtx(sb, playerWho(), 'player'), { text: 'Remember I like short answers.' });
    const removed = await removeNote.run(toolCtx(sb, playerWho(), 'player'), { note: 'qualifying' });
    for (const out of [saved, removed]) {
      expect(out.summary).toBe('Notes belong to the coach. A player has none.');
      expect(JSON.stringify(out)).not.toMatch(/Qualifying|Lead with/);
    }
    expect(reads).toEqual([]);
    expect(writes).toEqual([]);
    expect(actions.saveCoachFact).not.toHaveBeenCalled();
    expect(actions.deleteCoachFact).not.toHaveBeenCalled();
  });
});

describe('the tools as the model is given them', () => {
  it.each([[saveNote], [removeNote]])('a flat strict object, every property required; the description says what is never written down', (tool) => {
    const def = modelToolFor(tool as never);
    const schema = def.input_schema as { additionalProperties?: boolean; required?: string[]; properties: Record<string, unknown> };
    expect(schema.additionalProperties).toBe(false);
    expect([...(schema.required ?? [])].sort()).toEqual(Object.keys(schema.properties).sort());
    expect(JSON.stringify(schema.properties)).not.toMatch(/"type":"object"/);
  });

  it('save_note says plainly what it will not keep and that players never see notes', () => {
    expect(saveNote.description).toMatch(/health, injuries, family, grades or discipline/);
    expect(saveNote.description).toMatch(/players never see notes/);
    expect(saveNote.description).toMatch(/saves at once/);
    // Both write, so neither may be called from the model's code.
    expect([saveNote.direct_only, removeNote.direct_only]).toEqual([true, true]);
  });
});
