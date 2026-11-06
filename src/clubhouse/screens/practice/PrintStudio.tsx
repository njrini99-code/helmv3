'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PracticePlanSheet } from '../coachhelm/plan/sheet/PracticePlanSheet';
import type { PlanSheetModel } from '../coachhelm/plan/sheet/plan-sheet-model';
import { printNode } from '../coachhelm/plan/PrintPlan';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop } from '../../shell/phone-chrome';
import { Button } from '../../ui/Button';
import { LargeTitle } from '../../ui/LargeTitle';
import { Switch } from '../../ui/Switch';

export interface PrintDrill {
  name: string;
  line: string;
  setup: string;
  goal: string;
}
type Parts = { coach: boolean; board: boolean; cards: boolean; drills: boolean };

/** Range board: only the rotation, readable at ten feet (N-00 4.14). A plan with no rotation has no board. */
function RangeBoard({ plan }: { plan: PlanSheetModel }) {
  const rows = plan.rows.filter((r) => r.rotation);
  return (
    <>
      {rows.map((r) => (
        <section key={r.id} className="ch-prt-page ch-prt-wide">
          <header className="ch-prt-h">
            <span>{plan.team} · Range board</span>
            <h2>{r.title}</h2>
            <span className="ch-num">
              {r.start} · {plan.dayWord} {plan.dayNum}
            </span>
          </header>
          <table className="ch-prt-rot">
            <thead>
              <tr>
                <th scope="col">Turn</th>
                {r.rotation!.rows.map((s) => (
                  <th key={s.place} scope="col">
                    {s.place}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.rotation!.turns.map((turn, i) => (
                <tr key={turn}>
                  <th scope="row" className="ch-num">
                    {turn}
                  </th>
                  {r.rotation!.rows.map((s) => (
                    <td key={s.place}>{s.cells[i] ? `Group ${s.cells[i]}` : '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}

/** Pocket cards: one per group, its stops in order, two to a landscape sheet with a cut line. */
function PocketCards({ plan }: { plan: PlanSheetModel }) {
  return (
    <section className="ch-prt-page ch-prt-wide ch-prt-cards">
      {plan.groups.map((g) => (
        <article key={g.letter} className="ch-prt-card">
          <header>
            <span>
              Group {g.letter} · {g.names.join(', ')}
            </span>
            <span className="ch-num">
              {plan.dayWord} {plan.dayNum}
            </span>
          </header>
          <h3>{plan.title}</h3>
          <ol>
            {plan.rows.map((r) => {
              const stop = r.rotation ? r.rotation.rows.flatMap((s) => s.cells.map((c, i) => (c === g.letter ? `${r.rotation!.turns[i]} ${s.place}` : null))).filter(Boolean).join(' · ') : r.detail;
              return (
                <li key={r.id}>
                  <b className="ch-num">{r.start}</b>
                  <span>
                    {r.title}
                    {stop ? ` · ${stop}` : ''}
                  </span>
                </li>
              );
            })}
          </ol>
        </article>
      ))}
    </section>
  );
}

function DrillsAppendix({ plan, drills }: { plan: PlanSheetModel; drills: PrintDrill[] }) {
  return (
    <section className="ch-prt-page ch-prt-drills">
      <header className="ch-prt-h">
        <span>
          {plan.title} · {plan.dayWord} {plan.dayNum}
        </span>
        <h2>Drills</h2>
      </header>
      <div className="ch-prt-cols">
        {drills.map((d) => (
          <article key={d.name}>
            <h3>{d.name}</h3>
            <small className="ch-num">{d.line}</small>
            {d.setup && <p>{d.setup}</p>}
            {d.goal && <p>Goal: {d.goal}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function Pages({ plan, drills, parts }: { plan: PlanSheetModel; drills: PrintDrill[]; parts: Parts }) {
  return (
    <>
      {parts.coach && (
        <section className="ch-prt-page">
          <PracticePlanSheet plan={plan} density="print" />
        </section>
      )}
      {parts.board && <RangeBoard plan={plan} />}
      {parts.cards && <PocketCards plan={plan} />}
      {parts.drills && <DrillsAppendix plan={plan} drills={drills} />}
    </>
  );
}

/** Print studio (N-00 4.14): pick the pieces, see them as paper, print. Save as PDF is the print dialog's. */
export function PrintStudio({ plan, drills, planHref }: { plan: PlanSheetModel; drills: PrintDrill[]; planHref: string }) {
  const phone = useChPhone();
  const router = useRouter();
  const hasRotation = plan.rows.some((r) => r.rotation);
  const [parts, setParts] = useState<Parts>({ coach: true, board: hasRotation, cards: false, drills: false });
  const flip = (k: keyof Parts) => setParts((p) => ({ ...p, [k]: !p[k] }));
  const none = !parts.coach && !parts.board && !parts.cards && !parts.drills;
  return (
    <main className={'ch-page ch-prc ch-prt' + (phone ? ' is-phone' : '')} data-ch="practice" aria-labelledby="ch-prc-title">
      {phone && <PhoneTop title="Print" back={{ label: 'Plan', onBack: () => router.push(planHref) }} />}
      <header className="ch-prc-h">
        <div>
          <LargeTitle id="ch-prc-title">Print</LargeTitle>
          <p className="ch-prc-h__line">Choose Save as PDF in the print dialog to keep a copy.</p>
        </div>
        <div className="ch-prc-h__a">
          <Button variant="primary" disabled={none} onClick={() => void printNode(<Pages plan={plan} drills={drills} parts={parts} />)}>
            Print
          </Button>
        </div>
      </header>
      <ul className="ch-prt-opts" aria-label="What prints">
        <li>
          <Switch label="Coach copy" checked={parts.coach} onChange={() => flip('coach')} />
        </li>
        {hasRotation && (
          <li>
            <Switch label="Range board" checked={parts.board} onChange={() => flip('board')} />
          </li>
        )}
        {plan.groups.length > 0 && (
          <li>
            <Switch label="Pocket cards" checked={parts.cards} onChange={() => flip('cards')} />
          </li>
        )}
        {drills.length > 0 && (
          <li>
            <Switch label="Drills appendix" checked={parts.drills} onChange={() => flip('drills')} />
          </li>
        )}
      </ul>
      <div className="ch-prt-preview">
        <Pages plan={plan} drills={drills} parts={parts} />
      </div>
    </main>
  );
}
