'use client';

import { useRefresh } from '../../../lib/use-refresh';
import { Ellipsis } from 'lucide-react';
import { askAboutReadHref } from '../chat/ask-links';
import { Icon } from '../../../ui/Icon';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../../ui/Toast';
import { readHref, type ChViewLoad, type ChViewVoice, coachBoardFor, PLAYER_HELM_HREF } from '../../../data/coachhelm-views-shape';
import type { ChReadView } from '../../../data/coachhelm-read-view-shape';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { PhoneIconAction } from '../../../ui/PhoneBar';
import { usePageCrumbs } from '../../../shell/crumbs';
import { rebuiltHref } from '../../../shell/nav';
import { Button } from '../../../ui/Button';
import { Modal } from '../../../ui/Modal';
import { Skeleton } from '../../../ui/States';
import { useFocusActions } from '../parts';
import { LIVE_COACHHELM_WRITES, type ChCoachHelmWrites } from '../writes';
import { DoCard, MovedCard, ReadHeadline, RoundsCard, SureCard, WhereCard, WhyCard } from './cards';
import { ReadsRail } from './ReadsRail';

/** Card-shaped placeholders in the final order and height. */
export function ReadSkeleton() {
  const phone = useChPhone();
  const blocks = [360, 250, 270, 240];
  const col = blocks.map((h, i) => <Skeleton key={i} height={h} radius={16} />);
  return (
    <main className={'ch-hr ' + (phone ? 'is-phone' : 'is-desk')} aria-busy="true">
      {phone ? (
        <div className="sheet" aria-hidden="true">
          {col}
        </div>
      ) : (
        <div className="ch-hr-desk" aria-hidden="true">
          <Skeleton height={420} radius={16} />
          <div className="ch-hr-col">{col.slice(0, 2)}</div>
          <div className="ch-hr-col">{col.slice(2)}</div>
        </div>
      )}
    </main>
  );
}

function Failed({ title, body, code, action }: { title: string; body: string; code: string; action: React.ReactNode }) {
  return (
    <section className="card">
      <div className="errc" data-ch-code={code}>
        <h4>{title}</h4>
        <p>{body}</p>
        {action}
      </div>
    </section>
  );
}

/** One read, in full (S-READ). The bar and the sidebar are today's. */
export function ReadPage({ load, voice, writes = LIVE_COACHHELM_WRITES, fallbackFirst, askOn = false }: { /** coachhelm_ask_v2: the Ask link appears only with it (CP-READ-20). */ askOn?: boolean; load: ChViewLoad<ChReadView>; voice: ChViewVoice; writes?: ChCoachHelmWrites; fallbackFirst?: string }) {
  const phone = useChPhone();
  const router = useRouter();
  const { refresh } = useRefresh();
  const coach = voice.role === 'coach';
  const backHref = coach ? coachBoardFor(voice.playerId) : PLAYER_HELM_HREF.board;
  const first = coach ? voice.first : (fallbackFirst ?? 'CoachHelm');
  const fa = useFocusActions(writes);
  const [more, setMore] = useState(false);
  const data = load.status === 'ready' ? load.data : null;
  usePageCrumbs(data ? (coach ? ['CoachHelm', voice.name, data.area] : ['CoachHelm', data.area]) : ['CoachHelm']);
  const read = data?.read ?? null;
  const pictures = data?.calls.pictures ?? true;
  const toast = useToast();
  const moreWrap = useRef<HTMLDivElement | null>(null);
  // The desk's popover closes on Esc or a click outside (M-READ-14); the phone's sheet is ui/Modal's own.
  useEffect(() => {
    if (!more || phone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMore(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!moreWrap.current?.contains(e.target as Node)) setMore(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [more, phone]);
  const copyLink = () => {
    setMore(false);
    if (!read) return;
    const url = `${window.location.origin}${readHref(coach ? voice.playerId : null, read.insight.id, true)}`;
    void navigator.clipboard?.writeText(url).then(
      () => toast({ title: 'Link copied' }),
      () => toast({ title: 'Couldn’t copy the link' }),
    );
  };
  const dismissTarget = read && coach ? { playerId: voice.playerId, first, ins: read.insight } : null;
  const askRow = read ? askAboutReadHref({ insightId: read.insight.id, title: read.insight.title, first: coach ? first : undefined }, askOn) : null;
  const moreItems = (
    <>
      {dismissTarget && (
        <button
          type="button"

          className="is-flag"
          onClick={() => {
            setMore(false);
            void fa.dismiss.run(dismissTarget);
          }}
        >
          Dismiss this read
        </button>
      )}
      {phone && coach && (
        <Link href={rebuiltHref(`/golf/dashboard/messages?player=${encodeURIComponent(voice.playerId)}`, 'coach') ?? '#'}>
          Message {first}
        </Link>
      )}
      {phone && askRow && (
        <Link href={askRow}>
          Ask CoachHelm about this
        </Link>
      )}
      <button type="button" onClick={copyLink}>
        Copy a link to this read
      </button>
    </>
  );
  const back = (
    <Button variant="ghost" onClick={() => router.push(backHref)}>
      Back to {coach ? first : 'CoachHelm'}
    </Button>
  );
  const bar = phone && (
    <PhoneTop
      back={{ label: coach ? first : 'CoachHelm', onBack: () => router.push(backHref) }}
      title={data?.area ?? 'CoachHelm'}
      action={read ? <PhoneIconAction icon={Ellipsis} label="More" onClick={() => setMore(true)} /> : undefined}
    />
  );
  let body: React.ReactNode;
  if (load.status === 'off') {
    body = <Failed code="CH-13313" title="CoachHelm is off" body={load.reason ?? 'CoachHelm is off for this player.'} action={back} />;
  } else if (load.status !== 'ready' || !data) {
    body = (
      <Failed
        code="CH-13866"
        title="This read didn’t load"
        body="Nothing was lost. Check the connection and try again."
        action={
          <Button variant="primary" onClick={() => refresh()}>
            Try again
          </Button>
        }
      />
    );
  } else if (!read) {
    body = <Failed code="CH-13861" title="This read is no longer open" body={`It was cleared or dismissed after this link was made. ${coach ? `${first}’s` : 'Your'} open reads are on the board.`} action={back} />;
  } else {
    const messageHref = coach ? rebuiltHref(`/golf/dashboard/messages?player=${encodeURIComponent(voice.playerId)}`, 'coach') : null;
    const assigned = !!(fa.assigned[read.insight.id] ?? read.insight.assigned);
    const failedCount = Number(data.failed.rounds) + Number(data.failed.themes) + Number(data.failed.plans);
    const notice = failedCount >= 2 && (
      <div className="ntc" role="note" data-ch-code="CH-13208">
        <div className="c">
          <span>
            <b>Part of this read didn’t load.</b> Everything else is here.
          </span>
          <Button variant="ghost" size="sm" onClick={() => refresh()}>
            Try again
          </Button>
        </div>
      </div>
    );
    const dismissedHere = coach && !!fa.dismissed[read.insight.id];
    // At the top of the page, where the ⋯ that did it sits (S-READ.dismissed), not at the foot of What to do.
    const dismissedNotice = dismissedHere && (
      <div className="ntc" role="status" data-ch-code="CH-13901">
        <div className="c">
          <span>
            <b>Insight dismissed.</b> It no longer shows on your board or on {first}’s. Undo brings it back.
          </span>
          <Button variant="ghost" size="sm" busy={fa.here('undo', read.insight.id)} onClick={() => void fa.undo.run({ playerId: voice.playerId, first, ins: read.insight })}>
            Undo
          </Button>
        </div>
      </div>
    );
    const head = <ReadHeadline d={read} view={data} coach={coach} assigned={assigned} dismissed={dismissedHere} />;
    const where = read.funnel && <WhereCard funnel={read.funnel} pictures={pictures} />;
    const why = <WhyCard d={read} voice={voice} pictures={pictures} />;
    const sure = <SureCard d={read} voice={voice} pictures={pictures} />;
    const moved = <MovedCard d={read} failed={data.failed.themes} pictures={pictures} />;
    const rounds = <RoundsCard d={read} failed={data.failed.rounds} />;
    const askHref = askAboutReadHref({ insightId: read.insight.id, title: read.insight.title, first: coach ? first : undefined }, askOn);
    const todo = <DoCard d={read} voice={voice} fa={fa} missing={data.missing} messageHref={messageHref} askHref={askHref} practiceHref={null} onMore={phone ? () => setMore(true) : undefined} />;
    body = phone ? (
      <>
        {dismissedNotice}
        {notice}
        {head}
        {where}
        {why}
        {sure}
        {moved}
        {rounds}
        {todo}
      </>
    ) : (
      <>
        {/* S-READ-DESK: the read's actions, where the phone has its bar. Its own row, so the middle and right columns start level. */}
        <div className="ch-hr-deskbar">
          {askHref && (
            <Button variant="secondary" href={askHref}>
              Ask about this read
            </Button>
          )}
          {messageHref && (
            <Button variant="secondary" href={messageHref}>
              Message {first}
            </Button>
          )}
          <div className="ch-hr-morewrap" ref={moreWrap}>
            <button type="button" className="ib" aria-label="More" aria-expanded={more} onClick={() => setMore((v) => !v)}>
              <Icon icon={Ellipsis} size={18} />
            </button>
            {more && (
              <div className="ch-hr-morepop">
                {moreItems}
                <button type="button" onClick={() => setMore(false)}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
        {/* A rail row swaps the read: the columns fade in fresh, nothing slides (M-READ-23). */}
        <div className="ch-hr-col ch-hr-swap" key={`mid-${read.insight.id}`}>
          {dismissedNotice}
          {notice}
          {head}
          {where}
          {why}
          {todo}
        </div>
        <div className="ch-hr-col is-evidence ch-hr-swap" key={`ev-${read.insight.id}`}>
          {sure}
          {moved}
          {rounds}
        </div>
      </>
    );
  }
  return (
    <main className={'ch-hr ' + (phone ? 'is-phone' : 'is-desk')} data-ch-screen="coachhelm-read" data-ch-hr-page="">
      {bar}
      {phone ? (
        <div className="sheet">{body}</div>
      ) : (
        <div className="ch-hr-desk">
          {data ? <ReadsRail view={data} current={read?.insight.id ?? ''} voice={voice} hrefOf={(id) => readHref(coach ? voice.playerId : null, id, true)} /> : <span />}
          {body}
        </div>
      )}
      {phone && (
        <Modal open={more} onClose={() => setMore(false)} title={read?.insight.title ?? 'More for this read'}>
          <div className="ch-hr-morelist">
            {moreItems}
          </div>
        </Modal>
      )}
    </main>
  );
}
