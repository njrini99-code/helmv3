'use client';

import { Printer } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PracticePlanSheet } from '../coachhelm/plan/sheet/PracticePlanSheet';
import type { PlanSheetModel, SheetRow } from '../coachhelm/plan/sheet/plan-sheet-model';
import { LETTER_CONTENT, pageCuts } from '../coachhelm/plan/page-cuts';
import { printNode } from '../coachhelm/plan/PrintPlan';
import { plural } from '../../lib/plural';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop } from '../../shell/phone-chrome';
import { Button } from '../../ui/Button';
import { GroupList, GroupRow } from '../../ui/GroupList';
import { InlineNotice } from '../../ui/Notices';
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
  /** The pieces read from a distance or cut apart (range board, pocket cards). Same paper as the rest. */
  wide: boolean;
  node: (at: { n: number; of: number; qr: string | null }) => ReactNode;
}

/** US Letter, portrait: every piece prints on it (a landscape sheet cannot be promised in Safari; see `.ch-prt-page--tall` in practice.css). */
const PAPER = { w: 816, h: 1056 };
/** Two rows of two. A drill with its diagram and scoring is about 3.4in tall, so a third row ran onto a second sheet (seen in the paginated render). */
const DRILLS_PER_PAGE = 4;
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
/** What must stay whole on paper: a schedule row, a rotation, a pocket card, a drill, a line of the range board. The print rules keep the same ones. */
const KEEP_WHOLE = '.drow, .pp-rot, .ch-prt-card, .ch-prt-drills article, .ch-prt-board tbody tr';

/**
 * Each piece's place among the sheets that will come out of the printer. A piece that runs past one sheet takes as many as it needs, and its number is its last
 * sheet's (its footer prints there), so "Page 2 of 4" on paper is the second of four sheets in the hand.
 */
export function sheetNumbers(spans: readonly number[]): Array<{ first: number; n: number; of: number }> {
  const of = spans.reduce((sum, s) => sum + Math.max(1, s), 0);
  let before = 0;
  return spans.map((s) => {
    const span = Math.max(1, s);
    const at = { first: before + 1, n: before + span, of };
    before += span;
    return at;
  });
}
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
      <p className="ch-prt-card__deck ch-num">{[time, place].filter(Boolean).join(' · ')}</p>
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
                      <span className="ch-num">{plural(s.points, 'point')}</span>
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

function PrintPages({ pages, qr, numbers }: { pages: PrintPage[]; qr: string | null; numbers: ReadonlyArray<{ n: number; of: number }> }) {
  return (
    <>
      {pages.map((p, i) => (
        <section key={p.key} className={pageClass(p)}>
          {p.node({ n: numbers[i]?.n ?? i + 1, of: numbers[i]?.of ?? pages.length, qr })}
        </section>
      ))}
    </>
  );
}

/**
 * One piece on screen: laid out at its real paper size, inside the print's own margin, and scaled to the column, so it looks as it will print. It is measured against a real sheet of US Letter:
 * a piece longer than one sheet says how many it takes and shows where each break falls (above a row, never through one), so the count is the printer's count.
 */
function Sheet({ page, at, qr, onSpan }: { page: PrintPage; at: { first: number; n: number; of: number }; qr: string | null; onSpan: (key: string, sheets: number) => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const paper = PAPER;
  const sheet = LETTER_CONTENT;
  const [scale, setScale] = useState<number | null>(null);
  const [tall, setTall] = useState(paper.h);
  const [cuts, setCuts] = useState<number[]>([]);
  const [padTop, setPadTop] = useState(0);
  const inner = useRef<HTMLDivElement>(null);
  const key = page.key;
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => {
      // Hidden (the page is being printed, and the studio is not part of the print): nothing to measure, and the last count stands.
      if (!el.clientWidth) return;
      const k = Math.min(1, el.clientWidth / paper.w);
      setScale(k);
      setTall(Math.max(paper.h, inner.current?.offsetHeight ?? paper.h));
      // The content box is the sheet's printable area: the same width the printer gives it, so the same lines and the same heights.
      const section = inner.current?.querySelector<HTMLElement>('.ch-prt-page');
      if (!section) return;
      // The paper on screen is stretched to a whole sheet, which pins the footer to its foot and grows the range board to fill it. What decides the sheet count
      // is the piece's own height, so it is measured unstretched and put back before anything is painted.
      const stretched = section.style.minHeight;
      section.style.minHeight = '0px';
      const box = section.getBoundingClientRect();
      const cs = getComputedStyle(section);
      const pad = parseFloat(cs.paddingTop) || 0;
      const top = box.top + pad * k;
      const body = Math.max(0, section.scrollHeight - pad - (parseFloat(cs.paddingBottom) || 0));
      const blocks = k > 0 ? [...section.querySelectorAll<HTMLElement>(KEEP_WHOLE)].map((b) => { const r = b.getBoundingClientRect(); return [(r.top - top) / k, (r.bottom - top) / k] as const; }) : [];
      section.style.minHeight = stretched;
      const next = pageCuts(body, sheet.h, blocks);
      setPadTop(pad);
      setCuts((prev) => (prev.length === next.length && prev.every((c, i) => Math.abs(c - next[i]!) < 1) ? prev : next));
      onSpan(key, next.length + 1);
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
    // `onSpan` is the parent's stable setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper.w, paper.h, sheet.h, key]);
  const k = scale ?? 1;
  return (
    <figure className="ch-prt-sheet">
      <div ref={frame} className="ch-prt-frame" style={{ maxWidth: paper.w, height: scale === null ? undefined : tall * k, aspectRatio: scale === null ? `${paper.w} / ${paper.h}` : undefined }}>
        <div ref={inner} className="ch-prt-paper" data-ui="clubhouse" data-ready={scale === null ? undefined : ''} style={{ width: paper.w, minHeight: paper.h, transform: `scale(${k})` }}>
          <section className={pageClass(page)}>{page.node({ n: at.n, of: at.of, qr })}</section>
        </div>
        {cuts.map((cut, i) => (
          <span key={i} className="ch-prt-cut ch-num" style={{ top: (cut + padTop) * k }} data-ch="print-cut">
            Sheet {at.first + i + 1} starts here
          </span>
        ))}
      </div>
      <figcaption className="ch-num">
        {page.part} · {cuts.length ? `Pages ${at.first} to ${at.n}` : `Page ${at.n}`} of {at.of}
      </figcaption>
    </figure>
  );
}

// No sheet counts here: the count line under the switches is measured, and a long plan's coach copy is more than two.
const OPTION_WORDS: Record<PartKey, string> = {
  coach: 'Schedule, then drills, what to bring and notes',
  board: 'Rotation only, readable at ten feet',
  cards: 'One per group, two to a sheet',
  drills: 'Set-ups and scoring, two columns',
};
const OPTION_NAMES: Record<PartKey, string> = { coach: 'Coach copy', board: 'Range board', cards: 'Pocket cards', drills: 'Drills appendix' };

/** What Print will send, said before the press: the sheet count, then each piece's share ("5 sheets · Coach copy 2 · Drills appendix 3"). */
export function printSummary(pages: ReadonlyArray<{ part: string; sheets?: number }>): string {
  if (pages.length === 0) return 'Nothing to print yet';
  const by = new Map<string, number>();
  for (const p of pages) by.set(p.part, (by.get(p.part) ?? 0) + Math.max(1, p.sheets ?? 1));
  const total = plural([...by.values()].reduce((sum, n) => sum + n, 0), 'sheet');
  return by.size === 1 ? `${total} · ${[...by.keys()][0]}` : `${total} · ${[...by].map(([part, n]) => `${part} ${n}`).join(' · ')}`;
}

/** Print studio (N-00 4.14): pick the pieces, see them as paper, print. Save as PDF is the print dialog's. */
export function PrintStudio({ plan, drills, planHref, draft = false, drillsUnread = false, startWith }: { /** A preview's switches, in place of taps. */ startWith?: Partial<Record<PartKey, boolean>>; plan: PlanSheetModel; drills: PrintDrill[]; planHref: string; draft?: boolean; /** The drills read failed: the appendix and the coach copy's drill list are missing, which is not the same as a plan with no drills. */ drillsUnread?: boolean }) {
  const phone = useChPhone();
  const router = useRouter();
  const hasRotation = plan.rows.some((r) => r.rotation);
  const [parts, setParts] = useState<Parts>({ coach: true, board: hasRotation, cards: false, drills: false, ...startWith });
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const qr = useMemo(() => (origin ? qrSvg(`${origin}${planHref}`) : null), [origin, planHref]);
  const pages = useMemo(() => buildPages(plan, drills, parts, draft), [plan, drills, parts, draft]);
  const offered: PartKey[] = ['coach', ...(hasRotation ? (['board'] as const) : []), ...(plan.groups.length > 0 ? (['cards'] as const) : []), ...(drills.length > 0 ? (['drills'] as const) : [])];
  // How many sheets each piece really takes, measured on the paper below against US Letter. Until a piece is measured it counts as one.
  const [spans, setSpans] = useState<Record<string, number>>({});
  const onSpan = useCallback((key: string, sheets: number) => setSpans((prev) => (prev[key] === sheets ? prev : { ...prev, [key]: sheets })), []);
  const numbers = useMemo(() => sheetNumbers(pages.map((p) => spans[p.key] ?? 1)), [pages, spans]);
  const counted = pages.map((p) => ({ part: p.part, sheets: spans[p.key] ?? 1 }));
  const print = () => void printNode(<PrintPages pages={pages} qr={qr} numbers={numbers} />);
  const appendix = counted.filter((p) => p.part === OPTION_NAMES.drills).reduce((sum, p) => sum + p.sheets, 0);
  const spilled = counted.filter((p) => p.sheets > 1).map((p) => p.part).filter((part, i, all) => all.indexOf(part) === i);
  return (
    <main className={'ch-page ch-prc ch-prt' + (phone ? ' is-phone' : '')} data-ch="practice" aria-labelledby="ch-prc-title">
      {phone && <PhoneTop title="Print" back={{ label: 'Plan', onBack: () => router.push(planHref) }} action={pages.length > 0 ? <PhoneIconAction icon={Printer} label="Print" onClick={print} /> : undefined} />}
      <header className="ch-prc-h">
        <LargeTitle id="ch-prc-title">Print</LargeTitle>
        {!phone && (
          <div className="ch-prc-h__a">
            <Button variant="primary" disabled={pages.length === 0} onClick={print}>
              Print
            </Button>
          </div>
        )}
      </header>
      <div className="ch-prt-layout">
        <aside className="ch-prt-side">
          {drillsUnread && <InlineNotice title="This plan’s drills didn’t load" body="The coach copy prints without its drill list and there is no drills appendix. The rest of the plan is whole." onRetry={() => router.refresh()} />}
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
          <p className="ch-prt-count ch-num" role="status" data-ch="print-count">
            {/* A piece keeps its count, and each separator the piece before it: "Range board" never ends a line with its "1" under it. The words are the same. */}
            <b className="ch-num">
              {printSummary(counted)
                .split(' · ')
                .map((piece, i, all) => (
                  <Fragment key={piece}>
                    <span className="ch-nowrap">{i < all.length - 1 ? `${piece} ·` : piece}</span>
                    {i < all.length - 1 ? ' ' : null}
                  </Fragment>
                ))}
            </b>
            {spilled.length > 0 && <span>{spilled.join(' and ')} {spilled.length === 1 ? 'runs' : 'run'} past one sheet. Each break falls between rows, shown on the paper.</span>}
            {appendix > 2 && <span>The drills appendix alone is {appendix} sheets.</span>}
            {draft && <span>Every sheet says Draft.</span>}
          </p>
          <p className="ch-prt-note">Choose Save as PDF in the print dialog to keep a copy.</p>
        </aside>
        <div className="ch-prt-pages">
          {pages.length === 0 ? (
            <p className="ch-prt-none">Turn on a page to print it.</p>
          ) : (
            pages.map((p, i) => <Sheet key={p.key} page={p} at={numbers[i] ?? { first: i + 1, n: i + 1, of: pages.length }} qr={qr} onSpan={onSpan} />)
          )}
        </div>
      </div>
    </main>
  );
}
