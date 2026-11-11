'use client';

import { Lock, UserPlus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { lockTournamentLineup, publishTournamentLineup, setTournamentEntries } from '@/app/golf/actions/tournaments';
import { haptic } from '../../lib/haptics';
import { plural } from '../../lib/plural';
import { useAction } from '../../lib/use-action';
import { useRefresh } from '../../lib/use-refresh';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { InlineNotice } from '../../ui/Notices';
import { Section } from '../../ui/Section';
import { Select } from '../../ui/Select';
import { EmptyState, SkelRows, Skeleton } from '../../ui/States';
import { formatToPar, tourDayTime, tourRange } from './format';
import {
  CHANCE_WORDS,
  draftOf,
  entriesOf,
  isEditable,
  nextOpen,
  notesOf,
  place,
  placedIds,
  publishBlock,
  sameDraft,
  setCount,
  whereIs,
  whereWords,
  type LineupDraft,
  type LineupTarget,
} from './lineup-model';
import { TourChip, TourCrumb, TourFailed, TourHead, TourLoading, TourMain, TourPhoneTop, tourGate, useTourPhone } from './parts';
import { useTourPaths } from './paths';
import type { ChTourCandidate, ChTourLineupData, ChTourPlayer, LineupBuilderProps } from './types';
import '../../styles/tournaments-lineup.css';

const TITLE_ID = 'ch-tour-lineup-title';
const EMPTY = '';

/**
 * The lineup builder (plan 4.33, 5.3): who plays each spot, the alternate and the individuals, with every player's form,
 * how often they have counted (a word, never a percentage, and only from six rounds, D-93) and a warning for anyone who
 * is injured or out. Coach only. A spot is set from its own list or by Add on the roster (a select and a button work the
 * same on a phone and a keyboard; drag is not drawn). Save draft writes `setTournamentEntries` at the event's version;
 * Publish saves what is on screen and stamps the publish time (`publishTournamentLineup`), which sends nothing to a
 * player; Lock freezes it, after which only a substitution changes a round. The projected range needs the projection
 * engine and is not drawn.
 */
export function LineupBuilder({ data, load, phone: forced }: LineupBuilderProps) {
  const phone = useTourPhone(forced);
  return tourGate(load, {
    loading: () => (
      <TourLoading view="lineup" phone={phone} title="Lineup" className="ch-tour-lu">
        <Skeleton width="100%" height={phone ? 260 : 220} radius={16} shape="solid" />
        <SkelRows rows={4} lead />
      </TourLoading>
    ),
    failed: () => <TourFailed view="lineup" phone={phone} id={TITLE_ID} eyebrow={data.event.name} title="Lineup" className="ch-tour-lu" />,
    ready: () => <LineupPage data={data} phone={phone} />,
  });
}

const STATUS_WORDS: Record<ChTourLineupData['lineup']['status'], string> = { none: 'Not started', draft: 'Draft', published: 'Published', scheduled: 'Scheduled', locked: 'Locked' };

function LineupPage({ data, phone }: { data: ChTourLineupData; phone: boolean }) {
  const paths = useTourPaths();
  const router = useRouter();
  const { refresh, refreshing } = useRefresh();
  const e = data.event;
  const editable = isEditable(data.lineup.status);
  const [draft, setDraft] = useState<LineupDraft>(() => draftOf(data));
  const [saved, setSaved] = useState<LineupDraft>(() => draftOf(data));
  const [asking, setAsking] = useState(false);
  const version = useRef<number | null>(data.version);
  const said = useRef('');
  const [announce, setAnnounce] = useState('');

  const roster = useMemo(() => data.players.filter((p) => !p.alumni), [data.players]);
  const stats = useMemo(() => new Map(data.candidates.map((c) => [c.playerId, c])), [data.candidates]);
  const availability = useMemo(() => new Map(data.candidates.map((c) => [c.playerId, c.availability])), [data.candidates]);
  const player = (id: string) => data.players.find((p) => p.id === id);
  const dirty = !sameDraft(draft, saved);
  const notes = notesOf(draft, data.players, availability);
  const block = publishBlock(draft, notes);
  const { set, of } = setCount(draft);

  const move = (playerId: string, to: LineupTarget) => {
    const next = place(draft, playerId, to);
    if (next === draft) return;
    setDraft(next);
    haptic('select');
    const p = player(playerId);
    const w = to.kind === 'bench' ? 'the bench' : whereWords(to.kind === 'slot' ? { kind: 'slot', slot: to.slot } : to.kind === 'alternate' ? { kind: 'alternate' } : { kind: 'individual' });
    said.current = `${p?.first ?? 'Player'} moved to ${w.toLowerCase() === 'the bench' ? w : w.toLowerCase()}.`;
    setAnnounce(said.current);
  };

  const saveDraft = async () => {
    if (version.current == null) return { success: false as const, error: 'This event changed since you opened it. Reload it to see the latest, then make your change again.', code: 'stale' };
    const res = await setTournamentEntries(e.id, entriesOf(draft), version.current);
    if (res.success) {
      version.current = res.data.version;
      setSaved(draft);
      router.refresh();
    }
    return res;
  };

  const save = useAction<[], unknown>(
    'tournaments.lineup.save',
    saveDraft,
    () => ({ done: 'Lineup saved', failed: 'Couldn’t save the lineup', hint: 'Your changes are still on this page. Try again.', code: 'CH-16062' }),
    (result, c) => (result.success ? c : { ...c, hint: result.error ?? c.hint }),
  );
  const publish = useAction<[], unknown>(
    'tournaments.lineup.publish',
    async () => {
      if (dirty) {
        const s = await saveDraft();
        if (!s.success) return s;
      }
      const res = await publishTournamentLineup(e.id);
      if (res.success) router.refresh();
      return res;
    },
    () => ({ done: 'Lineup published', failed: 'Couldn’t publish the lineup', hint: 'Nothing was published. Try again.', code: 'CH-16063' }),
    (result, c) => (result.success ? c : { ...c, hint: result.error ?? c.hint }),
  );
  const lock = useAction<[], unknown>(
    'tournaments.lineup.lock',
    async () => {
      if (dirty) {
        const s = await saveDraft();
        if (!s.success) return s;
      }
      const res = await lockTournamentLineup(e.id);
      if (res.success) router.refresh();
      return res;
    },
    () => ({ done: 'Lineup locked', failed: 'Couldn’t lock the lineup', hint: 'Nothing was locked. Try again.', code: 'CH-16064' }),
    (result, c) => (result.success ? c : { ...c, hint: result.error ?? c.hint }),
  );
  const busy = save.pending || publish.pending || lock.pending;
  const published = data.lineup.status === 'published' || data.lineup.status === 'scheduled';

  const meta = (
    <div className="ch-tour-lu-meta">
      <TourChip tone={data.lineup.status === 'published' ? 'ok' : undefined}>{STATUS_WORDS[data.lineup.status]}</TourChip>
      <TourChip>
        <span className="ch-num">{set}</span> of <span className="ch-num">{of}</span> set
      </TourChip>
      {data.lineup.locksAt && data.lineup.status !== 'locked' && <TourChip>Locks {tourDayTime(data.lineup.locksAt)}</TourChip>}
      {data.lineup.seen && (
        <TourChip>
          Seen by <span className="ch-num">{data.lineup.seen.by}</span> of <span className="ch-num">{data.lineup.seen.of}</span>
        </TourChip>
      )}
    </div>
  );

  const publishKey = (size?: 'lg') => (
    <Button variant="primary" size={size} busy={publish.pending} disabled={!!block || (busy && !publish.pending) || (published && !dirty)} onClick={() => void publish.run()}>
      {published && !dirty ? 'Published' : 'Publish lineup'}
    </Button>
  );
  const actions = editable ? (
    <>
      {dirty && (
        <Button variant="secondary" busy={save.pending} disabled={busy && !save.pending} onClick={() => void save.run()}>
          Save draft
        </Button>
      )}
      <Button variant="ghost" leftIcon={Lock} disabled={busy || set === 0} onClick={() => setAsking(true)}>
        Lock lineup
      </Button>
      {publishKey()}
    </>
  ) : undefined;
  // The phone's keys are one bar at the foot, in reach of a thumb: where the lineup stands (or Save draft once it has
  // changed), Lock beside it, and Publish at the end.
  const bar = editable ? (
    <div className="ch-tour-lu-bar" role="group" aria-label="Lineup actions" data-ch-lineup-bar="">
      {dirty ? (
        <Button variant="secondary" size="lg" busy={save.pending} disabled={busy && !save.pending} onClick={() => void save.run()}>
          Save draft
        </Button>
      ) : (
        <span className="ch-tour-lu-bar__s">
          <span className="ch-num">{set}</span> of <span className="ch-num">{of}</span> set
        </span>
      )}
      <Button variant="secondary" size="lg" leftIcon={Lock} disabled={busy || set === 0} onClick={() => setAsking(true)} aria={{ label: 'Lock lineup' }}>
        Lock
      </Button>
      {publishKey('lg')}
    </div>
  ) : null;

  return (
    <TourMain view="lineup" phone={phone} labelledBy={TITLE_ID} className="ch-tour-lu">
      <TourPhoneTop phone={phone} title="Lineup" back={{ label: e.short, href: paths.desk(e.id) }} />
      <TourHead
        tightAlways
        id={TITLE_ID}
        phone={phone}
        crumb={phone ? undefined : <TourCrumb href={paths.desk(e.id)}>{e.name}</TourCrumb>}
        eyebrow={`${tourRange(e.startDate, e.endDate)} · ${e.name}`}
        title="Lineup"
        line={editable ? `${e.format.players} play, ${e.format.counting} count each round. Set each spot, then publish.` : 'The lineup is locked. From here a change is a substitution, made round by round on the event.'}
        meta={meta}
        actions={phone ? undefined : actions}
      />
      <p className="ch-sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      {editable && block && set < of && roster.length > 0 && (
        <p className="ch-tour-lu-hint" data-ch-lineup-hint="">
          {block}
        </p>
      )}
      {data.errors.roster || roster.length === 0 ? (
        data.errors.roster ? (
          <InlineNotice code="CH-16262" title="The roster didn’t load" body="Nothing has changed. Try again." onRetry={refresh} retrying={refreshing} />
        ) : (
          <EmptyState size="page" kind="first-run" code="CH-16362" title="No players on the roster" body="Add players to your roster, then build the lineup from them." action={<Button href="/golf/dashboard/roster">Open the roster</Button>} />
        )
      ) : (
        <div className="ch-tour-lu-body">
          {notes.length > 0 && (
            <ul className="ch-tour-lu-notes" aria-label="Lineup warnings">
              {notes.map((n) => (
                <li key={`${n.playerId}:${n.tone}`} className={'ch-tour-lu-note is-' + n.tone} data-ch-code="CH-16363">
                  {n.text}
                </li>
              ))}
            </ul>
          )}
          <div className="ch-tour-lu-cols">
            <div className="ch-tour-lu-col">
              <Section id="ch-tour-lu-slots" title="Playing" meta={`${set} of ${of} spots set`}>
                <ol className="ch-tour-lu-slots">
                  {draft.slots.map((id, i) => (
                    <li key={i} className="ch-tour-lu-slot">
                      <span className="ch-tour-lu-slot__n ch-num" aria-hidden="true">
                        {i + 1}
                      </span>
                      <div className="ch-tour-lu-slot__who">
                        <Select
                          label={`Spot ${i + 1}`}
                          value={id ?? EMPTY}
                          disabled={!editable || busy}
                          onChange={(v) => (v ? move(v, { kind: 'slot', slot: i + 1 }) : id && move(id, { kind: 'bench' }))}
                          options={[{ value: EMPTY, label: 'Empty' }, ...roster.map((p) => ({ value: p.id, label: optionLabel(p, draft, availability.get(p.id) ?? p.availability) }))]}
                        />
                        {id && <Form candidate={stats.get(id)} />}
                      </div>
                      {editable && id && <IconButton icon={X} label={`Take ${player(id)?.first ?? 'player'} out of spot ${i + 1}`} onClick={() => move(id, { kind: 'bench' })} />}
                    </li>
                  ))}
                </ol>
              </Section>
              <Section id="ch-tour-lu-extra" title="Alternate and individuals" meta="The alternate is next in; individuals play for themselves and never count toward the team">
                <div className="ch-tour-lu-extra">
                  <div className="ch-tour-lu-extra__row">
                    <span className="ch-tour-lu-lbl">Alternate</span>
                    <Select
                      label="Alternate"
                      value={draft.alternate ?? EMPTY}
                      disabled={!editable || busy}
                      onChange={(v) => (v ? move(v, { kind: 'alternate' }) : draft.alternate && move(draft.alternate, { kind: 'bench' }))}
                      options={[{ value: EMPTY, label: 'None' }, ...roster.map((p) => ({ value: p.id, label: optionLabel(p, draft, availability.get(p.id) ?? p.availability) }))]}
                    />
                  </div>
                  <div className="ch-tour-lu-extra__row">
                    <span className="ch-tour-lu-lbl">Individuals</span>
                    <div className="ch-tour-lu-extra__ind">
                      {draft.individuals.length === 0 && <span className="ch-tour-lu-muted">None</span>}
                      {draft.individuals.map((id) => (
                        <span key={id} className="ch-tour-lu-pill">
                          {player(id)?.name ?? 'Player'}
                          {editable && <IconButton icon={X} label={`Take ${player(id)?.first ?? 'player'} out of the individuals`} onClick={() => move(id, { kind: 'bench' })} />}
                        </span>
                      ))}
                      {editable && (
                        <Select
                          label="Add an individual"
                          value={EMPTY}
                          disabled={busy}
                          onChange={(v) => v && move(v, { kind: 'individual' })}
                          options={[{ value: EMPTY, label: 'Add an individual' }, ...roster.filter((p) => !whereIs(draft, p.id)).map((p) => ({ value: p.id, label: p.name }))]}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </Section>
            </div>
            <div className="ch-tour-lu-col ch-tour-lu-side">
              <Section id="ch-tour-lu-roster" title="Roster" meta="Form is the last five team rounds; counts is how often a score counted">
                <ul className="ch-tour-lu-roster">
                  {roster.map((p) => {
                    const c = stats.get(p.id);
                    const w = whereIs(draft, p.id);
                    const target = nextOpen(draft);
                    return (
                      <li key={p.id} className="ch-tour-lu-r">
                        <Avatar name={p.name} size="sm" />
                        <div className="ch-tour-lu-r__who">
                          <div className="ch-tour-lu-r__n">
                            <span>
                              {p.name} <span className="ch-tour-lu-muted">· {p.year}</span>
                            </span>
                            {(availability.get(p.id) ?? p.availability) !== 'available' && <TourChip tone="warn">{availabilityLabel(availability.get(p.id) ?? p.availability)}</TourChip>}
                          </div>
                          <Form candidate={c} showCourse />
                        </div>
                        <div className="ch-tour-lu-r__act">
                          {w ? (
                            <TourChip tone="ok">{whereWords(w)}</TourChip>
                          ) : (
                            editable && (
                              <Button size="sm" leftIcon={UserPlus} disabled={busy || !target} onClick={() => target && move(p.id, target)}>
                                {target ? 'Add' : 'Full'}
                              </Button>
                            )
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Section>
            </div>
          </div>
        </div>
      )}
      {phone && bar}
      <Modal
        code="CH-16560"
        open={asking}
        onClose={() => setAsking(false)}
        width={440}
        icon={Lock}
        title="Lock the lineup?"
        description={`${placedIds(draft).length ? `${set} of ${of} spots are set. ` : ''}Once it is locked, a change is a substitution made round by round. This can’t be undone from here.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Keep editing
            </Button>
            <Button
              variant="primary"
              busy={lock.pending}
              onClick={() => {
                setAsking(false);
                haptic('warning');
                void lock.run();
              }}
            >
              Lock lineup
            </Button>
          </>
        }
      />
    </TourMain>
  );
}

const optionLabel = (p: ChTourPlayer, d: LineupDraft, a: ChTourCandidate['availability']) => {
  const w = whereWords(whereIs(d, p.id));
  const bits = [p.name, w, a === 'available' ? '' : availabilityLabel(a).toLowerCase()].filter(Boolean);
  return bits.join(' · ');
};

function availabilityLabel(a: ChTourCandidate['availability']): string {
  return a === 'injured' ? 'Injured' : a === 'academic' ? 'Out for academics' : a === 'not_travelling' ? 'Not travelling' : 'Available';
}

/** A player's last five team rounds (signed to par, with whether each counted), how often they count, and their course record. */
function Form({ candidate: c, showCourse = false }: { candidate: ChTourCandidate | undefined; showCourse?: boolean }) {
  if (!c) return null;
  const spoken = c.form.map((f) => `${formatToPar(f.toPar)} ${f.counted == null ? '' : f.counted ? 'counted' : 'did not count'}`.trim()).join(', ');
  return (
    <div className="ch-tour-lu-form-line">
      {c.form.length > 0 ? (
        <span className="ch-tour-lu-strip" role="img" aria-label={`Last ${c.form.length} rounds: ${spoken}`}>
          {c.form.map((f) => (
            <span key={f.roundId} className={'ch-num' + (f.counted === false ? ' is-out' : '') + (f.toPar != null && f.toPar < 0 ? ' ch-tour-under' : '')}>
              {formatToPar(f.toPar)}
            </span>
          ))}
        </span>
      ) : (
        <span className="ch-tour-lu-muted">No team rounds yet</span>
      )}
      <span className="ch-tour-lu-muted">{c.chance ? CHANCE_WORDS[c.chance] : c.countRounds > 0 ? 'Counts: not enough rounds yet' : ''}</span>
      {showCourse && c.course.rounds > 0 && (
        <span className="ch-tour-lu-muted">
          {plural(c.course.rounds, 'round')} here{c.course.avgToPar != null ? `, ${formatToPar(c.course.avgToPar)} avg` : ''}
        </span>
      )}
    </div>
  );
}
