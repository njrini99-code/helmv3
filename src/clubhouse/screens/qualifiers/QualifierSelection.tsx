'use client';

import { Check, ChevronLeft, Flag, ListChecks, Lock, Pencil, UserMinus, UserPlus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChQCandidate, ChQSelectionData } from '../../data/qualifiers';
import { Avatar } from '../../ui/Avatar';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { normalise, useAction } from '../../lib/use-action';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop } from '../../shell/phone-chrome';
import { plural } from './model';
import { ToPar } from './parts';
import { LIVE_SELECTION_WRITES, startSelecting, type ChQSelectionWrites } from './writes';
import '../../styles/qualifiers.css';

const LIST = '/golf/dashboard/qualifiers';

/** Where the selection stands, as the coach reads it. */
const STAGE: Record<ChQSelectionData['selectionState'], 0 | 1 | 2> = { open: 0, scoring: 0, closed: 1, selected: 2 };
const STAGES = ['Standings', 'Coach’s picks', 'Squad confirmed'] as const;

/**
 * Manage selections (the v2 detail's "Manage selections", coach only): who
 * makes the trip. The places decided on score come from the standings when
 * the squad is confirmed; the coach fills the discretionary picks, each with
 * a reason, then confirms, and the players are told. On the live selection
 * actions (EXISTING); the order is one way: start selecting, pick, confirm.
 */
export function QualifierSelection({ data, writes = LIVE_SELECTION_WRITES }: { data: ChQSelectionData; writes?: ChQSelectionWrites }) {
  const router = useRouter();
  const phone = useChPhone();
  const detailHref = `${LIST}/${data.id}`;
  const [state, setState] = useState(data.selectionState);
  const [cands, setCands] = useState(data.candidates);
  useEffect(() => setState(data.selectionState), [data.selectionState]);
  useEffect(() => setCands(data.candidates), [data.candidates]);

  const [asking, setAsking] = useState<'start' | 'confirm' | null>(null);
  const [choosing, setChoosing] = useState<{ playerId: string | null } | null>(null);
  const [removing, setRemoving] = useState<ChQCandidate | null>(null);

  const topN = Math.max(0, data.squad - data.picks);
  const stage = STAGE[state];
  // Once confirmed, the squad is what was committed; before, the places on score are the standings' top places.
  // A pick is never also counted on score.
  const onScore = cands.filter((c) => !c.pick && (stage === 2 ? c.selected : c.onScore)).sort(byRank);
  const picks = cands.filter((c) => c.pick);
  const eligible = cands.filter((c) => c.rank != null && !c.onScore && !c.pick).sort(byRank);
  const unranked = cands.filter((c) => c.rank == null && !c.pick);
  const picksReady = picks.length === data.picks && picks.every((p) => (p.pick?.reasoning ?? '').trim().length > 0);
  const nobody = onScore.length + picks.length === 0;
  const canConfirm = state === 'closed' && picksReady && !nobody;

  // What follows a landed write is part of the action, not of the button that started it, so the toast's Retry
  // (which runs the action again) finishes the job too: the step moves on, the question closes, the page re-reads.
  const start = useAction(
    'qualifiers.startSelecting',
    async () => {
      const res = await startSelecting(data.id, state, writes.advance);
      if (normalise(res).success) {
        setState('closed');
        setAsking(null);
        router.refresh();
      }
      return res;
    },
    {
      done: 'Selecting is open · choose your picks',
      failed: 'Couldn’t start selecting',
      hint: 'Nothing changed. Try again.',
      code: 'CH-09005',
    },
  );
  const confirm = useAction(
    'qualifiers.confirmSquad',
    async () => {
      const res = await writes.confirm(data.id);
      if (normalise(res).success) {
        setState('selected');
        setAsking(null);
        router.push(detailHref);
        router.refresh();
      }
      return res;
    },
    {
      done: `Squad confirmed · ${plural(onScore.length + picks.length, 'player')} told`,
      failed: 'Couldn’t confirm the squad',
      hint: 'Nothing was confirmed and nobody was told. Try again.',
      code: 'CH-09008',
    },
  );
  const remove = useAction(
    'qualifiers.removePick',
    async (c: ChQCandidate) => {
      const res = await writes.removePick(data.id, c.playerId);
      if (normalise(res).success) {
        setCands((cur) => cur.map((x) => (x.playerId === c.playerId ? { ...x, pick: null } : x)));
        setRemoving(null);
        router.refresh();
      }
      return res;
    },
    (c: ChQCandidate) => ({
      done: `${c.name} removed as a pick`,
      failed: `Couldn’t remove ${c.name} as a pick`,
      hint: 'They are still a pick. Try again.',
      code: 'CH-09007',
    }),
  );

  const next = stage === 0 ? 'start' : stage === 1 ? 'confirm' : null;
  const primary =
    next === 'start' ? (
      <Button variant="primary" leftIcon={ListChecks} feel="warning" onClick={() => ask('start')}>
        Start selecting
      </Button>
    ) : next === 'confirm' ? (
      <Button variant="primary" leftIcon={Check} feel="warning" disabled={!canConfirm} onClick={() => ask('confirm')}>
        Confirm squad
      </Button>
    ) : null;

  function ask(what: 'start' | 'confirm') {
    chTrail(`qualifiers ${what} ask`);
    setAsking(what);
  }

  return (
    <main className="ch-qf ch-qfs">
      {phone && <PhoneTop title="Selections" back={{ label: 'Qualifier', onBack: () => router.push(detailHref) }} />}
      <div className="ch-qf-back">
        <Button size="sm" variant="ghost" leftIcon={ChevronLeft} href={detailHref}>
          Qualifier
        </Button>
      </div>
      <header className="ch-qf-head">
        <div>
          <span className="ch-qf-eyebrow">Manage selections</span>
          <h1>{data.name}</h1>
          <p className="ch-num">
            {data.squad}-player squad · {topN} on score{data.picks ? ` · ${plural(data.picks, 'coach’s pick', 'coach’s picks')}` : ''}
          </p>
        </div>
        {primary && <div className="ch-qf-head__act">{primary}</div>}
      </header>

      <ol className="ch-qfs-steps" aria-label="Selection steps">
        {STAGES.map((label, i) => (
          <li key={label} className={i < stage ? 'is-done' : i === stage ? 'is-now' : undefined} aria-current={i === stage ? 'step' : undefined}>
            <span className="ch-qfs-steps__n ch-num">{i < stage || stage === 2 ? <Icon icon={Check} size={13} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <StageNote stage={stage} topN={topN} picks={data.picks} picksReady={picksReady} nobody={nobody} />

      <SectionBoundary surface="qualifiers.selection" label="Selections" code="CH-09219">
        <div className="ch-qf-body">
          <div className="ch-qf-col">
            <section className="ch-qf-panel" aria-labelledby="ch-qfs-score">
              <div className="ch-qf-panel__head">
                <div>
                  <h2 id="ch-qfs-score">{stage === 2 ? 'Qualified on score' : 'On score now'}</h2>
                  <p className="ch-num">
                    {stage === 2 ? plural(onScore.length, 'player') : `Top ${topN} in the standings · set when you confirm`}
                  </p>
                </div>
              </div>
              {onScore.length ? (
                <ol className="ch-qf-list">
                  {onScore.map((c) => (
                    <Row key={c.playerId} c={c} />
                  ))}
                </ol>
              ) : (
                <EmptyState
                  compact
                  code="CH-09316"
                  icon={Flag}
                  title={topN ? 'Nobody has a score in yet.' : 'Every place is a coach’s pick.'}
                  body={topN ? 'Places on score fill from the standings as rounds are signed.' : 'This squad has no places decided on score.'}
                />
              )}
            </section>

            {stage < 2 && (eligible.length > 0 || unranked.length > 0) && (
              <section className="ch-qf-panel" aria-labelledby="ch-qfs-rest">
                <div className="ch-qf-panel__head">
                  <div>
                    <h2 id="ch-qfs-rest">Rest of the field</h2>
                    <p>{data.picks ? 'Players you can pick' : 'Outside the squad on score'}</p>
                  </div>
                </div>
                <ol className="ch-qf-list">
                  {eligible.map((c) => (
                    <Row key={c.playerId} c={c} />
                  ))}
                  {unranked.map((c) => (
                    <li key={c.playerId} className="is-open">
                      <span className="ch-qf-list__n">—</span>
                      <Avatar name={c.name} size={26} />
                      <b>{c.name}</b>
                      <span className="ch-qf-list__m">No round yet</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>

          <div className="ch-qf-col">
            {data.picks > 0 && (
              <section className="ch-qf-side" aria-labelledby="ch-qfs-picks">
                <div className="ch-qf-panel__head">
                  <div>
                    <h2 id="ch-qfs-picks">Coach’s picks</h2>
                    <p className="ch-num">
                      {picks.length} of {data.picks} chosen
                    </p>
                  </div>
                </div>
                <ol className="ch-qfs-picks">
                  {picks.map((c) => (
                    <li key={c.playerId} className="ch-qfs-pick">
                      <div className="ch-qfs-pick__who">
                        <Avatar name={c.name} size={30} />
                        <span>
                          <b>{c.name}</b>
                          <small className="ch-num">
                            {c.rank != null ? `${c.rank} in the standings · ` : ''}
                            <ToPar value={c.toPar} />
                          </small>
                        </span>
                        <Badge tone="accent">Pick</Badge>
                      </div>
                      {c.pick?.reasoning ? <p className="ch-qf-why">{c.pick.reasoning}</p> : <p className="ch-qf-why is-missing">No reason given yet. Add one to confirm the squad.</p>}
                      {stage === 1 && (
                        <div className="ch-qfs-pick__act">
                          <Button size="sm" variant="ghost" leftIcon={Pencil} onClick={() => setChoosing({ playerId: c.playerId })}>
                            {c.pick?.reasoning ? 'Change reason' : 'Add a reason'}{' '}
                            <span className="ch-sr-only">for {c.name}</span>
                          </Button>
                          <Button size="sm" variant="ghost" leftIcon={UserMinus} feel="warning" onClick={() => setRemoving(c)}>
                            Remove{' '}
                            <span className="ch-sr-only">{c.name}</span>
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                  {Array.from({ length: Math.max(0, data.picks - picks.length) }, (_, i) => (
                    <li key={`open-${i}`} className="ch-qfs-pick is-open">
                      <div className="ch-qfs-pick__who">
                        <span className="ch-qf-list__slot">
                          <Icon icon={UserPlus} size={13} />
                        </span>
                        <span>
                          <b>Open pick</b>
                          <small>{stage === 0 ? 'Opens when you start selecting' : stage === 2 ? 'Left open' : 'Choose a player and say why'}</small>
                        </span>
                      </div>
                      {stage === 1 && (
                        <div className="ch-qfs-pick__act">
                          <Button size="sm" leftIcon={UserPlus} onClick={() => setChoosing({ playerId: null })}>
                            Choose a player
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </div>
      </SectionBoundary>

      {/* The phone keeps the one primary at the foot of the page, where the thumb is. */}
      {phone && primary && <div className="ch-qfs-foot">{primary}</div>}

      <Modal
        code="CH-09503"
        open={asking === 'start'}
        onClose={() => setAsking(null)}
        width={460}
        icon={ListChecks}
        title="Start selecting?"
        description="Coach’s picks open. This step can’t be undone. The standings keep updating, and the places on score are set when you confirm the squad."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(null)}>
              Not yet
            </Button>
            <Button
              variant="primary"
              feel={null}
              disabled={start.pending}
              onClick={() => void start.run()}
            >
              {start.pending ? <span data-ch-code="CH-09408">Starting</span> : 'Start selecting'}
            </Button>
          </>
        }
      />
      <Modal
        code="CH-09505"
        open={asking === 'confirm'}
        onClose={() => setAsking(null)}
        width={480}
        icon={Lock}
        title="Confirm the squad?"
        description={`${plural(onScore.length + picks.length, 'player')} make the trip: ${[...onScore, ...picks].map((c) => c.name).join(', ')}. Every entrant is told whether they made it, and the squad can’t be changed afterwards.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(null)}>
              Keep editing
            </Button>
            <Button
              variant="primary"
              feel={null}
              disabled={confirm.pending}
              onClick={() => void confirm.run()}
            >
              {confirm.pending ? <span data-ch-code="CH-09408">Confirming</span> : 'Confirm squad'}
            </Button>
          </>
        }
      />
      <Modal
        code="CH-09504"
        open={!!removing}
        onClose={() => setRemoving(null)}
        width={440}
        icon={UserMinus}
        title={removing ? `Remove ${removing.name} as a pick?` : 'Remove this pick?'}
        description="Their reason is removed with them. You can pick them again."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Keep them
            </Button>
            <Button
              variant="danger"
              feel={null}
              disabled={remove.pending}
              onClick={() => {
                if (removing) void remove.run(removing);
              }}
            >
              {remove.pending ? <span data-ch-code="CH-09408">Removing</span> : 'Remove'}
            </Button>
          </>
        }
      />
      <PickDialog
        open={!!choosing}
        fixed={choosing?.playerId ? (cands.find((c) => c.playerId === choosing.playerId) ?? null) : null}
        eligible={eligible}
        onClose={() => setChoosing(null)}
        save={(c, reasoning) => writes.setPick(data.id, c.playerId, reasoning)}
        onSaved={(c, reasoning) => {
          setCands((cur) => cur.map((x) => (x.playerId === c.playerId ? { ...x, pick: { reasoning } } : x)));
          setChoosing(null);
          router.refresh();
        }}
      />
    </main>
  );
}

const byRank = (a: ChQCandidate, b: ChQCandidate) => (a.rank ?? 999) - (b.rank ?? 999) || a.name.localeCompare(b.name);

function Row({ c }: { c: ChQCandidate }) {
  return (
    <li>
      <span className="ch-qf-list__n ch-num">{c.rank ?? '—'}</span>
      <Avatar name={c.name} size={26} />
      <b>{c.name}</b>
      {c.pick && <Badge tone="accent">Pick</Badge>}
      <span className="ch-qf-list__m ch-num">{plural(c.rounds, 'round')}</span>
      <ToPar value={c.toPar} />
    </li>
  );
}

function StageNote({ stage, topN, picks, picksReady, nobody }: { stage: 0 | 1 | 2; topN: number; picks: number; picksReady: boolean; nobody: boolean }) {
  const text =
    stage === 0
      ? `Start selecting when the standings are where you want them.${picks ? ` Then choose ${plural(picks, 'coach’s pick', 'coach’s picks')}, each with a reason.` : ''} The top ${topN} on score are set when you confirm.`
      : stage === 1
        ? nobody
          ? 'Nobody has a score in and no pick is made yet, so there is no squad to confirm.'
          : picksReady
            ? 'Every pick is made. Confirm the squad to tell the players.'
            : `Choose ${plural(picks, 'coach’s pick', 'coach’s picks')}, each with a reason, to confirm the squad.`
        : 'The squad is confirmed, and every entrant has been told whether they made it.';
  return (
    <div className="ch-qf-note" data-ch-code={stage === 2 ? 'CH-09903' : undefined}>
      <Icon icon={stage === 2 ? Lock : Users} size={16} />
      <p>{text}</p>
    </div>
  );
}

/** Choose a player for a pick, or change a pick's reason. Nothing is sent until both are there. */
function PickDialog({
  open,
  fixed,
  eligible,
  onClose,
  save,
  onSaved,
}: {
  open: boolean;
  fixed: ChQCandidate | null;
  eligible: ChQCandidate[];
  onClose: () => void;
  save: (c: ChQCandidate, reasoning: string) => ReturnType<ChQSelectionWrites['setPick']>;
  onSaved: (c: ChQCandidate, reasoning: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!open) return;
    setPicked(fixed?.playerId ?? null);
    setReason(fixed?.pick?.reasoning ?? '');
    setTried(false);
  }, [open, fixed]);
  const who = fixed ?? eligible.find((c) => c.playerId === picked) ?? null;
  // The pick is recorded by the action, so the toast's Retry records it too.
  const act = useAction(
    'qualifiers.setPick',
    async (c: ChQCandidate, r: string) => {
      const res = await save(c, r);
      if (normalise(res).success) onSaved(c, r);
      return res;
    },
    (c: ChQCandidate) => ({
      done: `${c.name} picked`,
      failed: `Couldn’t pick ${c.name}`,
      hint: 'Nothing changed. Try again.',
      code: 'CH-09006',
    }),
  );
  const noWho = tried && !who;
  const noReason = tried && !reason.trim();
  const options = useMemo(() => eligible, [eligible]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={520}
      icon={UserPlus}
      title={fixed ? `Why ${fixed.name}` : 'Choose a coach’s pick'}
      description={fixed ? 'Players see that they were picked; the reason is for the coaches.' : 'Players outside the places on score, in standings order.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            leftIcon={Check}
            disabled={act.pending}
            onClick={() => {
              setTried(true);
              if (!who || !reason.trim()) return;
              void act.run(who, reason.trim());
            }}
          >
            {act.pending ? <span data-ch-code="CH-09408">Saving</span> : 'Save pick'}
          </Button>
        </>
      }
    >
      {!fixed &&
        (options.length ? (
          <fieldset className="ch-qfs-choose" aria-invalid={noWho || undefined} aria-describedby={noWho ? 'qfs-who-h' : undefined}>
            <legend className="ch-field__label">Player</legend>
            {options.map((c) => (
              <label key={c.playerId} className={'ch-qfs-opt' + (picked === c.playerId ? ' is-on' : '')}>
                <input
                  type="radio"
                  name="qfs-who"
                  value={c.playerId}
                  checked={picked === c.playerId}
                  onChange={() => {
                    haptic('select');
                    setPicked(c.playerId);
                  }}
                />
                <span className="ch-qf-list__n ch-num">{c.rank}</span>
                <Avatar name={c.name} size={26} />
                <b>{c.name}</b>
                <span className="ch-qf-list__m ch-num">{plural(c.rounds, 'round')}</span>
                <ToPar value={c.toPar} />
              </label>
            ))}
            {noWho && (
              <span id="qfs-who-h" className="ch-field__help is-error" role="alert" data-ch-code="CH-09112">
                Choose a player.
              </span>
            )}
          </fieldset>
        ) : (
          <EmptyState
            compact
            code="CH-09315"
            icon={Users}
            title="Nobody else can be picked yet."
            body="A player needs a round in, outside the places on score, to be a coach’s pick."
          />
        ))}
      {(fixed || options.length > 0) && (
        <label className="ch-field">
          <span className="ch-field__label">Reason</span>
          <textarea
            className="ch-textarea"
            rows={3}
            maxLength={1000}
            placeholder="What earned the spot: form, a course fit, experience"
            value={reason}
            aria-invalid={noReason || undefined}
            aria-describedby={noReason ? 'qfs-why-h' : undefined}
            onChange={(e) => setReason(e.target.value)}
          />
          {noReason && (
            <span id="qfs-why-h" className="ch-field__help is-error" role="alert" data-ch-code="CH-09111">
              {who ? `Say why you picked ${who.name}.` : 'Say why you picked this player.'}
            </span>
          )}
        </label>
      )}
    </Modal>
  );
}
