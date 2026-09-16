import { projectTerrainPoint, terrainHeight, type Point3M, type TerrainCamera, type TerrainMesh } from './terrain';
import type { PointM } from './types';

/** Marked positions on the course (One-Tap master plan "Player-facing
 * design"). A marker is a position the player asserted ("the ball is here
 * now") with its retained σ; it is neither shot evidence reconstructed from
 * distances nor a pin. The renderer draws the σ ring at true scale so
 * uncertainty is shown, never hidden, and never moves a marker onto a
 * surface. Links join consecutive live marks: the derived shot. */
export type SceneMarkerKind = 'you' | 'anchor' | 'provisional' | 'terminal';
export interface SceneMarker {
  key: string;
  pointM: PointM;
  kind: SceneMarkerKind;
  /** 1σ horizontal position uncertainty in metres (0 hides the ring). */
  sigmaM: number;
  /** Short label beside the dot: 'YOU', a stroke number, or nothing. */
  label?: string;
}
export interface SceneMarkerLink {
  key: string;
  fromM: PointM;
  toM: PointM;
}
export interface SceneMarkers {
  markers: readonly SceneMarker[];
  links: readonly SceneMarkerLink[];
  /** Ripple once around this marker (a fresh mark); omitted under Reduced Motion. */
  rippleKey?: string | null;
}
export const EMPTY_SCENE_MARKERS: SceneMarkers = Object.freeze({ markers: [], links: [] });

const NS = 'http://www.w3.org/2000/svg';
const ink = 'var(--fw-diagram-event)', halo = 'var(--fw-diagram-shadow)', paper = 'var(--fw-diagram-ground-light)';
const DOT_R: Record<SceneMarkerKind, number> = { you: 5, anchor: 3.2, provisional: 4, terminal: 3.6 };
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
 * synchronous frame as the terrain. Marker changes allocate nodes; a camera
 * frame only re-projects cached world points. The viewBox belongs to the
 * evidence overlay that shares this SVG and is never touched here. */
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
  let camera: TerrainCamera | null = null, current: SceneMarkers | null = null, disposed = false;
  const heights = new Map<string, Point3M | null>();
  const world = ([x, y]: PointM): Point3M | null => {
    const key = `${x}:${y}`;
    if (heights.has(key)) return heights.get(key)!;
    const z = surface?.([x, y]) ?? terrainHeight(mesh, [x, y]);
    const result: Point3M | null = z == null ? null : [x, y, z];
    heights.set(key, result);
    return result;
  };
  type MarkerNodes = { ring: SVGCircleElement; haloDot: SVGCircleElement; dot: SVGCircleElement; label: SVGTextElement; ripple: SVGCircleElement | null };
  const markerNodes = new Map<string, MarkerNodes>();
  const linkNodes = new Map<string, { shadow: SVGLineElement; line: SVGLineElement }>();

  function rebuild(next: SceneMarkers | null) {
    for (const nodes of markerNodes.values()) { nodes.ring.remove(); nodes.haloDot.remove(); nodes.dot.remove(); nodes.label.remove(); nodes.ripple?.remove(); }
    for (const nodes of linkNodes.values()) { nodes.shadow.remove(); nodes.line.remove(); }
    markerNodes.clear(); linkNodes.clear();
    if (!next) return;
    for (const link of next.links) {
      const shadow = element('line', { stroke: halo, 'stroke-width': 4, 'stroke-linecap': 'round', opacity: .35 });
      const line = element('line', { stroke: ink, 'stroke-width': 1.8, 'stroke-linecap': 'round', 'data-marked-link': link.key });
      links.append(shadow, line);
      linkNodes.set(link.key, { shadow, line });
    }
    for (const marker of next.markers) {
      const ring = element('circle', { fill: ink, 'fill-opacity': .08, stroke: ink, 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: .85, 'data-marked-sigma': marker.key });
      const haloDot = element('circle', { fill: halo, opacity: .35 });
      const dot = element('circle', { fill: marker.kind === 'provisional' ? paper : ink, stroke: marker.kind === 'provisional' ? ink : paper,
        'stroke-width': marker.kind === 'you' ? 2 : 1.4, 'data-marked-position': marker.key, 'data-marker-kind': marker.kind });
      const label = element('text', { fill: ink, 'font-size': 10, 'font-weight': 600, 'text-anchor': 'middle', 'letter-spacing': .6, 'paint-order': 'stroke', stroke: paper, 'stroke-width': 3,
        'data-marker-label': marker.key }, marker.label ?? '');
      let ripple: SVGCircleElement | null = null;
      if (next.rippleKey === marker.key && !reducedMotion) {
        ripple = element('circle', { fill: 'none', stroke: ink, 'stroke-width': 1.5, 'data-marker-ripple': marker.key });
        ripple.appendChild(element('animate', { attributeName: 'r', from: DOT_R[marker.kind], to: DOT_R[marker.kind] * 5, dur: '0.34s', fill: 'freeze' }));
        ripple.appendChild(element('animate', { attributeName: 'opacity', from: .9, to: 0, dur: '0.34s', fill: 'freeze' }));
      }
      rings.appendChild(ring); dots.append(haloDot, dot); labels.appendChild(label);
      if (ripple) dots.appendChild(ripple);
      markerNodes.set(marker.key, { ring, haloDot, dot, label, ripple });
    }
  }
  function paint() {
    if (!camera || !current) return;
    for (const link of current.links) {
      const nodes = linkNodes.get(link.key); if (!nodes) continue;
      const a = world(link.fromM), b = world(link.toM);
      if (!a || !b) { attributes(nodes.line, { display: 'none' }); attributes(nodes.shadow, { display: 'none' }); continue; }
      const p = projectTerrainPoint(a, camera), q = projectTerrainPoint(b, camera);
      const coords = { x1: p[0].toFixed(2), y1: p[1].toFixed(2), x2: q[0].toFixed(2), y2: q[1].toFixed(2), display: 'inline' };
      attributes(nodes.line, coords); attributes(nodes.shadow, coords);
    }
    for (const marker of current.markers) {
      const nodes = markerNodes.get(marker.key); if (!nodes) continue;
      const w = world(marker.pointM);
      if (!w) { for (const n of [nodes.ring, nodes.haloDot, nodes.dot, nodes.label, nodes.ripple]) if (n) attributes(n, { display: 'none' }); continue; }
      const [x, y] = projectTerrainPoint(w, camera), r = DOT_R[marker.kind];
      const sigma = sigmaScreenRadius(w, marker.sigmaM, camera);
      attributes(nodes.ring, { cx: x.toFixed(2), cy: y.toFixed(2), r: Math.max(sigma, 0).toFixed(2), display: sigma > r ? 'inline' : 'none' });
      attributes(nodes.haloDot, { cx: x.toFixed(2), cy: (y + 1.2).toFixed(2), r: (r + 1.5).toFixed(2), display: 'inline' });
      attributes(nodes.dot, { cx: x.toFixed(2), cy: y.toFixed(2), r, display: 'inline' });
      attributes(nodes.label, { x: x.toFixed(2), y: (y - r - 5).toFixed(2), display: marker.label ? 'inline' : 'none' });
      if (nodes.ripple) attributes(nodes.ripple, { cx: x.toFixed(2), cy: y.toFixed(2), display: 'inline' });
    }
  }
  return {
    setMarkers(next) {
      if (disposed) return;
      current = next && (next.markers.length || next.links.length) ? next : null;
      rebuild(current);
      paint();
    },
    setCamera(next, _width, _height) {
      if (disposed) return;
      camera = next;
      paint();
    },
    dispose() {
      disposed = true;
      root.remove();
      markerNodes.clear(); linkNodes.clear(); heights.clear();
    },
  };
}
