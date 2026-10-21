'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import { stanceOf, type ChBoardMissing, type ChHelmAssigned, type ChHelmEvidence, type ChInsight } from '../../data/coachhelm-shape';
import { NARROWING_PREFIX, type ChPathLine } from '../../data/coachhelm-path';
import { haptic } from '../../lib/haptics';
import { Icon } from '../../ui/Icon';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { SerifText } from '../../ui/SerifText';
import { EngineState, WhyAudit } from './EngineState';

/**
 * The path line (design call D2): the card's second line, inside the card, in one fixed grammar: what was seen · count of
 * denominator · rounds · firmness word. Words only: no glyph, no percent of confidence. A narrowing the engine stored is drawn as
 * its steps ("175+ yd › long par 4s › short-right"), prefixed "Observed, not a cause:"; none is drawn when none was stored.
 */
export function PathLine({ path }: { path: ChPathLine | null }) {
  if (!path) return null;
  return (
    <div className={'ch-hl-path is-' + path.tier} data-ch-code="CH-13940">
      <p className="ch-hl-path__l ch-num">
        {[path.seen, path.count, path.rounds].filter(Boolean).join(' · ')}
        {' · '}
        <b>{path.firmness}</b>
      </p>
      {path.narrowing && (
        <p className="ch-hl-path__n">
          <span>{NARROWING_PREFIX}</span>
          <span className="ch-hl-path__chips">
            {path.narrowing.map((step, i) => (
              <span key={step} className="ch-hl-path__chip">
                {i > 0 && (
                  <span className="ch-hl-path__sep" aria-hidden="true">
                    ›
                  </span>
                )}
                {step}
              </span>
            ))}
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * The evidence ledger (design call D8): the read's number and its comparison as flush rows with tabular figures, then the sample,
 * the window, the confidence word and the day. `who`: the first name the read's own row is labelled with on a coach's board; the
 * player's own board says You. The slope read keeps its two make rates, each with one thin bar.
 */
export function Evidence({ ev, who }: { ev: ChHelmEvidence; who?: string }) {
  // A note draws none of the number behind it, so there is nothing to put in a ledger.
  if (!ev.label && !ev.bars && !ev.gauge && !ev.sample && !ev.window && !ev.read && !ev.asOf) return null;
  return (
    <div className="ch-hl-ev">
      {ev.label && <span className="ch-hl-ev__l">{ev.label}</span>}
      {ev.bars ? (
        <ul className="ch-hl-bars">
          {ev.bars.map((b) => (
            <li key={b.label}>
              <span>{b.label}</span>
              <span className="ch-hl-bars__t" aria-hidden="true">
                <i className={b.weak ? 'is-weak' : undefined} style={{ width: `${b.pct}%` }} />
              </span>
              <b className="ch-num">{Math.round(b.pct)}%</b>
            </li>
          ))}
        </ul>
      ) : (
        ev.gauge && (
          <ul className="ch-hl-ledger">
            <li>
              <span>{who ?? 'You'}</span>
              <b className="ch-num">{ev.gauge.you}</b>
            </li>
            <li className="ch-num">{ev.gauge.cmp}</li>
            {ev.gauge.sec && <li className="ch-num">{ev.gauge.sec}</li>}
          </ul>
        )
      )}
      {(ev.sample || ev.window || ev.read || ev.asOf) && (
        <div className="ch-hl-ev__f">
          {ev.sample && <span className="ch-num">{ev.sample}</span>}
          {ev.window && <span>{ev.window}</span>}
          {ev.read && <span className="ch-num">{ev.read.word}</span>}
          {ev.asOf && <span data-ch-code="CH-13905">{ev.asOf}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * The one insight the page is about (helm3.jsx `Focus`): the category, the
 * claim, its path line (D2: the card's second line), its first sentence, the
 * evidence ledger, "This week" flush under it and "Why we think this".
 * Re-mounted per insight (key), so each opens with its reasoning closed.
 * CH-13804: the reasoning is a disclosure button that names what it controls.
 * Priority is the By player order, not a badge (D8 cuts the pill): the
 * eyebrow says where the read stands in a word only when that is news
 * (`eyebrowStance`).
 */
export function FocusCard({ ins, who, assigned, defaultOpen = false }: { ins: ChInsight; who?: string; assigned?: ChHelmAssigned | null; defaultOpen?: boolean }) {
  const [why, setWhy] = useState(defaultOpen);
  const id = useId();
  return (
    <article className="ch-hl-focus" aria-labelledby={`${id}-t`}>
      {/* The claim. On the phone it is the screen's one green feature card (the Mobile clubhouse pass, 2026-10-08), and
          the evidence, the drill and the reasoning sit flush under it; on desktop the wrapper draws nothing. */}
      <div className="ch-hl-focus__head">
        <p className="ch-hl-focus__k">{[who, ins.category, eyebrowStance(ins, assigned)].filter(Boolean).join(' · ')}</p>
        <h2 id={`${id}-t`}>
          <SerifText text={ins.title} />
        </h2>
        <PathLine path={ins.path} />
        {ins.lede && <p className="ch-hl-lede">{ins.lede}</p>}
      </div>
      {/* CH-13903: a read from before the newest round is never drawn as current. */}
      {ins.stale && (
        <p className="ch-hl-stale" role="note" data-ch-code="CH-13903">
          A round played {ins.stale.newestRound} isn’t in this read yet, so it may not match the rounds posted since.
        </p>
      )}
      {/* What the engine now knows (each part only with its flag on): how sure, the cause, its status, its focus area's verdict. */}
      <EngineState engine={ins.engine} />
      <Evidence ev={ins.evidence} who={who} />
      {/* This week, flush under the evidence: the second action, not a second card (the drill well is cut). */}
      {ins.week && (
        <div className="ch-hl-week">
          <p className="ch-hl-week__t">
            <span className="ch-hl-week__k">This week</span>
            {ins.week.title && (
              <>
                {' '}
                <b>{ins.week.title}</b>
                {ins.week.meta && <em> · {ins.week.meta}</em>}
              </>
            )}
          </p>
          {ins.week.text && <p>{ins.week.text}</p>}
        </div>
      )}
      {ins.why && (
        <>
          <button type="button" className="ch-hl-why" onClick={() => setWhy((v) => !v)} aria-expanded={why} aria-controls={`${id}-why`}>
            <span>Why we think this</span>
            <Icon icon={why ? ChevronUp : ChevronDown} size={15} />
          </button>
          <p id={`${id}-why`} className="ch-hl-why__b" hidden={!why}>
            {ins.why}
          </p>
        </>
      )}
      <WhyAudit lines={ins.engine?.audit} />
    </article>
  );
}

/**
 * The stance in the eyebrow, as a word and never a pill: Priority for a high finding still open, and Working, Note, Out of date,
 * Assigned or Acknowledged (CH-13806: never colour alone). A medium or low finding says nothing: its place in the order says it.
 */
function eyebrowStance(ins: ChInsight, assigned: ChHelmAssigned | null | undefined): string | null {
  const stance = stanceOf(ins, assigned);
  return stance.cls === 'medium' || stance.cls === 'low' ? null : stance.word;
}

/**
 * One row of "Also worth knowing" or "What’s working" (helm3.jsx `Row`). Choosing it
 * puts it in the focus card (CH-13701: a selection tap). CH-13803: one button
 * named for its category, title, value and priority. CH-13602: on desktop it
 * takes the Ledger row tint on hover (quick) and a deeper tint on press.
 */
export function InsightRow({ ins, onPick }: { ins: ChInsight; onPick: () => void }) {
  const stance = stanceOf(ins);
  return (
    <button
      type="button"
      className="ch-hl-row"
      onClick={() => {
        haptic('select');
        onPick();
      }}
    >
      <span className={'ch-hl-row__d is-' + stance.cls} aria-hidden="true" />
      <span className="ch-hl-row__b">
        <em>{ins.category}</em>
        <b>{ins.title}</b>
        <span className="ch-sr-only">{stance.word}</span>
      </span>
      <span className="ch-hl-row__v ch-num">
        {ins.value}
        {ins.value && ins.valueUnit && (
          <>
            {' '}
            <small>{ins.valueUnit}</small>
          </>
        )}
      </span>
      <Icon icon={ChevronRight} size={15} />
    </button>
  );
}

/**
 * CH-13208: a read beside the cards failed, so they were drawn without it. This says which (the Tour comparison, how current each
 * read is, the drill text, and where the page offers them, which cards already have a focus), so a gap is never read as "none",
 * "not assigned" or "up to date". `focus: false` leaves out the focus status, which the coach's board says at the card (CH-13207).
 */
export function BoardPartial({ missing, what, focus = true }: { missing: ChBoardMissing; what: 'board' | 'page'; focus?: boolean }) {
  const parts: string[] = [];
  if (missing.tour) parts.push('Tour comparison unavailable, so a card may be drawn without it.');
  if (missing.newest) parts.push('Which reads are older than a newer round could not be checked, so a read and the counts may be out of date.');
  if (focus && (missing.assigned || missing.declined)) parts.push('Which reads already have a focus could not be checked.');
  if (missing.drills) parts.push('This week’s drill text is missing.');
  if (parts.length === 0) return null;
  return <RefreshNotice code="CH-13208" title={`Part of this ${what} didn’t load`} body={`${parts.join(' ')} Try again in a moment.`} />;
}

/** The page's title block: the role chip, CoachHelm, one line. CH-13801: the h1 labels the page's main landmark (aria-labelledby), and each section below is a labelled region. */
/** `aside`: the view switch on desktop, set level with the title (the large-title pattern), so the header is one line of
 *  structure instead of a title block over a separate strip. */
/** `phone`: the shell's top bar already carries the page's h1 ("CoachHelm"), so the large title here is the same words set as
 *  text, still labelling the main landmark: one h1 per screen (P013 D8). */
/** `who`: the coach's role line. A player's page has none (wave 7: a player is never told their own role). */
/** `below`: one more line under the sentence, inside the header (the coach's "Since you were last here", D4). */
export function Head({ who, children, aside, below, phone = false }: { who?: 'Coach'; children: ReactNode; aside?: ReactNode; below?: ReactNode; phone?: boolean }) {
  const Title = phone ? 'p' : 'h1';
  return (
    <header className={'ch-hl-h' + (aside ? ' has-aside' : '')} data-canopy-head="">
      {who && <span className="ch-hl-role">{who}</span>}
      <Title id="ch-hl-title" className="ch-hl-h__t">
        CoachHelm
      </Title>
      <p>
        {children}
      </p>
      {below}
      {aside && <div className="ch-hl-h__aside">{aside}</div>}
    </header>
  );
}
