'use client';

import { MessageSquare, Flag } from 'lucide-react';
import { useMemo } from 'react';
import { LIVE_COPY, MOMENTS_TITLE } from '../../live/copy';
import { laneFreshness, laneSubline, nextHole, orderedHoles, thruText, toParText, toParWords, type LiveHole, type LiveLane, type LiveMoment } from '../../live/model';
import { formatClock } from '../../lib/dates';
import { firstName } from '../../lib/names';
import { NoData } from '../../ui/NoData';
import { rebuiltHref } from '../../shell/nav';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { ScoreMark } from '../../ui/ScoreMark';
import { Avatar } from '../../ui/Avatar';
import { useChClockText } from '../../lib/use-clock';
import { messagesPrefillHref } from '../messages/prefill';
import '../../styles/live.css';

/**
 * One player's round, in a sheet on the phone and a panel on a wide screen (4.3). Where they are is a hole, never a
 * map position: nothing here reads location. The coach gets Message (prefilled, never sent) and, for a qualifier, Open
 * qualifier; a teammate's read-only sheet gets neither (4.5).
 */

const sum = (xs: Array<number | null>) => (xs.some((x) => x == null) ? null : xs.reduce<number>((a, b) => a + (b ?? 0), 0));

/** The scorecard as two real tables (7): hole, par and score by row header, a nine each, one 11-column grid of cells. */
export function LiveScorecard({ lane }: { lane: LiveLane }) {
  const byNumber = new Map(orderedHoles(lane).map((h) => [h.n, h]));
  const nines: Array<{ label: string; cap: string; holes: number[] }> = [{ label: 'Front nine', cap: 'Out', holes: [1, 2, 3, 4, 5, 6, 7, 8, 9] }];
  if (lane.holesPlanned === 18) nines.push({ label: 'Back nine', cap: 'In', holes: [10, 11, 12, 13, 14, 15, 16, 17, 18] });
  return (
    <div className="ch-lv-scgrid">
      {nines.map((nine) => {
        const cells = nine.holes.map((n): LiveHole => byNumber.get(n) ?? { n, par: null, yds: null, score: null, at: null });
        const outPar = sum(cells.map((c) => c.par));
        const scored = cells.filter((c) => c.score != null);
        const outScore = scored.length ? scored.reduce((a, c) => a + (c.score ?? 0), 0) : null;
        return (
          <table key={nine.label} className="ch-lv-sc">
            <caption className="ch-sr-only">{nine.label}</caption>
            <thead>
              <tr>
                <th scope="row">Hole</th>
                {cells.map((c) => (
                  <th key={c.n} scope="col" className="ch-num">
                    {c.n}
                  </th>
                ))}
                <th scope="col">{nine.cap}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Par</th>
                {cells.map((c) => (
                  <td key={c.n} className="ch-num">
                    {c.par ?? <NoData />}
                  </td>
                ))}
                <td className="ch-num">{outPar ?? <NoData />}</td>
              </tr>
              <tr>
                <th scope="row">Score</th>
                {cells.map((c) => (
                  <td key={c.n}>
                    <ScoreMark score={c.score} par={c.par} size="sm" />
                  </td>
                ))}
                <td className="ch-num">{outScore ?? <NoData />}</td>
              </tr>
            </tbody>
          </table>
        );
      })}
    </div>
  );
}

/**
 * Where they are (4.3 item 3): the holes of the course in two rows of nine, and a token on the hole each player plays
 * next. In a player's sheet it holds one token; in the desktop panel with nothing selected, everyone's (CH-16618).
 */
export function CourseRibbon({ lanes, label }: { lanes: readonly LiveLane[]; label: string }) {
  const rows = [Array.from({ length: 9 }, (_, i) => i + 1), Array.from({ length: 9 }, (_, i) => i + 10)];
  const at = useMemo(() => {
    const m = new Map<number, LiveLane[]>();
    for (const l of lanes) {
      const n = nextHole(l)?.hole;
      if (n != null) m.set(n, [...(m.get(n) ?? []), l]);
    }
    return m;
  }, [lanes]);
  return (
    <div className="ch-lv-ribbon" role="group" aria-label={label}>
      {rows.map((row, r) => (
        <div key={r} className="ch-lv-ribbon__row">
          {row.map((n) => (
            <span key={n} className="ch-lv-ribbon__hole ch-num" data-here={at.has(n) ? '' : undefined}>
              <span>{n}</span>
              {(at.get(n) ?? []).slice(0, 3).map((l) => (
                <span key={l.roundId} className="ch-lv-ribbon__token" title={l.name}>
                  {l.initials.slice(0, 2)}
                </span>
              ))}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function PlayerLiveBody({
  lane,
  moments,
  now,
  coach,
  hours,
}: {
  lane: LiveLane;
  moments: readonly LiveMoment[];
  now: number | null;
  coach: boolean;
  hours: '12' | '24';
}) {
  const clock = useChClockText();
  const next = nextHole(lane);
  const f = now == null ? { kind: 'fresh' as const } : laneFreshness(lane, now);
  const msgRaw = coach ? messagesPrefillHref({ players: [lane.playerId], draft: '', title: lane.name }) : null;
  const msg = msgRaw ? rebuiltHref(msgRaw, 'coach') : null;
  const qualifierHref = coach && lane.roundType === 'qualifier' && lane.qualifierId ? rebuiltHref(`/golf/dashboard/qualifiers/${lane.qualifierId}`, 'coach') : null;
  const list = moments.filter((m) => m.roundId === lane.roundId).slice(0, 8);
  return (
    <div className="ch-lv-body" data-hours={hours}>
      <div className="ch-lv-figure">
        <span className={'ch-lv-figure__par ch-num' + (lane.toPar != null && lane.toPar < 0 ? ' is-under' : '')} role="img" aria-label={toParWords(lane.toPar)}>
          {toParText(lane.toPar)}
        </span>
        <span className="ch-lv-figure__side">
          <span className="ch-num">{thruText(lane)}</span>
          {next && (
            <span className="ch-lv-figure__next" data-ch-code="CH-16616">
              {LIVE_COPY.nextHole(next.hole, next.par, next.yds)}
            </span>
          )}
        </span>
      </div>
      {f.kind === 'stale' && (
        <p className="ch-lv-note" data-tone="warn" data-ch-code="CH-16672">
          {LIVE_COPY.lastUpdate(f.minutes)}
        </p>
      )}
      {f.kind === 'quiet' && (
        <p className="ch-lv-note" data-ch-code="CH-16673">
          {LIVE_COPY.noUpdateSince(f.since, hours)}
        </p>
      )}
      <CourseRibbon lanes={[lane]} label={`${lane.name}, where they are`} />
      <LiveScorecard lane={lane} />
      {list.length > 0 && (
        <section className="ch-lv-moments" aria-label={MOMENTS_TITLE} data-ch-code="CH-16617">
          <h3>{MOMENTS_TITLE}</h3>
          <ol>
            {list.map((m) => (
              <li key={m.id}>
                <span>{m.text}</span>
                <time dateTime={m.at} className="ch-num">
                  {clock(formatClock(m.at))}
                </time>
              </li>
            ))}
          </ol>
        </section>
      )}
      <details className="ch-lv-read">
        <summary>How to read this</summary>
        <p>Circles are under par, a dot is par, squares are over par. Filled squares are double bogey or worse.</p>
      </details>
      {coach && (msg || qualifierHref) && (
        <div className="ch-lv-actions">
          {msg && (
            <Button variant="secondary" leftIcon={MessageSquare} href={msg}>
              Message {firstName(lane.name)}
            </Button>
          )}
          {qualifierHref && (
            <Button variant="secondary" leftIcon={Flag} href={qualifierHref}>
              Open qualifier
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** The sheet (phone, and a window under 1080 px wide). */
export function PlayerLiveSheet({
  lane,
  moments,
  now,
  coach,
  hours,
  onClose,
}: {
  lane: LiveLane | null;
  moments: readonly LiveMoment[];
  now: number | null;
  coach: boolean;
  hours: '12' | '24';
  onClose: () => void;
}) {
  const sub = lane ? [laneSubline(lane).text.split(' · ')[0], lane.roundType === 'qualifier' && lane.qualifierRound != null ? `Round ${lane.qualifierRound}` : null, lane.courseName].filter(Boolean).join(' · ') : '';
  return (
    <Modal open={!!lane} onClose={onClose} title={lane?.name ?? 'Live round'} description={sub} width={520}>
      {lane && <PlayerLiveBody lane={lane} moments={moments} now={now} coach={coach} hours={hours} />}
    </Modal>
  );
}

/** The desktop panel's head (the sheet gets its head from Modal). */
export function PlayerPanelHead({ lane }: { lane: LiveLane }) {
  const sub = [laneSubline(lane).text.split(' · ')[0], lane.roundType === 'qualifier' && lane.qualifierRound != null ? `Round ${lane.qualifierRound}` : null, lane.courseName].filter(Boolean).join(' · ');
  return (
    <header className="ch-lv-panel__head">
      <Avatar name={lane.name} id={lane.playerId} size="md" />
      <div>
        <h2>{lane.name}</h2>
        <p>{sub}</p>
      </div>
    </header>
  );
}
