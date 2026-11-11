'use client';

import { ArrowUpRight, Calculator, SearchX, StickyNote, X } from 'lucide-react';
import { IconButton } from '../../../../ui/Button';
import { Icon } from '../../../../ui/Icon';
import { pluralWord } from '../../../../lib/plural';
import { count } from './facts';

/**
 * The small things an answer can carry beside its words (CAPABILITIES.md C, D14 to D16): a link into the app, a standing
 * note that was saved or removed, how a whole-team figure was worked out, and "that isn't tracked". Presentational: the
 * thread decides where each sits and how it arrives (MOTION MO-5-9).
 */

/** `data-app-link` (context/find-in-app.ts). `href` is an in-app path from the app map, never model text. */
export interface AppLink {
  label: string;
  href: string;
  /** The place's one line, when the thread has it. */
  purpose?: string;
}

/** D14: a quiet row under the paragraph that names the place. The whole row is the link, at 44px. */
export function AppLinkRow({ link }: { link: AppLink }) {
  return (
    <a className="ch-akc-link" href={link.href} data-ch-press=".97" data-ch-app-link="">
      <span className="ch-akc-link__ico" aria-hidden="true">
        <Icon icon={ArrowUpRight} size={16} />
      </span>
      <span>
        <b>{link.label}</b>
        {link.purpose && <small>{link.purpose}</small>}
      </span>
    </a>
  );
}

/** `data-coach-note` (context/notes.ts). */
export interface CoachNote {
  op: 'saved' | 'removed';
  note_id: string;
  text: string;
}

/**
 * C: a standing note, saved at once with no Confirm. So the proof and the undo are the same small thing: the chip says
 * what was kept, who can see it, and carries the key that removes it.
 */
export function CoachNoteChip({ note, onRemove }: { note: CoachNote; /** Absent: the chip is a record only (a removed note, or a restored thread whose note is gone). */ onRemove?: (noteId: string) => void }) {
  const saved = note.op === 'saved';
  return (
    <div className="ch-akc-noted" data-op={note.op} role="status">
      <Icon icon={StickyNote} size={16} />
      <span className="ch-akc-noted__tx">
        <b>{saved ? 'Noted' : 'Removed'}</b>
        <span>{note.text}</span>
        {saved && <small>Only you. Players never see notes.</small>}
      </span>
      {saved && onRemove && <IconButton icon={X} label={`Remove the note: ${note.text}`} size="sm" variant="ghost" onClick={() => onRemove(note.note_id)} />}
    </div>
  );
}

/**
 * What the thread needs to say that an answer was calculated across the team. Not on the wire yet (CAPABILITIES E-25):
 * the loop emits nothing for a calculation. This is the shape asked for.
 */
export interface ComputedPart {
  /** One sentence, in plain words, of what was done. Never code. */
  method: string;
  players: number;
  reads: number;
  rounds?: number | null;
  window?: string | null;
}

/** D15: "How this was worked out", for the evidence panel. Figures in such an answer have no markers, so this is how it shows its work. */
export function WorkedOut({ computed }: { computed: ComputedPart }) {
  return (
    <section className="ch-akc-worked" aria-label="How this was worked out" data-ch-computed="">
      <p className="ch-akc-worked__how">{computed.method}</p>
      <dl className="ch-akc-worked__read">
        <div>
          <dt>Players</dt>
          <dd className="ch-num">{count(computed.players)}</dd>
        </div>
        {computed.rounds != null && (
          <div>
            <dt>Rounds</dt>
            <dd className="ch-num">{count(computed.rounds)}</dd>
          </div>
        )}
        <div>
          <dt>Reads</dt>
          <dd className="ch-num">{count(computed.reads)}</dd>
        </div>
      </dl>
      {computed.window && <p className="ch-akc-meta">{computed.window}</p>}
      <p className="ch-akc-gap">Worked out from the reads above. A figure here has no marker of its own.</p>
    </section>
  );
}

/** The work line's summary for a turn that calculated: "14 reads · 1 calculation · 4s". */
export function computedSummary(reads: number, seconds: number | null): string {
  return [`${count(reads)} ${pluralWord(reads, 'read')}`, '1 calculation', seconds == null ? null : `${seconds}s`].filter(Boolean).join(' · ');
}

/** The shape asked for on a read's envelope when the app does not collect the thing (CAPABILITIES E-26). */
export interface NotTrackedPart {
  what: string;
  nearest: string[];
}

/** D16: said once, under the sentence that says it, with the nearest things that are tracked. Never an empty chart, never a zero. */
export function NotTracked({ part }: { part: NotTrackedPart }) {
  return (
    <div className="ch-akc-untracked" role="note" data-ch-not-tracked="">
      <Icon icon={SearchX} size={16} />
      <div>
        <b>Not tracked: {part.what}</b>
        {part.nearest.length > 0 && (
          <ul aria-label="The closest things that are tracked">
            <li>Closest:</li>
            {part.nearest.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** The glyph the foot row's "Worked out" chip uses, so the shell and this panel share one. */
export const WORKED_OUT_ICON = Calculator;
