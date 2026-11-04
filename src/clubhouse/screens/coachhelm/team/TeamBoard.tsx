'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { courseReads, stationOrder, readsDrawn, type ChStation, type ChTeamBoardData, type ChTeamPlayer } from '../../../data/coachhelm-team-shape';
import { formatSigned } from '../../../lib/format';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { Button } from '../../../ui/Button';
import { LargeTitle, LargeTitleContext } from '../../../ui/LargeTitle';
import { rebuiltHref } from '../../../shell/nav';
import { CoachHelmTabs, COACHHELM_HREF, type CoachHelmView } from '../chat/SubTabs';
import { useViewSwitch } from '../use-view-switch';
import { Modal } from '../../../ui/Modal';
import { useFocusActions } from '../parts';
import { LIVE_COACHHELM_WRITES, type ChCoachHelmWrites } from '../writes';
import { RecheckReads } from '../Recheck';
import type { ChTeamStory } from '../../../data/coachhelm-team-shape';
import { RecordCard, RosterCard, WorkingCard } from './Cards';
import { CourseCard } from './CourseCard';
import { Huddle } from './Huddle';
import { Part } from './Part';
import { StoriesCard, StoryDeskPanel } from './Stories';
import { Inspector } from './Inspector';
import { CourseSheet, GonePanel, PlayerPanel, ReadPanel } from './panels';
import { SpotCard } from './SpotCard';
import { StationControl } from './StationControl';
import { TeamHole } from './TeamHole';

export type TeamStation = ChStation | 'course';

export interface TeamBoardProps {
  data: ChTeamBoardData;
  /** The server's flips (`team-board/flag.ts`): client code never reads a flag (W-TEAM-19). */
  courseTab?: boolean;
  writes?: ChCoachHelmWrites;
  /** The server's answers for the cross-lane links (`coachhelm_read_v1`, `coachhelm_player_file_v1`). */
  readOn?: boolean;
  fileOn?: boolean;
  initialPlayer?: string;
  initialInsight?: string;
  initialStation?: TeamStation;
  /** The hole's Try again when the reads didn't load. */
  onRetry?: () => void;
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
export function TeamBoard({ data, courseTab = true, writes = LIVE_COACHHELM_WRITES, readOn = false, fileOn = false, initialPlayer, initialInsight, initialStation, onRetry }: TeamBoardProps) {
  const phone = useChPhone();
  const sw = useViewSwitch<CoachHelmView>('board', (v) => COACHHELM_HREF[v], Object.keys(COACHHELM_HREF) as CoachHelmView[]);
  const leak = useMemo(() => stationOrder(data.stations)[0] ?? 'approach', [data.stations]);
  const [station, setStation] = useState<TeamStation>(initialStation ?? leak);
  const top = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState<{ kind: 'read' | 'player' | 'course'; id: string } | { kind: 'story'; id: string; story: ChTeamStory; week: string } | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const fa = useFocusActions(writes);
  // `?player=` and `?open=read&insight=`: once, after first paint, and off the address by replace (AC-TEAM-23, W-TEAM-14). An id not on the board opens
  // the gone card (a read) or the plain board (a player), with no extra query.
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current) return;
    linked.current = true;
    if (initialInsight) setOpen({ kind: 'read', id: initialInsight });
    else if (initialPlayer && data.players.list.some((p) => p.id === initialPlayer)) setOpen({ kind: 'player', id: initialPlayer });
    if (initialInsight || initialPlayer) window.history.replaceState(null, '', COACHHELM_HREF.board);
  }, [data.players.list, initialInsight, initialPlayer]);
  const openRead = (id: string) => setOpen({ kind: 'read', id });
  const openPlayer = (id: string) => setOpen({ kind: 'player', id });
  const openCourse = (id: string) => setOpen({ kind: 'course', id });
  const storyAction = (s: ChTeamStory) => {
    if (s.kind === 'working') {
      setOpen(null);
      document.querySelector('[data-ch-team-card="working"]')?.scrollIntoView({ block: 'start' });
    } else if (s.kind === 'theme') openPlayer(s.playerId);
    else window.location.assign(s.href);
  };
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
  const skeletonCard = <span className="skl" style={{ height: 120, borderRadius: 16 }} />;
  const today = (
    <Part value={data.brief} fallback={skeletonCard}>
      {(b) => (
        <StoriesCard
          brief={b.status === 'ok' ? b.value : null}
          themes={null}
          failed={b.status === 'failed'}
          onRetry={onRetry}
          players={list}
          phone={phone}
          onDesk={(s) => setOpen({ kind: 'story', id: s.id, story: s, week: b.status === 'ok' ? b.value.week : 'This week' })}
          onAction={storyAction}
        />
      )}
    </Part>
  );
  const proposed = list.flatMap((player) => player.reads.needs.filter((read) => fa.assigned[read.id] || read.assigned === 'proposed').map((read) => ({ player, read })));
  const working = (
    <Part value={data.brief} fallback={skeletonCard}>
      {(b) => <WorkingCard working={b.status === 'ok' ? b.value.working : []} proposed={proposed} failed={b.status === 'failed'} onRetry={onRetry} />}
    </Part>
  );
  const huddle = <Huddle data={data} onPlayer={openPlayer} />;
  const roster = <RosterCard players={list} phone={phone} onPlayer={openPlayer} />;
  const record = (
    <Part value={data.record} fallback={skeletonCard}>
      {(r) => <RecordCard part={r} desk={!phone} />}
    </Part>
  );
  const spot =
    station === 'course' ? (
      <CourseCard data={data} onRead={openRead} onCourse={openCourse} onRetry={onRetry} />
    ) : (
      <SpotCard data={data} station={station} onRead={openRead} onPlayer={openPlayer} />
    );
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
        {roster}
      </>
    ) : (
      <div className="dgrid">
        <div className="dcol">
          <EmptyHero data={data} phone={false} />
        </div>
        <div className="dcol">
          <EmptySteps />
        </div>
        {roster}
        {record}
      </div>
    );
  } else if (phone) {
    body = (
      <>
        {today}
        <Hero data={data} station={station} setStation={setStation} phone course={course} courseTab={courseTab} />
        {spot}
        {huddle}
        {roster}
        {working}
        {record}
      </>
    );
  } else {
    body = (
      <div className="dgrid">
        <div className="dcol">
          <Hero data={data} station={station} setStation={setStation} phone={false} course={course} courseTab={courseTab} />
          {spot}
        </div>
        <div className="dcol">
          {today}
          {working}
          {huddle}
        </div>
        {roster}
        {record}
      </div>
    );
  }

  const list2 = data.players.list;
  const openPanel = (() => {
    if (!open) return null;
    if (open.kind === 'read') {
      const owner = list2.find((p) => [...p.reads.needs, ...p.reads.working].some((r) => r.id === open.id));
      const read = owner && [...owner.reads.needs, ...owner.reads.working].find((r) => r.id === open.id);
      if (!owner || !read) return <GonePanel onClose={close} />;
      return <ReadPanel read={read} player={owner} fa={fa} missing={data.missing} readOn={readOn} roster={list2} onClose={close} />;
    }
    if (open.kind === 'player') {
      const p = list2.find((x) => x.id === open.id);
      return p ? <PlayerPanel player={p} data={data} onRead={openRead} fileOn={fileOn} onClose={close} /> : null;
    }
    if (open.kind === 'story') return <StoryDeskPanel story={open.story} week={open.week} onClose={close} onAction={storyAction} />;
    const row = data.course.history?.courses.find((c) => c.id === open.id);
    return row ? <CourseSheet row={row} data={data} onPlayer={openPlayer} onRead={openRead} onClose={close} /> : null;
  })();

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
      {/* W-TEAM-16: today's Re-check, under the board, not in the record card. */}
      {!data.off && data.roster.count > 0 && <RecheckReads players={data.roster.count} />}
      {phone ? (
        <Modal open={!!openPanel} onClose={close} title="Details" className="ch-htb-sheet" initialFocus=".xb">
          <div className="ins">{openPanel}</div>
        </Modal>
      ) : (
        <Inspector open={!!openPanel} onClose={close} label="Details">
          {openPanel}
        </Inspector>
      )}
    </main>
  );
}
