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
