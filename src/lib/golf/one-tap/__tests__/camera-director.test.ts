import { describe, expect, it } from 'vitest';
import { CAMERA_ENVELOPE, CAMERA_THRESHOLDS, GESTURES, MOTION, clampPitch, initialCameraState, observeAnchor, observeGesture, productionStateFor, recenter, tickCamera, transitionMs } from '../camera-director';

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
  it('maps every mode onto an existing production camera state', () => {
    expect(productionStateFor('HOLE_OVERVIEW')).toEqual({ state: 'tee', preset: 'tee' });
    expect(productionStateFor('PLAYER_FOLLOW').state).toBe('approach');
    expect(productionStateFor('APPROACH').state).toBe('approach');
    expect(productionStateFor('GREEN_COMPLEX').state).toBe('green');
    expect(productionStateFor('PUTT_CONTEXT').state).toBe('putting');
    expect(productionStateFor('MANUAL', 'top')).toEqual({ state: 'tee', preset: 'top' });
  });
});
