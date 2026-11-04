'use client';

import { Button } from '../../../ui/Button';

import { useRefresh } from '../../../lib/use-refresh';
import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ChDeepInsight } from '../../../data/coachhelm-dive-shape';
import type { ChPlayerWeek } from '../../../data/coachhelm-file-shape';
import { moreReadsLine } from '../../../data/coachhelm-shape';
import { PLAYER_HELM_HREF, PLAYER_HELM_VIEWS, type ChViewLoad, type PlayerHelmView } from '../../../data/coachhelm-views-shape';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { Icon } from '../../../ui/Icon';
import { Modal } from '../../../ui/Modal';
import { GonePanel, ReadPanel } from '../team/panels';
import { ProposalRow } from '../Proposals';
import { useViewSwitch } from '../use-view-switch';
import { PlayerHelmTabs } from '../views/PlayerHelmTabs';
import { LIVE_PLAYER_WRITES, type ChPlayerWrites } from '../writes';
import { EarlyFeature, FeatureCard, FieldCard, PlanCard, ReadsCard, SgCard, WorkingCard } from './cards';
import { FileFailed } from './PlayerFile';

/** The player's own CoachHelm with the flag on (S-BOARD): the lens's cards, for real. Accept and Decline are today's `ProposalRow`, live. */
export function YourWeek({ load, writes = LIVE_PLAYER_WRITES }: { load: ChViewLoad<ChPlayerWeek>; writes?: ChPlayerWrites }) {
  const phone = useChPhone();
  const { refresh } = useRefresh();
  const sw = useViewSwitch<PlayerHelmView>('board', (v) => PLAYER_HELM_HREF[v], PLAYER_HELM_VIEWS);
  const [openRead, setOpenRead] = useState<string | null>(null);
  const data = load.status === 'ready' ? load.data : null;
  const all = useMemo(() => {
    const m = new Map<string, ChDeepInsight>();
    if (data) for (const d of [...(data.cards.feat ? [data.cards.feat] : []), ...data.cards.reads, ...data.cards.working]) m.set(d.base.id, d);
    return m;
  }, [data]);
  const tabs = <PlayerHelmTabs active={sw.shown} onGo={sw.go} />;
  if (!data) {
    return (
      <main className={'ch-hf' + (phone ? ' is-phone' : ' is-desk')}>
        {phone && <PhoneTop start title="CoachHelm" />}
        <div className="ch-hf-flow">
          <FileFailed who="your CoachHelm" onRetry={() => refresh()} />
        </div>
      </main>
    );
  }
  const { cards } = data;
  const stage = cards.plan?.stage ?? 'none';
  const proposal = data.proposals.list.find((p) => p.title === cards.plan?.title) ?? data.proposals.list[0] ?? null;
  const open = openRead ? (all.get(openRead) ?? null) : null;
  const actions =
    proposal && (stage === 'suggested' || stage === 'shown') ? (
      <ul className="ch-hf-prop" data-ch-hf-accept="" data-ch-hf-decline="">
        <ProposalRow p={proposal} writes={writes} />
      </ul>
    ) : stage === 'accepted' ? (
      <span className="stat-done" role="status">
        <Icon icon={Check} size={18} />
        Your focus since {cards.plan?.since}
      </span>
    ) : null;
  const feat = cards.feat ? <FeatureCard key="feat" d={cards.feat} lens="player" first="" name="" team={cards.featTeam} stage={stage} coach={proposal?.coachName ?? 'Your coach'} actions={actions} onOpen={() => setOpenRead(cards.feat!.base.id)} /> : <EarlyFeature key="feat" lens="player" first="" rounds={data.rounds} toGo={data.roundsToGo} />;
  const empty = !cards.feat && data.rounds === 0;
  const penalties = open && /penalt/i.test(`${open.base.metric} ${open.base.title}`) ? data.penalties : null;
  const left = [feat, <PlanCard key="plan" plan={cards.plan} lens="player" first="" />, cards.sg && <SgCard key="sg" sg={cards.sg} who="You" standingHref={null} />];
  const right = [<WorkingCard key="w" list={cards.working} onOpen={setOpenRead} />, cards.field && <FieldCard key="f" field={cards.field} />, <ReadsCard key="r" cards={cards} lens="player" onOpen={setOpenRead} moreLine={moreReadsLine(cards.more) || undefined} />];
  return (
    <main className={'ch-hf' + (phone ? ' is-phone' : ' is-desk')} aria-labelledby="ch-hf-week" data-ch="your-week" aria-busy={sw.pending || undefined}>
      {phone && <PhoneTop start title="CoachHelm" />}
      {phone && tabs}
      <div className="dfile">
        <div className="dhead is-week">
          <div>
            <h1 id="ch-hf-week" className="lt">
              Your week
            </h1>
            <p className="ch-num">{[data.rounds != null ? `${data.rounds} rounds` : null, data.refreshed ? `refreshed ${data.refreshed}` : null].filter(Boolean).join(' · ')}</p>
          </div>
          {!phone && <div className="aseg">{tabs}</div>}
        </div>
        <div className="ch-hf-flow">
          {empty ? (
            <section className="card">
              <div className="empty">
                <b>No rounds yet</b>
                <p>Reads start after 4 full rounds in the last 90 days.</p>
                <Button variant="primary" size="lg" href="/golf/dashboard/rounds">
                  Go to Rounds
                </Button>
              </div>
            </section>
          ) : phone ? (
            <>
              {feat}
              <WorkingCard list={cards.working} onOpen={setOpenRead} />
              <PlanCard plan={cards.plan} lens="player" first="" />
              {cards.field && <FieldCard field={cards.field} />}
              {cards.sg && <SgCard sg={cards.sg} who="You" standingHref={null} />}
              <ReadsCard cards={cards} lens="player" onOpen={setOpenRead} moreLine={moreReadsLine(cards.more) || undefined} />
            </>
          ) : (
            <div className="grid2">
              <div className="col">{left}</div>
              <div className="col">{right}</div>
            </div>
          )}
        </div>
      </div>
      <Modal open={!!openRead} onClose={() => setOpenRead(null)} title={open?.base.title ?? 'This read'} className="ch-htb-sheet ch-htb ch-hf ch-hf-sheet" width={480} initialFocus=".xb">
        {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
        <div className="ins">{openRead && (open ? <ReadPanel read={open.base} deep={open} penalties={penalties} player={{ id: '', name: 'You', first: 'You', rounds: data.rounds ?? 0, early: false }} role="player" readOn={data.readOn} roster={[]} fileHost onClose={() => setOpenRead(null)} /> : <GonePanel onClose={() => setOpenRead(null)} />)}</div>
      </Modal>
    </main>
  );
}
