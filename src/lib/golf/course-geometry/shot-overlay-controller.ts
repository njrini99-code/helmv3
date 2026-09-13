import { layoutShotOverlay, prepareShotOverlay, type ShotOverlayLayout } from './shot-overlay-layout';
import { projectTerrainPoint, terrainHeight, type Point3M, type TerrainCamera, type TerrainMesh } from './terrain';
import type { HoleScene, LocalFeature, PointM } from './types';

const NS = 'http://www.w3.org/2000/svg';
const ink = 'var(--fw-diagram-event)', ground = 'var(--fw-diagram-ground)', shadow = 'var(--fw-diagram-shadow)';
type Attributes = Record<string, string | number | boolean>;

function attributes(node: SVGElement, values: Attributes): void {
  for (const [key, value] of Object.entries(values)) {
    const text = String(value);
    if (node.getAttribute(key) !== text) node.setAttribute(key, text);
  }
}

/** A retained DOM view of the SAME validated layout as CourseShotOverlay.
 * Construction/evidence changes allocate nodes. A camera frame only projects
 * cached world points and updates existing attributes, with no React commit. */
export function createShotOverlayController(svg: SVGSVGElement, prefix: string, mesh: TerrainMesh,
  initialScene: HoleScene, initialSelected?: number) {
  const element = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attributes = {}, text?: string): SVGElementTagNameMap[K] => {
    const node = svg.ownerDocument.createElementNS(NS, tag);
    attributes(node, attrs);
    if (text != null) node.textContent = text;
    return node;
  };
  const root = element('g', { 'data-annotation': 'shot-evidence' });
  svg.appendChild(root);
  let prepared = prepareShotOverlay(initialScene, initialSelected);
  let currentScene = initialScene, currentSelected = initialSelected;
  let camera: TerrainCamera | null = null, width = 0, height = 0, disposed = false;
  const points = new Map<string, Point3M | null>();
  let features = new WeakMap<LocalFeature, (Point3M | null)[][][]>();
  const point = ([x, y]: PointM): Point3M | null => {
    const key = `${x}:${y}`;
    if (points.has(key)) return points.get(key)!;
    const z = terrainHeight(mesh, [x, y]);
    const result: Point3M | null = z == null ? null : [x, y, z];
    points.set(key, result);
    return result;
  };
  const projected = (world: Point3M): PointM => {
    const [x, y] = projectTerrainPoint(world, camera!);
    return [x, y];
  };
  const project = (p: PointM): PointM | null => {
    const world = point(p);
    return world ? projected(world) : null;
  };
  const pathForFeature = (feature: LocalFeature): string | null => {
    let parts = features.get(feature);
    if (!parts) { parts = feature.parts.map(part => part.map(ring => ring.map(point))); features.set(feature, parts); }
    if (parts.some(part => part.some(ring => ring.some(p => p == null)))) return null;
    return parts.map(part => part.map(ring => ring.map((p, index) => {
      const [x, y] = projected(p!);
      return `${index ? 'L' : 'M'}${x.toFixed(3)},${y.toFixed(3)}`;
    }).join(' ') + ' Z').join(' ')).join(' ');
  };

  const defs = element('defs');
  const patternId = `${prefix}-possible`;
  const pattern = element('pattern', { id: patternId, patternUnits: 'userSpaceOnUse', width: 8, height: 8, patternTransform: 'rotate(-35)' });
  pattern.appendChild(element('path', { d: 'M0 0 V8', stroke: ground, 'stroke-width': 1.1, opacity: .55 }));
  defs.appendChild(pattern);
  const regions = element('g'), segments = element('g'), anchors = element('g'), badges = element('g');
  const pin = element('g', { 'data-target': 'estimated-pin', display: 'none' });
  root.append(defs, regions, segments, anchors, pin, badges);
  type RegionNodes = { group: SVGGElement; title: SVGTitleElement; clip: SVGPathElement; halo: SVGPathElement; outline: SVGPathElement;
    feasible: SVGGElement; fill: SVGPathElement; hatch: SVGPathElement };
  type SegmentNodes = { group: SVGGElement; halo: SVGLineElement; line: SVGLineElement };
  type BadgeNodes = { group: SVGGElement; leader: SVGLineElement; circle: SVGCircleElement; text: SVGTextElement };
  const regionNodes = new Map<string, RegionNodes>(), segmentNodes = new Map<string, SegmentNodes>();
  const anchorNodes = new Map<string, SVGCircleElement>(), badgeNodes = new Map<string, BadgeNodes>();
  let nextClip = 0;
  pin.appendChild(element('title', {}, 'Estimated pin. The actual daily cup location is unknown.'));
  const pinLeader = element('line', { stroke: ink, 'stroke-width': .7, 'stroke-dasharray': '2 3', opacity: .65 });
  const pinAnchor = element('circle', { 'data-pin-anchor': 'estimated', r: 2.5, fill: 'var(--fw-diagram-green)', stroke: ink, 'stroke-width': 1.4 });
  const pinGlyph = element('g', { stroke: shadow, 'stroke-width': .6, 'stroke-linejoin': 'round' });
  pinGlyph.append(element('path', { d: 'M0 -2 V-20', fill: 'none', stroke: ink, 'stroke-width': 1.5 }),
    element('path', { d: 'M0 -20 L11 -16 L0 -12 Z', fill: ink }));
  const pinPill = element('rect', { width: 88, height: 20, rx: 10, fill: ink, 'fill-opacity': .94 });
  const pinText = element('text', { dy: '.35em', 'text-anchor': 'middle', 'font-family': 'inherit', 'font-size': 11, 'font-weight': 500, fill: ground }, 'Estimated pin');
  pin.append(pinLeader, pinAnchor, pinGlyph, pinPill, pinText);

  function paint(layout: ShotOverlayLayout) {
    const usedRegions = new Set<string>();
    for (const region of layout.regions) {
      usedRegions.add(region.key);
      let nodes = regionNodes.get(region.key);
      if (!nodes) {
        const clipId = `${prefix}-region-${nextClip++}`;
        const clipPath = element('clipPath', { id: clipId });
        const clip = element('path', { 'clip-rule': 'evenodd' });
        clipPath.appendChild(clip); defs.appendChild(clipPath);
        const group = element('g', { 'data-position-basis': 'compatible-surface' });
        const title = element('title'); group.appendChild(title);
        const halo = element('path', { 'data-candidate-outline': 'halo', fill: 'none', stroke: shadow, 'stroke-width': 3.2, opacity: .32 });
        const outline = element('path', { 'data-candidate-outline': 'boundary', fill: 'none', stroke: ink,
          'stroke-width': 1.4, 'stroke-dasharray': '4 4', 'stroke-linejoin': 'round', opacity: .9 });
        const feasible = element('g', { 'clip-path': `url(#${clipId})`, 'data-position-basis': 'sampled-feasible-region' });
        const fill = element('path', { fill: ink, opacity: .24 }), hatch = element('path', { fill: `url(#${patternId})` });
        feasible.append(fill, hatch); group.append(halo, outline, feasible); regions.appendChild(group);
        nodes = { group, title, clip, halo, outline, feasible, fill, hatch }; regionNodes.set(region.key, nodes);
      }
      const description = `Candidate surface for shot ${region.shotNumber}. The outline identifies a possible surface; hatching shows sampled possible finishes. Pin unknown; alternatives remain.`;
      if (nodes.title.textContent !== description) nodes.title.textContent = description;
      attributes(nodes.group, { display: 'inline', 'data-possible-area': region.shotNumber, 'data-candidate-feature': region.featureId });
      attributes(nodes.halo, { d: region.clip }); attributes(nodes.outline, { d: region.clip });
      attributes(nodes.feasible, { 'data-feasible-region': Boolean(region.d) });
      attributes(nodes.clip, { d: region.clip }); attributes(nodes.fill, { d: region.d }); attributes(nodes.hatch, { d: region.d });
    }
    for (const [key, nodes] of regionNodes) if (!usedRegions.has(key)) attributes(nodes.group, { display: 'none' });

    const usedSegments = new Set<string>();
    for (const segment of layout.segments) {
      usedSegments.add(segment.key);
      let nodes = segmentNodes.get(segment.key);
      if (!nodes) {
        const group = element('g', { 'data-distance-basis': 'inferred-endpoint-separation' });
        const halo = element('line', { stroke: shadow, opacity: .4 });
        const line = element('line', { stroke: ink, 'stroke-linecap': 'round', 'stroke-dasharray': '5 6' });
        group.append(halo, line); segments.appendChild(group);
        nodes = { group, halo, line }; segmentNodes.set(segment.key, nodes);
      }
      attributes(nodes.group, { display: 'inline', 'data-shot-segment': segment.shotNumber, 'data-selected': segment.active });
      const ends = { x1: segment.from[0], y1: segment.from[1], x2: segment.to[0], y2: segment.to[1] };
      attributes(nodes.halo, { ...ends, 'stroke-width': segment.active ? 4.4 : 3.5 });
      attributes(nodes.line, { ...ends, 'stroke-width': segment.active ? 2.4 : 1.6, opacity: segment.active ? 1 : .65 });
    }
    for (const [key, nodes] of segmentNodes) if (!usedSegments.has(key)) attributes(nodes.group, { display: 'none' });

    const usedAnchors = new Set<string>();
    for (const anchor of layout.anchors) {
      usedAnchors.add(anchor.key);
      let node = anchorNodes.get(anchor.key);
      if (!node) {
        node = element('circle', { 'data-anchor': 'estimated', r: 2.5, fill: ground, stroke: ink, 'stroke-width': 1.5 });
        anchors.appendChild(node); anchorNodes.set(anchor.key, node);
      }
      attributes(node, { display: 'inline', cx: anchor.point[0], cy: anchor.point[1] });
    }
    for (const [key, node] of anchorNodes) if (!usedAnchors.has(key)) attributes(node, { display: 'none' });

    attributes(pin, { display: layout.pin ? 'inline' : 'none' });
    if (layout.pin) {
      const { position: p, label, basis } = layout.pin;
      attributes(pin, { 'data-target-basis': basis });
      attributes(pinLeader, { x1: p[0], y1: p[1], x2: label[0], y2: label[1] });
      attributes(pinAnchor, { cx: p[0], cy: p[1] });
      attributes(pinGlyph, { transform: `translate(${p[0]},${p[1]}) scale(${layout.pin.glyphScale})` });
      attributes(pinPill, { x: label[0] - 44, y: label[1] - 10 });
      attributes(pinText, { x: label[0], y: label[1] });
    }

    const usedBadges = new Set<string>();
    for (const badge of layout.badges) {
      usedBadges.add(badge.key);
      let nodes = badgeNodes.get(badge.key);
      if (!nodes) {
        const group = element('g');
        const leader = element('line', { stroke: ink, 'stroke-width': .8, opacity: .7 });
        const circle = element('circle', { fill: ink, stroke: shadow });
        const text = element('text', { dy: '.35em', 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 600, 'font-family': 'inherit', fill: ground });
        group.append(leader, circle, text); badges.appendChild(group);
        nodes = { group, leader, circle, text }; badgeNodes.set(badge.key, nodes);
      }
      attributes(nodes.group, { display: 'inline', 'data-event': badge.shotNumber, 'data-selected': badge.active });
      attributes(nodes.leader, { x1: badge.anchor[0], y1: badge.anchor[1], x2: badge.label[0], y2: badge.label[1] });
      attributes(nodes.circle, { cx: badge.label[0], cy: badge.label[1], r: badge.active ? 12 : 11, 'stroke-width': badge.active ? 2 : 1 });
      attributes(nodes.text, { x: badge.label[0], y: badge.label[1] });
      if (nodes.text.textContent !== String(badge.shotNumber)) nodes.text.textContent = String(badge.shotNumber);
    }
    for (const [key, nodes] of badgeNodes) if (!usedBadges.has(key)) attributes(nodes.group, { display: 'none' });
  }

  function render() {
    if (!camera || disposed) return;
    attributes(svg, { viewBox: `0 0 ${width} ${height}` });
    const layout = layoutShotOverlay(prepared, { width, height, project, pathForFeature,
      reservedRects: [{ x: 0, y: 0, width, height: Math.min(88, height * .24) },
        { x: width - 64, y: height - 164, width: 64, height: 164 }] });
    paint(layout);
  }
  return {
    setCamera(next: TerrainCamera, w: number, h: number) { camera = next; width = w; height = h; render(); },
    setEvidence(scene: HoleScene, selectedShotNumber?: number) {
      if (disposed || currentScene === scene && currentSelected === selectedShotNumber) return;
      prepared = prepareShotOverlay(scene, selectedShotNumber);
      if (currentScene !== scene) { points.clear(); features = new WeakMap(); }
      currentScene = scene; currentSelected = selectedShotNumber;
      render();
    },
    dispose() { if (!disposed) { disposed = true; root.remove(); points.clear(); } },
  };
}
