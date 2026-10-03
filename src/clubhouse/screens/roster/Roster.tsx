'use client';

import { BarChart3, Copy, Download, Ellipsis, LayoutGrid, List, MessageSquare, Share, Sparkles, UserMinus, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useChSessionState } from '../../lib/session-state';
import { useRouter } from 'next/navigation';
import { removePlayerFromTeam } from '@/app/golf/actions/roster';
import type { ChRoster, ChRosterPlayer } from '../../data/roster';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { InlineNotice } from '../../ui/Notices';
import { FormLine } from '../../ui/FormLine';
import { Icon } from '../../ui/Icon';
import { Menu, type MenuItem } from '../../ui/Menu';
import { Modal } from '../../ui/Modal';
import { PillGroup, Segmented } from '../../ui/Segmented';
import { SearchField } from '../../ui/SearchField';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { useToast } from '../../ui/Toast';
import { useAction } from '../../lib/use-action';
import { haptic } from '../../lib/haptics';
import { useChPhone } from '../../lib/use-phone';
import { chTrail } from '../../lib/track';
import { formatFixed, formatSigned, NO_DATA } from '../../lib/format';
import { rebuiltHref } from '../../shell/nav';
import { RosterRequests } from './RosterRequests';
import { useJoinRequests } from './useJoinRequests';
import { useCopyText } from './useCopyText';
import { RosterPeek } from './RosterPeek';
import { RosterPhone } from './RosterPhone';
import { formatHcp } from './format';
import '../../styles/roster.css';

type Sort = 'avg' | 'hcp' | 'rounds' | 'name';
type Show = 'active' | 'inactive' | 'all';
type View = 'faces' | 'list';
const VIEW_KEY = 'ch-roster-view';

const lastName = (n: string) => n.split(' ').slice(-1)[0] ?? n;
const nullsLast = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b);
/** A spreadsheet reads a cell that starts with = + - @ (or a tab or a return) as a formula. Players type their own names, so the export writes them as text (30502). */
const asText = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

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
  const [sel, setSel] = useState<string | null>(null);
  const [invite, setInvite] = useState(false);
  const [removing, setRemoving] = useState<ChRosterPlayer | null>(null);
  const jr = useJoinRequests(data.teamName, data.requests);
  const phone = useChPhone();
  // Phone: the open player is a pushed screen (RosterPhone keeps it in the history, CH-1906).
  // A link with ?player= opens that profile once; the param is dropped so a reload shows the list.
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!phone) return;
    const url = new URL(window.location.href);
    const id = url.searchParams.get('player');
    if (!id) return;
    url.searchParams.delete('player');
    window.history.replaceState(null, '', url.pathname + url.search);
    setOpenId(id);
  }, [phone]);
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
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* not persisted; still switches */
    }
  };

  const active = players.filter((p) => p.status === 'active');
  const inactiveCount = players.length - active.length;
  const teamAvg = useMemo(() => {
    const avgs = active.map((p) => p.avg).filter((v): v is number => v != null);
    return avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  }, [active]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = players.filter((p) => (show === 'all' || p.status === show) && p.name.toLowerCase().includes(needle));
    return [...list].sort((a, b) =>
      sort === 'name'
        ? lastName(a.name).localeCompare(lastName(b.name))
        : sort === 'avg'
          ? nullsLast(a.avg, b.avg)
          : sort === 'hcp'
            ? nullsLast(a.handicap, b.handicap)
            : b.rounds - a.rounds,
    );
  }, [players, q, show, sort]);

  const attn = players.filter((p) => p.attention && p.status === 'active');
  const cur = players.find((p) => p.id === sel);
  const select = useCallback((id: string | null) => {
    if (id) chTrail('roster open player');
    haptic('select');
    setSel((s) => (s === id ? null : id));
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
      done: `${p.name} removed from ${data.teamName}`,
      failed: `Couldn't remove ${p.name}`,
      hint: 'Nothing changed on the roster. Try again, or refresh if it keeps failing.',
      code: 'CH-3001',
    }),
  );
  /** A note that saved is the note the list holds, so the player reads back with it (31203). */
  const noteSaved = useCallback(
    (id: string, note: string | null) => setPlayers((ps) => ps.map((x) => (x.id === id ? { ...x, coachNote: note } : x))),
    [],
  );

  const exportCsv = () => {
    const head = ['Player', 'Class', 'Status', 'Rounds', 'Scoring avg', 'SG per round', 'Handicap'];
    const lines = rows.map((p) =>
      [asText(p.name), p.classYear ?? '', p.status, p.rounds, p.avg?.toFixed(1) ?? '', p.sgPerRound?.toFixed(2) ?? '', p.handicap ?? '']
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
      toast({ title: `Roster exported · ${rows.length} ${rows.length === 1 ? 'player' : 'players'}` });
    } catch {
      haptic('error');
      toast({ tone: 'error', title: "Couldn't export the roster", body: 'Your browser blocked the download. Try again, or use a desktop browser.', code: 'CH-3005' });
    }
  };

  const statsHref = (p: ChRosterPlayer) => rebuiltHref(`/golf/dashboard/stats?player=${p.id}`);
  const messagesHref = rebuiltHref('/golf/dashboard/messages');
  const menuFor = (p: ChRosterPlayer): MenuItem[] => {
    const items: MenuItem[] = [];
    // The board's first row item: CoachHelm opened on this player.
    const insights = rebuiltHref(`/golf/dashboard/coachhelm?player=${p.id}`, 'coach');
    if (insights) items.push({ label: 'View insights', icon: Sparkles, href: insights });
    const s = statsHref(p);
    if (s) items.push({ label: 'View stats', icon: BarChart3, href: s });
    if (messagesHref) items.push({ label: 'Message', icon: MessageSquare, href: messagesHref });
    if (items.length) items.push({ kind: 'separator' });
    items.push({ label: 'Remove from team', icon: UserMinus, danger: true, onSelect: () => setRemoving(p) });
    return items;
  };

  const dialogs = (
    <>
      <InviteModal
        open={invite}
        onClose={() => setInvite(false)}
        teamName={data.teamName}
        code={data.joinCode}
        codeFailed={data.teamError}
        onRetry={() => router.refresh()}
      />
      <Modal
        code="CH-3501"
        open={!!removing}
        onClose={() => setRemoving(null)}
        width={460}
        icon={UserMinus}
        title="Remove player?"
        description={removing ? `Remove ${removing.name} from ${data.teamName}? They can rejoin later with the team code.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={remove.pending}
              feel="warning"
              onClick={() => {
                if (removing) void remove.run(removing);
              }}
            >
              {remove.pending ? <span data-ch-code="CH-3402">Removing</span> : 'Remove player'}
            </Button>
          </>
        }
      >
        <p className="ch-rs-remove">Their account and stats are not deleted. This only removes them from your active roster.</p>
      </Modal>
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
        onNoteSaved={noteSaved}
        onRetry={() => router.refresh()}
      >
        {dialogs}
      </RosterPhone>
    );
  }

  return (
    <main className="ch-rs">
      <header className="ch-rs-head">
        <div>
          <span className="ch-rs-team">
            <span className="ch-rs-team__stack" aria-hidden="true">
              {active.slice(0, 7).map((p) => (
                <Avatar key={p.id} name={p.name} size={30} />
              ))}
            </span>
            <span className="ch-rs-team__name">{[data.teamName, data.season].filter(Boolean).join(' · ')}</span>
          </span>
          <h1 className="ch-display">Your players.</h1>
          {!data.playersError && (
            <p>
              <span className="ch-num">{players.length}</span> {players.length === 1 ? 'player' : 'players'} &middot;{' '}
              <span className="ch-num">{active.length}</span> active.
              {teamAvg != null && (
                <>
                  {' '}
                  Team average <span className="ch-num">{teamAvg.toFixed(1)}</span> over the season.
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

      <SectionBoundary surface="roster.requests" label="Join requests" code="CH-3204">
        <RosterRequests teamName={data.teamName} jr={jr} error={data.requestsError} onRetry={() => router.refresh()} />
      </SectionBoundary>

      {data.statsError && (
        <InlineNotice
          code="CH-3202"
          title="Season stats didn't load."
          body="The roster is complete, but averages, form and strokes gained are missing until the rounds load. The error has been reported."
          onRetry={() => router.refresh()}
        />
      )}

      {attn.length > 0 && (
        <section className="ch-rs-attn" aria-label="Needs a look">
          <span className="ch-rs-attn__l">Needs a look</span>
          {attn.map((p) => (
            <button key={p.id} type="button" className="ch-rs-attn__c" onClick={() => select(p.id)}>
              <Avatar name={p.name} size={24} />
              <b>{p.firstName}</b>
              <span className={`ch-rs-attn__n is-${p.attention!.tone}`}>{p.attention!.text}</span>
            </button>
          ))}
        </section>
      )}

      {data.playersError ? (
        <InlineNotice
          code="CH-3201"
          title="The roster didn't load."
          body="Your players are safe. Try again, and if it keeps happening the error has already been reported."
          onRetry={() => router.refresh()}
        />
      ) : players.length === 0 ? (
        <EmptyState
          size="page"
          code="CH-3301"
          icon={Users}
          title="No players yet"
          body="Share your team code, then approve requests as they arrive. Players appear here as soon as they join."
          action={
            <Button variant="primary" leftIcon={UserPlus} onClick={() => setInvite(true)}>
              Invite players
            </Button>
          }
          secondaryAction={
            data.joinCode ? (
              <Button leftIcon={Copy} onClick={() => void copy(data.joinCode!, 'Join code')}>
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
                  <button
                    key={v}
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
                ))}
              </div>
              <Segmented<Sort>
                size="sm"
                label="Sort players"
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'avg', label: 'Avg score' },
                  { value: 'hcp', label: 'Handicap' },
                  { value: 'rounds', label: 'Rounds' },
                  { value: 'name', label: 'Name' },
                ]}
              />
            </div>
          </div>

          <div className={'ch-rs-body' + (cur ? ' has-peek' : '')}>
            <SectionBoundary surface="roster.list" label="The roster" code="CH-3205">
              <RosterList
                rows={rows}
                view={view}
                sel={sel}
                q={q}
                show={show}
                select={select}
                menuFor={menuFor}
                onShowEveryone={() => {
                  setQ('');
                  setShow('all');
                }}
              />
            </SectionBoundary>
            <SectionBoundary surface="roster.peek" label="The player panel" code="CH-3206">
              <RosterPeek p={cur} notesLocked={data.notesError} onClose={() => setSel(null)} onNoteSaved={noteSaved} />
            </SectionBoundary>
          </div>
        </>
      )}

      {dialogs}
    </main>
  );
}

/**
 * The roster itself, as cards or a table. Its own component so the
 * roster.list boundary contains everything it computes.
 */
function RosterList({
  rows,
  view,
  sel,
  q,
  show,
  select,
  menuFor,
  onShowEveryone,
}: {
  rows: ChRosterPlayer[];
  view: View;
  sel: string | null;
  q: string;
  show: Show;
  select: (id: string | null) => void;
  menuFor: (p: ChRosterPlayer) => MenuItem[];
  onShowEveryone: () => void;
}) {
  return (
    <>
      {rows.length === 0 ? (
        <div className="ch-rs-empty ch-sheet">
          <EmptyState
            compact
            code={q.trim() ? 'CH-3302' : 'CH-3303'}
            title={q.trim() ? `No players match “${q.trim()}”` : show === 'inactive' ? 'No inactive players.' : 'No active players.'}
            action={
              <Button
                size="sm"
                onClick={onShowEveryone}
              >
                Show everyone
              </Button>
            }
          />
        </div>
      ) : view === 'faces' ? (
        <div className="ch-rs-faces">
          {rows.map((p) => (
            <button
              key={p.id}
              type="button"
              className={'ch-rs-face' + (sel === p.id ? ' is-sel' : '') + (p.status === 'inactive' ? ' is-off' : '')}
              aria-pressed={sel === p.id}
              onClick={() => select(p.id)}
            >
              <span className="ch-rs-face__top">
                <span />
                {/* CH-3802: the status is a word; the dot is decoration. CH-3602: the card lifts on hover and presses in. */}
                <span className={`ch-rs-face__dot is-${p.status}`} aria-hidden="true" />
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
              <span className="ch-rs-face__figs">
                <span>
                  <b className="ch-num">{formatFixed(p.avg)}</b>Avg
                </span>
                <span>
                  <b className={'ch-num' + (p.sgPerRound == null ? '' : p.sgPerRound >= 0 ? ' is-gain' : ' is-loss')}>
                    {p.sgPerRound == null ? NO_DATA : formatSigned(p.sgPerRound)}
                  </b>
                  SG
                </span>
                <span>
                  <b className="ch-num">{formatHcp(p.handicap)}</b>HCP
                </span>
              </span>
              {p.attention && <span className={`ch-rs-face__note is-${p.attention.tone}`}>{p.attention.text}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="ch-rs-list ch-sheet" role="table" aria-label="Roster" /* CH-3801: every value in a cell under a header */>
          <div className="ch-rs-row ch-rs-row--head ch-well-soft" role="row">
            <span role="columnheader">Player</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Last 7 rounds</span>
            <span role="columnheader" className="r">Avg</span>
            <span role="columnheader" className="r">HCP</span>
            <span role="columnheader" className="r">SG / rd</span>
            <span role="columnheader" className="r">Rounds</span>
            <span role="columnheader">
              <span className="ch-sr-only">Actions</span>
            </span>
          </div>
          {rows.map((p) => (
            <div
              key={p.id}
              role="row"
              className={'ch-rs-row' + (sel === p.id ? ' is-sel' : '') + (p.status === 'inactive' ? ' is-off' : '')}
            >
              <span role="cell" className="ch-rs-who__cell">
                <button type="button" className="ch-rs-who" onClick={() => select(p.id)} aria-pressed={sel === p.id}>
                  <Avatar name={p.name} size={40} />
                  <span>
                    <b>{p.name}</b>
                    <span className="ch-rs-who__m">{[p.classYear, p.hometown].filter(Boolean).join(' · ')}</span>
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
              <span role="cell" className={'r ch-num ch-rs-sg' + (p.sgPerRound == null ? '' : p.sgPerRound >= 0 ? ' is-gain' : ' is-loss')}>
                {p.sgPerRound == null ? NO_DATA : formatSigned(p.sgPerRound)}
              </span>
              <span role="cell" className="r ch-num ch-rs-num2">{p.rounds}</span>
              <span role="cell" className="r">
                <Menu
                  label={`Actions for ${p.name}`}
                  items={menuFor(p)}
                  trigger={(t) => (
                    <button type="button" className="ch-btn ch-btn--ghost ch-iconbtn ch-btn--sm" aria-label={`Actions for ${p.name}`} {...t}>
                      <Icon icon={Ellipsis} size={15} />
                    </button>
                  )}
                />
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function InviteModal({
  open,
  onClose,
  teamName,
  code,
  codeFailed,
  onRetry,
}: {
  open: boolean;
  onClose: () => void;
  teamName: string;
  code: string | null;
  codeFailed: boolean;
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
      description={`Players join ${teamName} with the code or link. You approve each request.`}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {code ? (
        <div className="ch-rs-inv">
          <div className="ch-rs-inv__code ch-well-soft">
            <span>Join code</span>
            <b className="ch-num">{code}</b>
            <Button size="sm" leftIcon={Copy} onClick={() => void copy(code, 'Join code')}>
              Copy
            </Button>
          </div>
          {link && (
            <div className="ch-field">
              <span className="ch-field__label">Or send the link</span>
              <div className="ch-rs-inv__link">
                <input className="ch-input" readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
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
              <span className="ch-field__help">It opens the join request with your team filled in.</span>
            </div>
          )}
        </div>
      ) : codeFailed ? (
        <InlineNotice
          code="CH-3207"
          title="The join code didn't load."
          body="Your code still works for players who have it. Try again to show it here."
          onRetry={onRetry}
        />
      ) : (
        <EmptyState
          code="CH-3304"
          compact
          title="Your team has no join code yet."
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
