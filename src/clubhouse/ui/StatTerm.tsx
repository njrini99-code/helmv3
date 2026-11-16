'use client';

import { BookOpen } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '../lib/haptics';
import { COUNTING_RULE, STAT_DEFINITIONS, STAT_ORDER, statDefinition, type ChStatDefinition } from '../lib/stat-definitions';
import { Icon } from './Icon';
import { Modal } from './Modal';
import '../styles/stat-terms.css';

const GAP = 8;
const EDGE = 12;

/**
 * A stat's name that opens its definition (F-07). The name itself is the control, drawn with a dotted underline, so a figure gains no
 * icon and no width: tap or click it (or Enter from the keyboard) and a card under it says what the stat measures, how Clubhouse counts
 * it and which way is better, with a link to the whole rule ("How stats are counted"). Tap again, Escape, a tap outside or a scroll
 * closes it. A label that names no stat (`statDefinition` returns null) is drawn as plain text, so a caller can wrap every label.
 *
 * The card is portalled to `.ch-root` in fixed position, so a figure cell that clips its overflow (the team tape, a phone tile) never
 * cuts it, and it stays on screen at 390px.
 */
export function StatTerm({ label, sg = false, children, className }: { label: string; /** The label sits under strokes gained ("Putting" is SG putting). */ sg?: boolean; children?: ReactNode; className?: string }) {
  const def = statDefinition(label, { sg });
  const [open, setOpen] = useState(false);
  const [rule, setRule] = useState(false);
  // The sheet mounts the first time it is asked for and stays, so it can animate out; a page of figures carries no closed dialogs.
  const [ruleUsed, setRuleUsed] = useState(false);
  const btn = useRef<HTMLButtonElement | null>(null);
  const id = useId();
  if (!def) return <span className={className}>{children ?? label}</span>;
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={['ch-term', open ? 'is-open' : '', className].filter(Boolean).join(' ')}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        onClick={(e) => {
          // A label inside a link or a row that opens something keeps that tap for itself.
          e.preventDefault();
          e.stopPropagation();
          haptic('select');
          setOpen((v) => !v);
        }}
      >
        {children ?? label}
      </button>
      {open && btn.current && (
        <TermCard
          id={id}
          anchor={btn.current}
          def={def}
          onClose={(refocus) => {
            setOpen(false);
            if (refocus) btn.current?.focus();
          }}
          onRule={() => {
            // The card (and its focused link) unmounts here, so hand focus to the stat's name first: the sheet takes it as the
            // opener and returns focus there when it closes.
            btn.current?.focus();
            setOpen(false);
            setRuleUsed(true);
            setRule(true);
          }}
        />
      )}
      {ruleUsed && <HowStatsCount open={rule} onClose={() => setRule(false)} />}
    </>
  );
}

function TermCard({ id, anchor, def, onClose, onRule }: { id: string; anchor: HTMLElement; def: ChStatDefinition; onClose: (refocus: boolean) => void; onRule: () => void }) {
  const card = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(EDGE, Math.min(r.left, window.innerWidth - w - EDGE));
    const below = r.bottom + GAP;
    const top = below + h + EDGE > window.innerHeight ? Math.max(EDGE, r.top - GAP - h) : below;
    setPos({ left, top });
  }, [anchor, def]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose(true);
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!card.current?.contains(t) && !anchor.contains(t)) onClose(false);
    };
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && card.current?.contains(e.target)) return;
      onClose(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [anchor, onClose]);

  const host = anchor.closest('dialog[open]') ?? document.querySelector('.ch-root') ?? document.body;
  return createPortal(
    <div ref={card} id={id} role="dialog" aria-label={`${def.name}: what it means`} className="ch-popover ch-term-card" data-ui="clubhouse" style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0 }}>
      <p className="ch-term-card__name">{def.name}</p>
      <p className="ch-term-card__means">{def.means}</p>
      <p className="ch-term-card__counted">{def.counted}</p>
      <p className="ch-term-card__better">{def.better === 'higher' ? 'Higher is better.' : 'Lower is better.'}</p>
      <button type="button" className="ch-term-card__rule" onClick={onRule}>
        How stats are counted
      </button>
    </div>,
    host,
  );
}

/**
 * The whole rule in one sheet (F-07): which rounds count, how a nine-hole or unfinished round is read, then every stat's definition in
 * the order a round is played. Opened from any stat's card and from the Stats pages' "How stats are counted" link.
 */
export function HowStatsCount({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="How stats are counted" description="The rounds every figure reads, and what each stat means." width={600} detent={0.9} className="ch-howc">
      <section className="ch-howc__part" aria-labelledby="ch-howc-rounds">
        <h3 id="ch-howc-rounds" className="ch-howc__h">
          Which rounds count
        </h3>
        <dl className="ch-howc__list">
          {COUNTING_RULE.map((l) => (
            <div key={l.id} className="ch-howc__row" data-rule={l.id}>
              <dt>{l.title}</dt>
              <dd>{l.body}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="ch-howc__part" aria-labelledby="ch-howc-stats">
        <h3 id="ch-howc-stats" className="ch-howc__h">
          What each stat means
        </h3>
        <dl className="ch-howc__list">
          {STAT_ORDER.map((k) => {
            const d = STAT_DEFINITIONS[k];
            return (
              <div key={k} className="ch-howc__row" data-stat={k}>
                <dt>{d.name}</dt>
                <dd>
                  {d.means} {d.counted} {d.better === 'higher' ? 'Higher is better.' : 'Lower is better.'}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>
    </Modal>
  );
}

/** The Stats pages' way in to the rule: a quiet text button for a hero's line or a page's foot. */
export function HowStatsCountLink({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={['ch-howc-link', className].filter(Boolean).join(' ')}
        aria-haspopup="dialog"
        onClick={() => {
          haptic('select');
          setOpen(true);
        }}
      >
        <Icon icon={BookOpen} size={14} />
        How stats are counted
      </button>
      <HowStatsCount open={open} onClose={() => setOpen(false)} />
    </>
  );
}
