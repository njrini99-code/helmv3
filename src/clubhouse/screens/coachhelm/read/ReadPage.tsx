'use client';

import { Archive, ArrowRight, ChevronLeft, ChevronRight, Ellipsis, Link as LinkIcon, MessageCircleQuestion, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ChReadView } from '../../../data/coachhelm-read-view-shape';
import { coachBoardFor, PLAYER_HELM_HREF, readHref, type ChViewLoad, type ChViewVoice } from '../../../data/coachhelm-views-shape';
import { haptic } from '../../../lib/haptics';
import { plural } from '../../../lib/plural';
import { useChPhone } from '../../../lib/use-phone';
import { usePageCrumbs } from '../../../shell/crumbs';
import { rebuiltHref } from '../../../shell/nav';
import { PhoneTop } from '../../../shell/phone-chrome';
import { Button, IconButton } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { Menu, type MenuItem } from '../../../ui/Menu';
import { Segmented } from '../../../ui/Segmented';
import { EmptyState, SkelLine, SkelRows, Skeleton } from '../../../ui/States';
import { Surface } from '../../../ui/Surface';
import { Swap } from '../../../ui/Swap';
import { useToast } from '../../../ui/Toast';
import { askAboutReadHref } from '../chat/ask-links';
import { messageCoachHref } from '../../home/player-links';
import { Head, useFocusActions } from '../parts';
import { HelmOff } from '../views/Frame';
import { LIVE_COACHHELM_WRITES, LIVE_PLAYER_WRITES, type ChCoachHelmWrites, type ChPlayerWrites } from '../writes';
import { CoachActions, LIVE_READ_WRITES, PlayerActions, READ_HOLD_MS, type ChReadWrites, type ReadHeld } from './actions';
import { Cause, Corrections, Measured, Moved, NextReads, Plan, ReadHead, readOrder, ReadsRail, Rounds, Sure, Week, Where } from './parts';

/**
 * One CoachHelm read, in full (7 Nov design, design-refresh/coachhelm-read/redesign): the root-cause read on a player as What, Why,
 * Next and When in the green head, the actions directly under it, then the evidence. The phone is one pushed screen with three tabs
 * (Measured, Cause, Rounds); desktop is the Deep dive with this read selected and every section open, a stepper and J and K to move
 * between the player's reads.
 *
 * A coach reads about the player by first name, against the team pool and the Tour, with the likely cause and the rung. A player reads
 * their own in the second person, against the Tour only, and only what was counted in their own shots: the shaper builds their copy
 * without the coach's fields (`data/coachhelm-read-view-shape.ts`), so nothing here hides one.
 */

type Tab = 'measured' | 'cause' | 'rounds';

/**
 * The pushed bar's title: the player's name for a coach, the read's category for a player. With no read to name (failed, gone) a
 * player's bar says "Read": the back label beside it already says CoachHelm.
 */
export const readBarTitle = (coachName: string | null, category: string | null): string => coachName ?? category ?? 'Read';

/** "Penalty strokes: 1.1 per round" as the bar and the breadcrumb say it: the claim up to its figure. */
const shortOf = (title: string): string => title.split(/[:(]/)[0]?.trim() || title;

/**
 * The page in waiting, in the loaded page's own shape (READ-S4): the green head with its four label rows, the two actions, the tabs
 * and the first section, so nothing jumps when the words land. A route skeleton by its mark (RouteFrame): the page crossfades in.
 */
export function ReadSkeleton() {
  const phone = useChPhone();
  const router = useRouter();
  const dos = (
    <article className="ch-hd-dos ch-hr-dos">
      <header className="ch-hd-dos__h">
        <SkelLine width="34%" line={18} bar={11} />
        <SkelLine width="82%" line={38} bar={26} />
        <SkelLine width="60%" line={38} bar={26} />
        <SkelRows rows={4} lead />
      </header>
      <div className="ch-hl-cact">
        <Skeleton width={148} height={40} radius={999} />
        <Skeleton width={96} height={40} radius={999} />
      </div>
    </article>
  );
  const first = (title: string, block: number) => (
    <div className="ch-hr-sec">
      <Surface>
        <div className="ch-hr-body">
          <SkelLine width={title} line={24} bar={16} />
          <Skeleton width="100%" height={block} radius={12} shape="solid" />
        </div>
      </Surface>
    </div>
  );
  if (phone) {
    return (
      <main className="ch-hl ch-hv ch-hr is-phone" aria-busy="true" aria-label="Loading this read" data-ch-arrive="crossfade">
        <PhoneTop back={{ label: 'CoachHelm', onBack: () => router.back() }} title="Read" />
        <div className="ch-hr-skel" aria-hidden="true">
          {dos}
          <div className="ch-hr-tabs">
            <Skeleton width="100%" height={36} radius={999} />
          </div>
          {first('40%', 96)}
        </div>
      </main>
    );
  }
  return (
    <main className="ch-hl ch-hv ch-hr is-desk" aria-busy="true" aria-label="Loading this read" data-ch-arrive="crossfade">
      <div className="ch-hr-skel" aria-hidden="true">
        <div className="ch-hr-skelhead">
          <SkelLine width={90} line={18} bar={11} />
          <SkelLine width={260} line={40} bar={28} />
          <SkelLine width={220} line={20} bar={12} />
        </div>
        <div className="ch-hd">
          <div className="ch-hd-rail">
            <SkelRows rows={5} trail />
          </div>
          <div className="ch-hd-main">
            <div className="ch-hr-stack">
              {dos}
              {first('30%', 120)}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export function ReadPage({
  load,
  voice,
  writes = LIVE_COACHHELM_WRITES,
  playerWrites = LIVE_PLAYER_WRITES,
  readWrites = LIVE_READ_WRITES,
  holdMs = READ_HOLD_MS,
  hrefOf,
}: {
  load: ChViewLoad<ChReadView>;
  voice: ChViewVoice;
  writes?: ChCoachHelmWrites;
  playerWrites?: ChPlayerWrites;
  /** Remove focus and Re-check now: the read page's own two writes. */
  readWrites?: ChReadWrites;
  /** How long Assign and Remove focus wait behind Undo. */
  holdMs?: number;
  /** Where another of this player's reads opens. The page's own address by default; the preview passes its own. */
  hrefOf?: (insightId: string) => string;
}) {
  const phone = useChPhone();
  const router = useRouter();
  const toast = useToast();
  const coach = voice.role === 'coach' ? voice : null;
  const backHref = coach ? coachBoardFor(coach.playerId) : PLAYER_HELM_HREF.board;
  const fa = useFocusActions(writes);
  const data = load.status === 'ready' ? load.data : null;
  const read = data?.read ?? null;
  const id = read?.insight.id ?? '';
  const short = read ? shortOf(read.insight.title) : null;
  usePageCrumbs(coach ? ['CoachHelm', coach.name, ...(short ? [short] : [])] : ['CoachHelm', ...(short ? [short] : [])]);
  const to = useCallback((insightId: string) => (hrefOf ? hrefOf(insightId) : readHref(coach ? coach.playerId : null, insightId)), [hrefOf, coach]);

  // A write waiting behind its Undo is this read's alone: another read never shows it.
  const [heldFor, setHeldFor] = useState<{ id: string; kind: ReadHeld }>({ id, kind: null });
  const held: ReadHeld = heldFor.id === id ? heldFor.kind : null;

  // The tab is the read's: another read opens on Measured.
  const [tab, setTab] = useState<{ id: string; tab: Tab }>({ id, tab: 'measured' });
  const shownTab: Tab = tab.id === id ? tab.tab : 'measured';

  // Where this read is among the player's reads, and the two steps (desktop: the stepper, J and K).
  const order = useMemo(() => (data ? readOrder(data) : []), [data]);
  const at = order.indexOf(id);
  const step = useCallback(
    (by: 1 | -1) => {
      const next = order[at + by];
      if (at < 0 || !next) return;
      haptic('select');
      router.replace(to(next));
    },
    [order, at, router, to],
  );
  useEffect(() => {
    if (phone || at < 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('input, textarea, select, [contenteditable], [role="menu"], dialog')) return;
      const by = e.key === 'j' || e.key === 'J' ? 1 : e.key === 'k' || e.key === 'K' ? -1 : 0;
      if (!by) return;
      e.preventDefault();
      step(by);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phone, at, step]);

  const messageHref = coach ? rebuiltHref(`/golf/dashboard/messages?player=${encodeURIComponent(coach.playerId)}`, 'coach') : rebuiltHref(messageCoachHref(data?.coach?.userId ?? null), 'player');
  const askHref = read ? askAboutReadHref({ insightId: read.insight.id, title: read.insight.title, first: coach?.first }) : null;
  const dismissTarget = read && coach ? { playerId: coach.playerId, first: coach.first, ins: read.insight } : null;
  const canDismiss = !!dismissTarget && !fa.dismissed[id];
  const moreItems: MenuItem[] = [
    {
      label: 'Copy link',
      icon: LinkIcon,
      onSelect: () => {
        void navigator.clipboard?.writeText(window.location.href).then(() => toast({ title: 'Link copied' }));
      },
    },
    ...(coach && messageHref ? [{ label: `Message ${coach.first}`, icon: MessageSquare, href: messageHref }] : []),
    ...(!coach && askHref ? [{ label: 'Ask about this', icon: MessageCircleQuestion, href: askHref }] : []),
    ...(canDismiss && dismissTarget ? [{ kind: 'separator' as const }, { label: 'Dismiss read', icon: Archive, danger: true, feel: 'warning' as const, onSelect: () => void fa.dismiss.run(dismissTarget) }] : []),
  ];
  const bar = phone && (
    <PhoneTop
      back={{ label: 'CoachHelm', onBack: () => router.push(backHref) }}
      title={readBarTitle(coach ? coach.name : null, read?.insight.category ?? null)}
      titleId="ch-hr-bar-t"
      action={
        read ? (
          <Menu
            label="More for this read"
            align="end"
            items={moreItems}
            trigger={(p) => (
              <button type="button" className="ch-pbar__icon" aria-label="More" {...p}>
                <Icon icon={Ellipsis} size={20} />
              </button>
            )}
          />
        ) : undefined
      }
    />
  );
  const frame = (body: ReactNode, state: string) => (
    <main className={'ch-hl ch-hv ch-hr ' + (phone ? 'is-phone' : 'is-desk')} data-ch-screen="coachhelm-read" data-ch-read-state={state} data-ch-read-viewer={voice.role} aria-labelledby={phone ? 'ch-hr-bar-t' : undefined} aria-label={phone ? undefined : 'CoachHelm read'}>
      {bar}
      {body}
    </main>
  );

  if (load.status === 'off') return frame(<HelmOff reason={load.reason} voice={voice} />, 'off');
  if (load.status !== 'ready' || !data) {
    // CH-13866: the page's one read failed. The centred danger page, with Try again first (it re-runs the server render).
    return frame(<EmptyState size="page" tone="danger" code="CH-13866" title="Couldn’t load this read" body="Nothing is lost. Check the connection and try again." />, 'failed');
  }
  if (!read) {
    return frame(
      <EmptyState
        size="page"
        code="CH-13861"
        icon={Archive}
        title="This read is no longer open"
        body="It was replaced by a fresher read, cleared or dismissed after this link was made."
        action={
          <Button variant="primary" rightIcon={ArrowRight} href={backHref}>
            {coach ? `Open ${coach.first}’s reads` : 'Open your reads'}
          </Button>
        }
      />,
      'gone',
    );
  }

  const pictures = data.calls.pictures;
  const mine = held === 'assign' ? 'proposed' : held === 'remove' ? null : (fa.assigned[id] ?? read.insight.assigned);
  // What this visit changed shows on the head's pill and the list at once; the stance the page loaded stays otherwise.
  const shown = coach && mine && !read.insight.assigned ? { ...read, stance: 'Assigned', stanceCls: 'done' } : read;
  const head = <ReadHead d={shown} voice={voice} />;
  const actions = coach ? (
    <CoachActions key={id} d={read} coach={coach} fa={fa} writes={readWrites} missing={data.missing} messageHref={messageHref} held={held} onHeld={(kind) => setHeldFor({ id, kind })} holdMs={holdMs} />
  ) : (
    <PlayerActions d={read} askHref={askHref} messageHref={messageHref} coachName={data.coach?.name ?? null} coachUserId={data.coach?.userId ?? null} writes={playerWrites} />
  );
  const dossier = (
    <article className="ch-hd-dos ch-hr-dos" aria-labelledby="ch-hr-title">
      {head}
      {actions}
    </article>
  );
  const measured = <Measured d={read} voice={voice} pictures={pictures} />;
  const moved = <Moved d={read} />;
  const cause = <Cause d={read} voice={voice} pictures={pictures} />;
  const where = <Where d={read} failed={data.failed.rounds} />;
  const rounds = <Rounds d={read} failed={data.failed.rounds} voice={voice} />;
  const tail = (
    <>
      <Sure d={read} voice={voice} pictures={pictures} />
      <Week d={read} />
      <Plan d={read} voice={voice} failed={data.failed.plans} proposed={!!coach && mine === 'proposed' && !read.insight.assigned} removed={held === 'remove'} />
      <Corrections d={read} />
    </>
  );
  const state = fa.dismissed[id] ? 'dismissed' : fa.here('assign', id) ? 'assigning' : held === 'remove' ? 'removed' : read.insight.stale ? 'stale' : mine ? (coach ? 'assigned' : mine === 'proposed' ? 'proposed' : 'focus') : 'open';

  if (phone) {
    const hasCause = !!read.cause || !!(read.legacy && (read.legacy.drivers.length > 0 || read.legacy.reason));
    const tabs: Array<{ value: Tab; label: string }> = [{ value: 'measured', label: 'Measured' }, ...(hasCause ? [{ value: 'cause' as const, label: coach ? 'Cause' : 'What it shows' }] : []), { value: 'rounds', label: 'Rounds' }];
    const open: Tab = tabs.some((t) => t.value === shownTab) ? shownTab : 'measured';
    return frame(
      <>
        {dossier}
        <div className="ch-hr-tabs">
          <Segmented block label="Parts of this read" value={open} options={tabs} onChange={(v) => setTab({ id, tab: v })} hook="read-tab" />
        </div>
        <Swap swapKey={`${id}:${open}`}>
          <div className="ch-hr-panel" data-ch-read-panel={open}>
            {open === 'measured' && (
              <>
                {measured}
                {moved}
              </>
            )}
            {open === 'cause' && (
              <>
                {cause}
                {where}
              </>
            )}
            {open === 'rounds' && rounds}
          </div>
        </Swap>
        <div className="ch-hr-tail">{tail}</div>
        <NextReads view={data} current={id} voice={voice} hrefOf={to} />
      </>,
      state,
    );
  }

  const board = (
    <Link className="ch-hv-role-link" href={backHref}>
      CoachHelm
    </Link>
  );
  const stepper = at >= 0 && (
    <div className="ch-hr-step">
      <span className="ch-num">
        {at + 1} of {order.length}
      </span>
      <IconButton icon={ChevronLeft} label="Previous read" shortcut={['K']} variant="secondary" size="sm" disabled={at === 0} onClick={() => step(-1)} />
      <IconButton icon={ChevronRight} label="Next read" shortcut={['J']} variant="secondary" size="sm" disabled={at === order.length - 1} onClick={() => step(1)} />
    </div>
  );
  return frame(
    <>
      <Head who={board} title={coach ? coach.name : 'Your reads'} aside={stepper || undefined}>
        <span className="ch-num">{coach ? coach.line : `${plural(data.counts.insights, 'read')} on your game`}</span>
      </Head>
      <div className="ch-hd">
        <ReadsRail view={data} current={id} voice={voice} hrefOf={to} said={(rid) => (fa.dismissed[rid] ? 'Dismissed' : fa.assigned[rid] || (rid === id && held === 'assign') ? 'Assigned' : null)} />
        <div className="ch-hd-main">
          {/* Read to read: the rail and the header stay still; the main column swaps (the old one fades, the new one rises 6px). */}
          <Swap swapKey={id}>
            <div className="ch-hr-stack">
              {dossier}
              {measured}
              {moved}
              {cause}
              {where}
              {rounds}
              {tail}
            </div>
          </Swap>
        </div>
      </div>
    </>,
    state,
  );
}
