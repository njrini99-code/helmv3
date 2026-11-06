'use client';

import { Printer } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PracticePlanSheet } from '../coachhelm/plan/sheet/PracticePlanSheet';
import type { PlanSheetModel, SheetRow } from '../coachhelm/plan/sheet/plan-sheet-model';
import { printNode } from '../coachhelm/plan/PrintPlan';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop } from '../../shell/phone-chrome';
import { Button } from '../../ui/Button';
import { GroupList, GroupRow } from '../../ui/GroupList';
import { LargeTitle } from '../../ui/LargeTitle';
import { PhoneIconAction } from '../../ui/PhoneBar';
import { Switch } from '../../ui/Switch';
import { DrillDiagram, diagramFor, type DrillDiagramKind } from './PrintDiagram';

export interface PrintDrill {
  name: string;
  line: string;
  setup: string;
  goal: string;
  area?: string | null;
  diagram?: DrillDiagramKind;
  scoring?: Array<{ label: string; points: number }>;
  levels?: string | null;
}
type PartKey = 'coach' | 'board' | 'cards' | 'drills';
type Parts = Record<PartKey, boolean>;
interface PrintPage {
  key: string;
  part: string;
  wide: boolean;
  node: (at: { n: number; of: number; qr: string | null }) => ReactNode;
}

const PAPER = { tall: { w: 816, h: 1056 }, wide: { w: 1056, h: 816 } };
const DRILLS_PER_PAGE = 6;
const WORDS: Record<number, string> = { 5: 'Five', 10: 'Ten', 12: 'Twelve', 15: 'Fifteen', 20: 'Twenty', 25: 'Twenty-five', 30: 'Thirty' };

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The code on every page. It opens the plan page, whose own gate is the only door (owner call 17). */
export function qrSvg(url: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  return qr.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
}

function Qr({ svg }: { svg: string }) {
  return <span className="ch-prt-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Foot({ left, qr, caption, page }: { left: ReactNode; qr: string | null; caption?: ReactNode; page?: string }) {
  return (
    <footer className="ch-prt-foot">
      <span className="ch-prt-foot__l">{left}</span>
      {qr && (
        <span className="ch-prt-foot__q">
          <Qr svg={qr} />
          {caption && <span>{caption}</span>}
        </span>
      )}
      {page && <span className="ch-prt-foot__p ch-num">{page}</span>}
    </footer>
  );
}

const pageWord = (at: { n: number; of: number }) => `Page ${at.n} of ${at.of}`;
const hubLine = (plan: PlanSheetModel) => `${plan.team} · Team Hub › Documents › Practice plans`;
const dateWord = (plan: PlanSheetModel) => `${plan.dayWord} ${plan.dayNum}${plan.monthWord ? ` ${plan.monthWord}` : ''}`;

function RangeBoard({ plan, row, next, at, draft }: { plan: PlanSheetModel; row: SheetRow; next: SheetRow | null; at: { n: number; of: number; qr: string | null }; draft: boolean }) {
  const rot = row.rotation!;
  const turnMin = Math.round(row.mins / Math.max(1, rot.turns.length));
  return (
    <>
      <header className="ch-prt-board__h">
        <div>
          <p className="ch-prt-from">
            {plan.team} · Range board{draft ? ' · Draft' : ''}
          </p>
          <h2>{row.title}</h2>
        </div>
        <div className="ch-prt-board__t">
          <b className="ch-num">
            {row.start}
            {next ? ` to ${next.start}` : ''}
          </b>
          <span>{dateWord(plan)}</span>
        </div>
      </header>
      <table className="ch-prt-board">
        <thead>
          <tr>
            <td />
            {rot.rows.map((s) => (
              <th key={s.place} scope="col">
                <b>{s.note || s.place}</b>
                {s.note && <span>{s.place}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rot.turns.map((turn, i) => (
            <tr key={turn}>
              <th scope="row" className="ch-num">
                {turn}
              </th>
              {rot.rows.map((s) => (
                <td key={s.place}>
                  {s.cells[i] ? (
                    <>
                      <small>Group</small> {s.cells[i]}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Foot
        left={`${WORDS[turnMin] ?? turnMin} minute turns. Move one station right on the horn.`}
        qr={null}
        page={next ? `Then ${next.title} at ${next.start}` : pageWord(at)}
      />
    </>
  );
}

/** A group's own stops, in order: a rotation gives each turn it is on, anything else its one line. */
function stopsFor(plan: PlanSheetModel, letter: string) {
  return plan.rows.flatMap((r) => {
    if (r.rotation) {
      return r.rotation.turns.flatMap((turn, i) => r.rotation!.rows.filter((s) => s.cells[i] === letter).map((s) => ({ id: `${r.id}-${turn}`, time: turn, place: s.place, what: s.note || r.title })));
    }
    if (r.who !== 'all' && !r.who.some((w) => w.letter === letter)) return [];
    return [{ id: r.id, time: r.start, place: r.title, what: r.detail }];
  });
}

function PocketCard({ plan, group, qr, draft }: { plan: PlanSheetModel; group: PlanSheetModel['groups'][number]; qr: string | null; draft: boolean }) {
  const time = plan.meta.find((m) => m.label === 'Time')?.value;
  const place = plan.meta.find((m) => m.label === 'Place')?.value;
  return (
    <article className="ch-prt-card">
      <header>
        <span>
          Group {group.letter} · {group.names.join(', ')}
        </span>
        <span className="ch-num">
          {draft ? 'Draft · ' : ''}
          {dateWord(plan)}
        </span>
      </header>
      <h3>{plan.title}</h3>
      <p className="ch-prt-card__deck">{[time, place].filter(Boolean).join(' · ')}</p>
      <ol>
        {stopsFor(plan, group.letter).map((s) => (
          <li key={s.id}>
            <span className="ch-num">{s.time}</span>
            <span>
              <b>{s.place}</b>
              {s.what && <small>{s.what}</small>}
            </span>
          </li>
        ))}
      </ol>
      {plan.bring.length > 0 && <p className="ch-prt-card__bring">Bring: {plan.bring.join(', ')}</p>}
      <Foot left="Live plan. Sign in with your team account; changes show there first." qr={qr} />
    </article>
  );
}

function DrillsPage({ plan, drills, at, draft }: { plan: PlanSheetModel; drills: PrintDrill[]; at: { n: number; of: number; qr: string | null }; draft: boolean }) {
  return (
    <>
      <header className="ch-prt-run">
        <span>
          {plan.title} · {dateWord(plan)}
          {draft ? ' · Draft' : ''}
        </span>
        <span>Drills</span>
      </header>
      <div className="ch-prt-drills">
        {drills.map((d) => {
          const kind = diagramFor(d.diagram ?? 'auto', d.area ?? null);
          return (
            <article key={d.name}>
              <h3>{d.name}</h3>
              <small className="ch-num">{d.line}</small>
              {kind !== 'none' && <DrillDiagram kind={kind} />}
              {d.setup && <p>{d.setup}</p>}
              {d.goal && <p>Goal: {d.goal}</p>}
              {!!d.scoring?.length && (
                <ul>
                  {d.scoring.map((s) => (
                    <li key={s.label}>
                      <span>{s.label}</span>
                      <span className="ch-num">{s.points === 1 ? '1 point' : `${s.points} points`}</span>
                    </li>
                  ))}
                </ul>
              )}
              {d.levels && <small className="ch-num">{d.levels}</small>}
            </article>
          );
        })}
      </div>
      <Foot left={hubLine(plan)} qr={at.qr} caption="Live plan · team sign-in" page={pageWord(at)} />
    </>
  );
}

/** Every sheet the switches pick, in print order. The numbers are the studio's own, so they hold in Safari (N-00 4.14). */
function buildPages(plan: PlanSheetModel, drills: PrintDrill[], parts: Parts, draft: boolean): PrintPage[] {
  const out: PrintPage[] = [];
  if (parts.coach) {
    out.push({
      key: 'coach-1',
      part: 'Coach copy',
      wide: false,
      node: (at) => (
        <>
          <PracticePlanSheet plan={plan} density="print" part="schedule" draft={draft} />
          <Foot left={hubLine(plan)} qr={at.qr} caption="Live plan · team sign-in" page={pageWord(at)} />
        </>
      ),
    });
    out.push({
      key: 'coach-2',
      part: 'Coach copy',
      wide: false,
      node: (at) => (
        <>
          <header className="ch-prt-run">
            <span>
              {plan.title} · {dateWord(plan)}
              {draft ? ' · Draft' : ''}
            </span>
            <span>Coach copy</span>
          </header>
          {drills.length > 0 && (
            <section className="ch-prt-brief">
              <h3>Drills</h3>
              <ul>
                {drills.map((d) => (
                  <li key={d.name}>
                    <b>{d.name}</b>
                    <span className="ch-num">{d.line}</span>
                    {d.levels && <span className="ch-num">{d.levels}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <PracticePlanSheet plan={plan} density="print" part="rest" draft={draft} />
          <Foot left={hubLine(plan)} qr={at.qr} caption="Live plan · team sign-in" page={pageWord(at)} />
        </>
      ),
    });
  }
  if (parts.board) {
    plan.rows.forEach((r, i) => {
      if (!r.rotation) return;
      out.push({ key: `board-${r.id}`, part: 'Range board', wide: true, node: (at) => <RangeBoard plan={plan} row={r} next={plan.rows[i + 1] ?? null} at={at} draft={draft} /> });
    });
  }
  if (parts.cards) {
    chunk(plan.groups, 2).forEach((pair) => {
      out.push({
        key: `cards-${pair.map((g) => g.letter).join('')}`,
        part: 'Pocket cards',
        wide: true,
        node: (at) => (
          <div className="ch-prt-cards">
            {pair.map((g) => (
              <PocketCard key={g.letter} plan={plan} group={g} qr={at.qr} draft={draft} />
            ))}
          </div>
        ),
      });
    });
  }
  if (parts.drills) {
    chunk(drills, DRILLS_PER_PAGE).forEach((list, i) => {
      out.push({ key: `drills-${i}`, part: 'Drills appendix', wide: false, node: (at) => <DrillsPage plan={plan} drills={list} at={at} draft={draft} /> });
    });
  }
  return out;
}

function pageClass(p: PrintPage): string {
  return 'ch-prt-page ' + (p.wide ? 'ch-prt-page--wide' : 'ch-prt-page--tall');
}

function PrintPages({ pages, qr }: { pages: PrintPage[]; qr: string | null }) {
  return (
    <>
      {pages.map((p, i) => (
        <section key={p.key} className={pageClass(p)}>
          {p.node({ n: i + 1, of: pages.length, qr })}
        </section>
      ))}
    </>
  );
}

/** One sheet on screen: laid out at its real paper size and scaled to the column, so it looks as it will print. */
function Sheet({ page, at, qr }: { page: PrintPage; at: { n: number; of: number }; qr: string | null }) {
  const frame = useRef<HTMLDivElement>(null);
  const paper = page.wide ? PAPER.wide : PAPER.tall;
  const [scale, setScale] = useState<number | null>(null);
  const [tall, setTall] = useState(paper.h);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => {
      setScale(Math.min(1, el.clientWidth / paper.w));
      setTall(Math.max(paper.h, inner.current?.offsetHeight ?? paper.h));
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [paper.w, paper.h]);
  const k = scale ?? 1;
  return (
    <figure className="ch-prt-sheet">
      <div ref={frame} className="ch-prt-frame" style={{ maxWidth: paper.w, height: scale === null ? undefined : tall * k, aspectRatio: scale === null ? `${paper.w} / ${paper.h}` : undefined }}>
        <div ref={inner} className="ch-prt-paper" data-ui="clubhouse" data-ready={scale === null ? undefined : ''} style={{ width: paper.w, minHeight: paper.h, transform: `scale(${k})` }}>
          <section className={pageClass(page)}>{page.node({ ...at, qr })}</section>
        </div>
      </div>
      <figcaption className="ch-num">
        {page.part} · Page {at.n} of {at.of}
      </figcaption>
    </figure>
  );
}

const OPTION_WORDS: Record<PartKey, string> = {
  coach: 'Two pages, portrait',
  board: 'Rotation only, readable at ten feet',
  cards: 'One per group, two to a sheet',
  drills: 'Set-ups and scoring, two columns',
};
const OPTION_NAMES: Record<PartKey, string> = { coach: 'Coach copy', board: 'Range board', cards: 'Pocket cards', drills: 'Drills appendix' };

/** Print studio (N-00 4.14): pick the pieces, see them as paper, print. Save as PDF is the print dialog's. */
export function PrintStudio({ plan, drills, planHref, draft = false }: { plan: PlanSheetModel; drills: PrintDrill[]; planHref: string; draft?: boolean }) {
  const phone = useChPhone();
  const router = useRouter();
  const hasRotation = plan.rows.some((r) => r.rotation);
  const [parts, setParts] = useState<Parts>({ coach: true, board: hasRotation, cards: false, drills: false });
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const qr = useMemo(() => (origin ? qrSvg(`${origin}${planHref}`) : null), [origin, planHref]);
  const pages = useMemo(() => buildPages(plan, drills, parts, draft), [plan, drills, parts, draft]);
  const offered: PartKey[] = ['coach', ...(hasRotation ? (['board'] as const) : []), ...(plan.groups.length > 0 ? (['cards'] as const) : []), ...(drills.length > 0 ? (['drills'] as const) : [])];
  const print = () => void printNode(<PrintPages pages={pages} qr={qr} />);
  return (
    <main className={'ch-page ch-prc ch-prt' + (phone ? ' is-phone' : '')} data-ch="practice" aria-labelledby="ch-prc-title">
      {phone && <PhoneTop title="Print" back={{ label: 'Plan', onBack: () => router.push(planHref) }} action={pages.length > 0 ? <PhoneIconAction icon={Printer} label="Print" onClick={print} /> : undefined} />}
      <header className="ch-prc-h">
        <LargeTitle id="ch-prc-title">Print</LargeTitle>
        <div className="ch-prc-h__a">
          <Button variant="primary" disabled={pages.length === 0} onClick={print}>
            Print
          </Button>
        </div>
      </header>
      <div className="ch-prt-layout">
        <aside className="ch-prt-side">
          <GroupList className="ch-prt-opts">
            {offered.map((k) => (
              <GroupRow key={k} twoLine className="ch-prt-opt">
                <span className="ch-prt-opt__t">
                  <b>{OPTION_NAMES[k]}</b>
                  <span>{OPTION_WORDS[k]}</span>
                </span>
                <Switch label={OPTION_NAMES[k]} hideLabel checked={parts[k]} onChange={(v) => setParts((p) => ({ ...p, [k]: v }))} />
              </GroupRow>
            ))}
          </GroupList>
          <p className="ch-prt-note">Choose Save as PDF in the print dialog to keep a copy.</p>
        </aside>
        <div className="ch-prt-pages">
          {pages.length === 0 ? (
            <p className="ch-prt-none">Turn on a page to print it.</p>
          ) : (
            pages.map((p, i) => <Sheet key={p.key} page={p} at={{ n: i + 1, of: pages.length }} qr={qr} />)
          )}
        </div>
      </div>
    </main>
  );
}
