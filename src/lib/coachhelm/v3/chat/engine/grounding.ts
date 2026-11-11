/**
 * CoachHelm chat: the grounding check that never blocks.
 *
 * After a turn, the numbers in the answer are compared with the numbers the conversation's reads returned. The result
 * is LOGGED with the turn (the ledger's `grounded` and unmatched tokens) for the eval. It never hides, delays or
 * rewrites an answer.
 *
 * This is the engine's default. TOOLS owns the real comparison (it knows units, windows and the labelled fixtures) and
 * hands it to the route as a `GroundingCheck`; this one only keeps the ledger honest until then.
 */
import type { ToolEnvelope } from '../provenance';

export type GroundingCheck = (args: { text: string; reads: readonly ToolEnvelope[]; question: string }) => { grounded: boolean; unmatched: string[] };

const NUMBER = /-?\d+(?:\.\d+)?/g;

function numbersIn(value: unknown, into: Set<string>): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    into.add(String(Math.abs(value)));
    into.add(String(Math.abs(Math.round(value * 10) / 10)));
    into.add(String(Math.abs(Math.round(value))));
  } else if (typeof value === 'string') {
    for (const m of value.match(NUMBER) ?? []) into.add(String(Math.abs(Number(m))));
  } else if (Array.isArray(value)) {
    for (const v of value) numbersIn(v, into);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) numbersIn(v, into);
  }
}

/**
 * What the model's own code printed, in this conversation, as reads the check can compare against. A figure the code
 * worked out from the reads it called and printed is a figure the conversation holds: the model was shown it and the
 * prompt tells it to work numbers out there. A figure the model then derives in its head from that output is still
 * unmatched. Nothing of the output is stored or logged: it is read from the conversation's own messages for the check.
 */
export function codeOutputsOf(messages: ReadonlyArray<{ role: string; content?: unknown }>): ToolEnvelope[] {
  const out: ToolEnvelope[] = [];
  for (const message of messages) {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) continue;
    for (const block of message.content as Array<{ type?: unknown; content?: { stdout?: unknown } | null }>) {
      if (typeof block?.type !== 'string' || !block.type.endsWith('code_execution_tool_result')) continue;
      const printed = block.content?.stdout;
      if (typeof printed === 'string' && printed.trim()) out.push({ summary: '', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '', model_text: printed.slice(0, CODE_OUTPUT_MAX) } as ToolEnvelope);
    }
  }
  return out;
}
const CODE_OUTPUT_MAX = 20_000;

/** Small whole numbers ("the last 3 rounds", "2 players") are counts and ordinals in prose far more often than figures. */
const isTrivial = (n: number): boolean => Number.isInteger(n) && Math.abs(n) <= 12;

export const defaultGroundingCheck: GroundingCheck = ({ text, reads, question }) => {
  const supported = new Set<string>();
  numbersIn(reads, supported);
  numbersIn(question, supported);
  const unmatched: string[] = [];
  for (const token of text.match(NUMBER) ?? []) {
    const n = Number(token);
    if (!Number.isFinite(n) || isTrivial(n)) continue;
    if (!supported.has(String(Math.abs(n))) && !unmatched.includes(token)) unmatched.push(token);
  }
  return { grounded: unmatched.length === 0, unmatched: unmatched.slice(0, 20) };
};
