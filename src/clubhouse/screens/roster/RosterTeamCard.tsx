import { Avatar } from '../../ui/Avatar';
import { formatFixed } from '../../lib/format';
import { NoData } from '../../ui/NoData';
import type { ChRosterPlayer } from '../../data/roster';
import { classMix, classPast, classUnset, teamCardFigures, yearKeyOf, type RosterClock } from './format';
import { plural, pluralWord } from '../../lib/plural';

/** Coach or player, the same card; a player's holds neither injured, waiting nor the top five, in the DOM or in the props. */
type Props =
  | { viewer: 'coach'; season: string | null; players: ChRosterPlayer[]; waiting: number | null; statsError: boolean; clock: RosterClock }
  | { viewer: 'player'; season: string | null; players: ReadonlyArray<{ gradYear: number | null }>; clock: RosterClock };

/**
 * The Roster's one feature card (classes-roster-home 06 7.2): the season, the counts, the total, the class mix in year colours with its
 * legend and, for a coach, the top five's coins and mean. Fills `--ch-frame`; flat, no radial light.
 */
export function RosterTeamCard(props: Props) {
  const { season, players, clock } = props;
  const coach = props.viewer === 'coach' ? teamCardFigures(props.players, props.statsError) : null;
  const total = players.length;
  const active = coach ? coach.active : total;
  const injured = coach?.injured ?? 0;
  const waiting = props.viewer === 'coach' ? props.waiting : null;
  const mix = classMix(players, clock);
  const counts = [`${active} active`, injured > 0 ? `${injured} injured` : null, waiting ? `${waiting} waiting` : null].filter(Boolean).join(' · ');
  const title = season ? `${season} season` : null;
  // W23: players with no class year are counted too ("1 not set"), so the split adds up to the roster. F-0022: a past year is a year,
  // named as one ("2 Class of 2026"), on the neutral tone the coins keep for it.
  const past = classPast(players, clock);
  const unset = classUnset(players, clock);
  const mixWords = [...mix.filter((m) => m.count > 0).map((m) => `${m.count} ${m.label}`), ...past.map((y) => `${y.count} ${y.label}`), unset > 0 ? `${unset} not set` : null].filter(Boolean).join(', ');
  return (
    <section className="ch-rs-tcard" role="group" aria-label={`${title ?? 'Season not set'}. ${plural(total, 'player')}. ${counts}.`}>
      <div className="ch-rs-tcard__top">
        <span className="ch-rs-tcard__h">
          <b>{title ?? <NoData />}</b>
          <span className="ch-num">{counts}</span>
        </span>
        <span className="ch-rs-tcard__n">
          <b className="ch-num">{total}</b>
          <span>{pluralWord(total, 'player', 'players')}</span>
        </span>
      </div>
      {mixWords && (
        <>
          <span className="ch-rs-mix" role="img" aria-label={mixWords}>
            {mix.filter((m) => m.count > 0).map((m) => (
              <i key={m.key} data-year={m.key} style={{ flexGrow: m.count }} />
            ))}
            {past.map((y) => (
              <i key={y.year} data-year="none" style={{ flexGrow: y.count }} />
            ))}
            {unset > 0 && <i data-year="none" style={{ flexGrow: unset }} />}
          </span>
          <span className="ch-rs-mix__lg" aria-hidden="true">
            {mix.map((m) => (
              <span key={m.key} data-year={m.key}>
                <i />
                <b className="ch-num">{m.count}</b> {m.label}
              </span>
            ))}
            {past.map((y) => (
              <span key={y.year} data-year="none">
                <i />
                <b className="ch-num">{y.count}</b> {y.label}
              </span>
            ))}
            {unset > 0 && (
              <span data-year="none">
                <i />
                <b className="ch-num">{unset}</b> not set
              </span>
            )}
          </span>
        </>
      )}
      {coach?.topFive && (
        <div className="ch-rs-tcard__f" role="group" aria-label={`Top five average ${formatFixed(coach.topFiveMean)}`}>
          <span className="ch-rs-tcard__coins" aria-hidden="true">
            {coach.topFive.map((p) => (
              <Avatar key={p.id} name={p.name} id={p.id} size="sm" year={yearKeyOf(p.gradYear, clock)} />
            ))}
          </span>
          <span>Top five</span>
          <em className="ch-num">{formatFixed(coach.topFiveMean)} avg</em>
        </div>
      )}
    </section>
  );
}
