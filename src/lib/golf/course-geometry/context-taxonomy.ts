/** Outside-world taxonomy (production player-view spec, 2026-09-16, §5, §33–34).
 *
 * Every visible region outside the playing surfaces must belong to one of
 * these classes or be reported as `uncertain`; "dark green ground" is never a
 * fallback. Classes are display vocabulary for the context layer: none of
 * them is a player measurement, and a zone never changes the canonical
 * playing-surface package or shot reconstruction. */

import contextRules from './context-rules.json';

export const CONTEXT_CLASS_GROUPS = {
  playing: ['tee', 'fairway', 'approach', 'apron', 'fringe', 'green'],
  surrounds: ['rough_primary', 'rough_secondary', 'rough_native', 'bunker_surround', 'green_surround', 'bailout'],
  woodland: ['woodland_edge', 'tree_belt', 'forest_mass', 'forest_interior', 'isolated_tree', 'tree_cluster', 'understory'],
  terrain: ['ridge', 'shoulder', 'swale', 'ravine', 'bank', 'depression', 'drainage', 'hillside'],
  built: ['clubhouse', 'building', 'maintenance', 'bridge', 'wall', 'stairs', 'fence', 'parking', 'lift_line', 'recreation'],
  mobility: ['cart_path', 'service_path', 'road', 'crossing', 'path_shoulder'],
  adjacent: ['adjacent_fairway', 'adjacent_tee', 'adjacent_green', 'adjacent_bunker', 'crossing_corridor', 'buffer_grass'],
  water: ['pond_edge', 'stream', 'wetland', 'shoreline_vegetation', 'open_field', 'ski_slope'],
  unknown: ['uncertain'],
} as const;
export type ContextClassGroup = keyof typeof CONTEXT_CLASS_GROUPS;
export type ContextClass = typeof CONTEXT_CLASS_GROUPS[ContextClassGroup][number];
export const CONTEXT_CLASSES = Object.values(CONTEXT_CLASS_GROUPS).flat() as readonly ContextClass[];

/** §33 fidelity tiers: how precisely a class must be authored before it may
 * be drawn at full strength. High-precision classes are drawn only from
 * explicit source geometry; low-precision classes may be coarse fills. */
export type ContextFidelity = 'high' | 'medium' | 'low';
export const CONTEXT_FIDELITY: Record<ContextClass, ContextFidelity> = {
  tee: 'high', fairway: 'high', approach: 'medium', apron: 'high', fringe: 'high', green: 'high',
  rough_primary: 'medium', rough_secondary: 'medium', rough_native: 'low', bunker_surround: 'high', green_surround: 'medium', bailout: 'medium',
  woodland_edge: 'medium', tree_belt: 'medium', forest_mass: 'low', forest_interior: 'low', isolated_tree: 'high', tree_cluster: 'medium', understory: 'medium',
  ridge: 'medium', shoulder: 'medium', swale: 'medium', ravine: 'medium', bank: 'medium', depression: 'medium', drainage: 'medium', hillside: 'low',
  clubhouse: 'high', building: 'high', maintenance: 'high', bridge: 'high', wall: 'high', stairs: 'high', fence: 'medium', parking: 'medium', lift_line: 'medium', recreation: 'medium',
  cart_path: 'high', service_path: 'high', road: 'high', crossing: 'high', path_shoulder: 'medium',
  adjacent_fairway: 'high', adjacent_tee: 'high', adjacent_green: 'high', adjacent_bunker: 'high', crossing_corridor: 'medium', buffer_grass: 'medium',
  pond_edge: 'high', stream: 'high', wetland: 'medium', shoreline_vegetation: 'medium', open_field: 'low', ski_slope: 'low',
  uncertain: 'low',
};

/** How the renderer treats each class: a ground tone painted into the visual
 * artifact, a draped ribbon along a line, an extruded footprint, a vegetation
 * layer, or nothing until the authoring pass resolves it. */
export type ContextRender = 'ground' | 'ribbon' | 'extrude' | 'vegetation' | 'line' | 'none';
export const CONTEXT_RENDER: Record<ContextClass, ContextRender> = {
  tee: 'ground', fairway: 'ground', approach: 'ground', apron: 'ground', fringe: 'ground', green: 'ground',
  rough_primary: 'ground', rough_secondary: 'ground', rough_native: 'ground', bunker_surround: 'ground', green_surround: 'ground', bailout: 'ground',
  woodland_edge: 'vegetation', tree_belt: 'vegetation', forest_mass: 'vegetation', forest_interior: 'vegetation', isolated_tree: 'vegetation', tree_cluster: 'vegetation', understory: 'vegetation',
  ridge: 'none', shoulder: 'none', swale: 'none', ravine: 'none', bank: 'none', depression: 'none', drainage: 'line', hillside: 'none',
  clubhouse: 'extrude', building: 'extrude', maintenance: 'extrude', bridge: 'ribbon', wall: 'line', stairs: 'none', fence: 'line', parking: 'ground', lift_line: 'line', recreation: 'ground',
  cart_path: 'ribbon', service_path: 'ribbon', road: 'ribbon', crossing: 'ribbon', path_shoulder: 'ground',
  adjacent_fairway: 'ground', adjacent_tee: 'ground', adjacent_green: 'ground', adjacent_bunker: 'ground', crossing_corridor: 'ground', buffer_grass: 'ground',
  pond_edge: 'ground', stream: 'ribbon', wetland: 'ground', shoreline_vegetation: 'vegetation', open_field: 'ground', ski_slope: 'ground',
  uncertain: 'none',
};

/** Source rules: OpenStreetMap tags → class, shared with
 * `scripts/golf/course-geometry/prepare-context-layer.py` through
 * `context-rules.json`. Order matters; the first match wins. `geometry` says
 * which OSM geometry the class accepts. Widths and heights are display
 * defaults used only when the source carries none; they are the only invented
 * numbers in the layer and every zone records which ones it used. */
export interface ContextSourceRule { readonly tag: string; readonly value: string | '*'; readonly class: ContextClass; readonly geometry: 'line' | 'area' | 'any'; readonly widthM?: number; readonly heightM?: number }
export const OSM_CONTEXT_RULES: readonly ContextSourceRule[] = contextRules as ContextSourceRule[];

/** §39 review prompts, kept with the taxonomy so the authoring pass and the
 * signoff report ask the same questions of every hole. */
export const CONTEXT_REVIEW_PROMPTS = [
  'Where does the maintained golf corridor end?',
  'What is the large non-fairway area actually representing?',
  'Are the woods too sparse or too dense?',
  'Is a neighboring hole visible in reality?',
  'Is there a path that should be present?',
  'Is the slope / bank being shown clearly?',
  'Does the green sit inside believable surrounding land?',
  'Does the hole have any built context nearby?',
  'What makes this hole distinct from the last one?',
  'Does this scene still feel like generic green filler?',
] as const;

export function isContextClass(value: string): value is ContextClass { return (CONTEXT_CLASSES as readonly string[]).includes(value); }
export function contextGroup(cls: ContextClass): ContextClassGroup {
  for (const [group, classes] of Object.entries(CONTEXT_CLASS_GROUPS)) if ((classes as readonly string[]).includes(cls)) return group as ContextClassGroup;
  return 'unknown';
}
