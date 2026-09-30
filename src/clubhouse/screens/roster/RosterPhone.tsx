'use client';

import { BarChart3, Check, ChevronRight, Clock, Copy, Ellipsis, UserMinus, UserPlus, Users } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ChRoster, ChRosterPlayer } from '../../data/roster';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { FormLine } from '../../ui/FormLine';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { Modal } from '../../ui/Modal';
import { PhoneBar, PhoneIconAction } from '../../ui/PhoneBar';
import { Segmented } from '../../ui/Segmented';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { formatFixed } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { rebuiltHref } from '../../shell/nav';
import { PhoneScreen } from '../../shell/PhoneScreen';
import { PhoneTop, useBackFromMore, usePhoneStackHistory } from '../../shell/phone-chrome';
import { RosterProfile } from './RosterProfile';
import { formatHcp, rowNote } from './format';
import { nameList, type ChJoinRequestsState } from './useJoinRequests';
import { useCopyText } from './useCopyText';

type PhoneSort = 'avg' | 'sg' | 'name';

const lastName = (n: string) => n.split(' ').slice(-1)[0] ?? n;
/** Ascending, with missing values last. */
const nullsLast = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b);

function sortPlayers(list: ChRosterPlayer[], sort: PhoneSort): ChRosterPlayer[] {
  return [...list].sort((a, b) =>
    sort === 'name'
      ? lastName(a.name).localeCompare(lastName(b.name))
      : sort === 'sg'
        ? nullsLast(a.sgPerRound == null ? null : -a.sgPerRound, b.sgPerRound == null ? null : -b.sgPerRound)
        : nullsLast(a.avg, b.avg),
  );
}

/**
 * The phone Roster (owner design, docs/clubhouse/phone/roster.md), inside the
 * phone foundation: the top bar's "‹ More" and invite action, the join
 * requests banner and sheet, a sorted list of active players then Inactive,
 * and the player profile as a pushed screen with its ⋯ action sheet. Same
 * data, actions and catalog as desktop.
 */
export function RosterPhone({
  data,
  players,
  jr,
  openId,
  onOpen,
  onClose,
  onInvite,
  onRemove,
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
  onRetry: () => void;
  /** The dialogs (invite, remove confirm), shared with desktop. */
  children?: ReactNode;
}) {
  const backFromMore = useBackFromMore();
  const [sort, setSort] = useState<PhoneSort>('avg');
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const open = openId ? players.find((p) => p.id === openId) : undefined;
  const activeCount = players.filter((p) => p.status === 'active').length;
  const active = useMemo(() => sortPlayers(players.filter((p) => p.status === 'active'), sort), [players, sort]);
  const inactive = useMemo(() => sortPlayers(players.filter((p) => p.status === 'inactive'), sort), [players, sort]);

  // The profile is a history entry, so the iOS edge swipe and the browser's back pop it (CH-1906).
  const popTo = useCallback((level: number) => level < 1 && onClose(), [onClose]);
  usePhoneStackHistory(open ? 1 : 0, popTo);
  useEffect(() => setActing(false), [openId]);

  return (
    <main className="ch-rsm" aria-label="Roster">
      <PhoneTop
        title="Roster"
        back={{ label: 'More', onBack: backFromMore }}
        action={
          <PhoneIconAction
            icon={UserPlus}
            label="Invite players"
            onClick={() => {
              haptic('press');
              onInvite();
            }}
          />
        }
      />
      <div className="ch-rsm-page" inert={open ? true : undefined}>
        <header className="ch-rsm-head">
          {!data.playersError && (
            <span className="ch-rsm-kicker">
              {data.teamName} · <span className="ch-num">{activeCount}</span> active
            </span>
          )}
          {/* The top bar carries the page's heading; this is the design's large title. */}
          <p className="ch-rsm-title" aria-hidden="true">
            Roster
          </p>
        </header>

        <SectionBoundary surface="roster.requests" label="Join requests" code="CH-3204">
          <RequestsBanner
            jr={jr}
            error={data.requestsError}
            onRetry={onRetry}
            onOpen={() => {
              haptic('press');
              setRequestsOpen(true);
            }}
          />
        </SectionBoundary>

        {data.statsError && (
          <InlineNotice
            code="CH-3202"
            title="Season stats didn't load."
            body="The roster is complete, but averages, form and strokes gained are missing until the rounds load. The error has been reported."
            onRetry={onRetry}
          />
        )}

        {data.playersError ? (
          <InlineNotice
            code="CH-3201"
            title="The roster didn't load."
            body="Your players are safe. Try again, and if it keeps happening the error has already been reported."
            onRetry={onRetry}
          />
        ) : players.length === 0 ? (
          <div className="ch-rsm-panel">
            <EmptyState
              code="CH-3301"
              icon={Users}
              title="No players on the roster yet."
              body="Share your join code and approve requests as they arrive. Players appear here once approved."
              action={
                <Button variant="primary" leftIcon={UserPlus} onClick={onInvite}>
                  Invite players
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="ch-rsm-sort">
              <span>Sort by</span>
              <Segmented<PhoneSort>
                size="sm"
                label="Sort players"
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'avg', label: 'Avg', aria: 'Avg, scoring average' },
                  { value: 'sg', label: 'SG', aria: 'SG, strokes gained' },
                  { value: 'name', label: 'Name' },
                ]}
              />
            </div>
            <SectionBoundary surface="roster.list" label="The roster" code="CH-3205">
              <RosterPhoneList active={active} inactive={inactive} statsError={data.statsError} onOpen={onOpen} />
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
                    haptic('press');
                    setActing(true);
                  }}
                />
              }
            />
            <div className="ch-rsm-scroll">
              <SectionBoundary surface="roster.peek" label="The player panel" code="CH-3206">
                <RosterProfile p={open} notesLocked={data.notesError} statsError={data.statsError} />
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
      />
      <RequestsSheet open={requestsOpen} onClose={() => setRequestsOpen(false)} data={data} jr={jr} />
      {children}
    </main>
  );
}

function RosterPhoneList({
  active,
  inactive,
  statsError,
  onOpen,
}: {
  active: ChRosterPlayer[];
  inactive: ChRosterPlayer[];
  statsError: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <>
      {active.length > 0 && (
        <ul className="ch-rsm-panel ch-rsm-list" aria-label="Active players">
          {active.map((p) => (
            <li key={p.id}>
              <RosterPhoneRow p={p} statsError={statsError} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
      {inactive.length > 0 && (
        <>
          <h2 className="ch-rsm-sec" id="ch-rsm-inactive">
            Inactive
          </h2>
          <ul className="ch-rsm-panel ch-rsm-list" aria-labelledby="ch-rsm-inactive">
            {inactive.map((p) => (
              <li key={p.id}>
                <RosterPhoneRow p={p} statsError={statsError} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** One player: avatar, name, class and note, a form spark from three rounds (D-57), average and handicap. */
export function RosterPhoneRow({ p, statsError, onOpen }: { p: ChRosterPlayer; statsError: boolean; onOpen: (id: string) => void }) {
  const note = rowNote(p, statsError);
  const label = [
    p.name,
    p.classYear,
    p.status === 'inactive' ? 'inactive' : null,
    note?.text,
    p.avg != null ? `average ${formatFixed(p.avg)}` : null,
    p.handicap != null ? `handicap ${formatHcp(p.handicap)}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <button type="button" className="ch-rsm-row" aria-label={label} data-ch-code="CH-3806" onClick={() => onOpen(p.id)}>
      <Avatar name={p.name} size={40} />
      <span className="ch-rsm-row__b">
        <b>{p.name}</b>
        <span className={note?.tone ? `is-${note.tone}` : undefined}>{[p.classYear, note?.text].filter(Boolean).join(' · ') || ' '}</span>
      </span>
      {p.trend.length >= 3 && (
        <span className="ch-rsm-row__spark" aria-hidden="true">
          <FormLine data={p.trend} width={48} height={20} earlyBelow={3} bare label={`${p.name} form`} />
        </span>
      )}
      <span className="ch-rsm-row__v">
        <b className="ch-num">{formatFixed(p.avg)}</b>
        <span className="ch-num">{formatHcp(p.handicap)} hcp</span>
      </span>
    </button>
  );
}

/** "2 join requests · Grace Liu, Owen Park": opens the requests sheet. A failed read says so in the same slot (CH-3203). */
function RequestsBanner({ jr, error, onRetry, onOpen }: { jr: ChJoinRequestsState; error: boolean; onRetry: () => void; onOpen: () => void }) {
  if (error) {
    return (
      <InlineNotice
        code="CH-3203"
        title="Join requests didn't load."
        body="Pending requests are safe. Try again, and if it keeps happening the error has already been reported."
        onRetry={onRetry}
      />
    );
  }
  const n = jr.reqs.length;
  if (!n) return null;
  const names = jr.reqs.slice(0, 2).map((r) => r.name);
  return (
    <button type="button" className="ch-rsm-banner" onClick={onOpen}>
      <span className="ch-rsm-banner__ic" aria-hidden="true">
        <Icon icon={UserPlus} size={16} />
      </span>
      <span className="ch-rsm-banner__b">
        <b className="ch-num">
          {n} join {n === 1 ? 'request' : 'requests'}
        </b>
        <span>{n > 2 ? `${names.join(', ')} and ${n - 2} more` : nameList(names)}</span>
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
          <Button variant="primary" size="lg" leftIcon={Check} disabled={jr.busy != null} feel={null} onClick={() => void jr.approveAll()}>
            {jr.approvingAll ? <span data-ch-code="CH-3403">Approving</span> : `Approve all ${n}`}
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
              <span className="ch-rsm-rq__h ch-well-soft">
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
              <Button variant="primary" leftIcon={Check} disabled={jr.busy != null} feel={null} onClick={() => void jr.decide(r, true)}>
                Approve
              </Button>
            </div>
          </div>
        ))}
        {data.joinCode && (
          <>
            <div className="ch-rsm-code ch-well-soft">
              <span>
                <span>Team code</span>
                <b className="ch-num">{data.joinCode}</b>
              </span>
              <Button size="sm" leftIcon={Copy} onClick={() => void copy(data.joinCode!, 'Join code')}>
                Copy
              </Button>
            </div>
            <p className="ch-rsm-reqs__note">Players join with this code. Approved players see the team calendar and messages.</p>
          </>
        )}
      </div>
    </Modal>
  );
}

/** The profile's ⋯ (D-54): View stats, then Remove from team, which asks first (CH-3501). */
function PlayerActions({ p, onClose, onRemove }: { p: ChRosterPlayer | undefined; onClose: () => void; onRemove: (p: ChRosterPlayer) => void }) {
  const statsHref = p ? rebuiltHref(`/golf/dashboard/stats?player=${p.id}`) : null;
  return (
    <Modal open={!!p} onClose={onClose} title={p?.name ?? 'Player'}>
      {p && (
        <div className="ch-rsm-panel ch-rsm-acts">
          {statsHref && (
            <Link href={statsHref} className="ch-rsm-act" onClick={() => haptic('select')}>
              <span className="ch-rsm-act__ic" aria-hidden="true">
                <Icon icon={BarChart3} size={16} />
              </span>
              <b>View stats</b>
            </Link>
          )}
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
