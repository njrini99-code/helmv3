'use client';

import { animate, useMotionValue, useMotionValueEvent } from 'framer-motion';
import { useEffect, useId, useLayoutEffect, useMemo, useRef } from 'react';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { BALL_AT_REST, BALL_TOTAL_MS, ballAt, type BallFrame } from './scene-ball';
import { quantizeHour } from './scene-sky';
import { BirdsLayer, BoughLayer, CloudsLayer, FxLayer, GrainLayer, LandLayer, PineLayer, SkyLayer, StarsLayer, type SceneCrop } from './SceneLayers';

/**
 * Where the camera is. `rest` is the form screen, `push` the welcome's slow
 * move toward the pin, `leave` the hand-off's last push; a number is an
 * explicit zoom (sign-up eases it up as the steps go by).
 */
export type SceneCamera = 'rest' | 'push' | 'leave' | number;

export interface GolfSceneProps {
  /** The viewer's local decimal hour. Quantized here, so a clock tick redraws the sky only every couple of minutes. */
  hour: number;
  crop?: SceneCrop;
  camera?: SceneCamera;
  /** Fly the ball in (the welcome); false hides it. */
  play?: boolean;
  className?: string;
}

/**
 * A user unit of the scene in pixels, and where the camera pivots, for a box the scene's `xMidYMax slice` fills. The
 * desktop camera pivots on the pin; the phone's on the clubhouse, as the design has it.
 */
export function sceneMetrics(width: number, height: number, crop: SceneCrop) {
  const [vx, vw] = crop === 'tall' ? [360, 760] : [0, 1600];
  const [px, py] = crop === 'tall' ? [560, 610] : [1052, 640];
  const vh = 1000;
  const unit = Math.max(width / vw, height / vh);
  const originX = (width - vw * unit) / 2 + (px - vx) * unit;
  const originY = height - vh * unit + py * unit;
  return { unit, originX, originY };
}

const zoomFor = (camera: SceneCamera): string => (camera === 'rest' ? '1' : camera === 'push' ? 'var(--ch-au-push)' : camera === 'leave' ? 'var(--ch-au-leave)' : String(camera));

const applyBall = (ball: SVGCircleElement, shadow: SVGEllipseElement, f: BallFrame) => {
  ball.setAttribute('cx', String(f.x));
  ball.setAttribute('cy', String(f.y));
  ball.setAttribute('r', String(f.r));
  shadow.setAttribute('cx', String(f.shadowX));
  shadow.setAttribute('cy', String(f.shadowY));
  shadow.setAttribute('rx', String(f.r * 1.3));
  shadow.setAttribute('ry', String(f.r * 0.4));
  shadow.style.opacity = f.visible ? String(f.shadowOpacity) : '0';
  ball.style.opacity = f.visible ? '1' : '0';
};

/**
 * The painted clubhouse hole behind sign in, the welcome and sign up.
 *
 * Nothing in it re-renders to animate: the camera is a CSS transform on one
 * wrapper (a GPU layer, `will-change` only while it moves), the loops are CSS
 * and SMIL on their own layers, and the ball is a motion value written straight
 * to two attributes. Loops pause while the tab is hidden, and all of it stops
 * under reduced motion (the ball sits on the green, the flag holds still).
 */
export function GolfScene({ hour, crop = 'wide', camera = 'rest', play = false, className }: GolfSceneProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const reduced = useChReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const cam = useRef<HTMLDivElement>(null);
  const ball = useRef<SVGCircleElement>(null);
  const shadow = useRef<SVGEllipseElement>(null);
  const time = useMotionValue(0);
  const sky = useMemo(() => quantizeHour(hour), [hour]);

  // Where the camera pivots, in pixels, so it pushes toward the pin whatever the box. Measured before paint: the phone's layers are sized from it.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      const m = sceneMetrics(width, height, crop);
      el.style.setProperty('--ch-au-ox', `${m.originX.toFixed(1)}px`);
      el.style.setProperty('--ch-au-oy', `${m.originY.toFixed(1)}px`);
      el.style.setProperty('--ch-au-u', `${m.unit.toFixed(4)}px`);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [crop]);

  // Loops stop when the tab is hidden and, for good, under reduced motion. SMIL (the flag) is paused through the SVG API.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const svgs = () => Array.from(el.querySelectorAll('svg'));
    const sync = () => {
      const stop = reduced || document.visibilityState === 'hidden';
      if (stop) el.setAttribute('data-paused', '');
      else el.removeAttribute('data-paused');
      for (const s of svgs()) (stop ? s.pauseAnimations : s.unpauseAnimations)?.call(s);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [reduced]);

  // `will-change` only while the camera is actually moving.
  useEffect(() => {
    const el = cam.current;
    if (!el) return;
    const on = () => el.setAttribute('data-moving', '');
    const off = () => el.removeAttribute('data-moving');
    el.addEventListener('transitionrun', on);
    el.addEventListener('transitionend', off);
    el.addEventListener('transitioncancel', off);
    return () => {
      el.removeEventListener('transitionrun', on);
      el.removeEventListener('transitionend', off);
      el.removeEventListener('transitioncancel', off);
    };
  }, []);

  useMotionValueEvent(time, 'change', (ms) => {
    if (ball.current && shadow.current) applyBall(ball.current, shadow.current, ballAt(ms));
  });
  useEffect(() => {
    const b = ball.current;
    const s = shadow.current;
    if (!b || !s) return;
    if (!play) {
      applyBall(b, s, { ...BALL_AT_REST, visible: false });
      return;
    }
    if (reduced) {
      applyBall(b, s, BALL_AT_REST);
      return;
    }
    time.set(0);
    applyBall(b, s, ballAt(0));
    const controls = animate(time, BALL_TOTAL_MS, { duration: BALL_TOTAL_MS / 1000, ease: 'linear' });
    return () => controls.stop();
  }, [play, reduced, time]);

  // The scene always draws at rest first and moves the camera a couple of frames later, straight on the element (no render),
  // so the CSS transition has something to start from even when this chunk arrives after the screen asked for the push.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        el.setAttribute('data-camera', typeof camera === 'number' ? 'zoom' : camera);
        el.style.setProperty('--ch-au-zoom', zoomFor(camera));
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [camera]);

  return (
    <div ref={root} className={['ch-au-scene', className].filter(Boolean).join(' ')} data-crop={crop} data-camera="rest" data-motion={reduced ? 'reduced' : undefined} aria-hidden="true">
      <div ref={cam} className="ch-au-cam">
        <SkyLayer hour={sky} crop={crop} uid={uid} />
        <StarsLayer hour={sky} crop={crop} uid={uid} />
        <CloudsLayer hour={sky} crop={crop} uid={uid} />
        <BirdsLayer hour={sky} crop={crop} uid={uid} />
        <LandLayer hour={sky} crop={crop} uid={uid} />
        <FxLayer hour={sky} crop={crop} uid={uid} ball={ball} shadow={shadow} />
      </div>
      <PineLayer hour={sky} />
      {crop === 'wide' && <BoughLayer hour={sky} />}
      <GrainLayer uid={uid} />
    </div>
  );
}
