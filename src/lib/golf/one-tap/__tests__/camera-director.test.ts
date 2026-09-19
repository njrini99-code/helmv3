import { describe, expect, it } from 'vitest';
import { MARKER_MOTION } from '../../course-geometry/scene-markers';
import { CAMERA_ENVELOPE, CAMERA_THRESHOLDS, GESTURES, MOTION, clampPitch, initialCameraState, observeAnchor, observeGesture, productionStateFor, recenter, shotRevealMs, tickCamera, transitionMs } from '../camera-director';

describe('one-tap camera director', () => {
  it('moves through the automatic states by green distance and green probability', () => {
    let s = initialCameraState(0);
    expect(s.mode).toBe('HOLE_OVERVIEW');
    s = observeAnchor(s, { distanceToGreenM: 320, greenComplexProbability: 0, terminal: false }, 1);
    expect(s.mode).toBe('PLAYER_FOLLOW');
    s = observeAnchor(s, { distanceToGreenM: 180, greenComplexProbability: 0, terminal: false }, 2);
    expect(s.mode).toBe('APPROACH');
    s = observeAnchor(s, { distanceToGreenM: 70, greenComplexProbability: .2, terminal: false }, 3);
    expect(s.mode).toBe('GREEN_COMPLEX');
    s = observeAnchor(s, { distanceToGreenM: 8, greenComplexProbability: .74, terminal: false }, 4);
    expect(s.mode).toBe('PUTT_CONTEXT');
    s = observeAnchor(s, { distanceToGreenM: 1, greenComplexProbability: .95, terminal: true }, 5);
    expect(s.mode).toBe('HOLE_TRANSITION');
  });
  it('enters MANUAL on a gesture, resumes after eight idle seconds and recenters on demand', () => {
    let s = observeAnchor(initialCameraState(0), { distanceToGreenM: 120, greenComplexProbability: 0, terminal: false }, 1);
    s = observeGesture(s, 1000);
    expect(s.mode).toBe('MANUAL');
    s = observeAnchor(s, { distanceToGreenM: 50, greenComplexProbability: 0, terminal: false }, 2000);
    expect(s.mode).toBe('MANUAL');
    expect(tickCamera(s, { distanceToGreenM: 50, greenComplexProbability: 0, terminal: false }, 1000 + CAMERA_THRESHOLDS.idleResumeMs - 1).mode).toBe('MANUAL');
    expect(tickCamera(s, { distanceToGreenM: 50, greenComplexProbability: 0, terminal: false }, 1000 + CAMERA_THRESHOLDS.idleResumeMs).mode).toBe('GREEN_COMPLEX');
    expect(recenter(s, { distanceToGreenM: 50, greenComplexProbability: 0, terminal: false }, 3000).mode).toBe('GREEN_COMPLEX');
    expect(recenter(observeGesture(initialCameraState(0), 5), null, 6).mode).toBe('HOLE_OVERVIEW');
  });
  it('keeps the plan’s timings, easing, envelope and gesture constants in one place', () => {
    expect(MOTION).toMatchObject({ pressMs: 90, pressScale: .96, statusMorphMs: 160, reframeMs: 480, greenFocusMs: 540, holeTransitionMs: 760, refinementMs: 750, undoWindowMs: 5000, easingLarge: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    expect(MOTION.rippleMs).toBeGreaterThanOrEqual(320);
    expect(MOTION.rippleMs).toBeLessThanOrEqual(360);
    expect(transitionMs('APPROACH', false)).toBe(480);
    expect(transitionMs('GREEN_COMPLEX', false)).toBe(540);
    expect(transitionMs('HOLE_TRANSITION', false)).toBe(760);
    expect(transitionMs('HOLE_TRANSITION', true)).toBeGreaterThanOrEqual(120);
    expect(transitionMs('HOLE_TRANSITION', true)).toBeLessThanOrEqual(180);
    expect(CAMERA_ENVELOPE.GREEN_COMPLEX).toMatchObject({ fovDegrees: [32, 36], heightM: [18, 35] });
    expect(GESTURES).toEqual({ yawDegreesPerPoint: .22, pitchDegreesPerPoint: .16, pitchMin: 25, pitchMax: 68 });
    expect(clampPitch(10)).toBe(25);
    expect(clampPitch(80)).toBe(68);
  });
  it('never reframes on an ordinary live fix, and reframes when a mark finalizes (§66)', () => {
    // A golfer walks 400 m to the green with the phone reporting constantly.
    // Every one of those fixes reaches the director as a tick observation.
    let s = observeAnchor(initialCameraState(0), { distanceToGreenM: 400, greenComplexProbability: 0, terminal: false }, 10);
    const framed = s;
    expect(s.mode).toBe('PLAYER_FOLLOW');
    for (let i = 0; i <= 400; i++) {
      const walked = 400 - i;
      // The whole live range: past every threshold, on and off the green, and
      // through fixes wild enough that chasing one would throw the frame away.
      const observation = { distanceToGreenM: i % 37 === 0 ? 9_999 : walked, greenComplexProbability: walked < 20 ? .99 : 0, terminal: false };
      s = tickCamera(s, observation, 1000 + i * 250);
      // Reference-identical, not merely equal: no new framing state is even built.
      expect(s).toBe(framed);
    }
    // A mark finalizes on the green: that, and only that, moves the framing.
    const after = observeAnchor(s, { distanceToGreenM: 6, greenComplexProbability: .95, terminal: false }, 200_000);
    expect(after).not.toBe(s);
    expect(after.mode).toBe('PUTT_CONTEXT');
    expect(productionStateFor(after.mode).state).toBe('putting');
    // The only tick that reframes is the end of a window the golfer opened.
    const manual = observeGesture(after, 200_100);
    expect(tickCamera(manual, { distanceToGreenM: 300, greenComplexProbability: 0, terminal: false }, 200_100 + CAMERA_THRESHOLDS.idleResumeMs).mode).toBe('PLAYER_FOLLOW');
  });
  it('keeps the shot reveal and result hold with the drawing they belong to (§64)', () => {
    expect(MOTION.shotRevealMs).toBe(MARKER_MOTION.revealMs);
    expect(MOTION.shotRevealMs).toBe(520);
    expect(MOTION.shotResultMs).toBe(1200);
    expect(MOTION.reframeMs).toBe(480);
    expect(shotRevealMs(false)).toBe(520);
    // Reduced Motion has no reveal to wait out: the finished shot is just there.
    expect(shotRevealMs(true)).toBe(0);
  });
  it('maps every mode onto an existing production camera state', () => {
    expect(productionStateFor('HOLE_OVERVIEW')).toEqual({ state: 'tee', preset: 'tee' });
    expect(productionStateFor('PLAYER_FOLLOW')).toEqual({ state: 'tee', preset: 'tee' });
    expect(productionStateFor('APPROACH').state).toBe('approach');
    expect(productionStateFor('GREEN_COMPLEX').state).toBe('green');
    expect(productionStateFor('PUTT_CONTEXT').state).toBe('putting');
    expect(productionStateFor('MANUAL', 'top')).toEqual({ state: 'tee', preset: 'top' });
  });
});
