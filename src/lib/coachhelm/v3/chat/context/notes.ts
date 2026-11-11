/**
 * CoachHelm chat: what the coach has told it. Standing notes and the conversation's tone.
 *
 * A note is one sentence the coach asked CoachHelm to keep: how they want answers, or a lasting fact about the team
 * ("Qualifying is 54 holes, low four count"). Notes live in `golf_coachhelm_coach_facts`, one row each, per coach and
 * team, readable and writable only by that coach (row-level security, held migration 20261101090100). The tone is a
 * column on the conversation, from the same migration.
 *
 * How they reach the model, and why not through the prompt: the prompt and the tool definitions must not change during
 * a conversation (a changed prefix invalidates the stored thinking), and a note can be saved at any moment. So:
 *   - `firstTurnNotes` is a system message for a conversation's FIRST turn, after the user's message;
 *   - `toneSentence` rides on every turn's system line (the tone switch can move mid-conversation);
 *   - a save or a removal answers with the full list as it now stands, so the conversation it happened in is current
 *     without another message.
 *
 * Why two plain tools and not Anthropic's memory tool (`memory_20250818`): see engine/CONTRACT_NOTES.md, C3. In short:
 * it is a file directory the model keeps for itself, and these are a coach's own sentences in rows.
 *
 * Without the migration there are simply no notes: every reader here answers `null`, nothing throws, and `save_note`
 * says in plain words that it cannot keep things between conversations yet.
 *
 * A player has no notes. `noteTools` gives a player's context nothing, and both tools refuse a player's context again
 * when run, so a registry mistake could not hand a coach's notes to a player.
 */
import 'server-only';
import { z } from 'zod';
import { deleteCoachFact, saveCoachFact } from '@/app/golf/actions/coachhelm-ask';
import { readAskKnows, type AskKnows, type AskTone } from '../ask-knows';
import type { CoachChatContext } from '../context';
import { isPlayerContext, type ChatDataPart, type ChatTool, type PlayerChatContext, type ReadTool, type ToolContext, type ToolResult } from '../engine/tool';
import { nowIso } from '../provenance';

type Who = CoachChatContext | PlayerChatContext;

/** The table's own limit (`golf_coachhelm_coach_facts_text_length`) and the server action's. */
export const NOTE_MAX_CHARS = 280;
/** Notes are read into the first turn of every conversation, so the list stays short enough to read. */
export const NOTE_MAX_COUNT = 30;

/** The chip the thread draws when a note is saved or removed. */
export interface CoachNotePart extends ChatDataPart {
  type: 'data-coach-note';
  id: string;
  data: { op: 'saved' | 'removed'; note_id: string; text: string };
}

/**
 * The coach's notes and this conversation's tone, or null: a player, the migration not applied, or a read that failed.
 * Null always means "carry on without notes", never a failed turn.
 */
export async function readStandingNotes(sb: ToolContext['sb'], who: Who, conversationId: string | null): Promise<AskKnows | null> {
  if (isPlayerContext(who)) return null;
  try {
    return await readAskKnows(sb, { coachId: who.coach_id, teamId: who.team_id, conversationId });
  } catch {
    return null;
  }
}

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();
const numbered = (facts: AskKnows['facts']): string => facts.map((f, i) => `${i + 1}. ${oneLine(f.text)}`).join('\n');

/**
 * The system message for a conversation's first turn, or null when the coach has no notes (nothing is sent). The words
 * are the coach's own, so they are instructions about how to answer, unlike text inside the team's data.
 */
export function firstTurnNotes(knows: AskKnows | null): string | null {
  if (!knows || knows.facts.length === 0) return null;
  return [
    'The coach’s standing notes, in their own words. Follow the ones about how to answer and treat the others as facts about the team. They are private to this coach: never repeat them to a player.',
    numbered(knows.facts.slice(0, NOTE_MAX_COUNT)),
  ].join('\n');
}

const TONE_SENTENCE: Record<AskTone, string> = {
  straight: 'Tone: straight. Short, plain sentences; lead with the answer.',
  detailed: 'Tone: detailed. Walk through how you got there, with the reads in order.',
  team_talk: 'Tone: team talk. Write it so the coach could read it out to the team, without naming anyone unless asked.',
};

/** The tone for this turn, to follow the screen line, or null where there is no tone to read (no migration, a player). Reads and figures never change with it. */
export function toneSentence(knows: AskKnows | null): string | null {
  return knows ? (TONE_SENTENCE[knows.tone] ?? TONE_SENTENCE.straight) : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// The two tools
// ---------------------------------------------------------------------------------------------------------------------

const answer = (summary: string, extra: { parts?: ChatDataPart[]; refused?: boolean } = {}): ToolResult & { model_text: string } => ({
  summary,
  measurements: [],
  series: [],
  coverage: extra.refused ? 'unavailable' : 'complete',
  coverage_note: extra.refused ? summary : null,
  as_of: nowIso(),
  evidence: false,
  ...(extra.parts?.length ? { parts: extra.parts } : {}),
  model_text: summary,
});

const NOT_ON = 'Standing notes are not switched on for this team yet, so nothing can be kept between conversations. Tell the coach that plainly; you can still follow it for the rest of this conversation.';
const PLAYERS_NONE = 'Notes belong to the coach. A player has none.';
const listNow = (facts: AskKnows['facts']): string => (facts.length ? `The coach’s notes are now:\n${numbered(facts)}` : 'The coach now has no notes.');

/**
 * What must not be written down, checked by the server as well as asked of the model: a named roster player together
 * with health, family, grades or discipline, and anyone's contact details or a secret. It is a floor, not a judge: the
 * tool's description carries the rule, and this catches the plain cases whatever the model was talked into.
 */
const PRIVATE_MATTERS = /\b(injur\w*|surger\w*|concuss\w*|medic\w*|diagnos\w*|therap\w*|rehab\w*|illness|sick|mental|depress\w*|anxi\w*|eating|pregnan\w*|adhd|disab\w*|gpa|grades?|failing|ineligib\w*|probation|suspen\w*|disciplin\w*|arrest\w*|divorc\w*|custody|scholarship|financial aid|visa|immigration)\b/i;
const CONTACT_OR_SECRET = /@|\b(password|passcode|ssn|social security)\b|(?:\+?\d[\s().-]?){9,}/i;

export function noteRefusal(who: CoachChatContext, text: string): string | null {
  if (CONTACT_OR_SECRET.test(text)) return 'That holds contact details or a secret, which notes do not keep. Nothing was saved.';
  if (PRIVATE_MATTERS.test(text)) {
    // Names are matched as written (capitalised), so a player called Will does not make every "will" a name.
    const named = who.roster.some((p) => [p.name, p.first_name, p.last_name].some((n) => n && n.trim().length > 1 && new RegExp(`(^|[^\\p{L}])${n.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u').test(text)));
    if (named) return 'That is about a named player’s health or private circumstances, which notes do not keep. Nothing was saved. The coach-only availability note on the player is the place for it.';
  }
  return null;
}

async function runSave(ctx: ToolContext, input: { text: string }): Promise<ToolResult> {
  if (isPlayerContext(ctx.who)) return answer(PLAYERS_NONE, { refused: true });
  const who = ctx.who;
  const text = oneLine(input.text);
  if (!text) return answer('There was nothing to save.', { refused: true });
  if (text.length > NOTE_MAX_CHARS) return answer(`A note is one sentence, up to ${NOTE_MAX_CHARS} characters. Shorten it and save it again. Nothing was saved.`, { refused: true });
  const refusal = noteRefusal(who, text);
  if (refusal) return answer(refusal, { refused: true });

  const before = await readStandingNotes(ctx.sb, who, null);
  if (!before) return answer(NOT_ON, { refused: true });
  const same = before.facts.find((f) => oneLine(f.text).toLowerCase() === text.toLowerCase());
  if (same) return answer(`That is already one of the coach’s notes. Nothing new was saved. ${listNow(before.facts)}`);
  if (before.facts.length >= NOTE_MAX_COUNT) return answer(`The coach already has ${NOTE_MAX_COUNT} notes, which is the most that are kept. Ask which one to remove first. Nothing was saved.`, { refused: true });

  // The app's own action: its validation, the coach from the session, row-level security on the insert.
  const saved = await saveCoachFact({ teamId: who.team_id, text }).catch(() => ({ success: false as const, error: undefined, id: undefined }));
  if (!saved.success || !saved.id) return answer('The note could not be saved just now. Nothing was saved; tell the coach and offer to try again.', { refused: true });
  const part: CoachNotePart = { type: 'data-coach-note', id: `coach-note-${saved.id}`, data: { op: 'saved', note_id: saved.id, text } };
  return answer(`Saved. The coach sees it as a chip and can remove it. ${listNow([...before.facts, { id: saved.id, text }])}`, { parts: [part] });
}

const wordsOf = (s: string): string[] => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);

async function runRemove(ctx: ToolContext, input: { note: string }): Promise<ToolResult> {
  if (isPlayerContext(ctx.who)) return answer(PLAYERS_NONE, { refused: true });
  const who = ctx.who;
  const before = await readStandingNotes(ctx.sb, who, null);
  if (!before) return answer(NOT_ON, { refused: true });
  if (before.facts.length === 0) return answer('The coach has no notes to remove.');

  const asked = oneLine(input.note).toLowerCase();
  const exact = before.facts.filter((f) => oneLine(f.text).toLowerCase() === asked);
  const want = wordsOf(asked);
  const matches = exact.length ? exact : want.length ? before.facts.filter((f) => want.every((w) => wordsOf(f.text).includes(w))) : [];
  if (matches.length === 0) return answer(`No note matches that. Nothing was removed. ${listNow(before.facts)}`);
  if (matches.length > 1) return answer(`${matches.length} notes match that; ask the coach which one. Nothing was removed.\n${numbered(matches)}`);

  const target = matches[0]!;
  const gone = await deleteCoachFact(target.id).catch(() => ({ success: false as const }));
  if (!gone.success) return answer('The note could not be removed just now. Nothing changed; tell the coach and offer to try again.', { refused: true });
  const part: CoachNotePart = { type: 'data-coach-note', id: `coach-note-${target.id}`, data: { op: 'removed', note_id: target.id, text: oneLine(target.text) } };
  return answer(`Removed “${oneLine(target.text)}”. ${listNow(before.facts.filter((f) => f.id !== target.id))}`, { parts: [part] });
}

export const saveNote: ReadTool<{ text: string }> = {
  kind: 'read',
  // It writes: only the model itself may ask for it, never the model's code (engine/CONTRACT_NOTES.md, E19).
  direct_only: true,
  name: 'save_note',
  description:
    'Keep one standing note for this coach across conversations when they ask you to remember something: how they want answers, or a lasting team fact. Use the coach’s words, one sentence. Never a named player’s health, injuries, family, grades or discipline, or contact details: say you will not keep that. It saves at once and players never see notes.',
  input: z.strictObject({ text: z.string().min(1).max(NOTE_MAX_CHARS) }),
  progress: () => 'Saving that note',
  run: runSave,
};

export const removeNote: ReadTool<{ note: string }> = {
  kind: 'read',
  // It writes: only the model itself may ask for it, never the model's code (engine/CONTRACT_NOTES.md, E19).
  direct_only: true,
  name: 'remove_note',
  description:
    'Remove one of the coach’s standing notes when they ask you to forget it. Pass its text or a few of its words; if several match, nothing is removed and they are returned so you can ask which.',
  input: z.strictObject({ note: z.string().min(1).max(NOTE_MAX_CHARS) }),
  progress: () => 'Removing that note',
  run: runRemove,
};

/** The note tools for a signed-in person: both for a coach, none for a player. */
export function noteTools(who: Who): ChatTool[] {
  return isPlayerContext(who) ? [] : [saveNote, removeNote];
}
