'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CH_FADE_MS } from '../../../lib/motion';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { changeTone } from '../../../lib/format';
import { STATIONS, type ChStation, type ChTeamBoardData } from '../../../data/coachhelm-team-shape';
import { stationRadius, type HoleGeometry } from './hole-geometry';
import { FLIGHT_MS, holeFlight, LAND_FADE_MS, LAND_HOLD_MS, RIPPLE_MS, TRAIL } from './hole-flight';

const EASE = 'cubic-bezier(.22,1,.36,1)';
const FLOWN = 'ch:team:htb-flown';
/** How much of the hole must be on screen before the ball leaves. */
const IN_VIEW = 0.85;
/** The ball, r 4.2 in the drawing. */
const BALL = 8.4;

function flown(): boolean {
  try {
    return window.sessionStorage.getItem(FLOWN) === '1';
  } catch {
    return false;
  }
}
function markFlown(): void {
  try {
    window.sessionStorage.setItem(FLOWN, '1');
  } catch {
    // Storage blocked: it flies again on the next visit, no worse.
  }
}

const toneOf = (v: number | null): string => {
  const t = changeTone(v, false);
  return !t ? ' is-even' : t === 'is-gain' ? ' is-gain' : '';
};

/**
 * What moves on the hole, kept off the drawing: a layer of plain boxes over the SVG, so every frame is a transform or an opacity
 * on its own compositor layer and the SVG is never repainted (WebKit doesn't composite SVG children).
 *
 * The arrival (M-TEAM-01 to 04), once a session, when the hole is on screen: the ball flies tee to green on the hole's own line with a short trail, each station
 * rings once as the ball passes, and the ball rests on the flag and fades. The hole under it is already complete; nothing waits on it.
 * It never takes a tap (the layer has no pointer events): choosing a station mid-flight, a resize, or the tab going away fades it out
 * where it is. Reduce Motion and Animations off: it is never drawn.
 *
 * The selected station's pulse (M-TEAM-06): one ring, scale 1 to 1.7 over 2.4s, twice, only once the coach has chosen a station.
 */
export function HoleMotion({
  hole,
  stations,
  station,
  arrive,
  picks,
}: {
  hole: HoleGeometry;
  stations: ChTeamBoardData['stations'];
  station: ChStation | 'course';
  arrive: boolean;
  /** How many times the coach has chosen a station here. A station restored from the last visit is not a choice. */
  picks: number;
}) {
  const reduced = useChReducedMotion();
  const box = useRef<HTMLDivElement | null>(null);
  const [flying, setFlying] = useState(false);
  const flight = useMemo(() => holeFlight(hole), [hole]);

  // The first selection is the page's own; the pulse is the answer to a choice.
  const chosen = picks > 0;

  useEffect(() => {
    const el = box.current;
    if (!arrive || reduced || !el || flown()) return;
    let live = true;
    let timer = 0;
    let seen: IntersectionObserver | null = null;
    const start = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!live || document.visibilityState === 'hidden') return;
        seen?.disconnect();
        markFlown();
        setFlying(true);
      }, 250);
    };
    // Type in the hole is the last thing to settle; the ball leaves a beat after it, and only with the hole on screen: on a phone
    // the hole starts below the fold, and a moment nobody saw is not a moment.
    void (document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (!live) return;
      if (typeof IntersectionObserver === 'undefined') return start();
      seen = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.intersectionRatio >= IN_VIEW)) start();
          else window.clearTimeout(timer);
        },
        { threshold: IN_VIEW },
      );
      seen.observe(el);
    });
    return () => {
      live = false;
      seen?.disconnect();
      window.clearTimeout(timer);
    };
  }, [arrive, reduced]);

  const stop = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!flying || !el) return;
    if (typeof el.animate !== 'function') {
      setFlying(false);
      return;
    }
    const { width, height } = el.getBoundingClientRect();
    const frames = flight.frames.map((f) => ({ offset: f.offset, transform: `translate3d(${(f.x * width).toFixed(2)}px, ${(f.y * height).toFixed(2)}px, 0)` }));
    const total = FLIGHT_MS + LAND_HOLD_MS + LAND_FADE_MS;
    const all: Animation[] = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setFlying(false);
    };
    el.querySelectorAll<HTMLElement>('[data-fly]').forEach((dot) => {
      const i = Number(dot.dataset.fly);
      const trail = i > 0 ? TRAIL[i - 1]! : null;
      const delay = trail?.lagMs ?? 0;
      all.push(dot.animate(frames, { duration: FLIGHT_MS, delay, easing: 'linear', fill: 'both' }));
      const mark = dot.firstElementChild as HTMLElement | null;
      if (!mark) return;
      if (trail) {
        // The trail closes up as the ball slows and is gone as it lands.
        all.push(mark.animate([{ opacity: 0 }, { opacity: trail.opacity, offset: 0.08 }, { opacity: trail.opacity, offset: 0.8 }, { opacity: 0 }], { duration: FLIGHT_MS, delay, easing: 'linear', fill: 'both' }));
      } else {
        const ball = mark.animate([{ opacity: 0 }, { opacity: 1, offset: 120 / total }, { opacity: 1, offset: (FLIGHT_MS + LAND_HOLD_MS) / total }, { opacity: 0 }], { duration: total, easing: 'linear', fill: 'both' });
        ball.onfinish = finish;
        all.push(ball);
      }
    });
    el.querySelectorAll<HTMLElement>('[data-ripple]').forEach((ring) => {
      const at = flight.passMs[ring.dataset.ripple as ChStation] ?? 0;
      all.push(ring.animate([{ opacity: 0.7, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.7)' }], { duration: RIPPLE_MS, delay: at, easing: EASE, fill: 'both' }));
    });
    // Interrupted: what is in the air fades where it is, on the Reduce Motion beat, and the layer goes.
    const fade = () => {
      if (done) return;
      const out = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CH_FADE_MS, easing: 'linear', fill: 'forwards' });
      out.onfinish = finish;
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') finish();
    };
    stop.current = fade;
    window.addEventListener('resize', fade);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      stop.current = null;
      window.removeEventListener('resize', fade);
      document.removeEventListener('visibilitychange', hidden);
      all.forEach((a) => a.cancel());
    };
  }, [flying, flight]);
  // A station chosen mid-flight has the coach's eye: the ball gives way.
  useEffect(() => {
    if (picks > 0) stop.current?.();
  }, [picks]);

  const at = (s: ChStation) => {
    const t = hole.st[s];
    const r = stationRadius(stations[s].team);
    return { left: `${(t.x / hole.w) * 100}%`, top: `${(t.y / hole.h) * 100}%`, width: `${((2 * r) / hole.w) * 100}%` };
  };
  const pulse = !reduced && chosen && !flying && station !== 'course' && stations[station].team != null ? station : null;
  if (!flying && !pulse) return <div ref={box} className="holefx" aria-hidden="true" />;
  return (
    <div ref={box} className="holefx" aria-hidden="true" data-ch-team-fly={flying ? '' : undefined}>
      {pulse && <i key={pulse} className={'holefx__ring is-pulse' + toneOf(stations[pulse].team)} style={at(pulse)} />}
      {flying &&
        STATIONS.filter((s) => stations[s].team != null).map((s) => <i key={s} data-ripple={s} className={'holefx__ring' + toneOf(stations[s].team)} style={at(s)} />)}
      {flying &&
        [...TRAIL.map((_, i) => TRAIL.length - i), 0].map((i) => (
          <span key={i} data-fly={i} className="holefx__fly">
            <i className="holefx__ball" style={{ width: `${(BALL / hole.w) * 100}%`, ['--ch-fly-scale' as string]: i > 0 ? TRAIL[i - 1]!.scale : 1 }} />
          </span>
        ))}
    </div>
  );
}
