'use client';

import { Check, ChevronLeft, ChevronRight, Info, MessageSquare, Plus, Target } from 'lucide-react';
import Link from 'next/link';
import { m } from 'framer-motion';
import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createFocusArea } from '@/app/golf/actions/development';
import type { ChPlayerProfile } from '../../data/stats-player';
import type { ChWindow } from '../../data/stats-common';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { InlineNotice } from '../../ui/Notices';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { Segmented } from '../../ui/Segmented';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { useAction } from '../../lib/use-action';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { chTween } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { formatFixed, formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { rebuiltHref } from '../../shell/nav';
import { formatHcp } from '../roster/format';
import { FieldTable, FigureCards, LegBars, ScoreBoardTrend, YardagePage } from './charts';
import { GameDetail } from './GameDetail';
import { WindowSwitch } from './WindowSwitch';

type Tab = 'overview' | 'game' | 'rounds' | 'dev';

/** Form over the plotted rounds (oldest first): the newer half against the older half, in strokes. */
export function formNote(first: string, scores: number[]): string {
  if (scores.length < 3) return `Early read. ${first}'s form shows after three rounds.`;
  const half = Math.floor(scores.length / 2);
  const m = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const c = m(scores.slice(scores.length - half)) - m(scores.slice(0, half));
  if (c <= -0.5) return `${first} is scoring ${Math.abs(c).toFixed(1)} lower in the newer half of these rounds.`;
  if (c >= 0.5) return `${first} is scoring ${c.toFixed(1)} higher in the newer half of these rounds.`;
  return `${first} is holding steady across these rounds.`;
}

export function StatsPlayer({ data, coachId }: { data: ChPlayerProfile; coachId: string | null }) {
  const router = useRouter();
  const reduced = useChReducedMotion();
  const [tab, setTab] = useState<Tab>('overview');
  const [focusOpen, setFocusOpen] = useState(false);
  const [pending, start] = useTransition();
  const coach = data.viewer === 'coach';
  const w = data.win;
  const early = w.rounds < 3;
  const first = data.firstName;
  const base = '/golf/dashboard/stats';
  const href = (player: string | null, win: ChWindow) => {
    const q = new URLSearchParams();
    if (player && coach) q.set('player', player);
    if (win !== 'last10') q.set('window', win);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const go = (player: string | null, win: ChWindow) => start(() => router.push(href(player, win), { scroll: false }));
  const messageHref = rebuiltHref('/golf/dashboard/messages');

  const heroFigs: Array<[string, string, string, string?]> = [
    ['Scoring avg', formatFixed(w.avg), coach && data.teamAvg != null ? `Team ${data.teamAvg.toFixed(1)}` : `${w.rounds} rounds`],
    ['Handicap', formatHcp(data.handicap), 'Index'],
    ['SG / round', w.sgPerRound == null ? NO_DATA : formatSigned(w.sgPerRound), 'Per round', w.sgPerRound == null ? undefined : w.sgPerRound >= 0 ? 'ch-gain' : 'ch-loss'],
    ['Rounds', String(data.season.rounds), 'This season'],
  ];
  const cmp = (label: string) => data.comparisons.find((c) => c.label === label);
  const fig = (label: string, short: string) => {
    const c = cmp(label);
    const ref = coach ? c?.team : c?.d1;
    return {
      label: short,
      value: c?.you == null ? NO_DATA : c.you.toFixed(c.digits),
      unit: c?.unit,
      delta: c?.you != null && ref != null ? c.you - ref : null,
      deltaDigits: c?.digits ?? 0,
      lowerIsBetter: c?.lowerIsBetter,
      context: ref == null ? `${w.rounds} rounds` : `vs. ${coach ? 'team' : 'D1'} ${ref.toFixed(c?.digits ?? 0)}${c?.unit ?? ''}`,
    };
  };
  const best = data.rounds.length ? Math.min(...data.rounds.map((r) => r.score)) : null;
  const trendRounds = [...data.rounds].reverse().slice(-10).map((r) => ({ label: r.date, score: r.score, toPar: r.toPar }));
  const legs = [
    { label: 'Off the tee', value: w.sgLegs.tee },
    { label: 'Approach', value: w.sgLegs.approach },
    { label: 'Around green', value: w.sgLegs.around },
    { label: 'Putting', value: w.sgLegs.putting },
  ];
  const known = legs.filter((l) => l.value != null) as Array<{ label: string; value: number }>;
  const strongest = [...known].sort((a, b) => b.value - a.value)[0];
  const weakest = [...known].sort((a, b) => a.value - b.value)[0];
  const legNote = !known.length
    ? 'Strokes gained by leg appears after three rounds with shot data.'
    : weakest && weakest.value < 0 && known.filter((l) => l.value < 0).length === 1
      ? `${weakest.label} is the only leg losing strokes, about ${Math.abs(weakest.value).toFixed(1)} a round.`
      : `Strongest leg is ${strongest!.label.toLowerCase()}${weakest && weakest.value < 0 ? `; ${weakest.label.toLowerCase()} gives back the most` : ''}.`;

  const tabs: Array<[Tab, string, number?]> = [
    ['overview', 'Overview'],
    ['game', 'Game detail'],
    ['rounds', 'Rounds', data.rounds.length],
    ['dev', 'Development'],
  ];

  return (
    <main className="ch-st" aria-busy={pending}>
      {coach && (
        <div className="ch-st-back">
          <Button size="sm" variant="ghost" leftIcon={ChevronLeft} href={href(null, data.window)}>
            Team stats
          </Button>
          {data.nav && (
            <div className="ch-st-back__nav">
              <Link className="ch-btn ch-btn--ghost ch-iconbtn ch-btn--sm" href={href(data.nav.prev, data.window)} aria-label="Previous player" onClick={() => haptic('select')} scroll={false}>
                <Icon icon={ChevronLeft} size={15} />
              </Link>
              <span className="ch-num">
                {data.nav.index} of {data.nav.total}
              </span>
              <Link className="ch-btn ch-btn--ghost ch-iconbtn ch-btn--sm" href={href(data.nav.next, data.window)} aria-label="Next player" onClick={() => haptic('select')} scroll={false}>
                <Icon icon={ChevronRight} size={15} />
              </Link>
            </div>
          )}
        </div>
      )}

      <section className="ch-pf-hero" aria-label={data.name}>
        <span className="ch-pf-hero__av">
          <Avatar name={data.name} size={112} />
        </span>
        <div className="ch-pf-hero__id">
          <div className="ch-pf-hero__tags">
            <span className={`ch-pf-tag is-${data.status}`}>
              <i aria-hidden="true" />
              {data.status === 'active' ? 'Active' : 'Inactive'}
            </span>
          </div>
          <h1 className="ch-display">{coach ? data.name : 'Your stats'}</h1>
          <p>{[coach ? null : data.name, data.classYear, data.gradYear ? `Class of ${data.gradYear}` : null, data.hometown].filter(Boolean).join(' · ')}</p>
          {coach && (messageHref || coachId) && (
            <div className="ch-pf-hero__act">
              {messageHref && (
                <Button leftIcon={MessageSquare} href={messageHref}>
                  Message
                </Button>
              )}
              {coachId && (
                <Button variant="primary" leftIcon={Target} onClick={() => setFocusOpen(true)}>
                  Add focus area
                </Button>
              )}
            </div>
          )}
        </div>
        <dl className="ch-pf-hero__figs">
          {heroFigs.map(([l, v, s, cls]) => (
            <div key={l}>
              <dt>{l}</dt>
              <dd className={`ch-num${cls ? ` ${cls}` : ''}`}>{v}</dd>
              <span>{s}</span>
            </div>
          ))}
        </dl>
      </section>

      <div className="ch-pf-tabs">
        <div className="ch-tabs" role="tablist" aria-label="Profile sections">
          {tabs.map(([t, l, n]) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`panel-${t}`}
              className="ch-tab-t"
              onClick={() => {
                if (t !== tab) {
                  haptic('select');
                  chTrail(`stats tab ${t}`);
                }
                setTab(t);
              }}
            >
              {l}
              {n != null && <span className="ch-tab-t__n ch-num">{n}</span>}
              {tab === t && <m.span className="ch-tab-t__bar" layoutId={reduced ? undefined : 'pf-tab'} transition={chTween('base')} />}
            </button>
          ))}
        </div>
        <WindowSwitch value={data.window} onChange={(v) => go(data.id, v)} />
      </div>

      {early && (
        <div className="ch-pf-early" role="note">
          <Icon icon={Info} size={15} />
          Early read. {first} has {w.rounds} countable {w.rounds === 1 ? 'round' : 'rounds'} in this window, so averages and trends will move a lot. Strokes gained shows once there are three.
        </div>
      )}
      {data.roundsError && (
        <InlineNotice title="Rounds didn't load." body="Posted rounds are safe. Try again; the error has been reported." onRetry={() => router.refresh()} />
      )}

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="ch-st-panel">
        {tab === 'overview' && (
          <SectionBoundary surface="stats.player.overview" label="The overview">
            <FigureCards
              items={[
                fig('Fairways hit', 'Fairways hit'),
                fig('Greens in regulation', 'Greens in regulation'),
                fig('Putts per round', 'Putts per round'),
                fig('Scrambling', 'Scrambling'),
                { label: 'Best round', value: best == null ? NO_DATA : String(best), context: `${w.rounds} rounds in window` },
              ]}
            />
            <div className="ch-st-grid2">
              <YardagePage
                title="Scoring"
                meta={`Last ${trendRounds.length} 18-hole ${trendRounds.length === 1 ? 'round' : 'rounds'}`}
                note={trendRounds.length ? formNote(first, trendRounds.map((r) => r.score)) : undefined}
              >
                <ScoreBoardTrend rounds={trendRounds} />
              </YardagePage>
              <YardagePage title="Strokes gained by leg" meta="Per round" note={legNote}>
                <LegBars rows={legs} />
              </YardagePage>
            </div>
            <YardagePage title={coach ? `${first} vs. team` : 'You vs. D1'} meta={coach ? 'Same window, active players' : 'D1 averages where the benchmark exists'}>
              <FieldTable rows={data.comparisons} showTeam={coach} />
            </YardagePage>
          </SectionBoundary>
        )}

        {tab === 'game' && (
          <SectionBoundary surface="stats.player.game" label="Game detail">
            {data.statsError ? (
              <InlineNotice
                title="Shot-level detail didn't load."
                body="Scores and rounds above are correct. Try again; the error has been reported."
                onRetry={() => router.refresh()}
              />
            ) : data.stats && data.stats.roundsPlayed > 0 ? (
              <GameDetail s={data.stats} d1={data.d1} first={first} rounds={w.rounds} />
            ) : (
              <div className="ch-st-card">
                <EmptyState title="No shot-by-shot rounds in this window." body="Game detail fills in from rounds posted hole by hole with shots. Totals-only rounds still count toward scoring." />
              </div>
            )}
          </SectionBoundary>
        )}

        {tab === 'rounds' && (
          <SectionBoundary surface="stats.player.rounds" label="The rounds table">
            <section className="ch-st-card">
              <div className="ch-st-card__head">
                <div>
                  <h2>Rounds</h2>
                  <span>Countable 18-hole rounds &middot; newest first</span>
                </div>
              </div>
              {data.rounds.length === 0 ? (
                <EmptyState compact title="No rounds in this window." body="Try This season to see every round posted since August." />
              ) : (
                <div className="ch-tbl" role="table" aria-label="Rounds">
                  <div className="ch-tr ch-tr--h" role="row">
                    <span role="columnheader">Course</span>
                    <span role="columnheader">Date</span>
                    <span role="columnheader" className="r">Score</span>
                    <span role="columnheader" className="r">To par</span>
                    <span role="columnheader" className="r">GIR</span>
                    <span role="columnheader" className="r">Putts</span>
                    <span role="columnheader" className="r">SG</span>
                  </div>
                  {data.rounds.map((r) => (
                    <div key={r.id} className="ch-tr" role="row">
                      <span role="cell" className="ch-tr__course">{r.course}</span>
                      <span role="cell" className="ch-n2">{r.date}</span>
                      <span role="cell" className="r ch-num ch-n">{r.score}</span>
                      <span role="cell" className={'r ch-num ch-topar' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')}>{formatToPar(r.toPar)}</span>
                      <span role="cell" className="r ch-num ch-n2">{r.gir ?? NO_DATA}</span>
                      <span role="cell" className="r ch-num ch-n2">{r.putts ?? NO_DATA}</span>
                      <span role="cell" className={'r ch-num ch-n2' + (r.sg == null ? '' : r.sg >= 0 ? ' ch-gain' : ' ch-loss')}>{formatSigned(r.sg)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </SectionBoundary>
        )}

        {tab === 'dev' && (
          <SectionBoundary surface="stats.player.development" label="Development">
            {data.devError && <InlineNotice title="Some development items didn't load." body="Try again; the error has been reported." onRetry={() => router.refresh()} />}
            <div className="ch-st-grid2">
              <section className="ch-st-card">
                <div className="ch-st-card__head">
                  <div>
                    <h2>Focus areas</h2>
                    <span>
                      {data.focusAreas.filter((f) => f.status === 'active').length} active
                      {data.focusAreas.some((f) => f.status === 'proposed') && ` · ${data.focusAreas.filter((f) => f.status === 'proposed').length} waiting on ${coach ? first : 'you'}`}
                    </span>
                  </div>
                  {coach && coachId && (
                    <Button size="sm" leftIcon={Plus} onClick={() => setFocusOpen(true)}>
                      Add
                    </Button>
                  )}
                </div>
                {data.focusAreas.length === 0 ? (
                  <EmptyState compact title="No focus areas yet." body={coach ? 'Add one from a weak leg in Game detail.' : 'Your coach adds focus areas; they show here.'} />
                ) : (
                  data.focusAreas.map((f) => {
                    const progress = progressOf(f.baseline, f.current, f.target);
                    return (
                      <div key={f.id} className="ch-pf-focus">
                        <div>
                          <b>{f.title}</b>
                          <span>
                            {f.status === 'proposed'
                              ? 'Proposed, waiting to be accepted'
                              : f.target != null
                                ? `${f.current ?? f.baseline ?? NO_DATA} → target ${f.target}`
                                : 'No target set'}
                          </span>
                        </div>
                        <div className="ch-pf-bar" aria-hidden="true">
                          {progress != null && <span style={{ width: `${progress}%` }} />}
                        </div>
                        <span className="ch-num ch-n2">{progress == null ? NO_DATA : `${progress}%`}</span>
                      </div>
                    );
                  })
                )}
              </section>
              <section className="ch-st-card">
                <div className="ch-st-card__head">
                  <div>
                    <h2>Goals</h2>
                    <span>{data.goals.length} this season</span>
                  </div>
                </div>
                {data.goals.length === 0 ? (
                  <EmptyState compact title="No goals set." body={coach ? `${first} sets goals from the player app.` : 'Set goals from your development page.'} />
                ) : (
                  data.goals.map((g) => {
                    const done = g.state === 'achieved' || g.state === 'completed';
                    return (
                      <div key={g.id} className="ch-pf-goal">
                        <span className={'ch-pf-goal__c' + (done ? ' is-done' : '')} aria-label={done ? 'Achieved' : 'In progress'}>
                          {done && <Icon icon={Check} size={12} />}
                        </span>
                        <div>
                          <b>{g.title}</b>
                          <span>{g.current != null ? `Now ${g.current}${g.target != null ? ` · target ${g.target}` : ''}` : (g.state ?? 'Active')}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </section>
            </div>
          </SectionBoundary>
        )}
      </div>

      {coach && coachId && <FocusAreaSheet open={focusOpen} onClose={() => setFocusOpen(false)} playerId={data.id} coachId={coachId} first={first} />}
    </main>
  );
}

function progressOf(baseline: number | null, current: number | null, target: number | null): number | null {
  if (baseline == null || current == null || target == null || baseline === target) return null;
  const p = ((current - baseline) / (target - baseline)) * 100;
  return Math.max(0, Math.min(100, Math.round(p)));
}

const AREAS = [
  { value: 'driving', label: 'Driving' },
  { value: 'approach', label: 'Approach' },
  { value: 'short_game', label: 'Short game' },
  { value: 'putting', label: 'Putting' },
  { value: 'mental_game', label: 'Mental' },
] as const;
type Area = (typeof AREAS)[number]['value'];

function FocusAreaSheet({ open, onClose, playerId, coachId, first }: { open: boolean; onClose: () => void; playerId: string; coachId: string; first: string }) {
  const router = useRouter();
  const [area, setArea] = useState<Area>('approach');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const invalid = title.trim().length < 3;
  const save = useAction(
    'stats.addFocusArea',
    () =>
      createFocusArea({
        player_id: playerId,
        coach_id: coachId,
        area_type: area,
        title: title.trim(),
        description: note.trim() || null,
        target_metric: null,
        current_value: null,
        target_value: null,
        status: 'proposed',
      }),
    { done: `Focus area proposed to ${first}. It starts when ${first} accepts.`, failed: `Couldn't add the focus area for ${first}`, hint: 'Your text is still here. Try again in a moment.' },
  );
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (invalid) {
      haptic('warning');
      document.getElementById('fa-title')?.focus();
      return;
    }
    const res = await save.run();
    if (res.success) {
      setTitle('');
      setNote('');
      setTouched(false);
      onClose();
      router.refresh();
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Target}
      title={`Add a focus area for ${first}`}
      description={`${first} sees it as proposed and accepts it to start the improvement window.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={save.pending} feel={null} onClick={() => void submit()}>
            {save.pending ? 'Adding' : 'Propose focus area'}
          </Button>
        </>
      }
    >
      <form className="ch-rs-inv" onSubmit={submit} noValidate>
        <div className="ch-field">
          <span className="ch-field__label">Area</span>
          <Segmented<Area> size="sm" label="Area" value={area} onChange={setArea} options={AREAS} />
        </div>
        <label className="ch-field" htmlFor="fa-title">
          <span className="ch-field__label">What to work on</span>
          <input
            id="fa-title"
            className="ch-input"
            value={title}
            maxLength={120}
            placeholder="Approach from 125 to 150 yards"
            aria-invalid={touched && invalid}
            aria-describedby="fa-title-help"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTouched(true)}
          />
          <span id="fa-title-help" className={'ch-field__help' + (touched && invalid ? ' is-error' : '')}>
            {touched && invalid ? 'Give it a short name, at least three characters.' : 'A short name the player will recognise.'}
          </span>
        </label>
        <label className="ch-field" htmlFor="fa-note">
          <span className="ch-field__label">Note for {first} (optional)</span>
          <textarea id="fa-note" className="ch-textarea" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </form>
    </Modal>
  );
}
