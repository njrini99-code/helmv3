/**
 * @vitest-environment jsdom
 *
 * E-6 (audit 2026-11-19): a row's score travels into the review's hero score over the push, 520 ms on the iOS curve,
 * on the Web Animations API (a phone page change starts no view transition, S4.8). The target waits hidden, the
 * ghost goes when the flight lands or anything interrupts it, and with no target the push plays alone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureShare, CH_SHARING, endShare, flyShare, forgetShare } from '../share-morph';

const rect = (left: number, top: number, width: number, height: number) => () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
type Fake = { cancel: ReturnType<typeof vi.fn>; finished: Promise<void>; land: () => void; keyframes: Keyframe[]; options: KeyframeAnimationOptions };
let anims: Fake[] = [];
const timing = { duration: 520, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };

beforeEach(() => {
  anims = [];
  document.body.innerHTML = `
    <div id="old"><a id="row" href="/golf/dashboard/rounds/r1"><em data-ch-share="round-score">74</em></a></div>
    <div id="layer"><em data-ch-share="round-score" data-ch-share-from="">74</em></div>
    <div id="ch-content" class="ch-frame-route"><b data-ch-share="round-score">74</b></div>`;
  document.querySelector<HTMLElement>('#row em')!.getBoundingClientRect = rect(330, 400, 20, 18);
  document.querySelector<HTMLElement>('#ch-content b')!.getBoundingClientRect = rect(402 + 300, 120, 50, 44);
  HTMLElement.prototype.animate = vi.fn(function (this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    let land = () => {};
    const finished = new Promise<void>((r) => (land = r));
    const a: Fake = { cancel: vi.fn(), finished, land, keyframes, options };
    anims.push(a);
    return a as unknown as Animation;
  }) as unknown as HTMLElement['animate'];
});
afterEach(() => {
  endShare();
  forgetShare();
  document.body.innerHTML = '';
});

const page = () => document.getElementById('ch-content')!;
const layer = () => document.getElementById('layer')!;

describe('the shared score (E-6)', () => {
  it('flies from the row to where the hero score rests, over the push, and hides both ends meanwhile', () => {
    captureShare(document.getElementById('row')!);
    flyShare(page(), layer(), timing, 402);
    expect(anims).toHaveLength(2);
    for (const a of anims) expect(a.options).toMatchObject({ duration: 520, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
    // The row's ghost moves to the target's resting place (this frame's place less the push's 402px) and grows to its height.
    expect(anims[0]!.keyframes.at(-1)!.transform).toBe('translate(-30.00px, -280.00px) scale(2.4444)');
    // Both ghosts travel one path: the arriving one starts on the row's figure (its own box shifted back by the same
    // dx, dy, unscaled by the translate), and ends at rest where the leaving one ends.
    expect(anims[1]!.keyframes[0]!.transform).toBe('translate(30.00px, 280.00px) scale(0.4091)');
    expect(anims[1]!.keyframes.at(-1)!.transform).toBe('none');
    const arrive = document.querySelectorAll<HTMLElement>('.ch-share-host span')[1]!;
    expect(parseFloat(arrive.style.left) + 30).toBe(330);
    expect(parseFloat(arrive.style.top) + 280).toBe(400);
    // Transform and opacity only.
    const props = new Set(anims.flatMap((a) => a.keyframes.flatMap((k) => Object.keys(k))));
    expect(props).toEqual(new Set(['transform', 'opacity']));
    expect(page().hasAttribute(CH_SHARING)).toBe(true);
    expect(layer().querySelector<HTMLElement>('em')!.style.visibility).toBe('hidden');
    expect(document.querySelector('.ch-share-host')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('lands: the ghost goes and both figures show', async () => {
    captureShare(document.getElementById('row')!);
    flyShare(page(), layer(), timing, 402);
    anims[1]!.land();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector('.ch-share-host')).toBeNull();
    expect(page().hasAttribute(CH_SHARING)).toBe(false);
    expect(layer().querySelector<HTMLElement>('em')!.style.visibility).toBe('');
  });

  it('a Back or a finger ends it at once', () => {
    captureShare(document.getElementById('row')!);
    flyShare(page(), layer(), timing, 402);
    endShare();
    expect(anims.every((a) => a.cancel.mock.calls.length === 1)).toBe(true);
    expect(document.querySelector('.ch-share-host')).toBeNull();
    expect(page().hasAttribute(CH_SHARING)).toBe(false);
  });

  it('with no target on the incoming page (a plain skeleton), the push plays alone', () => {
    page().innerHTML = '<span class="ch-skel"></span>';
    captureShare(document.getElementById('row')!);
    flyShare(page(), layer(), timing, 402);
    expect(anims).toHaveLength(0);
    expect(page().hasAttribute(CH_SHARING)).toBe(false);
    expect(layer().querySelector('[data-ch-share-from]')).toBeNull();
  });
});
