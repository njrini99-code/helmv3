'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { COACH_BOARD_HREF } from '../../../data/coachhelm-track-record-shape';
import type { ChBriefRow, ChMondayBrief } from '../../../data/coachhelm-monday-brief-shape';
import type { ChViewLoad } from '../../../data/coachhelm-views-shape';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { Avatar } from '../../../ui/Avatar';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { RefreshNotice } from '../../../ui/RefreshNotice';
import { EmptyState } from '../../../ui/States';
import { Inset, Surface } from '../../../ui/Surface';
import { BackLink } from '../../../ui/Section';
import '../../../styles/coachhelm-brief.css';
import { LargeTitle } from '../../../ui/LargeTitle';

const LINE = 'Who needs a conversation before practice, and what the team works on this week.';

/** On the phone a pushed screen's bar (back to CoachHelm, "Monday brief"); on desktop a back link above the page's own header. */
function BriefFrame({ sub, children }: { sub?: string; children: ReactNode }) {
  const phone = useChPhone();
  const router = useRouter();
  return (
    <main className={'ch-hl ch-hmb' + (phone ? ' is-phone' : '')} aria-labelledby="ch-hmb-title" data-canopy={phone ? undefined : ''} data-ch-code="CH-13932">
      {phone && <PhoneTop back={{ label: 'CoachHelm', onBack: () => router.push(COACH_BOARD_HREF) }} title="Monday brief" titleId="ch-hmb-title" />}
      <header className="ch-hl-h ch-hmb-h" data-canopy-head="">
        {!phone && (
          <BackLink href={COACH_BOARD_HREF}>CoachHelm</BackLink>
        )}
        <span className="ch-hl-role">Coach</span>
        {phone ? (
          <LargeTitle as="p" className="ch-hl-h__t">
            Monday brief
          </LargeTitle>
        ) : (
          <h1 id="ch-hmb-title" className="ch-hl-h__t">
            Monday brief
          </h1>
        )}
        <p>{sub ?? LINE}</p>
      </header>
      {children}
    </main>
  );
}

/**
 * One player's row: who, the read, its ladder word and the strokes a round. The whole row is the one target, with a chevron at
 * its end (fix wave 2026-11-11: five raised "Open" keys down the page read as five primary actions).
 */
export function Row({ r }: { r: ChBriefRow }) {
  return (
    <li className={'ch-hmb-row is-' + r.kind} data-ch-code={r.kind === 'team_pattern' ? 'CH-13934' : 'CH-13933'}>
      <Link className="ch-hmb-row__a" href={r.href}>
        {r.kind !== 'team_pattern' && <Avatar name={r.who} size="md" />}
        <span className="ch-hmb-row__main">
          <span className="ch-hmb-row__who">{r.who}</span>
          <b className="ch-hmb-row__t ch-num">{r.title}</b>
          <span className="ch-hmb-row__m ch-num">
            <em>{r.tag}</em>
            {r.strokes && <span> · {r.strokes}</span>}
          </span>
          {r.next && (
            <span className="ch-hmb-row__n">
              <b>Practice block.</b> {r.next}
            </span>
          )}
          {r.behind && <span className="ch-hmb-row__b">{r.behind}</span>}
        </span>
        <Icon icon={ChevronRight} size={16} />
      </Link>
    </li>
  );
}

/** The week's lead: the team pattern and its practice block, set as the panel's own headline with the block in a well. */
function Lead({ r }: { r: ChBriefRow }) {
  return (
    <div className="ch-hmb-lead" data-ch-code="CH-13934">
      <span className="ch-hmb-lead__k">{r.who}</span>
      <h3 className="ch-hmb-lead__t ch-num">{r.title}</h3>
      <p className="ch-hmb-lead__m ch-num">
        <em>{r.tag}</em>
        {r.strokes && <span> · {r.strokes}</span>}
      </p>
      {r.next && (
        <Inset className="ch-hmb-lead__n">
          <b>Practice block</b>
          <span className="ch-num">{r.next}</span>
        </Inset>
      )}
      <div className="ch-hmb-lead__a">
        <Button variant="ghost" rightIcon={ArrowRight} href={r.href} feel="select">
          Open the pattern
        </Button>
      </div>
    </div>
  );
}

/**
 * Desktop: the week and its lead (the team pattern with its practice block) on the left with what else happened under it, the
 * players to talk to on the right. The phone is one column: the week, the players, then what else happened.
 */
function Ready({ d }: { d: ChMondayBrief }) {
  const lead = d.rows.find((r) => r.kind === 'team_pattern') ?? null;
  const players = d.rows.filter((r) => r !== lead);
  const counts = (
    <span className="ch-hmb-counts ch-num" data-ch-code="CH-13939">
      {d.counts}
    </span>
  );
  const week = <span className="ch-num">{d.team}</span>;
  if (d.rows.length === 0) {
    return (
      <div className="ch-hmb-body">
        <Surface id="ch-hmb-items" title={d.week} subtitle={week} footerNote={counts}>
          <EmptyState
            size="section"
            code="CH-13935"
            shape="rows"
            title="Nothing to raise this week"
            body="No read reached Likely or above for any player, and no read is shared by enough players to call a team pattern."
          />
        </Surface>
        <Also d={d} />
      </div>
    );
  }
  return (
    <div className="ch-hmb-body is-split">
      <Surface id="ch-hmb-items" title={d.week} subtitle={week} footerNote={counts}>
        {lead ? <Lead r={lead} /> : <p className="ch-hmb-quiet">No read is shared by enough players to call a team pattern this week.</p>}
      </Surface>
      <div className="ch-hmb-players">
        <Surface id="ch-hmb-players" title="By player" padded={false}>
          {players.length > 0 ? (
            <ol className="ch-hmb-rows">
              {players.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </ol>
          ) : (
            <p className="ch-hmb-quiet is-rows">No read reached Likely or above for any player this week.</p>
          )}
        </Surface>
      </div>
      <Also d={d} />
    </div>
  );
}

/** What cleared and what is out of date, under the week. */
function Also({ d }: { d: ChMondayBrief }) {
  if (d.cleared.length === 0 && !d.outOfDate) return null;
  return (
    <div className="ch-hmb-also">
    <Surface id="ch-hmb-more" title="Also this week">
      {d.cleared.length > 0 && (
        <>
          <h3 className="ch-hmb-sub">Cleared this week</h3>
          <ul className="ch-hmb-cleared">
            {d.cleared.map((c, i) => (
              <li key={`${c}-${i}`}>{c}</li>
            ))}
          </ul>
        </>
      )}
      {d.outOfDate && <p className="ch-hmb-ood ch-num">{d.outOfDate}</p>}
    </Surface>
    </div>
  );
}

/**
 * The coach's Monday brief (P013, `?view=monday-brief`, flag `coachhelm_monday_brief_v1`; CoachHelm task chs-28, supercharge 04
 * §4 and Layout 1): the team line, up to five rows (the team pattern first when one exists, then one read per player at Likely or
 * above, most strokes first), the week's counts, and below them what cleared and what is out of date. Read only.
 */
export function MondayBrief({ load }: { load: ChViewLoad<ChMondayBrief> }) {
  if (load.status === 'off') {
    return (
      <BriefFrame>
        <EmptyState
          size="page"
          code="CH-13936"
          kind="restricted"
          title="CoachHelm is off for your team"
          body={load.reason ? `It was turned off: “${load.reason}”. The Monday brief comes back when CoachHelm does.` : 'The Monday brief comes back when CoachHelm is turned on again.'}
        />
      </BriefFrame>
    );
  }
  if (load.status === 'failed') {
    return (
      <BriefFrame>
        <RefreshNotice code="CH-13937" title="The Monday brief didn’t load" body="Nothing is lost. Your players’ reads are not affected; try again in a moment." />
      </BriefFrame>
    );
  }
  return (
    <BriefFrame>
      <Ready d={load.data} />
    </BriefFrame>
  );
}
