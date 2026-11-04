'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { courseReads, stationOrder, readsDrawn, type ChStation, type ChTeamBoardData, type ChTeamPlayer } from '../../../data/coachhelm-team-shape';
import { formatSigned } from '../../../lib/format';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { Button } from '../../../ui/Button';
import { LargeTitle, LargeTitleContext } from '../../../ui/LargeTitle';
import { rebuiltHref } from '../../../shell/nav';
import { CoachHelmTabs, COACHHELM_HREF, type CoachHelmView } from '../chat/SubTabs';
import { useViewSwitch } from '../use-view-switch';
import { StationControl } from './StationControl';
import { TeamHole } from './TeamHole';

export type TeamStation = ChStation | 'course';

export interface TeamBoardProps {
  data: ChTeamBoardData;
  /** The server's flips (`team-board/flag.ts`): client code never reads a flag (W-TEAM-19). */
  courseTab?: boolean;
  initialPlayer?: string;
  initialStation?: TeamStation;
  /** The hole's Try again when the reads didn't load. */
  onRetry?: () => void;
  /** Later PRs' cards: each receives the live station. */
  slots?: {
    today?: ReactNode;
    spot?: (s: { station: TeamStation; phone: boolean }) => ReactNode;
    huddle?: ReactNode;
    roster?: ReactNode;
    working?: ReactNode;
    record?: ReactNode;
  };
}

function Hero({
  data,
  station,
  setStation,
  phone,
  course,
  courseTab,
}: {
  data: ChTeamBoardData;
  station: TeamStation;
  setStation: (s: TeamStation) => void;
  phone: boolean;
  course: number;
  courseTab: boolean;
}) {
  const list = data.players.list;
  const figure = (
    <div className="hn">
      <b className="ch-num">{formatSigned(data.teamTotal.strokes)}</b>
      <span>
        a round {data.team.baselineLabel}
        <br />
        This season · {data.teamTotal.rounds} rounds
      </span>
    </div>
  );
  const chips = <StationControl value={station} onChange={setStation} stations={data.stations} courseReads={course} courseTab={courseTab} />;
  return (
    <section className="feat hero ch-htb-feat" data-ch-team-card="hole" aria-label={`Where ${data.team.name} gives back strokes`}>
      {phone ? (
        <>
          <div className="hk">Where {data.team.name} gives back strokes</div>
          {figure}
        </>
      ) : (
        <div className="top">
          <div>
            <div className="hk">Where {data.team.name} gives back strokes</div>
            {figure}
          </div>
          {chips}
        </div>
      )}
      <div className={'hole' + (station === 'course' ? ' offh' : '')}>
        <TeamHole stations={data.stations} players={list} station={station} onStation={setStation} orientation={phone ? 'v' : 'h'} />
      </div>
      {phone && chips}
      <div className="hfoot">
        <span>Players stand where they lose most. Hollow: fewer than 5 rounds.</span>
        {!phone && <span>Tap a spot</span>}
      </div>
    </section>
  );
}

function EmptyHero({ data, phone }: { data: ChTeamBoardData; phone: boolean }) {
  return (
    <section className="feat hero ch-htb-feat" data-ch-team-card="hole">
      <div className="hk">Where {data.team.name} gives back strokes</div>
      <div className="hn">
        <b>No rounds yet</b>
      </div>
      <p className="emptyh">The hole fills in after the team’s first round this season. Each spot then shows what it costs the team against Tour.</p>
      <div className="hole" style={{ opacity: 0.55 }}>
        <TeamHole stations={data.stations} players={[]} station="approach" onStation={() => {}} orientation={phone ? 'v' : 'h'} bare />
      </div>
    </section>
  );
}

function EmptySteps() {
  return (
    <section className="card">
      <div className="ch">
        <h4>What fills in, and when</h4>
      </div>
      <div className="steps">
        <div>
          <p>
            <b>After the first round</b>
            <span>The hole and each player’s four-area figures, against Tour.</span>
          </p>
        </div>
        <div>
          <p>
            <b>As rounds add up</b>
            <span>Players are drawn hollow until they have 5 rounds on file. CoachHelm reads a spot once there are enough shots to stand behind it.</span>
          </p>
        </div>
        <div>
          <p>
            <b>When three players share a step</b>
            <span>A shared pattern shows on that spot</span>
          </p>
        </div>
      </div>
    </section>
  );
}

/** The coach's Team view: the green bar untouched, the switch, the title, then one green feature card (the hole). */
export function TeamBoard({ data, courseTab = true, initialStation, slots, onRetry }: TeamBoardProps) {
  const phone = useChPhone();
  const sw = useViewSwitch<CoachHelmView>('board', (v) => COACHHELM_HREF[v], Object.keys(COACHHELM_HREF) as CoachHelmView[]);
  const leak = useMemo(() => stationOrder(data.stations)[0] ?? 'approach', [data.stations]);
  const [station, setStation] = useState<TeamStation>(initialStation ?? leak);
  const top = useRef<HTMLElement | null>(null);
  const list: ChTeamPlayer[] = data.players.list;
  const noRounds = data.teamTotal.rounds === 0;
  const tabs = data.off ? null : <CoachHelmTabs active={sw.shown} onGo={sw.go} boardLabel="Team" />;
  const context = data.roster.count === 0 ? 'No players yet' : noRounds ? `${data.roster.count} players · no rounds yet this season` : `${data.roster.count} players · ${data.teamTotal.rounds} rounds this season · ${readsDrawn(list)} open reads`;
  const head = (
    <header className="lt">
      <LargeTitle>{data.team.name || 'CoachHelm'}</LargeTitle>
      <LargeTitleContext>{context}</LargeTitleContext>
    </header>
  );
  const course = courseReads(list).length;
  const failedHole = (
    <section className="card ch-htb-failed" role="alert" data-ch-team-card="hole">
      <div className="notice">
        <span>
          <b>The team’s reads didn’t load</b>
          <span>Nothing here is wrong with your players’ rounds. Try again.</span>
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          )}
        </span>
      </div>
    </section>
  );

  let body: ReactNode;
  if (data.roster.count === 0 && !data.roster.error) {
    body = (
      <section className="card ch-htb-noplayers" data-ch-team-card="noplayers">
        <div className="ch">
          <h4>Add your players to see the team</h4>
        </div>
        <div className="cb">
          <Button variant="secondary" href={rebuiltHref('/golf/dashboard/roster', 'coach')}>
            Go to Roster
          </Button>
        </div>
      </section>
    );
  } else if (data.players.error || data.roster.error) {
    body = failedHole;
  } else if (noRounds) {
    body = phone ? (
      <>
        <EmptyHero data={data} phone />
        <EmptySteps />
        {slots?.roster}
      </>
    ) : (
      <div className="dgrid">
        <div className="dcol">
          <EmptyHero data={data} phone={false} />
        </div>
        <div className="dcol">
          <EmptySteps />
        </div>
        {slots?.roster}
        {slots?.record}
      </div>
    );
  } else if (phone) {
    body = (
      <>
        {slots?.today}
        <Hero data={data} station={station} setStation={setStation} phone course={course} courseTab={courseTab} />
        {slots?.spot?.({ station, phone })}
        {slots?.huddle}
        {slots?.roster}
        {slots?.working}
        {slots?.record}
      </>
    );
  } else {
    body = (
      <div className="dgrid">
        <div className="dcol">
          <Hero data={data} station={station} setStation={setStation} phone={false} course={course} courseTab={courseTab} />
          {slots?.spot?.({ station, phone })}
        </div>
        <div className="dcol">
          {slots?.today}
          {slots?.working}
          {slots?.huddle}
        </div>
        {slots?.roster}
        {slots?.record}
      </div>
    );
  }

  return (
    <main ref={top} className={'ch-htb ' + (phone ? 'is-phone' : 'is-desk')} aria-busy={sw.pending || undefined} data-ch-screen="coachhelm-team">
      {phone && <PhoneTop start title="CoachHelm" />}
      {phone ? (
        <div className="sheet">
          {tabs}
          {head}
          {body}
        </div>
      ) : (
        <div className="ch-htb-desk">
          <div className="ch-htb-deskhead">
            {head}
            {tabs}
          </div>
          {body}
        </div>
      )}
    </main>
  );
}
