'use client';

import { Info, MessageSquare, Plus, Share } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ChPlayerProfile } from '../../data/stats-player';
import type { ChWindow } from '../../data/stats-common';
import { basisWords, clearFilters, hasRange, isFiltered, per18, type ChFilter } from '../../data/stats-filter';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { InlineNotice } from '../../ui/Notices';
import { Icon } from '../../ui/Icon';
import { PhoneIconAction } from '../../ui/PhoneBar';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { useToast } from '../../ui/Toast';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { formatFixed, formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { sgBaseline } from '../../lib/sg';
import { PhoneTop, useBackFromMore } from '../../shell/phone-chrome';
import { formatHcp } from '../roster/format';
import { SgBars, SgChangeChip } from './charts';
import { ROUND_TYPE } from './detail';
import { GameDetail } from './GameDetail';
import { RoundsExtra } from './RoundsExtra';
import { countWords, shotsWords } from './notes';
import { ScoreLine } from './StatsTeamPhone';
import { WindowSwitch } from './WindowSwitch';
import { FilterEmpty, NineHint, StatsFilter } from './StatsFilter';
import { ProposalAnswer } from './ProposalAnswer';

/** Rounds the list shows before "All N rounds". */
const ROUNDS_SHOWN = 5;

/**
 * A player's stats on the phone (v2, design/handoff/Coach - Stats - Mobile.html,
 * m-stats.jsx `Player`): who, three figures, the five game sections as chips
 * (one section at a time, Game detail's own panels), then the scoring line,
 * the rounds and development. Same loader, window change, focus-area sheet
 * and catalog as desktop (StatsPlayer holds them). A coach arrives from Team
 * stats and goes back to it; a player opens My stats from More.
 */
export function StatsPlayerPhone({
  data,
  initialTab,
  playerHref,
  messageHref,
  onWindow,
  onFilter,
  onBackToTeam,
  onAddFocus,
  onRetry,
}: {
  data: ChPlayerProfile;
  initialTab?: string;
  /** This page's own address (player and window), for Share. */
  playerHref: string;
  messageHref: string | null;
  onWindow: (w: ChWindow) => void;
  /** Any change of the round filter: the page's offline refusal, slow notice, then the new address. */
  onFilter: (next: ChFilter) => void;
  onBackToTeam: () => void;
  onAddFocus: (() => void) | null;
  onRetry: () => void;
}) {
  const coach = data.viewer === 'coach';
  const backFromMore = useBackFromMore();
  const toast = useToast();
  const w = data.win;
  const first = data.firstName;
  // Strokes gained needs three rounds WITH shots, so the banner keys on those, not on the round count alone.
  // A filter that leaves no round says so in place of the figures (CH-5320), not as an early read of nothing.
  const filtered = isFiltered(data.filter);
  const emptyFilter = filtered && w.rounds === 0 && !data.roundsError;
  const early = w.effRounds < 3 && !emptyFilter;
  const noShots = !early && !emptyFilter && w.effSgRounds < 3;
  const showFilter = !data.roundsError && (data.filterOptions.total > 0 || filtered);

  const share = async () => {
    haptic('press');
    const url = `${window.location.origin}${playerHref}`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: `${data.name} · stats`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      haptic('success');
      toast({
        title: 'Link copied',
        body: `Coaches on your team can open ${first}'s stats from it.`,
      });
    } catch (e) {
      // Closing the share sheet is not a failure.
      if (e instanceof DOMException && e.name === 'AbortError') return;
      chTrail('stats share failed');
      haptic('error');
      toast({
        tone: 'error',
        title: "Couldn't share the link",
        body: 'Your browser blocked it. Try again, or copy the address from the browser.',
        code: 'CH-5002',
      });
    }
  };

  return (
    <div className="ch-stm">
      {coach ? (
        <PhoneTop title="Player stats" back={{ label: 'Team', onBack: onBackToTeam }} action={<PhoneIconAction icon={Share} label={`Share ${first}'s stats`} onClick={() => void share()} />} />
      ) : (
        <PhoneTop title="My stats" back={{ label: 'More', onBack: backFromMore }} />
      )}

      <header className="ch-spm-head">
        <Avatar name={data.name} size={48} />
        <span className="ch-spm-head__id">
          <h1>{data.name}</h1>
          <p className="ch-num">
            {[data.classYear, `${data.season.rounds} ${data.season.rounds === 1 ? 'round' : 'rounds'}`, data.handicap == null ? null : `${formatHcp(data.handicap)} hcp`].filter(Boolean).join(' · ')}
          </p>
        </span>
        {coach && messageHref && (
          <Link href={messageHref} className="ch-spm-head__msg" aria-label={`Message ${first}`}>
            <Icon icon={MessageSquare} size={18} />
          </Link>
        )}
      </header>

      <WindowSwitch value={data.window} onChange={onWindow} custom={hasRange(data.filter)} />
      {showFilter && <StatsFilter filter={data.filter} options={data.filterOptions} count={w.rounds} onChange={onFilter} codes={{ empty: 'CH-5320', pickEmpty: 'CH-5321', pickCap: 'CH-5322', range: 'CH-5102', holes: 'CH-5323' }} phone />}

      {!filtered && w.rounds === 0 && !data.roundsError && <NineHint code="CH-5324" filter={data.filter} options={data.filterOptions} who={coach ? `${first} has` : 'You have'} />}
      {early && (
        <div className="ch-pf-early" role="note" data-ch-code="CH-5305">
          <Icon icon={Info} size={15} />
          Early read. {coach ? `${first} has` : 'You have'} {countWords(w.rounds, w.effRounds)} in this window, so averages and trends will move a lot. Strokes gained shows once
          there are three.
        </div>
      )}
      {noShots && (
        <div className="ch-pf-early" role="note" data-ch-code="CH-5308">
          <Icon icon={Info} size={15} />
          Strokes gained needs three rounds posted with shots. {coach ? `${first} has` : 'You have'} {shotsWords(w.sgRounds, w.rounds, w.effSgRounds)} in this window, so strokes gained shows a dash until there are three.
        </div>
      )}
      {data.roundsError && <InlineNotice code="CH-5201" title="Rounds didn't load." body="Posted rounds are safe. Try again; the error has been reported." onRetry={onRetry} />}

      {emptyFilter && <FilterEmpty code="CH-5320" onClear={() => onFilter(clearFilters(data.filter))} />}

      {!emptyFilter && (
        <>
      <SectionBoundary surface="stats.player.overview" label="The overview" code="CH-5204">
        <Figures data={data} />
      </SectionBoundary>

      <SectionBoundary surface="stats.player.strokesGained" label="Strokes gained" code="CH-5204">
        <StrokesGained data={data} />
      </SectionBoundary>

      <SectionBoundary surface="stats.player.game" label="Game detail" code="CH-5205">
        {data.statsError ? (
          <InlineNotice code="CH-5202" title="Shot-level detail didn't load." body="Scores and rounds are correct. Try again; the error has been reported." onRetry={onRetry} />
        ) : data.stats && data.stats.roundsPlayed > 0 ? (
          <GameDetail s={data.stats} x={data.extra} bench={data.bench} first={coach ? first : 'You'} rounds={w.rounds} window={data.window} basis={basisWords(data.filter)} puttBands={data.puttBands} onRetry={onRetry} phone />
        ) : (
          <section className="ch-stm-panel">
            <EmptyState
              compact
              code="CH-5301"
              title="No shot-by-shot rounds in this window."
              body="Game detail fills in from rounds posted hole by hole with shots. Totals-only rounds still count toward scoring."
            />
          </section>
        )}
      </SectionBoundary>

      <SectionBoundary surface="stats.player.overview" label="The overview" code="CH-5204">
        <Trend data={data} />
      </SectionBoundary>

      <SectionBoundary surface="stats.player.rounds" label="The rounds" code="CH-5206">
        {data.rounds.length > 0 && <RoundsExtra x={data.extra} filter={data.filter} phone />}
        <Rounds rounds={data.rounds} open={initialTab === 'rounds'} />
      </SectionBoundary>
        </>
      )}

      <SectionBoundary surface="stats.player.development" label="Development" code="CH-5207">
        <Development data={data} coach={coach} onAdd={onAddFocus} onRetry={onRetry} />
      </SectionBoundary>
    </div>
  );
}

/** Scoring average, strokes gained a round, and form (the newer half of the rounds against the older half; lower is better). */
function Figures({ data }: { data: ChPlayerProfile }) {
  const w = data.win;
  const sgTone = w.sgPerRound == null ? '' : w.sgPerRound >= 0 ? ' ch-gain' : ' ch-loss';
  const form = w.formChange;
  const formTone = form == null || Math.abs(form) < 0.05 ? '' : form < 0 ? ' ch-gain' : ' ch-loss';
  return (
    <dl className="ch-stm-figs is-three">
      <div>
        <dt>Scoring avg</dt>
        <dd className="ch-num">{formatFixed(w.avg)}</dd>
        <dd className="ch-num">{data.viewer === 'coach' && data.teamAvg != null ? `Team ${data.teamAvg.toFixed(1)}` : `${w.rounds} ${w.rounds === 1 ? 'round' : 'rounds'}`}</dd>
      </div>
      <div>
        <dt>SG / round</dt>
        <dd className={'ch-num' + sgTone}>{w.sgPerRound == null ? NO_DATA : formatSigned(w.sgPerRound)}</dd>
        <dd>
          {w.sgPerRound == null ? 'After three rounds' : sgBaseline(data.tour).vs}
          {w.sgPerRound != null && (data.sgChange.delta != null || data.sgChange.context) && <SgChangeChip change={data.sgChange} code="CH-5310" />}
        </dd>
      </div>
      <div>
        <dt>Form</dt>
        <dd className={'ch-num' + formTone}>{form == null ? NO_DATA : formatSigned(form)}</dd>
        <dd>{form == null ? 'After three rounds' : 'Newer rounds'}</dd>
      </div>
    </dl>
  );
}

/** Strokes gained by leg and in total, the window's mean a round, a bar either side of zero on the data's own scale. */
function StrokesGained({ data }: { data: ChPlayerProfile }) {
  const w = data.win;
  const baseline = sgBaseline(data.tour);
  const legs = [
    { label: 'Off the tee', value: w.sgLegs.tee },
    { label: 'Approach', value: w.sgLegs.approach },
    { label: 'Around green', value: w.sgLegs.around },
    { label: 'Putting', value: w.sgLegs.putting },
  ];
  const known = legs.filter((l): l is { label: string; value: number } => l.value != null);
  if (!known.length && w.sgPerRound == null)
    return (
      <section className="ch-stm-panel" aria-labelledby="ch-spm-sg">
        <div className="ch-stm-panel__h">
          <h2 id="ch-spm-sg">Strokes gained</h2>
        </div>
        <EmptyState compact code="CH-5309" title="No strokes gained in this window." body="Strokes gained by leg appears after three rounds with shots." />
      </section>
    );
  const losing = known.filter((l) => l.value < -0.05);
  const note = !known.length
    ? null
    : !losing.length
      ? `No leg is losing strokes against ${baseline.noun}.`
      : losing.length === 1
        ? `${losing[0]!.label} is the only leg losing strokes, ${Math.abs(losing[0]!.value).toFixed(1)} a round.`
        : `${losing.length} legs are losing strokes: ${losing.map((l) => l.label).join(', ')}.`;
  return (
    <section className="ch-stm-panel" aria-labelledby="ch-spm-sg">
      <div className="ch-stm-panel__h">
        <h2 id="ch-spm-sg">Strokes gained</h2>
        <span>Per round · {baseline.vs}</span>
      </div>
      <SgBars rows={[...legs, { label: 'Total', value: w.sgPerRound, total: true }]} />
      {note && <p className="ch-stm-note">{note}</p>}
    </section>
  );
}

function Trend({ data }: { data: ChPlayerProfile }) {
  // Oldest first, the last ten rounds, a score per 18 holes (a 9-hole score doubled).
  const rounds = [...data.rounds].reverse().slice(-10).map((r) => ({ ...r, score: per18(r.score, r.holes) }));
  if (rounds.length === 0) return null;
  const change = rounds[rounds.length - 1]!.score - rounds[0]!.score;
  return (
    <section className="ch-stm-panel" aria-labelledby="ch-spm-trend">
      <div className="ch-stm-panel__h">
        <h2 id="ch-spm-trend">Scoring trend</h2>
        <span className="ch-num">
          Last {rounds.length}
          {rounds.some((r) => r.holes === 9) ? ' · 9-hole scores doubled' : ''}
        </span>
      </div>
      {/* A line needs two rounds; with one the panel says what there is instead of vanishing. */}
      {rounds.length === 1 ? (
        <p className="ch-stm-note">
          One round so far: <span className="ch-num">{rounds[0]!.score}</span> on {rounds[0]!.date}. The trend draws from the second.
        </p>
      ) : (
        <ScoreLine
          values={rounds.map((r) => r.score)}
          from={rounds[0]!.date}
          to={rounds[rounds.length - 1]!.date}
          label={`Scores over the last ${rounds.length} rounds, from ${rounds[0]!.score} to ${rounds[rounds.length - 1]!.score}${change === 0 ? '' : `, ${Math.abs(change)} ${change < 0 ? 'lower' : 'higher'}`}.`}
        />
      )}
    </section>
  );
}

/** Newest first; five, then "All N rounds" (CH-5807). Roster's "All N" (tab=rounds) opens it in full and scrolls to it. */
function Rounds({ rounds, open }: { rounds: ChPlayerProfile['rounds']; open: boolean }) {
  const [all, setAll] = useState(open);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'start' });
  }, [open]);
  const shown = all ? rounds : rounds.slice(0, ROUNDS_SHOWN);
  return (
    <section className="ch-stm-panel" aria-labelledby="ch-spm-rounds" ref={ref}>
      <div className="ch-stm-panel__h">
        <h2 id="ch-spm-rounds">Rounds</h2>
        <span>Countable, newest first</span>
      </div>
      {rounds.length === 0 ? (
        <EmptyState code="CH-5302" compact title="No rounds in this window." body="Try This season to see every round posted since August." />
      ) : (
        <>
          <ul className="ch-stm-list">
            {shown.map((r) => (
              <li key={r.id} className="ch-spm-round">
                <span className="ch-stm-row__b">
                  <b>{r.course}</b>
                  <span className="ch-num">{[r.date, r.holes === 9 ? '9 holes' : null, r.type ? ROUND_TYPE[r.type] : null, r.gir ? `GIR ${r.gir}` : null, r.putts != null ? `${r.putts} putts` : null].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="ch-stm-row__v ch-num">
                  <b>{r.score}</b>
                  <span className={'ch-topar' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')}>{formatToPar(r.toPar)}</span>
                  <span className={r.sg == null ? '' : r.sg >= 0 ? 'ch-gain' : 'ch-loss'}>{formatSigned(r.sg)} SG</span>
                </span>
              </li>
            ))}
          </ul>
          {rounds.length > ROUNDS_SHOWN && (
            <button
              type="button"
              className="ch-spm-more"
              aria-expanded={all}
              onClick={() => {
                haptic('select');
                setAll((v) => !v);
              }}
            >
              {all ? 'Show fewer' : `All ${rounds.length} rounds`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function Development({ data, coach, onAdd, onRetry }: { data: ChPlayerProfile; coach: boolean; onAdd: (() => void) | null; onRetry: () => void }) {
  const first = data.firstName;
  const active = data.focusAreas.filter((f) => f.status === 'active').length;
  const proposed = data.focusAreas.filter((f) => f.status === 'proposed').length;
  return (
    <section className="ch-stm-panel" aria-labelledby="ch-spm-dev">
      <div className="ch-stm-panel__h">
        <h2 id="ch-spm-dev">Development</h2>
        {onAdd && (
          <Button size="sm" leftIcon={Plus} onClick={onAdd}>
            Add focus area
          </Button>
        )}
      </div>
      {data.devError && <InlineNotice code="CH-5203" title="Some development items didn't load." body="Try again; the error has been reported." onRetry={onRetry} />}
      <h3 className="ch-spm-sub">
        Focus areas{' '}
        <span className="ch-num">
          {active} active
          {proposed ? ` · ${proposed} waiting on ${coach ? first : 'you'}` : ''}
        </span>
      </h3>
      {data.focusAreas.length === 0 ? (
        <EmptyState code="CH-5303" compact title="No focus areas yet." body={coach ? 'Add one from a weak section above.' : 'Your coach adds focus areas; they show here.'} />
      ) : (
        <ul className="ch-spm-dev">
          {data.focusAreas.map((f) => (
            <li key={f.id}>
              <b>{f.title}</b>
              <span className="ch-num">
                {f.status === 'proposed' ? 'Proposed, waiting to be accepted' : f.target != null ? `${f.current ?? f.baseline ?? NO_DATA} → target ${f.target}` : 'No target set'}
              </span>
              {!coach && f.status === 'proposed' && <ProposalAnswer id={f.id} title={f.title} />}
            </li>
          ))}
        </ul>
      )}
      <h3 className="ch-spm-sub">
        Goals <span className="ch-num">{data.goals.length} this season</span>
      </h3>
      {data.goals.length === 0 ? (
        <EmptyState code="CH-5304" compact title="No goals set." body={coach ? `${first} sets goals from the player app.` : 'Set goals from your development page.'} />
      ) : (
        <ul className="ch-spm-dev">
          {data.goals.map((g) => {
            const done = g.state === 'achieved' || g.state === 'completed';
            return (
              <li key={g.id} className={done ? 'is-done' : undefined}>
                <b>
                  <span className="ch-sr-only">{done ? 'Achieved: ' : 'In progress: '}</span>
                  {g.title}
                </b>
                <span className="ch-num">{g.current != null ? `Now ${g.current}${g.target != null ? ` · target ${g.target}` : ''}` : (g.state ?? 'Active')}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
