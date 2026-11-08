import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs helper, scripts/ is outside tsconfig.
import { applyStreamLine, captureFixture, citationsFromLedger, citationsFromLog, dateRe, newStreamState, score } from '../ask-eval-score.mjs';

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

describe('ask-eval stream reader', () => {
  it('collects text and the verdict parts, and skips lines that are not data', () => {
    const state = newStreamState();
    for (const line of [
      ': ping',
      'data: {"type":"text-delta","id":"t","delta":"Hello "}',
      'data: {"type":"text-delta","id":"t","delta":"there"}',
      'data: {"type":"data-evidence","id":"e1","data":{}}',
      'data: {"type":"data-grounding-flag","id":"turn-verdict","data":{"unmatched_tokens":["23"]}}',
      'data: not json',
      'data: [DONE]',
    ]) applyStreamLine(state, line);
    expect(state).toMatchObject({ text: 'Hello there', evidence: 1, incomplete: false, error: null, flag: { unmatched_tokens: ['23'] } });
  });

  it('marks a broken turn', () => {
    const state = newStreamState();
    applyStreamLine(state, 'data: {"type":"data-turn-incomplete","id":"turn-verdict","data":{}}');
    applyStreamLine(state, 'data: {"type":"error","errorText":"boom"}');
    expect(state).toMatchObject({ incomplete: true, error: 'boom' });
  });
});

describe('ask-eval tools and citations', () => {
  it('records each tool a turn called once', () => {
    const state = newStreamState();
    for (const t of ['query_team_data', 'summarise_data', 'summarise_data']) applyStreamLine(state, `data: {"type":"tool-input-available","toolCallId":"c","toolName":"${t}","input":{}}`);
    expect(state.tools).toEqual(['query_team_data', 'summarise_data']);
  });

  it('reads a rejected turn\'s counts from its ledger row', () => {
    expect(citationsFromLedger({ citations: { citation_stats: { figures: 9, cited: 5, cites: 6, verified: 5, unresolved: 0, mismatched: 1, invalid: 0 } } })).toMatchObject({ figures: 9, cited: 5, verified: 5, mismatched: 1, fallback_passed: 0 });
    expect(citationsFromLedger({ citations: null })).toBeNull();
  });

  it('reads an accepted turn\'s counts from the log line that names its conversation', () => {
    const log = [
      '{"msg":"chat/stream: citation coverage","action":"v3.chat.stream.citations","extra":{"figures":7,"cited":4,"cites":5,"verified":4,"unresolved":1,"mismatched":0,"invalid":0,"outcome":"accepted","conversationId":"abc-123"}}',
      '{"action":"v3.chat.stream.citations","extra":{"verified":9,"conversationId":"other"}}',
    ].join('\n');
    expect(citationsFromLog(log, 'abc-123')).toMatchObject({ figures: 7, cited: 4, cites: 5, verified: 4, unresolved: 1, mismatched: 0 });
    expect(citationsFromLog(log, 'missing')).toBeNull();
  });
});

describe('ask-eval capture', () => {
  it('keeps the reads and tool calls of a turn and shapes them as a fixture', () => {
    const state = newStreamState();
    applyStreamLine(state, 'data: {"type":"tool-input-available","toolCallId":"c","toolName":"get_player_metrics","input":{"window":"last5"}}');
    applyStreamLine(state, 'data: {"type":"data-evidence","id":"e","data":{"tool":"get_player_metrics","ref":"e1","envelope":{"summary":"s","measurements":[]}}}');
    applyStreamLine(state, 'data: {"type":"text-delta","id":"t","delta":"73.0"}');
    const f = captureFixture({ id: 'player-x', surface: 'player', team: 'T', timezone: 'America/New_York', roster: [{ id: 'p', name: 'A B', first_name: 'A', last_name: 'B' }], ask: 'q', askedAt: '2026-11-08T00:00:00Z', answeredAt: '2026-11-08T00:00:30Z', text: state.text, state, verdict: 'accepted', flagged: [], cost: 0.04, base: 'http://localhost:3101' });
    expect(f).toMatchObject({ surface: 'player', userMessage: { content: 'q' }, turn: { content: '73.0', status: 'complete', recorded: { outcome: 'accepted' }, tools: [{ name: 'get_player_metrics', input: { window: 'last5' } }], evidence: [{ tool: 'get_player_metrics', ref: 'e1' }] } });
    expect(captureFixture({ id: 'c', surface: 'coach', team: 'T', timezone: 'z', roster: [], ask: 'q', askedAt: 'a', answeredAt: 'b', text: '', state, verdict: 'rejected', flagged: ['23'], base: 'x' }).turn.recorded).toMatchObject({ outcome: 'rejected', reason: 'ungrounded_claims', unmatchedTokens: ['23'] });
  });
});
