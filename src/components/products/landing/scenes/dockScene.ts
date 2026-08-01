'use client';

/**
 * ============================================================================
 * P2 · The dock — "everything in one place", shown rather than claimed
 * ----------------------------------------------------------------------------
 * The centrepiece of /products. Eight program surfaces — roster, calendar,
 * travel, messages, announcements, tasks, documents, recruiting — begin as
 * SEPARATE, loose tools scattered across the canvas (the problem: a program run
 * out of group chats, spreadsheets and six browser tabs) and then DOCK into one
 * aligned board as you scroll.
 *
 * WHY FLIP, AND WHY IT IS NOT DECORATION HERE.
 * "Everything in one place" is a claim about LAYOUT. So the animation has to be
 * a layout transition, which is exactly and only what Flip is for. This is a
 * genuine first/last change: in the scattered state the tiles are
 * `position: absolute` at seeded offsets, out of grid flow entirely; in the
 * docked state they are back in the CSS grid at their real 12-column spans.
 * Flip records the first state, lets the browser compute the real final layout,
 * and interpolates between them — so the tiles travel continuously into
 * positions nobody hard-coded. Faking this with transforms would mean
 * hand-authoring eight destination offsets that silently break at every
 * breakpoint and every content change.
 *
 * DETERMINISTIC SCATTER. Offsets come from a sin-based PRNG, never
 * `Math.random()` — the same choice TeamMock's assembly makes, for the same two
 * reasons: a scrubbed timeline must land in the same place every frame when the
 * reader scrolls back up, and the values must be identical across renders.
 *
 * The dock is the first beat. Once docked, the board OPERATES (see
 * `operateBoard`) — because a command centre that assembles and then sits there
 * is a diagram, and one that starts working is a product.
 * ========================================================================== */

import { gsap, ScrollTrigger, Flip } from '@/lib/motion/gsap/register';
import { DUR, EASE, SCRUB, STAGGER } from '@/lib/motion/gsap/tokens';
import { arrive } from '@/lib/motion/gsap/primitives';
import type { SceneContext } from '@/lib/motion/gsap/useScene';

const DOCK = {
  grid: '[data-dock="grid"]',
  tile: '[data-dock="tile"]',
  stage: '[data-dock="stage"]',
} as const;

/** A tile's box, in grid-relative pixels. */
interface DockBox {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** The board's settled layout: what `operateBoard` routes its wiring against. */
interface DockGeometry {
  width: number;
  height: number;
  rowGap: number;
  boxes: Map<HTMLElement, DockBox>;
}

/** Deterministic pseudo-random in [-1, 1] — stable across renders and scrubs. */
function seeded(i: number): number {
  const v = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
}

/**
 * Where a tile sits before it docks. Spread is a fraction of the stage box so
 * the scatter scales with the viewport instead of flinging tiles off-screen on
 * a phone.
 */
function scatterOffset(i: number, spreadX: number, spreadY: number) {
  return {
    x: seeded(i) * spreadX,
    // Vertical scatter is DOWNWARD ONLY (0…spreadY, never negative). Symmetric
    // scatter around the grid's centre lifts the top tiles above the grid box
    // and straight over the section's paragraph — caught in review. Biasing
    // down keeps the copy legible for the whole transition at every viewport,
    // and costs nothing: the tools still read as loose and unaligned.
    y: (seeded(i + 40) * 0.5 + 0.5) * spreadY,
    rotate: seeded(i + 80) * 5,
  };
}

export function dockScene(ctx: SceneContext): void | (() => void) {
  const { root, reduced, compact } = ctx;
  const q = gsap.utils.selector(root);
  const grid = q(DOCK.grid)[0] as HTMLElement | undefined;
  const tiles = q(DOCK.tile) as HTMLElement[];
  if (!grid || tiles.length === 0) return;

  // ── Reduced motion: the board, already assembled. The claim survives; only
  //    the demonstration goes. ────────────────────────────────────────────────
  if (reduced) {
    gsap.set(tiles, { clearProps: 'all' });
    // Reduced motion draws nothing, so the geometry is never consulted.
    return operateBoard(ctx, () => ({ width: 0, height: 0, rowGap: 0, boxes: new Map() }));
  }

  // ── The docked geometry, as data ─────────────────────────────────────────
  //
  // `operateBoard` needs to know where each tile LANDS in order to route its
  // wiring, and getting that right took four attempts. Recording them because
  // each failure mode is easy to walk back into:
  //
  //   1. `getBoundingClientRect()` on the tiles. Flip animates this board with
  //      TRANSFORMS — the tiles never leave grid flow — and a client rect
  //      includes the transform, so every tile reported where it was flying
  //      rather than where it lands. All four hops terminated at the grid's
  //      top-left corner.
  //   2. Scrubbing `dockTl` to 1, measuring, and scrubbing back. Moving the
  //      thing you are measuring is never free: this left tiles carrying
  //      `left: 50%` without the matching `position: absolute` and shifted the
  //      board half a grid width.
  //   3. Stripping the positional inline styles, measuring, restoring them.
  //      Worse — by the time the restore ran, Flip had moved on, so the restore
  //      wrote stale values back. Never save and restore properties another
  //      library owns; you will disagree about when "now" is.
  //
  // The answer is `offsetLeft`/`offsetTop`/`offsetWidth`/`offsetHeight`, which
  // report the LAYOUT box and are by definition unaffected by transforms. They
  // are correct at any point in the transition, including mid-flight, so there
  // is no state to keep in sync and nothing to write to the DOM. `.teamGrid` is
  // `position: relative`, which makes it the tiles' offset parent and puts
  // these coordinates in the same space as the SVG overlay.
  const snapshot = (): DockGeometry => {
    // Measure the board's natural height with the reservation lifted, then put
    // it back — see the note below on why the grid needs one at all.
    grid.style.minHeight = '';
    const height = grid.offsetHeight;

    const boxes = new Map<HTMLElement, DockBox>();
    tiles.forEach((tile) => {
      const l = tile.offsetLeft;
      const t = tile.offsetTop;
      boxes.set(tile, { l, t, r: l + tile.offsetWidth, b: t + tile.offsetHeight });
    });

    // ── THE BOARD MUST HOLD ITS OWN SPACE ────────────────────────────────────
    // While the tiles are scattered, Flip has every one of them out of grid
    // flow — so the grid has no in-flow children and collapses to ZERO height.
    // Two consequences, both bad and both invisible until measured:
    //
    //   · ~840px of layout vanishes and reappears as the reader scrolls
    //     through the section. That is the section shifting under them, and it
    //     is exactly what Core Web Vitals counts as layout instability.
    //   · Every ScrollTrigger anchored to the grid computed its start and end
    //     against a zero-height element. The hop timeline's range came out as
    //     `start 1435 / end 1768` — 333px, ENDING 225px ABOVE the board's own
    //     top edge — so the entire propagation played out before the board was
    //     on screen. Probing `st.start`/`st.end` is what surfaced it; nothing
    //     about the rendered page said so.
    //
    // Reserving the docked height keeps the section's box honest whatever Flip
    // is doing inside it.
    grid.style.minHeight = `${height}px`;

    return {
      width: grid.clientWidth,
      height,
      rowGap: parseFloat(getComputedStyle(grid).rowGap) || 20,
      boxes,
    };
  };

  // `offsetLeft` is only the LAYOUT position while the tile is in normal flow.
  // Mid-transition Flip parks each tile at `position: absolute; left: 0; top: 0`
  // and places it with a transform, so every tile reports an offset of (0, 0)
  // and the wiring collapses into the grid's top-left corner — which is exactly
  // what the probe showed at page load. So a snapshot is only accepted when the
  // board is provably at rest.
  const settled = () =>
    tiles.every((tile) => getComputedStyle(tile).position !== 'absolute');

  // Taken here — BEFORE the scatter below and before `Flip.from` exists — so
  // the tiles are still in normal flow and this is the board's real layout.
  // Marked stale anyway: in dev the CSS-module stylesheet can be injected after
  // this layout effect, which would make this a measurement of an unstyled
  // grid. The first at-rest frame then replaces it. In production the first
  // read already stands.
  let docked = snapshot();
  let stale = true;
  ScrollTrigger.addEventListener('refresh', () => {
    stale = true;
  });

  // When the reservation changes, every trigger anchored to this section was
  // measured against the old page height and must be recomputed. Deferred by a
  // frame and guarded by the height comparison so this can never become a
  // refresh loop.
  let pendingRefresh = 0;
  const getDocked = (): DockGeometry => {
    if (stale && settled()) {
      const previous = docked.height;
      docked = snapshot();
      stale = false;
      if (Math.abs(docked.height - previous) > 1 && !pendingRefresh) {
        pendingRefresh = requestAnimationFrame(() => {
          pendingRefresh = 0;
          ScrollTrigger.refresh();
        });
      }
    }
    return docked;
  };


  // Spread is MEASURED off the grid's own box rather than hard-coded, for one
  // concrete reason: the tiles scatter around the grid's centre, and a fixed
  // offset large enough to read as "strewn about" on desktop pushes them up
  // over the section heading and out the sides. Deriving it from the container
  // keeps every scattered tile inside the area the docked board will occupy —
  // the tools are loose, but they are loose IN THE SAME PLACE they end up.
  const gridBox = grid.getBoundingClientRect();
  const spreadX = Math.min(gridBox.width * 0.3, compact ? 90 : 300);
  const spreadY = Math.min(gridBox.height * 0.16, compact ? 70 : 190);

  // 1. FIRST — put the tiles in the scattered layout and record it. Absolute
  //    positioning takes them out of grid flow, which is what makes this a real
  //    layout change rather than a transform.
  tiles.forEach((tile, i) => {
    const { x, y, rotate } = scatterOffset(i, spreadX, spreadY);
    gsap.set(tile, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      xPercent: -50,
      yPercent: -50,
      x,
      y,
      rotate,
      scale: compact ? 0.82 : 0.72,
      zIndex: i,
    });
  });
  const scattered = Flip.getState(tiles, { props: 'rotate,scale' });

  // 2. LAST — hand the tiles back to the grid. The browser computes the real
  //    docked layout; nothing about it is hard-coded here.
  tiles.forEach((tile) => {
    gsap.set(tile, { clearProps: 'position,left,top,xPercent,yPercent,x,y,rotate,scale,zIndex' });
  });

  // 3. Interpolate FIRST → LAST, scrubbed. `ease: none` because on a scrubbed
  //    timeline the reader's scroll IS the easing; adding a curve on top makes
  //    the tiles feel like they are fighting the wheel.
  const dockTl = Flip.from(scattered, {
    duration: 1,
    ease: EASE.none,
    // Seeded order, not `from: 'random'` — a scrubbed timeline must resolve
    // identically every time the reader scrolls back through it.
    stagger: { each: STAGGER.wideStep },
    absolute: true,
    paused: true,
  });

  ScrollTrigger.create({
    // NOT PINNED, deliberately. Pinning this section forces the entire docked
    // board — nine tiles, ~1200px tall — to fit inside one viewport, which it
    // cannot at any realistic type size. Pinned, the scatter either overlaps
    // the section heading or happens below the fold where nobody sees it; both
    // were visible in review. Scrubbing the dock as the board travels through
    // the viewport keeps every tile inside the grid box it will occupy, keeps
    // the heading legible, and costs nothing narratively: the tools still
    // converge into one board, the reader just isn't held in place while it
    // happens. (MOBILE_DOCTRINE's "excessive scroll pinning" caution applies to
    // marketing surfaces too.)
    trigger: grid,
    start: compact ? 'top 92%' : 'top 85%',
    end: compact ? 'center 62%' : 'center 58%',
    invalidateOnRefresh: true,
    scrub: SCRUB.smooth,
    // The Flip timeline is driven by PROGRESS rather than handed to
    // ScrollTrigger's `animation` option. ScrollTrigger calls
    // `animation.revert().invalidate()` during refresh, and a timeline returned
    // by `Flip.from()` does not support that chain — passing it as `animation`
    // throws `animation.revert(...).invalidate is not a function` on the first
    // refresh, which kills the pin and leaves the tiles unscattered.
    onUpdate: (self) => dockTl.progress(self.progress),
    onRefresh: (self) => dockTl.progress(self.progress),
  });

  const cleanup = operateBoard(ctx, getDocked);
  return () => {
    cancelAnimationFrame(pendingRefresh);
    // Release the reservation so the next context measures the board fresh.
    grid.style.minHeight = '';
    cleanup?.();
  };
}

/**
 * ============================================================================
 * P2b · The board OPERATES — one decision propagating across the program
 * ----------------------------------------------------------------------------
 * The dock proves the tools are in one place. This proves they are one SYSTEM,
 * which is a different and much harder claim — and it is the claim the section
 * heading actually makes ("run the whole program from one place").
 *
 * What it depicts is the real dependency chain in GolfHelm, in the order the
 * product runs it:
 *
 *     qualifier standings → travel squad → calendar → announcement → tasks
 *
 * A coach locks the top four out of a five-day qualifier. That single decision
 * names the travel squad, which fixes the trip dates on the team calendar,
 * which is what the roster gets told, which is what generates the follow-ups.
 * Every one of those is a table in the schema, not a metaphor.
 *
 * THE THREADS ARE ORTHOGONAL, AND THEY RUN IN THE GUTTERS.
 * Each hop is drawn as a two-elbow path whose long run lands in the grid gap
 * between tiles — measured from the tiles' own boxes at refresh time, never
 * hard-coded. Two consequences: the wiring never crosses a tile face (so it
 * reads as connection rather than clutter), and it re-routes correctly at every
 * breakpoint and every content change. Straight segments and right angles are
 * also the honest vocabulary here — this is a data dependency, not an organic
 * flourish, so nothing swoops.
 *
 * On a single-column layout the threads are dropped entirely (they would be a
 * long vertical line running behind opaque tiles) and the chain is carried by
 * the readouts resolving in the same order. The argument survives; only the
 * wiring diagram goes.
 * ========================================================================== */

/** The dependency chain, in the order the product actually runs it. */
const CHAIN = ['travel', 'calendar', 'announcements', 'tasks'] as const;

export const OP = {
  source: '[data-op="source"]',
  threads: '[data-op="threads"]',
  cutline: '[data-op="cutline"]',
  cutrule: '[data-op="cutrule"]',
  wash: '[data-op="wash"]',
  check: '[data-op="check"]',
  pending: '[data-op="pending"]',
  locked: '[data-op="locked"]',
  readout: '[data-op="readout"]',
} as const;

function operateBoard(
  { root, reduced, compact }: SceneContext,
  /** The board's settled geometry, re-measured safely on demand. */
  getDocked: () => DockGeometry,
): void | (() => void) {
  const q = gsap.utils.selector(root);
  const grid = q(DOCK.grid)[0] as HTMLElement | undefined;
  const source = q(OP.source)[0] as HTMLElement | undefined;
  const svg = q(OP.threads)[0] as SVGSVGElement | undefined;
  const cutRule = q(OP.cutrule)[0] as HTMLElement | undefined;
  const cutLabel = q(OP.cutline)[0] as HTMLElement | undefined;
  const washes = q(OP.wash) as HTMLElement[];
  const checks = q(OP.check) as HTMLElement[];
  const pending = q(OP.pending)[0] as HTMLElement | undefined;
  const locked = q(OP.locked)[0] as HTMLElement | undefined;

  if (!source) return;

  interface Hop {
    key: string;
    target: HTMLElement;
    readout: HTMLElement | undefined;
  }
  const links: Hop[] = [];
  CHAIN.forEach((key) => {
    const target = q(`[data-op-target="${key}"]`)[0] as HTMLElement | undefined;
    if (!target) return;
    links.push({ key, target, readout: target.querySelector<HTMLElement>(OP.readout) ?? undefined });
  });

  // ── Reduced motion: the decision, already made and already propagated. Every
  //    readout, every check, the cut line and the wiring all render settled. ──
  if (reduced) {
    gsap.set(washes, { autoAlpha: 1 });
    gsap.set(checks, { autoAlpha: 1, scale: 1 });

    if (cutRule) gsap.set(cutRule, { scaleX: 1 });
    if (cutLabel) gsap.set(cutLabel, { autoAlpha: 1 });
    if (pending) gsap.set(pending, { display: 'none' });
    if (locked) gsap.set(locked, { autoAlpha: 1 });
    links.forEach((l) => l.readout && gsap.set(l.readout, { autoAlpha: 1, y: 0 }));
    return;
  }

  // ── Wiring. Created in JS rather than JSX because the number of hops is the
  //    chain's business, and the geometry has to be measured anyway. ──────────
  const paths: SVGPathElement[] = [];
  const nodes: SVGCircleElement[] = [];
  const NS = 'http://www.w3.org/2000/svg';
  const wire = Boolean(svg) && !compact;

  if (wire && svg) {
    links.forEach(() => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', 'var(--accent)');
      p.setAttribute('stroke-width', '1.5');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(p);
      paths.push(p);

      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', '3.5');
      c.setAttribute('fill', 'var(--accent)');
      svg.appendChild(c);
      nodes.push(c);
    });
  }

  /**
   * Route every hop against the snapshot of the DOCKED board.
   *
   * Each hop runs along the ROW GUTTER DIRECTLY ABOVE ITS TARGET and arrives at
   * that target's top edge. The obvious alternative — elbow at the midpoint
   * between source and target — routes straight through whatever tile happens
   * to sit in between: the travel hop's vertical run landed inside the calendar
   * tile and disappeared behind it. The gutter above a target is guaranteed
   * empty for that target's full width, so this rule holds at every breakpoint
   * without knowing the layout in advance.
   */
  let routed: DockGeometry | null = null;
  // Held in an object rather than a `let` so `layout` — which is defined before
  // the timeline exists and referenced by its own ScrollTrigger config — can
  // reach it without a forward-declared binding.
  const hop: { tl?: gsap.core.Timeline } = {};
  const layout = () => {
    if (!wire) return;
    // Identity, not deep comparison: `getDocked` hands back the very same object
    // until it has been able to re-measure. That makes this safe to call on every
    // scroll frame — the DOM writes below happen only when the geometry actually
    // changed — and it means the wiring re-routes on the first frame after the
    // board settles rather than waiting for the next refresh.
    const geo = getDocked();
    if (geo === routed) return;
    const s = geo.boxes.get(source);
    if (!s) return;
    routed = geo;

    links.forEach((link, i) => {
      const path = paths[i];
      const node = nodes[i];
      const t = geo.boxes.get(link.target);
      if (!path || !node || !t) return;

      const busY = t.t - geo.rowGap / 2;
      const nx = (t.l + t.r) / 2;
      const ny = t.t;
      const sx = (s.l + s.r) / 2;

      // Where the decision leaves the qualifier tile. If that tile ends above
      // the bus it exits through its bottom edge; if it is tall enough to reach
      // the bus (it spans two rows) it exits sideways.
      const d =
        s.b <= busY
          ? `M ${sx} ${s.b} L ${sx} ${busY} L ${nx} ${busY} L ${nx} ${ny}`
          : `M ${s.r} ${busY} L ${nx} ${busY} L ${nx} ${ny}`;

      path.setAttribute('d', d);
      path.style.strokeDasharray = `${path.getTotalLength()}`;
      node.setAttribute('cx', `${nx}`);
      node.setAttribute('cy', `${ny}`);
    });

    // A re-route changes every path's LENGTH, and `strokeDashoffset` is in the
    // same units — so the offset the timeline last wrote now means a different
    // fraction of the line. Left alone, a hop that should be undrawn reads as
    // 77% drawn (probed). `invalidate()` drops the recorded start values so the
    // function-based `() => path.getTotalLength()` is read again, and
    // re-rendering at the same progress restores the correct dash state.
    if (hop.tl) {
      hop.tl.invalidate();
      // Forced render: at progress 0 — the common case, since a re-route
      // usually happens before the reader reaches the board — assigning the
      // same progress is a no-op and the new "from" values would never be
      // written, leaving the paths drawn.
      hop.tl.render(hop.tl.time(), false, true);
    }
  };

  layout();

  // ── Initial state: nothing decided. ──────────────────────────────────────
  // `autoAlpha`, not bare `opacity`, so each of these is the exact inverse of
  // the `arrive()` snap that brings it back — see that primitive for why none
  // of this section may interpolate opacity on a scrubbed timeline.
  gsap.set(washes, { autoAlpha: 0 });
  gsap.set(checks, { autoAlpha: 0, scale: 0.6, transformOrigin: 'center' });
  if (cutRule) gsap.set(cutRule, { scaleX: 0, transformOrigin: 'left center' });
  if (cutLabel) gsap.set(cutLabel, { autoAlpha: 0 });
  if (locked) gsap.set(locked, { autoAlpha: 0 });
  if (nodes.length) gsap.set(nodes, { scale: 0, transformOrigin: 'center', autoAlpha: 0 });
  links.forEach((l) => l.readout && gsap.set(l.readout, { autoAlpha: 0, y: 10 }));

  // ── Beat 1 · THE CUT. Anchored to the qualifier tile itself, because that is
  //    where the decision is made and it has to be legible while it happens.
  //    The dock finishes near the grid's centre, so this starts just after. ───
  const cutTl = gsap.timeline({
    scrollTrigger: {
      trigger: source,
      start: compact ? 'top 78%' : 'top 62%',
      end: compact ? 'bottom 45%' : 'bottom 55%',
      scrub: SCRUB.smooth,
      invalidateOnRefresh: true,
    },
  });

  if (cutRule) cutTl.to(cutRule, { scaleX: 1, duration: DUR.medium, ease: EASE.glide }, 0);
  // "Travel cut", the row washes, and "Squad locked" all carry copy, so every
  // one of them snaps rather than ramps (caught parked at 0.62 and 0.80).
  if (cutLabel) arrive(cutTl, [cutLabel], 0.24);
  if (washes.length) arrive(cutTl, washes, 0.3);
  if (checks.length) {
    arrive(cutTl, checks, 0.34, { scale: 1, duration: DUR.short, ease: EASE.emphasized });
  }
  // A fade OUT parks half-legible for exactly the same reason a fade in does:
  // "Squad of 4 pending" must be present or gone, never ghosted at 0.5.
  if (pending) cutTl.set(pending, { autoAlpha: 0 }, 0.66);
  if (locked) arrive(cutTl, [locked], 0.78);
  cutTl.to({}, { duration: 0.35 });

  // ── Beat 2 · THE DECISION PROPAGATES. ────────────────────────────────────
  if (!wire) {
    // SINGLE-COLUMN. There is no board to wire — the surfaces are a stack you
    // walk down, so each one announces its state as you arrive at it, in the
    // same dependency order. This is deliberately NOT the desktop timeline with
    // the lines switched off: driving four readouts from one scrubbed timeline
    // would resolve tiles that are still hundreds of pixels below the fold.
    // Each surface owns its own beat, which is what the layout is already
    // telling the reader.
    links.forEach((link) => {
      if (!link.readout) return;
      gsap.to(link.readout, {
        opacity: 1,
        y: 0,
        duration: DUR.medium,
        ease: EASE.glide,
        scrollTrigger: { trigger: link.target, start: 'top 80%', once: true },
      });
    });
    return;
  }

  // DESKTOP + TABLET. The wiring is scrubbed across the rest of the board's
  // travel. Each hop draws, lands on its node, and only THEN does that
  // surface's readout resolve — the readout is the consequence of the hop
  // arriving, never a separate fade-in on a timer.
  const hopTl = (hop.tl = gsap.timeline({
    scrollTrigger: {
      // The grid, not the source tile: the chain spans the whole board, and
      // anchoring to the ~365px qualifier tile gave the four hops barely 400px
      // of scroll between them — the entire propagation completed in a flick of
      // the wheel. Measured, then widened.
      trigger: grid,
      start: 'center 62%',
      end: 'bottom 25%',
      scrub: SCRUB.smooth,
      invalidateOnRefresh: true,
      // Re-routed on refresh (resize, font swap, a lazy image reflowing the
      // board) and again on entry — in dev the CSS-module stylesheet can be
      // injected after this scene's layout effect, so the first measurement can
      // see an unstyled grid. Draw progress is 0 at entry, so re-writing `d`
      // there is invisible.
      onRefresh: layout,
      onUpdate: layout,
    },
  }));

  const hopStep = 0.3;
  links.forEach((link, i) => {
    const at = i * hopStep;
    const path = paths[i];
    const node = nodes[i];
    if (path) {
      hopTl.fromTo(
        path,
        { strokeDashoffset: () => path.getTotalLength() },
        { strokeDashoffset: 0, duration: DUR.medium, ease: EASE.glide },
        at,
      );
    }
    if (node) {
      arrive(hopTl, [node], at + 0.22, { scale: 1, duration: DUR.short, ease: EASE.emphasized });
    }
    if (link.readout) {
      arrive(hopTl, [link.readout], at + 0.24, { y: 0, duration: DUR.short });
    }
  });

  // Tail padding so the finished board holds, settled, rather than completing
  // on the final pixel of the range.
  hopTl.to({}, { duration: 0.35 });

  return () => {
    paths.forEach((p) => p.remove());
    nodes.forEach((n) => n.remove());
  };
}
