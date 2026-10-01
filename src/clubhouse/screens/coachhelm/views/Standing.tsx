'use client';

import { Play, Scale as ScaleIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ChStandRow, ChStanding, ChStandSense } from '../../../data/coachhelm-standing-shape';
import { PLAYER_HELM_HREF, type ChViewLoad } from '../../../data/coachhelm-views-shape';
import { Button } from '../../../ui/Button';
import { InlineNotice } from '../../../ui/Notices';
import { SectionBoundary } from '../../../ui/SectionBoundary';
import { EmptyState } from '../../../ui/States';
import { coachHelmLinks } from '../PlayerBoard';
import { HelmOff, PlayerHelmFrame } from './Frame';
import { KeepReading } from './KeepReading';

const LINE = 'Where you stand on every stat CoachHelm tracks, against the Tour and against your team.';

/** The row's colour: against the Tour, the only benchmark (Q-88); against the team when the Tour has no comparable value. */
const senseOf = (r: ChStandRow): ChStandSense | 'none' => r.vsTour?.sense ?? r.vsTeam?.sense ?? 'none';

/** "4 of 22", the count drawn in its own colour so the sentence does not read as plain black numbers. */
function Count({ ahead, of }: { ahead: number; of: number }) {
  return (
    <span className="ch-hs-count ch-num">
      {ahead} of {of}
    </span>
  );
}

function Row({ r }: { r: ChStandRow }) {
  const sense = senseOf(r);
  return (
    <li className={'ch-hs-r is-' + sense}>
      <div className="ch-hs-r__h">
        <h4>{r.label}</h4>
        <p>
          {r.vsTour && <span className={'ch-hs-vs is-' + r.vsTour.sense}>{r.vsTour.text}</span>}
          {r.percentile && <span className="ch-hs-pct">{r.percentile}</span>}
          {!r.vsTour && r.vsTeam && <span className={'ch-hs-vs is-' + r.vsTeam.sense}>{r.vsTeam.text}</span>}
        </p>
      </div>
      <div className="ch-hs-tr" aria-hidden="true">
        {r.team && <i className="ch-hs-tr__team" style={{ left: `${r.team.pct}%` }} />}
        {r.tour && <i className="ch-hs-tr__tour" style={{ left: `${r.tour.pct}%` }} />}
        <i className="ch-hs-tr__you" style={{ left: `${r.youPct}%` }} />
      </div>
      <dl className="ch-hs-r__f">
        <div className="is-you">
          <dt>You</dt>
          <dd className="ch-num">{r.you}</dd>
        </div>
        <div className="is-tour">
          <dt>{r.tour?.label ?? 'Tour'}</dt>
          <dd className="ch-num">{r.tour ? r.tour.text : '—'}</dd>
        </div>
        <div className="is-team">
          <dt>Team</dt>
          <dd className="ch-num">{r.team ? r.team.text : '—'}</dd>
        </div>
      </dl>
      {r.tourNote && (
        <p className="ch-hs-note" data-ch-code="CH-13373">
          {r.tourNote}
        </p>
      )}
      {r.teamNote && (
        <p className="ch-hs-note" data-ch-code="CH-13372">
          {r.teamNote}
        </p>
      )}
      {r.projection && (
        <p className="ch-hs-proj">
          <b className="ch-num">About {r.projection.strokes} strokes a round</b> if it matched {r.tour?.ref ?? 'the Tour'}: your scoring average{' '}
          <span className="ch-num">
            {r.projection.from} to {r.projection.to}
          </span>
          , typically in about {r.projection.weeks} {r.projection.weeks === 1 ? 'week' : 'weeks'}
          {r.projection.clamped ? '. The projection is capped, so it is a ceiling, not a forecast' : ''}.
        </p>
      )}
    </li>
  );
}

function Hero({ s }: { s: ChStanding }) {
  const meta = [s.rounds != null ? `${s.rounds} ${s.rounds === 1 ? 'round' : 'rounds'}` : null, s.scoringAverage ? `Scoring average ${s.scoringAverage}` : null, s.refreshed ? `Refreshed ${s.refreshed}` : null].filter(Boolean);
  const { tour, team } = s.counts;
  return (
    <section className={'ch-hs-hero' + (s.gaps.length > 0 ? '' : ' is-solo')} aria-labelledby="ch-hs-hero-t">
      <div className="ch-hs-hero__main">
        <div className="ch-hs-hero__k">
          <span>Where you stand</span>
          {meta.length > 0 && <span className="ch-num">{meta.join(' · ')}</span>}
        </div>
        <h2 id="ch-hs-hero-t">
          {tour.of > 0 ? (
            <>
              Ahead of {s.tour === 'Tour' ? 'the Tour' : 'the LPGA Tour'} on <Count ahead={tour.ahead} of={tour.of} /> stats
              {team.of > 0 ? (
                <>
                  {' '}
                  and ahead of your team on <Count ahead={team.ahead} of={team.of} />.
                </>
              ) : (
                '.'
              )}
            </>
          ) : team.of > 0 ? (
            <>
              Ahead of your team on <Count ahead={team.ahead} of={team.of} /> stats.
            </>
          ) : (
            'Your numbers are in. The comparisons fill in as they are ready.'
          )}
        </h2>
        <p className="ch-hs-hero__sub">
          {s.counts.measures} {s.counts.measures === 1 ? 'stat' : 'stats'} tracked. Strokes gained is against the field average, not a Tour player’s score; every other stat is against {s.tour === 'Tour' ? 'the Tour' : 'the LPGA Tour'}.
        </p>
      </div>
      {s.gaps.length > 0 && (
        <aside className="ch-hs-gaps" aria-labelledby="ch-hs-gaps-t">
          <h3 id="ch-hs-gaps-t">Most to gain</h3>
          <ol>
            {s.gaps.map((g) => (
              <li key={g.id}>
                <span>{g.label}</span>
                <span className="ch-hs-gaps__v">
                  <b className="ch-num">{g.strokes}</b>
                  <em>strokes a round</em>
                </span>
              </li>
            ))}
          </ol>
          <p>Strokes a round each would take off your scoring average if it matched the Tour. They overlap, so they do not add up.</p>
        </aside>
      )}
    </section>
  );
}

/**
 * The player's Standing (P013, `?view=standing`): every tracked stat against the Tour and against their team, each with the
 * percentile, what it is worth to close, and the basis it stands on. Their own and read-only. A comparison that cannot be made
 * says why in place (a team too small, a Tour value that is not comparable); it is never drawn as a zero.
 */
export function Standing({ load }: { load: ChViewLoad<ChStanding> }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const startHref = coachHelmLinks.startRound();

  if (load.status === 'off') {
    return (
      <PlayerHelmFrame view="standing" line={LINE} off>
        <HelmOff reason={load.reason} />
      </PlayerHelmFrame>
    );
  }
  if (load.status === 'failed') {
    return (
      <PlayerHelmFrame view="standing" line={LINE}>
        <InlineNotice code="CH-13270" title="Your standing didn’t load" body="Nothing is lost. Your stats are still saved; try again in a moment." onRetry={refresh} />
      </PlayerHelmFrame>
    );
  }
  const s = load.data;
  return (
    <PlayerHelmFrame view="standing" line={LINE}>
      {s.state === 'empty' ? (
        <>
          {s.baselineFailed && <InlineNotice code="CH-13271" title="Your scoring average didn’t load" body="Standing is empty for now, and projections need it. Try again in a moment." onRetry={refresh} />}
          <EmptyState
            code="CH-13370"
            icon={ScaleIcon}
            title="Standing starts with a few rounds"
            body={`Standing puts your stats next to the Tour and your team. It fills in once your first rounds are in, and refreshes overnight.${s.rounds ? ` You have posted ${s.rounds} ${s.rounds === 1 ? 'round' : 'rounds'}.` : ''}`}
            action={
              startHref ? (
                <Button variant="primary" leftIcon={Play} href={startHref.href}>
                  {startHref.label}
                </Button>
              ) : undefined
            }
          />
        </>
      ) : (
        <SectionBoundary surface="coachhelm.standing" label="Your standing" code="CH-13204">
          {s.baselineFailed && <InlineNotice code="CH-13271" title="Your projections didn’t load" body="Your scoring average, which every projection starts from, didn’t load. The comparisons below are not affected. Try again in a moment." onRetry={refresh} />}
          {s.state === 'early' && (
            <p className="ch-hs-early" role="note" data-ch-code="CH-13371">
              <b className="ch-num">{s.rounds ?? 0} {s.rounds === 1 ? 'round' : 'rounds'}</b> so far, so this is an early read. Projections start at 5 rounds, and a comparison with your team needs 5 teammates with the stat.
            </p>
          )}
          <Hero s={s} />
          {s.groups.map((g) => (
            <section key={g.id} className="ch-hs-g" aria-labelledby={`ch-hs-g-${g.id}`}>
              <div className="ch-hs-g__h">
                <h2 id={`ch-hs-g-${g.id}`}>{g.label}</h2>
                <p>{g.description}</p>
              </div>
              <ol className="ch-hs-rows">
                {g.rows.map((r) => (
                  <Row key={r.id} r={r} />
                ))}
              </ol>
            </section>
          ))}
          <p className="ch-hl-note">
            Ranks come from your team’s refresh overnight and use the teammates who have the stat. The Tour mark is the Tour’s value for the same stat; where it is not comparable, the row says so and draws none.
          </p>
          <KeepReading
            id="ch-hs-next-t"
            line="This is where you stand. The next two say how you play, and what is behind your biggest gaps."
            items={[
              { href: PLAYER_HELM_HREF.profile, title: 'Game profile', note: 'How you play, in your own words' },
              { href: PLAYER_HELM_HREF['deep-dive'], title: 'Deep dive', note: 'The insights behind your biggest gaps' },
            ]}
          />
        </SectionBoundary>
      )}
    </PlayerHelmFrame>
  );
}
