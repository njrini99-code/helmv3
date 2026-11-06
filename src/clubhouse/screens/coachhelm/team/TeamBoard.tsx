'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { boardPlayerCount, boardPlayerWords, courseReads, stationOrder, readsDrawn, type ChStation, type ChTeamBoardData, type ChTeamPlayer } from '../../../data/coachhelm-team-shape';
import { formatSigned, windowWords } from '../../../lib/format';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { Button } from '../../../ui/Button';
import { useRouter } from 'next/navigation';
import { CoachHelmHead } from '../CoachHelmHead';
import { useChSessionState } from '../../../lib/session-state';
import { plural } from '../../../lib/plural';
import { Notice } from './parts';
import { rebuiltHref } from '../../../shell/nav';
import { CoachHelmOffNotice } from '../CoachBoard';
import { CoachHelmTabs, COACHHELM_HREF, type CoachHelmView } from '../chat/SubTabs';
import { useViewSwitch } from '../use-view-switch';
import { Modal } from '../../../ui/Modal';
import { useFocusActions } from '../parts';
import { LIVE_COACHHELM_WRITES, type ChCoachHelmWrites } from '../writes';
import { RecheckReads } from '../Recheck';
import { storiesOf, type ChStoryRound, type ChTeamStory } from '../../../data/coachhelm-team-shape';
import type { ChCoachBrief } from '../../../data/coachhelm-coach-brief-shape';
import type { ChDiveTheme } from '../../../data/coachhelm-dive-shape';
import { RecordCard, RosterCard, WorkingCard } from './Cards';
import { CourseCard } from './CourseCard';
import { Huddle } from './Huddle';
import { Part } from './Part';
import { StoriesCard, StoryDeskPanel, weekdayOf } from './Stories';
import { Inspector } from './Inspector';
import { CourseSheet, GonePanel, PlayerPanel, ReadPanel } from './panels';
import { SpotCard } from './SpotCard';
import { StationControl } from './StationControl';
import { TeamHole } from './TeamHole';

export type TeamStation = ChStation | 'course';
export type TeamBoardOpen = { kind: 'read' | 'player' | 'course'; id: string } | { kind: 'story'; id: string; story: ChTeamStory; week: string };

export interface TeamBoardProps {
  data: ChTeamBoardData;
  /** The server's flips (`team-board/flag.ts`): client code never reads a flag (W-TEAM-19). */
  courseTab?: boolean;
  writes?: ChCoachHelmWrites;
  /** The server's answers for the cross-lane links (`coachhelm_read_v1`, `coachhelm_player_file_v1`). */
  readOn?: boolean;
  askOn?: boolean;
  fileOn?: boolean;
  initialPlayer?: string;
  initialInsight?: string;
  initialStation?: TeamStation;
  /** The preview's `&open=` and `&all=1`: what is open on the first paint. */
  initialOpen?: TeamBoardOpen;
  initialAll?: boolean;
  /** The hole's Try again when the reads didn't load. */
  onRetry?: () => void;
}

/** The figure says which way it points in words as well as colour (QA-7): "+0.5 a round better than Tour". */
function betterOrWorse(strokes: number | null, baseline: string): string {
  if (strokes == null || Math.abs(strokes) < 0.05) return baseline;
  return baseline.replace(/^to /, strokes > 0 ? 'better than ' : 'worse than ');
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
  // The hole's figures are each player's season mean, averaged over the players at the shots floor (coachhelm-team-legs.ts):
  // said here because Home's team's game pools every player's last 10 and reads differently.
  const counted = boardPlayerCount(data.stations);
  const figure = (
    <div className="hn">
      <b className="ch-num">{formatSigned(data.teamTotal.strokes)}</b>
      <span>
        a round {betterOrWorse(data.teamTotal.strokes, data.team.baselineLabel)}
        <br />
        {windowWords('season', data.teamTotal.rounds)}{counted > 0 && ` · ${boardPlayerWords(counted)}`}
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
export function TeamBoard({ askOn = false, data, courseTab = true, writes = LIVE_COACHHELM_WRITES, readOn = false, fileOn = false, initialOpen, initialAll = false, initialPlayer, initialInsight, initialStation, onRetry }: TeamBoardProps) {
  const router = useRouter();
  // Every failed part offers Try again; the route has no function to pass, so the board refreshes itself (FID-TEAM-1).
  const retry = onRetry ?? (() => router.refresh());
  const phone = useChPhone();
  const sw = useViewSwitch<CoachHelmView>('board', (v) => COACHHELM_HREF[v], Object.keys(COACHHELM_HREF) as CoachHelmView[]);
  const leak = useMemo(() => stationOrder(data.stations)[0] ?? 'approach', [data.stations]);
  // Kept across a trip to a player or a read and back (MOB-TEAM-17).
  const [station, setStation] = useChSessionState<TeamStation>('team.station', initialStation ?? leak);
  const top = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState<TeamBoardOpen | null>(initialOpen?.kind === 'story' && phone ? null : (initialOpen ?? null));
  const [rounds, setRounds] = useState<Record<string, ChStoryRound> | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.resolve(data.storyRounds).then((r) => {
      if (live && r?.status === 'ok') setRounds(r.value);
    });
    return () => {
      live = false;
    };
  }, [data.storyRounds]);
  const [weekBrief, setWeekBrief] = useState<ChCoachBrief | null>(null);
  const [storyAsk, setStoryAsk] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.resolve(data.brief).then((b) => {
      if (live && b?.status === 'ok') setWeekBrief(b.value);
    });
    return () => {
      live = false;
    };
  }, [data.brief]);
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
      document.querySelector('[data-ch-team-card="work"]')?.scrollIntoView({ block: 'start' });
    } else if (s.kind === 'theme') openPlayer(s.playerId);
    else {
      // In place, as a coin on the hole does, not a whole page load (FID-TEAM-7).
      const id = s.id.replace(/^read:/, '');
      if (data.players.list.some((p) => p.reads.needs.some((r) => r.id === id) || p.reads.working.some((r) => r.id === id))) openRead(id);
      else router.push(s.href);
    }
  };
  const list: ChTeamPlayer[] = data.players.list;
  const noRounds = data.teamTotal.rounds === 0;
  const tabs = data.off ? null : <CoachHelmTabs active={sw.shown} onGo={sw.go} boardLabel="Team" />;
  const context = data.off ? 'CoachHelm reads the rounds your players post.' : data.roster.count === 0 ? 'No players yet' : noRounds ? `${plural(data.roster.count, 'player')} · no rounds yet this season` : `${plural(data.roster.count, 'player')} · ${plural(data.teamTotal.rounds, 'round')} this season · ${plural(readsDrawn(list), 'open read')}`;
  const head = <CoachHelmHead title={data.team.name || 'CoachHelm'} context={context} scope={data.team.name ? `${data.team.name} · ${plural(data.roster.count, 'player')} · this season` : undefined} tabs={tabs} />;
  const course = courseReads(list).length;
  const skeletonCard = <span className="skl" style={{ height: 120, borderRadius: 16 }} />;
  const today = (
    <Part value={data.brief} fallback={skeletonCard}>
      {(b) => {
        const card = (themes: Record<string, Record<string, ChDiveTheme>> | null) => (
          <StoriesCard
            brief={b.status === 'ok' ? b.value : null}
            themes={themes}
            failed={b.status === 'failed'}
            onRetry={retry}
            players={list}
            phone={phone}
            rounds={rounds}
            autoOpen={initialOpen?.kind === 'story'}
            request={storyAsk}
            onDesk={(s) => setOpen({ kind: 'story', id: s.id, story: s, week: b.status === 'ok' ? b.value.week : 'This week' })}
            onAction={storyAction}
          />
        );
        // Themes come later than the brief; the tiles draw without them until they land.
        return data.themes ? (
          <Part value={data.themes} fallback={card(null)}>
            {(t) => card(t.status === 'ok' ? t.value : null)}
          </Part>
        ) : (
          card(null)
        );
      }}
    </Part>
  );
  const proposed = list.flatMap((player) => player.reads.needs.filter((read) => fa.assigned[read.id] || read.assigned === 'proposed').map((read) => ({ player, read })));
  const working = (
    <Part value={data.brief} fallback={skeletonCard}>
      {(b) => <WorkingCard working={b.status === 'ok' ? b.value.working : []} proposed={proposed} failed={b.status === 'failed'} onRetry={retry} />}
    </Part>
  );
  const huddle = <Huddle data={data} onPlayer={openPlayer} />;
  const roster = <RosterCard players={list} phone={phone} onPlayer={openPlayer} />;
  // In the record card's footer (AC-RECORD-04), and with no record to sit in, in a card of its own under the board: never loose on the page (QA-9).
  const recheck = !data.off && data.roster.count > 0 ? <RecheckReads players={data.roster.count} /> : null;
  const record = (
    <Part value={data.record} fallback={skeletonCard}>
      {(r) => <RecordCard part={r} desk={!phone} recheck={recheck} />}
    </Part>
  );
  const spot =
    station === 'course' ? (
      <CourseCard data={data} initialAll={initialAll} onRead={openRead} onCourse={openCourse} onRetry={retry} />
    ) : (
      <SpotCard data={data} station={station} onRead={openRead} onPlayer={openPlayer} onRetry={retry} />
    );
  const failedHole = (
    <section className="card ch-htb-failed" role="alert" data-ch-team-card="hole">
      <Notice title="The team’s reads didn’t load" body="Nothing here is wrong with your players’ rounds. Try again." onRetry={retry} />
    </section>
  );

  let body: ReactNode;
  // An off board loads nothing (`emptyTeamBoard`), so its zero players mean nothing: CoachHelm being off is the whole page, as on today's board.
  if (data.off) {
    body = <CoachHelmOffNotice off={data.off} />;
  } else if (data.roster.count === 0 && !data.roster.error) {
    body = (
      <section className="card ch-htb-noplayers" data-ch-team-card="noplayers">
        <div className="ch">
          <h4>Add your players to see the team</h4>
        </div>
        <div className="cb">
          <Button variant="secondary" href={rebuiltHref('/golf/dashboard/roster', 'coach') ?? undefined}>
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
      return <ReadPanel askOn={askOn} read={read} player={owner} fa={fa} missing={data.missing} readOn={readOn} roster={list2} onClose={close} />;
    }
    if (open.kind === 'player') {
      const p = list2.find((x) => x.id === open.id);
      return p ? <PlayerPanel player={p} data={data} onRead={openRead} fileOn={fileOn} onClose={close} /> : null;
    }
    // A phone tells its story in the viewer, the tile's own (StoriesCard).
    if (open.kind === 'story' && phone) return null;
    if (open.kind === 'story') return <StoryDeskPanel story={open.story} week={open.week} round={rounds?.[open.story.who] ?? null} player={list2.find((p) => p.name === open.story.who) ?? null} onClose={close} onAction={storyAction} />;
    const row = data.course.history?.courses.find((c) => c.id === open.id);
    if (!row) return null;
    // Only when a This week story came from a round here (AC-CSHEET-05).
    const named = new Map(list2.map((p) => [p.id, p.name]));
    const from = storiesOf(weekBrief, null, named).find((s) => s.kind === 'read' && rounds?.[s.who]?.course === row.name);
    const when = from && rounds?.[from.who];
    return (
      <CourseSheet
        row={row}
        data={data}
        onPlayer={openPlayer}
        onRead={openRead}
        onClose={close}
        story={
          from && when
            ? {
                when: weekdayOf(when.date),
                open: () => {
                  if (phone) {
                    setOpen(null);
                    setStoryAsk(from.id);
                  } else setOpen({ kind: 'story', id: from.id, story: from, week: weekBrief?.week ?? 'This week' });
                },
              }
            : null
        }
      />
    );
  })();

  const panelTitle =
    open?.kind === 'player'
      ? (list.find((p) => p.id === open.id)?.name ?? 'Player')
      : open?.kind === 'read'
        ? (list.flatMap((p) => [...p.reads.needs, ...p.reads.working]).find((r) => r.id === open.id)?.title ?? 'Read')
        : open?.kind === 'course'
          ? (data.course.history?.courses.find((c) => c.id === open.id)?.name ?? 'Course')
          : 'Story';

  return (
    <main ref={top} {...sw.enter} className={'ch-htb ' + (phone ? 'is-phone' : 'is-desk')} aria-busy={sw.pending || undefined} data-ch-screen="coachhelm-team">
      {phone && <PhoneTop start title="CoachHelm" />}
      {phone ? (
        <div className="sheet">
          {head}
          {body}
        </div>
      ) : (
        <div className="ch-htb-desk">
          {head}
          {body}
        </div>
      )}
      {!data.record && recheck && <section className="card recfoot">{recheck}</section>}
      {phone ? (
        <Modal open={!!openPanel} onClose={close} title={panelTitle} className="ch-htb-sheet" bare>
          <div className="ins">{openPanel}</div>
        </Modal>
      ) : (
        <Inspector open={!!openPanel} onClose={close} label={panelTitle}>
          {openPanel}
        </Inspector>
      )}
    </main>
  );
}
