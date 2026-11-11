'use client';

import { ArrowUpRight, Check, CircleAlert, Play, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ActionProposal, ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import type { ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';
import type { AskBriefData, AskHandoffData } from '../data/coachhelm-chat-thread';
import { CARD_PHASES, CardBody, cardCopy, drawsSubject, editableOf, isOutOfDate, isWithdrawn, type CardDensity, type CardPerson, type CardPhase, type EditableField } from '../screens/coachhelm/chat/cards';
import { landsOf } from '../screens/coachhelm/chat/parts/ConfirmCard';
import { AppLinkRow, CoachNoteChip, NotTracked, WorkedOut, computedSummary } from '../screens/coachhelm/chat/cards/answers';
import { BriefBody, DocBody, HandoffBody } from '../screens/coachhelm/chat/cards/drafts';
import { WORK_KINDS } from '../screens/coachhelm/chat/cards/work-words';
import { CoachMark } from '../screens/coachhelm/chat/CoachMark';
import { AskEvidenceView } from '../screens/coachhelm/chat/Evidence';
import { WorkLine, type WorkModel } from '../screens/coachhelm/chat/parts/Work';
import { PlanCard } from '../screens/coachhelm/plan/PlanCard';
import { useChPhone } from '../lib/use-phone';
import { Badge, type BadgeTone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Segmented } from '../ui/Segmented';
import { Select } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { ASK_EV_EMPTY, ASK_EV_FAILED, ASK_EV_JONAH, ASK_EV_JONAH_SG, ASK_EV_JONAH_TREND, ASK_EV_RANKING, ASK_EV_SLOPE } from './fixtures-ask-thread';
import { CAP_ROSTER, CAP_TASKS, CAP_TEAM, capTask, type CapTask } from './fixtures-chat-capabilities';
import { PP_PLAN_PART } from './fixtures-practice-plan';
import { studioSpecimen } from './fixtures-chat-studio';
import { BatchPlate, StudioSection, StudioSpecimenView, WORKSPACE_SEQUENCES, WorkspacePlate, isWorkspaceSequence, type WorkspaceSequence } from './PreviewChatStudioPlates';
import { TERMS } from '../lib/glossary';

/**
 * Every capability of the CoachHelm chat in one page (docs/clubhouse/coachhelm-chat-v3/CAPABILITIES.md): each task's
 * card in every state, the drafts, the notes, what an answer can show and every word of the work line. No sign-in, no
 * model call, nothing leaves the page.
 *
 *   /clubhouse-preview/coachhelm-capabilities                               the whole catalogue
 *   ?task=create_trip&state=held&density=compact&variant=bare&play=1|undo   one capability, for a capture
 *
 * The card frame here is a STAND-IN for the chat UI lead's shell, built to SPEC Moment 7 (head, buttons, the ring with
 * "Not saved yet", the check only when saved). The bodies inside it are the real ones. Its 8 seconds are a page timer;
 * the real card draws the server's `held_until`.
 */

const HOLD_S = 8;
const RING = 81.68;
const PHASE_WORDS: Record<CardPhase, string> = { proposed: 'Proposed', confirming: 'Confirming', held: 'Held (the ring)', undoing: 'Undoing', committing: 'Saving', saved: 'Saved', partial: 'Partly saved', undone: 'Undone', cancelled: 'Cancelled', superseded: 'Set aside by a new question', failed: 'Failed', expired: 'No longer available' };
const isPhase = (s: string | undefined): s is CardPhase => !!s && (CARD_PHASES as readonly string[]).includes(s);

function badgeFor(phase: CardPhase, done: string, sends: boolean): { tone: BadgeTone; text: string } {
  if (phase === 'saved') return { tone: 'positive', text: done };
  if (phase === 'partial') return { tone: 'warning', text: 'Partly done' };
  if (phase === 'held' || phase === 'undoing' || phase === 'committing') return { tone: 'warning', text: 'Holding' };
  if (phase === 'undone') return { tone: 'neutral', text: 'Undone' };
  if (phase === 'cancelled') return { tone: 'neutral', text: 'Cancelled' };
  if (phase === 'superseded') return { tone: 'neutral', text: 'Set aside' };
  if (phase === 'expired') return { tone: 'neutral', text: 'Expired' };
  if (phase === 'failed') return { tone: 'warning', text: sends ? 'Not sent' : 'Not saved' };
  return { tone: 'neutral', text: 'Not saved' };
}

const toldWords = (r: ActionReceipt): string | null => {
  const sent = r.notifications.filter((n) => n.status !== 'failed');
  if (!sent.length) return null;
  return `Told ${sent.map((n) => `${n.recipients} ${/^in-app$/i.test(n.channel) ? 'in the app' : `by ${n.channel}`}`).join(', ')}`;
};

const sayEdit = (f: EditableField, v: unknown): string => {
  if (v == null || v === '') return 'Not set';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  const word = (x: unknown) => f.options?.find((o) => o.value === x)?.label ?? String(x);
  return Array.isArray(v) ? v.map(word).join(', ') : word(v);
};
/** The gallery's stand-in for the server planning a card again after an edit (engine E28): the field's own row, and the next revision. */
function replan(p: ActionProposal, patch: Record<string, unknown>): ActionProposal {
  const fields = editableOf(p);
  const next = { ...p, facts: p.facts.map((fact) => {
    const f = fields.find((x) => x.label === fact.label && x.key in patch);
    return f ? { ...fact, value: sayEdit(f, patch[f.key]) } : fact;
  }) };
  return Object.assign(next, { editable: fields.map((f) => (f.key in patch ? { ...f, value: patch[f.key] as EditableField['value'] } : f)), revision: ((p as { revision?: number }).revision ?? 0) + 1 });
}

/** The stand-in shell: what the lead's card draws around a body. */
function StandInCard({ cap, proposal, roster, phase, density, left, running, onConfirm, onCancel, onUndo, onReset, edit }: { cap: CapTask; proposal: CapTask['proposal']; roster: readonly CardPerson[]; phase: CardPhase; density: CardDensity; left: number; running: boolean; onConfirm: () => void; onCancel: () => void; onUndo: () => void; onReset: () => void; /** Edit mode, as the shell wires it: the form is open, an edit is with the server, the server's refusal. */ edit?: { open: boolean; busy: boolean; error: string | null; onOpen: (open: boolean) => void; onEdit: (patch: Record<string, unknown>) => void } }) {
  const copy = cardCopy(cap.tool, proposal);
  const receipt: ActionReceipt | null = phase === 'saved' ? cap.saved : phase === 'partial' ? (cap.partial ?? cap.saved) : phase === 'failed' ? cap.failed : phase === 'held' || phase === 'undoing' || phase === 'committing' ? { ...cap.saved, status: 'held' } : null;
  const badge = badgeFor(phase, copy.badge, copy.reach === 'sends');
  const open = receipt?.created.find((c) => c.href);
  const told = receipt && (phase === 'saved' || phase === 'partial') ? toldWords(receipt) : null;
  const ringLeft = phase === 'committing' ? 0 : left;
  return (
    <section className="ch-akg-card" data-density={density} data-phase={phase} aria-label={`${copy.primary}. ${proposal.summary}`}>
      {/* As the real shell draws it (parts/TaskCard.tsx): a running head and the state, then the thing itself. A body that draws its own subject gets no second title. */}
      <div className="ch-akg-card__hd">
        <b>{copy.head}</b>
        <Badge tone={badge.tone}>{badge.text}</Badge>
      </div>
      {!drawsSubject(cap.tool) && <p className="ch-akg-card__sum">{proposal.summary}</p>}
      <div className="ch-akg-card__body" data-dim={isWithdrawn(phase) && phase !== 'failed' ? '' : undefined}>
        <CardBody tool={cap.tool} proposal={proposal} receipt={receipt} phase={phase} density={density} roster={roster} team={CAP_TEAM} lands={landsOf(cap.tool, proposal.visual)} onAsk={() => undefined} onEdit={edit?.onEdit} editing={edit?.busy} editError={edit?.error} onEditOpen={edit?.onOpen} />
      </div>
      <div className="ch-akg-card__ft">
        {(phase === 'proposed' || phase === 'confirming') && (
          <>
            <div className="ch-akg-card__btns">
              {phase === 'proposed' && (
                <Button variant="ghost" onClick={onCancel}>
                  {copy.dismiss}
                </Button>
              )}
              <Button variant="primary" busy={phase === 'confirming'} disabled={phase === 'proposed' && (proposal.missing.length > 0 || !!edit?.open)} onClick={onConfirm}>
                {phase === 'confirming' ? copy.busy : copy.primary}
              </Button>
            </div>
            {phase === 'proposed' && proposal.missing.length > 0 && <p className="ch-akg-card__why">Needs {proposal.missing.join(' and ').toLowerCase()}</p>}
            {phase === 'proposed' && edit?.open && <p className="ch-akg-card__why">{edit.busy ? 'Updating the preview…' : 'Update or discard your changes first.'}</p>}
          </>
        )}
        {(phase === 'held' || phase === 'undoing' || phase === 'committing') && (
          <div className="ch-akg-rcpt" role="status">
            <span className="ch-akg-ring" data-run={running && phase === 'held' ? '' : undefined}>
              <svg viewBox="0 0 32 32" aria-hidden="true">
                <circle className="trk" cx="16" cy="16" r="13" />
                <circle className="drn" cx="16" cy="16" r="13" style={running && phase === 'held' ? { animationDuration: `${HOLD_S}s` } : { strokeDashoffset: RING * (1 - ringLeft / HOLD_S) }} />
              </svg>
              <b className="ch-num">{Math.max(0, Math.ceil(ringLeft))}</b>
            </span>
            <span className="ch-akg-rcpt__tx">
              <b>{proposal.summary}</b>
              <span>{phase === 'undoing' ? 'Undoing…' : phase === 'committing' ? 'Saving…' : copy.hold(left)}</span>
            </span>
            <span className="ch-akg-rcpt__acts">
              <Button variant="secondary" leftIcon={Undo2} disabled={phase !== 'held'} aria={{ label: `Undo, ${Math.ceil(left)} seconds left` }} onClick={onUndo}>
                Undo
              </Button>
            </span>
          </div>
        )}
        {(phase === 'saved' || phase === 'partial') && receipt && (
          <>
            <div className="ch-akg-rcpt" role="status">
              <span className="ch-akg-mark" data-tone={phase === 'partial' ? 'warn' : 'ok'} aria-hidden="true">
                <Icon icon={phase === 'partial' ? CircleAlert : Check} size={16} />
              </span>
              <span className="ch-akg-rcpt__tx">
                <b>{receipt.summary}</b>
                {phase === 'partial' && <span>{receipt.partial_failures.join(' ')} Check what was saved before you try again.</span>}
                {phase === 'saved' && !open && !copy.immediate && <span>The receipt has no link yet, so there is no Open.</span>}
              </span>
              <span className="ch-akg-rcpt__acts">
                {open && (
                  <Button variant="secondary" rightIcon={ArrowUpRight} onClick={() => undefined}>
                    Open
                  </Button>
                )}
              </span>
            </div>
            {told && <p className="ch-akg-told">{told}</p>}
          </>
        )}
        {phase === 'failed' && receipt && (
          <div className="ch-akg-rcpt" role="alert">
            <span className="ch-akg-mark" data-tone="warn" aria-hidden="true">
              <Icon icon={CircleAlert} size={16} />
            </span>
            <span className="ch-akg-rcpt__tx">
              <b>{receipt.summary}</b>
              {isOutOfDate(receipt) ? <span>Things changed since this card was made. Ask again and it is prepared from what is true now.</span> : !/nothing was|look in|look at/i.test(receipt.summary) && <span>{copy.untouched}</span>}
            </span>
            <span className="ch-akg-rcpt__acts">
              {receipt.retryable && !isOutOfDate(receipt) && (
                <Button variant="secondary" onClick={onReset}>
                  Try again
                </Button>
              )}
            </span>
          </div>
        )}
        {phase === 'undone' && (
          <div className="ch-akg-rcpt" role="status">
            <span />
            <p className="ch-akg-card__line">{copy.undone}</p>
            <span className="ch-akg-rcpt__acts">
              <Button variant="ghost" onClick={onReset}>
                Put it back
              </Button>
            </span>
          </div>
        )}
        {phase === 'cancelled' && <p className="ch-akg-card__line">Cancelled. Nothing was created.</p>}
        {phase === 'superseded' && <p className="ch-akg-card__line">Set aside when you asked something else. Nothing was created.</p>}
        {phase === 'expired' && <p className="ch-akg-card__line">This draft can’t be confirmed any more. Ask again and I’ll prepare it.</p>}
      </div>
    </section>
  );
}

type Run = { undoAt: number | null; auto: boolean };

/** One capability: its card, a switch for every state, and Play, which runs the real sequence at real timing. */
function Specimen({ cap, initial, onlyDensity, initialVariant, autoplay, bare = false }: { cap: CapTask; initial?: CardPhase; onlyDensity?: CardDensity; initialVariant?: string; autoplay?: 'save' | 'undo'; bare?: boolean }) {
  const [phase, setPhase] = useState<CardPhase>(initial ?? 'proposed');
  const [variant, setVariant] = useState(initialVariant && cap.variants?.[initialVariant] ? initialVariant : 'base');
  const [phoneDensity, setPhoneDensity] = useState<CardDensity>(onlyDensity ?? 'full');
  const [run, setRun] = useState<Run | null>(autoplay ? { undoAt: autoplay === 'undo' ? 3 : null, auto: true } : null);
  const [left, setLeft] = useState(5);
  const heldAt = useRef(0);
  const phone = useChPhone();
  const chosen = variant === 'base' ? null : cap.variants?.[variant];
  // Edit mode. The gallery has no server to plan the card again, so it stands in for one: after a real pause it puts the
  // new value on the field's own row and raises the revision, or refuses with a reason when the switch says so.
  const [replanned, setReplanned] = useState<ActionProposal | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [refuse, setRefuse] = useState(false);
  const proposal = replanned ?? chosen?.proposal ?? cap.proposal;
  const canEdit = editableOf(chosen?.proposal ?? cap.proposal).length > 0;
  const sendEdit = (patch: Record<string, unknown>) => {
    setEditBusy(true);
    setEditError(null);
    setTimeout(() => {
      setEditBusy(false);
      if (refuse) setEditError('That would leave nobody to send it to.');
      else setReplanned(replan(proposal, patch));
    }, 900);
  };
  const roster = chosen?.roster ?? CAP_ROSTER;
  const copy = cardCopy(cap.tool, proposal);

  // The sequence between the coach's presses: the request, the hold's end, the save.
  useEffect(() => {
    if (!run) return;
    const after = (ms: number, next: () => void) => {
      const t = setTimeout(next, ms);
      return () => clearTimeout(t);
    };
    if (phase === 'proposed' && run.auto) return after(1400, () => setPhase('confirming'));
    if (phase === 'confirming')
      return after(700, () => {
        heldAt.current = performance.now();
        setLeft(HOLD_S);
        setPhase(copy.immediate ? 'saved' : 'held');
        if (copy.immediate) setRun(null);
      });
    if (phase === 'undoing') return after(450, () => (setPhase('undone'), setRun(null)));
    if (phase === 'committing') return after(520, () => (setPhase('saved'), setRun(null)));
    if (phase !== 'held') return;
    const tick = setInterval(() => {
      const gone = (performance.now() - heldAt.current) / 1000;
      if (run.undoAt != null && gone >= run.undoAt) setPhase('undoing');
      else if (gone >= HOLD_S) setPhase('committing');
      else setLeft(HOLD_S - gone);
    }, 100);
    return () => clearInterval(tick);
  }, [phase, run, copy.immediate]);

  const choose = (next: CardPhase) => {
    setRun(null);
    setLeft(5);
    setPhase(next);
    if (next !== 'proposed') setEditOpen(false);
  };
  const play = (undoAt: number | null) => {
    setPhase('proposed');
    setRun({ undoAt, auto: true });
  };
  const phases = CARD_PHASES.filter((p) => (copy.immediate ? !['held', 'undoing', 'committing', 'undone', 'partial'].includes(p) : p !== 'partial' || !!cap.partial));
  const card = (density: CardDensity) => (
    <StandInCard
      cap={cap}
      proposal={proposal}
      roster={roster}
      phase={phase}
      density={density}
      left={left}
      running={!!run}
      onConfirm={() => (setRun((r) => r ?? { undoAt: null, auto: false }), setPhase('confirming'))}
      onCancel={() => choose('cancelled')}
      onUndo={() => (setRun((r) => r ?? { undoAt: null, auto: false }), setPhase('undoing'))}
      onReset={() => choose('proposed')}
      edit={canEdit ? { open: editOpen, busy: editBusy, error: editError, onOpen: (o) => (setEditOpen(o), o || setEditError(null)), onEdit: sendEdit } : undefined}
    />
  );
  const stage = (
    <div className="ch-akg-spec__stage" data-both={onlyDensity || phone ? undefined : ''}>
      {onlyDensity ? (
        <div className="ch-akg-spec__col" data-density={onlyDensity}>
          {card(onlyDensity)}
        </div>
      ) : phone ? (
        <div className="ch-akg-spec__col" data-density={phoneDensity}>
          {card(phoneDensity)}
        </div>
      ) : (
        <>
          <div className="ch-akg-spec__col" data-density="full">
            <small>Ask</small>
            {card('full')}
          </div>
          <div className="ch-akg-spec__col" data-density="compact">
            <small>Quick chat</small>
            {card('compact')}
          </div>
        </>
      )}
    </div>
  );
  if (bare) return <div className="ch-akg-spec">{stage}</div>;
  return (
    <article className="ch-akg-spec" id={cap.tool} data-ch-cap={cap.tool}>
      <div className="ch-akg-spec__hd">
        <h3>
          {cap.ref}. {cap.name}
        </h3>
        <code>{cap.tool}</code>
        <span>{cap.surface}</span>
      </div>
      <div className="ch-akg-spec__bar">
        <Select<CardPhase> label={`State of ${cap.name}`} value={phase} options={phases.map((p) => ({ value: p, label: PHASE_WORDS[p] }))} onChange={choose} />
        {cap.variants && <Select label={`Case of ${cap.name}`} value={variant} options={[{ value: 'base', label: 'Typical' }, ...Object.entries(cap.variants).map(([value, v]) => ({ value, label: v.label }))]} onChange={(v) => (setVariant(v), setReplanned(null), choose('proposed'))} />}
        {phone && <Segmented<CardDensity> label="Where it is drawn" size="sm" value={phoneDensity} options={[{ value: 'full', label: 'Ask' }, { value: 'compact', label: 'Quick chat' }]} onChange={setPhoneDensity} />}
        <Button variant="secondary" size="sm" leftIcon={Play} onClick={() => play(null)}>
          Play
        </Button>
        {!copy.immediate && (
          <Button variant="ghost" size="sm" leftIcon={Undo2} onClick={() => play(3)}>
            Play with Undo
          </Button>
        )}
        {canEdit && phase === 'proposed' && <Switch label="The server refuses the edit" checked={refuse} onChange={setRefuse} />}
      </div>
      {canEdit && phase === 'proposed' && <p className="ch-akg-note">Press Edit on the card. The gallery stands in for the server: it changes the field’s own row after a real pause, where the server plans the whole card again.</p>}
      {stage}
    </article>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// The forms that are not task cards: drafts, notes, what an answer can show, the work line
// ---------------------------------------------------------------------------------------------------------------------

const HANDOFF_MESSAGE: AskHandoffData = { kind: 'message', players: [CAP_ROSTER[0]!.id, CAP_ROSTER[1]!.id, CAP_ROSTER[2]!.id], title: 'Draft for 3 players', draft: 'Nice work at Ridgeline. Your three cards are the ones counting for Sandhills, so post them hole by hole tonight and I will set the tee times in the morning.' };
const HANDOFF_POLL: AskHandoffData = { kind: 'poll', players: [], conversationId: 'c-travel', title: 'Poll for Travel squad', thread: 'Travel squad', draft: '', poll: { question: 'Which practice round time works on Thursday?', options: ['7:10 AM, before class', '12:40 PM', '3:30 PM, after the clinic'], closes: '2026-11-12T02:00:00.000Z' } };
const HANDOFF_BOARD: AskHandoffData = { kind: 'board', players: [CAP_ROSTER[1]!.id], title: 'Draft for Jonah Okafor', draft: 'This is the putting we talked about. Look at the 4 to 8 foot line.' };
const BRIEF: AskBriefData = {
  title: 'Thursday’s practice',
  questions: [
    { id: 'focus', title: 'What should it work on?', why: 'The team lost most strokes here over the last 8 rounds.', options: [{ id: 'putt', label: 'Putting inside 8 feet', hint: 'from the read' }, { id: 'app', label: 'Approach, 150 to 175' }, { id: 'short', label: TERMS.shortGame.long }], pick: ['putt'] },
    { id: 'len', title: 'How long?', options: [{ id: '90', label: '90 minutes' }, { id: '150', label: '2.5 hours', hint: 'your usual' }, { id: '180', label: '3 hours' }], pick: ['150'] },
    { id: 'who', title: 'Who is there?', multi: true, options: [{ id: 'all', label: 'All 8' }, { id: 'travel', label: 'Travel squad, 6' }], pick: ['all'] },
  ],
};

const still: Pick<WorkModel, 'present' | 'rows' | 'listOpen' | 'folding' | 'textReady' | 'open' | 'toggle'> = { present: true, rows: [], listOpen: false, folding: false, textReady: true, open: false, toggle: () => undefined };
const WORK_LINES: ReadonlyArray<{ label: string; working: boolean; line: WorkModel['line'] }> = [
  { label: 'First 1.2 seconds', working: true, line: { kind: 'none' } },
  { label: 'Thinking', working: true, line: { kind: 'words', text: 'Thinking' } },
  { label: 'A read after the answer began', working: true, line: { kind: 'running', text: 'Reading the rounds and statistics' } },
  { label: 'Across the team', working: true, line: { kind: 'running', text: 'Working it out across the team' } },
  { label: 'A card waits', working: false, line: { kind: 'words', text: 'Waiting for you' } },
  { label: 'Done', working: false, line: { kind: 'summary', text: '3 reads · 2s' } },
  { label: 'Done, with a calculation', working: false, line: { kind: 'summary', text: computedSummary(14, 4) } },
];

function Form({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <div className="ch-akg-form" id={id} data-ch-cap={id}>
      <small>{title}</small>
      {children}
      {note && <p>{note}</p>}
    </div>
  );
}
const Plain = ({ children }: { children: ReactNode }) => <div className="ch-akg-plain">{children}</div>;

const EVIDENCE: ReadonlyArray<{ id: string; title: string; envelope: ToolEnvelope }> = [
  { id: 'ev-figure', title: 'D1. A single figure, with its window and sample', envelope: ASK_EV_JONAH },
  { id: 'ev-ranking', title: 'D3. A ranking', envelope: ASK_EV_RANKING },
  { id: 'ev-trend', title: 'D4. A trend, round by round', envelope: ASK_EV_JONAH_TREND },
  { id: 'ev-bands', title: 'D6. A profile in bands', envelope: ASK_EV_SLOPE },
  { id: 'ev-legs', title: 'D7. Strokes gained by area', envelope: ASK_EV_JONAH_SG },
  { id: 'ev-empty', title: 'An empty read', envelope: ASK_EV_EMPTY },
  { id: 'ev-failed', title: 'A read that did not come back', envelope: ASK_EV_FAILED },
];

function forms(density: CardDensity): Record<string, { group: 'drafts' | 'notes' | 'answers' | 'work'; node: ReactNode }> {
  return {
    ask_practice_brief: { group: 'drafts', node: <Form id="ask_practice_brief" title="B1. Practice brief"><Plain><BriefBody brief={BRIEF} density={density} /></Plain></Form> },
    draft_practice_plan: { group: 'drafts', node: <Form id="draft_practice_plan" title="B2. Practice plan draft" note="The practice lane’s own plan card, mounted as it is."><PlanCard plan={PP_PLAN_PART} onSend={() => undefined} /></Form> },
    write_artifact: { group: 'drafts', node: <Form id="write_artifact" title="B3. A long document"><Plain><DocBody doc={{ kind: 'player_report', title: 'Eli Brandt: fall review', at: '2026-11-10T21:04:00.000Z', body: CAP_TASKS.find((t) => t.tool === 'publish_artifact')?.proposal.facts.find((f) => f.label === 'Words')?.value ?? '' }} density={density} /></Plain></Form> },
    draft_message: { group: 'drafts', node: <Form id="draft_message" title="B4. A message draft"><Plain><HandoffBody handoff={HANDOFF_MESSAGE} roster={CAP_ROSTER} density={density} /></Plain></Form> },
    draft_poll: { group: 'drafts', node: <Form id="draft_poll" title="B5. A poll draft"><Plain><HandoffBody handoff={HANDOFF_POLL} roster={CAP_ROSTER} density={density} timeZone="America/Chicago" /></Plain></Form> },
    draft_board: { group: 'drafts', node: <Form id="draft_board" title="B6. A board for a player"><Plain><HandoffBody handoff={HANDOFF_BOARD} roster={CAP_ROSTER} density={density} tiles={[{ label: 'Make rate, 4 to 8 ft', value: '47%' }, { label: 'Team', value: '58%' }, { label: 'Three putts a round', value: '2.4' }, { label: 'Putts a round', value: '31.2' }]} /></Plain></Form> },
    save_note: { group: 'notes', node: <Form id="save_note" title="C. A note, saved"><CoachNoteChip note={{ op: 'saved', note_id: 'n1', text: 'Qualifying is 54 holes and the low four count.' }} onRemove={() => undefined} /></Form> },
    save_note_long: { group: 'notes', node: <Form id="save_note_long" title="C. A long note, saved"><CoachNoteChip note={{ op: 'saved', note_id: 'n2', text: 'When I ask about putting, always split it inside 8 feet and outside 20 feet, lead with the make rate and the number of attempts, and compare to the team before you compare to Tour, because that is the conversation I have with the players on Mondays.' }} onRemove={() => undefined} /></Form> },
    remove_note: { group: 'notes', node: <Form id="remove_note" title="C. A note, removed"><CoachNoteChip note={{ op: 'removed', note_id: 'n1', text: 'Qualifying is 54 holes and the low four count.' }} /></Form> },
    ...Object.fromEntries(EVIDENCE.map((e) => [e.id, { group: 'answers' as const, node: <Form id={e.id} title={e.title}><AskEvidenceView envelope={e.envelope} roster={[]} /></Form> }])),
    app_link: { group: 'answers', node: <Form id="app_link" title="D14. A link into the app"><AppLinkRow link={{ label: 'Open Roster requests', href: '#app_link', purpose: 'Players who asked to join, waiting for you.' }} /><AppLinkRow link={{ label: 'Open Stats for Eli Brandt', href: '#app_link' }} /></Form> },
    computed: { group: 'answers', node: <Form id="computed" title="D15. Worked out across the team" note="Built against a typed stub: the engine emits nothing for a calculation yet (E-25)."><Plain><WorkedOut computed={{ method: 'Averaged each player’s putts per round over their last 8 counting rounds, then ranked the team from fewest to most.', players: 14, reads: 14, rounds: 212, window: 'Sep 1 to Nov 9 · counting rounds only' }} /></Plain></Form> },
    not_tracked: { group: 'answers', node: <Form id="not_tracked" title="D16. “That isn’t tracked”" note="Built against a typed stub (E-26); today it is prose only."><NotTracked part={{ what: 'club used off the tee', nearest: ['Fairways hit', 'Driving distance', 'Penalty strokes off the tee'] }} /></Form> },
    work_line: {
      group: 'work',
      node: (
        <Form id="work_line" title="F. The work line, drawn by the shell’s own component">
          <Plain>
            <table className="ch-akg-words">
              <tbody>
                {WORK_LINES.map((w) => (
                  <tr key={w.label}>
                    <th scope="row">{w.label}</th>
                    <td>
                      <span className="ch-akg-work">
                        <CoachMark working={w.working} />
                        <b>CoachHelm</b>
                        <WorkLine work={{ ...still, line: w.line }} listId={`akg-${w.label}`} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Plain>
        </Form>
      ),
    },
    work_words: {
      group: 'work',
      node: (
        <Form id="work_words" title="F. Every word the work line can say">
          <Plain>
            <table className="ch-akg-words">
              <tbody>
                {WORK_KINDS.map((k) => (
                  <tr key={k.id}>
                    <th scope="row">
                      {k.kind}
                      <br />
                      <Badge tone={k.mark === 'turning' ? 'accent' : 'neutral'}>Mark {k.mark}</Badge>
                    </th>
                    <td>
                      {k.words.map((w) => (
                        <span key={w}>
                          <Badge>{w}</Badge>
                        </span>
                      ))}
                      {k.after && <p className="ch-akc-meta">Then: {k.after}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Plain>
        </Form>
      ),
    },
  };
}

const GROUPS: ReadonlyArray<{ id: 'drafts' | 'notes' | 'answers' | 'work'; title: string; lede: string }> = [
  { id: 'drafts', title: 'B. Drafts and hand-offs', lede: 'Cards that write nothing. Each says so first, then shows the draft as the place it is going will show it.' },
  { id: 'notes', title: 'C. Standing notes', lede: 'The one write with no Confirm: the coach’s own sentence. The chip is the proof and the undo.' },
  { id: 'answers', title: 'D. What an answer can show', lede: 'Evidence behind a figure’s marker (the lead’s own evidence blocks, with this catalogue’s fixtures), a link into the app, a calculation, and “that isn’t tracked”.' },
  { id: 'work', title: 'F. Thinking and working', lede: 'The mark turns while anything is live. The work line is the only place status is said. No tool name is ever shown.' },
];

export function PreviewChatCapabilities({ task, state, density, variant, play }: { task?: string; state?: string; density?: string; variant?: string; play?: string }) {
  const only: CardDensity | undefined = density === 'compact' ? 'compact' : density === 'full' ? 'full' : undefined;
  const one = capTask(task);
  if (one) {
    return (
      <div className="ch-akg ch-akg--one" data-ch-capabilities="one">
        <Specimen cap={one} initial={isPhase(state) ? state : 'proposed'} onlyDensity={only ?? 'full'} initialVariant={variant} autoplay={play === 'undo' ? 'undo' : play ? 'save' : undefined} bare />
      </div>
    );
  }
  const frame = (cap: CapTask, phase: CardPhase, left: number, d: CardDensity) => <StandInCard cap={cap} proposal={cap.proposal} roster={CAP_ROSTER} phase={phase} density={d} left={left} running={phase === 'held'} onConfirm={() => undefined} onCancel={() => undefined} onUndo={() => undefined} onReset={() => undefined} />;
  const [plate, which] = (task ?? '').split(':');
  const specimen = plate === 'studio' ? studioSpecimen(which) : undefined;
  if (specimen) {
    return (
      <div className="ch-akg ch-akg--one" data-ch-capabilities="one" data-density={only ?? 'full'}>
        <StudioSpecimenView specimen={specimen} only={only ?? 'full'} bare />
      </div>
    );
  }
  if (plate === 'batch') {
    return (
      <div className="ch-akg ch-akg--one" data-ch-capabilities="one" data-density={only ?? 'full'}>
        <BatchPlate initial={state} autoplay={!!play} density={only ?? 'full'} renderCard={frame} />
      </div>
    );
  }
  if (plate === 'workspace' && isWorkspaceSequence(which)) {
    return (
      <div className="ch-akg ch-akg--one" data-ch-capabilities="one" data-density={only ?? 'full'}>
        <WorkspacePlate sequence={which} autoplay={!!play} density={only ?? 'full'} at={state && Number.isFinite(Number(state)) ? Number(state) : undefined} />
      </div>
    );
  }
  const all = forms(only ?? 'full');
  if (task && all[task]) {
    return (
      <div className="ch-akg ch-akg--one" data-ch-capabilities="one" data-density={only ?? 'full'}>
        {all[task]!.node}
      </div>
    );
  }
  return (
    <div className="ch-akg" data-ch-capabilities="all">
      <header className="ch-akg__intro">
        <h1>Everything CoachHelm can do, and what you check first</h1>
        <p>
          Every action the assistant can take in the app, as the card a coach confirms: who it reaches, the thing itself, the exact words anyone receives, and the proof afterwards. Switch any card to any state, or press Play to watch it run: Confirm, 8 seconds of Undo,
          saved.
        </p>
        <p className="ch-akg-note">The frame, buttons and ring here stand in for the chat’s real card shell, built to the same spec. What is inside each card is the real thing.</p>
        <nav className="ch-akg__nav" aria-label="Sections">
          <Button variant="secondary" size="sm" href="#tasks">
            A. Tasks, {CAP_TASKS.length}
          </Button>
          <Button variant="secondary" size="sm" href="#several">
            Several at once
          </Button>
          {GROUPS.map((g) => (
            <Button key={g.id} variant="secondary" size="sm" href={`#${g.id}`}>
              {g.title}
            </Button>
          ))}
          <Button variant="secondary" size="sm" href="#studio">
            S. The studio
          </Button>
          <Button variant="secondary" size="sm" href="#workspace">
            W. The workspace
          </Button>
        </nav>
      </header>
      <section className="ch-akg__group" id="tasks">
        <header>
          <h2>A. Tasks</h2>
          <p>Each shows a card first. Nothing is written before Confirm, and nothing is final until the ring closes.</p>
        </header>
        {CAP_TASKS.map((cap) => (
          <Specimen key={cap.tool} cap={cap} />
        ))}
      </section>
      <section className="ch-akg__group" id="several">
        <header>
          <h2>Several cards in one answer</h2>
          <p>Each card is still decided on its own. One bar approves the ones that are safe to approve together, says what that does in total, and leaves out any card that should be read on its own, with the reason.</p>
        </header>
        <BatchPlate density={only ?? 'full'} renderCard={frame} />
      </section>
      {GROUPS.map((g) => (
        <section key={g.id} className="ch-akg__group" id={g.id}>
          <header>
            <h2>{g.title}</h2>
            <p>{g.lede}</p>
          </header>
          <div className="ch-akg-forms" data-group={g.id}>
            {Object.values(all)
              .filter((f) => f.group === g.id)
              .map((f, i) => (
                <div key={i}>{f.node}</div>
              ))}
          </div>
        </section>
      ))}
      <section className="ch-akg__group" id="studio">
        <header>
          <h2>S. The studio</h2>
          <p>The fixed set of things CoachHelm can put on screen. The assistant never invents interface: it fills a typed part, the server fills every figure from a read, and one of these components draws it. Tap an element to ask about it; the arrow at a row’s end opens it in the app.</p>
        </header>
        <StudioSection />
      </section>
      <section className="ch-akg__group" id="workspace">
        <header>
          <h2>W. The workspace</h2>
          <p>What CoachHelm is doing, in a person’s words, on the chat’s own activity island. Press Play to watch two long pieces of work at real timing: players join the row as their rounds are read, the tally counts, and a finished step opens what it read.</p>
        </header>
        {(Object.keys(WORKSPACE_SEQUENCES) as WorkspaceSequence[]).map((s) => (
          <WorkspacePlate key={s} sequence={s} density={only ?? 'full'} />
        ))}
      </section>
    </div>
  );
}
