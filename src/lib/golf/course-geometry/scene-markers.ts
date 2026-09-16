import { projectTerrainPoint, terrainHeight, type Point3M, type TerrainCamera, type TerrainMesh } from './terrain';
import type { PointM } from './types';

/** Marked positions on the course (One-Tap master plan §5 "YOU is not
 * BALL", §37–38). A `ball`, `anchor` or `terminal` marker is a position the
 * player asserted ("the ball is here now") with its retained σ, drawn as a
 * dashed ring at true scale; it never follows the phone. The `player`
 * marker is the live device with its accuracy halo; it moves continuously
 * and is never shot evidence. A `provisional` marker is hollow until the
 * estimator finalizes it. Links join consecutive finalized marks: the
 * derived shot. Nothing here moves a marker onto a surface. */
export type SceneMarkerKind = 'player' | 'ball' | 'anchor' | 'provisional' | 'terminal';
export interface SceneMarker {
  key: string;
  pointM: PointM;
  kind: SceneMarkerKind;
  /** 1σ horizontal uncertainty (metres) for a mark, the halo radius for the player; 0 hides it. */
  sigmaM: number;
  /** Short label beside the dot: 'BALL', 'YOU', a stroke number, or nothing. */
  label?: string;
  /** Drawn at reduced opacity (a player without a fresh fix). */
  dimmed?: boolean;
}
/** §62: the drawn shape of one shot. `surface_connector` is §62.1's truth
 * connector — A → B along the ground, and the ground is the only thing it
 * follows; it is also what a putt gets (§62.3), revealed like a roll rather
 * than a flight. `illustrative_endpoint_arc` is §62.2's art: a parabola over
 * the chord whose apex comes from a clamp on the distance, not from physics.
 * Nothing here is measured ball flight and nothing here feeds analytics. */
export type SceneLinkBasis = 'illustrative_endpoint_arc' | 'surface_connector';
export interface SceneMarkerLink {
  key: string;
  fromM: PointM;
  toM: PointM;
  /** Absent → the truth connector (§62.1). */
  basis?: SceneLinkBasis;
  /** §62.2 apex above the chord (metres); ignored by a connector. */
  apexM?: number;
  /** §63 hierarchy; absent → fully lit. */
  opacity?: number;
  /** Draw this shot on once, now (the shot that was just completed). */
  reveal?: boolean;
}
export interface SceneMarkers {
  markers: readonly SceneMarker[];
  links: readonly SceneMarkerLink[];
  /** Ripple once around this marker (a fresh mark); omitted under Reduced Motion. */
  rippleKey?: string | null;
}
export const EMPTY_SCENE_MARKERS: SceneMarkers = Object.freeze({ markers: [], links: [] });
/** §38/§64/§85 visual defaults, not physics: a finalized mark eases to a small
 * shift and crossfades a large one (never a "ball rolled there" animation),
 * and a completed shot draws itself on over `revealMs`. Reduced Motion skips
 * every one of them and paints the final state instead. */
export const MARKER_MOTION = Object.freeze({ settleMs: 180, settleMaxM: 2.5, crossfadeMs: 180, dimmedOpacity: .45, revealMs: 520, resultHoldMs: 1200 });
/** §63 previous-shot hierarchy, so a played hole never becomes spaghetti. */
export const SHOT_PATH_OPACITY = Object.freeze({ current: 1, previous: .35, older: .2 });
/** Segments along a drawn shot. The arc is sampled so perspective bends it
 * correctly; the connector is sampled so it rides the ground it crosses. */
const PATH_SEGMENTS = 24;
/** YOU standing on a mark: under `hidePx` the YOU label yields to the mark's
 * (the player is at the ball); under `belowPx` it moves under the dot. */
export const PLAYER_LABEL_CLEARANCE = Object.freeze({ hidePx: 8, belowPx: 24 });
/** Where the player's label goes relative to the nearest mark on screen. */
export function playerLabelPlacement(player: readonly [number, number], marks: readonly (readonly [number, number])[], clearance = PLAYER_LABEL_CLEARANCE): 'above' | 'below' | 'hidden' {
  let nearest = Infinity;
  for (const m of marks) nearest = Math.min(nearest, Math.hypot(m[0] - player[0], m[1] - player[1]));
  return nearest < clearance.hidePx ? 'hidden' : nearest < clearance.belowPx ? 'below' : 'above';
}

const NS = 'http://www.w3.org/2000/svg';
const ink = 'var(--fw-diagram-event)', halo = 'var(--fw-diagram-shadow)', paper = 'var(--fw-diagram-ground-light)';
const DOT_R: Record<SceneMarkerKind, number> = { player: 5.5, ball: 4.2, anchor: 3.2, provisional: 4, terminal: 3.6 };
type Attributes = Record<string, string | number>;
function attributes(node: Element, values: Attributes): void {
  for (const [key, value] of Object.entries(values)) {
    const text = String(value);
    if (node.getAttribute(key) !== text) node.setAttribute(key, text);
  }
}

/** Pixel radius of a 1σ metre circle around a world point under the camera:
 * the mean of the east and north σ offsets, so perspective foreshortening is
 * averaged rather than picked from one axis. */
export function sigmaScreenRadius(world: Point3M, sigmaM: number, camera: TerrainCamera): number {
  if (!(sigmaM > 0)) return 0;
  const centre = projectTerrainPoint(world, camera);
  const east = projectTerrainPoint([world[0] + sigmaM, world[1], world[2]], camera);
  const north = projectTerrainPoint([world[0], world[1] + sigmaM, world[2]], camera);
  return (Math.hypot(east[0] - centre[0], east[1] - centre[1]) + Math.hypot(north[0] - centre[0], north[1] - centre[1])) / 2;
}

export interface SceneMarkerOverlayController {
  setMarkers(markers: SceneMarkers | null): void;
  setCamera(camera: TerrainCamera, width: number, height: number): void;
  dispose(): void;
}
/** Retained-DOM overlay in the runtime's annotation SVG, painted in the same
 * synchronous frame as the terrain. Markers reconcile by key: a marker that
 * keeps its kind and label keeps its nodes (the player moves every fix
 * without allocating), a changed one is rebuilt, a dropped one is removed.
 * A camera frame only re-projects cached world points. The viewBox belongs
 * to the evidence overlay that shares this SVG and is never touched here. */
export function createSceneMarkerOverlayController(svg: SVGSVGElement, mesh: TerrainMesh,
  surface?: (point: PointM) => number | null, reducedMotion = false): SceneMarkerOverlayController {
  const element = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attributes = {}, text?: string): SVGElementTagNameMap[K] => {
    const node = svg.ownerDocument.createElementNS(NS, tag);
    attributes(node, attrs);
    if (text != null) node.textContent = text;
    return node;
  };
  const root = element('g', { 'data-annotation': 'marked-positions' });
  const links = element('g'), rings = element('g'), dots = element('g'), labels = element('g');
  root.append(links, rings, dots, labels);
  svg.appendChild(root);
  let camera: TerrainCamera | null = null, current: SceneMarkers | null = null, disposed = false, rippleKey: string | null = null;
  const heights = new Map<string, Point3M | null>();
  const world = ([x, y]: PointM): Point3M | null => {
    const key = `${x}:${y}`;
    if (heights.has(key)) return heights.get(key)!;
    if (heights.size > 4096) heights.clear();
    const z = surface?.([x, y]) ?? terrainHeight(mesh, [x, y]);
    const result: Point3M | null = z == null ? null : [x, y, z];
    heights.set(key, result);
    return result;
  };
  type MarkerNodes = { marker: SceneMarker; ring: SVGCircleElement; haloDot: SVGCircleElement; dot: SVGCircleElement; core: SVGCircleElement | null; label: SVGTextElement; ripple: SVGCircleElement | null;
    /** Nodes of the transition in flight (animations and a ghost), cleared by the next one. */
    transient: SVGElement[] };
  const markerNodes = new Map<string, MarkerNodes>();
  type LinkNodes = { link: SceneMarkerLink; shadow: SVGPathElement; path: SVGPathElement;
    /** A shot draws itself on once, when it is completed; never again. */
    revealed: boolean; reveals: SVGElement[] };
  const linkNodes = new Map<string, LinkNodes>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => { const handle = setTimeout(() => { timers.delete(handle); if (!disposed) fn(); }, ms); timers.add(handle); };
  /** §62 geometry between two marks. The arc is exactly the plan's curve,
   * `p(t) = A + t(B−A) + ẑ·4H·t(1−t)`: linear between the two drawn positions
   * plus a parabola, with nothing sampled in between, because there is
   * nothing in between that anyone knows. The connector keeps the same chord
   * in plan and takes its height from the ground under each sample, so a putt
   * rolls over the green instead of through it; where the ground is unknown
   * it falls back to the straight line between the ends and invents no relief. */
  function linkPath(link: SceneMarkerLink, a: Point3M, b: Point3M, view: TerrainCamera): string {
    const apexM = link.basis === 'illustrative_endpoint_arc' ? Math.max(0, link.apexM ?? 0) : 0;
    let path = '';
    for (let i = 0; i <= PATH_SEGMENTS; i++) {
      const t = i / PATH_SEGMENTS;
      const x = a[0] + t * (b[0] - a[0]), y = a[1] + t * (b[1] - a[1]), chord = a[2] + t * (b[2] - a[2]);
      const z = apexM > 0 ? chord + 4 * apexM * t * (1 - t)
        : i === 0 ? a[2] : i === PATH_SEGMENTS ? b[2] : world([x, y])?.[2] ?? chord;
      const q = projectTerrainPoint([x, y, z], view);
      path += `${i ? ' L' : 'M'}${q[0].toFixed(2)},${q[1].toFixed(2)}`;
    }
    return path;
  }
  /** §64: the completed shot draws on over `revealMs` and then holds. The
   * dash is expressed against `pathLength="1"`, so a camera frame may rewrite
   * `d` mid-reveal without the stroke jumping, and no length is measured. */
  function attachReveal(nodes: LinkNodes) {
    if (reducedMotion) return;
    nodes.revealed = true;
    for (const node of [nodes.shadow, nodes.path]) {
      attributes(node, { pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 });
      const animate = element('animate', { attributeName: 'stroke-dashoffset', from: 1, to: 0, dur: `${MARKER_MOTION.revealMs / 1000}s`, fill: 'freeze', 'data-shot-reveal': nodes.link.key });
      node.appendChild(animate);
      nodes.reveals.push(animate);
    }
    later(() => {
      for (const animate of nodes.reveals.splice(0)) animate.remove();
      for (const node of [nodes.shadow, nodes.path]) for (const name of ['stroke-dasharray', 'stroke-dashoffset', 'pathLength']) node.removeAttribute(name);
    }, MARKER_MOTION.revealMs + 40);
  }
  const visible = (nodes: MarkerNodes): SVGElement[] => {
    const all: (SVGElement | null)[] = [nodes.ring, nodes.haloDot, nodes.dot, nodes.core, nodes.label, nodes.ripple];
    return all.filter((n): n is SVGElement => n != null);
  };

  function clearTransient(nodes: MarkerNodes) { for (const n of nodes.transient) n.remove(); nodes.transient = []; }
  function removeMarker(nodes: MarkerNodes) { clearTransient(nodes); for (const n of visible(nodes)) n.remove(); }
  function createMarker(marker: SceneMarker): MarkerNodes {
    const player = marker.kind === 'player', provisional = marker.kind === 'provisional';
    // A mark's ring is its σ at true scale; the player's is a soft accuracy halo.
    const ring = player
      ? element('circle', { fill: ink, 'fill-opacity': .1, stroke: ink, 'stroke-opacity': .3, 'stroke-width': 1, 'data-marked-sigma': marker.key, 'data-marker-halo': 'accuracy' })
      : element('circle', { fill: ink, 'fill-opacity': .08, stroke: ink, 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: .85, 'data-marked-sigma': marker.key });
    const haloDot = element('circle', { fill: halo, opacity: .35 });
    // ◎ YOU: a hollow ring with a core; ● BALL and marks: solid; ○ provisional: hollow.
    const dot = element('circle', { fill: player || provisional ? paper : ink, stroke: player || provisional ? ink : paper,
      'stroke-width': player ? 2 : marker.kind === 'ball' ? 1.6 : 1.4, 'data-marked-position': marker.key, 'data-marker-kind': marker.kind });
    const core = player ? element('circle', { fill: ink, 'data-marker-core': marker.key }) : null;
    const label = element('text', { fill: ink, 'font-size': 10, 'font-weight': 600, 'text-anchor': 'middle', 'letter-spacing': .6, 'paint-order': 'stroke', stroke: paper, 'stroke-width': 3,
      'data-marker-label': marker.key }, marker.label ?? '');
    const nodes: MarkerNodes = { marker, ring, haloDot, dot, core, label, ripple: null, transient: [] };
    applyDimming(nodes);
    return nodes;
  }
  function applyDimming(nodes: MarkerNodes) {
    const opacity = nodes.marker.dimmed ? MARKER_MOTION.dimmedOpacity : 1;
    attributes(nodes.haloDot, { opacity: .35 * opacity });
    attributes(nodes.dot, { opacity });
    attributes(nodes.label, { opacity });
    if (nodes.core) attributes(nodes.core, { opacity });
  }
  function attachRipple(nodes: MarkerNodes) {
    if (reducedMotion) return;
    const r = DOT_R[nodes.marker.kind];
    const ripple = element('circle', { fill: 'none', stroke: ink, 'stroke-width': 1.5, 'data-marker-ripple': nodes.marker.key });
    ripple.appendChild(element('animate', { attributeName: 'r', from: r, to: r * 5, dur: '0.34s', fill: 'freeze' }));
    ripple.appendChild(element('animate', { attributeName: 'opacity', from: .9, to: 0, dur: '0.34s', fill: 'freeze' }));
    nodes.ripple = ripple;
  }
  /** §38: the same key moving from one finalized position to another (or
   * from provisional to final) eases when the shift is small and crossfades
   * when it is large; the player never animates here (its easing is upstream). */
  function transition(previous: SceneMarker, nodes: MarkerNodes) {
    if (reducedMotion || !camera || nodes.marker.kind === 'player') return;
    const before = world(previous.pointM), after = world(nodes.marker.pointM);
    if (!before || !after) return;
    const shift = Math.hypot(after[0] - before[0], after[1] - before[1]);
    if (shift === 0) return;
    clearTransient(nodes);
    const p = projectTerrainPoint(before, camera), q = projectTerrainPoint(after, camera);
    const targets = [nodes.ring, nodes.haloDot, nodes.dot, nodes.label];
    if (shift <= MARKER_MOTION.settleMaxM) {
      nodes.transient = targets.map(n => { const a = element('animateTransform', { attributeName: 'transform', type: 'translate', from: `${(p[0] - q[0]).toFixed(2)} ${(p[1] - q[1]).toFixed(2)}`, to: '0 0',
        dur: `${MARKER_MOTION.settleMs / 1000}s`, fill: 'remove', 'data-marker-settle': nodes.marker.key }); n.appendChild(a); return a; });
      later(() => clearTransient(nodes), MARKER_MOTION.settleMs + 40);
      return;
    }
    nodes.transient = targets.map(n => { const a = element('animate', { attributeName: 'opacity', from: 0, to: n === nodes.haloDot ? .35 : 1, dur: `${MARKER_MOTION.crossfadeMs / 1000}s`, fill: 'remove',
      'data-marker-crossfade': nodes.marker.key }); n.appendChild(a); return a; });
    const ghost = element('circle', { cx: p[0].toFixed(2), cy: p[1].toFixed(2), r: DOT_R[previous.kind], fill: previous.kind === 'provisional' ? paper : ink, stroke: previous.kind === 'provisional' ? ink : paper,
      'stroke-width': 1.4, 'data-marker-ghost': nodes.marker.key });
    ghost.appendChild(element('animate', { attributeName: 'opacity', from: 1, to: 0, dur: `${MARKER_MOTION.crossfadeMs / 1000}s`, fill: 'freeze' }));
    dots.appendChild(ghost);
    nodes.transient.push(ghost);
    later(() => clearTransient(nodes), MARKER_MOTION.crossfadeMs + 40);
  }
  function reconcile(next: SceneMarkers | null) {
    const wanted = new Set(next?.markers.map(m => m.key));
    for (const [key, nodes] of markerNodes) if (!wanted.has(key)) { removeMarker(nodes); markerNodes.delete(key); }
    const wantedLinks = new Set(next?.links.map(l => l.key));
    for (const [key, nodes] of linkNodes) if (!wantedLinks.has(key)) { nodes.shadow.remove(); nodes.path.remove(); linkNodes.delete(key); }
    if (!next) { rippleKey = null; return; }
    // Shots are re-appended in play order, so the newest lies over the older
    // ones, and their §63 opacity is re-applied on every pass: a shot that
    // was the current one falls back as the next shot is completed.
    for (const link of next.links) {
      let nodes = linkNodes.get(link.key);
      if (!nodes) {
        const shadow = element('path', { fill: 'none', stroke: halo, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
        const path = element('path', { fill: 'none', stroke: ink, 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'data-marked-link': link.key });
        nodes = { link, shadow, path, revealed: false, reveals: [] };
        linkNodes.set(link.key, nodes);
      }
      nodes.link = link;
      const basis = link.basis ?? 'surface_connector', opacity = link.opacity ?? 1;
      attributes(nodes.path, { opacity, 'data-trajectory-basis': basis });
      attributes(nodes.shadow, { opacity: .35 * opacity });
      // The DOM says what the shape is: an arc is labelled art wherever it is
      // read, and the connector is left unlabelled because A → B is the fact.
      if (basis === 'illustrative_endpoint_arc') attributes(nodes.path, { 'data-illustrative': 'endpoint_arc' });
      else nodes.path.removeAttribute('data-illustrative');
      if (link.reveal && !nodes.revealed) attachReveal(nodes);
      links.append(nodes.shadow, nodes.path);
    }
    const nextRipple = next.rippleKey ?? null;
    for (const marker of next.markers) {
      let nodes = markerNodes.get(marker.key);
      const previous = nodes?.marker ?? null;
      if (nodes && (previous!.kind !== marker.kind || previous!.label !== marker.label)) { removeMarker(nodes); nodes = undefined; }
      if (!nodes) { nodes = createMarker(marker); markerNodes.set(marker.key, nodes); }
      else if (previous!.dimmed !== marker.dimmed) { nodes.marker = marker; applyDimming(nodes); }
      nodes.marker = marker;
      if (nodes.ripple && (nextRipple !== marker.key || rippleKey !== nextRipple)) { nodes.ripple.remove(); nodes.ripple = null; }
      if (nextRipple === marker.key && rippleKey !== nextRipple) attachRipple(nodes);
      if (previous && (previous.pointM[0] !== marker.pointM[0] || previous.pointM[1] !== marker.pointM[1])) transition(previous, nodes);
      // Re-append in marker order so the newest and the player stay on top.
      rings.appendChild(nodes.ring); dots.append(nodes.haloDot, nodes.dot); if (nodes.core) dots.appendChild(nodes.core); labels.appendChild(nodes.label);
      if (nodes.ripple) dots.appendChild(nodes.ripple);
    }
    rippleKey = nextRipple;
  }
  function paint() {
    if (!camera || !current) return;
    for (const link of current.links) {
      const nodes = linkNodes.get(link.key); if (!nodes) continue;
      const a = world(link.fromM), b = world(link.toM);
      // No ground under an end: the shot is not drawn. A height is never guessed.
      if (!a || !b) { attributes(nodes.path, { display: 'none' }); attributes(nodes.shadow, { display: 'none' }); continue; }
      const shape = { d: linkPath(link, a, b, camera), display: 'inline' };
      attributes(nodes.path, shape); attributes(nodes.shadow, shape);
    }
    const markScreen: [number, number][] = [];
    for (const marker of current.markers) {
      if (marker.kind === 'player') continue;
      const w = world(marker.pointM);
      if (w) { const [px, py] = projectTerrainPoint(w, camera); markScreen.push([px, py]); }
    }
    for (const marker of current.markers) {
      const nodes = markerNodes.get(marker.key); if (!nodes) continue;
      const w = world(marker.pointM);
      if (!w) { for (const n of visible(nodes)) attributes(n, { display: 'none' }); continue; }
      const [x, y] = projectTerrainPoint(w, camera), r = DOT_R[marker.kind];
      const sigma = sigmaScreenRadius(w, marker.sigmaM, camera);
      attributes(nodes.ring, { cx: x.toFixed(2), cy: y.toFixed(2), r: Math.max(sigma, 0).toFixed(2), display: sigma > r ? 'inline' : 'none' });
      attributes(nodes.haloDot, { cx: x.toFixed(2), cy: (y + 1.2).toFixed(2), r: (r + 1.5).toFixed(2), display: 'inline' });
      attributes(nodes.dot, { cx: x.toFixed(2), cy: y.toFixed(2), r, display: 'inline' });
      if (nodes.core) attributes(nodes.core, { cx: x.toFixed(2), cy: y.toFixed(2), r: (r * .4).toFixed(2), display: 'inline' });
      const placement = marker.kind === 'player' ? playerLabelPlacement([x, y], markScreen) : 'above';
      attributes(nodes.label, { x: x.toFixed(2), y: (placement === 'below' ? y + r + 13 : y - r - 5).toFixed(2), display: marker.label && placement !== 'hidden' ? 'inline' : 'none', 'data-label-placement': placement });
      if (nodes.ripple) attributes(nodes.ripple, { cx: x.toFixed(2), cy: y.toFixed(2), display: 'inline' });
    }
  }
  return {
    setMarkers(next) {
      if (disposed) return;
      current = next && (next.markers.length || next.links.length) ? next : null;
      reconcile(current);
      paint();
    },
    setCamera(next, _width, _height) {
      if (disposed) return;
      camera = next;
      paint();
    },
    dispose() {
      disposed = true;
      for (const handle of timers) clearTimeout(handle);
      timers.clear();
      root.remove();
      markerNodes.clear(); linkNodes.clear(); heights.clear();
    },
  };
}
