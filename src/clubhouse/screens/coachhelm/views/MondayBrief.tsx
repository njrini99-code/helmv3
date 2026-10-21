'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { COACH_BOARD_HREF } from '../../../data/coachhelm-track-record-shape';
import type { ChBriefRow, ChMondayBrief } from '../../../data/coachhelm-monday-brief-shape';
import type { ChViewLoad } from '../../../data/coachhelm-views-shape';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { RefreshNotice } from '../../../ui/RefreshNotice';
import { EmptyState } from '../../../ui/States';
import { Surface } from '../../../ui/Surface';
import '../../../styles/coachhelm-brief.css';

const LINE = 'Who needs a conversation before practice, and what the team works on this week.';

/** On the phone a pushed screen's bar (back to CoachHelm, "Monday brief"); on desktop a back link above the page's own header. */
function BriefFrame({ sub, children }: { sub?: string; children: ReactNode }) {
  const phone = useChPhone();
  const router = useRouter();
  return (
    <main className={'ch-hl ch-hmb' + (phone ? ' is-phone' : '')} aria-labelledby="ch-hmb-title" data-canopy={phone ? undefined : ''} data-ch-code="CH-13970">
      {phone && <PhoneTop back={{ label: 'CoachHelm', onBack: () => router.push(COACH_BOARD_HREF) }} title="Monday brief" titleId="ch-hmb-title" />}
      <header className="ch-hl-h ch-hmb-h" data-canopy-head="">
        {!phone && (
          <Link className="ch-hmb-back" href={COACH_BOARD_HREF}>
            <Icon icon={ChevronLeft} size={15} />
            CoachHelm
          </Link>
        )}
        <span className="ch-hl-role">Coach</span>
        {phone ? (
          <p className="ch-hl-h__t">Monday brief</p>
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

/** One row: who, the read, its ladder word (or how many players) and the strokes a round, with one action. */
function Row({ r }: { r: ChBriefRow }) {
  return (
    <li className={'ch-hmb-row is-' + r.kind} data-ch-code={r.kind === 'team_pattern' ? 'CH-13972' : 'CH-13971'}>
      <div className="ch-hmb-row__main">
        <span className="ch-hmb-row__who">{r.who}</span>
        <b className="ch-hmb-row__t">{r.title}</b>
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
      </div>
      <Button variant="secondary" size="sm" href={r.href} className="ch-hmb-row__a">
        Open
      </Button>
    </li>
  );
}

function Ready({ d }: { d: ChMondayBrief }) {
  return (
    <div className="ch-hmb-body">
      <Surface id="ch-hmb-items" title={d.week}>
        <p className="ch-hmb-team ch-num">{d.team}</p>
        {d.rows.length === 0 ? (
          <EmptyState
            size="section"
            code="CH-13973"
            shape="rows"
            title="Nothing to raise this week"
            body="No read reached Likely or above for any player, and no read is shared by enough players to call a team pattern."
          />
        ) : (
          <ol className="ch-hmb-rows">
            {d.rows.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </ol>
        )}
        <p className="ch-hmb-counts ch-num" data-ch-code="CH-13977">
          {d.counts}
        </p>
      </Surface>
      {(d.cleared.length > 0 || d.outOfDate) && (
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
      )}
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
          code="CH-13974"
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
        <RefreshNotice code="CH-13975" title="The Monday brief didn’t load" body="Nothing is lost. Your players’ reads are not affected; try again in a moment." />
      </BriefFrame>
    );
  }
  return (
    <BriefFrame>
      <Ready d={load.data} />
    </BriefFrame>
  );
}
