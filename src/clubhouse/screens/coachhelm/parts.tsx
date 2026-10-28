'use client';

import { useId, useState, type ReactNode } from 'react';
import { Archive, Check, ChevronDown, ChevronRight, ChevronUp, Flag } from 'lucide-react';
import { ACTIVE_FOCUS_DUPLICATE_ERROR } from '@/lib/coachhelm/focus-areas/duplicate-guard';
import { stanceOf, type ChBoardMissing, type ChHelmAssigned, type ChHelmEvidence, type ChInsight } from '../../data/coachhelm-shape';
import { NARROWING_PREFIX, type ChPathLine } from '../../data/coachhelm-path';
import { haptic } from '../../lib/haptics';
import { normalise, useAction } from '../../lib/use-action';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { SerifText } from '../../ui/SerifText';
import { useToast } from '../../ui/Toast';
import { CorrectionChips, ReadLater } from './Corrections';
import { EngineState, WhyAudit } from './EngineState';
import type { ChCoachHelmWrites } from './writes';
import { LargeTitle } from '../../ui/LargeTitle';

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
                <span className="ch-hl-path__step">{step}</span>
              </span>
            ))}
          </span>
        </p>
      )}
    </div>
  );
}

/** "Tour 0.3": a comparison that ends in its figure, split so the figure sits in the ledger's figure column like the read's own. */
const LEDGER_FIGURE = /^(.+?)\s+([+\u2212]?\d[\d.,]*(?:%| yd| ft)?)$/;

/**
 * A comparison row of the ledger. A label and a figure line up as the first row does (visual pass 2026-10-28: "Tour 0.3" sat
 * as one left-aligned string under "Eli 1.1"); a comparison in other words stays one line. The space between them is kept, so
 * the row still reads "Tour 0.3".
 */
function LedgerLine({ text }: { text: string }) {
  const m = LEDGER_FIGURE.exec(text);
  if (!m) return <li className="ch-num">{text}</li>;
  return (
    <li>
      <span>{m[1]}</span> <span className="ch-num">{m[2]}</span>
    </li>
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
            <LedgerLine text={ev.gauge.cmp} />
            {ev.gauge.sec && <LedgerLine text={ev.gauge.sec} />}
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
  const cx = ins.engine?.corrections;
  // Show later (coachhelm_corrections_v1): the read is held back, its title and when it comes back left in its place.
  const [held, setHeld] = useState<number | null>(cx?.laterRounds ?? null);
  return (
    <article className="ch-hl-focus" aria-labelledby={`${id}-t`}>
      {/* The claim. On the phone it is the screen's one green feature card (the Mobile clubhouse pass, 2026-10-08), and
          the evidence, the drill and the reasoning sit flush under it; on desktop the wrapper draws nothing. */}
      <div className="ch-hl-focus__head">
        <p className="ch-hl-focus__k">{[who, ins.category, eyebrowStance(ins, assigned)].filter(Boolean).join(' · ')}</p>
        <h2 id={`${id}-t`}>
          <SerifText text={ins.title} />
        </h2>
        {held == null && <PathLine path={ins.path} />}
        {held == null && ins.lede && <p className="ch-hl-lede">{ins.lede}</p>}
      </div>
      {held != null ? (
        <ReadLater rounds={held} />
      ) : (
        <>
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
        </>
      )}
      {/* The correction chips, under the audit (03 §7.2), only when the loader put them on the card. */}
      {cx && <CorrectionChips c={cx} held={held} onHeld={setHeld} />}
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
/** `who`: the coach's role line. A player's page has none (wave 7: a player is never told their own role). A coach's view of one
 *  player puts "CoachHelm" there instead, and the player's name as the `title` (spec A). */
/** `below`: one more line under the sentence, inside the header (the coach's "Since you were last here", D4). */
export function Head({ who, title = 'CoachHelm', children, aside, below, phone = false }: { who?: ReactNode; title?: ReactNode; children: ReactNode; aside?: ReactNode; below?: ReactNode; phone?: boolean }) {
  return (
    <header className={'ch-hl-h' + (aside ? ' has-aside' : '')} data-canopy-head="">
      {who && <span className="ch-hl-role">{who}</span>}
      {/* The phone's one large title (owner decision 4: the same 34 semibold sans as every section root, not the desktop's serif). */}
      {phone ? (
        <LargeTitle as="p" id="ch-hl-title" className="ch-hl-h__t">
          {title}
        </LargeTitle>
      ) : (
        <h1 id="ch-hl-title" className="ch-hl-h__t">
          {title}
        </h1>
      )}
      <p>
        {children}
      </p>
      {below}
      {aside && <div className="ch-hl-h__aside">{aside}</div>}
    </header>
  );
}

/** The read a coach acts on, and whose it is: the player's id and first name (the toasts and the action row say it). */
export interface ChFocusTarget {
  playerId: string;
  first: string;
  ins: ChInsight;
}

/**
 * The coach's three writes on a read (Assign as focus, Dismiss, Undo), as the board and a coach's Deep dive of one player both make
 * them (spec A): the same useAction wiring, codes and follow-ups, kept here so the two pages cannot drift. The follow-ups (marking
 * assigned, hiding a dismissed read, restoring it) live inside the action, so a toast's Retry completes them too. CH-13702: Assign is a
 * primary Button, so its tap is the light press; the write's success and error haptics come from useAction.
 *
 * `acting`: the read a write is in flight for (set inside the action, so a Retry sets it too), so only that read's row says
 * "Assigning", "Dismissing" or "Undoing"; every other row's controls wait meanwhile (`busy`), because the one write in flight is the
 * hook's. `assigned` and `dismissed`: what this visit changed, by read id, over what the page loaded.
 */
export function useFocusActions(writes: ChCoachHelmWrites) {
  const toast = useToast();
  const [acting, setActing] = useState<{ insightId: string; kind: 'assign' | 'dismiss' | 'undo' } | null>(null);
  const [assigned, setAssigned] = useState<Record<string, ChHelmAssigned>>({});
  const [dismissed, setDismissed] = useState<Record<string, true>>({});
  const assign = useAction(
    'coachhelm.assign',
    async (t: ChFocusTarget) => {
      const i = t.ins;
      setActing({ insightId: i.id, kind: 'assign' });
      try {
        // The focus area is the player's to read: it is saved with the insight's own wording, not the coach's rewrite of it.
        const res = await writes.assign({ playerId: t.playerId, insightId: i.id, title: i.assignAs.title, description: i.assignAs.description, areaType: i.areaType, targetMetric: i.metric, currentValue: i.current });
        if (normalise(res).success) {
          setAssigned((m) => ({ ...m, [i.id]: 'proposed' }));
          return res;
        }
        // The player already has an active focus on this metric: that is the outcome the coach wanted, not a failure.
        if (res.error === ACTIVE_FOCUS_DUPLICATE_ERROR) {
          setAssigned((m) => ({ ...m, [i.id]: 'active' }));
          toast({ title: `${t.first} already has a focus on this` });
          return { success: true };
        }
        return res;
      } finally {
        setActing(null);
      }
    },
    (t: ChFocusTarget) => ({ done: '', failed: `Couldn’t assign the focus to ${t.first}`, hint: 'Nothing was saved. Try again.', code: 'CH-13001' }),
  );
  const dismiss = useAction(
    'coachhelm.dismiss',
    async (t: ChFocusTarget) => {
      setActing({ insightId: t.ins.id, kind: 'dismiss' });
      try {
        const res = await writes.dismiss(t.ins.id);
        if (normalise(res).success) setDismissed((d) => ({ ...d, [t.ins.id]: true }));
        return res;
      } finally {
        setActing(null);
      }
    },
    { done: '', failed: 'Couldn’t dismiss the insight', hint: 'It’s still on the board. Try again.', code: 'CH-13002' },
  );
  const undo = useAction(
    'coachhelm.undo',
    async (t: ChFocusTarget) => {
      setActing({ insightId: t.ins.id, kind: 'undo' });
      try {
        const res = await writes.undo(t.ins.id, t.ins.lifecycle);
        if (normalise(res).success)
          setDismissed((d) => {
            const { [t.ins.id]: _gone, ...rest } = d;
            return rest;
          });
        return res;
      } finally {
        setActing(null);
      }
    },
    { done: '', failed: 'Couldn’t undo the dismissal', hint: 'It’s still dismissed. Try again.', code: 'CH-13003' },
  );
  const busy = assign.pending || dismiss.pending || undo.pending;
  /** Whether this kind of write is in flight for this read. */
  const here = (kind: 'assign' | 'dismiss' | 'undo', insightId: string | undefined) => acting?.kind === kind && acting.insightId === insightId;
  return { assign, dismiss, undo, busy, here, assigned, dismissed };
}

export type ChFocusActions = ReturnType<typeof useFocusActions>;

/** What could not be checked about this read, in the coach's words. */
export function focusStatusSaid(missing: ChBoardMissing | undefined, who: string): string {
  const said: string[] = [];
  if (missing?.assigned || missing?.declined) said.push(`Whether ${who} already has a focus from this read, or declined one, couldn’t be checked.`);
  if (missing?.newest) said.push('Whether this read is still current couldn’t be checked.');
  return said.join(' ');
}

/**
 * The coach's action row on one read (CoachBoard's card, and each read of a coach's Deep dive of one player): Assign as focus
 * (primary), Dismiss (ghost), and `extra` after them (the board's "All of Jonah's reads", the Deep dive's "Message Jonah"). A read
 * assigned here or already made a focus shows the Assigned chip (CH-13601); a declined one offers Propose again (CH-13907); a read
 * older than the newest round offers no Assign (CH-13906); a read beside it that failed leaves Assign out and says why (CH-13207);
 * a card that states no finding offers nothing (CH-13904). Dismissed, the row is the notice with Undo (CH-13901). `where`: which page
 * the notice names ("your board" on the coach's own board; "the board" on a player's Deep dive).
 */
export function FocusActions({ fa, target, missing, where, extra }: { fa: ChFocusActions; target: ChFocusTarget; missing?: ChBoardMissing; where: 'board' | 'dive'; extra?: ReactNode }) {
  const { ins, first } = target;
  if (fa.dismissed[ins.id]) {
    return (
      <div className="ch-hl-dis" role="status" data-ch-code="CH-13901">
        <Icon icon={Archive} size={16} />
        <span>
          <b>Insight dismissed.</b> It no longer shows on {where === 'board' ? 'your board' : 'the board'} or on {first}’s. Undo brings it back.
        </span>
        <Button size="sm" variant="ghost" busy={fa.here('undo', ins.id)} disabled={fa.busy && !fa.here('undo', ins.id)} onClick={() => void fa.undo.run(target)}>
          {fa.here('undo', ins.id) ? <span data-ch-code="CH-13403">Undoing…</span> : 'Undo'}
        </Button>
      </div>
    );
  }
  if (ins.kind === 'note') {
    // CH-13904: nothing to assign or dismiss on a card that states no finding.
    return (
      <div className="ch-hl-cact">
        <p className="ch-hl-cact__m" data-ch-code="CH-13904">
          This card states no finding, so there is nothing to assign.
        </p>
      </div>
    );
  }
  // Assigned: from this visit, or a focus area the page found already made from the read.
  const mine = fa.assigned[ins.id] ?? ins.assigned;
  // A read older than the newest round is not assigned (it is still dismissed if the coach wants it gone).
  const stale = !!ins.stale;
  // A read beside the cards that failed (CH-13207): whether this read was already assigned, was declined, or is still current is not
  // known, so Assign (and Propose again) are not offered. Dismiss does not depend on any of them and stays.
  const statusUnknown = !mine && !!(missing?.assigned || missing?.declined || missing?.newest);
  return (
    <div className="ch-hl-cact">
      {/* A strength is assignable too, as a keep-doing focus. */}
      {mine ? (
        <span className="ch-hl-done" role="status" data-ch-code="CH-13601">
          <Icon icon={Check} size={15} />
          Assigned as {first}’s focus
        </span>
      ) : statusUnknown ? (
        <RefreshNotice code="CH-13207" title="Assign as focus isn’t offered right now" body={`${focusStatusSaid(missing, first)} Dismiss still works. Try again in a moment.`} />
      ) : stale ? null : (
        <Button variant="primary" leftIcon={Flag} busy={fa.here('assign', ins.id)} disabled={fa.busy && !fa.here('assign', ins.id)} onClick={() => void fa.assign.run(target)}>
          {fa.here('assign', ins.id) ? <span data-ch-code="CH-13403">Assigning…</span> : ins.declined ? 'Propose again' : 'Assign as focus'}
        </Button>
      )}
      <Button
        variant="ghost"
        leftIcon={Archive}
        busy={fa.here('dismiss', ins.id)}
        disabled={fa.busy && !fa.here('dismiss', ins.id)}
        onClick={() => {
          // CH-13703: the warning comes before the write, as before any destructive tap (D-70).
          haptic('warning');
          void fa.dismiss.run(target);
        }}
      >
        {fa.here('dismiss', ins.id) ? <span data-ch-code="CH-13403">Dismissing…</span> : 'Dismiss'}
      </Button>
      {extra}
      {mine === 'proposed' && <p className="ch-hl-cact__m">{first} sees it as a proposal and accepts it to start.</p>}
      {!mine && !stale && !statusUnknown && ins.declined && (
        <p className="ch-hl-cact__m" data-ch-code="CH-13907">
          {first} declined this as a focus. Propose again sends it back as a new proposal.
        </p>
      )}
      {!mine && stale && (
        <p className="ch-hl-cact__m" data-ch-code="CH-13906">
          This read is older than {first}’s newest round, so it can’t be assigned as a focus yet.
        </p>
      )}
    </div>
  );
}
