import type { ActionProposal, ProposalFact } from '@/lib/coachhelm/v3/chat/action-types';
import { formatWallClock, formatWith } from '../../../../lib/dates';
import { formatWhole } from '../../../../lib/format';
import { plural } from '../../../../lib/plural';
import type { CardPerson } from './types';

/** A fact by its label, as the planner wrote it. Null when the plan has none, or has it unset. */
export function factOf(p: ActionProposal, label: string): ProposalFact | null {
  return p.facts.find((f) => f.label === label) ?? null;
}
export function valueOf(p: ActionProposal, label: string): string | null {
  const f = factOf(p, label);
  return f && !f.missing && f.value !== 'Not set' ? f.value : null;
}
/** A fact whose label starts with a word and carries a count: "To (5)", "Present (4)". */
export function countedFact(p: ActionProposal, word: string): { fact: ProposalFact; count: number } | null {
  const fact = p.facts.find((f) => f.label === word || f.label.startsWith(`${word} (`));
  if (!fact) return null;
  const n = Number(fact.label.match(/\((\d+)\)/)?.[1]);
  return { fact, count: Number.isFinite(n) && n > 0 ? n : namesIn(fact.value).length };
}

/** The facts a body has not drawn itself, so a fact the planner adds later is never lost. */
export function restOf(p: ActionProposal, drawn: readonly string[]): ProposalFact[] {
  return p.facts.filter((f) => !drawn.some((d) => f.label === d || f.label.startsWith(`${d} (`)));
}

/** Names from a planner's list: "A, B and C", "A, B, C". A parenthesis at the end ("(no account yet)") is dropped. */
export function namesIn(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .replace(/\s*\([^)]*\)\s*$/, '')
    .split(/,\s*|\s+and\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The players a plan names: `affects` when the planner filled it, else the names in the given fact. Ids are the roster's when a name matches. */
export function peopleOf(p: ActionProposal, roster: readonly CardPerson[] = [], fromFact?: string | null): CardPerson[] {
  const affected = p.affects.filter((a) => a.kind === 'player').map((a) => ({ id: a.id, name: a.label }));
  if (affected.length) return affected;
  return namesIn(fromFact).map((name) => roster.find((r) => r.name === name) ?? { id: name, name });
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const noon = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);

/** "Thu 12 Nov" from an ISO day. Anything else comes back as it is: a planner that already wrote words is not rewritten. */
export function dayWords(iso: string | null | undefined, long = false): string {
  if (!iso) return '';
  if (!DAY.test(iso.slice(0, 10))) return iso;
  return formatWith(noon(iso), long ? { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' } : { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
export function dayParts(iso: string): { weekday: string; day: string; month: string } | null {
  if (!DAY.test(iso.slice(0, 10))) return null;
  const at = noon(iso);
  return { weekday: formatWith(at, { weekday: 'short', timeZone: 'UTC' }), day: String(at.getUTCDate()), month: formatWith(at, { month: 'short', timeZone: 'UTC' }) };
}
/** "3:00 PM" from "15:00". */
export function clockWords(hhmm: string | null | undefined): string {
  return hhmm && /^\d{1,2}:\d{2}$/.test(hhmm) ? formatWallClock(hhmm.padStart(5, '0')) : (hhmm ?? '');
}
/** "3:00 to 5:30 PM": the meridiem once when both sides share it. */
export function clockRange(start: string | null | undefined, end: string | null | undefined): string {
  const a = clockWords(start);
  const b = clockWords(end);
  if (!a) return '';
  if (!b) return a;
  const [at, am] = a.split(' ');
  const [, bm] = b.split(' ');
  return am && am === bm ? `${at} to ${b}` : `${a} to ${b}`;
}
/** Whole days from one ISO day to another, both counted. */
export function daysBetween(first: string, last: string): number {
  return Math.round((noon(last).getTime() - noon(first).getTime()) / 86_400_000) + 1;
}
/** "2026-11-14 06:30" or "2026-11-14": the day in words and the time on a 12 hour clock. */
export function stampWords(value: string | null): string {
  if (!value) return '';
  const [day, time] = value.split(' ');
  return [dayWords(day), clockWords(time)].filter(Boolean).join(', ');
}

/** The app's one plural rule and its whole-count formatter, under the names the bodies use. */
export { plural };
export const count = (n: number): string => formatWhole(n);

/** Does a plan's notification line say that somebody is told? "Nobody is told…" and an empty list do not. */
export function tellsSomebody(p: ActionProposal): boolean {
  return p.notifications.some((n) => !/^(nobody|nothing)\b/i.test(n.trim()));
}
