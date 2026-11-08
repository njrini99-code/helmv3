/**
 * Deliberately wrong copies of stored Ask answers, for the replay suite: each one states something the turn's
 * evidence does not support, so the grounding audit should reject it. Three kinds:
 *
 *  - `changed-figure`   one figure in the answer is replaced by a value no read produced;
 *  - `moved-figure`     a figure that belongs to one player is written against another player;
 *  - `invented-date`    a date no read, and nothing the coach said, supports (a shifted date, or a new sentence).
 *
 * Generation is deterministic (the first eligible spots, no randomness), and a corruption is only produced when
 * its new text is checked to be unsupported by the evidence, so a rejection can be attributed to the corruption and
 * an acceptance is a real miss by the audit, not a harness artefact.
 */
import type { AskFixture } from './ask-replay-harness';

export type CorruptionKind = 'changed-figure' | 'moved-figure' | 'invented-date';

export interface Corruption {
  /** Stable id: `<fixture>:<kind>:<n>`. */
  id: string;
  fixtureId: string;
  kind: CorruptionKind;
  /** What was done, for a failure message. */
  detail: string;
  text: string;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_RE = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const FOOTER = /\n*_Some figures in this answer[\s\S]*$/;

/** The answer as it was read by the audit, without the rejected-turn footer some stored rows carry. */
export function answerText(fixture: AskFixture): string {
  return fixture.turn.content.replace(FOOTER, '').trim();
}

interface Evidence {
  /** Every number anywhere in the turn's reads (and the coach's messages), by owner. `null` owner: not tied to a player. */
  all: number[];
  byPlayer: Map<string, Set<number>>;
  unscoped: Set<number>;
  /** Every ISO date substring anywhere in the evidence or the coach's words. */
  isoDates: Set<string>;
}

function evidenceOf(fixture: AskFixture): Evidence {
  const ids = new Set(fixture.roster.map((p) => p.id));
  const nameToId = new Map(fixture.roster.map((p) => [p.name, p.id]));
  const byPlayer = new Map<string, Set<number>>();
  const unscoped = new Set<number>();
  const all: number[] = [];
  const isoDates = new Set<string>();
  const add = (owner: string | null, n: number) => {
    const v = Math.abs(n);
    for (const x of [v, v * 100]) {
      all.push(x);
      if (owner) {
        if (!byPlayer.has(owner)) byPlayer.set(owner, new Set());
        byPlayer.get(owner)?.add(x);
      } else unscoped.add(x);
    }
  };
  const addString = (owner: string | null, s: string) => {
    for (const m of s.matchAll(/-?\d+(?:\.\d+)?/g)) add(owner, Number(m[0]));
    for (const m of s.matchAll(/\d{4}-\d{2}-\d{2}/g)) isoDates.add(m[0]);
  };
  const walk = (v: unknown, owner: string | null): void => {
    if (typeof v === 'number') add(owner, v);
    else if (typeof v === 'string') addString(owner, v);
    else if (Array.isArray(v)) v.forEach((e) => walk(e, owner));
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      let here = owner;
      for (const k of ['player_id', 'id']) if (typeof o[k] === 'string' && ids.has(o[k] as string)) here = o[k] as string;
      for (const k of ['name', 'player_name']) if (typeof o[k] === 'string' && nameToId.has(o[k] as string)) here = nameToId.get(o[k] as string) ?? here;
      const entity = o.entity as { kind?: string; id?: string } | undefined;
      if (entity?.kind === 'player' && entity.id) here = entity.id;
      for (const e of Object.values(o)) walk(e, here);
    }
  };
  for (const e of fixture.turn.evidence) walk(e.envelope, null);
  for (const m of fixture.priorMessages) {
    walk(m.evidence, null);
    addString(null, m.content);
  }
  addString(null, fixture.userMessage.content);
  return { all, byPlayer, unscoped, isoDates };
}

const rounded = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const truncated = (n: number, d: number) => Math.trunc(n * 10 ** d) / 10 ** d;

/** Whether a figure written at `d` decimals could be read off `pool` (rounded, truncated, or as a percent). */
function inPool(value: number, d: number, pool: Iterable<number>): boolean {
  const v = Math.abs(value);
  for (const n of pool) if (Math.abs(rounded(n, d) - v) < 1e-9 || Math.abs(truncated(n, d) - v) < 1e-9) return true;
  return false;
}

/** Whether `value` equals a sum or difference of two numbers in the evidence, which the audit may accept as a derived figure. */
function isDerived(value: number, d: number, all: readonly number[]): boolean {
  const pool = [...new Set(all.filter((n) => n < 1000).map((n) => rounded(n, 4)))];
  const v = Math.abs(value);
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i; j < pool.length; j += 1) {
      const a = pool[i] as number;
      const b = pool[j] as number;
      if (Math.abs(rounded(Math.abs(a - b), d) - v) < 1e-9 || Math.abs(rounded(a + b, d) - v) < 1e-9) return true;
    }
  }
  return false;
}

interface Token {
  text: string;
  index: number;
  value: number;
  decimals: number;
}

/** Figures the audit actually reads: not a date, a clock time, a year, a list marker or a small count. */
function figureTokens(text: string): Token[] {
  const out: Token[] = [];
  const re = /-?\d+(?:\.\d+)?/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const index = m.index;
    const before = text.slice(Math.max(0, index - 12), index);
    const after = text.slice(index + m[0].length, index + m[0].length + 12);
    const value = Number(m[0]);
    const decimals = (m[0].split('.')[1] ?? '').length;
    if (/\d[-/:]$|^[-/:]\d/.test(`${before.slice(-1)}${after.slice(0, 1)}`) && decimals === 0) continue;
    if (new RegExp(`${MONTH_RE}\\.?\\s*$`, 'i').test(before)) continue;
    if (new RegExp(`^\\s*(?:st|nd|rd|th)?\\s*(?:of\\s+)?${MONTH_RE}\\b`, 'i').test(after)) continue;
    if (decimals === 0 && (Math.abs(value) <= 12 || (value >= 1900 && value <= 2100))) continue;
    if (/^\s*[:.)]\s/.test(after) && decimals === 0 && /(?:^|\n)\s*$/.test(before)) continue;
    out.push({ text: m[0], index, value, decimals });
  }
  return out;
}

/** Up to `count` evenly spread tokens, preferring decimals (a decimal figure is what a real wrong number looks like). */
function pick<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  const step = items.length / count;
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * step)] as T);
}

function changedFigures(fixture: AskFixture, text: string, ev: Evidence): Corruption[] {
  const tokens = figureTokens(text);
  const usable: Array<{ token: Token; replacement: string }> = [];
  for (const token of tokens) {
    if (!inPool(token.value, token.decimals, ev.all)) continue; // only corrupt a figure the evidence really supports
    for (const offset of [11.3, 7.9, 23.1, 4.7, 0.37]) {
      const sign = token.value < 0 ? -1 : 1;
      const next = rounded(Math.abs(token.value) + (Math.abs(token.value) < 10 && offset > 5 ? offset / 5 : offset), token.decimals);
      if (next <= 12 && token.decimals === 0) continue;
      if (inPool(next, token.decimals, ev.all) || isDerived(next, token.decimals, ev.all)) continue;
      const written = (sign < 0 ? '-' : '') + next.toFixed(token.decimals);
      usable.push({ token, replacement: written });
      break;
    }
  }
  const decimals = usable.filter((u) => u.token.decimals > 0);
  const chosen = pick(decimals.length >= 3 ? decimals : [...decimals, ...usable.filter((u) => u.token.decimals === 0)], 3);
  return chosen.map(({ token, replacement }, n) => ({
    id: `${fixture.id}:changed-figure:${n}`,
    fixtureId: fixture.id,
    kind: 'changed-figure' as const,
    detail: `${token.text} -> ${replacement}`,
    text: text.slice(0, token.index) + replacement + text.slice(token.index + token.text.length),
  }));
}

function movedFigures(fixture: AskFixture, text: string, ev: Evidence): Corruption[] {
  const out: Corruption[] = [];
  const lines = text.split('\n');
  let offset = 0;
  const candidates: Array<{ from: AskFixture['roster'][number]; to: AskFixture['roster'][number]; line: string; start: number; token: Token }> = [];
  for (const line of lines) {
    const start = offset;
    offset += line.length + 1;
    const named = fixture.roster.filter((p) => line.includes(p.name) || (p.first_name ? new RegExp(`\\b${p.first_name}\\b`).test(line) : false));
    if (named.length !== 1) continue;
    const from = named[0] as AskFixture['roster'][number];
    for (const token of figureTokens(line).filter((t) => t.decimals > 0)) {
      const owned = ev.byPlayer.get(from.id);
      if (!owned || !inPool(token.value, token.decimals, owned)) continue;
      if (inPool(token.value, token.decimals, ev.unscoped)) continue; // also a team or unscoped figure: not clearly this player's
      // Owned by this player alone: a figure two players share reads as a group figure, and moving it proves nothing.
      if ([...ev.byPlayer.values()].filter((set) => inPool(token.value, token.decimals, set)).length !== 1) continue;
      // Prefer a player the turn read figures for: moving a figure onto someone with their own numbers is the hard case.
      const hasEvidence = (id: string) => (ev.byPlayer.get(id)?.size ?? 0) > 0;
      const to = [...fixture.roster]
        .sort((a, b) => Number(hasEvidence(b.id)) - Number(hasEvidence(a.id)) || a.name.localeCompare(b.name))
        .find((p) => p.id !== from.id && !line.includes(p.name) && !inPool(token.value, token.decimals, ev.byPlayer.get(p.id) ?? []));
      if (to) candidates.push({ from, to, line, start, token });
    }
  }
  const seenLines = new Set<string>();
  const unique = candidates.filter((c) => (seenLines.has(c.line) ? false : (seenLines.add(c.line), true)));
  pick(unique, 3).forEach((c, n) => {
    const swapped = c.line
      .split(c.from.name).join(c.to.name)
      .replace(new RegExp(`\\b${c.from.first_name}\\b`, 'g'), c.to.first_name ?? c.to.name);
    out.push({
      id: `${fixture.id}:moved-figure:${n}`,
      fixtureId: fixture.id,
      kind: 'moved-figure',
      detail: `${c.token.text} from ${c.from.name} to ${c.to.name}`,
      text: text.slice(0, c.start) + swapped + text.slice(c.start + c.line.length),
    });
  });
  return out;
}

function inventedDates(fixture: AskFixture, text: string, ev: Evidence): Corruption[] {
  const out: Corruption[] = [];
  // The audit lets a date through when it falls inside a window a read covered, so an invented date has to land outside
  // everything the turn read, the coach said, and the day it was asked.
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
  const known = [...ev.isoDates, fixture.turn.createdAt.slice(0, 10), fixture.userMessage.createdAt.slice(0, 10)].map(day).filter(Number.isFinite);
  const low = Math.min(...known) - 3;
  const high = Math.max(...known) + 3;
  const year = Number(fixture.turn.createdAt.slice(0, 4));
  const outside = ([[2, 14], [0, 22], [11, 3], [8, 30], [1, 9], [3, 19]] as const).filter(([month, d]) =>
    [year - 1, year, year + 1].every((y) => {
      const t = day(`${y}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      return t < low || t > high;
    }) && !fixture.userMessage.content.toLowerCase().includes(MONTHS[month] as string),
  );
  const [first, second] = outside;
  // 1. Replace a date the answer already states with one outside everything the turn knows.
  const named = new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})\\b`, 'i');
  const m = named.exec(text);
  if (m && first) {
    const [month, d] = first;
    const replacement = `${MONTH_NAMES[month]} ${d}`;
    out.push({
      id: `${fixture.id}:invented-date:0`,
      fixtureId: fixture.id,
      kind: 'invented-date',
      detail: `${m[0]} -> ${replacement}`,
      text: text.slice(0, m.index) + replacement + text.slice(m.index + m[0].length),
    });
  }
  // 2. Add a sentence that dates something outside everything the turn knows.
  const target = second ?? first;
  if (target) {
    const [month, d] = target;
    out.push({
      id: `${fixture.id}:invented-date:${out.length}`,
      fixtureId: fixture.id,
      kind: 'invented-date',
      detail: `sentence dated ${MONTH_NAMES[month]} ${d}`,
      text: `${text}\n\nThis was last reviewed on ${MONTH_NAMES[month]} ${d}.`,
    });
  }
  return out;
}

/** Corrupted copies of one stored answer. */
export function corruptionsFor(fixture: AskFixture): Corruption[] {
  const text = answerText(fixture);
  const ev = evidenceOf(fixture);
  return [...changedFigures(fixture, text, ev), ...movedFigures(fixture, text, ev), ...inventedDates(fixture, text, ev)];
}
