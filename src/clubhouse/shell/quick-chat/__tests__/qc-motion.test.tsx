// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CH_EASE_IOS_CSS } from '../../../lib/motion';
import type { ChMotionMode } from '../../../lib/reduced-motion';
import { QC_CLOSE_MS, QC_FROM, QC_OPEN_MS, qcCloseTo, useQcMotion } from '../useQcMotion';

/**
 * Production audit 2026-11-15, MOT-09 (S3.5, S3.9): the quick chat panel is a large popover, not a growing blob. It opens
 * over 260 ms from 96% with its opacity, the whole panel at once (no part is staggered, nothing starts from half size), on
 * `--ch-ease-ios`, and closes over 180 ms. Reduce Motion is opacity only over 180 ms; Animations off is at once.
 */

type Call = { keyframes: Keyframe[]; options: KeyframeAnimationOptions };

function el(): { node: HTMLElement; calls: Call[] } {
  const node = document.createElement('section');
  const calls: Call[] = [];
  Object.defineProperty(node, 'animate', {
    value: (keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      calls.push({ keyframes, options });
      return { cancel: vi.fn(), finished: new Promise(() => undefined) } as unknown as Animation;
    },
  });
  return { node, calls };
}

function panelWithParts() {
  const panel = el();
  // The header, body and composer the old open staggered in (60 + i * 30 ms); none of them may move on its own now.
  const parts = [el(), el(), el()];
  for (const p of parts) panel.node.appendChild(p.node);
  return { panel, parts };
}

const motion = (mode: ChMotionMode) => renderHook(() => useQcMotion(mode)).result.current;

describe('quick chat panel motion (MOT-09)', () => {
  it('opens over 260 ms from 96% with its opacity, on the iOS curve, with no stagger', () => {
    const { panel, parts } = panelWithParts();
    const scrim = el();
    motion('full').open(panel.node, scrim.node, { x: 0, y: 0 }, () => undefined);

    expect(QC_FROM).toBe('scale(0.96)');
    expect(QC_OPEN_MS).toBe(260);
    expect(panel.calls).toHaveLength(1);
    const [{ keyframes, options }] = panel.calls as [Call];
    expect(keyframes[0]).toEqual({ transform: 'scale(0.96)', opacity: '0' });
    expect(keyframes.at(-1)).toEqual({ transform: 'none', opacity: 1 });
    expect(options).toMatchObject({ duration: 260, easing: CH_EASE_IOS_CSS });
    expect(options.delay ?? 0).toBe(0);
    for (const p of parts) expect(p.calls).toHaveLength(0);
    expect(scrim.calls[0]!.options).toMatchObject({ duration: 260, easing: CH_EASE_IOS_CSS });
  });

  it('never starts from half size', () => {
    const { panel } = panelWithParts();
    motion('full').open(panel.node, null, { x: 0, y: 0 }, () => undefined);
    expect(JSON.stringify(panel.calls)).not.toMatch(/scale\(0\.5\)/);
  });

  it('closes over 180 ms back to 96%, transform and opacity together, on the iOS curve', () => {
    const { panel, parts } = panelWithParts();
    motion('full').close(panel.node, null, () => undefined);
    expect(QC_CLOSE_MS).toBe(180);
    expect(panel.calls).toHaveLength(1);
    const [{ keyframes, options }] = panel.calls as [Call];
    expect(keyframes.at(-1)).toEqual({ transform: 'scale(0.96)', opacity: 0 });
    expect(options).toMatchObject({ duration: 180, easing: CH_EASE_IOS_CSS });
    for (const p of parts) expect(p.calls).toHaveLength(0);
  });

  it('a thrown sheet carries on along its throw at the finger speed and does not shrink; a dragged one leaves from where it is', () => {
    // The iOS curve leaves its start at 0.72 / 0.32 = 2.25 times the average speed, so 1.5 px/ms over 180 ms carries 120 px.
    expect(qcCloseTo(80, 1.5)).toBe('translateY(200px)');
    expect(qcCloseTo(-80, 1.5)).toBe('translateY(-200px)');
    expect(qcCloseTo(80, 0)).toBe('translateY(80px) scale(0.96)');
    expect(qcCloseTo(0, 0)).toBe('scale(0.96)');
  });

  it('Reduce Motion: opacity only over 180 ms, both ways', () => {
    const { panel } = panelWithParts();
    const m = motion('fade');
    m.open(panel.node, null, { x: 0, y: 0 }, () => undefined);
    m.close(panel.node, null, () => undefined);
    expect(panel.calls).toHaveLength(2);
    for (const { keyframes, options } of panel.calls) {
      expect(keyframes.every((k) => Object.keys(k).every((p) => p === 'opacity'))).toBe(true);
      expect(options.duration).toBe(180);
    }
  });

  it('Animations off: nothing animates and the panel is at rest at once', () => {
    const { panel } = panelWithParts();
    const rest = vi.fn();
    const done = vi.fn();
    const m = motion('off');
    m.open(panel.node, null, { x: 0, y: 0 }, rest);
    m.close(panel.node, null, done);
    expect(panel.calls).toHaveLength(0);
    expect(rest).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
