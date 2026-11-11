import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { encodeChatEvent, type ChatEvent } from '@/lib/coachhelm/v3/chat/engine/protocol';
import { EVAL_GLOBAL_FORBID, golfSenseQuestions as compiled, sentenceCount as sentencesOf } from '@/lib/coachhelm/v3/chat/knowledge/eval';
import senseData from '@/lib/coachhelm/v3/chat/knowledge/eval/golf-sense.json';
// @ts-expect-error -- plain .mjs helper, scripts/ is outside tsconfig.
import { EVERYDAY_WORDS, answerText, applyEvent, captureFixture, citesFromLog, dateRe, eventReader, golfSenseQuestions, newTurnState, rejectionsFromLog, reportLines, score, scoreSense, sentenceCount, verdictOf, writingRules } from '../ask-eval-score.mjs';

const owen = {
  facts: [
    { label: 'approach', kind: 'number', anyOf: [-4.16], tol: 0.02, claim: /approach[^.\n]{0,80}?(-?\d+\.\d+)/i },
    { label: 'rounds', kind: 'number', value: 8 },
    { label: 'Ethan', kind: 'text', anyOf: ['Ethan Park'] },
    { label: 'date', kind: 'date', iso: '2026-10-21' },
    { label: 'no attendance', kind: 'phrase', re: /\bno attendance\b/i, optional: true },
  ],
  forbid: [{ label: 'invents attendance', re: /attendance[^.\n]{0,40}\d{1,3}%/i }],
};

describe('ask-eval scoring', () => {
  it('counts a figure written without its minus sign, and rounding, as right', () => {
    const r = score(owen, 'His approach is 4.16 per round over 8 rounds. Only Ethan Park is lower. Oct 21.');
    expect(r).toMatchObject({ correct: 4, wrong: 0, missing: 0, allRight: true });
  });

  it('calls a different stated value wrong, not missing', () => {
    const r = score(owen, 'His approach is -3.83 per round over 8 rounds. Ethan Park is lower. Oct 21.');
    expect(r.results.find((x: { label: string }) => x.label === 'approach')).toMatchObject({ status: 'wrong', detail: 'says -3.83' });
    expect(r.allRight).toBe(false);
  });

  it('reports what the answer leaves out as missing, and lets an optional fact be absent', () => {
    const r = score(owen, 'His approach is -4.16.');
    expect(r.missing).toBe(3);
    expect(r.allRight).toBe(false);
    expect(score({ facts: [{ label: 'x', kind: 'phrase', re: /nothing/, optional: true }] }, 'a').allRight).toBe(true);
  });

  it('flags a forbidden statement', () => {
    const r = score(owen, 'approach -4.16, 8 rounds, Ethan Park, October 21. Team attendance was 85%.');
    expect(r.wrong).toBe(1);
    expect(r.allRight).toBe(false);
  });

  it('reads number words ("three rounds") as figures', () => {
    const r = score({ facts: [{ label: 'n', kind: 'number', value: 3, claim: /(\d+|three)\s+rounds/i }] }, 'There were three rounds.');
    expect(r.allRight).toBe(true);
  });

  it('matches a date written several ways', () => {
    for (const text of ['Oct 21', 'October 21', 'on 10/21', '2026-10-21', '21 October']) expect(dateRe('2026-10-21').test(text)).toBe(true);
    expect(dateRe('2026-10-21').test('Oct 22')).toBe(false);
  });
});

/** A turn's stream as the route sends it, read back through the harness's reader in the given chunk sizes. */
function read(events: ChatEvent[], chunk = 37) {
  const body = events.map(encodeChatEvent).join('');
  const next = eventReader();
  const state = newTurnState();
  for (let i = 0; i < body.length; i += chunk) for (const ev of next(body.slice(i, i + chunk))) applyEvent(state, ev);
  return state;
}
const envelope = { summary: 's', measurements: [] };
const evidence = (tool: string, ref: string, via?: 'code'): ChatEvent => ({ type: 'evidence', part: { type: 'data-evidence', id: `evidence-${ref}`, data: { tool, envelope, ref, ...(via ? { via } : {}) } } });

describe('ask-eval stream reader (the chat wire protocol)', () => {
  it('reads the events the route encodes, however the body is cut, and leaves the read markers out of the answer', () => {
    const events: ChatEvent[] = [
      { type: 'message_start', conversation_id: 'conv-1', message_id: 'm1', resumed: false },
      { type: 'phase', phase: 'thinking' },
      { type: 'read_started', id: 'p1', label: 'Reading the team', tool: 'get_team_stats' },
      evidence('get_team_stats', 'e1'),
      { type: 'read_finished', id: 'p1', label: 'Read the team', tool: 'get_team_stats', state: 'done' },
      { type: 'text_delta', delta: 'Owen is at 72.4 over his last 2 rounds' },
      { type: 'text_delta', delta: ' [e1].' },
      { type: 'usage', input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 },
      { type: 'done', status: 'complete', duration_ms: 4200 },
    ];
    for (const chunk of [1, 7, 37, 10_000]) {
      const state = read(events, chunk);
      expect(answerText(state)).toBe('Owen is at 72.4 over his last 2 rounds.');
      expect(state).toMatchObject({ conversationId: 'conv-1', status: 'complete', durationMs: 4200, evidence: 1, tools: ['get_team_stats'], error: null });
      expect(verdictOf(state)).toBe('complete');
    }
    // The marker's digit is not a figure the answer states: "1" must not count as said.
    expect(score({ facts: [{ label: 'one', kind: 'number', value: 1 }] }, answerText(read(events))).missing).toBe(1);
  });

  it('never returns a torn last frame, and skips a frame that is not one of ours', () => {
    const next = eventReader();
    expect(next(': ping\n\ndata: not json\n\ndata: {"type":"text_delta","delta":"Hel')).toEqual([]);
    expect(next('lo"}\n\n')).toEqual([{ type: 'text_delta', delta: 'Hello' }]);
  });

  it('drops the words a retried call had streamed, as the app does, and keeps the words before the read', () => {
    const state = read([
      { type: 'text_delta', delta: 'Let me look. ' },
      { type: 'read_started', id: 'p1', label: 'Reading', tool: 'get_player_stats' },
      { type: 'read_finished', id: 'p1', label: 'Read', tool: 'get_player_stats', state: 'failed' },
      { type: 'text_delta', delta: 'half a sent' },
      { type: 'text_discard' },
      { type: 'text_delta', delta: 'A whole sentence.' },
      { type: 'done', status: 'complete' },
    ]);
    expect(answerText(state)).toBe('Let me look. A whole sentence.');
    expect(state.failedReads).toEqual(['get_player_stats']);
  });

  it('names how a turn ended in the engine\'s words', () => {
    expect(verdictOf(read([{ type: 'text_delta', delta: 'half' }]))).toBe('incomplete');
    expect(verdictOf(read([{ type: 'error', message: 'That did not work.', action: 'retry', kind: 'model' }, { type: 'done', status: 'failed' }]))).toBe('failed');
    // A turn the model declined is a complete turn whose words are the app's sentence; its meta part says so.
    const meta = { started_at: '2026-11-10T12:00:00.000Z', duration_ms: 900, reads: 0 };
    expect(verdictOf(read([{ type: 'text_delta', delta: 'I can\'t help with that one.' }, { type: 'part', part: { type: 'data-turn-meta', id: 'turn-meta', data: { ...meta, declined: true } } }, { type: 'done', status: 'complete' }]))).toBe('declined');
    expect(verdictOf(read([{ type: 'text_delta', delta: 'Fine.' }, { type: 'part', part: { type: 'data-turn-meta', id: 'turn-meta', data: meta } }, { type: 'done', status: 'complete' }]))).toBe('complete');
    expect(verdictOf(read([{ type: 'done', status: 'stopped' }]))).toBe('stopped');
    const card = read([{ type: 'decision_needed', key: 'k', tool: 'create_event', tool_use_id: 't' }, { type: 'done', status: 'awaiting_decision' }]);
    expect(verdictOf(card)).toBe('card');
    expect(card).toMatchObject({ cards: 1, tools: ['create_event'] });
  });

  it('counts a read the model\'s code made, by the read\'s own name', () => {
    const state = read([
      { type: 'read_started', id: 'c1', label: 'Working it out', tool: 'code_execution' },
      evidence('get_player_stats', 'e1', 'code'),
      evidence('get_player_stats', 'e2', 'code'),
      { type: 'read_finished', id: 'c1', label: 'Worked it out', tool: 'code_execution', state: 'done' },
      { type: 'done', status: 'complete' },
    ]);
    expect(state.tools).toEqual(['code_execution', 'get_player_stats']);
    expect(state.evidenceParts).toEqual([{ tool: 'get_player_stats', ref: 'e1', envelope, via: 'code' }, { tool: 'get_player_stats', ref: 'e2', envelope, via: 'code' }]);
  });
});

describe('ask-eval capture', () => {
  it('keeps the reads of a turn and shapes them as a fixture', () => {
    const state = read([
      { type: 'read_started', id: 'p1', label: 'Reading', tool: 'get_player_metrics' },
      evidence('get_player_metrics', 'e1'),
      { type: 'text_delta', delta: '73.0' },
      { type: 'done', status: 'complete' },
    ]);
    const f = captureFixture({ id: 'player-x', surface: 'player', team: 'T', timezone: 'America/New_York', roster: [{ id: 'p', name: 'A B', first_name: 'A', last_name: 'B' }], ask: 'q', askedAt: '2026-11-08T00:00:00Z', answeredAt: '2026-11-08T00:00:20Z', text: answerText(state), state, verdict: 'accepted', flagged: [], cost: 0.01, base: 'http://localhost:3100' });
    expect(f).toMatchObject({ surface: 'player', userMessage: { content: 'q' }, turn: { content: '73.0', status: 'complete', recorded: { outcome: 'accepted' }, tools: [{ name: 'get_player_metrics', input: null }], evidence: [{ tool: 'get_player_metrics', ref: 'e1' }] } });
    expect(captureFixture({ id: 'c', surface: 'coach', team: 'T', timezone: 'z', roster: [], ask: 'q', askedAt: 'a', answeredAt: 'b', text: '', state, verdict: 'rejected', flagged: ['23'], base: 'x' }).turn.recorded).toMatchObject({ outcome: 'rejected', reason: 'ungrounded_claims', unmatchedTokens: ['23'] });
  });
});

describe('ask-eval golf-sense questions', () => {
  const names = { player: 'Owen Carter', player2: 'Mason Rivers', new_player: 'Eli Brandt', no_shots_player: 'Tyler Hayes', teammate: 'Owen Carter' };
  const stored = { people: ['Owen Carter', 'Mason Rivers', 'Eli Brandt', 'Will Grant'], places: ['Pine Valley Invitational', 'TPC Sawgrass'] };
  const mine = golfSenseQuestions(senseData, names, stored);
  const theirs = compiled(names, stored);

  it('compiles the file to the same questions and patterns as the app\'s own loader', () => {
    expect(mine).toHaveLength(theirs.length);
    for (const [i, q] of theirs.entries()) {
      const m = mine[i];
      expect({ id: m.id, viewer: m.viewer, ask: m.ask, readers: m.readers, note: m.note, style: m.style }).toEqual({ id: q.id, viewer: q.viewer, ask: q.ask, readers: q.readers, note: q.note, style: q.style });
      expect(m.facts.map((f: { label: string; re: RegExp }) => [f.label, String(f.re)])).toEqual(q.facts.map((f) => [f.label, String(f.re)]));
      // The app's loader keeps one list; here the question's own guards and the writing rules are two, in the same order.
      expect([...m.forbid, ...m.writing].map((f: { pattern: string; re: RegExp }) => [f.pattern, String(f.re)])).toEqual(q.forbid.map((f) => [f.pattern, String(f.re)]));
      expect(m.writing.every((f: { pattern: string }) => EVAL_GLOBAL_FORBID.includes(f.pattern))).toBe(true);
      expect(m.unfilled).toEqual([]);
    }
  });

  it('carries the same list of first names that are everyday words as the app\'s loader', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/coachhelm/v3/chat/knowledge/eval/index.ts'), 'utf8');
    const literal = /const EVERYDAY_WORDS = new Set\(\[([^\]]+)\]\)/.exec(source)?.[1] ?? '';
    const theirWords = [...literal.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(theirWords.length).toBeGreaterThan(5);
    expect([...EVERYDAY_WORDS]).toEqual(theirWords);
  });

  it('counts sentences as the app\'s loader does', () => {
    for (const text of ['One. Two! Three?', '- a line\n- another line\n\nA close.', 'He is at 1.8 over 4 rounds. "Fine," he said. That is it.', '']) expect(sentenceCount(text)).toBe(sentencesOf(text));
  });

  it('does not ask a question whose placeholder has nobody to stand in it', () => {
    const partial = golfSenseQuestions(senseData, { player: 'Owen Carter' }, stored);
    const few = partial.find((q: { id: string }) => q.id === 'sg-few-tracked-rounds');
    expect(few.unfilled).toEqual(['new_player']);
    expect(few.ask).toContain('{new_player}');
    expect(partial.find((q: { id: string }) => q.id === 'sg-negative-is-normal').unfilled).toEqual([]);
  });

  const question = {
    readers: ['get_player_stats'],
    facts: [{ label: 'says zero is Tour level', kind: 'phrase', re: /tour[- ]level/i }],
    forbid: mine[0].writing.length ? [{ label: 'a Tour figure from memory', pattern: 'tour_figure_from_memory', re: /tour average is \d/i }, { label: 'a label on the player', pattern: 'label', re: /\bhe is a bad\b/i }] : [],
    style: { max_sentences: 2 },
  };

  it('scores golf sense, writing and reads in three separate columns', () => {
    const good = scoreSense(question, 'Zero is Tour level, so a negative figure is normal here. He is close to the team.', ['get_player_stats'], mine[0].writing);
    expect(good).toMatchObject({ sense: { pass: true, missing: [], said: [] }, writing: { pass: true, broken: [] }, reads: { pass: true, used: ['get_player_stats'] } });

    const bad = scoreSense(question, 'He is a bad putter. His SG is low. That is all. Really.', [], mine[0].writing);
    expect(bad.sense).toEqual({ pass: false, missing: ['says zero is Tour level'], said: ['a label on the player'] });
    expect(bad.writing.pass).toBe(false);
    expect(bad.writing.broken).toEqual(expect.arrayContaining(['abbreviation', 'longer than 2 sentences (4)']));
    expect(bad.reads).toMatchObject({ pass: false, expected: ['get_player_stats'], used: [] });
  });

  it('does not call a Tour figure "from memory" when the turn read the reference', () => {
    const text = 'Zero is Tour level. The Tour average is 4 feet closer.';
    expect(scoreSense(question, text, ['get_player_stats'], []).sense.said).toEqual(['a Tour figure from memory']);
    expect(scoreSense(question, text, ['get_player_stats', 'get_reference'], []).sense.pass).toBe(true);
  });

  it('needs no read when the question lists none, and leaves the code step out of the reads used', () => {
    expect(scoreSense({ readers: [] }, 'A plain answer.', ['code_execution'], []).reads).toEqual({ pass: true, expected: [], used: [] });
  });

  it('holds a data question\'s answer to the writing rules too, names as stored included', () => {
    const rules = writingRules(senseData, stored);
    expect(rules.map((r: { pattern: string }) => r.pattern)).toEqual([...EVAL_GLOBAL_FORBID]);
    expect(scoreSense({ readers: [] }, 'Owen Carter leads the team over the last ten rounds.', [], rules).writing.pass).toBe(true);
    expect(scoreSense({ readers: [] }, 'owen carter leads the team over the last ten rounds.', [], rules).writing.broken).toEqual(expect.arrayContaining(['proper_noun_case']));
  });
});

describe('ask-eval report', () => {
  const rules = writingRules(senseData, { people: ['Owen Carter'] });
  const dataQ = { id: 'count-rounds', category: 'count', viewer: 'coach', ask: 'How many rounds?', facts: [{ label: 'rounds 8', kind: 'number', value: 8 }], note: 'Finished rounds only.' };
  const senseQ = { ...golfSenseQuestions(senseData, { player: 'Owen Carter' })[0], golfSense: true };
  const row = (question: Record<string, unknown>, text: string, tools: string[], extra: Record<string, unknown> = {}) => ({
    question, verdict: 'complete', text, seconds: 12.34, cost: 0.041, note: '', tools, failedReads: [], grounded: true, unmatched: [], model: 'anthropic/claude-sonnet-5-5',
    scored: question.golfSense ? null : score(question, text),
    sense: scoreSense(question.golfSense ? question : { readers: [] }, text, tools, rules),
    ...extra,
  });
  const report = [
    row(dataQ, 'The team has played 8 rounds.', ['get_team_stats']),
    row(dataQ, 'The team has played 9 rounds, avg 74.', ['get_team_stats'], { grounded: false, unmatched: ['9'], seconds: 20 }),
    row(senseQ, 'He is just bad.', [], { model: 'anthropic/claude-sonnet-5-5 + anthropic/claude-sonnet-5' }),
    // A refused request and a turn that never answered: no scores, no ledger row, and the report still prints.
    { question: dataQ, verdict: 'error', text: '', seconds: 0.2, cost: 0, scored: null, sense: null, note: 'HTTP 403: CoachHelm is off for your team. (off)', tools: [], grounded: null, model: null },
    { question: senseQ, verdict: 'failed', text: '', seconds: 3, cost: 0.01, scored: null, sense: null, note: 'That did not work. (model)', tools: ['get_player_stats'], failedReads: ['get_player_stats'], grounded: null, unmatched: [], model: null },
  ];
  const text = reportLines({ report, asked: 7, skipped: ['sg-few-tracked-rounds'], base: 'http://localhost:3100', ref: 'staging-ref', team: 'Demo University Golf', maxUsd: 25, stoppedBecause: 'Stopped before x: $24.90 spent.', at: '2026-11-11T04:00:00.000Z' }).join('\n');

  it('totals the run and says why it stopped and what was not asked', () => {
    expect(text).toContain('# CoachHelm chat evaluation, 2026-11-11T04:00:00.000Z');
    expect(text).toContain('5 of 7 questions asked, total cost $0.13 (cap $25.00)');
    expect(text).toContain('median 12.3s per complete answer');
    expect(text).toContain('**Stopped before x: $24.90 spent.**');
    expect(text).toContain('Not asked (nobody on the roster fits the placeholder): sg-few-tracked-rounds.');
    expect(text).toContain('Verdicts: complete 3, card 0, declined 0, degraded 0, failed 1, stopped 0, incomplete 0, error 1.');
    expect(text).not.toContain('Ran without part of their configuration');
    expect(text).toContain('Models, from the ledger: anthropic/claude-sonnet-5-5 2, anthropic/claude-sonnet-5-5 + anthropic/claude-sonnet-5 1.');
  });

  it('keeps the figures, golf sense, reads, writing and the logged check in columns of their own', () => {
    expect(text).toContain('Data questions fully right: 1 of 3.');
    expect(text).toContain('Golf sense: 0 of 2 pass. Used a read they should: 0 of 2.');
    expect(text).toMatch(/Writing rules: 2 of 3 answers break none\. Broken: abbreviation 1\./);
    expect(text).toContain("Figures matched the turn's reads (the logged check; it withholds nothing): 2 of 3.");
    expect(text).toContain('| count-rounds | count | coach | complete | 1 | 0 | 0 | - | - | pass | yes | anthropic/claude-sonnet-5-5 | 12.3s | $0.041 |');
    expect(text).toContain('| count-rounds | count | coach | complete | 0 | 0 | 1 | - | - | FAIL | no | anthropic/claude-sonnet-5-5 | 20.0s | $0.041 |');
    expect(text).toContain(`| ${senseQ.id} | ${senseQ.category} | coach | complete | - | - | - | FAIL | FAIL | pass |`);
    expect(text).toContain('| count-rounds | count | coach | error | - | - | - | - | - | n/a | n/a | n/a | 0.2s | $0.000 |');
  });

  it('lists what a complete answer got wrong, and each answer with its notes', () => {
    expect(text).toContain('## Complete but not right');
    expect(text).toContain('- count-rounds: missing rounds 8');
    expect(text).toMatch(new RegExp(`- ${senseQ.id}: does not say: `));
    expect(text).toContain('Figures in none of the turn\'s reads: ["9"]');
    expect(text).toContain('Run note: HTTP 403: CoachHelm is off for your team. (off)');
    expect(text).toContain('Reads: get_player_stats (failed: get_player_stats)');
    expect(text).toContain('- writing: abbreviation');
    expect(text).toContain('> The team has played 8 rounds.');
    expect(text).toContain('> (no text)');
  });
});

describe('ask-eval: a turn the API only accepted after a feature was given up', () => {
  const usage = (dropped?: string[]) => ({ type: 'usage', input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 0, ...(dropped ? { features_dropped: dropped } : {}) });
  const turn = (dropped: string[] | undefined, status: string, extra: Array<Record<string, unknown>> = []) => {
    const state = newTurnState();
    for (const ev of [{ type: 'text_delta', delta: 'The team has played 8 rounds.' }, ...extra, usage(dropped), { type: 'done', status }]) applyEvent(state, ev);
    return state;
  };

  it('is degraded, never complete or a card; a turn that ran as configured is unchanged', () => {
    expect(turn(undefined, 'complete').dropped).toEqual([]);
    expect(verdictOf(turn(undefined, 'complete'))).toBe('complete');
    expect(turn(['strict_tools'], 'complete').dropped).toEqual(['strict_tools']);
    expect(verdictOf(turn(['strict_tools'], 'complete'))).toBe('degraded');
    expect(verdictOf(turn(['progress_notes', 'strict_tools'], 'awaiting_decision'))).toBe('degraded');
    // A turn that failed anyway is still a failure, and one the model declined is still declined.
    expect(verdictOf(turn(['strict_tools'], 'failed'))).toBe('failed');
    const meta = { type: 'part', part: { type: 'data-turn-meta', id: 'turn-meta', data: { started_at: 'x', duration_ms: 1, reads: 0, declined: true } } };
    expect(verdictOf(turn(['strict_tools'], 'complete', [meta]))).toBe('declined');
  });

  it('reads the API’s own reason from what the dev server logged during the turn', () => {
    const log = [
      ' POST /api/coachhelm/v3/chat/stream 200 in 9123ms',
      "[ServerErrorLogger] not persisted off-prod { severity: 'error', traceMessage: 'chat/stream: the API rejected a request (400 invalid_request_error) and it was sent again without strict_tools: tools: Too many strict tools (33). The maximum number of strict tools is 20.', action: 'v3.chat.stream.degraded' }",
      "[ServerErrorLogger] not persisted off-prod { severity: 'error', traceMessage: 'chat/stream: the API rejected a request (400 invalid_request_error) and it was sent again without compaction: context_management: Extra inputs are not permitted', action: 'v3.chat.stream.degraded' }",
      'something else entirely',
    ].join('\n');
    expect(rejectionsFromLog(log)).toEqual([
      'the API rejected a request (400 invalid_request_error) and it was sent again without strict_tools: tools: Too many strict tools (33). The maximum number of strict tools is 20.',
      'the API rejected a request (400 invalid_request_error) and it was sent again without compaction: context_management: Extra inputs are not permitted',
    ]);
    // The same line twice is one reason; no log, or nothing in it, is no reasons; a long one is cut.
    expect(rejectionsFromLog(`${log}\n${log}`)).toHaveLength(2);
    expect(rejectionsFromLog('')).toEqual([]);
    expect(rejectionsFromLog(undefined)).toEqual([]);
    expect(rejectionsFromLog(`x the API rejected a request ${'y'.repeat(900)}`)[0]).toHaveLength(400);
  });

  it('is counted on its own in the report, named at the top, and never among the answers that were right', () => {
    const question = { id: 'count-rounds', category: 'count', viewer: 'coach', ask: 'How many rounds?', facts: [{ label: 'rounds 8', kind: 'number', value: 8 }] };
    const rows = [
      { question, verdict: 'degraded', text: 'The team has played 8 rounds.', seconds: 9, cost: 0.2, note: 'ran without strict_tools (the API rejected a request that carried it): the API rejected a request (400 invalid_request_error) and it was sent again without strict_tools: tools: Too many strict tools (33).', tools: ['get_team_stats'], failedReads: [], dropped: ['strict_tools'], grounded: true, unmatched: [], model: 'anthropic/claude-sonnet-5-5', scored: score(question, 'The team has played 8 rounds.'), sense: null },
      { question, verdict: 'complete', text: 'The team has played 8 rounds.', seconds: 9, cost: 0.03, note: '', tools: ['get_team_stats'], failedReads: [], dropped: [], grounded: true, unmatched: [], model: 'anthropic/claude-sonnet-5-5', scored: score(question, 'The team has played 8 rounds.'), sense: null },
    ];
    const text = reportLines({ report: rows, asked: 2, skipped: [], base: 'http://localhost:3200', ref: 'staging-ref', team: 'Demo University Golf', maxUsd: 25, stoppedBecause: '', at: '2026-11-11T04:00:00.000Z' }).join('\n');
    expect(text).toContain('Verdicts: complete 1, card 0, declined 0, degraded 1, failed 0, stopped 0, incomplete 0, error 0.');
    expect(text).toContain('**Ran without part of their configuration (the API rejected a request feature): 1 of 2: strict_tools.** See each question\'s run note.');
    // Both answers state the right figure; only the one that ran as configured counts.
    expect(text).toContain('Data questions fully right: 1 of 2.');
    expect(text).toContain('### count-rounds (degraded)');
    expect(text).toContain('Run note: ran without strict_tools (the API rejected a request that carried it): the API rejected a request (400 invalid_request_error)');
  });
});

describe('ask-eval cites from the dev log', () => {
  const log = [
    'noise',
    '[ask:cites] {"surface":"coach","says":"Owen is at -4.16 per round over his last ten rounds, and mor","cites":[["-4.16","e3","sg_approach","8091da4b"],["-2.33","e3","sg_approach","team"],["lost","e3","k","8091da4b","c"]]}',
    '[ask:cites] {"surface":"player","says":"Other answer","cites":[["1","e1","k","team"]]}',
  ].join('\n');
  it('matches a line to the answer by its first 60 characters, whitespace collapsed', () => {
    const cites = citesFromLog(log, 'Owen is at -4.16 per round\nover his last ten rounds, and more text after sixty chars ...', 'coach');
    expect(cites).toEqual([
      { v: '-4.16', ref: 'e3', key: 'sg_approach', subject: '8091da4b' },
      { v: '-2.33', ref: 'e3', key: 'sg_approach', subject: 'team' },
      { v: 'lost', ref: 'e3', key: 'k', subject: '8091da4b', c: 1 },
    ]);
    expect(citesFromLog(log, 'Something else entirely', 'coach')).toBeNull();
    expect(citesFromLog(log.replace('"surface":"coach",', '"surface":"coach","turn":"conv-1",'), 'Owen is at -4.16 per round over his last ten rounds, and more', 'coach', 'conv-2')).toBeNull();
    expect(citesFromLog(log.replace('"surface":"coach",', '"surface":"coach","turn":"conv-1",'), 'Owen is at -4.16 per round over his last ten rounds, and more', 'coach', 'conv-1')).toHaveLength(3);
    expect(citesFromLog(log, 'Owen is at -4.16 per round over his last ten rounds, and more text after sixty chars ...', 'player')).toBeNull();
  });
});
