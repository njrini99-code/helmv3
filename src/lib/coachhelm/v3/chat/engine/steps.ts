/**
 * CoachHelm chat: what a step of work says about itself beyond its label.
 *
 * A step is a progress row (`data-progress`): a read, a calculation, a draft. The thread's activity island is drawn from these
 * rows alone, so everything here is a fact the engine has at that moment and nothing is estimated: who a step is about is taken
 * from the tool's input and from what the read returned, a count is what the read counted, and a time is a clock reading.
 *
 * Who a step is about is only ever someone the caller may see: a player is named from the caller's own roster (for a signed-in
 * player that roster is themselves alone), and the team is the caller's own.
 */
import type { ToolEnvelope } from '../provenance';
import type { ChatStep, ChatStepKind, ChatStepSubject, ChatUIPart } from './protocol';
import type { ChatTool, StepDescriptor, ToolContext } from './tool';
import { isPlayerContext } from './tool';

/** The most subjects one step carries: a row of faces, not a roster. The rest are a number (`subjects_more`). */
export const MAX_STEP_SUBJECTS = 12;
/** The most subjects a step keeps track of at all, so its "and N more" is a true count without holding a whole season of rounds. */
const MAX_TRACKED_SUBJECTS = 500;

/** The tool's own descriptor of its step, when it declares more than a kind. */
const descriptorOf = (tool: ChatTool): StepDescriptor<unknown> | null => (tool.step && typeof tool.step === 'object' ? (tool.step as StepDescriptor<unknown>) : null);

/** The step's mark: what the tool declares, else `draft` for a task and `read` for a read. Never worked out from a name. */
export const stepKindOf = (tool: ChatTool): ChatStepKind => (typeof tool.step === 'string' ? tool.step : descriptorOf(tool)?.kind) ?? (tool.kind === 'task' ? 'draft' : 'read');

/** The finished row's label as the tool words it, or null when it declares none (or what it gives is not usable). */
export function doneLabelOf(tool: ChatTool, input: unknown, result: ToolEnvelope | null): string | null {
  const declared = descriptorOf(tool)?.doneLabel;
  if (!declared) return null;
  try {
    const words = declared(input, result);
    return typeof words === 'string' && words.trim() ? words.trim().slice(0, 160) : null;
  } catch {
    return null;
  }
}

function known(who: ToolContext['who'], kind: string, id: unknown): ChatStepSubject | null {
  if (typeof id !== 'string') return null;
  if (kind === 'player') {
    const player = who.roster.find((p) => p.id === id);
    return player ? { kind: 'player', id, label: player.name } : null;
  }
  if (kind === 'team') return id === who.team_id ? { kind: 'team', id, label: who.team_name } : null;
  return null;
}

/** Add subjects to a list, each once, in the order they became known. Returns the same list when nothing was added. */
export function withSubjects(have: readonly ChatStepSubject[], more: readonly ChatStepSubject[]): readonly ChatStepSubject[] {
  const next = [...have];
  for (const subject of more) {
    if (next.length >= MAX_TRACKED_SUBJECTS) break;
    if (!next.some((s) => s.kind === subject.kind && s.id === subject.id)) next.push(subject);
  }
  return next.length === have.length ? have : next;
}

/** A step's subjects as it sends them: the first twelve, and how many more there are. Nothing when it is about no one. */
export function subjectFields(all: readonly ChatStepSubject[]): Pick<ChatStep, 'subjects' | 'subjects_more'> {
  if (all.length === 0) return {};
  if (all.length <= MAX_STEP_SUBJECTS) return { subjects: all };
  return { subjects: all.slice(0, MAX_STEP_SUBJECTS), subjects_more: all.length - MAX_STEP_SUBJECTS };
}

const THINGS = new Set<ChatStepSubject['kind']>(['round', 'event', 'qualifier', 'tournament', 'plan', 'document']);
/** A face is passed on only as an address this app or a secure host serves. */
const faceOf = (value: unknown): string | null => (typeof value === 'string' && value.length <= 500 && (/^https:\/\//.test(value) || /^\/[^/]/.test(value)) ? value : null);

/**
 * Who or what the tool itself says its step is about (`StepDescriptor.subjects`), checked: a player only if on the caller's own
 * roster, and named as the roster names them; a team only if it is the caller's; a thing (an event, a qualifier, a plan) as the
 * tool gives it, which it read under the caller's own session. A signed-in player's step is only ever about themselves. A tool
 * that declares nothing, or throws, adds nothing.
 */
export function subjectsDeclared(tool: ChatTool, input: unknown, ctx: ToolContext): readonly ChatStepSubject[] {
  const declared = descriptorOf(tool)?.subjects;
  if (!declared) return [];
  let given: unknown;
  try {
    given = declared(input, ctx);
  } catch {
    return [];
  }
  if (!Array.isArray(given)) return [];
  const kept: ChatStepSubject[] = [];
  for (const item of given.slice(0, MAX_TRACKED_SUBJECTS)) {
    const { kind, id, label, avatar_url: face } = (item ?? {}) as Partial<ChatStepSubject>;
    if (typeof id !== 'string' || !id || id.length > 100) continue;
    const person = kind === 'player' || kind === 'team' ? known(ctx.who, kind, id) : null;
    const thing = kind && THINGS.has(kind) && !isPlayerContext(ctx.who) && typeof label === 'string' && label.trim() ? { kind, id, label: label.trim().slice(0, 80) } : null;
    const subject = person ?? thing;
    if (!subject) continue;
    const avatar = faceOf(face);
    kept.push(avatar ? { ...subject, avatar_url: avatar } : subject);
  }
  return withSubjects([], kept);
}

/** Who a step is about, as far as its input says before it has run: the players it names. */
export function subjectsOfInput(who: ToolContext['who'], input: unknown): readonly ChatStepSubject[] {
  if (!input || typeof input !== 'object') return [];
  const { player_id: one, player_ids: many } = input as { player_id?: unknown; player_ids?: unknown };
  const ids = [one, ...(Array.isArray(many) ? many : [])];
  return withSubjects([], ids.flatMap((id) => known(who, 'player', id) ?? []));
}

/** Who a read turned out to be about: the players and the team it measured, and (for a coach) the rounds. */
export function subjectsOfEnvelope(who: ToolContext['who'], envelope: ToolEnvelope): readonly ChatStepSubject[] {
  const found: ChatStepSubject[] = [];
  for (const m of [...(envelope.measurements ?? []), ...(envelope.series ?? [])]) {
    const entity = m.entity;
    if (!entity) continue;
    const subject = known(who, entity.kind, entity.id);
    if (subject) found.push(subject);
    // A round is named by the read itself. A player's Ask is about their own game, so nothing but themselves is sent for it.
    else if (entity.kind === 'round' && !isPlayerContext(who)) found.push({ kind: 'round', id: entity.id, label: String(entity.label).slice(0, 80) });
  }
  return withSubjects([], found);
}

/** How many players of the caller's roster a set of reads measured. */
export function playersCovered(who: ToolContext['who'], envelopes: readonly ToolEnvelope[]): number {
  const ids = new Set<string>();
  for (const envelope of envelopes) {
    for (const m of [...(envelope.measurements ?? []), ...(envelope.series ?? [])]) if (m.entity?.kind === 'player' && who.roster.some((p) => p.id === m.entity.id)) ids.add(m.entity.id);
  }
  return ids.size;
}

/** What a finished read counted, from its first figure: "38 rounds". Null when the read counted nothing. */
export function countOfEnvelope(envelope: ToolEnvelope): ChatStep['count'] | null {
  const m = envelope.measurements?.[0];
  return m && m.sample_size > 0 ? { n: m.sample_size, unit: String(m.sample_unit), more: false } : null;
}

const isStep = (part: ChatUIPart): boolean => part.type === 'data-progress' && (part.data as ChatStep | undefined)?.tool !== 'note';

/**
 * The work of a turn, from its rows: how many steps there were, and for how long at least one of them was running (not the
 * turn's whole duration, which also holds the model's own time and any wait on the coach). A step still running is counted up to
 * `now`.
 */
export function workOf(parts: readonly ChatUIPart[], now: number = Date.now()): { steps: number; working_ms: number } {
  const steps = parts.filter(isStep);
  const spans = steps
    .map((p) => p.data as ChatStep)
    .flatMap((s) => {
      const from = s.started_at ? Date.parse(s.started_at) : NaN;
      const to = s.ended_at ? Date.parse(s.ended_at) : now;
      return Number.isFinite(from) && Number.isFinite(to) && to >= from ? [[from, to] as const] : [];
    })
    .sort((a, b) => a[0] - b[0]);
  let working = 0;
  let end = -Infinity;
  for (const [from, to] of spans) {
    if (from > end) working += to - from;
    else if (to > end) working += to - end;
    end = Math.max(end, to);
  }
  return { steps: steps.length, working_ms: Math.round(working) };
}

/** The highest number a turn's stored rows were given as ids (`progress-7`, `note-8`), so a request that continues the turn never reuses one. */
export const lastRowNumberOf = (parts: readonly ChatUIPart[]): number =>
  parts.reduce((max, p) => {
    const n = p.type === 'data-progress' && typeof p.id === 'string' ? Number(/^(?:progress|note)-(\d+)$/.exec(p.id)?.[1] ?? 0) : 0;
    return n > max ? n : max;
  }, 0);

/** The highest sequence number a turn's stored rows carry, so a request that continues the turn counts on from it. */
export const lastSeqOf = (parts: readonly ChatUIPart[]): number =>
  parts.reduce((max, p) => {
    const seq = p.type === 'data-progress' ? (p.data as ChatStep | undefined)?.seq : undefined;
    return typeof seq === 'number' && seq > max ? seq : max;
  }, 0);
