'use client';

import { ArrowRight, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ladderHeadlineFor, type ChLadderRow } from '../../../data/coachhelm-ladder-shape';
import type { ChStandRow, ChStanding, ChStandSense } from '../../../data/coachhelm-standing-shape';
import type { ChGameLoad } from '../../../data/coachhelm-profile-shape';
import { diveReadHref, helmViewHref, PLAYER_HELM_HREF, PLAYER_VOICE, STANDING_GAME_ID, type ChViewLoad, type ChViewVoice } from '../../../data/coachhelm-views-shape';
import { useChPhone } from '../../../lib/use-phone';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { PageRefreshNotice, RefreshNotice } from '../../../ui/RefreshNotice';
import { SectionBoundary } from '../../../ui/SectionBoundary';
import { EmptyState } from '../../../ui/States';
import { coachHelmLinks } from '../PlayerBoard';
import { HelmOff, PlayerHelmFrame } from './Frame';
import { HowYouPlay } from './HowYouPlay';
import { KeepReading } from './KeepReading';
import { plural } from '../../../lib/plural';

const LINE = 'Where you stand on every stat CoachHelm tracks, against the Tour and against your team, and how you play.';

/**
 * `?view=profile` (Game profile's old address) opens Standing at "How you play" (CH-13913): once, as the page opens, with no
 * animation (a landing, not a move the person made). Only when the section is drawn; nothing happens on any other address.
 */
function useLandOnGame(at: 'game' | undefined) {
  // A passive effect, keyed by the address alone: it runs after the shell's own layout-effect reset to the top (RouteFrame,
  // CH-1904), so the landing is the last word, and a re-render on the same address never moves the page again.
  useEffect(() => {
    if (at !== 'game') return;
    document.getElementById(STANDING_GAME_ID)?.scrollIntoView?.({ block: 'start' });
  }, [at]);
}

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
    <Link className="ch-hs-open" href={href}>
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
  const meta = [s.rounds != null ? `${plural(s.rounds, 'round')}` : null, s.scoringAverage ? `Scoring average ${s.scoringAverage}` : null, s.refreshed ? `Refreshed ${s.refreshed.replace(' ', '\u00a0')}` : null].filter(Boolean);
  const { tour, team } = s.counts;
  const top = s.ladder.top;
  const tourName = s.tour === 'Tour' ? 'the Tour' : 'the LPGA Tour';
  return (
    // On the team board's green (owner, 2026-10-16: "same with standing"): one sentence, then the ladder under it.
    <section className="ch-hs-hero ch-scoreboard is-solo" aria-labelledby="ch-hs-hero-t">
      <div className="ch-hs-hero__main">
        <div className="ch-hs-hero__k">
          <span>{w.where}</span>
          {/* No-break spaces keep a date whole ("Sep 30") and a dot off the start of a line. */}
          {meta.length > 0 && <span className="ch-num">{meta.join('\u00a0· ')}</span>}
        </div>
        {/* A headline, so no closing full stop (states audit, 2026-10-08). It names the part of the round that loses the most,
            once; its number is on the ladder (design call: the hero, Most to gain and the rows drew the same gap three times). */}
        <h2 id="ch-hs-hero-t">
          {top ? (
            ladderHeadlineFor(top, voice.role === 'coach' ? voice.first : null).replace('the Tour', tourName)
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
    </section>
  );
}

/** One part of the round: its strokes against the Tour on a thin bar, and "Because" opening the reads behind it in place. */
function LadderRow({ r, open, onToggle, readsFailed, voice }: { r: ChLadderRow; open: boolean; onToggle: () => void; readsFailed: boolean; voice: ChViewVoice }) {
  const id = `ch-hs-ld-${r.id}`;
  const canOpen = !readsFailed && r.causes.length > 0;
  return (
    <li className={'ch-hs-ld__r' + (r.sense ? ' is-' + r.sense : ' is-none')}>
      <div className="ch-hs-ld__h">
        <h3>{r.label}</h3>
        <span className="ch-hs-ld__v ch-num">{r.strokes ?? '—'}</span>
      </div>
      {r.strokes != null ? (
        <div className="ch-hs-ld__bar" aria-hidden="true">
          <i style={{ width: `${r.pct}%` }} />
        </div>
      ) : (
        <p className="ch-hs-ld__miss" data-ch-code="CH-13374">
          {r.missing}
        </p>
      )}
      {canOpen ? (
        <>
          <button type="button" className="ch-hs-ld__why" aria-expanded={open} aria-controls={`${id}-b`} onClick={onToggle}>
            <span>Because</span>
            <span className="ch-hs-ld__n ch-num">
              {r.causes.length} {r.causes.length === 1 ? 'open read' : 'open reads'}
            </span>
            <Icon icon={open ? ChevronUp : ChevronDown} size={15} />
          </button>
          {/* Opens in place on height and opacity (base, --ch-ease; review 7.6); closed, it is out of the reading order. */}
          <div id={`${id}-b`} className="ch-hs-ld__b" data-open={open ? 'true' : 'false'} aria-hidden={open ? undefined : true} inert={!open}>
            <ul>
              {r.causes.map((c) => (
                <li key={c.id}>
                  <a href={diveReadHref(c.id, voice)}>{c.title}</a>
                  {c.line && <p>{c.line}</p>}
                  {c.firmness && <em>{c.firmness}</em>}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        // A part with no figure already says why in words; "No open read" is said only beside a figure.
        !readsFailed && r.strokes != null && <p className="ch-hs-ld__none">No open read here.</p>
      )}
    </li>
  );
}

/**
 * Where strokes go (design call, Standing; review 7.4): four flush rows, Off the tee, Approach, Around the green and Putting, each
 * the strokes a round it gains or loses against the Tour, with a true minus, a thin bar (losses amber, gains green) and "Because"
 * opening the open reads behind it. One row opens at a time. It replaces "Most to gain".
 */
function Ladder({ s, voice = PLAYER_VOICE }: { s: ChStanding; voice?: ChViewVoice }) {
  const [open, setOpen] = useState<string | null>(null);
  const tourName = s.tour === 'Tour' ? 'the Tour' : 'the LPGA Tour';
  return (
    // Drawn as a group of the page (its head over the rule, flush rows), so it reads as the first section, not another card.
    <section className="ch-hs-g ch-hs-ld" aria-labelledby="ch-hs-ld-t">
      <div className="ch-hs-g__h">
        <div className="ch-hs-g__t">
          <h2 id="ch-hs-ld-t">Where strokes go</h2>
        </div>
        <p>Strokes a round against {tourName}, from {voice.role === 'coach' ? `${voice.first}’s` : 'your'} strokes gained.</p>
      </div>
      <ol className="ch-hs-rows">
        {s.ladder.rows.map((r) => (
          <LadderRow key={r.id} r={r} open={open === r.id} readsFailed={s.ladder.readsFailed} voice={voice} onToggle={() => setOpen((v) => (v === r.id ? null : r.id))} />
        ))}
      </ol>
      {s.ladder.readsFailed && (
        <p className="ch-hs-ld__fail" data-ch-code="CH-13273">
          The reads behind these didn’t load, so nothing opens under them. The strokes are not affected. Try again in a moment.
        </p>
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
 *
 * `game`: "How you play", the Game profile folded in as Standing's last section (CH-13915), read on its own beside the rows; absent,
 * the section is not drawn. `at`: `game` when the address was Game profile's (`?view=profile`), which opens the page there.
 */
export function Standing({ load, voice = PLAYER_VOICE, game, at }: { load: ChViewLoad<ChStanding>; voice?: ChViewVoice; game?: ChGameLoad; at?: 'game' }) {
  const phone = useChPhone();
  useLandOnGame(at);
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
                ? `Standing puts ${f}’s stats next to the Tour and the team, and refreshes overnight.${s.rounds ? ` ${f} has posted ${plural(s.rounds, 'round')} so far.` : ''} It fills in once ${f}’s first rounds are in.`
                : `Standing puts your stats next to the Tour and your team. It fills in once your first rounds are in, and refreshes overnight.${s.rounds ? ` You have posted ${plural(s.rounds, 'round')}.` : ''}`
            }
            action={
              startHref ? (
                <Button variant="primary" leftIcon={Plus} href={startHref.href}>
                  {startHref.label}
                </Button>
              ) : undefined
            }
          />
          {/* With no stats yet the page is its empty state; how they play is drawn under it once a measure has a read, or when its
              read failed, so a failed read is said (CH-13260) and never shown as nothing to read. */}
          {game && (game.status === 'failed' || game.data.state !== 'empty') && <HowYouPlay load={game} voice={voice} />}
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
          <Ladder s={s} voice={voice} />
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
          {game && <HowYouPlay load={game} voice={voice} />}
          {f ? (
            <KeepReading
              id="ch-hs-next-t"
              title={`Also for ${f}`}
              line={`This is where ${f} stands and how ${f} plays. The Deep dive says what is behind the biggest gaps.`}
              items={[{ href: helmViewHref('deep-dive', voice), title: 'Deep dive', note: `The insights behind ${f}’s biggest gaps` }]}
            />
          ) : (
            <KeepReading
              id="ch-hs-next-t"
              line="This is where you stand and how you play. The Deep dive says what is behind your biggest gaps."
              items={[{ href: PLAYER_HELM_HREF['deep-dive'], title: 'Deep dive', note: 'The insights behind your biggest gaps' }]}
            />
          )}
        </SectionBoundary>
      )}
    </PlayerHelmFrame>
  );
}
