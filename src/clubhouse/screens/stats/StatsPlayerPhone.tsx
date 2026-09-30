'use client';

import { Info, MessageSquare, Plus, Share } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ChPlayerProfile } from '../../data/stats-player';
import type { ChWindow } from '../../data/stats-common';
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
import { PhoneTop, useBackFromMore } from '../../shell/phone-chrome';
import { formatHcp } from '../roster/format';
import { GameDetail } from './GameDetail';
import { ScoreLine } from './StatsTeamPhone';
import { WindowSwitch } from './WindowSwitch';

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
  onBackToTeam: () => void;
  onAddFocus: (() => void) | null;
  onRetry: () => void;
}) {
  const coach = data.viewer === 'coach';
  const backFromMore = useBackFromMore();
  const toast = useToast();
  const w = data.win;
  const first = data.firstName;
  const early = w.rounds < 3;

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

      <WindowSwitch value={data.window} onChange={onWindow} />

      {early && (
        <div className="ch-pf-early" role="note" data-ch-code="CH-5305">
          <Icon icon={Info} size={15} />
          Early read. {coach ? `${first} has` : 'You have'} {w.rounds} countable {w.rounds === 1 ? 'round' : 'rounds'} in this window, so averages and trends will move a lot. Strokes gained shows once
          there are three.
        </div>
      )}
      {data.roundsError && <InlineNotice code="CH-5201" title="Rounds didn't load." body="Posted rounds are safe. Try again; the error has been reported." onRetry={onRetry} />}

      <SectionBoundary surface="stats.player.overview" label="The overview" code="CH-5204">
        <Figures data={data} />
      </SectionBoundary>

      <SectionBoundary surface="stats.player.game" label="Game detail" code="CH-5205">
        {data.statsError ? (
          <InlineNotice code="CH-5202" title="Shot-level detail didn't load." body="Scores and rounds are correct. Try again; the error has been reported." onRetry={onRetry} />
        ) : data.stats && data.stats.roundsPlayed > 0 ? (
          <GameDetail s={data.stats} d1={data.d1} first={coach ? first : 'You'} rounds={w.rounds} phone />
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
        <Rounds rounds={data.rounds} open={initialTab === 'rounds'} />
      </SectionBoundary>

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
        <dd>{w.sgPerRound == null ? 'After three rounds' : 'vs D1'}</dd>
      </div>
      <div>
        <dt>Form</dt>
        <dd className={'ch-num' + formTone}>{form == null ? NO_DATA : formatSigned(form)}</dd>
        <dd>{form == null ? 'After three rounds' : 'Newer rounds'}</dd>
      </div>
    </dl>
  );
}

function Trend({ data }: { data: ChPlayerProfile }) {
  // Oldest first, the last ten 18-hole rounds.
  const rounds = [...data.rounds].reverse().slice(-10);
  if (rounds.length === 0) return null;
  const change = rounds[rounds.length - 1]!.score - rounds[0]!.score;
  return (
    <section className="ch-stm-panel" aria-labelledby="ch-spm-trend">
      <div className="ch-stm-panel__h">
        <h2 id="ch-spm-trend">Scoring trend</h2>
        <span className="ch-num">Last {rounds.length}</span>
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
                  <span className="ch-num">{[r.date, r.gir ? `GIR ${r.gir}` : null, r.putts != null ? `${r.putts} putts` : null].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="ch-stm-row__v ch-num">
                  <b>{r.score}</b>
                  <span className={'ch-topar' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')}>{formatToPar(r.toPar)}</span>
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
