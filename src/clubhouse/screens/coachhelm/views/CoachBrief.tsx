'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { briefSectionId, type ChBriefGoalPlayer, type ChBriefSection, type ChBriefWorking, type ChCoachBrief } from '../../../data/coachhelm-coach-brief-shape';
import { COACH_BOARD_HREF } from '../../../data/coachhelm-track-record-shape';
import type { ChViewLoad } from '../../../data/coachhelm-views-shape';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { Button } from '../../../ui/Button';
import { RefreshNotice } from '../../../ui/RefreshNotice';
import { EmptyState } from '../../../ui/States';
import { Surface } from '../../../ui/Surface';
import { TeamPatterns } from '../TeamPatterns';
import { Row } from './MondayBrief';
import { BackLink } from '../../../ui/Section';
import '../../../styles/coachhelm-brief.css';
import { plural } from '../../../lib/plural';
import { LargeTitle } from '../../../ui/LargeTitle';

const LINE = 'Who to talk to this week, what the team is working on, and how CoachHelm’s reads have held.';

/** On the phone a pushed screen's bar (back to CoachHelm, "Brief"); on desktop a back link above the page's own header. */
function Frame({ children }: { children: ReactNode }) {
  const phone = useChPhone();
  const router = useRouter();
  return (
    <main className={'ch-hl ch-hmb ch-hbr' + (phone ? ' is-phone' : '')} aria-labelledby="ch-hbr-title" data-canopy={phone ? undefined : ''} data-ch-code="CH-13983">
      {phone && <PhoneTop back={{ label: 'CoachHelm', onBack: () => router.push(COACH_BOARD_HREF) }} title="Brief" titleId="ch-hbr-title" />}
      <header className="ch-hl-h ch-hmb-h" data-canopy-head="">
        {!phone && (
          <BackLink href={COACH_BOARD_HREF}>CoachHelm</BackLink>
        )}
        <span className="ch-hl-role">Coach</span>
        {phone ? (
          <LargeTitle as="p" className="ch-hl-h__t">
            Brief
          </LargeTitle>
        ) : (
          <h1 id="ch-hbr-title" className="ch-hl-h__t">
            Brief
          </h1>
        )}
        <p>{LINE}</p>
      </header>
      {children}
    </main>
  );
}

/** One focus area: who, what, its status word and progress, the rounds since it started, and one action. */
function WorkingRow({ w }: { w: ChBriefWorking }) {
  return (
    <li className="ch-hmb-row">
      <div className="ch-hmb-row__main">
        <span className="ch-hmb-row__who">{w.who}</span>
        <b className="ch-hmb-row__t">{w.title}</b>
        <span className="ch-hmb-row__m ch-num">
          <em>{w.word}</em>
          {w.line && <span> · {w.line}</span>}
        </span>
        {w.since && <span className="ch-hmb-row__b ch-num">{w.since}</span>}
      </div>
      <Button variant="secondary" size="sm" href={w.href} className="ch-hmb-row__a">
        Open
      </Button>
    </li>
  );
}

/** One player's active goals, each with its progress and, where there is one, the team and Tour on the same stat. */
function GoalPlayer({ p }: { p: ChBriefGoalPlayer }) {
  return (
    <li className="ch-hbr-goals__p">
      <Link className="ch-hbr-goals__name" href={p.href}>
        {p.name}
      </Link>
      <ul>
        {p.goals.map((g) => (
          <li key={g.id}>
            <b>{g.title}</b>
            {g.line && <span className="ch-num">{g.line}</span>}
            {g.standing && <span className="ch-hbr-goals__st ch-num">{g.standing}</span>}
          </li>
        ))}
      </ul>
    </li>
  );
}

function Ready({ d, section }: { d: ChCoachBrief; section: ChBriefSection | null }) {
  // An old /intelligence link names the part it was for: the page opens there once, without animating the jump.
  useEffect(() => {
    if (!section || section === 'week') return;
    document.getElementById(briefSectionId(section))?.scrollIntoView({ block: 'start' });
  }, [section]);
  return (
    <div className="ch-hmb-body">
      {d.missing && <RefreshNotice code="CH-13989" title="Part of the brief didn’t load" body={d.missing} />}
      <div id={briefSectionId('week')} className="ch-hbr-sec" data-ch-code="CH-13984">
        <Surface id="ch-hbr-week-s" title={`This week · ${d.week}`}>
          <p className="ch-hmb-team ch-num">{d.team}</p>
          {d.reads.length === 0 ? (
            <EmptyState
              size="section"
              code="CH-13988"
              shape="rows"
              title="No open reads this week"
              body="No player has a read at Likely or above that is current. Reads show here as rounds come in."
            />
          ) : (
            <ol className="ch-hmb-rows" aria-label="Open reads, one per player">
              {d.reads.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </ol>
          )}
          <p className="ch-hmb-counts ch-num" data-ch-code="CH-13939">
            {d.counts}
          </p>
          {d.cleared.length > 0 && (
            <p className="ch-hmb-ood">
              <b>Cleared this week:</b> {d.cleared.join('; ')}
            </p>
          )}
          {d.outOfDate && <p className="ch-hmb-ood ch-num">{d.outOfDate}</p>}
        </Surface>
      </div>
      {d.patterns && (
        <div id={briefSectionId('patterns')} className="ch-hbr-sec">
          <TeamPatterns data={d.patterns} />
        </div>
      )}
      {d.working.length > 0 && (
        <div id={briefSectionId('working')} className="ch-hbr-sec" data-ch-code="CH-13985">
          <Surface id="ch-hbr-working-s" title="What players are working on" subtitle={`${plural(d.working.length, 'focus area')} open`}>
            <ol className="ch-hmb-rows">
              {d.working.map((w) => (
                <WorkingRow key={w.id} w={w} />
              ))}
            </ol>
          </Surface>
        </div>
      )}
      {d.record && (
        <div id={briefSectionId('record')} className="ch-hbr-sec" data-ch-code="CH-13986">
          <Surface
            id="ch-hbr-record-s"
            title="How the reads have held"
            actions={
              <Button variant="secondary" size="sm" href={d.record.href}>
                Track record
              </Button>
            }
          >
            <p className="ch-hmb-team ch-num">{d.record.program}</p>
          </Surface>
        </div>
      )}
      {d.goals.length > 0 && (
        <div id={briefSectionId('goals')} className="ch-hbr-sec" data-ch-code="CH-13987">
          <Surface id="ch-hbr-goals-s" title="Goals and standing">
            <ul className="ch-hbr-goals">
              {d.goals.map((p) => (
                <GoalPlayer key={p.id} p={p} />
              ))}
            </ul>
            {d.goalsNone && <p className="ch-hmb-counts ch-num">{d.goalsNone}</p>}
          </Surface>
        </div>
      )}
    </div>
  );
}

/**
 * The coach's Brief (P013 `?view=brief`, behind `coachhelm_monday_brief_v1`; CoachHelm par-05): the team view behind
 * `/intelligence`. This week's open reads (one per player), the team pattern, what players are working on, how the reads have
 * held and each player's goals with their standing, each only when it has something in it. Read only; every action opens the
 * board on that player, where Assign and the read's own actions live.
 */
export function CoachBrief({ load, section = null }: { load: ChViewLoad<ChCoachBrief>; section?: ChBriefSection | null }) {
  if (load.status === 'off') {
    return (
      <Frame>
        <EmptyState
          size="page"
          code="CH-13999"
          kind="restricted"
          title="CoachHelm is off for your team"
          body={load.reason ? `It was turned off: “${load.reason}”. The brief comes back when CoachHelm does.` : 'The brief comes back when CoachHelm is turned on again.'}
        />
      </Frame>
    );
  }
  if (load.status === 'failed') {
    return (
      <Frame>
        <RefreshNotice code="CH-13997" title="The brief didn’t load" body="Nothing is lost. Your players’ reads, focus areas and goals are not affected; try again in a moment." />
      </Frame>
    );
  }
  return (
    <Frame>
      <Ready d={load.data} section={section} />
    </Frame>
  );
}
