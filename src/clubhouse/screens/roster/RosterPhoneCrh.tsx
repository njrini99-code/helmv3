'use client';

import { ChartColumn, Check, ChevronRight, CircleAlert, Copy, Ellipsis, RotateCw, UserCheck, UserMinus, UserPlus, Users, UserX } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useChReducedMotion } from '../../lib/reduced-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useChSessionState } from '../../lib/session-state';
import type { ChRoster, ChRosterPlayer } from '../../data/roster';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { CrhStateBlock } from '../../ui/CrhStateBlock';
import { FormBars, FormRange } from '../../ui/FormLine';
import { GroupList, GroupRow } from '../../ui/GroupList';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { LargeTitle, LargeTitleContext } from '../../ui/LargeTitle';
import { ListPresence, PresenceRow } from '../../ui/ListPresence';
import { Modal } from '../../ui/Modal';
import { PageRefreshNotice } from '../../ui/RefreshNotice';
import { PhoneBar, PhoneIconAction } from '../../ui/PhoneBar';
import { PlayerPeek } from '../../ui/PlayerPeek';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Segmented } from '../../ui/Segmented';
import { Surface } from '../../ui/Surface';
import { ClassStatusLine } from '../../ui/ClassStatusLine';
import { changeTone, formatFixed, formatHcp, formatSigned } from '../../lib/format';
import { NoData } from '../../ui/NoData';
import { TERMS } from '../../lib/glossary';
import { pluralWord, plural } from '../../lib/plural';
import { rebuiltHref } from '../../shell/nav';
import { PhoneScreen } from '../../shell/PhoneScreen';
import { PhoneTop } from '../../shell/phone-chrome';
import { useDeepLinkSheet } from '../../shell/use-deep-link-sheet';
import { usePressPrefetch } from '../../shell/use-prefetch-tabs';
import { classNoteFor, NO_CLASS_LINES, type RosterClassLine, type RosterClassLines } from './class-line';
import { lastFive, rosterFailedParts, rosterPeek, rowNote, yearKeyOf, yearLineOf, type RosterClock } from './format';
import type { AvailabilityControl, NoteSaved } from './RosterPeek';
import { RosterLeaders } from './RosterLeaders';
import { RosterProfileCrh } from './RosterProfileCrh';
import { RosterTeamCard } from './RosterTeamCard';
import { useRosterSort, type PhoneSort } from './sort';
import { useFlipRows } from './use-flip-rows';
import { useGuardedPhoneHistory } from './use-guarded-history';
import { nameList, type ChJoinRequestsState } from './useJoinRequests';
import { useCopyText } from './useCopyText';

/** Bars and coins hold one size at XXL, so rows stay on the row; 06 7.6. */
const STUB_LABEL = 'Not enough rounds';

/**
 * The phone Roster behind `clubhouse_classes_roster_home_v1` (design-refresh/classes-roster-home 05, 06 7): large title, the team
 * card, leaders, the join requests row, a sticky sort, then Active, Injured and Inactive cards, with the profile pushed over it. Today's
 * RosterPhone stays for flag off and this replaces it whole, so nothing here reaches a flag-off screen.
 */
export function RosterPhoneCrh({
  data,
  players,
  jr,
  openId,
  arrivedAtRest,
  onOpen,
  onClose,
  onInvite,
  onRemove,
  onStatus,
  onNoteSaved,
  availability,
  classLines = NO_CLASS_LINES,
  hold,
  onRetry,
  children,
}: {
  data: ChRoster;
  players: ChRosterPlayer[];
  jr: ChJoinRequestsState;
  openId: string | null;
  /** The profile came from a link: it shows at rest, with no push (M-CRH-46). */
  arrivedAtRest: boolean;
  onOpen: (id: string) => void;
  onClose: () => void;
  onInvite: () => void;
  onRemove: (p: ChRosterPlayer) => void;
  onStatus: (p: ChRosterPlayer) => void;
  onNoteSaved: NoteSaved;
  availability: AvailabilityControl;
  classLines?: RosterClassLines;
  hold?: { onPointerDownCapture: () => void };
  onRetry: () => void;
  children?: ReactNode;
}) {
  const copy = useCopyText();
  const router = useRouter();
  const clock = data.clock;
  const [sort, setSort] = useChSessionState<PhoneSort>('phoneSort', 'avg');
  // `?tab=requests` opens the sheet at rest; a tap opens it with its rise (CP-5).
  const link = useDeepLinkSheet('tab', { value: 'requests' });
  const [tapped, setTapped] = useState(false);
  const requestsOpen = link.open || tapped;
  const closeRequests = useCallback(() => {
    setTapped(false);
    if (link.open) link.close();
  }, [link]);
  const [acting, setActing] = useState(false);
  const open = openId ? players.find((p) => p.id === openId) : undefined;
  const sortBy: PhoneSort = data.statsError ? 'name' : sort;
  const { active, inactive } = useRosterSort(players, sortBy);
  const injured = active.filter((p) => p.availability === 'injured');
  const playing = active.filter((p) => p.availability !== 'injured');
  const listRef = useRef<HTMLDivElement>(null);
  const capture = useFlipRows(listRef, sortBy);
  const chooseSort = useCallback(
    (v: PhoneSort) => {
      capture();
      setSort(v);
    },
    [capture, setSort],
  );
  useEffect(() => setActing(false), [openId]);

  // The Coach's note with unsaved text keeps the profile up: Back, a link or an edge swipe asks first (M-CRH-58). The edge swipe commits
  // by clicking this Back, and a Back that does not leave springs the screen home (use-edge-swipe.ts).
  const noteDirty = useRef(false);
  const [leaving, setLeaving] = useState<null | { href: string | null }>(null);
  const guardedClose = useCallback(() => {
    if (noteDirty.current) setLeaving({ href: null });
    else onClose();
  }, [onClose]);
  useGuardedPhoneHistory(
    !!open,
    onClose,
    useCallback(() => {
      if (!noteDirty.current) return false;
      setLeaving({ href: null });
      return true;
    }, []),
  );
  useEffect(() => {
    noteDirty.current = false;
  }, [openId]);
  const onProfileClick = (e: MouseEvent<HTMLElement>) => {
    if (!noteDirty.current) return;
    const a = (e.target as Element).closest?.('a[href]');
    if (!a) return;
    e.preventDefault();
    setLeaving({ href: a.getAttribute('href') });
  };
  const discard = () => {
    const to = leaving?.href ?? null;
    noteDirty.current = false;
    setLeaving(null);
    if (to) router.push(to);
    else onClose();
  };
  const keepEditing = () => {
    setLeaving(null);
    if (open) document.getElementById(`note-${open.id}`)?.focus();
  };

  const failed = rosterFailedParts(data);
  const covered = failed.length > 1;
  const empty = !data.playersError && players.length === 0;

  return (
    <main className="ch-rsm ch-rsx" data-ch-crh="on" aria-label="Roster">
      <PhoneTop title="Roster" start action={!empty ? <PhoneIconAction icon={UserPlus} label="Invite players" onClick={onInvite} /> : undefined} />
      <div className="ch-rsm-page" inert={open ? true : undefined}>
        <header className="ch-rsm-head">
          <LargeTitle as="p" hidden>
            Roster
          </LargeTitle>
          {!data.teamError && <LargeTitleContext>{data.teamName}</LargeTitleContext>}
        </header>

        <PageRefreshNotice parts={failed} />

        {data.playersError ? (
          <Surface variant="card" level={2} padded={false} title="Players">
            <CrhStateBlock kind="failed" code="CH-3201" title="The roster didn’t load" body="Try again. Nothing was lost.">
              <Button leftIcon={RotateCw} onClick={onRetry}>
                Try again
              </Button>
            </CrhStateBlock>
          </Surface>
        ) : empty ? (
          <Surface variant="card" level={2} padded={false} title="Players">
            <CrhStateBlock code="CH-3301" icon={Users} title="No players yet" body="Share your team code or invite by email. Players show here once you approve them.">
              <Button variant="primary" leftIcon={UserPlus} onClick={onInvite}>
                Invite players
              </Button>
              {data.joinCode && (
                <Button leftIcon={Copy} onClick={() => void copy(data.joinCode!, 'Team code')}>
                  Copy team code
                </Button>
              )}
            </CrhStateBlock>
          </Surface>
        ) : (
          <>
            <RosterTeamCard viewer="coach" season={data.season} players={players} waiting={data.requestsError ? null : jr.reqs.length} statsError={data.statsError} clock={clock} />
            <div className="ch-rsx-sec is-tight">
              <RosterLeaders players={players} statsError={data.statsError} clock={clock} onOpen={onOpen} />
            </div>
            <SectionBoundary surface="roster.requests" label="Join requests" code="CH-3204">
              <RequestsRow jr={jr} error={data.requestsError} covered={covered} clock={clock} onRetry={onRetry} onOpen={() => setTapped(true)} />
            </SectionBoundary>
            {data.statsError && (
              <InlineNotice code="CH-3202" title="Season stats didn’t load" body="The roster is complete, but averages, form and strokes gained are missing until the rounds load." onRetry={onRetry} covered={covered} />
            )}
            <div className="ch-stickybar ch-rsx-sort">
              <Segmented<PhoneSort>
                block
                label="Sort by"
                value={sortBy}
                onChange={chooseSort}
                options={
                  data.statsError
                    ? [{ value: 'name', label: 'Name' }]
                    : [
                        { value: 'avg', label: TERMS.avg.short, aria: `${TERMS.avg.short}, ${TERMS.scoringAvg.long.toLowerCase()}` },
                        { value: 'sg', label: TERMS.strokesGained.short, aria: `${TERMS.strokesGained.short}, ${TERMS.strokesGained.long.toLowerCase()}` },
                        { value: 'name', label: 'Name' },
                      ]
                }
              />
            </div>
            <SectionBoundary surface="roster.list" label="The roster" code="CH-3205">
              <div ref={listRef} className="ch-rsx-lists">
                {/* B5 and R10: one range over the five rounds the bars draw, so the same height is the same score down the list. */}
                <FormRange trends={[...playing, ...injured].map((p) => lastFive(p.trend))} earlyBelow={3}>
                  {playing.length > 0 && (
                    <div className="ch-rsx-sec is-tight">
                      <Surface
                        variant="card"
                        level={2}
                        padded={false}
                        title="Active"
                        actions={<span className="ch-rsx-meta ch-num">{plural(playing.length, 'player')}</span>}
                        footerNote="Bars are the last five rounds this season. Green beats the team average."
                      >
                        <GroupList>
                          {playing.map((p) => (
                            <RosterRowCrh key={p.id} p={p} statsError={data.statsError} sort={sortBy} mean={data.teamAvg} clock={clock} onOpen={onOpen} classLine={classNoteFor(p, classLines.get(p.id))} hold={hold} />
                          ))}
                        </GroupList>
                      </Surface>
                    </div>
                  )}
                  {injured.length > 0 && (
                    <div className="ch-rsx-sec">
                      <Surface variant="card" level={2} padded={false} title="Injured" actions={<span className="ch-rsx-meta ch-num">{injured.length}</span>}>
                        <GroupList>
                          {injured.map((p) => (
                            <RosterRowCrh key={p.id} p={p} statsError={data.statsError} sort={sortBy} mean={data.teamAvg} clock={clock} onOpen={onOpen} kind="injured" hold={hold} />
                          ))}
                        </GroupList>
                      </Surface>
                    </div>
                  )}
                  {inactive.length > 0 && (
                    <div className="ch-rsx-sec">
                      <Surface id="ch-rsm-inactive" variant="card" level={2} padded={false} title="Inactive" actions={<span className="ch-rsx-meta ch-num">{inactive.length}</span>}>
                        <GroupList>
                          {inactive.map((p) => (
                            <RosterRowCrh key={p.id} p={p} statsError={data.statsError} sort={sortBy} mean={data.teamAvg} clock={clock} onOpen={onOpen} kind="inactive" hold={hold} />
                          ))}
                        </GroupList>
                      </Surface>
                    </div>
                  )}
                </FormRange>
              </div>
            </SectionBoundary>
          </>
        )}
      </div>

      <ProfilePresence atRest={arrivedAtRest}>
        {open && (
          <PhoneScreen key={`player-${open.id}`} keyboardAware immersive={false} labelledBy="ch-rsm-prof-title" className="ch-rsm-screen ch-rsx-screen">
            <PhoneBar back={{ label: 'Roster', onBack: guardedClose }} title={open.name} titleId="ch-rsm-prof-title" action={<PhoneIconAction icon={Ellipsis} label="Player actions" onClick={() => setActing(true)} />} />
            <div className="ch-rsm-scroll" onClickCapture={onProfileClick}>
              <SectionBoundary surface="roster.peek" label="The player panel" code="CH-3206">
                <RosterProfileCrh
                  p={open}
                  notesLocked={data.notesError}
                  statsError={data.statsError}
                  onNoteSaved={onNoteSaved}
                  availability={availability}
                  helm={data.helm}
                  clock={clock}
                  sgVs={data.sgVs ?? 'vs Tour'}
                  onNoteDirty={(d) => {
                    noteDirty.current = d;
                  }}
                />
              </SectionBoundary>
            </div>
          </PhoneScreen>
        )}
      </ProfilePresence>

      <PlayerActionsCrh
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
      <RequestsSheetCrh open={requestsOpen} atRest={link.atRest} onClose={closeRequests} data={data} jr={jr} clock={clock} />
      <Modal
        open={!!leaving}
        onClose={keepEditing}
        width={420}
        title="Discard your changes?"
        description={open ? `Your note about ${open.firstName} hasn’t been saved.` : undefined}
        footer={
          <>
            <Button onClick={keepEditing}>Keep editing</Button>
            <Button variant="danger" feel="warning" onClick={discard}>
              Discard
            </Button>
          </>
        }
      />
      {children}
    </main>
  );
}

/** A profile from a link is at rest on its first frame: this presence is new with the profile in it, so it runs no `initial` (M-CRH-46). */
function ProfilePresence({ atRest, children }: { atRest: boolean; children: ReactNode }) {
  const reduced = useChReducedMotion();
  return atRest || reduced ? (
    <AnimatePresence key="rest" initial={false}>
      {children}
    </AnimatePresence>
  ) : (
    <AnimatePresence key="tap">{children}</AnimatePresence>
  );
}

/** The two neutral stubs under three rounds: an honest "not enough rounds" where the bars would be. */
export function FormStubs() {
  return (
    <span className="ch-formbars is-stub" role="img" aria-label={STUB_LABEL}>
      <i />
      <i />
    </span>
  );
}

/**
 * One player (06 7.6, 7.7): year coin, name, note, form bars, the figure the list sorts by, chevron. A tap pushes the profile; a hold
 * peeks (M-CRH-41). `injured` swaps the note for the amber chip; `inactive` has no bars.
 */
export function RosterRowCrh({
  p,
  statsError,
  sort,
  mean,
  clock,
  onOpen,
  kind = 'active',
  classLine = null,
  hold,
}: {
  p: ChRosterPlayer;
  statsError: boolean;
  sort: PhoneSort;
  mean: number | null;
  clock: RosterClock;
  onOpen: (id: string) => void;
  kind?: 'active' | 'injured' | 'inactive';
  classLine?: RosterClassLine | null;
  hold?: { onPointerDownCapture: () => void };
}) {
  const note = kind === 'injured' ? null : classLine ? { text: classLine.text, tone: null } : rowNote(p, statsError);
  const bySg = sort === 'sg';
  const sg = p.sgPerRound;
  const shown = lastFive(p.trend);
  const label = [
    p.name,
    p.classYear,
    kind === 'injured' ? 'injured' : kind === 'inactive' ? 'inactive' : null,
    note?.text,
    bySg ? (sg != null ? `strokes gained ${formatSigned(sg)} a round` : 'no strokes gained yet') : null,
    p.avg != null ? `average ${formatFixed(p.avg)}` : null,
    !bySg && p.handicap != null ? `handicap ${formatHcp(p.handicap).replace('+', 'plus ')}` : null,
    kind !== 'inactive' && p.trend.length >= 3 ? `last five rounds: ${shown.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <GroupRow twoLine className="ch-rsx-grow">
      <PlayerPeek player={rosterPeek(p)}>
        <button type="button" className="ch-rsm-row ch-rsx-row" data-ch-roster-row="" data-flip={p.id} aria-label={label} data-ch-code="CH-3806" onClick={() => onOpen(p.id)} {...hold}>
          <span className={kind === 'injured' ? 'ch-rsx-coin is-dim' : 'ch-rsx-coin'}>
            <Avatar name={p.name} id={p.id} size="md" year={yearKeyOf(p.gradYear, clock)} dim={kind !== 'active'} />
          </span>
          <span className="ch-rsx-row__b">
            <b>{p.name}</b>
            {kind === 'injured' ? (
              <span className="ch-rsx-inj">
                <Icon icon={CircleAlert} size={12} />
                Injured
              </span>
            ) : (
              <span>
                {classLine ? <ClassStatusLine kind={classLine.kind} text={classLine.text} /> : note?.text ? <span className={note.tone ? `is-${note.tone}` : undefined}>{note.text}</span> : ' '}
              </span>
            )}
          </span>
          {kind === 'active' && (p.trend.length >= 3 ? <FormBars data={p.trend} mean={mean} /> : p.trend.length > 0 ? <FormStubs /> : null)}
          <span className="ch-rsm-row__v ch-rsx-row__v" data-sort={bySg ? 'sg' : undefined}>
            <b className={`ch-num ${bySg ? (sg == null ? 'is-none' : changeTone(sg, false)) : p.avg == null ? 'is-none' : ''}`.trim()}>{bySg ? (sg == null ? <NoData /> : formatSigned(sg)) : p.avg == null ? <NoData /> : formatFixed(p.avg)}</b>
            <span className="ch-num">{bySg ? 'SG / rd' : `${formatHcp(p.handicap)} ${TERMS.handicap.short}`}</span>
          </span>
          <span className="ch-rsm-row__chev" aria-hidden="true">
            <Icon icon={ChevronRight} size={15} />
          </span>
        </button>
      </PlayerPeek>
    </GroupRow>
  );
}

/** The Join requests row (06 7.4): up to three coins, a "+n" coin past that, the names, a badge and a chevron. Absent with no request. */
export function RequestsRow({ jr, error, covered, clock, onRetry, onOpen }: { jr: ChJoinRequestsState; error: boolean; covered: boolean; clock: RosterClock; onRetry: () => void; onOpen: () => void }) {
  if (error) return <InlineNotice code="CH-3203" title="Join requests didn’t load" body="Pending requests are safe. Try again." onRetry={onRetry} covered={covered} />;
  const n = jr.reqs.length;
  if (!n) return null;
  const names = jr.reqs.slice(0, 2).map((r) => r.name);
  const who = n > 2 ? `${names.join(', ')} and ${n - 2} more` : nameList(names);
  return (
    <button type="button" className="ch-rsx-req" aria-label={`${n} join ${pluralWord(n, 'request')}: ${who}`} onClick={onOpen}>
      <span className="ch-rsx-req__coins" aria-hidden="true">
        {jr.reqs.slice(0, 3).map((r) => (
          <Avatar key={r.id} name={r.name} size="md" year={yearKeyOf(r.gradYear, clock)} />
        ))}
        {n > 3 && <span className="ch-rsx-req__more ch-num">+{n - 3}</span>}
      </span>
      <span className="ch-rsx-row__b">
        <b>{pluralWord(n, 'Join request')}</b>
        <span>{who}</span>
      </span>
      <span className="ch-rsx-badge ch-num" aria-hidden="true">
        {n}
      </span>
      <span className="ch-rsm-row__chev" aria-hidden="true">
        <Icon icon={ChevronRight} size={15} />
      </span>
    </button>
  );
}

/**
 * The join requests sheet at 62% (06 9, CP-6.5): a row for each request with its own Decline and Approve, the team code, and Approve all
 * only with two or more. Opened by a link with none waiting, it says so. The last request handled here closes it, 300ms after the row
 * has faded (M-CRH-36). A decided row fades and the rows below close up (ListPresence).
 */
export function RequestsSheetCrh({ open, atRest, onClose, data, jr, clock }: { open: boolean; atRest: boolean; onClose: () => void; data: ChRoster; jr: ChJoinRequestsState; clock: RosterClock }) {
  const copy = useCopyText();
  const n = jr.reqs.length;
  const had = useRef(n > 0);
  useEffect(() => {
    if (!open) return;
    if (n > 0) {
      had.current = true;
      return;
    }
    if (!had.current || jr.approvingAll) return;
    had.current = false;
    const t = window.setTimeout(onClose, 480);
    return () => window.clearTimeout(t);
  }, [open, n, jr.approvingAll, onClose]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Join requests"
      detent={0.62}
      atRest={atRest}
      footer={
        n >= 2 || (jr.approvingAll && n > 0) ? (
          <Button variant="primary" size="lg" leftIcon={Check} busy={jr.approvingAll} disabled={jr.busy != null && !jr.approvingAll} feel={null} onClick={() => void jr.approveAll()}>
            {jr.approvingAll ? <span data-ch-code="CH-3403">Approving…</span> : `Approve all ${n}`}
          </Button>
        ) : undefined
      }
    >
      <div className="ch-rsx-reqs">
        <div className="ch-surface ch-surface--card">
          {n === 0 ? (
            <p className="ch-rsx-reqs__none">No join requests right now.</p>
          ) : (
            <div className="ch-group">
              <ListPresence>
                {jr.reqs.map((r) => (
                  <PresenceRow as="div" key={r.id} className="ch-group__row ch-rsx-rq" data-two-line="">
                    <Avatar name={r.name} id={r.id} size="md" year={yearKeyOf(r.gradYear, clock)} />
                    <span className="ch-rsx-row__b">
                      <b>{r.name}</b>
                      <span>{yearLineOf(r.gradYear, clock) ?? ' '}</span>
                    </span>
                    <Button size="sm" busy={jr.busy === r.id} disabled={jr.busy != null && jr.busy !== r.id} onClick={() => void jr.decide(r, false)}>
                      Decline
                    </Button>
                    <Button size="sm" variant="primary" busy={jr.busy === r.id} disabled={jr.busy != null && jr.busy !== r.id} feel={null} onClick={() => void jr.decide(r, true)}>
                      Approve
                    </Button>
                  </PresenceRow>
                ))}
              </ListPresence>
            </div>
          )}
        </div>
        {data.joinCode && (
          <div className="ch-surface ch-surface--card">
            <div className="ch-group__row ch-rsx-code" data-two-line="">
              <span className="ch-rsx-row__b">
                <b>Team code</b>
                <span>Players join with this code</span>
              </span>
              <b className="ch-rsx-code__v ch-num">{data.joinCode}</b>
              <Button size="sm" leftIcon={Copy} onClick={() => void copy(data.joinCode!, 'Team code')}>
                Copy
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** The profile's more button (05 S-ROSTER.profile-actions): today's rows in a restyled sheet. */
function PlayerActionsCrh({ p, onClose, onRemove, onStatus }: { p: ChRosterPlayer | undefined; onClose: () => void; onRemove: (p: ChRosterPlayer) => void; onStatus: (p: ChRosterPlayer) => void }) {
  const statsHref = p ? rebuiltHref(`/golf/dashboard/stats?player=${p.id}`) : null;
  const press = usePressPrefetch();
  return (
    <Modal open={!!p} onClose={onClose} title={p?.name ?? 'Player'}>
      {p && (
        <div className="ch-surface ch-surface--card ch-rsx-acts">
          {statsHref && (
            <Link href={statsHref} className="ch-rsx-act" {...press(statsHref)}>
              <Icon icon={ChartColumn} size={16} />
              <b>View stats</b>
            </Link>
          )}
          <button type="button" className="ch-rsx-act" onClick={() => onStatus(p)}>
            <Icon icon={p.status === 'active' ? UserX : UserCheck} size={16} />
            <b>{p.status === 'active' ? 'Mark inactive' : 'Mark active'}</b>
          </button>
          <button type="button" className="ch-rsx-act is-danger" onClick={() => onRemove(p)}>
            <Icon icon={UserMinus} size={16} />
            <b>Remove from team</b>
          </button>
        </div>
      )}
    </Modal>
  );
}
