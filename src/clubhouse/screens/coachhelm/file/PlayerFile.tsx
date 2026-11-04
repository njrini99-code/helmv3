'use client';
import { formatWith } from '../../../lib/dates';

import { useRefresh } from '../../../lib/use-refresh';
import { TriangleAlert, Eye, MessageSquare, Ellipsis, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ChDeepInsight } from '../../../data/coachhelm-dive-shape';
import type { ChFileCards, ChFileIntent, ChFilePlan, ChFileRosterRow, ChPlayerFile } from '../../../data/coachhelm-file-shape';
import { FILE_BYPASS, PLAYER_HELM_HREF, coachPlayerHref, playerFileHref, type ChViewLoad, type PlayerFileCard } from '../../../data/coachhelm-views-shape';
import { CH_FADE_MS, chSpringCurve } from '../../../lib/motion';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { useChPhone } from '../../../lib/use-phone';
import { usePageCrumbs } from '../../../shell/crumbs';
import { rebuiltHref } from '../../../shell/nav';
import { PhoneTop } from '../../../shell/phone-chrome';
import { Icon } from '../../../ui/Icon';
import { Menu } from '../../../ui/Menu';
import { Modal } from '../../../ui/Modal';
import { PhoneIconAction } from '../../../ui/PhoneBar';
import { Segmented } from '../../../ui/Segmented';
import { Swap } from '../../../ui/Swap';
import { GonePanel, ReadPanel } from '../team/panels';
import { useFocusActions } from '../parts';
import { LIVE_COACHHELM_WRITES, type ChCoachHelmWrites } from '../writes';
import { Avatar, CoachActions, EarlyFeature, FeatureCard, FieldCard, IntentCard, PlanCard, ReadsCard, SgCard, TrackCard, WorkingCard, type FileLens } from './cards';
import { IntentSheet, LIVE_SAVE_INTENT } from './IntentSheet';

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const WIDE = '(min-width: 1180px)';
const useWide = () =>
  useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(WIDE);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );

/** A lens-only card: folds on height (smooth spring, 462) with opacity 180 out / 260 in, from where it is. Gone from the DOM once folded (M-LNS-04). Reduce: no fold; the whole file fades. */
function Fold({ show, children }: { show: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(show);
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useChReducedMotion();
  const first = useRef(true);
  useEffect(() => {
    if (show) setMounted(true);
  }, [show]);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = ref.current;
    if (!el) return;
    if (reduced || typeof el.animate !== 'function') {
      if (!show) setMounted(false);
      return;
    }
    const h = el.getBoundingClientRect().height;
    const spring = chSpringCurve('smooth');
    const opts = { duration: spring.ms, easing: spring.linear ?? EASE, fill: 'both' as const };
    const fade = { duration: show ? 260 : 180, easing: EASE, fill: 'both' as const };
    el.getAnimations().forEach((a) => a.cancel());
    const box = el.animate(show ? [{ height: '0px', marginTop: '-24px' }, { height: `${h}px`, marginTop: '0px' }] : [{ height: `${h}px`, marginTop: '0px' }, { height: '0px', marginTop: '-24px' }], opts);
    el.animate(show ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], fade);
    box.onfinish = () => {
      el.getAnimations().forEach((a) => a.cancel());
      if (!show) setMounted(false);
    };
    return () => {
      box.onfinish = null;
    };
    // Only the flip moves it: a re-render with the same `show` does nothing.
  }, [show, mounted, reduced]);
  if (!mounted) return null;
  return (
    <div ref={ref} className="wrap-collapse">
      {children}
    </div>
  );
}

const CARD_OF: Record<PlayerFileCard, string> = { feat: '.feat', plan: 'plan', field: 'field', reads: 'reads', sg: 'sg', intent: 'intent', track: 'track' };

export interface FileHostProps {
  load: ChViewLoad<ChPlayerFile>;
  at?: PlayerFileCard;
  insight?: string;
  roster: ChFileRosterRow[] | null;
  writes?: ChCoachHelmWrites;
  saveIntent?: typeof LIVE_SAVE_INTENT;
  /** Preview only: open on the lens. */
  initialLens?: FileLens;
}

/** The failed file: one card, no lens control, Try again (06 §13). */
export function FileFailed({ who, onRetry }: { who: string; onRetry: () => void }) {
  return (
    <section className="card" role="alert">
      <div className="empty">
        <span className="empty__ic warn">
          <Icon icon={TriangleAlert} size={22} />
        </span>
        <b>Couldn’t load {who}</b>
        <p>Nothing was lost. Try again.</p>
        <button type="button" className="btn sec" data-ch-hf-retry="" onClick={onRetry}>
          Try again
        </button>
      </div>
    </section>
  );
}

/** A coach's file on one player (S-FILE, coachhelm_player_file_v1). */
export function PlayerFile({ load, at, insight, roster, writes = LIVE_COACHHELM_WRITES, saveIntent = LIVE_SAVE_INTENT, initialLens = 'coach' }: FileHostProps) {
  const router = useRouter();
  const { refresh } = useRefresh();
  const phone = useChPhone();
  if (load.status !== 'ready') {
    return (
      <main className={'ch-hf' + (phone ? ' is-phone' : '')}>
        {phone && <PhoneTop back={{ label: 'CoachHelm', onBack: () => router.push(PLAYER_HELM_HREF.board) }} title="CoachHelm" />}
        <div className="ch-hf-flow">
          <FileFailed who="this player’s file" onRetry={() => refresh()} />
        </div>
      </main>
    );
  }
  // Per player: the lens and the sheets reset with the id (S-FILE.lens 8).
  return <Ready key={load.data.head.playerId} data={load.data} at={at} insight={insight} roster={roster} writes={writes} saveIntent={saveIntent} initialLens={initialLens} />;
}

function Ready({ data, at, insight, roster, writes, saveIntent, initialLens }: { data: ChPlayerFile; at?: PlayerFileCard; insight?: string; roster: ChFileRosterRow[] | null; writes: ChCoachHelmWrites; saveIntent: typeof LIVE_SAVE_INTENT; initialLens: FileLens }) {
  const { head } = data;
  const first = head.first;
  const router = useRouter();
  const phone = useChPhone();
  const wide = useWide();
  const reduced = useChReducedMotion();
  const fa = useFocusActions(writes);
  const [lens, setLens] = useState<FileLens>(initialLens);
  const [openRead, setOpenRead] = useState<string | null>(insight ?? null);
  const [intentOpen, setIntentOpen] = useState(false);
  const [intent, setIntentValue] = useState<ChFileIntent | null>(data.cards.intent ?? null);
  const flow = useRef<HTMLDivElement>(null);
  usePageCrumbs(['CoachHelm', head.name]);

  const shown: ChFileCards = lens === 'player' && data.lens ? data.lens : data.cards;
  const allReads = useMemo(() => {
    const m = new Map<string, ChDeepInsight>();
    for (const c of [data.cards, data.lens]) for (const d of c ? [...(c.feat ? [c.feat] : []), ...c.reads, ...c.working] : []) if (!m.has(d.base.id)) m.set(d.base.id, d);
    return m;
  }, [data]);
  const lensMap = useMemo(() => new Map([...(data.lens?.feat ? [data.lens.feat] : []), ...(data.lens?.reads ?? []), ...(data.lens?.working ?? [])].map((d) => [d.base.id, d])), [data.lens]);
  const deepOpen = openRead ? (lens === 'player' ? (lensMap.get(openRead) ?? null) : (allReads.get(openRead) ?? null)) : null;

  // A deep link scrolls straight there, before first paint, never smooth (M-LNS-28).
  useLayoutEffect(() => {
    if (!at) return;
    const el = flow.current?.querySelector(at === 'feat' ? CARD_OF.feat : `[data-ch-anchor="${CARD_OF[at]}"]`);
    el?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
    // Once, for the address it opened on.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flipLens = useCallback(
    (v: FileLens) => {
      setLens(v);
      if (reduced && flow.current?.animate) flow.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CH_FADE_MS, easing: 'linear' });
    },
    [reduced],
  );

  // On success the sheet closes first, then the card swaps (M-LNS-15, M-LNS-18). A failed write keeps it open (S-FILE.read error).
  const openId = openRead;
  const didWrite = !!openId && (!!fa.assigned[openId] || !!fa.dismissed[openId]);
  useEffect(() => {
    if (didWrite) setOpenRead(null);
  }, [didWrite]);

  // Assign just now: the plan moves to Suggested without a reload; its row chip reads Assigned.
  const planNow: ChFilePlan | null = useMemo(() => {
    const assignedHere = shown.feat && fa.assigned[shown.feat.base.id];
    if (!assignedHere || shown.plan?.stage === 'accepted') return shown.plan;
    if (shown.plan && shown.plan.stage !== 'none' && shown.plan.stage !== 'declined') return shown.plan;
    const today = formatWith(new Date(), { month: 'short', day: 'numeric' });
    return { stage: 'suggested', focusId: null, title: shown.feat?.base.title ?? null, fromInsight: shown.feat?.base.id ?? null, since: null, handshake: { suggested: today, shown: null, accepted: null, declined: null }, goal: null, practice: null, coach: shown.plan?.coach ?? 'Your coach' };
  }, [shown, fa.assigned]);

  const messageHref = rebuiltHref(`/golf/dashboard/messages?player=${encodeURIComponent(head.playerId)}`, 'coach') ?? `/golf/dashboard/messages?player=${encodeURIComponent(head.playerId)}`;
  const moreItems = [
    { label: `Open ${first}’s profile`, icon: Users, href: `/golf/dashboard/roster?player=${encodeURIComponent(head.playerId)}` },
    { label: `Message ${first}`, icon: MessageSquare, href: messageHref },
  ];
  const more = (t: (props: never) => ReactNode) => <Menu label={`More for ${first}`} items={moreItems} trigger={t as never} />;

  const featActions =
    lens === 'player' ? (
      planNow?.stage === 'suggested' || planNow?.stage === 'shown' ? (
        <>
          <button type="button" className="btn light" aria-disabled="true" data-ch-hf-accept="" onClick={(e) => e.preventDefault()}>
            Accept
          </button>
          <button type="button" className="btn ghost" aria-disabled="true" data-ch-hf-decline="" onClick={(e) => e.preventDefault()}>
            Decline
          </button>
        </>
      ) : planNow?.stage === 'accepted' ? (
        <span className="btn is-done" role="status">
          Your focus since {planNow.since}
        </span>
      ) : null
    ) : shown.feat ? (
      <CoachActions
        stage={planNow?.stage ?? 'none'}
        first={first}
        assigning={fa.here('assign', shown.feat.base.id)}
        disabled={fa.busy}
        messageHref={messageHref}
        canAssign={!shown.feat.base.stale && shown.feat.base.kind !== 'note'}
        onAssign={() => void fa.assign.run({ playerId: head.playerId, first, ins: shown.feat!.base })}
      />
    ) : null;

  const none = !shown.feat && shown.reads.length === 0;
  const isEmpty = none && data.rounds === 0;
  const isEarly = none && !isEmpty;

  const card: Record<string, ReactNode> = {
    feat: isEmpty ? (
      <section className="card">
        <div className="empty">
          <b>No rounds yet</b>
          <p>Reads start after 4 full rounds in the last 90 days.</p>
          {lens === 'coach' && (
            <a className="btn sec" href={messageHref}>
              Message {first}
            </a>
          )}
        </div>
      </section>
    ) : shown.feat ? (
      <Swap swapKey={lens}>
        <FeatureCard d={shown.feat} lens={lens} first={first} name={head.name} team={shown.featTeam} stage={planNow?.stage ?? 'none'} coach={planNow?.coach ?? 'Your coach'} actions={featActions} onOpen={() => setOpenRead(shown.feat!.base.id)} />
      </Swap>
    ) : (
      <Swap swapKey={lens}>
        <EarlyFeature lens={lens} first={first} rounds={data.rounds} toGo={data.roundsToGo} />
      </Swap>
    ),
    plan: isEmpty ? null : data.failed.plan ? <PartFailed title={`${first}’s plan`} /> : <Swap swapKey={lens}><PlanCard plan={planNow} lens={lens} first={first} /></Swap>,
    field: data.failed.field ? <PartFailed title="Last round in context" /> : shown.field ? <FieldCard field={shown.field} /> : null,
    reads: isEmpty ? null : <Swap swapKey={lens}><ReadsCard cards={shown} lens={lens} fa={lens === 'coach' ? fa : undefined} onOpen={setOpenRead} /></Swap>,
    sg: isEmpty ? null : data.failed.sg ? <PartFailed title="Where the strokes go" /> : shown.sg ? <Swap swapKey={lens}><SgCard sg={shown.sg} who={lens === 'coach' ? first : 'You'} standingHref={lens === 'coach' ? `${coachPlayerHref('standing', head.playerId)}&from=${FILE_BYPASS}` : null} /></Swap> : null,
    working: (
      <Fold show={lens === 'player' && (data.lens?.working.length ?? 0) > 0}>
        <WorkingCard list={data.lens?.working ?? []} onOpen={setOpenRead} />
      </Fold>
    ),
    intent: <Fold show={lens === 'coach'}>{data.failed.intent ? <PartFailed title={`Your plan for ${first}`} /> : <IntentCard intent={intent} first={first} onEdit={() => setIntentOpen(true)} />}</Fold>,
    track: <Fold show={lens === 'coach'}>{data.failed.track ? <PartFailed title={`Track record with ${first}`} /> : data.cards.track ? <TrackCard track={data.cards.track} first={first} /> : null}</Fold>,
  };
  void isEarly;

  const pill = (
    <Fold show={lens === 'player'}>
      <div className="pv-wrap">
        <span className="pv">
          <Icon icon={Eye} size={16} />
          Previewing {first}’s screen
        </span>
      </div>
    </Fold>
  );

  const lensBar = data.lens ? <Segmented label={`Whose view of ${first}’s file`} value={lens} onChange={flipLens} block={phone} options={[{ value: 'coach', label: 'Coach view', data: { 'data-ch-lens': 'coach' } }, { value: 'player', label: `As ${first} sees it`, data: { 'data-ch-lens': 'player' } }]} /> : null;

  const columns = wide ? (
    <div className="grid2">
      <div className="col">
        {card.feat}
        {card.plan}
        {card.sg}
      </div>
      <div className="col">
        {card.working}
        {card.field}
        {card.reads}
        {card.intent}
        {card.track}
      </div>
    </div>
  ) : lens === 'player' ? (
    <>
      {card.feat}
      {card.working}
      {card.plan}
      {card.field}
      {card.sg}
      {card.reads}
    </>
  ) : (
    <>
      {card.feat}
      {card.plan}
      {card.field}
      {card.reads}
      {card.sg}
      {card.working}
      {card.intent}
      {card.track}
    </>
  );

  const sheetPlayer = { id: head.playerId, name: head.name, first, rounds: data.rounds ?? 0, early: false };
  const penalties = deepOpen && /penalt/i.test(`${deepOpen.base.metric} ${deepOpen.base.title}`) ? data.penalties : null;

  return (
    <main className={'ch-hf' + (phone ? ' is-phone' : ' is-desk')} aria-label={`${head.name}’s file`} data-ch="player-file">
      {phone && (
        <PhoneTop
          back={{ label: 'CoachHelm', onBack: () => router.push(PLAYER_HELM_HREF.board) }}
          title={head.name}
          action={more(((p: { ref: (el: HTMLButtonElement | null) => void; onClick: () => void }) => <PhoneIconAction icon={Ellipsis} label={`More for ${first}`} onClick={p.onClick} />) as never)}
        />
      )}
      <div className="dmain">
        {roster && (
          <aside className="ch-hf-rail" aria-label="By player">
            <section className="card">
              <div className="card__h">
                <h4>By player</h4>
                <small className="ch-num">{roster.length}</small>
              </div>
              <div className="rows">
                {roster.map((r) => (
                  <Link key={r.id} replace prefetch={false} href={playerFileHref(r.id, undefined, true)} className={'r' + (r.id === head.playerId ? ' is-sel' : '')} aria-current={r.id === head.playerId ? 'page' : undefined} data-ch-hf-open="">
                    <Avatar name={r.name} size="md" />
                    <span className="r__t">
                      <b>{r.name}</b>
                      {r.line && <small>{r.line}</small>}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          </aside>
        )}
        <div className="dfile">
          {!phone && (
            <div className="dhead">
              <Avatar name={head.name} size="xl" />
              <div>
                <h1 className="lt">{head.name}</h1>
                <p>{head.line}</p>
              </div>
              <div className="aseg">{lensBar}</div>
              {more(((p: { ref: (el: HTMLButtonElement | null) => void; onClick: () => void }) => (
                <button type="button" ref={p.ref} className="ib" data-ch-hf-more="" aria-label={`More for ${first}`} onClick={p.onClick}>
                  <Icon icon={Ellipsis} size={19} />
                </button>
              )) as never)}
            </div>
          )}
          {phone && lensBar && <div className="sticky-seg">{lensBar}</div>}
          {pill}
          <div ref={flow} className="ch-hf-flow">
            {columns}
          </div>
        </div>
      </div>

      <Modal open={!!openRead} onClose={() => setOpenRead(null)} title={deepOpen?.base.title ?? 'This read'} className="ch-htb-sheet ch-htb ch-hf ch-hf-sheet" width={480} initialFocus=".xb">
        <div className="ins">
          {openRead &&
            (deepOpen ? (
              <ReadPanel read={deepOpen.base} deep={deepOpen} penalties={penalties} player={sheetPlayer} fa={lens === 'coach' ? fa : undefined} role={lens} missing={undefined} readOn={data.readOn} roster={[{ id: head.playerId }]} dismissible fileHost onClose={() => setOpenRead(null)} />
            ) : (
              <GonePanel onClose={() => setOpenRead(null)} />
            ))}
        </div>
      </Modal>
      <IntentSheet key={intentOpen ? 'open' : 'closed'} open={intentOpen} playerId={head.playerId} first={first} value={intent} save={saveIntent} onSaved={(v) => { setIntentValue(v); setIntentOpen(false); }} onClose={() => setIntentOpen(false)} />
    </main>
  );
}

function PartFailed({ title }: { title: string }) {
  return (
    <section className="card">
      <div className="card__h">
        <h4>{title}</h4>
      </div>
      <p className="card__n" data-ch-code="CH-13761">
        Couldn’t load this part. Nothing is lost; try again in a moment.
      </p>
    </section>
  );
}
