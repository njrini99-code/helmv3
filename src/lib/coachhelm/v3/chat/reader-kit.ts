/**
 * CoachHelm chat: what every reader shares.
 *
 * Who is asking comes from the tool context, never from the model. A player's context is the coach context shape
 * with the roster reduced to them and `player_id` set (`resolvePlayerChatContext`); `ownOr` is the one place a
 * model-supplied player id is replaced by the caller's own, so no reader can forget it.
 */
import { isPlayerContext, type ToolContext, type ToolResult } from './engine/tool';
import { requireRosterPlayer, type CoachChatContext } from './context';
import { nowIso, unavailableEnvelope, type CoverageState, type Measurement, type ToolEnvelope } from './provenance';

/** The session's context in the shape the existing reads take. */
export const teamOf = (ctx: ToolContext): CoachChatContext => ctx.who;

/** The signed-in player's id, or null for a coach. */
export const playerOf = (ctx: ToolContext): string | null => (isPlayerContext(ctx.who) ? ctx.who.player_id : null);

/**
 * The players a read is about. A player: always and only themself, whatever was asked. A coach: the asked ids, each
 * checked against the active roster (a throw the engine reports as a read that could not be made).
 */
export function ownOr(ctx: ToolContext, asked: readonly string[] | undefined): string[] {
  const me = playerOf(ctx);
  if (me) return [me];
  return [...new Set(asked ?? [])].map((id) => requireRosterPlayer(ctx.who, id).id);
}

/** One optional player: the caller's own for a player; for a coach the asked one (checked) or none. */
export function ownOrOne(ctx: ToolContext, asked: string | undefined): string | undefined {
  const me = playerOf(ctx);
  if (me) return me;
  return asked ? requireRosterPlayer(ctx.who, asked).id : undefined;
}

export const nameOf = (ctx: ToolContext, playerId: string): string => ctx.who.roster.find((p) => p.id === playerId)?.name ?? 'This player';

/** A read that could not be made. Never an empty result. */
export const failed = (what: string, why = 'The read failed.'): ToolEnvelope => unavailableEnvelope(`Could not read ${what}.`, why);

/**
 * "That isn't tracked": the question asks for something the app does not record. A read on the contract (it gets an
 * evidence chip, so the thread can draw the "Not tracked … Closest: …" row), with the nearest figures that are recorded.
 */
export function notTracked(entry: { what: string; nearest: readonly string[]; note: string }): ToolResult {
  const closest = entry.nearest.length ? `Closest that is tracked: ${entry.nearest.join(', ')}.` : 'Nothing close to it is tracked.';
  return {
    summary: `Not tracked: ${entry.what}.`,
    measurements: [],
    series: [],
    coverage: 'not_tracked',
    coverage_note: entry.note,
    nearest: [...entry.nearest],
    as_of: nowIso(),
    model_text: `Not tracked: ${entry.what}. ${entry.note} ${closest} Say first that it is not tracked, then offer the closest figure; never show a zero or an empty chart for it.`,
  };
}

export const empty = (summary: string, detail?: unknown): ToolEnvelope => ({ summary, measurements: [], series: [], ...(detail === undefined ? {} : { detail }), coverage: 'empty', coverage_note: null, as_of: nowIso() });

/** A result that is not a read of team data: a drawn visual, a draft, a refusal. No evidence chip. */
export function notice(summary: string, extra: Pick<ToolResult, 'parts' | 'end_turn'> & { detail?: unknown; refused?: boolean } = {}): ToolResult {
  const { refused, detail, ...rest } = extra;
  return { summary, measurements: [], series: [], ...(detail === undefined ? {} : { detail }), coverage: refused ? 'unavailable' : 'complete', coverage_note: refused ? summary : null, as_of: nowIso(), evidence: false, ...rest };
}

export const round = (v: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/** A figure as a coach reads it: signed where the scale is relative, with its unit. */
export function say(value: number | null, unit: Measurement['unit'] | '%' | ' ft' | '', digits = 1, signed = false): string {
  if (value === null) return 'no figure';
  const v = round(value, digits);
  const body = `${signed && v > 0 ? '+' : ''}${v.toFixed(digits)}`;
  return unit === 'percent' || unit === '%' ? `${body}%` : unit === 'feet' || unit === ' ft' ? `${body} ft` : body;
}

/**
 * Several reads answered as one. Each part keeps its own measurements and its own detail under its label. A part that
 * could not be read is named in the note and the whole is `partial`; only when every part failed is it `unavailable`.
 */
export function together(summary: string, parts: ReadonlyArray<readonly [label: string, envelope: ToolEnvelope]>): ToolEnvelope {
  const down = parts.filter(([, e]) => e.coverage === 'unavailable');
  if (parts.length > 0 && down.length === parts.length) return unavailableEnvelope(`Could not read ${parts.map(([l]) => l).join(', ')}.`, down.map(([l, e]) => `${l}: ${e.coverage_note ?? 'failed'}`).join(' '));
  const notes = parts.filter(([, e]) => e.coverage_note).map(([l, e]) => `${l}: ${e.coverage_note}`);
  const allEmpty = parts.every(([, e]) => e.coverage === 'empty' || e.coverage === 'unavailable');
  const coverage: CoverageState = down.length > 0 || parts.some(([, e]) => e.coverage === 'partial') ? 'partial' : allEmpty ? 'empty' : 'complete';
  return {
    summary: parts.length === 1 ? parts[0]![1].summary : `${summary} ${parts.map(([l, e]) => `${l}: ${e.summary}`).join(' ')}`.trim(),
    measurements: parts.flatMap(([, e]) => e.measurements),
    series: parts.flatMap(([, e]) => e.series),
    detail: parts.length === 1 ? parts[0]![1].detail : Object.fromEntries(parts.map(([l, e]) => [l, e.coverage === 'unavailable' ? { could_not_read: e.coverage_note ?? true } : (e.detail ?? { summary: e.summary })])),
    coverage,
    coverage_note: notes.length ? notes.join(' ') : null,
    as_of: nowIso(),
  };
}

/** Runs a part and turns a throw into a failed part, so one bad read does not lose the others. */
export async function part(label: string, run: () => Promise<ToolEnvelope>): Promise<readonly [string, ToolEnvelope]> {
  try {
    return [label, await run()] as const;
  } catch (err) {
    return [label, failed(label, err instanceof Error && err.name === 'CoachContextError' ? err.message : 'The read failed.')] as const;
  }
}

/**
 * Labelled lines for the model in place of the envelope's JSON (see engine/CONTRACT_NOTES.md, `model_text`). The
 * envelope still carries every figure for the evidence chip, the visuals and the grounding check.
 */
export function withText<E extends ToolEnvelope>(envelope: E, lines: ReadonlyArray<string | null | false | undefined>): E & { model_text: string } {
  const text = [envelope.summary, ...lines.filter((l): l is string => typeof l === 'string' && l.length > 0), envelope.coverage === 'complete' ? null : `Coverage: ${envelope.coverage}${envelope.coverage_note ? `. ${envelope.coverage_note}` : ''}`].filter(Boolean).join('\n');
  return { ...envelope, model_text: text };
}
