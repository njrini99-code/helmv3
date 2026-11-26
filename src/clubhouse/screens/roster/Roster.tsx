'use client';

import { usePushOnce } from '../../lib/nav-once';
import { Bandage, ChartColumn, ChevronDown, CircleCheck, Copy, Download, Ellipsis, LayoutGrid, List, MessageSquare, Plane, Share, Sparkles, UserCheck, UserMinus, UserPlus, Users, UserX } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useChSessionState } from '../../lib/session-state';
import { useRouter } from 'next/navigation';
import { removePlayerFromTeam } from '@/app/golf/actions/roster';
import { setPlayerAvailability, updatePlayerStatus } from '@/app/golf/actions/team-management';
import type { ChAvailability, ChRoster, ChRosterPlayer } from '../../data/roster';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { InlineNotice } from '../../ui/Notices';
import { PageRefreshNotice } from '../../ui/RefreshNotice';
import { FormBars, FormLine, FormRange } from '../../ui/FormLine';
import { Icon } from '../../ui/Icon';
import { Menu, type MenuItem } from '../../ui/Menu';
import { useContextMenu, type ContextMenuBind } from '../../ui/ContextMenu';
import { publishPeople } from '../../shell/command/people';
import { Modal } from '../../ui/Modal';
import { Segmented } from '../../ui/Segmented';
import { SearchField } from '../../ui/SearchField';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Swap } from '../../ui/Swap';
import { useToast } from '../../ui/Toast';
import { useAction } from '../../lib/use-action';
import { haptic } from '../../lib/haptics';
import { sgBaseline } from '../../lib/sg';
import { CH_PHONE_QUERY, useChPhone } from '../../lib/use-phone';
import { DataTable, type DataColumn } from '../../ui/DataTable';
import { useHScroll } from '../../ui/use-hscroll';
import { usePageKeys, type ChPageKey } from '../../shell/command/page-keys';
import { chTrail } from '../../lib/track';
import { changeTone, formatAvg, formatFixed, formatHcp, formatSigned, NO_DATA } from '../../lib/format';
import { sgWindowLine, type ChSgWindow } from '../../lib/sg-window-line';
import { coachPlayerHref } from '../../data/coachhelm-views-shape';
import { rebuiltHref } from '../../shell/nav';
import { usePressPrefetch } from '../../shell/use-prefetch-tabs';
import { InviteByEmail } from './InviteByEmail';
import { RosterRequests } from './RosterRequests';
import { useJoinRequests } from './useJoinRequests';
import { useCopyText } from './useCopyText';
import { availabilityCopy, RosterPeek, type AvailabilityControl } from './RosterPeek';
import { RequestsRow, RequestsSheetCrh, RosterPhoneCrh } from './RosterPhoneCrh';
import { RosterLeaders } from './RosterLeaders';
import { RosterTeamCard } from './RosterTeamCard';
import { RosterLimitLine, useRosterLimit } from './RosterLimit';
import { useDeepLinkSheet } from '../../shell/use-deep-link-sheet';
import { useHomeDayRollover } from '../home/use-day-rollover';
import { Tooltip } from '../../ui/Tooltip';
import { AVAILABILITY_WORD, availabilityLine, lastFive, rosterFailedParts, rosterStandings, roundsPlayed, sgBarScale, sgBarWidth, teamInSentence, yearKeyOf, type RosterClock, type RosterStanding } from './format';
import { StatusConfirm, statusCopy } from './RosterStatus';
import { classNoteFor, type RosterClassLines } from './class-line';
import { useRosterClassLines } from './useClassLines';
import { ClassStatusLine } from '../../ui/ClassStatusLine';
import '../../styles/roster.css';
import { ROSTER_SORT_DIRECTION, sortRoster, type RosterSort } from './sort';
import { TERMS } from '../../lib/glossary';
import { plural } from '../../lib/plural';

type Sort = Extract<RosterSort, 'avg' | 'hcp' | 'rounds' | 'name'>;
type Show = 'active' | 'inactive' | 'all';
type View = 'faces' | 'list';
const VIEW_KEY = 'ch-roster-view';

/** A spreadsheet reads a cell that starts with = + - @ (or a tab or a return) as a formula. Players type their own names, so the export writes them as text (30502). */
const asText = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

/** A `?player=` link's player, held across a remount until the profile opens (see the effect in Roster). */
let linkedPlayer: string | null = null;

/** The day and 1 August rollover, only behind the lane's flag (06 Wiring W.1). A fixture without a clock stays still. */
function RosterDayRollover({ clock }: { clock: RosterClock }) {
  useHomeDayRollover(clock, !clock);
  return null;
}

export function Roster({ data }: { data: ChRoster; }) {
  const copy = useCopyText();
  const toast = useToast();
  const router = useRouter();
  const pushOnce = usePushOnce(router);
  const [players, setPlayers] = useState(data.players);
  // A refresh (Try again, or the page a write revalidated) brings new data. It replaces what this screen kept from
  // the first render, so a retry after a failed read shows the players, never "No players yet" (30303).
  const [seen, setSeen] = useState(data.players);
  if (data.players !== seen) {
    setSeen(data.players);
    setPlayers(data.players);
  }
  // F-05: the roster limit's count, sheet and row-menu items (the count reads `players`, so a mark shows at once).
  const limit = useRosterLimit(data, players, setPlayers);
  // Search, filter, sort and layout come back when the coach returns to Roster (PAGE_PERFORMANCE.md rule 1).
  const [q, setQ] = useChSessionState('q', '');
  const [show, setShow] = useChSessionState<Show>('show', 'active');
  const [sort, setSort] = useChSessionState<Sort>('sort', 'avg');
  // A coach’s desk opens on the table with its panel beside it (owner, premium plan 2026-11-19, decision 8: “list”); the
  // cards are the other layout, and a coach who chose them keeps them (the device remembers, below).
  const [view, setView] = useChSessionState<View>('view', 'list');
  // Counts the coach's own layout changes: the cards and the table swap with motion on those (CH-3603), never when the
  // kept layout comes back as the page opens.
  const [viewTurn, setViewTurn] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [invite, setInvite] = useState(false);
  // A link opens the sheet at rest and Back closes it (05 CP.3).
  const inviteLink = useDeepLinkSheet('invite', { value: '1', enabled: true });
  const closeInvite = useCallback(() => {
    setInvite(false);
    if (inviteLink.open) inviteLink.close();
  }, [inviteLink]);
  // The bell's join-request notice links here with `?tab=requests` (createTeamJoinRequest). The phone opens its requests sheet
  // (RosterPhone). On desktop the requests are the row under the header: the link opens its sheet, and the param is dropped so a reload or Back shows the roster as it is. With no request waiting (the notice was
  // already decided) or the requests not loaded, there is no card and nothing moves. Read from the media query, not `phone`:
  // a first render on the server's guess must not spend a phone's param.
  // The focus waits for the desktop card to be mounted: a stale phone-layout hint mounts the phone copy at hydration, which
  // spends the param in its own effect and corrects a render later. So the param is read while rendering (before any child
  // effect), kept, and acted on once the layout is desktop and the card exists.
  const requestsRef = useRef<HTMLElement>(null);
  const [linkedRequests] = useState(() => typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('tab') === 'requests');
  const [focusRequests, setFocusRequests] = useState(false);
  useEffect(() => {
    if (!linkedRequests || window.matchMedia(CH_PHONE_QUERY).matches) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has('tab')) {
      url.searchParams.delete('tab');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
    setFocusRequests(true);
  }, [linkedRequests]);
  const [removing, setRemoving] = useState<ChRosterPlayer | null>(null);
  // The player whose Active/Inactive status the coach is changing (CH-3502).
  const [restatus, setRestatus] = useState<ChRosterPlayer | null>(null);
  // Mid-sentence the team is its name, or "your team" when the team row didn't load (P003 #8).
  const teamRef = teamInSentence(data);
  const jr = useJoinRequests(teamRef, data.requests);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const phone = useChPhone();
  // P-10: the team's class lines (flag off: nothing is fetched and the map is empty). `hold` keeps them still under a finger.
  const { lines: classLines, press: hold } = useRosterClassLines(data.teamId, players);
  usePageKeys('Roster', phone ? null : ROW_KEYS);
  // On desktop the requests are the row under the header and its sheet: the link opens the sheet (the row is not a focus
  // target), and only when a request is still waiting; otherwise nothing moves.
  useEffect(() => {
    if (!focusRequests || phone) return;
    if (!data.requestsError && jr.reqs.length > 0) setRequestsOpen(true);
    setFocusRequests(false);
  }, [focusRequests, phone, data.requestsError, jr.reqs.length]);
  // Phone: the open player is a pushed screen (RosterPhone keeps it in the history, CH-1906).
  // A link with ?player= opens that profile once; the param is dropped so a reload shows the list.
  const [openId, setOpenId] = useState<string | null>(null);
  const [arrivedAtRest, setArrivedAtRest] = useState(false);
  useEffect(() => {
    if (openId && players.some((p) => p.id === openId)) linkedPlayer = null;
  }, [openId, players]);
  const openPlayer = useCallback((id: string) => {
    chTrail('roster open player');
    // CH-3701: a tick on opening a player, changing a filter, layout or sort.
    haptic('select');
    setArrivedAtRest(false);
    setOpenId(id);
  }, []);
  // Behind the flag, `?player=` (05 CP.3): the param leaves the address and the stack's own history entry owns Back. A phone shows the
  // profile at rest over the list; a desktop selects the row and scrolls it into view. Not on this team: the list and a toast that names
  // nobody (CP-8), since the id may be another team's player.
  useEffect(() => {

    const url = new URL(window.location.href);
    const id = url.searchParams.get('player') ?? linkedPlayer;
    if (!id) return;
    linkedPlayer = id;
    if (url.searchParams.has('player')) {
      url.searchParams.delete('player');
      window.history.replaceState(window.history.state, '', url.pathname + url.search);
    }
    if (!data.players.some((p) => p.id === id)) {
      linkedPlayer = null;
      if (!data.playersError) toast({ title: 'That player isn’t on your roster.' });
      return;
    }
    if (window.matchMedia(CH_PHONE_QUERY).matches) {
      setArrivedAtRest(true);
      setOpenId(id);
    } else {
      linkedPlayer = null;
      setSel(id);
      requestAnimationFrame(() => document.querySelector(`[data-ch-player="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' }));
    }
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // S-ROSTER.profile.removed: a read that no longer has the open player pops the profile and says so (M-CRH-49).
  const openFirst = useRef<string | null>(null);
  useEffect(() => {
    if (!openId) {
      openFirst.current = null;
      return;
    }
    const open = players.find((p) => p.id === openId);
    if (open) {
      openFirst.current = open.firstName;
      return;
    }
    const first = openFirst.current;
    openFirst.current = null;
    setOpenId(null);
    if (first) toast({ title: `${first} is no longer on the roster.` });
  }, [openId, players, toast]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === 'list' || v === 'faces') setView(v);
    } catch {
      /* private mode: the default view is fine */
    }
    // setView is useChSessionState's useState setter (stable), so this still runs once.
  }, [setView]);
  const changeView = (v: View) => {
    if (v !== view) setViewTurn((n) => n + 1);
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* not persisted; still switches */
    }
  };

  const active = useMemo(() => players.filter((p) => p.status === 'active'), [players]);
  const inactiveCount = players.length - active.length;
  // Injured and away are counted among the active players: availability never changes who is on the active roster.
  const awayCount = active.filter((p) => p.availability === 'away').length;
  // Pooled per round on the server (A3), never a mean of the players' means.
  const teamAvg = data.teamAvg;

  // Places and the team strip rank the active roster, never the rows a search or filter left (P003 #2).
  const standings = useMemo(() => rosterStandings(players), [players]);
  // The whole team's, so a search or a filter never rescales the bars under the coach.
  const sgScale = useMemo(() => sgBarScale(players.map((p) => p.sgPerRound)), [players]);
  // Avg sorts nothing while season stats are missing: the order falls back to Name (P003 #7).
  const sortBy: Sort = data.statsError && sort === 'avg' ? 'name' : sort;
  const sortOptions: { value: Sort; label: string }[] = [
    ...(data.statsError ? [] : [{ value: 'avg' as const, label: TERMS.scoringAvg.short }]),
    { value: 'hcp', label: TERMS.handicap.long },
    { value: 'rounds', label: 'Rounds' },
    { value: 'name', label: 'Name' },
  ];
  const sortLabel = sortOptions.find((o) => o.value === sortBy)?.label ?? 'Name';

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = players.filter((p) => (show === 'all' || p.status === show) && p.name.toLowerCase().includes(needle));
    return sortRoster(list, sortBy);
  }, [players, q, show, sortBy]);
  // Behind the flag the first row by the current sort is selected until the coach picks one (06 7.12).
  const cur = players.find((p) => p.id === sel) ?? (!sel ? rows[0] : undefined);
  const select = useCallback((id: string | null) => {
    if (id) chTrail('roster open player');
    haptic('select');
    setSel((s) => (s === id ? null : id));
  }, []);
  /** A player's face or name goes to their profile (owner, 2026-10-08); where that page isn't rebuilt it opens the peek.
   *  Going there is navigation, so it is silent (D-70, A14); the peek, which opens in place, still ticks. */
  const openProfile = useCallback(
    (id: string) => {
      const href = profileHref(id);
      if (!href) return select(id);
      chTrail('roster open profile');
      // Through the shared hold (lib/nav-once.ts): a double tap on a face opens the profile once.
      pushOnce(href);
    },
    [pushOnce, select],
  );
  /** A Needs-a-look chip only opens its player; closing stays on X or Esc (P003 #11). */
  const openSel = useCallback((id: string) => {
    chTrail('roster open player');
    haptic('select');
    setSel(id);
  }, []);

  // What a removal changes on this screen happens inside the action, so the toast's Retry finishes the job as well (31403).
  const remove = useAction(
    'roster.removePlayer',
    async (p: ChRosterPlayer) => {
      const res = await removePlayerFromTeam(p.id);
      if (res.success) {
        setPlayers((ps) => ps.filter((x) => x.id !== p.id));
        setSel((s) => (s === p.id ? null : s));
        // Their profile is gone: back to the list.
        setOpenId((o) => (o === p.id ? null : o));
        setRemoving(null);
      }
      return res;
    },
    (p) => ({
      done: `${p.name} removed from ${teamRef}`,
      failed: `Couldn’t remove ${p.name}`,
      hint: 'Nothing changed on the roster. Try again, or refresh if it keeps failing.',
      code: 'CH-3001',
    }),
  );
  // Active ⇄ Inactive (the dropped Fairway "Change status", rebuilt). Like a removal, the list changes inside the
  // action, so the toast's Retry finishes the job as well (31403). `updatePlayerStatus` resolves the coach's active team
  // with the same cookie-aware resolver this route used (resolveCoachActiveTeam), so it writes to the team on screen.
  const changeStatus = useAction(
    'roster.changeStatus',
    async (p: ChRosterPlayer, to: ChRosterPlayer['status']) => {
      const res = await updatePlayerStatus(p.id, to);
      if (res.success) {
        setPlayers((ps) => ps.map((x) => (x.id === p.id ? { ...x, status: to } : x)));
        setRestatus(null);
      }
      return res;
    },
    (p, to) => statusCopy(p.name, to),
  );
  /** A note that saved is the note the list holds, so the player reads back with it (31203). */
  const noteSaved = useCallback(
    (id: string, note: string | null) => setPlayers((ps) => ps.map((x) => (x.id === id ? { ...x, coachNote: note } : x))),
    [],
  );
  // Availability (display only; it never changes team access). Optimistic: the word appears at once and a failure puts
  // the player back. Both happen inside the action, so the toast's Retry applies the change again and finishes the job.
  const setAvailability = useAction(
    'roster.setAvailability',
    async (p: ChRosterPlayer, to: ChAvailability) => {
      const before = { availability: p.availability, availabilityUpdated: p.availabilityUpdated, attention: p.attention, availabilityCoachNote: p.availabilityCoachNote };
      const stamp = new Date().toISOString();
      setPlayers((ps) =>
        ps.map((x) =>
          x.id === p.id
            ? // Injured or away drops a Needs a look reason (the coach already knows why); available brings back what the server would show.
              { ...x, availability: to, availabilityUpdated: stamp, attention: to === 'available' ? (x.attentionIfAvailable ?? x.attention) : null, availabilityCoachNote: to === 'available' ? null : x.availabilityCoachNote }
            : x,
        ),
      );
      const res = await setPlayerAvailability({ playerId: p.id, availability: to });
      if (!res.success) setPlayers((ps) => ps.map((x) => (x.id === p.id ? { ...x, ...before } : x)));
      return res;
    },
    (p, to) => availabilityCopy(p.name, to),
  );
  const runAvailability = setAvailability.run;
  // The coach-only reason is offered only when its table answered (data.availabilityCoachNotes); a saved note is the note the list holds.
  const reasonSaved = useCallback(
    (id: string, note: string | null) => setPlayers((ps) => ps.map((x) => (x.id === id ? { ...x, availabilityCoachNote: note } : x))),
    [],
  );
  const notesOn = !!data.availabilityCoachNotes;
  const availability: AvailabilityControl = useMemo(
    () => ({ set: (p, to) => void runAvailability(p, to), pending: setAvailability.pending, note: notesOn ? { onSaved: reasonSaved } : undefined }),
    [runAvailability, setAvailability.pending, notesOn, reasonSaved],
  );

  const exportCsv = () => {
    const head = ['Player', 'Class', 'Status', 'Availability', 'Rounds', TERMS.scoringAvg.short, `${TERMS.strokesGained.short} per round`, TERMS.handicap.long];
    const lines = rows.map((p) =>
      [
        asText(p.name),
        p.classYear ?? '',
        p.status,
        AVAILABILITY_WORD[p.availability ?? 'available'],
        roundsPlayed(p),
        p.avg?.toFixed(1) ?? '',
        p.sgPerRound?.toFixed(2) ?? '',
        p.handicap ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    try {
      const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${data.teamName.replace(/\W+/g, '-').toLowerCase()}-roster.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      // CH-3702: an export lands with the success tap.
      haptic('success');
      toast({ title: `Roster exported · ${plural(rows.length, 'player')}` });
    } catch {
      // The browser refused the download (a blob or link it won't open): told, not reported.
      haptic('error');
      toast({ tone: 'error', title: 'Couldn’t export the roster', body: 'Your browser blocked the download. Try again, or use a desktop browser.', code: 'CH-3005' });
    }
  };

  const statsHref = (p: ChRosterPlayer) => rebuiltHref(`/golf/dashboard/stats?player=${p.id}&window=season`);
  const menuFor = (p: ChRosterPlayer): MenuItem[] => {
    const items: MenuItem[] = [];
    // The board's first row item: CoachHelm's Deep dive of this player (spec A).
    const insights = rebuiltHref(coachPlayerHref('deep-dive', p.id), 'coach');
    if (insights) items.push({ label: 'View insights', icon: Sparkles, href: insights });
    const s = statsHref(p);
    if (s) items.push({ label: 'View stats', icon: ChartColumn, href: s });
    const messagesHref = rebuiltHref(`/golf/dashboard/messages?player=${encodeURIComponent(p.id)}`);
    if (messagesHref) items.push({ label: 'Message', icon: MessageSquare, href: messagesHref });
    if (items.length) items.push({ kind: 'separator' });
    // Availability: the two states the player is not in, written at once with no confirm (it never changes team access).
    const markAvailable: MenuItem = { label: 'Mark available', icon: CircleCheck, onSelect: () => void setAvailability.run(p, 'available') };
    const markInjured: MenuItem = { label: 'Mark injured', icon: Bandage, onSelect: () => void setAvailability.run(p, 'injured') };
    const markAway: MenuItem = { label: 'Mark away', icon: Plane, onSelect: () => void setAvailability.run(p, 'away') };
    const now = p.availability ?? 'available';
    items.push(...(now === 'available' ? [markInjured, markAway] : now === 'injured' ? [markAvailable, markAway] : [markAvailable, markInjured]));
    items.push({ kind: 'separator' });
    const limitItems = limit.menuItems(p);
    if (limitItems.length) items.push(...limitItems, { kind: 'separator' });
    items.push(
      p.status === 'active'
        ? { label: 'Mark inactive', icon: UserX, onSelect: () => setRestatus(p) }
        : { label: 'Mark active', icon: UserCheck, onSelect: () => setRestatus(p) },
    );
    items.push({ label: 'Remove from team', icon: UserMinus, danger: true, onSelect: () => setRemoving(p) });
    return items;
  };

  // The right-click menu holds the kebab's items, so a row is the same wherever it is opened from.
  const ctx = useContextMenu<ChRosterPlayer>({ label: (p) => `Actions for ${p.name}`, items: menuFor });
  // The command palette lists these players (Cmd K), nobody the coach doesn't already see here.
  useEffect(() => {
    publishPeople(players.map((p) => ({ id: p.id, name: p.name, detail: [p.classYear, p.status === 'inactive' ? 'Inactive' : null].filter(Boolean).join(' · ') || undefined })));
  }, [players]);

  const dialogs = (
    <>
      {limit.dialogs}
      <InviteModal
        open={invite || inviteLink.open}
        atRest={inviteLink.atRest}
        onClose={closeInvite}
        teamName={teamRef}
        code={data.joinCode}
        codeFailed={data.teamError}
        emailInvites={data.emailInvites === true}
        onRetry={() => router.refresh()}
      />
      <Modal
        code="CH-3501"
        open={!!removing}
        onClose={() => setRemoving(null)}
        width={460}
        icon={UserMinus}
        title="Remove player?"
        description={removing ? `Remove ${removing.name} from ${teamRef}? They can rejoin later with the team code.` : undefined}
        footer={
          <>
            <Button data-ctl="CTL-P003-003" variant="ghost" onClick={() => setRemoving(null)}>
              {removing ? `Keep ${removing.firstName}` : 'Keep player'}
            </Button>
            <Button data-ctl="CTL-P003-004"
              variant="danger"
              busy={remove.pending}
              feel="warning"
              onClick={() => {
                if (removing) void remove.run(removing);
              }}
            >
              {remove.pending ? <span data-ch-code="CH-3402">Removing…</span> : 'Remove player'}
            </Button>
          </>
        }
      >
        <p className="ch-rs-remove">Their account and stats are not deleted. This only removes them from your active roster.</p>
      </Modal>
      <StatusConfirm
        player={restatus}
        teamName={teamRef}
        pending={changeStatus.pending}
        onCancel={() => setRestatus(null)}
        onConfirm={(p, to) => void changeStatus.run(p, to)}
      />
    </>
  );

  if (phone) {
    return (
      <>
        <RosterDayRollover clock={data.clock} />
        <RosterPhoneCrh
          data={data}
          players={players}
          jr={jr}
          openId={openId}
          arrivedAtRest={arrivedAtRest}
          onOpen={openPlayer}
          onClose={() => setOpenId(null)}
          onInvite={() => setInvite(true)}
          onRemove={setRemoving}
          onStatus={setRestatus}
          onNoteSaved={noteSaved}
          availability={availability}
          classLines={classLines}
          hold={hold}
          onRetry={() => router.refresh()}
          limit={limit}
        >
          {dialogs}
        </RosterPhoneCrh>
      </>
    );
  }

  // Two or more failed reads are told once under the head, with one Try again; each part keeps its title (CH-1209).
  const failed = rosterFailedParts(data);
  const covered = failed.length > 1;
  return (
    <main className={'ch-rs' + ' ch-rsd'} data-canopy={undefined} data-ch-crh="on">
      <RosterDayRollover clock={data.clock} />
      <header className="ch-rs-head" data-canopy-head={undefined} data-canopy-tight-always={undefined}>
        <div>
          <span className="ch-rs-team">
            <span className="ch-rs-team__name">{[data.teamName, data.season].filter(Boolean).join(' · ')}</span>
          </span>
          <h1 className="ch-display">Roster</h1>
          {/* With nobody on the roster every count is 0: the team and season above say enough (wave 10). */}
          {/* L-078: the team card under the header carries the player, active and injured counts, so the header says only
              what the card doesn't: who is away, the team average and why strokes gained sit below zero. */}
          {!data.playersError && players.length > 0 && (awayCount > 0 || teamAvg != null || players.some((p) => p.sgPerRound != null)) && (
            <p>
              {awayCount > 0 && (
                <>
                  <span className="ch-num">{awayCount}</span> away.
                </>
              )}
              {teamAvg != null && (
                <>
                  {awayCount > 0 && ' '}
                  Team average <span className="ch-num">{formatAvg(teamAvg)}</span> over the season.
                </>
              )}
              {/* Once for the page, not on every card: why the cards' strokes gained sit below zero (Q1, owner 12 Nov 2026). */}
              {players.some((p) => p.sgPerRound != null) && <>{(awayCount > 0 || teamAvg != null) && ' '}{sgBaseline(data.sgTour ?? null).whyNamed}</>}
            </p>
          )}
          {!data.playersError && players.length > 0 && <RosterLimitLine ctl={limit} />}
        </div>
        <div className="ch-rs-head__act">
          {players.length > 0 && (
            <Button data-ctl="CTL-P003-005" variant="secondary" leftIcon={Download} onClick={exportCsv}>
              Export
            </Button>
          )}
          {/* One primary per screen: the page empty state (CH-3301) carries Invite players while there's nobody. */}
          {(players.length > 0 || data.playersError) && (
            <Button data-ctl="CTL-P003-006" variant="primary" leftIcon={UserPlus} onClick={() => setInvite(true)}>
              Invite players
            </Button>
          )}
        </div>
      </header>

      <PageRefreshNotice parts={failed} />

      {!data.playersError && players.length > 0 && (
        <div className="ch-rs-top">
          <RosterTeamCard viewer="coach" season={data.season} players={players} waiting={data.requestsError ? null : jr.reqs.length} statsError={data.statsError} clock={data.clock} />
          <RosterLeaders players={players} statsError={data.statsError} clock={data.clock} onOpen={openSel} />
        </div>
      )}

      <SectionBoundary surface="roster.requests" label="Join requests" code="CH-3204">
        {!data.requestsError ? (
          <div ref={requestsRef as never} className="ch-rsd-reqs">
            <RequestsRow jr={jr} error={false} covered={covered} clock={data.clock} onRetry={() => router.refresh()} onOpen={() => setRequestsOpen(true)} />
            <RequestsSheetCrh open={requestsOpen} atRest={false} onClose={() => setRequestsOpen(false)} data={data} jr={jr} clock={data.clock} />
          </div>
        ) : (
          <RosterRequests ref={requestsRef} teamName={teamRef} jr={jr} error={data.requestsError} covered={covered} onRetry={() => router.refresh()} />
        )}
      </SectionBoundary>

      {data.statsError && (
        <InlineNotice
          code="CH-3202"
          title="Season stats didn’t load"
          body="The roster is complete, but averages, form and strokes gained are missing until the rounds load."
          onRetry={() => router.refresh()}
          covered={covered}
        />
      )}

      {data.playersError ? (
        <InlineNotice
          code="CH-3201"
          title="The roster didn’t load"
          body="Your players are safe. Try again."
          onRetry={() => router.refresh()}
          covered={covered}
        />
      ) : players.length === 0 ? (
        <EmptyState
          size="page"
          code="CH-3301"
          shape="people"
          icon={Users}
          title="No players yet"
          body="Players fill this list themselves: they join with your team code or invite link, and you can remove anyone here."
          action={
            <Button data-ctl="CTL-P003-007" variant="primary" leftIcon={UserPlus} onClick={() => setInvite(true)}>
              Invite players
            </Button>
          }
          secondaryAction={
            data.joinCode ? (
              <Button data-ctl="CTL-P003-008" leftIcon={Copy} onClick={() => void copy(data.joinCode!, 'Team code')}>
                Copy team code
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>

          <div className="ch-rs-bar">
            <SearchField className="ch-rs-search" value={q} onChange={setQ} placeholder="Search players by name" label="Search players" />
            <div className="ch-rs-bar__r">
              <>
                  <Segmented<Show>
                    size="sm"
                    label="Status"
                    value={show}
                    onChange={setShow}
                    options={[
                      { value: 'active', label: `Active · ${active.length}` },
                      { value: 'inactive', label: `Inactive · ${inactiveCount}` },
                      { value: 'all', label: 'All' },
                    ]}
                  />
                  <Segmented<'faces' | 'list'>
                    size="sm"
                    label="Layout"
                    value={view}
                    onChange={changeView}
                    options={[
                      { value: 'faces', label: <Icon icon={LayoutGrid} size={15} />, aria: 'Team view' },
                      { value: 'list', label: <Icon icon={List} size={15} />, aria: 'List view' },
                    ]}
                  />
                </>
              {/* CONS-31 (plan §3.8): Sort is a menu, so the bar keeps one segmented control for what it filters. Its key
                  names the order in force; the table’s headers sort too. */}
              <Menu
                label="Sort players"
                align="end"
                width={200}
                items={sortOptions.map((o) => ({ label: o.label, checked: sortBy === o.value, onSelect: () => setSort(o.value) }))}
                trigger={(t) => (
                  <Button data-ctl="CTL-P003-009" size="sm" rightIcon={ChevronDown} menu={t} aria={{ label: 'Sort players, by ' + sortLabel }}>
                    {'Sort: ' + sortLabel}
                  </Button>
                )}
              />
            </div>
          </div>

          <div className={'ch-rs-body' + (cur ? ' has-peek' : '')}>
            <SectionBoundary surface="roster.list" label="The roster" code="CH-3205">
              {/* CH-3603: Team view and List view settle in as the toggle moves (base in, quick out); instant with
                  reduced motion. */}
              <Swap swapKey={viewTurn}>
                <RosterList
                  rows={rows}
                  oneStatus={show !== 'all' && !rows.some((p) => p.status === 'active' && p.availability === 'injured')}
                  standings={standings}
                  sgScale={sgScale}
                  view={view}
                  sel={sel}
                  q={q}
                  show={show}
                  openProfile={openProfile}
                  menuFor={menuFor}
                  bind={ctx.bind}
                  sortBy={sortBy}
                  onSort={setSort}
                  sortableAvg={!data.statsError}
                  classLines={classLines}
                  hold={hold}
                  clock={data.clock}
                  mean={teamAvg}
                  onSelect={openSel}
                  selected={cur?.id ?? null}
                  onShowEveryone={() => {
                    setQ('');
                    setShow('all');
                  }}
                />
              </Swap>
            </SectionBoundary>
            <SectionBoundary surface="roster.peek" label="The player panel" code="CH-3206">
              <RosterPeek p={cur} notesLocked={data.notesError} onClose={() => setSel(null)} onNoteSaved={noteSaved} availability={availability} helm={data.helm} classLine={classNoteFor(cur ?? { availability: 'available' }, cur ? classLines.get(cur.id) : undefined)} clock={data.clock} />
            </SectionBoundary>
          </div>
        </>
      )}

      {dialogs}
      {ctx.menu}
    </main>
  );
}

const ROW_KEYS: readonly ChPageKey[] = [
  { label: 'Move between players', keys: ['Up', 'Down'] },
  { label: 'Next or previous player', keys: ['J', 'K'] },
];

/** A player's profile, where Stats is rebuilt for the coach; otherwise null (the peek opens instead). */
// `from=roster`: the profile keeps Roster lit in the sidebar and as its way back (coach audit 13 Nov 2026, §8 #7).
const profileHref = (id: string) => rebuiltHref(`/golf/dashboard/stats?player=${id}&window=season&from=roster`);

/**
 * The roster itself, as cards or a table. Its own component so the
 * roster.list boundary contains everything it computes.
 */
function RosterList({
  oneStatus = false,
  rows,
  standings,
  sgScale,
  view,
  sel,
  q,
  show,
  openProfile,
  menuFor,
  bind,
  onShowEveryone,
  sortBy,
  onSort,
  sortableAvg,
  classLines,
  hold,
  clock,
  mean = null,
  onSelect,
  selected = null,
}: {
  /** Filtered to one status with no exception to show: "Active" on every row says nothing, so the column goes (QA-13). */
  oneStatus?: boolean;
  clock?: RosterClock;
  mean?: number | null;
  onSelect?: (id: string) => void;
  selected?: string | null;
  rows: ChRosterPlayer[];
  standings: ReturnType<typeof rosterStandings>;
  /** The team's strokes-gained bar scale (`sgBarScale`). */
  sgScale: number;
  view: View;
  sel: string | null;
  q: string;
  show: Show;
  openProfile: (id: string) => void;
  menuFor: (p: ChRosterPlayer) => MenuItem[];
  /** The right-click menu's handlers for a row (ui/ContextMenu.tsx). */
  bind: (p: ChRosterPlayer) => ContextMenuBind;
  onShowEveryone: () => void;
  sortBy: Sort;
  onSort: (s: Sort) => void;
  /** Avg sorts nothing while season stats are missing (P003 #7), so its header is plain then. */
  sortableAvg: boolean;
  /** P-10: each player's class line, and the handlers that hold the lines still while a pointer is down. */
  classLines: RosterClassLines;
  hold: { onPointerDownCapture: () => void };
}) {
  const faceHowId = useId();
  // The profile is fetched whole as the pointer goes down on a face or a name (A13).
  const press = usePressPrefetch();
  // A table wider than its column scrolls sideways and fades the clipped edge (a narrow desk); a wide one is clipped,
  // so its header can stay under the top bar (roster.css).
  const edges = useHScroll<HTMLDivElement>();
  const columns: DataColumn<ChRosterPlayer, Sort>[] = [
    {
      id: 'who',
      header: 'Player',
      sortKey: 'name',
      sortDirection: ROSTER_SORT_DIRECTION.name,
      className: 'ch-rs-who__cell',
      cell: (p) => (
        <button data-ctl="CTL-P003-010"
          type="button"
          className="ch-rs-who"
          onClick={() => (onSelect ? onSelect(p.id) : openProfile(p.id))}
          // Command-Enter opens the profile, as on the cards.
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              openProfile(p.id);
            }
          }}
          aria-label={p.name + '. Show in the panel'}
        >
          <Avatar name={p.name} id={p.id} size="lg" year={yearKeyOf(p.gradYear, clock)} dim={p.status === 'inactive'} />
          <span>
            <b>{p.name}</b>
            <RowMeta p={p} line={classNoteFor(p, classLines.get(p.id))} />
          </span>
        </button>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (p) => {
        const injured = p.status === 'active' && p.availability === 'injured';
        if (injured) return <span className="ch-rsx-chip is-amber">Injured</span>;
        return <span className="ch-rsx-chip">{p.status === 'active' ? 'Active' : 'Inactive'}</span>;
      },
    },
    {
      // The lines share one range (B5), and the header says its ends (row 102).
      id: 'form',
      header: 'Last 5',
      cell: (p) =>
        p.trend.length >= 3 ? (
          <FormBars data={p.trend} mean={mean} />
        ) : (
          // Grey bars read as loading (QA-13): no form yet is a dash, and it says why.
          <Tooltip>
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so a keyboard can open the tooltip that says why */}
            <span className="ch-num" role="img" tabIndex={0} aria-label="Needs 3 rounds">
              —
            </span>
          </Tooltip>
        ),
    },
    // Avg sorts nothing while season stats are missing (P003 #7), so its header is plain then.
    { id: 'avg', header: 'Avg', align: 'end', sortKey: sortableAvg ? 'avg' : undefined, sortDirection: ROSTER_SORT_DIRECTION.avg, className: 'ch-num ch-rs-num', cell: (p) => formatFixed(p.avg) },
    { id: 'hcp', header: TERMS.handicap.long, align: 'end', sortKey: 'hcp', sortDirection: ROSTER_SORT_DIRECTION.hcp, className: 'ch-num ch-rs-num2', cell: (p) => formatHcp(p.handicap) },
    {
      id: 'sg',
      header: 'SG/rd',
      align: 'end',
      className: (p) => 'ch-num ch-rs-sg ' + changeTone(p.sgPerRound, false, 1),
      cell: (p) => (p.sgPerRound == null ? NO_DATA : formatSigned(p.sgPerRound)),
    },
    {
      id: 'rounds',
      header: <span title="Rounds this season">Rds</span>,
      headerLabel: 'Rounds this season',
      align: 'end',
      sortKey: 'rounds',
      sortDirection: ROSTER_SORT_DIRECTION.rounds,
      className: 'ch-num ch-rs-num2',
      cell: (p) => roundsPlayed(p),
    },
    {
      id: 'actions',
      header: <span className="ch-sr-only">Actions</span>,
      align: 'end',
      cell: (p) => <Menu label={'Actions for ' + p.name} items={menuFor(p)} trigger={(t) => <IconButton data-ctl="CTL-P003-011" icon={Ellipsis} size="sm" label={'Actions for ' + p.name} menu={t} />} />,
    },
  ];
  return (
    // B5: every row's form line on one range, so the same height is the same score down the table.
    <FormRange trends={rows.map((p) => (lastFive(p.trend)))} earlyBelow={3}>
        {rows.length === 0 ? (
          <EmptyState
            kind="filtered"
            code={q.trim() ? 'CH-3302' : 'CH-3303'}
            title={q.trim() ? `No players match “${q.trim()}”` : show === 'inactive' ? 'No inactive players.' : 'No active players.'}
            body={show === 'all' ? 'Search matches player names.' : `Only ${show} players are in view.`}
            action={<Button data-ctl="CTL-P003-012" onClick={onShowEveryone}>Show everyone</Button>}
          />
        ) : view === 'faces' ? (
          <div className="ch-rs-faces">
            {rows.map((p) => (
              <button data-ctl="CTL-P003-013"
                key={p.id}
                type="button"
                className={'ch-rs-face ch-lift' + ((onSelect ? selected : sel) === p.id ? ' is-sel' : '') + (p.status === 'inactive' ? ' is-off' : '')}
                // Named by what the card shows (F-21, WCAG 2.5.3: a label that left out the visible text), with what a press does
                // read last (ch-rs-face__how).
                aria-describedby={`${faceHowId}-${p.id}`}
                // The card's body shows the player in the panel; the face and the name open their profile (coach audit
                // 13 Nov 2026, §8 #1: the whole card went to the profile, so the panel never left the first player).
                onClick={(e) => {
                  const toProfile = (e.target as Element | null)?.closest?.('.ch-rs-face__av, .ch-rs-face__name');
                  if (toProfile || !onSelect) openProfile(p.id);
                  else onSelect(p.id);
                }}
                {...press(profileHref(p.id))}
                {...bind(p)}
                {...hold}
                // After the context menu's own keys (Shift-F10, the menu key): Command-Enter opens the profile.
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    openProfile(p.id);
                    return;
                  }
                  bind(p).onKeyDown(e);
                }}
              >
                <span className="ch-rs-face__top">
                  <span />
                  {/* CH-3802: the status is a word; the dot is decoration, drawn only under All where it tells players
                      apart (P003-A3: under Active or Inactive every dot is the same, so the word is for VoiceOver alone).
                      Visual pass 2026-10-28 (H13): under All the word shows beside its dot, never the colour alone.
                      CH-3602: on desktop the cell takes the Ledger tint on hover and a deeper one on press. */}
                  {show === 'all' ? (
                    <span className={`ch-rs-face__st is-${p.status}`}>
                      <span className={`ch-rs-face__dot is-${p.status}`} aria-hidden="true" />
                      {p.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  ) : null}
                </span>
                <span className="ch-rs-face__av">
                  <Avatar name={p.name} id={p.id} size={76} year={yearKeyOf(p.gradYear, clock)} dim={p.status === 'inactive'} />
                </span>
                <span className="ch-rs-face__name">{p.name}</span>
                {/* After the name, so the card's name (its own text, F-21) starts with who it is. */}
                {show !== 'all' && <span className="ch-sr-only">{p.status === 'active' ? ', active' : ', inactive'}</span>}
                <span className="ch-rs-face__meta">{[p.rosterExempt ? 'Not counted' : null, p.classYear, p.hometown].filter(Boolean).join(' · ') || ' '}</span>
                <span className="ch-rs-face__form">
                  <FormLine data={p.trend} width={150} height={30} earlyBelow={3} label={`${p.name} form`} />
                </span>
                <FaceFigures p={p} avgs={standings.avgs} standing={standings.byId.get(p.id)} sgScale={sgScale} />
                {/* A trip, then injured or away, then a class, take the note slot in plain ink, in place of a Needs a look
                    reason (CH-3809: a word). A class line never hides an injury (class-line.ts). */}
                {classNoteFor(p, classLines.get(p.id)) ? (
                  <span className="ch-rs-face__note is-availability is-class" title={classNoteFor(p, classLines.get(p.id))!.text}>
                    <ClassStatusLine kind={classNoteFor(p, classLines.get(p.id))!.kind} text={classNoteFor(p, classLines.get(p.id))!.text} />
                  </span>
                ) : availabilityLine(p) ? (
                  <span className="ch-rs-face__note is-availability" title={availabilityLine(p)!}>
                    {availabilityLine(p)}
                  </span>
                ) : (
                  p.attention && <span className={`ch-rs-face__note is-${p.attention.tone}`}>{p.attention.text}</span>
                )}
                <span id={`${faceHowId}-${p.id}`} hidden>
                  {onSelect ? 'Shows in the panel; Command-Enter opens the profile' : 'Opens the profile'}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <>
          {/* §3.8 (owner, list as the desk default): the shared DataTable. Its header stays under the top bar, a column
              header sorts (the same orders as Sort, ./sort), and the table is one Tab stop: Up and Down, or J and K, walk
              the players and the panel beside it follows the keys (B11, CH-3801: every value in a cell under a header). */}
          <DataTable<ChRosterPlayer, Sort>
            label="Roster"
            rootRef={edges}
            rows={rows}
            rowKey={(p) => p.id}
            primary=".ch-rs-who"
            sort={sortBy}
            onSort={onSort}
            selected={selected}
            onSelect={onSelect}
            columns={columns}
            classNames={{
              table: 'ch-hscroll ch-rs-list ch-sheet' + (oneStatus ? ' is-one-status' : ''),
              head: 'ch-rs-row ch-rs-row--head',
              row: (p) => 'ch-rs-row' + (selected === p.id ? ' is-sel' : '') + (p.status === 'inactive' ? ' is-off' : ''),
              sort: 'ch-rs-sorth',
              sortArrow: 'ch-rs-sorth__ar',
            }}
            rowProps={(p) => ({ 'data-ch-player': p.id, ...bind(p), ...hold })}
          />
          </>
        )}
    </FormRange>
  );
}

function InviteModal({
  open,
  onClose,
  teamName,
  code,
  codeFailed,
  emailInvites,
  onRetry,
  atRest = false,
}: {
  atRest?: boolean;
  open: boolean;
  onClose: () => void;
  teamName: string;
  code: string | null;
  codeFailed: boolean;
  /** An invite email can go out now (ChRoster.emailInvites). */
  emailInvites: boolean;
  onRetry: () => void;
}) {
  const copy = useCopyText();
  // Read in an effect so render stays free of window and navigator. The sheet never renders on the server (it starts
  // closed, and Modal draws its content only while open), so this is tidiness, not a hydration fix.
  const [origin, setOrigin] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setOrigin(window.location.origin);
    setCanShare(typeof navigator.share === 'function');
  }, []);
  const link = code && origin ? `${origin}/golf/join/${encodeURIComponent(code)}` : null;
  // A long link opens scrolled to its end, so the team code stays in view. A layout effect, not a callback ref: the ref
  // would run before Modal's own layout effect calls showModal(), while the dialog is still display: none and the field
  // has no scroll width. This effect runs after Modal's (a parent's layout effects follow its children's).
  const linkField = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const el = linkField.current;
    if (open && el) el.scrollLeft = el.scrollWidth;
  }, [open, link]);
  const share = async () => {
    if (!link) return;
    try {
      await navigator.share({ title: `Join ${teamName} on GolfHelm`, text: `Join ${teamName} on GolfHelm with code ${code}.`, url: link });
    } catch (e) {
      // Closing the share sheet is not a failure; any other refusal falls back to copying the link.
      if (e instanceof Error && e.name === 'AbortError') return;
      void copy(link, 'Invite link');
    }
  };
  return (
    <Modal
      open={open}
      atRest={atRest}
      onClose={onClose}
      icon={UserPlus}
      title="Invite players"
      description={`Players who sign up with the team code or open the invite link join ${teamName} right away. Players already on GolfHelm who enter the code in Settings send a request you approve.`}
      footer={<Button data-ctl="CTL-P003-014" variant="primary" onClick={onClose}>Done</Button>}
    >
      {code ? (
        <div className="ch-rs-inv">
          <div className="ch-rs-inv__code ch-well-soft">
            <span>Team code</span>
            <b className="ch-num">{code}</b>
            <Button data-ctl="CTL-P003-015" size="sm" leftIcon={Copy} onClick={() => void copy(code, 'Team code')}>
              Copy
            </Button>
          </div>
          {link && (
            <div className="ch-field">
              <span className="ch-field__label">Or send the invite link</span>
              <div className="ch-rs-inv__link">
                {/* The scheme is left off and the field opens scrolled to its end, so the code stays in view; Copy and Share send the full URL. */}
                <input
                  className="ch-input"
                  readOnly
                  value={link.replace(/^https?:\/\//, '')}
                  aria-label="Invite link"
                  ref={linkField}
                  onFocus={(e) => e.currentTarget.select()}
                />
                {canShare ? (
                  <Button data-ctl="CTL-P003-016" variant="primary" leftIcon={Share} onClick={() => void share()}>
                    Share
                  </Button>
                ) : (
                  <Button data-ctl="CTL-P003-017" variant="primary" leftIcon={Copy} onClick={() => void copy(link, 'Invite link')}>
                    Copy
                  </Button>
                )}
              </div>
              <span className="ch-field__help">Players who open it join right away, after making an account if they need one.</span>
            </div>
          )}
          <InviteByEmail enabled={emailInvites} />
        </div>
      ) : codeFailed ? (
        <InlineNotice
          code="CH-3207"
          title="The team code didn’t load"
          body="Your code still works for players who have it. Try again to show it here."
          onRetry={onRetry}
        />
      ) : (
        <EmptyState
          code="CH-3304"
          compact
          title="There’s no team code yet"
          body="Make one in Settings, then invite players here."
          action={
            <Button data-ctl="CTL-P003-018" size="sm" href="/golf/dashboard/settings?section=team">
              Open team settings
            </Button>
          }
        />
      )}
    </Modal>
  );
}

/**
 * A roster card's figures, drawn (owner, 2026-10-06: no bare numbers). Scoring: the player's average among the
 * team's on one strip, with their place. Strokes gained: a bar from zero, green for gained, amber for lost. Handicap
 * reads as a labelled line.
 */
function FaceFigures({
  p,
  avgs,
  standing,
  sgScale,
}: {
  p: { avg: number | null; sgPerRound: number | null; sgWindow?: ChSgWindow | null; handicap: number | null; rounds: number };
  /** The ranked team's averages (active, past the early floor), for the strip. */
  avgs: number[];
  /** This player's place among them; undefined when they aren't ranked (inactive, early, no average). */
  standing: RosterStanding | undefined;
  /** The list's largest strokes gained, never under 3 (`sgBarScale`): the bars differ as the players do. */
  sgScale: number;
}) {
  const lo = avgs.length ? Math.min(...avgs) : 0;
  const hi = avgs.length ? Math.max(...avgs) : 0;
  const at = (v: number) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
  // W25: an early player's card already says "Early read" over its form line (FormLine, under three points), so the
  // scoring caption no longer repeats it as "Needs N more"; it reads “Scoring avg” on one line, as a player with no place does.
  const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
  const sg = p.sgPerRound;
  const sgW = sgBarWidth(sg, sgScale);
  const placed = standing && standing.of > 1 ? standing : null;
  return (
    <span className="ch-rs-figs">
      <span className="ch-rs-fig">
        {/* With no place to show, the label says what the figure is on its own line (“Scoring avg”): a lone "Avg" caption under
            "Scoring" read as the label wrapped, and made this figure a line taller than strokes gained beside it. */}
        <span className="ch-rs-fig__k">{placed ? 'Scoring' : TERMS.scoringAvg.short}</span>
        <b className="ch-num">{formatFixed(p.avg)}</b>
        {placed && <span className="ch-rs-fig__m">{`${placed.tied ? `T${placed.place}` : ord(placed.place)} of ${placed.of}`}</span>}
        {p.avg != null && placed && (
          <span className="ch-rs-strip" aria-hidden="true">
            {avgs.map((v, k) => (
              <i key={k} style={{ left: `${at(v)}%` }} />
            ))}
            <i className="is-me" style={{ left: `${at(p.avg)}%` }} />
          </span>
        )}
      </span>
      <span className="ch-rs-fig">
        <span className="ch-rs-fig__k">Strokes gained</span>
        {/* W25: the unit stays with its figure ("−4.9 a round"), never wrapped under the bar on its own line. */}
        <b className={'ch-num ' + changeTone(sg, false, 1)}>
          {sg == null ? NO_DATA : formatSigned(sg)}
          {sg != null && <small className="ch-rs-fig__u">a round</small>}
        </b>
        {sg != null && (
          <span className="ch-rs-sgbar" aria-hidden="true">
            <i className={changeTone(sg, false, 1)} style={sg >= 0 ? { left: '50%', width: `${sgW}%` } : { right: '50%', width: `${sgW}%` }} />
          </span>
        )}
        {/* F-0005: the figure reads the player's last ten rounds, which can start before the season the page names: say which. */}
        {sg != null && sgWindowLine(p.sgWindow) && <span className="ch-rs-fig__m">{sgWindowLine(p.sgWindow)}</span>}
      </span>
      <span className="ch-rs-face__hcp">
        Handicap <b className="ch-num">{formatHcp(p.handicap)}</b>
      </span>
    </span>
  );
}

/**
 * The list row's line under the name: availability first when they are injured or away ("Injured · Sophomore · Charlotte,
 * NC"), the word in secondary ink and the rest tertiary, on one line with the whole of it in the title.
 */
function RowMeta({ p, line: classLine }: { p: ChRosterPlayer; line?: ReturnType<typeof classNoteFor> }) {
  const line = availabilityLine(p);
  // F-05: a player marked as not counting toward the roster limit says so first in the line.
  const rest = [p.rosterExempt ? 'Not counted' : null, p.classYear, p.hometown].filter(Boolean).join(' · ');
  // P-10: a trip or a class leads the line, as the availability word does ("In class until 11:50 AM · Sophomore · Charlotte, NC").
  if (classLine) {
    const all = [classLine.text, rest || null].filter(Boolean).join(' · ');
    return (
      <span className="ch-rs-who__m" title={all}>
        <span className="ch-rs-who__avail">
          <ClassStatusLine kind={classLine.kind} text={classLine.text} />
        </span>
        {rest ? ` · ${rest}` : ''}
      </span>
    );
  }
  const full = [line, rest || null].filter(Boolean).join(' · ');
  return (
    <span className="ch-rs-who__m" title={line ? full : undefined}>
      {line ? (
        <>
          <span className="ch-rs-who__avail">{AVAILABILITY_WORD[p.availability]}</span>
          {full.slice(AVAILABILITY_WORD[p.availability].length)}
        </>
      ) : rest}
    </span>
  );
}
