'use client';

import Link from 'next/link';
import { m } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { avgToPar, shortDate, type ChCourseHole } from '../../data/course-page-shape';
import { haptic, hapticScrub } from '../../lib/haptics';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { useSlidePlate } from '../../lib/slide-plate';
import { formatFixed, formatToPar } from '../../lib/format';
import { plural } from '../../lib/plural';
import { Icon } from '../../ui/Icon';
import { ScoreMark } from '../../ui/ScoreMark';
import { Segmented } from '../../ui/Segmented';
import { FadeNum, useFadeOnChange } from './course-motion';

/**
 * P-7 4.2.4: the course hole by hole. A map of 18 tiles, Out over In, tinted by the player's average to par there (D-42:
 * the red family under par, amber over, plain level, and level whenever the average is inside its noise), with a detail
 * panel for the picked hole; or the same as a list. With a keyboard the map is a radio group (arrows a hole, up and down
 * a nine, Home and End the ends). A tile takes colour only from five plays; from two to four it is an early read on the
 * level fill.
 *
 * Phone: the map's tap size is owner call 2, open (nine 44 px tiles can't fit across a phone). Until Nick picks, a phone
 * shows the List only (`.ch-hmap-sec` in rounds.css); the map and its switch show from 600 px. Where the map shows, it
 * shows only while a tile fits its widest figure ("+8.8": 2.07 em + 4 px), decided in CSS by a container query so nothing
 * swaps after paint, and mirrored to the switch by a ResizeObserver.
 */

const spoken = (v: number) => (Math.abs(v) < 0.05 ? 'level' : `${v > 0 ? 'plus' : 'minus'} ${formatFixed(Math.abs(v), 1)}`);
/** "+0.8", "−0.3", or "E" when it rounds to 0.0. */
export const avgWords = avgToPar;

/** The hole to work on: the highest average over par among the tinted holes; null when none is tinted over. */
export function mostToGain(holes: readonly ChCourseHole[]): number | null {
  const over = holes.filter((h) => (h.stats.tint === 'o1' || h.stats.tint === 'o2') && h.stats.avg != null);
  if (!over.length) return null;
  return over.reduce((a, h) => ((h.stats.avg as number) > (a.stats.avg as number) ? h : a)).n;
}

/** What a tile says to VoiceOver: "Hole 14, par 4, plus 0.8 average over 6 rounds, most to gain". */
export function tileLabel(h: ChCourseHole, gain: boolean): string {
  const s = h.stats;
  const par = h.par != null ? `, par ${h.par}` : '';
  if (s.n === 0) return `Hole ${h.n}, not played here`;
  if (s.n === 1) return `Hole ${h.n}${par}, played once, ${spoken(s.avg as number).replace('level', 'level par')}`;
  if (s.state === 'early') return `Hole ${h.n}${par}, early read, ${spoken(s.avg as number)} average over ${s.n} rounds`;
  const level = s.tint === 'l' ? ', about level' : '';
  return `Hole ${h.n}${par}${level}, ${spoken(s.avg as number)} average over ${s.n} rounds${gain ? ', most to gain' : ''}`;
}

/** The facts under the detail, each only past its floor: "Fairway 3 of 5 · Green 2 of 6 · 1.8 putts". */
export function holeFacts(h: ChCourseHole): string | null {
  const s = h.stats;
  const out: string[] = [];
  if (s.fairways[1] >= 2) out.push(`Fairway ${s.fairways[0]} of ${s.fairways[1]}`);
  if (s.greens[1] >= 2) out.push(`Green ${s.greens[0]} of ${s.greens[1]}`);
  if (s.putts != null) out.push(`${formatFixed(s.putts, 1)} putts`);
  return out.length ? out.join(' · ') : null;
}

/** "Out · +1.4": the nine's sum of hole averages, only when every hole of it passes the show floor. */
function nineCaption(holes: readonly ChCourseHole[], label: string): string {
  if (holes.length && holes.every((h) => h.stats.n >= 2 && h.stats.avg != null)) {
    return `${label} · ${avgWords(holes.reduce((a, h) => a + (h.stats.avg as number), 0))}`;
  }
  return label;
}

const PILLS_MAX = 8;

/** The width nine tiles need, per the widest figure a tile holds ("+8.8" is 2.07 em) plus its 4 px of padding, and the gaps. */
export function mapFits(width: number, fontPx: number, gapPx = 4): boolean {
  return width >= 9 * (2.07 * fontPx + 4) + 8 * gapPx;
}

export function HoleMap({ holes, selected, onSelect, coverage, sample }: { holes: ChCourseHole[]; selected: number; onSelect: (n: number) => void; coverage: string | null; sample: number }) {
  const [view, setView] = useState<'map' | 'list'>('map');
  const [fits, setFits] = useState(true);
  const [allPlays, setAllPlays] = useState(false);
  // M4: the views fade once the reader has switched them (CSS, [data-swapped]); never on first paint.
  const [swapped, setSwapped] = useState(false);
  // M3: the hole a scrub began on. While a finger scrubs, the detail panel keeps its fade key, so it updates in place and fades once on release (M2).
  const [scrubFrom, setScrubFrom] = useState<number | null>(null);
  const reduced = useChReducedMotion();
  const group = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const scrub = useRef<{ active: boolean; last: number; at: number }>({
    active: false,
    last: 0,
    at: 0,
  });
  const gain = mostToGain(holes);
  const hole = holes.find((h) => h.n === selected) ?? holes[0]!;
  // M1: the 2 px selection ring settles from the tile it left to the one picked, on the compositor (lib/slide-plate.ts, which replaced layoutId here and elsewhere).
  useSlidePlate(group, '[data-hole][aria-checked="true"] > .ch-hmap-sel', selected, { reduced, still: () => !group.current?.offsetWidth });
  const panelFade = useFadeOnChange(scrubFrom ?? hole.n, reduced);

  // The CSS container query decides the first paint; this mirrors it to the switch as the width or the text size changes.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const font = parseFloat(getComputedStyle(el).fontSize) || 16;
      setFits(mapFits(el.clientWidth, font));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => setAllPlays(false), [selected]);

  const pick = (n: number) => {
    if (n !== selected) onSelect(n);
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = selected - 1;
    const to =
      e.key === 'ArrowRight'
        ? (i + 1) % 18
        : e.key === 'ArrowLeft'
          ? (i + 17) % 18
          : e.key === 'ArrowDown'
            ? (i + 9) % 18
            : e.key === 'ArrowUp'
              ? (i + 9) % 18
              : e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? 17
                  : null;
    if (to == null) return;
    e.preventDefault();
    pick(to + 1);
    group.current?.querySelector<HTMLElement>(`[data-hole="${to + 1}"]`)?.focus();
  };
  // The scrub: the nearest tile under the finger; a step haptic each new hole, at most every 40 ms.
  const nearest = (e: PointerEvent<HTMLDivElement>): number | null => {
    const tiles = group.current?.querySelectorAll<HTMLElement>('[data-hole]');
    if (!tiles?.length) return null;
    let best: { n: number; d: number } | null = null;
    for (const t of tiles) {
      const r = t.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      if (!best || d < best.d) best = { n: Number(t.dataset.hole), d };
    }
    return best?.n ?? null;
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') return;
    const n = nearest(e);
    if (n == null) return;
    scrub.current = { active: true, last: n, at: e.timeStamp };
    setScrubFrom(selected);
    hapticScrub('start');
    pick(n);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!scrub.current.active) return;
    const n = nearest(e);
    if (n == null || n === scrub.current.last) return;
    scrub.current.last = n;
    if (e.timeStamp - scrub.current.at >= 40) {
      scrub.current.at = e.timeStamp;
      hapticScrub('step');
    }
    pick(n);
  };
  const onUp = () => {
    if (!scrub.current.active) return;
    scrub.current.active = false;
    setScrubFrom(null);
    hapticScrub('end');
  };
  const step = (d: 1 | -1) => {
    haptic('select');
    pick(((selected - 1 + d + 18) % 18) + 1);
  };

  const tile = (h: ChCourseHole) => {
    const s = h.stats;
    const on = h.n === selected;
    return (
      <button
        key={h.n}
        type="button"
        role="radio"
        aria-checked={on}
        tabIndex={on ? 0 : -1}
        data-hole={h.n}
        className={`ch-hmap-t is-${s.tint}` + (on ? ' is-sel' : '') + (s.n === 0 ? ' is-none' : s.n === 1 ? ' is-once' : '') + (gain === h.n ? ' is-gain' : '')}
        aria-label={tileLabel(h, gain === h.n)}
        onKeyDown={onKey}
        onClick={(e) => {
          // A finger has already picked it on the way down (the scrub); a click from a mouse or the keyboard picks it here.
          if (e.detail === 0 || !scrub.current.last || scrub.current.last !== h.n) pick(h.n);
        }}
      >
        <span className="ch-hmap-t__n ch-num">{h.n}</span>
        <b>
          <FadeNum className="ch-num" text={s.n === 0 ? '–' : s.n === 1 ? formatToPar(s.avg as number) : avgWords(s.avg as number)} />
        </b>
        <span className="ch-hmap-t__p ch-num">{h.par != null ? `P${h.par}` : ''}</span>
        {on && <span className="ch-hmap-sel" aria-hidden="true" />}
      </button>
    );
  };

  const plays = hole.plays.slice(0, allPlays ? undefined : PILLS_MAX);
  const facts = holeFacts(hole);
  const reviewAt = (roundId: string) => `/golf/dashboard/rounds/${roundId}?hole=${hole.n}`;

  return (
    <section ref={root} className="ch-ch-sec ch-hmap-sec" data-view={fits ? view : 'list'} data-swapped={swapped ? '' : undefined} aria-labelledby="ch-hmap-h">
      <div className="ch-ch-sec__h">
        <h2 id="ch-hmap-h">Hole by hole</h2>
        <div className="ch-hmap-switch">
          <Segmented
            label="Show the holes as"
            size="sm"
            value={fits ? view : 'list'}
            onChange={(v) => {
              haptic('select');
              setSwapped(true);
              setView(v);
            }}
            options={[
              { value: 'map', label: 'Map' },
              { value: 'list', label: 'List' },
            ]}
          />
        </div>
      </div>
      <p className="ch-ch-sec__note">
        {coverage ?? `From ${plural(sample, 'round')} with hole scores`}
        {holes.some((h) => h.stats.state === 'early') ? ' · Colour shows from 5 plays of a hole' : ''}
      </p>
      {/* Both views render; CSS shows one (data-view, the phone gate, the fit), so the first paint is final. */}
      <div className="ch-hmap-mapv">
        {/* The scrub surface wraps the group: pointer handlers here, the radios' keys on each radio. */}
        <div className="ch-hmap" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div ref={group} role="radiogroup" aria-label="Hole by hole, average to par" aria-controls="ch-hmap-detail">
            <span className="ch-hmap__cap" aria-hidden="true">
              {nineCaption(holes.slice(0, 9), 'Out')}
            </span>
            <div className="ch-hmap__row">{holes.slice(0, 9).map(tile)}</div>
            <span className="ch-hmap__cap" aria-hidden="true">
              {nineCaption(holes.slice(9, 18), 'In')}
            </span>
            <div className="ch-hmap__row">{holes.slice(9, 18).map(tile)}</div>
          </div>
        </div>
        <div className="ch-hmap__steps">
          <button type="button" className="ch-hmap__step" aria-label="Previous hole" onClick={() => step(-1)}>
            <Icon icon={ChevronLeft} size={20} />
          </button>
          <button type="button" className="ch-hmap__step" aria-label="Next hole" onClick={() => step(1)}>
            <Icon icon={ChevronRight} size={20} />
          </button>
        </div>
      </div>
      <div className="ch-hmap-listv">
        <table className="ch-hmap-list">
          <thead>
            <tr>
              <th scope="col">Hole</th>
              <th scope="col">Par</th>
              <th scope="col">Average</th>
              <th scope="col">Best</th>
              <th scope="col">Times</th>
            </tr>
          </thead>
          <tbody className="ch-num">
            {holes.map((h) => (
              <tr key={h.n} className={h.n === selected ? 'is-sel' : undefined} aria-selected={h.n === selected}>
                <th scope="row">
                  <button type="button" className="ch-hmap-list__go" onClick={() => pick(h.n)} aria-label={tileLabel(h, gain === h.n)}>
                    {h.n}
                  </button>
                </th>
                <td className="ch-num">{h.par ?? '–'}</td>
                <td className="ch-num">
                  <i className={`ch-hmap-list__dot is-${h.stats.tint}`} aria-hidden="true" />
                  <FadeNum text={h.stats.n === 0 ? 'Not played' : avgWords(h.stats.avg as number)} />
                </td>
                <td className="ch-num">{h.stats.best == null ? '–' : formatToPar(h.stats.best)}</td>
                <td className="ch-num">{h.stats.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div id="ch-hmap-detail" className="ch-hmap-d">
        <m.div className="ch-hmap-d__c" style={{ opacity: panelFade }}>
          <div className="ch-hmap-d__h">
            <h3>Hole {hole.n}</h3>
            <span className="ch-num">{[hole.par != null ? `par ${hole.par}` : null, hole.yards ? `${hole.yards} yards` : null].filter(Boolean).join(' · ')}</span>
            {gain === hole.n && <span className="ch-hmap-d__tag">Most to gain</span>}
          </div>
          {hole.stats.n === 0 ? (
            <p className="ch-hmap-d__s">Not played here yet.</p>
          ) : (
            <p className="ch-hmap-d__v">
              <b className="ch-num">
                <FadeNum text={hole.stats.n === 1 ? formatToPar(hole.stats.avg as number) : avgWords(hole.stats.avg as number)} scope={hole.n} />
              </b>
              <span>{hole.stats.n === 1 ? 'played once' : hole.stats.state === 'early' ? `Early read · ${hole.stats.n} times` : `average to par · ${hole.stats.n} times`}</span>
            </p>
          )}
          {plays.length > 0 && (
            <div className="ch-hmap-d__plays">
              {plays.map((p) => (
                <Link key={p.roundId} className="ch-hmap-d__pill" href={reviewAt(p.roundId)} aria-label={`${shortDate(p.date)}: ${p.score} on par ${p.par}. Open the round at this hole`}>
                  <ScoreMark score={p.score} par={p.par} size="sm" />
                  <span className="ch-num">{shortDate(p.date)}</span>
                </Link>
              ))}
              {!allPlays && hole.plays.length > PILLS_MAX && (
                <button type="button" className="ch-hmap-d__all" onClick={() => setAllPlays(true)}>
                  All {hole.plays.length}
                </button>
              )}
            </div>
          )}
          {facts && <p className="ch-hmap-d__f">{facts}</p>}
      </m.div>
      </div>
    </section>
  );
}
