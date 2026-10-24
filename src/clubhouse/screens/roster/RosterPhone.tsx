'use client';

import { BarChart3, Check, ChevronRight, Clock, Copy, Ellipsis, UserCheck, UserMinus, UserPlus, UserX } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import Link from 'next/link';
import { startTransition, useCallback, useEffect, useRef, useState, ViewTransition, type ReactNode } from 'react';
import { useChSessionState } from '../../lib/session-state';
import type { ChRoster, ChRosterPlayer } from '../../data/roster';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { FormLine } from '../../ui/FormLine';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { PageRefreshNotice } from '../../ui/RefreshNotice';
import { Modal } from '../../ui/Modal';
import { PhoneBar, PhoneIconAction } from '../../ui/PhoneBar';
import { Segmented } from '../../ui/Segmented';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { changeTone, formatFixed, formatSigned, NO_DATA } from '../../lib/format';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { rebuiltHref } from '../../shell/nav';
import { PhoneScreen } from '../../shell/PhoneScreen';
import { PhoneTop, usePhoneStackHistory } from '../../shell/phone-chrome';
import { usePressPrefetch } from '../../shell/use-prefetch-tabs';
import type { AvailabilityControl, NoteSaved } from './RosterPeek';
import { RosterProfile } from './RosterProfile';
import { PlayerPeek } from '../../ui/PlayerPeek';
import { formatHcp, rosterFailedParts, rosterPeek, rowNote } from './format';
import { useRosterSort, type PhoneSort } from './sort';
import { nameList, type ChJoinRequestsState } from './useJoinRequests';
import { useCopyText } from './useCopyText';

export type { PhoneSort } from './sort';

/**
 * The phone Roster (owner design, docs/clubhouse/phone/roster.md), inside the
 * phone foundation: the top bar's "‹ More" and invite action, the join
 * requests banner and sheet, a sorted list of active players then Inactive,
 * and the player profile as a pushed screen with its ⋯ action sheet. Same
 * data, actions and catalog as desktop.
 */
/** A `?tab=requests` arrival not yet shown (see RosterPhone). */
let linkedRequests = false;

export function RosterPhone({
  data,
  players,
  jr,
  openId,
  onOpen,
  onClose,
  onInvite,
  onRemove,
  onStatus,
  onNoteSaved,
  availability,
  onRetry,
  children,
}: {
  data: ChRoster;
  players: ChRosterPlayer[];
  jr: ChJoinRequestsState;
  openId: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
  onInvite: () => void;
  onRemove: (p: ChRosterPlayer) => void;
  /** Mark the player active or inactive; it asks first (CH-3502). */
  onStatus: (p: ChRosterPlayer) => void;
  onNoteSaved: NoteSaved;
  /** Roster's availability write (the profile's Availability panel). */
  availability: AvailabilityControl;
  onRetry: () => void;
  /** The dialogs (invite, remove confirm), shared with desktop. */
  children?: ReactNode;
}) {
  const copy = useCopyText();
  const [sort, setSort] = useChSessionState<PhoneSort>('phoneSort', 'avg');
  const [requestsOpen, setRequestsOpen] = useState(false);
  // The bell's join-request notice links here with `?tab=requests` (createTeamJoinRequest): it opens the requests
  // sheet once, and the param is dropped so a reload shows the list. The flag outlives a remount that dropping the
  // param can cause (as the linked player does in Roster) and lapses when the sheet closes.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('tab') === 'requests') {
      linkedRequests = true;
      url.searchParams.delete('tab');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
    if (!linkedRequests) return;
    if (jr.reqs.length) setRequestsOpen(true);
    else linkedRequests = false;
    // Once, on arrival: the list it reads is the one the page arrived with.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const closeRequests = useCallback(() => {
    linkedRequests = false;
    setRequestsOpen(false);
  }, []);
  const [acting, setActing] = useState(false);
  const open = openId ? players.find((p) => p.id === openId) : undefined;
  const activeCount = players.filter((p) => p.status === 'active').length;
  // Counted among the active players, as on desktop: availability never changes the active roster.
  const injuredCount = players.filter((p) => p.status === 'active' && p.availability === 'injured').length;
  const awayCount = players.filter((p) => p.status === 'active' && p.availability === 'away').length;
  // Avg and SG order nothing while season stats are missing: the list falls back to Name (P003 #7).
  const sortBy: PhoneSort = data.statsError ? 'name' : sort;
  const { active, inactive } = useRosterSort(players, sortBy);
  // CH-3604: a chosen sort reorders inside a transition, so each moved row slides to its place (RosterPhoneList).
  // The figures take the new sort's values at once: no digits roll and nothing counts up (owner rule, as on Qualifiers).
  const chooseSort = useCallback((v: PhoneSort) => startTransition(() => setSort(v)), [setSort]);

  // The profile is a history entry, so the iOS edge swipe and the browser's back pop it (CH-1906).
  const popTo = useCallback((level: number) => level < 1 && onClose(), [onClose]);
  usePhoneStackHistory(open ? 1 : 0, popTo);
  useEffect(() => setActing(false), [openId]);
  // Two or more failed reads are told once under the head, with one Try again; each part keeps its title (CH-1209).
  const failed = rosterFailedParts(data);
  const covered = failed.length > 1;

  return (
    <main className="ch-rsm" aria-label="Roster">
      <PhoneTop
        title="Roster"
        start
        action={
          // One primary per screen: while nobody is on the roster the empty state (CH-3301) carries Invite players.
          data.playersError || players.length > 0 ? (
            <PhoneIconAction
              icon={UserPlus}
              label="Invite players"
              onClick={() => {
                onInvite();
              }}
            />
          ) : undefined
        }
      />
      <div className="ch-rsm-page" inert={open ? true : undefined}>
        <header className="ch-rsm-head">
          {/* With nobody on the roster the count is 0: the team's name says enough (wave 10). */}
          {!data.playersError && (
            <span className="ch-rsm-kicker">
              {data.teamName}
              {players.length > 0 && (
                <>
                  {' '}
                  · <span className="ch-num">{activeCount}</span> active
                  {injuredCount > 0 && (
                    <>
                      {' '}
                      · <span className="ch-num">{injuredCount}</span> injured
                    </>
                  )}
                  {awayCount > 0 && (
                    <>
                      {' '}
                      · <span className="ch-num">{awayCount}</span> away
                    </>
                  )}
                </>
              )}
            </span>
          )}
          {/* The top bar carries the page's heading; this is the design's large title. */}
          <p className="ch-rsm-title" aria-hidden="true">
            Roster
          </p>
        </header>

        <PageRefreshNotice parts={failed} />

        <SectionBoundary surface="roster.requests" label="Join requests" code="CH-3204">
          <RequestsBanner
            jr={jr}
            error={data.requestsError}
            covered={covered}
            onRetry={onRetry}
            onOpen={() => {
              setRequestsOpen(true);
            }}
          />
        </SectionBoundary>

        {data.statsError && (
          <InlineNotice
            code="CH-3202"
            title="Season stats didn’t load"
            body="The roster is complete, but averages, form and strokes gained are missing until the rounds load. The error has been reported."
            onRetry={onRetry}
            covered={covered}
          />
        )}

        {data.playersError ? (
          <InlineNotice
            code="CH-3201"
            title="The roster didn’t load"
            body="Your players are safe. Try again; the error has been reported."
            onRetry={onRetry}
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
              <Button variant="primary" leftIcon={UserPlus} onClick={onInvite}>
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
            <div className="ch-rsm-sort">
              <span>Sort by</span>
              <Segmented<PhoneSort>
                size="sm"
                label="Sort players"
                value={sortBy}
                onChange={chooseSort}
                options={
                  data.statsError
                    ? [{ value: 'name', label: 'Name' }]
                    : [
                        { value: 'avg', label: 'Avg', aria: 'Avg, scoring average' },
                        { value: 'sg', label: 'SG', aria: 'SG, strokes gained' },
                        { value: 'name', label: 'Name' },
                      ]
                }
              />
            </div>
            <SectionBoundary surface="roster.list" label="The roster" code="CH-3205">
              <RosterPhoneList active={active} inactive={inactive} statsError={data.statsError} sort={sortBy} onOpen={onOpen} />
            </SectionBoundary>
          </>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <PhoneScreen key={`player-${open.id}`} labelledBy="ch-rsm-prof-title" className="ch-rsm-screen">
            <PhoneBar
              back={{ label: 'Roster', onBack: onClose }}
              // The design shows no title here; the name is the screen's heading for VoiceOver, and the hero shows it.
              title={<span className="ch-sr-only">{open.name}</span>}
              titleId="ch-rsm-prof-title"
              action={
                <PhoneIconAction
                  icon={Ellipsis}
                  label="More actions"
                  onClick={() => {
                    setActing(true);
                  }}
                />
              }
            />
            <div className="ch-rsm-scroll">
              <SectionBoundary surface="roster.peek" label="The player panel" code="CH-3206">
                <RosterProfile p={open} notesLocked={data.notesError} statsError={data.statsError} onNoteSaved={onNoteSaved} availability={availability} helm={data.helm} />
              </SectionBoundary>
            </div>
          </PhoneScreen>
        )}
      </AnimatePresence>

      <PlayerActions
        p={acting ? open : undefined}
        onClose={() => setActing(false)}
        onRemove={(p) => {
          setActing(false);
          onRemove(p);
        }}
        onStatus={(p) => {
          setActing(false);
          onStatus(p);
        }}
      />
      <RequestsSheet open={requestsOpen} onClose={closeRequests} data={data} jr={jr} />
      {children}
    </main>
  );
}

/**
 * The active players, then Inactive. A chosen sort (and only that: never a refresh, which keeps the rows where they are
 * under the finger) slides each moved row to its new place on the smooth spring inside React's `<ViewTransition>`
 * (class `ch-rsm-reorder`, roster.css), while its trailing figure rolls to the new sort's figure. Reduced motion and
 * Animations off reorder at once.
 */
function RosterPhoneList({
  active,
  inactive,
  statsError,
  sort,
  onOpen,
}: {
  active: ChRosterPlayer[];
  inactive: ChRosterPlayer[];
  statsError: boolean;
  sort: PhoneSort;
  onOpen: (id: string) => void;
}) {
  const reduced = useChReducedMotion();
  // The sort last committed to the screen. A ref, not state: recording it must not draw the list again.
  const drawn = useRef(sort);
  useEffect(() => {
    drawn.current = sort;
  });
  const slide = !reduced && drawn.current !== sort;
  const row = (p: ChRosterPlayer) => (
    <li key={p.id}>
      <RosterPhoneRow p={p} statsError={statsError} sort={sort} onOpen={onOpen} slide={slide} />
    </li>
  );
  return (
    <>
      {active.length > 0 && (
        <ul className="ch-rsm-panel ch-rsm-list" aria-label="Active players">
          {active.map(row)}
        </ul>
      )}
      {inactive.length > 0 && (
        <>
          <h2 className="ch-rsm-sec" id="ch-rsm-inactive">
            Inactive
          </h2>
          <ul className="ch-rsm-panel ch-rsm-list" aria-labelledby="ch-rsm-inactive">
            {inactive.map(row)}
          </ul>
        </>
      )}
    </>
  );
}

/**
 * One player: avatar, name, class and note, a form spark from three rounds (D-57), and the figure the list is sorted by
 * (native-feel audit 2026-10-08, P1-3): strokes gained per round under SG, gains green and losses amber; otherwise the
 * scoring average with the handicap. Sorted by name, the name leads the row already, so the average and handicap stay.
 * The figure is plain tabular text that takes a new sort's value at once: no digits roll and nothing counts up (owner
 * rule, as on Qualifiers). `slide` lets the row travel to its new place (RosterPhoneList).
 */
export function RosterPhoneRow({
  p,
  statsError,
  sort = 'avg',
  onOpen,
  slide = false,
}: {
  p: ChRosterPlayer;
  statsError: boolean;
  sort?: PhoneSort;
  onOpen: (id: string) => void;
  slide?: boolean;
}) {
  const note = rowNote(p, statsError);
  const bySg = sort === 'sg';
  const sg = p.sgPerRound;
  const label = [
    p.name,
    p.classYear,
    p.status === 'inactive' ? 'inactive' : null,
    note?.text,
    bySg ? (sg != null ? `strokes gained ${formatSigned(sg)} a round` : 'no strokes gained yet') : null,
    p.avg != null ? `average ${formatFixed(p.avg)}` : null,
    !bySg && p.handicap != null ? `handicap ${formatHcp(p.handicap)}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  // P003-C1: a hold peeks at the player (the shell's PlayerPeek); a tap still opens the profile. The transition sits
  // inside the peek, so the slide names the row itself.
  return (
    <PlayerPeek player={rosterPeek(p)}>
      <ViewTransition name={`ch-rsm-row-${p.id}`} update={slide ? 'ch-rsm-reorder' : 'none'} enter="none" exit="none" share="none" default="none">
        <button type="button" className="ch-rsm-row" aria-label={label} data-ch-code="CH-3806" onClick={() => onOpen(p.id)}>
          <Avatar name={p.name} size={40} />
          <span className="ch-rsm-row__b">
            <b>{p.name}</b>
            {/* The class year stays plain; only the note takes its tone (amber for a slide, green for a gain). */}
            <span>
              {p.classYear}
              {p.classYear && note?.text ? ' · ' : null}
              {note?.text ? <span className={note.tone ? `is-${note.tone}` : undefined}>{note.text}</span> : null}
              {!p.classYear && !note?.text ? ' ' : null}
            </span>
          </span>
          {p.trend.length >= 3 && (
            <span className="ch-rsm-row__spark" aria-hidden="true">
              <FormLine data={p.trend} width={48} height={20} earlyBelow={3} bare label={`${p.name} form`} />
            </span>
          )}
          <span className="ch-rsm-row__v" data-sort={bySg ? 'sg' : undefined}>
            <b className={`ch-num ${bySg ? changeTone(sg, false) : ''}`.trim()}>
              {rowFigure(bySg ? sg : p.avg, bySg)}
            </b>
            <span className="ch-num">{bySg ? 'SG / rd' : `${formatHcp(p.handicap)} hcp`}</span>
          </span>
        </button>
      </ViewTransition>
    </PlayerPeek>
  );
}

/** A row's figure as plain tabular text: a true minus and an explicit plus for strokes gained, no data a dash. */
const rowFigure = (value: number | null, signed: boolean) => (value == null ? NO_DATA : signed ? formatSigned(value) : formatFixed(value));

/**
 * "2 join requests · Grace Liu, Owen Park": one flat row at the top of the list (the count in a badge, the names under the
 * title, a chevron), which opens the requests sheet. Its name says the count in words. A failed read says so in the same
 * slot (CH-3203), as its title alone while the page's one notice covers it (CH-1209).
 */
function RequestsBanner({ jr, error, covered, onRetry, onOpen }: { jr: ChJoinRequestsState; error: boolean; covered: boolean; onRetry: () => void; onOpen: () => void }) {
  if (error) {
    return (
      <InlineNotice
        code="CH-3203"
        title="Join requests didn’t load"
        body="Pending requests are safe. Try again; the error has been reported."
        onRetry={onRetry}
        covered={covered}
      />
    );
  }
  const n = jr.reqs.length;
  if (!n) return null;
  const names = jr.reqs.slice(0, 2).map((r) => r.name);
  const who = n > 2 ? `${names.join(', ')} and ${n - 2} more` : nameList(names);
  return (
    <button type="button" className="ch-rsm-banner" aria-label={`${n} join ${n === 1 ? 'request' : 'requests'}, ${who}`} onClick={onOpen}>
      <span className="ch-rsm-banner__n ch-num" aria-hidden="true">
        {n}
      </span>
      <span className="ch-rsm-banner__b">
        <b>{n === 1 ? 'Join request' : 'Join requests'}</b>
        <span>{who}</span>
      </span>
      <Icon icon={ChevronRight} size={16} />
    </button>
  );
}

/**
 * The join requests sheet: approve or decline each request, Approve all
 * (D-55; CH-3403 while it runs, CH-3007 when some fail), and the team code
 * with Copy. It closes once the last request is decided.
 */
function RequestsSheet({ open, onClose, data, jr }: { open: boolean; onClose: () => void; data: ChRoster; jr: ChJoinRequestsState }) {
  const copy = useCopyText();
  const n = jr.reqs.length;
  useEffect(() => {
    if (open && n === 0 && !jr.approvingAll) onClose();
  }, [open, n, jr.approvingAll, onClose]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Join requests"
      description={
        <span className="ch-num">
          {n} waiting · {data.teamName}
        </span>
      }
      footer={
        n > 0 || jr.approvingAll ? (
          <Button variant="primary" size="lg" leftIcon={Check} busy={jr.approvingAll} disabled={jr.busy != null && !jr.approvingAll} feel={null} onClick={() => void jr.approveAll()}>
            {jr.approvingAll ? <span data-ch-code="CH-3403">Approving…</span> : `Approve all ${n}`}
          </Button>
        ) : undefined
      }
    >
      <div className="ch-rsm-reqs">
        {jr.reqs.map((r) => (
          <div key={r.id} className="ch-rsm-rq">
            <div className="ch-rsm-rq__top">
              <Avatar name={r.name} size={44} />
              <span className="ch-rsm-rq__id">
                <b>{r.name}</b>
                <span>{[r.classYear, r.gradYear ? `Class of ${r.gradYear}` : null].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="ch-rsm-rq__h">
                <b className="ch-num">{formatHcp(r.handicap)}</b>
                <span>hcp</span>
              </span>
            </div>
            <div className="ch-rsm-rq__meta">
              <Icon icon={Clock} size={13} />
              Requested {r.requested}
            </div>
            <div className="ch-rsm-rq__act">
              <Button disabled={jr.busy != null} onClick={() => void jr.decide(r, false)}>
                Decline
              </Button>
              {/* Approve all is the sheet's one primary (P003 #5); each row's Approve is secondary. */}
              <Button leftIcon={Check} disabled={jr.busy != null} feel={null} onClick={() => void jr.decide(r, true)}>
                Approve
              </Button>
            </div>
          </div>
        ))}
        {data.joinCode && (
          <>
            <div className="ch-rsm-code">
              <span>
                <span>Team code</span>
                <b className="ch-num">{data.joinCode}</b>
              </span>
              <Button size="sm" leftIcon={Copy} onClick={() => void copy(data.joinCode!, 'Team code')}>
                Copy
              </Button>
            </div>
            <p className="ch-rsm-reqs__note">Requests come from players already on GolfHelm who enter this code in Settings. Approved players see the team calendar and messages.</p>
          </>
        )}
      </div>
    </Modal>
  );
}

/**
 * The profile's ⋯ (D-54): View stats, Mark inactive (or Mark active), then Remove from team. The status change asks
 * first (CH-3502), as the removal does (CH-3501).
 */
function PlayerActions({
  p,
  onClose,
  onRemove,
  onStatus,
}: {
  p: ChRosterPlayer | undefined;
  onClose: () => void;
  onRemove: (p: ChRosterPlayer) => void;
  onStatus: (p: ChRosterPlayer) => void;
}) {
  const statsHref = p ? rebuiltHref(`/golf/dashboard/stats?player=${p.id}`) : null;
  // The player's stats are fetched whole as a finger lands on View stats (A13).
  const press = usePressPrefetch();
  return (
    <Modal open={!!p} onClose={onClose} title={p?.name ?? 'Player'}>
      {p && (
        <div className="ch-rsm-panel ch-rsm-acts">
          {statsHref && (
            <Link href={statsHref} className="ch-rsm-act" {...press(statsHref)}>
              <span className="ch-rsm-act__ic" aria-hidden="true">
                <Icon icon={BarChart3} size={16} />
              </span>
              <b>View stats</b>
            </Link>
          )}
          <button type="button" className="ch-rsm-act" onClick={() => onStatus(p)}>
            <span className="ch-rsm-act__ic" aria-hidden="true">
              <Icon icon={p.status === 'active' ? UserX : UserCheck} size={16} />
            </span>
            <b>{p.status === 'active' ? 'Mark inactive' : 'Mark active'}</b>
          </button>
          <button type="button" className="ch-rsm-act is-danger" onClick={() => onRemove(p)}>
            <span className="ch-rsm-act__ic" aria-hidden="true">
              <Icon icon={UserMinus} size={16} />
            </span>
            <b>Remove from team</b>
          </button>
        </div>
      )}
    </Modal>
  );
}
