'use client';

import { ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';
import type { ChStandRow, ChStanding, ChStandSense } from '../../../data/coachhelm-standing-shape';
import { diveReadHref, helmViewHref, PLAYER_HELM_HREF, PLAYER_VOICE, type ChViewLoad, type ChViewVoice } from '../../../data/coachhelm-views-shape';
import { haptic } from '../../../lib/haptics';
import { useChPhone } from '../../../lib/use-phone';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { PageRefreshNotice, RefreshNotice } from '../../../ui/RefreshNotice';
import { SectionBoundary } from '../../../ui/SectionBoundary';
import { EmptyState } from '../../../ui/States';
import { coachHelmLinks } from '../PlayerBoard';
import { HelmOff, PlayerHelmFrame } from './Frame';
import { KeepReading } from './KeepReading';

const LINE = 'Where you stand on every stat CoachHelm tracks, against the Tour and against your team.';

/** The page's own words for whose page it is (spec A): the player's, as they always were, or a coach's about the player by first name. */
function wordsFor(voice: ChViewVoice) {
  if (voice.role !== 'coach') {
    return { you: 'You', average: 'your scoring average', where: 'Where you stand', team: 'your team', numbers: 'Your numbers are in, and the comparisons fill in as they are ready', label: 'Your standing' };
  }
  const f = voice.first;
  return { you: f, average: `${f}’s scoring average`, where: `Where ${f} stands`, team: 'the team', numbers: `${f}’s numbers are in, and the comparisons fill in as they are ready`, label: `${f}’s standing` };
}

/**
 * A coach's way from a stat to the open read on it (spec A): "Open the read", the Deep dive open on that read. Only where an open read
 * shares the stat's metric (`ChStanding.reads`); never on the player's own page. Kept apart so a section that is rewritten can put it back.
 */
export function OpenRead({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <Link className="ch-hs-open" href={href} onClick={() => haptic('select')}>
      Open the read
      <Icon icon={ArrowRight} size={14} />
    </Link>
  );
}

/** Where a metric's open read is, on a coach's page; null on the player's own and where there is none. */
export const readHrefFor = (s: Pick<ChStanding, 'reads'>, voice: ChViewVoice) => (metric: string): string | null => {
  const id = voice.role === 'coach' ? s.reads?.[metric] : undefined;
  return id ? diveReadHref(id, voice) : null;
};

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

/** A section's tally against the Tour: how many of its stats are ahead and how many behind, so the group reads at a glance. */
function Tally({ rows }: { rows: ChStandRow[] }) {
  const ahead = rows.filter((r) => senseOf(r) === 'ahead').length;
  const behind = rows.filter((r) => senseOf(r) === 'behind').length;
  if (!ahead && !behind) return null;
  return (
    <span className="ch-hs-tally ch-num">
      {ahead > 0 && <span className="is-ahead">{ahead} ahead</span>}
      {behind > 0 && <span className="is-behind">{behind} behind</span>}
    </span>
  );
}

function Row({ r, voice = PLAYER_VOICE, readHref = null }: { r: ChStandRow; voice?: ChViewVoice; readHref?: string | null }) {
  const sense = senseOf(r);
  const w = wordsFor(voice);
  return (
    <li className={'ch-hs-r is-' + sense}>
      <div className="ch-hs-r__h">
        <h3>{r.label}</h3>
        <p>
          {r.vsTour && <span className={'ch-hs-vs is-' + r.vsTour.sense}>{r.vsTour.text}</span>}
          {r.percentile && <span className="ch-hs-pct">{r.percentile}</span>}
          {!r.vsTour && r.vsTeam && <span className={'ch-hs-vs is-' + r.vsTeam.sense}>{r.vsTeam.text}</span>}
        </p>
      </div>
      <div className="ch-hs-tr" aria-hidden="true">
        {/* The gap to the Tour, filled in the row's colour so how far you sit from it reads at a glance (owner, 2026-10-16). */}
        {r.tour && (
          <i className="ch-hs-tr__gap" style={{ left: `${Math.min(r.tour.pct, r.youPct)}%`, width: `${Math.abs(r.youPct - r.tour.pct)}%` }} />
        )}
        {r.team && <i className="ch-hs-tr__team" style={{ left: `${r.team.pct}%` }} />}
        {r.tour && <i className="ch-hs-tr__tour" style={{ left: `${r.tour.pct}%` }} />}
        <i className="ch-hs-tr__you" style={{ left: `${r.youPct}%` }} />
      </div>
      <dl className="ch-hs-r__f">
        <div className="is-you">
          <dt>{w.you}</dt>
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
          <b className="ch-num">About {r.projection.strokes} strokes a round</b> if it matched {r.tour?.ref ?? 'the Tour'}: {w.average}{' '}
          <span className="ch-num">
            {r.projection.from} to {r.projection.to}
          </span>
          , typically in about {r.projection.weeks} {r.projection.weeks === 1 ? 'week' : 'weeks'}
          {r.projection.clamped ? '. The projection is capped, so it is a ceiling, not a forecast' : ''}.
        </p>
      )}
      {readHref && (
        // A div, not a p: the app's narrow-width rule for links in a paragraph (globals.css) would make the link inline-block.
        <div className="ch-hs-read">
          <OpenRead href={readHref} />
        </div>
      )}
    </li>
  );
}

function Hero({ s, voice = PLAYER_VOICE }: { s: ChStanding; voice?: ChViewVoice }) {
  const w = wordsFor(voice);
  const readHref = readHrefFor(s, voice);
  const meta = [s.rounds != null ? `${s.rounds} ${s.rounds === 1 ? 'round' : 'rounds'}` : null, s.scoringAverage ? `Scoring average ${s.scoringAverage}` : null, s.refreshed ? `Refreshed ${s.refreshed.replace(' ', '\u00a0')}` : null].filter(Boolean);
  const { tour, team } = s.counts;
  const top = s.gaps[0];
  const tourName = s.tour === 'Tour' ? 'the Tour' : 'the LPGA Tour';
  return (
    // On the team board's green (owner, 2026-10-16: "same with standing"): the headline and what is most to gain.
    <section className={'ch-hs-hero ch-scoreboard' + (s.gaps.length > 0 ? '' : ' is-solo')} aria-labelledby="ch-hs-hero-t">
      <div className="ch-hs-hero__main">
        <div className="ch-hs-hero__k">
          <span>{w.where}</span>
          {/* No-break spaces keep a date whole ("Sep 30") and a dot off the start of a line. */}
          {meta.length > 0 && <span className="ch-num">{meta.join('\u00a0· ')}</span>}
        </div>
        {/* A headline, so no closing full stop (states audit, 2026-10-08). It leads with the most to gain; the counts say one
            denominator, the Tour's, under it (P013 D4). */}
        <h2 id="ch-hs-hero-t">
          {top ? (
            <>
              {top.label} is worth about <span className="ch-hs-count ch-num">{top.strokes} strokes</span> a round
            </>
          ) : tour.of > 0 ? (
            <>
              Ahead of {tourName} on <Count ahead={tour.ahead} of={tour.of} /> stats
            </>
          ) : team.of > 0 ? (
            <>
              Ahead of {w.team} on <Count ahead={team.ahead} of={team.of} /> stats
            </>
          ) : (
            w.numbers
          )}
        </h2>
        <p className="ch-hs-hero__sub">
          {top && tour.of > 0 ? `Ahead of ${tourName} on ${tour.ahead} of ${tour.of} stats. ` : top && team.of > 0 ? `Ahead of ${w.team} on ${team.ahead} of ${team.of} stats. ` : ''}
          Every stat, strokes gained included, is against {tourName}.
        </p>
      </div>
      {s.gaps.length > 0 && (
        <aside className="ch-hs-gaps" aria-labelledby="ch-hs-gaps-t">
          <h3 id="ch-hs-gaps-t">Most to gain</h3>
          <ol>
            {s.gaps.map((g) => (
              <li key={g.id}>
                <span>
                  {g.label}
                  <OpenRead href={readHref(g.id)} />
                </span>
                <span className="ch-hs-gaps__v">
                  <b className="ch-num">{g.strokes}</b>
                  <em>strokes a round</em>
                </span>
              </li>
            ))}
          </ol>
          <p>Strokes a round each would take off {w.average} if it matched the Tour. They overlap, so they do not add up.</p>
        </aside>
      )}
    </section>
  );
}

/**
 * The player's Standing (P013, `?view=standing`): every tracked stat against the Tour and against their team, each with the
 * percentile, what it is worth to close, and the basis it stands on. Their own and read-only. A comparison that cannot be made
 * says why in place (a team too small, a Tour value that is not comparable); it is never drawn as a zero.
 *
 * `voice`: a coach's Standing of one player (spec A) is the same page about the player by first name, against "the team average",
 * with no Start a round, and a way from each stat with an open read to that read in the Deep dive.
 */
export function Standing({ load, voice = PLAYER_VOICE }: { load: ChViewLoad<ChStanding>; voice?: ChViewVoice }) {
  const phone = useChPhone();
  const coach = voice.role === 'coach' ? voice : null;
  const startHref = coach ? null : coachHelmLinks.startRound();
  const f = coach?.first;

  if (load.status === 'off') {
    return (
      <PlayerHelmFrame view="standing" line={LINE} off voice={voice}>
        <HelmOff reason={load.reason} voice={voice} />
      </PlayerHelmFrame>
    );
  }
  if (load.status === 'failed') {
    return (
      <PlayerHelmFrame view="standing" line={LINE} voice={voice}>
        {f ? (
          <RefreshNotice code="CH-13270" title={`${f}’s standing didn’t load`} body="Nothing is lost. The stats are still saved; try again in a moment." />
        ) : (
          <RefreshNotice code="CH-13270" title="Your standing didn’t load" body="Nothing is lost. Your stats are still saved; try again in a moment." />
        )}
      </PlayerHelmFrame>
    );
  }
  const s = load.data;
  const w = wordsFor(voice);
  const readHref = readHrefFor(s, voice);
  return (
    <PlayerHelmFrame view="standing" line={LINE} voice={voice}>
      {s.state === 'empty' ? (
        <>
          {s.baselineFailed && <RefreshNotice code="CH-13271" title={f ? `${f}’s scoring average didn’t load` : 'Your scoring average didn’t load'} body="Standing is empty for now, and projections need it. Try again in a moment." />}
          {/* The whole view is empty: on the phone it is the page's empty state, centred on the parchment like the Board's first run
              (the Mobile clubhouse pass, 2026-10-08); desktop keeps the line on the Ledger. */}
          <EmptyState
            code="CH-13370"
            size={phone ? 'page' : 'section'}
            shape="rows"
            title="Standing starts with a few rounds"
            body={
              f
                ? `Standing puts ${f}’s stats next to the Tour and the team, and refreshes overnight.${s.rounds ? ` ${f} has posted ${s.rounds} ${s.rounds === 1 ? 'round' : 'rounds'} so far.` : ''} It fills in once ${f}’s first rounds are in.`
                : `Standing puts your stats next to the Tour and your team. It fills in once your first rounds are in, and refreshes overnight.${s.rounds ? ` You have posted ${s.rounds} ${s.rounds === 1 ? 'round' : 'rounds'}.` : ''}`
            }
            action={
              startHref ? (
                <Button variant="primary" leftIcon={Plus} href={startHref.href}>
                  {startHref.label}
                </Button>
              ) : undefined
            }
          />
        </>
      ) : (
        <SectionBoundary surface="coachhelm.standing" label={w.label} code="CH-13204">
          {/* Both reads beside the rows failed: said once, with one Try again (CH-1209), and each keeps its title (states audit, 2026-10-08). */}
          <PageRefreshNotice parts={[s.baselineFailed && (f ? `${f}’s scoring average` : 'your scoring average'), s.cohortFailed && (f ? 'the team’s Tour' : 'your team’s Tour')].filter((x): x is string => !!x)} />
          {s.baselineFailed &&
            (f ? (
              <RefreshNotice code="CH-13271" title={`${f}’s projections didn’t load`} body="The scoring average, which every projection starts from, didn’t load. The comparisons below are not affected. Try again in a moment." covered={s.cohortFailed} />
            ) : (
              <RefreshNotice code="CH-13271" title="Your projections didn’t load" body="Your scoring average, which every projection starts from, didn’t load. The comparisons below are not affected. Try again in a moment." covered={s.cohortFailed} />
            ))}
          {/* CH-13272: the Tour the rows are against is the men's default because the cohort lookup failed; it is not stated as theirs. */}
          {s.cohortFailed &&
            (f ? (
              <RefreshNotice code="CH-13272" title="The team’s Tour couldn’t be confirmed" body="The rows below are against the men’s Tour, the default, which may not be the one for this team. The stats are not affected. Try again in a moment." covered={s.baselineFailed} />
            ) : (
              <RefreshNotice code="CH-13272" title="Your team’s Tour couldn’t be confirmed" body="The rows below are against the men’s Tour, the default, which may not be the one for your team. Your stats and your team’s are not affected. Try again in a moment." covered={s.baselineFailed} />
            ))}
          {s.state === 'early' && (
            <p className="ch-hs-early" role="note" data-ch-code="CH-13371">
              <b className="ch-num">{s.rounds ?? 0} {s.rounds === 1 ? 'round' : 'rounds'}</b> so far, so this is an early read. Projections start at 5 rounds
              {/* The team clause only where a row is short of teammates: rows with team values say otherwise. */}
              {s.groups.some((g) => g.rows.some((r) => r.teamNote)) ? `, and a comparison with ${w.team} needs 5 teammates with the stat` : ''}.
            </p>
          )}
          <Hero s={s} voice={voice} />
          {s.groups.map((g) => (
            <section key={g.id} className="ch-hs-g" aria-labelledby={`ch-hs-g-${g.id}`}>
              <div className="ch-hs-g__h">
                <div className="ch-hs-g__t">
                  <h2 id={`ch-hs-g-${g.id}`}>{g.label}</h2>
                  <Tally rows={g.rows} />
                </div>
                <p>{g.description}</p>
              </div>
              <ol className="ch-hs-rows">
                {g.rows.map((r) => (
                  <Row key={r.id} r={r} voice={voice} readHref={readHref(r.id)} />
                ))}
              </ol>
            </section>
          ))}
          <p className="ch-hl-note">
            {f ? 'Ranks come from the team’s overnight refresh and use the teammates who have the stat.' : 'Ranks come from your team’s refresh overnight and use the teammates who have the stat.'} The Tour mark is the Tour’s value for the same stat; where it is not comparable, the row says so and draws none.
          </p>
          {f ? (
            <KeepReading
              id="ch-hs-next-t"
              title={`Also for ${f}`}
              line={`This is where ${f} stands. The next two say how ${f} plays, and what is behind the biggest gaps.`}
              items={[
                { href: helmViewHref('profile', voice), title: 'Game profile', note: `How ${f} plays` },
                { href: helmViewHref('deep-dive', voice), title: 'Deep dive', note: `The insights behind ${f}’s biggest gaps` },
              ]}
            />
          ) : (
            <KeepReading
              id="ch-hs-next-t"
              line="This is where you stand. The next two say how you play, and what is behind your biggest gaps."
              items={[
                { href: PLAYER_HELM_HREF.profile, title: 'Game profile', note: 'How you play, in your own words' },
                { href: PLAYER_HELM_HREF['deep-dive'], title: 'Deep dive', note: 'The insights behind your biggest gaps' },
              ]}
            />
          )}
        </SectionBoundary>
      )}
    </PlayerHelmFrame>
  );
}
