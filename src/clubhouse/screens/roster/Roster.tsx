'use client';

import { ArrowDown, ArrowUp, Bandage, BarChart3, CircleCheck, Copy, Download, Ellipsis, LayoutGrid, List, MessageSquare, Plane, Share, Sparkles, UserCheck, UserMinus, UserPlus, UserX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useChSessionState } from '../../lib/session-state';
import { useRouter } from 'next/navigation';
import { removePlayerFromTeam } from '@/app/golf/actions/roster';
import { setPlayerAvailability, updatePlayerStatus } from '@/app/golf/actions/team-management';
import type { ChAvailability, ChRoster, ChRosterPlayer } from '../../data/roster';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { InlineNotice } from '../../ui/Notices';
import { PageRefreshNotice } from '../../ui/RefreshNotice';
import { FormLine, FormRange } from '../../ui/FormLine';
import { Icon } from '../../ui/Icon';
import { Menu, type MenuItem } from '../../ui/Menu';
import { useContextMenu, type ContextMenuBind } from '../../ui/ContextMenu';
import { publishPeople } from '../../shell/command/people';
import { Modal } from '../../ui/Modal';
import { PillGroup, Segmented } from '../../ui/Segmented';
import { SearchField } from '../../ui/SearchField';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Swap } from '../../ui/Swap';
import { useToast } from '../../ui/Toast';
import { useAction } from '../../lib/use-action';
import { haptic } from '../../lib/haptics';
import { CH_PHONE_QUERY, useChPhone } from '../../lib/use-phone';
import { chTrail } from '../../lib/track';
import { changeTone, formatAvg, formatFixed, formatHcp, formatSigned, NO_DATA } from '../../lib/format';
import { coachPlayerHref } from '../../data/coachhelm-views-shape';
import { rebuiltHref } from '../../shell/nav';
import { InviteByEmail } from './InviteByEmail';
import { RosterRequests } from './RosterRequests';
import { useJoinRequests } from './useJoinRequests';
import { useCopyText } from './useCopyText';
import { availabilityCopy, RosterPeek, type AvailabilityControl } from './RosterPeek';
import { RosterPhone } from './RosterPhone';
import { PlayerPeek } from '../../ui/PlayerPeek';
import { Tooltip } from '../../ui/Tooltip';
import { RosterSpread } from './RosterSpread';
import { AVAILABILITY_WORD, availabilityLine, earlyNeed, rosterFailedParts, rosterPeek, rosterStandings, teamInSentence, type RosterStanding } from './format';
import { StatusConfirm, statusCopy } from './RosterStatus';
import '../../styles/roster.css';
import { SideScroll } from '../../ui/SideScroll';
import { ROSTER_SORT_DIRECTION, sortRoster, type RosterSort } from './sort';
import { TERMS } from '../../lib/glossary';
import { plural } from '../../lib/plural';

/**
 * B10.5: a sortable column's header is a button that sorts by it (the same orders as Sort players, from ./sort), and the
 * column sorted by says so (`aria-sort`, and an arrow the way it runs).
 */
function SortHeader({ k, sort, onSort, end = false, children }: { k: Sort; sort: Sort; onSort: (s: Sort) => void; end?: boolean; children: ReactNode }) {
  const on = sort === k;
  const dir = ROSTER_SORT_DIRECTION[k];
  return (
    <span role="columnheader" className={end ? 'r' : undefined} aria-sort={on ? dir : 'none'}>
      <button type="button" className={'ch-rs-sorth' + (on ? ' is-on' : '')} onClick={() => onSort(k)}>
        {children}
        {/* The arrow's room is kept on every sortable header, so a right-aligned label doesn't move when it is chosen. */}
        <span className="ch-rs-sorth__ar" aria-hidden="true">
          <Icon icon={dir === 'ascending' ? ArrowUp : ArrowDown} size={12} />
        </span>
      </button>
    </span>
  );
}

type Sort = Extract<RosterSort, 'avg' | 'hcp' | 'rounds' | 'name'>;
type Show = 'active' | 'inactive' | 'all';
type View = 'faces' | 'list';
const VIEW_KEY = 'ch-roster-view';

/** A spreadsheet reads a cell that starts with = + - @ (or a tab or a return) as a formula. Players type their own names, so the export writes them as text (30502). */
const asText = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

/** A `?player=` link's player, held across a remount until the profile opens (see the effect in Roster). */
let linkedPlayer: string | null = null;
/** A `?invite=1` arrival (Home's first-run Invite players) not yet shown, held across a remount like the linked player. */
let linkedInvite = false;

export function Roster({ data }: { data: ChRoster }) {
  const copy = useCopyText();
  const toast = useToast();
  const router = useRouter();
  const [players, setPlayers] = useState(data.players);
  // A refresh (Try again, or the page a write revalidated) brings new data. It replaces what this screen kept from
  // the first render, so a retry after a failed read shows the players, never "No players yet" (30303).
  const [seen, setSeen] = useState(data.players);
  if (data.players !== seen) {
    setSeen(data.players);
    setPlayers(data.players);
  }
  // Search, filter, sort and layout come back when the coach returns to Roster (PAGE_PERFORMANCE.md rule 1).
  const [q, setQ] = useChSessionState('q', '');
  const [show, setShow] = useChSessionState<Show>('show', 'active');
  const [sort, setSort] = useChSessionState<Sort>('sort', 'avg');
  const [view, setView] = useChSessionState<View>('view', 'faces');
  // Counts the coach's own layout changes: the cards and the table swap with motion on those (CH-3603), never when the
  // kept layout comes back as the page opens.
  const [viewTurn, setViewTurn] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [invite, setInvite] = useState(false);
  // `?invite=1` (Home's first-run Invite players) opens the invite sheet once, on desktop and the phone, and the param is
  // dropped so a reload or Back shows the roster. Only the coach's roster reads it: a player's roster and the no-team page
  // are other screens and ignore it (wiring audit, 2026-10-17).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('invite') === '1') {
      linkedInvite = true;
      url.searchParams.delete('invite');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
    if (linkedInvite) setInvite(true);
  }, []);
  const closeInvite = useCallback(() => {
    linkedInvite = false;
    setInvite(false);
  }, []);
  // The bell's join-request notice links here with `?tab=requests` (createTeamJoinRequest). The phone opens its requests sheet
  // (RosterPhone). On desktop the requests are the card under the header: the link takes focus there, scrolling it into view if it
  // is not, and the param is dropped so a reload or Back shows the roster as it is. With no request waiting (the notice was
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
  const phone = useChPhone();
  useEffect(() => {
    if (!focusRequests || phone) return;
    requestsRef.current?.focus();
    setFocusRequests(false);
  }, [focusRequests, phone]);
  // Phone: the open player is a pushed screen (RosterPhone keeps it in the history, CH-1906).
  // A link with ?player= opens that profile once; the param is dropped so a reload shows the list.
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!phone) return;
    const url = new URL(window.location.href);
    const id = url.searchParams.get('player') ?? linkedPlayer;
    if (!id) return;
    // Kept until the profile is on screen: dropping the param can remount this screen (the address changed under the
    // route), and the new copy would otherwise find no param and open the list (dark a11y scan, 2026-10-17).
    linkedPlayer = id;
    if (url.searchParams.has('player')) {
      url.searchParams.delete('player');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
    setOpenId(id);
  }, [phone]);
  useEffect(() => {
    if (openId && players.some((p) => p.id === openId)) linkedPlayer = null;
  }, [openId, players]);
  const openPlayer = useCallback((id: string) => {
    chTrail('roster open player');
    // CH-3701: a tick on opening a player, changing a filter, layout or sort.
    haptic('select');
    setOpenId(id);
  }, []);

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
  const injuredCount = active.filter((p) => p.availability === 'injured').length;
  const awayCount = active.filter((p) => p.availability === 'away').length;
  // Pooled per round on the server (A3), never a mean of the players' means.
  const teamAvg = data.teamAvg;

  // Places and the team strip rank the active roster, never the rows a search or filter left (P003 #2).
  const standings = useMemo(() => rosterStandings(players), [players]);
  const spreadPlayers = useMemo(() => active.filter((p) => standings.byId.has(p.id)), [active, standings]);
  // Avg sorts nothing while season stats are missing: the order falls back to Name (P003 #7).
  const sortBy: Sort = data.statsError && sort === 'avg' ? 'name' : sort;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = players.filter((p) => (show === 'all' || p.status === show) && p.name.toLowerCase().includes(needle));
    return sortRoster(list, sortBy);
  }, [players, q, show, sortBy]);

  const attn = players.filter((p) => p.attention && p.status === 'active');
  const cur = players.find((p) => p.id === sel);
  const select = useCallback((id: string | null) => {
    if (id) chTrail('roster open player');
    haptic('select');
    setSel((s) => (s === id ? null : id));
  }, []);
  /** A player's face or name goes to their profile (owner, 2026-10-08); where that page isn't rebuilt it opens the peek. */
  const openProfile = useCallback(
    (id: string) => {
      const href = rebuiltHref(`/golf/dashboard/stats?player=${id}`);
      if (!href) return select(id);
      chTrail('roster open profile');
      haptic('select');
      router.push(href);
    },
    [router, select],
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
      const before = { availability: p.availability, availabilityUpdated: p.availabilityUpdated, attention: p.attention };
      const stamp = new Date().toISOString();
      setPlayers((ps) =>
        ps.map((x) =>
          x.id === p.id
            ? // Injured or away drops a Needs a look reason: the coach already knows why.
              { ...x, availability: to, availabilityUpdated: stamp, attention: to === 'available' ? x.attention : null }
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
    const head = ['Player', 'Class', 'Status', 'Availability', 'Rounds', 'Scoring avg', 'SG per round', 'Handicap'];
    const lines = rows.map((p) =>
      [
        asText(p.name),
        p.classYear ?? '',
        p.status,
        AVAILABILITY_WORD[p.availability ?? 'available'],
        p.rounds,
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
      haptic('error');
      toast({ tone: 'error', title: 'Couldn’t export the roster', body: 'Your browser blocked the download. Try again, or use a desktop browser.', code: 'CH-3005' });
    }
  };

  const statsHref = (p: ChRosterPlayer) => rebuiltHref(`/golf/dashboard/stats?player=${p.id}`);
  const menuFor = (p: ChRosterPlayer): MenuItem[] => {
    const items: MenuItem[] = [];
    // The board's first row item: CoachHelm's Deep dive of this player (spec A).
    const insights = rebuiltHref(coachPlayerHref('deep-dive', p.id), 'coach');
    if (insights) items.push({ label: 'View insights', icon: Sparkles, href: insights });
    const s = statsHref(p);
    if (s) items.push({ label: 'View stats', icon: BarChart3, href: s });
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
      <InviteModal
        open={invite}
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
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              {removing ? `Keep ${removing.firstName}` : 'Keep player'}
            </Button>
            <Button
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
      <RosterPhone
        data={data}
        players={players}
        jr={jr}
        openId={openId}
        onOpen={openPlayer}
        onClose={() => setOpenId(null)}
        onInvite={() => setInvite(true)}
        onRemove={setRemoving}
        onStatus={setRestatus}
        onNoteSaved={noteSaved}
        availability={availability}
        onRetry={() => router.refresh()}
      >
        {dialogs}
      </RosterPhone>
    );
  }

  // Two or more failed reads are told once under the head, with one Try again; each part keeps its title (CH-1209).
  const failed = rosterFailedParts(data);
  const covered = failed.length > 1;
  return (
    <main className="ch-rs" data-canopy="">
      <header className="ch-rs-head" data-canopy-head="tight">
        <div>
          <span className="ch-rs-team">
            <span className="ch-rs-team__name">{[data.teamName, data.season].filter(Boolean).join(' · ')}</span>
          </span>
          <h1 className="ch-display">Roster</h1>
          {/* With nobody on the roster every count is 0: the team and season above say enough (wave 10). */}
          {!data.playersError && players.length > 0 && (
            <p>
              <span className="ch-num">{players.length}</span> {players.length === 1 ? 'player' : 'players'} &middot;{' '}
              <span className="ch-num">{active.length}</span> active
              {injuredCount > 0 && (
                <>
                  {' '}
                  &middot; <span className="ch-num">{injuredCount}</span> injured
                </>
              )}
              {awayCount > 0 && (
                <>
                  {' '}
                  &middot; <span className="ch-num">{awayCount}</span> away
                </>
              )}
              .
              {teamAvg != null && (
                <>
                  {' '}
                  Team average <span className="ch-num">{formatAvg(teamAvg)}</span> over the season.
                </>
              )}
            </p>
          )}
        </div>
        <div className="ch-rs-head__act">
          {players.length > 0 && (
            <Button variant="ghost" leftIcon={Download} onClick={exportCsv}>
              Export
            </Button>
          )}
          {/* One primary per screen: the page empty state (CH-3301) carries Invite players while there's nobody. */}
          {(players.length > 0 || data.playersError) && (
            <Button variant="primary" leftIcon={UserPlus} onClick={() => setInvite(true)}>
              Invite players
            </Button>
          )}
        </div>
      </header>

      <PageRefreshNotice parts={failed} />

      <SectionBoundary surface="roster.requests" label="Join requests" code="CH-3204">
        <RosterRequests ref={requestsRef} teamName={teamRef} jr={jr} error={data.requestsError} covered={covered} onRetry={() => router.refresh()} />
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

      {attn.length > 0 && (
        <section className="ch-rs-attn" aria-label="Needs a look">
          <span className="ch-rs-attn__l">Needs a look</span>
          {attn.map((p) => (
            <PlayerPeek key={p.id} player={rosterPeek(p)}>
              <button type="button" className="ch-rs-attn__c" onClick={() => openSel(p.id)}>
                <Avatar name={p.name} size={24} />
                <b>{p.firstName}</b>
                <span className={`ch-rs-attn__n is-${p.attention!.tone}`}>{p.attention!.text}</span>
              </button>
            </PlayerPeek>
          ))}
        </section>
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
          title="No players yet"
          body="Players fill this list themselves: they join with your team code or invite link, and you can remove anyone here."
          action={
            <Button variant="primary" leftIcon={UserPlus} onClick={() => setInvite(true)}>
              Invite players
            </Button>
          }
          secondaryAction={
            data.joinCode ? (
              <Button leftIcon={Copy} onClick={() => void copy(data.joinCode!, 'Team code')}>
                Copy team code
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {!phone && !data.statsError && <RosterSpread players={spreadPlayers} teamAvg={teamAvg} onOpen={openSel} />}
          <div className="ch-rs-bar">
            <SearchField className="ch-rs-search" value={q} onChange={setQ} placeholder="Search players by name" label="Search players" />
            <div className="ch-rs-bar__r">
              <PillGroup<Show>
                label="Status"
                value={show}
                onChange={setShow}
                options={[
                  { value: 'active', label: `Active · ${active.length}` },
                  { value: 'inactive', label: `Inactive · ${inactiveCount}` },
                  { value: 'all', label: 'All' },
                ]}
              />
              {/* Handoff: two icon toggles in a hairline outline, not a segmented well. */}
              <div className="ch-rs-vt" role="group" aria-label="Layout">
                {(
                  [
                    ['faces', LayoutGrid, 'Team view'],
                    ['list', List, 'List view'],
                  ] as const
                ).map(([v, icon, label]) => (
                  <Tooltip key={v}>
                    <button
                      type="button"
                      className="ch-rs-vt__b"
                      aria-pressed={view === v}
                      aria-label={label}
                      onClick={() => {
                        if (view !== v) haptic('select');
                        changeView(v);
                      }}
                    >
                      <Icon icon={icon} size={15} />
                    </button>
                  </Tooltip>
                ))}
              </div>
              <Segmented<Sort>
                size="sm"
                label="Sort players"
                value={sortBy}
                onChange={setSort}
                options={[
                  ...(data.statsError ? [] : [{ value: 'avg' as const, label: TERMS.scoringAvg.short }]),
                  { value: 'hcp', label: 'Handicap' },
                  { value: 'rounds', label: 'Rounds' },
                  { value: 'name', label: 'Name' },
                ]}
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
                  standings={standings}
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
                  onShowEveryone={() => {
                    setQ('');
                    setShow('all');
                  }}
                />
              </Swap>
            </SectionBoundary>
            <SectionBoundary surface="roster.peek" label="The player panel" code="CH-3206">
              <RosterPeek p={cur} notesLocked={data.notesError} onClose={() => setSel(null)} onNoteSaved={noteSaved} availability={availability} helm={data.helm} />
            </SectionBoundary>
          </div>
        </>
      )}

      {dialogs}
      {ctx.menu}
    </main>
  );
}

/**
 * The roster itself, as cards or a table. Its own component so the
 * roster.list boundary contains everything it computes.
 */
function RosterList({
  rows,
  standings,
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
}: {
  rows: ChRosterPlayer[];
  standings: ReturnType<typeof rosterStandings>;
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
}) {
  return (
    // B5: every row's form line on one range, so the same height is the same score down the table.
    <FormRange trends={rows.map((p) => p.trend)} earlyBelow={3}>
        {rows.length === 0 ? (
          <EmptyState
            kind="filtered"
            code={q.trim() ? 'CH-3302' : 'CH-3303'}
            title={q.trim() ? `No players match “${q.trim()}”` : show === 'inactive' ? 'No inactive players.' : 'No active players.'}
            body={show === 'all' ? 'Search matches player names.' : `Only ${show} players are in view.`}
            action={<Button onClick={onShowEveryone}>Show everyone</Button>}
          />
        ) : view === 'faces' ? (
          <div className="ch-rs-faces">
            {rows.map((p) => (
              <button
                key={p.id}
                type="button"
                className={'ch-rs-face' + (sel === p.id ? ' is-sel' : '') + (p.status === 'inactive' ? ' is-off' : '')}
                aria-label={`${faceLabel(p, standings.byId.get(p.id))}. Open profile`}
                onClick={() => openProfile(p.id)}
                {...bind(p)}
              >
                <span className="ch-rs-face__top">
                  <span />
                  {/* CH-3802: the status is a word; the dot is decoration, drawn only under All where it tells players
                      apart (P003-A3: under Active or Inactive every dot is the same). CH-3602: on desktop the cell takes
                      the Ledger tint on hover and a deeper one on press; the phone's card lifts. */}
                  {show === 'all' && <span className={`ch-rs-face__dot is-${p.status}`} aria-hidden="true" />}
                  <span className="ch-sr-only">{p.status === 'active' ? 'Active' : 'Inactive'}</span>
                </span>
                <span className="ch-rs-face__av">
                  <Avatar name={p.name} size={76} />
                </span>
                <span className="ch-rs-face__name">{p.name}</span>
                <span className="ch-rs-face__meta">{[p.classYear, p.hometown].filter(Boolean).join(' · ') || ' '}</span>
                <span className="ch-rs-face__form">
                  <FormLine data={p.trend} width={150} height={30} earlyBelow={3} label={`${p.name} form`} />
                </span>
                <FaceFigures p={p} avgs={standings.avgs} standing={standings.byId.get(p.id)} />
                {/* Injured or away takes the note slot in plain ink, in place of a Needs a look reason (CH-3809: a word). */}
                {availabilityLine(p) ? (
                  <span className="ch-rs-face__note is-availability" title={availabilityLine(p)!}>
                    {availabilityLine(p)}
                  </span>
                ) : (
                  p.attention && <span className={`ch-rs-face__note is-${p.attention.tone}`}>{p.attention.text}</span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <SideScroll className="ch-rs-list ch-sheet" role="table" aria-label="Roster" /* CH-3801: every value in a cell under a header */>
            <div className="ch-rs-row ch-rs-row--head ch-well-soft" role="row">
              <SortHeader k="name" sort={sortBy} onSort={onSort}>
                Player
              </SortHeader>
              <span role="columnheader">Status</span>
              <span role="columnheader">Last 7 rounds</span>
              {!sortableAvg ? (
                <span role="columnheader" className="r">
                  Avg
                </span>
              ) : (
                <SortHeader k="avg" sort={sortBy} onSort={onSort} end>
                  Avg
                </SortHeader>
              )}
              <SortHeader k="hcp" sort={sortBy} onSort={onSort} end>
                HCP
              </SortHeader>
              <span role="columnheader" className="r">SG / rd</span>
              <SortHeader k="rounds" sort={sortBy} onSort={onSort} end>
                Rounds
              </SortHeader>
              <span role="columnheader">
                <span className="ch-sr-only">Actions</span>
              </span>
            </div>
            {rows.map((p) => (
              <div
                key={p.id}
                role="row"
                className={'ch-rs-row' + (sel === p.id ? ' is-sel' : '') + (p.status === 'inactive' ? ' is-off' : '')}
                {...bind(p)}
              >
                <span role="cell" className="ch-rs-who__cell">
                  <button
                    type="button"
                    className="ch-rs-who"
                    onClick={() => openProfile(p.id)}
                    aria-label={`${p.name}. Open profile`}
                  >
                    <Avatar name={p.name} size={40} />
                    <span>
                      <b>{p.name}</b>
                      <RowMeta p={p} />
                    </span>
                  </button>
                </span>
                <span role="cell">
                  <span className={`ch-rs-status is-${p.status}`}>
                    <i aria-hidden="true" />
                    {p.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </span>
                <span role="cell">
                  <FormLine data={p.trend} width={120} height={30} earlyBelow={3} label={`${p.name} form`} />
                </span>
                <span role="cell" className="r ch-num ch-rs-num">{formatFixed(p.avg)}</span>
                <span role="cell" className="r ch-num ch-rs-num2">{formatHcp(p.handicap)}</span>
                <span role="cell" className={'r ch-num ch-rs-sg ' + changeTone(p.sgPerRound, false, 1)}>
                  {p.sgPerRound == null ? NO_DATA : formatSigned(p.sgPerRound)}
                </span>
                <span role="cell" className="r ch-num ch-rs-num2">{p.rounds}</span>
                <span role="cell" className="r">
                  <Menu
                    label={`Actions for ${p.name}`}
                    items={menuFor(p)}
                    trigger={(t) => (
                      <Tooltip>
                        <button type="button" className="ch-btn ch-btn--ghost ch-iconbtn ch-btn--sm" aria-label={`Actions for ${p.name}`} {...t}>
                          <Icon icon={Ellipsis} size={15} />
                        </button>
                      </Tooltip>
                    )}
                  />
                </span>
              </div>
            ))}
          </SideScroll>
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
}: {
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
  const link = code && typeof window !== 'undefined' ? `${window.location.origin}/golf/join/${encodeURIComponent(code)}` : null;
  const share = async () => {
    if (!link) return;
    try {
      await navigator.share({ title: `Join ${teamName} on GolfHelm`, text: `Join ${teamName} on GolfHelm with code ${code}.`, url: link });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      void copy(link, 'Invite link');
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={UserPlus}
      title="Invite players"
      description={`Players who sign up with the team code or open the invite link join ${teamName} right away. Players already on GolfHelm who enter the code in Settings send a request you approve.`}
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      {code ? (
        <div className="ch-rs-inv">
          <div className="ch-rs-inv__code ch-well-soft">
            <span>Team code</span>
            <b className="ch-num">{code}</b>
            <Button size="sm" leftIcon={Copy} onClick={() => void copy(code, 'Team code')}>
              Copy
            </Button>
          </div>
          {link && (
            <div className="ch-field">
              <span className="ch-field__label">Or send the invite link</span>
              <div className="ch-rs-inv__link">
                {/* The scheme is left off and the field clips from the start (roster.css), so the code at the end stays in view; Copy and Share send the full URL. */}
                <input className="ch-input" readOnly value={link.replace(/^https?:\/\//, '')} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
                {typeof navigator !== 'undefined' && 'share' in navigator ? (
                  <Button variant="primary" leftIcon={Share} onClick={() => void share()}>
                    Share
                  </Button>
                ) : (
                  <Button variant="primary" leftIcon={Copy} onClick={() => void copy(link, 'Invite link')}>
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
            <Button size="sm" href="/golf/dashboard/settings?section=team">
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
}: {
  p: { avg: number | null; sgPerRound: number | null; handicap: number | null; rounds: number };
  /** The ranked team's averages (active, past the early floor), for the strip. */
  avgs: number[];
  /** This player's place among them; undefined when they aren't ranked (inactive, early, no average). */
  standing: RosterStanding | undefined;
}) {
  const lo = avgs.length ? Math.min(...avgs) : 0;
  const hi = avgs.length ? Math.max(...avgs) : 0;
  const at = (v: number) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
  const need = p.avg != null ? earlyNeed(p.rounds) : null;
  const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
  const sg = p.sgPerRound;
  const sgW = sg == null ? 0 : Math.min(50, (Math.abs(sg) / 3) * 50);
  return (
    <span className="ch-rs-figs">
      <span className="ch-rs-fig">
        <span className="ch-rs-fig__k">Scoring</span>
        <b className="ch-num">{formatFixed(p.avg)}</b>
        <span className="ch-rs-fig__m">{standing && standing.of > 1 ? `${standing.tied ? `T${standing.place}` : ord(standing.place)} of ${standing.of}` : need ?? 'Avg'}</span>
        {p.avg != null && standing && standing.of > 1 && (
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
        <b className={'ch-num ' + changeTone(sg, false, 1)}>{sg == null ? NO_DATA : formatSigned(sg)}</b>
        {sg != null && <span className="ch-rs-fig__m">a round</span>}
        {sg != null && (
          <span className="ch-rs-sgbar" aria-hidden="true">
            <i className={changeTone(sg, false, 1)} style={sg >= 0 ? { left: '50%', width: `${sgW}%` } : { right: '50%', width: `${sgW}%` }} />
          </span>
        )}
      </span>
      <span className="ch-rs-face__hcp">
        Handicap <b className="ch-num">{formatHcp(p.handicap)}</b>
      </span>
    </span>
  );
}

/** A card's name for VoiceOver: the player and one figure, not every number on it (P003 #13), then injured or away. */
function faceLabel(p: ChRosterPlayer, standing: RosterStanding | undefined): string {
  const out = p.availability && p.availability !== 'available' ? `, ${p.availability}` : '';
  if (p.avg == null) return `${p.name}${out}`;
  const place = standing && standing.of > 1 ? `, ${standing.tied ? 'tied ' : ''}${standing.place} of ${standing.of}` : '';
  return `${p.name}, scoring average ${formatAvg(p.avg)}${place}${out}`;
}

/**
 * The list row's line under the name: availability first when they are injured or away ("Injured · Sophomore · Charlotte,
 * NC"), the word in secondary ink and the rest tertiary, on one line with the whole of it in the title.
 */
function RowMeta({ p }: { p: ChRosterPlayer }) {
  const line = availabilityLine(p);
  const rest = [p.classYear, p.hometown].filter(Boolean).join(' · ');
  const full = [line, rest || null].filter(Boolean).join(' · ');
  return (
    <span className="ch-rs-who__m" title={line ? full : undefined}>
      {line ? (
        <>
          <span className="ch-rs-who__avail">{AVAILABILITY_WORD[p.availability]}</span>
          {full.slice(AVAILABILITY_WORD[p.availability].length)}
        </>
      ) : (
        rest
      )}
    </span>
  );
}
