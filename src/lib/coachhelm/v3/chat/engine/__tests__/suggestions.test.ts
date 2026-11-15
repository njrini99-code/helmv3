import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildSuggestionsRequest, checkSuggestions, suggestFor } from '../suggestions';
import type { ModelClient, ModelRequest } from '../model';
import type { ChatTool } from '../tool';

const read = (name: string): ChatTool => ({ kind: 'read', name, description: `Reads ${name}.`, input: z.object({}), progress: () => 'Reading', run: async () => ({ summary: '', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: 'now' }) }) as ChatTool;
const task = (name: string): ChatTool => ({ kind: 'task', name, description: `Does ${name}.`, input: z.object({}), progress: () => 'Drafting', plan: async () => ({}) as never, commit: async () => ({}) as never }) as ChatTool;
const TOOLS = [read('get_player_stats'), read('get_team_stats'), task('create_focus_area'), task('create_event')];
const reply = (...suggestions: Array<Record<string, unknown>>) => JSON.stringify({ suggestions });
const s = (label: string, prompt: string, kind = 'read', tool: string | null = null) => ({ label, prompt, kind, tool });
const check = (text: string, surface: 'ask' | 'player' = 'ask', tools = TOOLS) => checkSuggestions(text, { tools, surface });

const good = [
  s('Avery from 6 to 10 feet', 'How does Avery putt from 6 to 10 feet over his last 8 rounds?'),
  s('Against the team', 'How does Avery’s putting compare with the rest of the team this season?', 'compare'),
  s('Set a putting focus area', 'Set up a putting focus area for Avery from 6 to 10 feet.', 'action', 'create_focus_area'),
];

describe('the request for suggestions', () => {
  const request = buildSuggestionsRequest({ question: 'How is Avery putting?', answer: 'Avery loses 0.4 strokes a round on the greens.', tools: TOOLS, surface: 'ask' });

  it('goes to the small model at low effort, with no tools, and asks for a fixed shape', () => {
    expect(request).toMatchObject({ model: 'claude-haiku-5-5', output_config: { effort: 'low', format: { type: 'json_schema' } } });
    expect(request).not.toHaveProperty('tools');
    expect(request).not.toHaveProperty('betas');
    const item = ((request.output_config!.format!.schema as { properties: { suggestions: { items: { properties: Record<string, unknown>; required: string[]; additionalProperties: boolean } } } }).properties.suggestions.items);
    expect(item.required).toEqual(['label', 'prompt', 'kind', 'tool']);
    expect(item.additionalProperties).toBe(false);
    // An action can only be named from the caller's own task tools.
    expect(item.properties.tool).toEqual({ anyOf: [{ type: 'string', enum: ['create_focus_area', 'create_event'] }, { type: 'null' }] });
  });

  it('carries the question and the answer as data, and lists only the caller’s actions', () => {
    const content = String((request.messages[0] as { content: unknown }).content);
    expect(content).toContain('<question>\nHow is Avery putting?\n</question>');
    expect(content).toContain('<answer>\nAvery loses 0.4 strokes a round on the greens.\n</answer>');
    expect(content).toContain('- create_focus_area: Does create_focus_area.');
    expect(content).not.toContain('get_player_stats');
    // A player is offered no action at all.
    const forPlayer = buildSuggestionsRequest({ question: 'q', answer: 'a', tools: TOOLS, surface: 'player' });
    expect(String((forPlayer.messages[0] as { content: unknown }).content)).toContain('(none: suggest only read and compare)');
    expect(JSON.stringify(forPlayer.output_config)).not.toContain('create_focus_area');
  });
});

describe('the checks on what the model suggests', () => {
  it('keeps two to four that are well formed, in the shape the thread draws: label, prompt, kind', () => {
    expect(check(reply(...good))).toEqual([
      { label: 'Avery from 6 to 10 feet', prompt: 'How does Avery putt from 6 to 10 feet over his last 8 rounds?', kind: 'read' },
      { label: 'Against the team', prompt: 'How does Avery’s putting compare with the rest of the team this season?', kind: 'compare' },
      { label: 'Set a putting focus area', prompt: 'Set up a putting focus area for Avery from 6 to 10 feet.', kind: 'action' },
    ]);
    const six = Array.from({ length: 6 }, (_, i) => s(`Round ${i + 1} in detail`, `Show me round ${i + 1} hole by hole for Avery.`));
    expect(check(reply(...six))).toHaveLength(4);
    // One is not a list of suggestions: fewer than two means none.
    expect(check(reply(good[0]!))).toEqual([]);
    expect(check(reply())).toEqual([]);
  });

  it('an action is only ever one of the caller’s own tasks; a player is never offered one', () => {
    const made = s('Lock the lineup', 'Lock the lineup for Thursday.', 'action', 'lock_lineup');
    const unnamed = s('Set a reminder', 'Set a reminder for Thursday’s practice.', 'action', null);
    expect(check(reply(good[0]!, good[1]!, made, unnamed))).toHaveLength(2);
    // The same reply for a coach with no task tools, and for a player.
    expect(check(reply(...good), 'ask', [read('get_player_stats')]).map((x) => x.kind)).toEqual(['read', 'compare']);
    expect(check(reply(...good), 'player').map((x) => x.kind)).toEqual(['read', 'compare']);
  });

  it('nothing on the never-list is suggested, whatever kind it claims to be', () => {
    const never = [
      s('Delete his last round', 'Delete Avery’s round from 21 October.'),
      s('Remove Blake', 'Remove Blake from the roster.', 'action', 'create_event'),
      s('Cut him from the team', 'Drop Blake Reed from the team for the spring.'),
      s('Make Sam an admin', 'Make Sam an assistant coach with full access.'),
      s('Invite his parents', 'Invite Avery’s parents to the team calendar.'),
      s('Reset his password', 'Reset the password on Avery’s account.'),
      s('Change the baseline', 'Switch the strokes gained baseline to the Korn Ferry Tour.'),
      s('Email a recruit', 'Email this report to the recruit from Dallas.', 'action', 'create_event'),
      s('Archive the old plans', 'Archive every practice plan from last season.'),
    ];
    for (const bad of never) expect(check(reply(good[0]!, good[1]!, bad)).map((x) => x.label)).toEqual(['Avery from 6 to 10 feet', 'Against the team']);
  });

  it('golf’s own words are not mistaken for the never-list', () => {
    const fine = [
      s('At the Fall Invitational', 'How did Avery putt at the Fall Invitational?'),
      s('Against the Tour baseline', 'How does that compare with the Tour baseline for strokes gained putting?', 'compare'),
      s('Taking misses into account', 'What do his three-putts account for across the last 8 rounds?'),
      s('Who dropped shots late', 'Who dropped the most shots on the last three holes this season?'),
    ];
    expect(check(reply(...fine)).map((x) => x.label)).toEqual(fine.map((x) => x.label));
  });

  it('drops a tool or table name, a duplicate, and anything that is not a suggestion', () => {
    const odd = [
      s('Run get_player_stats again', 'Call get_player_stats for Blake.'),
      s('From golf_rounds', 'Read the golf_rounds table for October.'),
      s('Avery from 6 to 10 feet', 'A different prompt with the same label as an earlier one.'),
      s('x', 'Too short a label.'),
      s('A label that is fine', 'short'),
      { label: 'No kind', prompt: 'A suggestion without a kind at all.', tool: null },
      s('A kind of its own', 'A suggestion of a kind nobody asked for.', 'chat'),
      'not an object',
      null,
    ];
    expect(check(JSON.stringify({ suggestions: [...good, ...odd] }))).toHaveLength(3);
    // Words are one line, and a label's full stop goes.
    expect(check(reply(s('Against the team.', 'How does\nthat compare\twith the team?', 'compare'), good[0]!))[0]).toEqual({ label: 'Against the team', prompt: 'How does that compare with the team?', kind: 'compare' });
    for (const text of ['', 'not json', '[]', '{"suggestions":"none"}', 'null']) expect(check(text)).toEqual([]);
  });
});

describe('asking for suggestions', () => {
  const client = (response: Record<string, unknown> | Error, seen: ModelRequest[] = []): ModelClient => ({
    stream(request) {
      seen.push(request);
      return {
        [Symbol.asyncIterator]() {
          // Nothing is streamed to anyone: the reply is read whole. A failed call fails here.
          return { next: async () => (response instanceof Error ? Promise.reject(response) : { done: true as const, value: undefined }) };
        },
        async finalMessage() {
          if (response instanceof Error) throw response;
          return { id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_sequence: null, usage: { input_tokens: 900, output_tokens: 120, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, ...response };
        },
      } as never;
    },
  });
  const args = { question: 'How is Avery putting?', answer: 'Avery loses 0.4 strokes a round on the greens.', tools: TOOLS, surface: 'ask' as const };
  const signal = new AbortController().signal;

  it('returns the checked suggestions and what the call cost', async () => {
    const seen: ModelRequest[] = [];
    const out = await suggestFor(client({ stop_reason: 'end_turn', content: [{ type: 'text', text: reply(...good) }] }, seen), signal, args);
    expect(out.suggestions.map((x) => x.kind)).toEqual(['read', 'compare', 'action']);
    expect(out.failed).toBe(false);
    expect(seen).toHaveLength(1);
    expect(out.usage.calls).toMatchObject([{ model: 'claude-haiku-5-5', input: 900, output: 120 }]);
  });

  it('never throws and never guesses: a refusal, a reply cut short, a failed call or nothing to follow up on is no suggestions', async () => {
    expect(await suggestFor(client({ stop_reason: 'refusal', content: [] }), signal, args)).toMatchObject({ suggestions: [], failed: false });
    expect(await suggestFor(client({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"suggestions":[{"label":"Half' }] }), signal, args)).toMatchObject({ suggestions: [], failed: true });
    expect(await suggestFor(client(new Error('503')), signal, args)).toMatchObject({ suggestions: [], failed: true });
    // No answer to follow up on: no call is made at all.
    const seen: ModelRequest[] = [];
    const none = await suggestFor(client({ stop_reason: 'end_turn', content: [] }, seen), signal, { ...args, answer: '  ' });
    expect(none).toMatchObject({ suggestions: [], failed: false });
    expect(seen).toHaveLength(0);
    expect(none.usage.calls).toHaveLength(0);
  });
});
