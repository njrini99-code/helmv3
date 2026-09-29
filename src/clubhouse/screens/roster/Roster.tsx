'use client';

import { BarChart3, Copy, Download, Ellipsis, LayoutGrid, List, MessageSquare, Share, UserMinus, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { chTrail } from '../../lib/track';
import { formatFixed, formatSigned, NO_DATA } from '../../lib/format';
import { rebuiltHref } from '../../shell/nav';
import { RosterRequests } from './RosterRequests';
import { RosterPeek } from './RosterPeek';
import { formatHcp } from './format';
import '../../styles/roster.css';

type Sort = 'avg' | 'hcp' | 'rounds' | 'name';
type Show = 'active' | 'inactive' | 'all';
type View = 'faces' | 'list';
const VIEW_KEY = 'ch-roster-view';

const lastName = (n: string) => n.split(' ').slice(-1)[0] ?? n;
const nullsLast = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b);

export function Roster({ data }: { data: ChRoster }) {
  const toast = useToast();
  const router = useRouter();
  const [players, setPlayers] = useState(data.players);
  const [q, setQ] = useState('');
  const [show, setShow] = useState<Show>('active');
  const [sort, setSort] = useState<Sort>('avg');
  const [view, setView] = useState<View>('faces');
  const [sel, setSel] = useState<string | null>(null);
  const [invite, setInvite] = useState(false);
  const [removing, setRemoving] = useState<ChRosterPlayer | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === 'list' || v === 'faces') setView(v);
    } catch {
      /* private mode: the default view is fine */
    }
  }, []);
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

  const remove = useAction('roster.removePlayer', (p: ChRosterPlayer) => removePlayerFromTeam(p.id), (p) => ({
    done: `${p.name} removed from ${data.teamName}`,
    failed: `Couldn't remove ${p.name}`,
    hint: 'Nothing changed on the roster. Try again, or refresh if it keeps failing.',
  }));

  const exportCsv = () => {
    const head = ['Player', 'Class', 'Status', 'Rounds', 'Scoring avg', 'SG per round', 'Handicap'];
    const lines = rows.map((p) =>
      [p.name, p.classYear ?? '', p.status, p.rounds, p.avg?.toFixed(1) ?? '', p.sgPerRound?.toFixed(2) ?? '', p.handicap ?? '']
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
      haptic('commit');
      toast({ title: `Roster exported · ${rows.length} ${rows.length === 1 ? 'player' : 'players'}` });
    } catch {
      haptic('error');
      toast({ tone: 'error', title: "Couldn't export the roster", body: 'Your browser blocked the download. Try again, or use a desktop browser.' });
    }
  };

  const statsHref = (p: ChRosterPlayer) => rebuiltHref(`/golf/dashboard/stats?player=${p.id}`);
  const messagesHref = rebuiltHref('/golf/dashboard/messages');
  const menuFor = (p: ChRosterPlayer): MenuItem[] => {
    const items: MenuItem[] = [];
    const s = statsHref(p);
    if (s) items.push({ label: 'View stats', icon: BarChart3, href: s });
    if (messagesHref) items.push({ label: 'Message', icon: MessageSquare, href: messagesHref });
    if (items.length) items.push({ kind: 'separator' });
    items.push({ label: 'Remove from team', icon: UserMinus, danger: true, onSelect: () => setRemoving(p) });
    return items;
  };

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
          <Button variant="primary" leftIcon={UserPlus} onClick={() => setInvite(true)}>
            Invite players
          </Button>
        </div>
      </header>

      <SectionBoundary surface="roster.requests" label="Join requests">
        <RosterRequests teamName={data.teamName} initial={data.requests} error={data.requestsError} />
      </SectionBoundary>

      {data.statsError && (
        <InlineNotice
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
          title="The roster didn't load."
          body="Your players are safe. Try again, and if it keeps happening the error has already been reported."
          onRetry={() => router.refresh()}
        />
      ) : players.length === 0 ? (
        <div className="ch-rs-empty ch-sheet">
          <EmptyState
            icon={Users}
            title="No players on the roster yet."
            body="Share your join code and approve requests as they arrive. Players appear here once approved."
            action={
              <Button variant="primary" leftIcon={UserPlus} onClick={() => setInvite(true)}>
                Invite players
              </Button>
            }
          />
        </div>
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
              <Segmented<View>
                size="sm"
                label="Layout"
                value={view}
                onChange={changeView}
                options={[
                  { value: 'faces', label: <Icon icon={LayoutGrid} size={15} />, aria: 'Team view' },
                  { value: 'list', label: <Icon icon={List} size={15} />, aria: 'List view' },
                ]}
              />
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
            <SectionBoundary surface="roster.list" label="The roster">
              {rows.length === 0 ? (
                <div className="ch-rs-empty ch-sheet">
                  <EmptyState
                    compact
                    title={q.trim() ? `No players match “${q.trim()}”` : show === 'inactive' ? 'No inactive players.' : 'No players to show.'}
                    action={
                      <Button
                        size="sm"
                        onClick={() => {
                          setQ('');
                          setShow('all');
                        }}
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
                        {p.jersey ? <span className="ch-rs-face__jersey ch-num">#{p.jersey}</span> : <span />}
                        <span className={`ch-rs-face__dot is-${p.status}`} aria-label={p.status === 'active' ? 'Active' : 'Inactive'} />
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
                <div className="ch-rs-list ch-sheet" role="table" aria-label="Roster">
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
                      <button type="button" className="ch-rs-who" onClick={() => select(p.id)} aria-pressed={sel === p.id}>
                        <Avatar name={p.name} size={40} />
                        <span>
                          <b>{p.name}</b>
                          <span className="ch-rs-who__m">{[p.classYear, p.hometown].filter(Boolean).join(' · ')}</span>
                        </span>
                      </button>
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
            </SectionBoundary>
            <SectionBoundary surface="roster.peek" label="The player panel">
              <RosterPeek p={cur} onClose={() => setSel(null)} />
            </SectionBoundary>
          </div>
        </>
      )}

      <InviteModal open={invite} onClose={() => setInvite(false)} teamName={data.teamName} code={data.joinCode} />
      <Modal
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
              feel={null}
              onClick={async () => {
                const p = removing;
                if (!p) return;
                const res = await remove.run(p);
                if (res.success) {
                  setPlayers((ps) => ps.filter((x) => x.id !== p.id));
                  if (sel === p.id) setSel(null);
                  setRemoving(null);
                }
              }}
            >
              {remove.pending ? 'Removing' : 'Remove player'}
            </Button>
          </>
        }
      >
        <p className="ch-rs-remove">Their account and stats are not deleted. This only removes them from your active roster.</p>
      </Modal>
    </main>
  );
}

function InviteModal({ open, onClose, teamName, code }: { open: boolean; onClose: () => void; teamName: string; code: string | null }) {
  const toast = useToast();
  const link = code && typeof window !== 'undefined' ? `${window.location.origin}/golf/join/${encodeURIComponent(code)}` : null;
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      haptic('success');
      toast({ title: `${what} copied` });
    } catch {
      haptic('error');
      toast({ tone: 'error', title: `Couldn't copy the ${what.toLowerCase()}`, body: 'Select it and copy it by hand.' });
    }
  };
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
      ) : (
        <EmptyState compact title="Your team has no join code yet." body="Create one from team settings, then invite players here." />
      )}
    </Modal>
  );
}
