import { afterEach, describe, expect, it } from 'vitest';
import {
  CH_EDGE_COMMIT,
  CH_EDGE_FLICK_PX_PER_MS,
  CH_EDGE_SLOP_PX,
  CH_EDGE_ZONE_PX,
  createEdgeSwipe,
  edgeSwipeAllowed,
  findScreenBack,
  isTrackingRoute,
  nativeSwipeIsOff,
  overlayIsOpen,
} from '../edge-swipe';

const W = 390;

/** A finger that lands at x and moves in steps (x, y per `ms` of travel), returning the machine and the last move. */
function drag(steps: Array<[number, number]>, { from = [10, 400], dt = 16 }: { from?: [number, number]; dt?: number } = {}) {
  const m = createEdgeSwipe(W);
  m.start(from[0], from[1], 0);
  let t = 0;
  let last = null as ReturnType<typeof m.move> | null;
  const moves: Array<ReturnType<typeof m.move>> = [];
  for (const [x, y] of steps) {
    t += dt;
    last = m.move(x, y, t);
    moves.push(last);
  }
  return { m, last, moves, t };
}

describe('the edge swipe state machine', () => {
  it('arms only for a finger landing within the left 20px', () => {
    const m = createEdgeSwipe(W);
    expect(m.start(CH_EDGE_ZONE_PX, 300, 0)).toBe(true);
    expect(m.phase).toBe('pending');
    m.end(10);
    expect(m.start(CH_EDGE_ZONE_PX + 1, 300, 0)).toBe(false);
    expect(m.move(120, 300, 16).claim).toBe(false);
    expect(m.end(32)).toBeNull();
  });

  it('waits for the slop before it decides, and claims a rightward travel from there', () => {
    const { last } = drag([[10 + CH_EDGE_SLOP_PX - 2, 400]]);
    expect(last?.claim).toBe(false);
    const claimed = drag([[10 + CH_EDGE_SLOP_PX + 4, 402]]).last;
    expect(claimed?.claim).toBe(true);
    expect(claimed?.frame?.offset).toBe(CH_EDGE_SLOP_PX + 4);
  });

  it('vertical scroll wins when the first travel is vertical, for the rest of the touch', () => {
    const { m, moves } = drag([
      [12, 420],
      [14, 440],
      // …and a later rightward drift does not take the touch back.
      [80, 450],
      [200, 452],
    ]);
    expect(moves.every((mv) => !mv.claim)).toBe(true);
    expect(m.phase).toBe('refused');
    expect(m.end(100)).toBeNull();
  });

  it('a leftward or diagonal-down first travel is a scroll too', () => {
    expect(drag([[2, 404], [0, 410]]).moves.every((mv) => !mv.claim)).toBe(true);
    expect(drag([[26, 440]]).last?.claim).toBe(false);
  });

  it('follows the finger one to one from where it landed, never negative and never past the width', () => {
    const { moves } = drag([
      [40, 402],
      [110, 404],
      [20, 404],
      [900, 404],
    ]);
    expect(moves.map((mv) => mv.frame?.offset)).toEqual([30, 100, 10, W]);
    expect(moves[3]?.frame?.progress).toBe(1);
    const back = drag([[40, 402], [4, 404]]);
    expect(back.moves[1]?.frame?.offset).toBe(0);
  });

  it('reports the commit mark as crossed once each way', () => {
    const mark = W * CH_EDGE_COMMIT;
    const { moves } = drag([
      [10 + mark - 20, 400],
      [10 + mark + 5, 400],
      [10 + mark + 40, 400],
      [10 + mark - 5, 400],
      [10 + mark - 30, 400],
    ]);
    expect(moves.map((mv) => mv.crossed)).toEqual([false, true, false, true, false]);
    expect(moves.map((mv) => mv.frame?.past)).toEqual([false, true, true, false, false]);
  });

  it('lets go past 35% of the width, slowly, and the screen pops', () => {
    const mark = W * CH_EDGE_COMMIT;
    const slow = (to: number) => {
      const d = drag([[10 + to * 0.5, 400], [10 + to, 400]], { dt: 200 });
      // Held still for a while before letting go: no flick in it.
      return d.m.end(d.t + 150);
    };
    expect(slow(mark + 6)?.outcome).toBe('commit');
    expect(slow(mark - 6)?.outcome).toBe('cancel');
  });

  it('a fast flick to the right pops it from a short way, once it has moved a little', () => {
    const d = drag([[30, 401], [60, 402], [90, 402]], { dt: 16 });
    const r = d.m.end(d.t + 4);
    expect(r?.outcome).toBe('commit');
    expect(r?.speed).toBeGreaterThan(CH_EDGE_FLICK_PX_PER_MS);
    // A flick before it has moved 10px does not.
    const tiny = drag([[10 + CH_EDGE_SLOP_PX + 1, 401]], { dt: 2 });
    expect(tiny.m.end(tiny.t + 1)?.outcome).toBe('cancel');
  });

  it('a fast flick back to the left cancels even past the mark', () => {
    const mark = W * CH_EDGE_COMMIT;
    const d = drag(
      [
        [10 + mark + 40, 400],
        [10 + mark + 10, 400],
        [10 + mark - 20, 400],
        [10 + mark - 50, 400],
        [10 + mark - 80, 400],
      ],
      { dt: 30 },
    );
    const r = d.m.end(d.t + 2);
    expect(r?.speed).toBeLessThan(-CH_EDGE_FLICK_PX_PER_MS);
    expect(r?.outcome).toBe('cancel');
  });

  it('a touch that stopped before it lifted is not a flick', () => {
    const d = drag([[40, 400], [90, 400], [130, 400]], { dt: 10 });
    const r = d.m.end(d.t + 300);
    expect(r?.speed).toBe(0);
    expect(r?.outcome).toBe('cancel');
  });

  it('cancel forgets the touch, and the machine can be armed again', () => {
    const { m } = drag([[60, 400]]);
    m.cancel();
    expect(m.phase).toBe('idle');
    expect(m.end(40)).toBeNull();
    expect(m.start(8, 300, 0)).toBe(true);
  });

  it('a second start during a drag is refused', () => {
    const { m } = drag([[60, 400]]);
    expect(m.start(5, 100, 50)).toBe(false);
    expect(m.phase).toBe('dragging');
  });
});

describe('when the web gesture may run', () => {
  afterEach(() => {
    delete (window as unknown as { webkit?: unknown }).webkit;
    delete (window as unknown as { __helmNativeSwipe?: boolean }).__helmNativeSwipe;
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });
  const bridge = () => {
    (window as unknown as { webkit: unknown }).webkit = { messageHandlers: { helmNav: { postMessage: () => {} } } };
  };
  const flag = (on: boolean) => {
    (window as unknown as { __helmNativeSwipe?: boolean }).__helmNativeSwipe = on;
  };

  it('runs in mobile Safari always (no bridge, not the app)', () => {
    expect(nativeSwipeIsOff(window, false)).toBe(true);
    flag(true);
    expect(nativeSwipeIsOff(window, false)).toBe(true);
  });

  it('in the app it needs the helmNav bridge and the flag saying the native swipe is off', () => {
    // The app without the bridge (an older shell): the native swipe is on and unknowable.
    expect(nativeSwipeIsOff(window, true)).toBe(false);
    bridge();
    expect(nativeSwipeIsOff(window, true)).toBe(false);
    flag(true);
    expect(nativeSwipeIsOff(window, true)).toBe(false);
    flag(false);
    expect(nativeSwipeIsOff(window, true)).toBe(true);
    // The bridge alone marks the app even when Capacitor has not said so.
    expect(nativeSwipeIsOff(window, false)).toBe(true);
    flag(true);
    expect(nativeSwipeIsOff(window, false)).toBe(false);
  });

  it('reads the flag when a finger lands, so the shell turning it on or off is followed', () => {
    bridge();
    flag(false);
    expect(edgeSwipeAllowed({ inApp: true })).toBe(true);
    flag(true);
    expect(edgeSwipeAllowed({ inApp: true })).toBe(false);
  });

  it('follows the native shell’s tracking routes (GolfBridgeViewController.isTrackingRoute)', () => {
    expect(isTrackingRoute('https://x.test/golf/dashboard/rounds/new')).toBe(true);
    expect(isTrackingRoute('/golf/dashboard/rounds/continue/abc')).toBe(true);
    expect(isTrackingRoute('/golf/dashboard/rounds/abc/review')).toBe(false);
    expect(isTrackingRoute('/golf/dashboard/roster')).toBe(false);
    window.history.replaceState(null, '', '/golf/dashboard/rounds/continue/abc');
    expect(edgeSwipeAllowed()).toBe(false);
    window.history.replaceState(null, '', '/golf/dashboard/roster');
    expect(edgeSwipeAllowed()).toBe(true);
  });

  it('is off while a sheet or dialog is open (NativeSwipeBackBridge’s list)', () => {
    expect(overlayIsOpen()).toBe(false);
    for (const html of [
      '<dialog open></dialog>',
      '<div role="dialog" data-state="open"></div>',
      '<div role="alertdialog" data-state="open"></div>',
      '<div data-vaul-drawer data-state="open"></div>',
    ]) {
      document.body.innerHTML = html;
      expect(overlayIsOpen()).toBe(true);
      expect(edgeSwipeAllowed()).toBe(false);
    }
    document.body.innerHTML = '<dialog></dialog><div role="dialog" data-state="closed"></div>';
    expect(overlayIsOpen()).toBe(false);
  });
});

describe('the screen’s Back', () => {
  it('is the bar’s chevron link, not a Cancel text action, and not a disabled one', () => {
    const screen = document.createElement('section');
    screen.innerHTML = '<header><button class="ch-pbar__back is-text">Cancel</button></header>';
    expect(findScreenBack(screen)).toBeNull();
    screen.innerHTML = '<header><button class="ch-pbar__back">Roster</button></header>';
    expect(findScreenBack(screen)?.textContent).toBe('Roster');
    screen.innerHTML = '<header><button class="ch-pbar__back" aria-disabled="true">Roster</button></header>';
    expect(findScreenBack(screen)).toBeNull();
    screen.innerHTML = '<p>no bar</p>';
    expect(findScreenBack(screen)).toBeNull();
  });
});
