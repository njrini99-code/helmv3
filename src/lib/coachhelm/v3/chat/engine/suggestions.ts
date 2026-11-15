/**
 * CoachHelm chat: what to ask next.
 *
 * After an answer is complete (the `done` event has gone out, so the coach is never kept waiting for this), a small model is
 * asked for two to four things the coach might do next, each specific to this question and this answer: a follow-up read, a
 * comparison, or an action the answer points to. Tapping one sends its `prompt` as the coach's next message, nothing more: a
 * suggestion never runs anything, and an action it leads to is still planned, shown and confirmed like any other.
 *
 * The model's reply is checked here, and a suggestion that fails a check is dropped, not repaired:
 *   - an action must name one of the task tools THIS caller has (their own tool list), so it can only suggest what exists and
 *     what they may do;
 *   - nothing on the app's never-list (deleting, removing a person, roles and membership, accounts, anything sent outside the
 *     team, settings that change what figures mean), whatever kind it claims to be;
 *   - no tool or table name in the words;
 *   - a player is never suggested an action.
 * Fewer than two left means none are shown.
 */
import { addUsage, emptyUsage, profileFor, type ModelClient, type ModelRequest, type UsageTotals } from './model';
import type { ChatSuggestion } from './protocol';
import type { ChatTool, ChatSurface } from './tool';

export const SUGGESTIONS_MIN = 2;
export const SUGGESTIONS_MAX = 4;
/** The model the suggestions are written by: the small one, whatever the surface's own model is. */
export const suggestionsModel = () => profileFor('player', null);

const SYSTEM = [
  'You suggest what a college golf coach might ask their assistant next, straight after it answered them.',
  'Give two to four suggestions. Each must follow from THIS question and THIS answer: name the player, the stat, the event or the window it is about. Never a generic suggestion.',
  'kind "read": a follow-up question about the data. kind "compare": the same thing against another player, the team, another window or last season. kind "action": something to set up that the answer points to; only one of the listed actions, and name it in "tool". For read and compare, "tool" is null.',
  'label: at most six words, sentence case, no full stop. prompt: one plain sentence the coach would type, in their voice.',
  'Never suggest deleting or removing anything or anyone, changing roles, permissions, membership, accounts or settings, or sending anything to people outside the team. Never mention a tool, a table or how the assistant works.',
  'If the answer was a refusal, an error, or has nothing to follow up on, return an empty list.',
].join('\n');

/**
 * What the assistant never does (`../tasks/INVENTORY.md`, "Left to the app on purpose"): a suggestion that reads like any of it is
 * dropped, whatever kind it says it is. Written to leave golf's own words alone: an "Invitational" is not an invitation, and
 * asking how a figure compares with the Tour baseline is not changing the baseline.
 */
const NEVER = new RegExp(
  [
    String.raw`\b(?:delete|deletes|deleted|deleting|eras\w*|archiv\w*|unsav\w*|untrack\w*|deactivat\w*)\b`,
    String.raw`\bremov(?:e|es|ed|ing|al)\b`,
    String.raw`\b(?:kick|cut|drop)\s+\w+(?:\s+\w+)?\s+(?:from|off)\s+the\s+(?:team|roster)\b`,
    String.raw`\b(?:permissions?|passwords?|sign[- ]?in|log[- ]?in|join\s+codes?|consent)\b`,
    String.raw`\b(?:change|make|set|give|assign|promote|demote)\b[^.]{0,40}\b(?:roles?|admin|assistant coach|head coach)\b`,
    String.raw`\binvit(?:e|es|ed|ing)\b`,
    String.raw`\b(?:change|switch|set|update|edit|reset)\b[^.]{0,40}\b(?:baseline|team settings|priorities)\b`,
    String.raw`\b(?:email|text|send|share)\b[^.]{0,40}\b(?:parents?|recruits?|outside the team|another (?:team|school|coach))\b`,
  ].join('|'),
  'i',
);

const oneLine = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

export function buildSuggestionsRequest(args: { question: string; answer: string; tools: readonly ChatTool[]; surface: ChatSurface }): ModelRequest {
  const tasks = args.surface === 'player' ? [] : args.tools.filter((t) => t.kind === 'task');
  const toolSchema = tasks.length > 0 ? { anyOf: [{ type: 'string', enum: tasks.map((t) => t.name) }, { type: 'null' }] } : { type: 'null' };
  const actions = tasks.length > 0 ? tasks.map((t) => `- ${t.name}: ${oneLine(t.description).slice(0, 160)}`).join('\n') : '(none: suggest only read and compare)';
  return {
    model: suggestionsModel().modelId,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: 'user', content: `<question>\n${args.question.slice(0, 2000)}\n</question>\n<answer>\n${args.answer.slice(0, 6000)}\n</answer>\n<actions>\n${actions}\n</actions>` }],
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                properties: { label: { type: 'string' }, prompt: { type: 'string' }, kind: { type: 'string', enum: ['read', 'compare', 'action'] }, tool: toolSchema },
                required: ['label', 'prompt', 'kind', 'tool'],
                additionalProperties: false,
              },
            },
          },
          required: ['suggestions'],
          additionalProperties: false,
        },
      },
    },
  };
}

/** The suggestions that pass every check, at most four; none unless at least two do. `reply` is the model's JSON text. */
export function checkSuggestions(reply: string, args: { tools: readonly ChatTool[]; surface: ChatSurface }): ChatSuggestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply);
  } catch {
    return [];
  }
  const list = (parsed as { suggestions?: unknown } | null)?.suggestions;
  if (!Array.isArray(list)) return [];
  const tasks = new Set(args.surface === 'player' ? [] : args.tools.filter((t) => t.kind === 'task').map((t) => t.name));
  const names = args.tools.map((t) => t.name.toLowerCase());
  const kept: ChatSuggestion[] = [];
  for (const item of list.slice(0, 8)) {
    if (!item || typeof item !== 'object') continue;
    const { label: rawLabel, prompt: rawPrompt, kind, tool } = item as { label?: unknown; prompt?: unknown; kind?: unknown; tool?: unknown };
    const label = oneLine(rawLabel).replace(/[.]$/, '');
    const prompt = oneLine(rawPrompt);
    if (kind !== 'read' && kind !== 'compare' && kind !== 'action') continue;
    if (label.length < 3 || label.length > 60 || prompt.length < 8 || prompt.length > 300) continue;
    // An action is only ever one this caller's own tool list holds.
    if (kind === 'action' && (typeof tool !== 'string' || !tasks.has(tool))) continue;
    const words = `${label} ${prompt}`;
    if (NEVER.test(words)) continue;
    // The coach never sees a tool or table name.
    if (/[a-z]_[a-z]/.test(words) || names.some((name) => words.toLowerCase().includes(name))) continue;
    if (kept.some((s) => s.label.toLowerCase() === label.toLowerCase() || s.prompt.toLowerCase() === prompt.toLowerCase())) continue;
    kept.push({ label, prompt, kind });
    if (kept.length === SUGGESTIONS_MAX) break;
  }
  return kept.length >= SUGGESTIONS_MIN ? kept : [];
}

/**
 * Ask for suggestions. Never throws: whatever goes wrong, there are simply none (and `usage` holds whatever the call cost).
 * `usage.calls` is empty when no call was made.
 */
export async function suggestFor(model: ModelClient, signal: AbortSignal, args: { question: string; answer: string; tools: readonly ChatTool[]; surface: ChatSurface }): Promise<{ suggestions: ChatSuggestion[]; usage: UsageTotals; failed: boolean }> {
  const usage = emptyUsage();
  if (!args.question.trim() || !args.answer.trim()) return { suggestions: [], usage, failed: false };
  try {
    const stream = model.stream(buildSuggestionsRequest(args), { signal });
    // The reply is read whole; nothing of it is streamed to the coach.
    for await (const event of stream) void event;
    const response = await stream.finalMessage();
    addUsage(usage, response, suggestionsModel().modelId);
    if (response.stop_reason !== 'end_turn') return { suggestions: [], usage, failed: response.stop_reason !== 'refusal' };
    const reply = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
    return { suggestions: checkSuggestions(reply, args), usage, failed: false };
  } catch {
    return { suggestions: [], usage, failed: !signal.aborted };
  }
}
