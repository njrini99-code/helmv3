'use client';

import { Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AskAssistantTurn, AskStep, AskStepSubject } from '../data/coachhelm-chat-thread';
import { ApproveAll, batchPlan, type BatchPhase, type WaitingCard } from '../screens/coachhelm/chat/cards/ApproveAll';
import type { CardDensity, CardPhase } from '../screens/coachhelm/chat/cards';
import { ActivityIsland } from '../screens/coachhelm/chat/island/ActivityIsland';
import { islandModel } from '../screens/coachhelm/chat/island/model';
import type { Island } from '../screens/coachhelm/chat/island/useIsland';
import { Studio, askRef, type StudioAsk, type StudioSize } from '../screens/coachhelm/chat/studio';
import { MissCompassGate } from '../screens/coachhelm/chat/studio/compass-gate';
import { useChPhone } from '../lib/use-phone';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { Select } from '../ui/Select';
import { CAP_ROSTER, capTask, type CapTask } from './fixtures-chat-capabilities';
import { STUDIO_SPECIMENS, studioSpecimen, type StudioSpecimen } from './fixtures-chat-studio';
import { formatFixed } from '../lib/format';

/**
 * The gallery's plates that are not one task card (CAPABILITIES.md, "What is built"): every studio component in both
 * sizes with what a tap asks, several cards decided together, and the workspace playing two long pieces of work at
 * real timing on the chat lead's own island. Preview only: nothing here signs in, sends or calls a model.
 */

// ---------------------------------------------------------------------------------------------------------------------
// The studio: every component, both sizes, and what tapping an element asks
// ---------------------------------------------------------------------------------------------------------------------

export function StudioSpecimenView({ specimen, only, bare = false }: { specimen: StudioSpecimen; only?: StudioSize; bare?: boolean }) {
  const [asked, setAsked] = useState<StudioAsk | null>(null);
  const [phoneSize, setPhoneSize] = useState<StudioSize>(only ?? 'full');
  const phone = useChPhone();
  const studio = (size: StudioSize) => <Studio part={specimen.part} size={size} read={specimen.read} onAsk={setAsked} roster={CAP_ROSTER} />;
  // The Miss Compass's specimen draws with its team flag on; "Ask about these shots" shows what it would send, and sends nothing.
  const compass = {
    on: true,
    askAbout: (words: string, about: { evidence_ref: string; key: string }) => {
      setAsked({ kind: specimen.kind, read: about.evidence_ref, key: about.key, words });
      return true;
    },
  };
  const draw = (size: StudioSize) => (
    <div className="ch-akg-plain">{specimen.compass ? <MissCompassGate.Provider value={compass}>{studio(size)}</MissCompassGate.Provider> : studio(size)}</div>
  );
  const one = only ?? (phone ? phoneSize : null);
  const stage = (
    <div className="ch-akg-spec__stage" data-both={one ? undefined : ''}>
      {one ? (
        <div className="ch-akg-spec__col" data-density={one}>
          {draw(one)}
        </div>
      ) : (
        <>
          <div className="ch-akg-spec__col" data-density="full">
            <small>Ask</small>
            {draw('full')}
          </div>
          <div className="ch-akg-spec__col" data-density="compact">
            <small>Quick chat</small>
            {draw('compact')}
          </div>
        </>
      )}
    </div>
  );
  const readout = (
    <p className="ch-akg-asked" role="status">
      {asked ? (
        <>
          The composer is filled with <q>{asked.words}</q> and nothing is sent. Reference <code>{askRef(asked)}</code>
        </>
      ) : (
        'Tap an element to see what it asks. The arrow at a row’s end opens that thing in the app.'
      )}
    </p>
  );
  if (bare)
    return (
      <div className="ch-akg-spec" data-ch-studio={specimen.id}>
        {stage}
        {readout}
      </div>
    );
  return (
    <article className="ch-akg-spec" id={`studio-${specimen.id}`} data-ch-studio={specimen.id}>
      <div className="ch-akg-spec__hd">
        <h3>{specimen.title}</h3>
        <code>{specimen.part.kind}</code>
      </div>
      {phone && !only && (
        <div className="ch-akg-spec__bar">
          <Segmented<StudioSize> label="Where it is drawn" size="sm" value={phoneSize} options={[{ value: 'full', label: 'Ask' }, { value: 'compact', label: 'Quick chat' }]} onChange={setPhoneSize} />
        </div>
      )}
      {specimen.note && <p className="ch-akg-note">{specimen.note}</p>}
      {stage}
      {readout}
    </article>
  );
}

export function StudioSection() {
  return (
    <>
      {STUDIO_SPECIMENS.map((s) => (
        <StudioSpecimenView key={s.id} specimen={s} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Several cards in one turn, and the one safe "approve all"
// ---------------------------------------------------------------------------------------------------------------------

const BATCH_TOOLS = ['create_event', 'create_team_announcement', 'create_goal', 'lock_lineup'] as const;
const BATCH_HOLD_S = 8;
const BATCH_WORDS: Record<BatchPhase, string> = { waiting: 'Waiting for you', confirming: 'Approving', held: 'Held: one Undo window', saved: 'All saved', undone: 'All undone', stopped: 'Stopped at a failure' };
const isBatchPhase = (s: string | undefined): s is BatchPhase => !!s && s in BATCH_WORDS;

export function BatchPlate({ initial, autoplay = false, density, renderCard }: { initial?: string; autoplay?: boolean; density: CardDensity; /** The gallery's card frame, so a card here is the card of the first section. */ renderCard: (cap: CapTask, phase: CardPhase, left: number, density: CardDensity) => ReactNode }) {
  const caps = BATCH_TOOLS.map((t) => capTask(t)).filter((c): c is CapTask => !!c);
  const cards: WaitingCard[] = caps.map((c) => ({ key: c.tool, tool: c.tool, proposal: c.proposal }));
  const plan = batchPlan(cards);
  const going = new Set(plan.go.map((g) => g.key));
  const [phase, setPhase] = useState<BatchPhase>(isBatchPhase(initial) ? initial : 'waiting');
  const [left, setLeft] = useState(5);
  const [run, setRun] = useState(autoplay);
  const heldAt = useRef(0);

  useEffect(() => {
    if (!run) return;
    if (phase === 'waiting') {
      const t = setTimeout(() => setPhase('confirming'), 1400);
      return () => clearTimeout(t);
    }
    if (phase === 'confirming') {
      const t = setTimeout(() => {
        heldAt.current = performance.now();
        setLeft(BATCH_HOLD_S);
        setPhase('held');
      }, 700);
      return () => clearTimeout(t);
    }
    if (phase !== 'held') return;
    const tick = setInterval(() => {
      const gone = (performance.now() - heldAt.current) / 1000;
      if (gone >= BATCH_HOLD_S) {
        setPhase('saved');
        setRun(false);
      } else setLeft(BATCH_HOLD_S - gone);
    }, 100);
    return () => clearInterval(tick);
  }, [phase, run]);

  const choose = (next: BatchPhase) => {
    setRun(false);
    setLeft(5);
    setPhase(next);
  };
  // What each card shows while the batch runs: the ones going ahead move together, the rest wait untouched.
  const cardPhase = (key: string): CardPhase => {
    if (!going.has(key)) return 'proposed';
    if (phase === 'waiting') return 'proposed';
    if (phase === 'confirming') return 'confirming';
    if (phase === 'held') return 'held';
    if (phase === 'undone') return 'undone';
    if (phase === 'saved') return 'saved';
    const at = plan.go.findIndex((g) => g.key === key);
    return at === 0 ? 'saved' : at === 1 ? 'failed' : 'proposed';
  };
  return (
    <article className="ch-akg-spec" id="batch" data-ch-batch={phase}>
      <div className="ch-akg-spec__hd">
        <h3>Four cards in one answer</h3>
        <span>“Set up Thursday: the practice, tell the team, a putting goal for Jonah, and lock the lineup.”</span>
      </div>
      <div className="ch-akg-spec__bar">
        <Select<BatchPhase> label="State of the batch" value={phase} options={(Object.keys(BATCH_WORDS) as BatchPhase[]).map((p) => ({ value: p, label: BATCH_WORDS[p] }))} onChange={choose} />
        <Button variant="secondary" size="sm" leftIcon={Play} onClick={() => (setPhase('waiting'), setRun(true))}>
          Play
        </Button>
      </div>
      <div className="ch-akg-batch" data-density={density}>
        {caps.map((c) => (
          <div key={c.tool}>{renderCard(c, cardPhase(c.tool), left, density)}</div>
        ))}
        <ApproveAll
          cards={cards}
          phase={phase}
          seconds={Math.ceil(left)}
          stoppedAt={phase === 'stopped' ? { head: plan.go[1]?.head ?? '', reopened: Math.max(0, plan.go.length - 2) } : null}
          onApproveAll={() => (setRun(true), setPhase('confirming'))}
          onUndoAll={() => choose('undone')}
        />
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// The workspace: two long pieces of work, played at real timing on the lead's island
// ---------------------------------------------------------------------------------------------------------------------

interface StepPlan {
  id: string;
  label: string;
  done: string;
  kind: NonNullable<AskStep['kind']>;
  parent?: string;
  /** Seconds from the start of the turn. */
  from: number;
  to: number;
  detail?: string;
  subjects?: AskStepSubject[];
  count?: { unit: string; to: number };
  covers?: { n: number; of: number; unit: string };
  /** The read it produced, and the studio specimen that read is drawn as when the finished step is opened. */
  ref?: string;
  opens?: string;
}

const TWELVE = ['Eli Brandt', 'Jonah Okafor', 'Priya Natarajan', 'Theo Marchetti', 'Sam Whitfield', 'Sofia Alvarez', 'Ava Lindqvist', 'Owen Park', 'Marcus Delacroix', 'Leo Tanaka', 'Noor Haddad', 'Wes Callahan'];
const squad: AskStepSubject[] = TWELVE.map((label, i) => ({ kind: 'player', id: `p-${i}`, label }));

export const WORKSPACE_SEQUENCES = {
  team: {
    title: 'A whole-team comparison',
    question: 'Across the whole team, who is losing strokes on the greens, and how do they compare?',
    writing: 2.6,
    lands: 'comparison',
    steps: [
      { id: 't0', label: 'Working it out across the team', done: 'Worked it out across the team', kind: 'calculate', from: 0, to: 7.2, covers: { n: 12, of: 12, unit: 'players' } },
      { id: 't1', label: 'Reading the roster', done: 'Read the roster', kind: 'read', parent: 't0', from: 0.3, to: 1.0, detail: '12 active players' },
      { id: 't2', label: 'Reading every player’s rounds', done: 'Read every player’s rounds', kind: 'read', parent: 't0', from: 1.1, to: 4.6, subjects: squad, count: { unit: 'rounds', to: 96 }, ref: 'e1', opens: 'table' },
      { id: 't3', label: 'Comparing strokes gained putting', done: 'Compared strokes gained putting', kind: 'compare', parent: 't0', from: 4.7, to: 5.9, detail: '12 players, 4 measures', ref: 'e2', opens: 'ranking' },
      { id: 't4', label: 'Drawing the comparison', done: 'Drew the comparison', kind: 'visual', parent: 't0', from: 6.0, to: 6.9, detail: '12 players across 4 measures', ref: 'e3', opens: 'comparison' },
    ],
  },
  plan: {
    title: 'A practice plan being drafted',
    question: 'Draft Thursday’s practice around what the team needs most.',
    writing: 1.8,
    lands: 'practice_plan',
    steps: [
      { id: 'p1', label: 'Reading Thursday on the calendar', done: 'Read Thursday on the calendar', kind: 'read', from: 0, to: 0.8, detail: '3 to 5:30 PM, Ridgeline practice green', subjects: [{ kind: 'event', id: 'e1', label: 'Short game practice' }], ref: 'e1', opens: 'schedule' },
      { id: 'p2', label: 'Reading who is available', done: 'Read who is available', kind: 'read', from: 0.8, to: 1.7, detail: '8 of 8 players', subjects: squad.slice(0, 8) },
      { id: 'p3', label: 'Finding where the team loses strokes', done: 'Found where the team loses strokes', kind: 'find', from: 1.7, to: 3.6, count: { unit: 'rounds', to: 38 }, ref: 'e2', opens: 'strokes_gained' },
      { id: 'p4', label: 'Choosing drills from your library', done: 'Chose drills from your library', kind: 'find', from: 3.6, to: 5.0, count: { unit: 'drills', to: 6 } },
      { id: 'p5', label: 'Drafting the plan', done: 'Drafted the plan', kind: 'draft', from: 5.0, to: 8.4, subjects: [{ kind: 'plan', id: 'pl', label: 'Thursday’s practice' }], count: { unit: 'blocks', to: 5 } },
      { id: 'p6', label: 'Checking it fits the time', done: 'Checked it fits the time', kind: 'check', from: 8.4, to: 9.0, detail: '2 hours 30 minutes' },
    ],
  },
} as const satisfies Record<string, { title: string; question: string; writing: number; lands: string; steps: readonly StepPlan[] }>;
export type WorkspaceSequence = keyof typeof WORKSPACE_SEQUENCES;
export const isWorkspaceSequence = (s: string | undefined): s is WorkspaceSequence => !!s && s in WORKSPACE_SEQUENCES;

/** The steps as the engine would have reported them `t` seconds in: started ones only, faces and tallies as far as they have got. */
export function stepsAt(plan: readonly StepPlan[], t: number): AskStep[] {
  const stamp = (s: number) => new Date(Date.UTC(2026, 10, 10, 15, 0, 0) + s * 1000).toISOString();
  return plan
    .filter((s) => t >= s.from)
    .map((s) => {
      const over = t >= s.to;
      const share = over ? 1 : (t - s.from) / (s.to - s.from);
      return {
        id: s.id,
        label: s.label,
        done: s.done,
        kind: s.kind,
        parentId: s.parent,
        state: over ? 'done' : 'active',
        detail: over ? s.detail : undefined,
        subjects: s.subjects ? s.subjects.slice(0, Math.max(1, Math.ceil(share * s.subjects.length))) : undefined,
        count: s.count ? { n: Math.round(share * s.count.to), unit: s.count.unit, more: !over } : undefined,
        covers: s.covers,
        ref: s.ref,
        startedAt: stamp(s.from),
        endedAt: over ? stamp(s.to) : undefined,
      } satisfies AskStep;
    });
}

export function WorkspacePlate({ sequence, autoplay = false, density, at }: { sequence: WorkspaceSequence; autoplay?: boolean; density: CardDensity; /** A still frame, in seconds, for a capture. */ at?: number }) {
  const seq = WORKSPACE_SEQUENCES[sequence];
  const steps: readonly StepPlan[] = seq.steps;
  const worked = Math.max(...steps.map((s) => s.to));
  const end = worked + seq.writing;
  const [t, setT] = useState(at ?? (autoplay ? 0 : end + 1));
  const [playing, setPlaying] = useState(autoplay && at === undefined);
  const [open, setOpen] = useState(true);
  const [opened, setOpened] = useState<{ label: string; specimen: StudioSpecimen | undefined } | null>(null);
  const began = useRef(0);

  useEffect(() => {
    if (!playing) return;
    began.current = performance.now();
    const tick = setInterval(() => {
      const now = (performance.now() - began.current) / 1000;
      setT(now);
      if (now > end + 0.2) setPlaying(false);
    }, 100);
    return () => clearInterval(tick);
  }, [playing, end]);

  const live = t <= end;
  const turn = { id: `workspace-${sequence}`, steps: stepsAt(steps, t) } as unknown as AskAssistantTurn;
  const model = islandModel(turn, { live, hasText: live && t > worked, waitingForCoach: false, seconds: Math.round(end), ended: false });
  const island: Island = {
    model,
    open,
    pinned: !live,
    since: live && playing ? began.current : null,
    toggle: () => setOpen((v) => !v),
    // In the thread a press outside folds the island. Here it stays open so every step can be watched to the end.
    close: () => undefined,
    openFor: () => setOpen(true),
  };
  const landed = !live || t > (steps.find((s) => s.kind === 'visual' || s.kind === 'draft')?.to ?? worked);
  const lands = studioSpecimen(seq.lands);
  return (
    <article className="ch-akg-spec" id={`workspace-${sequence}`} data-ch-workspace={sequence} data-live={live ? '' : undefined}>
      <div className="ch-akg-spec__hd">
        <h3>{seq.title}</h3>
        <span>“{seq.question}”</span>
      </div>
      <div className="ch-akg-spec__bar">
        <Button variant="secondary" size="sm" leftIcon={playing ? RotateCcw : Play} onClick={() => (setOpened(null), setT(0), setOpen(true), setPlaying(false), requestAnimationFrame(() => setPlaying(true)))}>
          {playing ? 'Start again' : 'Play'}
        </Button>
        <span className="ch-akg-note ch-num">
          {formatFixed(worked, 1)} seconds of work, then {formatFixed(seq.writing, 1)} of writing. Real timing.
        </span>
      </div>
      <div className="ch-akg-isl" data-density={density}>
        <ActivityIsland island={island} density={density} onOpenStep={(_, ref, label) => setOpened({ label, specimen: studioSpecimen(steps.find((s) => s.ref === ref)?.opens) })} />
      </div>
      {opened && (
        <div className="ch-akg-plain" data-ch-opened="">
          <p className="ch-akg-note">Opening “{opened.label}” shows what it read:</p>
          {opened.specimen ? <Studio part={opened.specimen.part} size={density} read={opened.specimen.read} /> : <p className="ch-akc-meta">This step has nothing of its own to open.</p>}
        </div>
      )}
      {landed && lands && (
        <div className="ch-akg-plain" data-ch-landed="">
          <p className="ch-akg-note">What the work lands as, under the answer:</p>
          <Studio part={lands.part} size={density} read={lands.read} />
        </div>
      )}
    </article>
  );
}
