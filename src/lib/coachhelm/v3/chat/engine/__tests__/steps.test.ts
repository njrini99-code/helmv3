import { describe, expect, it } from 'vitest';
import type { ToolEnvelope } from '../../provenance';
import { applyChatEvent, type ChatEvent, type ChatStep, type ChatUIMessage, type ChatUIPart } from '../protocol';
import { countOfEnvelope, lastRowNumberOf, lastSeqOf, MAX_STEP_SUBJECTS, playersCovered, subjectsOfEnvelope, subjectsOfInput, withSubjects, workOf } from '../steps';
import type { ToolContext } from '../tool';

const coach = { coach_id: 'c', user_id: 'u', team_id: 'team-1', team_name: 'Test Team', timezone: 'America/New_York', roster: [{ id: 'p1', name: 'Avery Lane' }, { id: 'p2', name: 'Blake Reed' }] } as unknown as ToolContext['who'];
const player = { ...coach, roster: [{ id: 'p1', name: 'Avery Lane' }], player_id: 'p1' } as unknown as ToolContext['who'];
const entity = (kind: string, id: string, label: string) => ({ metric_id: 'm', metric_label: 'M', unit: 'count', value: 1, entity: { kind, id, label }, window_start: null, window_end: null, sample_size: 8, sample_unit: 'rounds', as_of: 'now', coverage: 'complete', coverage_note: null, source: 's', method: 'm', denominator: null, benchmark: null, direction: null });
const read = (...measurements: unknown[]) => ({ summary: 's', measurements, series: [], coverage: 'complete', coverage_note: null, as_of: 'now' }) as unknown as ToolEnvelope;
const step = (id: string, data: Partial<ChatStep>): ChatUIPart => ({ type: 'data-progress', id, data: { label: 'x', tool: 'get_x', ...data } });
const at = (ms: number) => new Date(Date.UTC(2026, 10, 10, 12, 0, 0, ms)).toISOString();

describe('who a step is about', () => {
  it('is named from the caller’s own roster and team, never from what a read called them', () => {
    expect(subjectsOfInput(coach, { player_id: 'p2', player_ids: ['p1', 'p2', 'nobody'] })).toEqual([{ kind: 'player', id: 'p2', label: 'Blake Reed' }, { kind: 'player', id: 'p1', label: 'Avery Lane' }]);
    expect(subjectsOfInput(coach, { player_id: 7 })).toEqual([]);
    expect(subjectsOfInput(coach, null)).toEqual([]);
    const envelope = read(entity('player', 'p1', 'whatever the read says'), entity('team', 'team-1', 'T'), entity('team', 'another-team', 'Rivals'), entity('player', 'stranger', 'Not ours'), entity('round', 'r1', '21 Oct, Pine Valley'));
    expect(subjectsOfEnvelope(coach, envelope)).toEqual([{ kind: 'player', id: 'p1', label: 'Avery Lane' }, { kind: 'team', id: 'team-1', label: 'Test Team' }, { kind: 'round', id: 'r1', label: '21 Oct, Pine Valley' }]);
    expect(playersCovered(coach, [envelope, read(entity('player', 'p2', 'B'), entity('player', 'p1', 'A'))])).toBe(2);
  });

  it('for a player is the player, and nothing a read says about anyone or anything else', () => {
    const envelope = read(entity('player', 'p1', 'Me'), entity('player', 'p2', 'A teammate'), entity('round', 'r1', 'A round'));
    expect(subjectsOfEnvelope(player, envelope)).toEqual([{ kind: 'player', id: 'p1', label: 'Avery Lane' }]);
    expect(subjectsOfInput(player, { player_id: 'p2' })).toEqual([]);
  });

  it('is each subject once, in the order they became known, and never more than a row of faces', () => {
    const have = [{ kind: 'player' as const, id: 'p1', label: 'A' }];
    expect(withSubjects(have, [{ kind: 'player', id: 'p1', label: 'A again' }])).toBe(have);
    expect(withSubjects(have, [{ kind: 'player', id: 'p2', label: 'B' }]).map((s) => s.id)).toEqual(['p1', 'p2']);
    const many = Array.from({ length: 30 }, (_, i) => ({ kind: 'player' as const, id: `x${i}`, label: `P${i}` }));
    expect(withSubjects([], many)).toHaveLength(MAX_STEP_SUBJECTS);
  });

  it('counts what a read counted, and nothing when it counted nothing', () => {
    expect(countOfEnvelope(read(entity('player', 'p1', 'A')))).toEqual({ n: 8, unit: 'rounds', more: false });
    expect(countOfEnvelope(read())).toBeNull();
  });
});

describe('the work of a turn', () => {
  it('is the time at least one step was running: overlapping steps are not added up, gaps are not counted, a note is not a step', () => {
    const parts: ChatUIPart[] = [
      { type: 'text', text: 'Words.' },
      step('progress-1', { started_at: at(0), ended_at: at(300) }),
      step('progress-2', { started_at: at(100), ended_at: at(400) }),
      step('note-3', { tool: 'note', state: 'done' }),
      // A gap of 600 ms in which the model was writing.
      step('progress-4', { started_at: at(1000), ended_at: at(1200) }),
      // Inside another step's span.
      step('progress-5', { started_at: at(1050), ended_at: at(1100) }),
    ];
    expect(workOf(parts)).toEqual({ steps: 4, working_ms: 600 });
    // A step still running is counted up to now; a row stored before times were kept adds a step and no time.
    expect(workOf([step('progress-1', { started_at: at(0) })], Date.parse(at(250)))).toEqual({ steps: 1, working_ms: 250 });
    expect(workOf([step('progress-1', {})])).toEqual({ steps: 1, working_ms: 0 });
    expect(workOf([])).toEqual({ steps: 0, working_ms: 0 });
  });

  it('a request that continues a turn counts on from the stored rows', () => {
    const parts = [step('progress-1', { seq: 2 }), step('note-7', { tool: 'note', seq: 9 }), step('progress-4', { seq: 5 }), { type: 'data-evidence', id: 'evidence-e1', data: {} }];
    expect(lastSeqOf(parts)).toBe(9);
    expect(lastRowNumberOf(parts)).toBe(7);
    expect(lastSeqOf([])).toBe(0);
    expect(lastRowNumberOf([step('some-other-id', {})])).toBe(0);
  });
});

describe('a step in the reducer', () => {
  const fold = (events: ChatEvent[]) => events.reduce(applyChatEvent, { id: 'a', role: 'assistant', parts: [] } as ChatUIMessage);
  const subject = { kind: 'player' as const, id: 'p1', label: 'Avery Lane' };

  it('keeps what it said while running on the finished row, and an update changes only what it names', () => {
    const running = fold([
      { type: 'read_started', id: 'progress-1', label: 'Working out the figures', tool: 'code_execution', state: 'active', kind: 'calculate', started_at: at(0), seq: 1 },
      { type: 'step_update', id: 'progress-1', count: { n: 2, unit: 'reads', more: true }, subjects: [subject], seq: 2 },
      { type: 'step_update', id: 'progress-1', label: 'Working it out across the team', covers: { n: 2, of: 12, unit: 'players' }, seq: 3 },
    ]);
    expect(running.parts).toEqual([
      { type: 'data-progress', id: 'progress-1', data: { label: 'Working it out across the team', tool: 'code_execution', state: 'active', kind: 'calculate', started_at: at(0), seq: 3, count: { n: 2, unit: 'reads', more: true }, subjects: [subject], covers: { n: 2, of: 12, unit: 'players' } } },
    ]);
    const finished = applyChatEvent(running, { type: 'read_finished', id: 'progress-1', label: 'Working it out across the team', tool: 'code_execution', state: 'done', detail: '3 reads', count: { n: 3, unit: 'reads', more: false }, ended_at: at(900), seq: 4 });
    expect(finished.parts[0]!.data).toEqual({ label: 'Working it out across the team', tool: 'code_execution', state: 'done', done: 'Working it out across the team', detail: '3 reads', kind: 'calculate', started_at: at(0), ended_at: at(900), seq: 4, count: { n: 3, unit: 'reads', more: false }, subjects: [subject], covers: { n: 2, of: 12, unit: 'players' } });
    // An update for a step the message does not hold changes nothing.
    expect(applyChatEvent(running, { type: 'step_update', id: 'progress-9', seq: 5 })).toBe(running);
  });

  it('a step that is really queued waits, then runs; a server that sends no state (an older one) leaves the row as it always was', () => {
    const waiting = fold([{ type: 'read_started', id: 'progress-1', label: 'Reading the team', tool: 'get_team_stats', state: 'waiting', seq: 1 }]);
    expect(waiting.parts[0]!.data).toMatchObject({ state: 'waiting' });
    expect(fold([{ type: 'read_started', id: 'progress-1', label: 'Reading the team', tool: 'get_team_stats' }]).parts[0]!.data).toEqual({ label: 'Reading the team', tool: 'get_team_stats' });
    expect(fold([{ type: 'read_finished', id: 'progress-1', label: 'Read the team', tool: 'get_team_stats', state: 'done' }]).parts[0]!.data).toEqual({ label: 'Read the team', tool: 'get_team_stats', state: 'done', done: 'Read the team' });
  });
});
