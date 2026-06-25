/* city-districts.js — district zoning + per-district architecture metadata for
   the Agent City. Imported ONLY by city-engine.js. Pure data + layout math; no
   Pixi, no DOM, no network. Cream/green tokens live in city-engine's C palette;
   here we only carry archetype keys + relative tint multipliers so neighborhoods
   read at a glance.  Districts are derived LIVE from telemetry — this file only
   supplies the cosmetic archetype for a known district NAME, with an honest
   default for any name we don't recognise. */

// Archetype keys consumed by city-engine's drawBuilding() switch. Each known
// district maps to a silhouette family + a subtle ground-tint token name + a
// short glyph for the floating nameplate. Order hint sorts clusters left→right.
export const DISTRICT_ARCHETYPES = {
  "Component Foundry":        { arch: "foundry",     tint: "g700", glyph: "⚒", order: 1 },
  "Observatory":             { arch: "observatory", tint: "teal", glyph: "◐", order: 2 },
  "Integration Harbor":      { arch: "harbor",      tint: "teal", glyph: "⚓", order: 3 },
  "Backend Machine Shop":     { arch: "machineshop", tint: "g700", glyph: "⚙", order: 4 },
  "Permission Control Tower": { arch: "tower",       tint: "g600", glyph: "⛨", order: 5 },
  "Data District":           { arch: "data",        tint: "g800", glyph: "▤", order: 6 },
  "Shipping Dock":           { arch: "dock",        tint: "teal", glyph: "⇲", order: 7 },
  "Code Quarry":             { arch: "quarry",      tint: "tan",  glyph: "◭", order: 8 },
  "QA Lab":                  { arch: "qalab",       tint: "mint", glyph: "⚗", order: 9 },
  // agent-home zones (no buildings, but they get a labelled plaza)
  "Prompt Plaza":            { arch: "plaza",       tint: "mint", glyph: "✦", order: 0,  isZone: true },
  "Broadcast Center":        { arch: "plaza",       tint: "g600", glyph: "📡", order: 10, isZone: true },
  "Memory Library":          { arch: "library",     tint: "tan",  glyph: "❡", order: 11, isZone: true },
};

const DEFAULT_ARCH = { arch: "generic", tint: "g700", glyph: "▦", order: 50 };

export function archetypeFor(name) {
  return DISTRICT_ARCHETYPES[name] || { ...DEFAULT_ARCH };
}

/* Group packets into their real districts.  Returns an ordered array of
   { name, arch, tint, glyph, order, packets:[...], count } — buildings only.
   Districts with zero packets are dropped (honest: no empty neighborhoods). */
export function zonePackets(packets) {
  const byName = new Map();
  for (const p of packets) {
    const name = p.district || "Unzoned";
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(p);
  }
  const out = [];
  for (const [name, list] of byName) {
    const a = archetypeFor(name);
    if (a.isZone) continue; // home zones hold agents, not buildings
    out.push({ name, ...a, packets: list, count: list.length });
  }
  out.sort((x, y) => (x.order - y.order) || (y.count - x.count) || x.name.localeCompare(y.name));
  return out;
}

/* Pick the home-zone districts that actually have agents living in them, so we
   can draw a labelled plaza for each (Prompt Plaza / Broadcast Center / Memory
   Library or any other agent.district that isn't a building district). */
export function zoneHomes(agents, buildingDistrictNames) {
  const set = new Set(buildingDistrictNames);
  const homes = new Map();
  for (const a of agents) {
    const d = a.district || "Depot";
    if (set.has(d)) continue;           // agents whose home IS a building district idle there
    if (!homes.has(d)) homes.set(d, []);
    homes.get(d).push(a);
  }
  const out = [];
  for (const [name, list] of homes) {
    const meta = archetypeFor(name);
    out.push({ name, ...meta, agents: list, count: list.length });
  }
  out.sort((x, y) => x.order - y.order);
  return out;
}

/* Shelf-pack districts into a town plan.  Each district is a rectangular block
   sized to its building count (cols x rows of plots). Blocks flow left→right,
   wrapping to a new band when the running width exceeds `bandUnits`. Returns
   { blocks:[{name,arch,tint,glyph,packets, ox,oy, cols,rows, w,h}], planW, planH }
   where ox/oy are top-left plot coords in GRID UNITS and w/h are block extents.
   Gaps between blocks become the road network (computed by the engine). */
export function planTown(zones, opts = {}) {
  const plotGap = opts.plotGap != null ? opts.plotGap : 1.0;   // grid units between plots inside a block
  const blockGap = opts.blockGap != null ? opts.blockGap : 2.4; // grid units of road between blocks
  const bandUnits = opts.bandUnits != null ? opts.bandUnits : 13; // wrap width in grid units
  const maxCols = opts.maxCols != null ? opts.maxCols : 4;

  const blocks = [];
  let cursorX = 0, cursorY = 0, bandH = 0, planW = 0;

  for (const z of zones) {
    const n = Math.max(1, z.count);
    const cols = Math.min(maxCols, Math.max(1, Math.ceil(Math.sqrt(n))));
    const rows = Math.ceil(n / cols);
    const w = (cols - 1) * plotGap;   // extent of plot centers
    const h = (rows - 1) * plotGap;

    // wrap to next band if this block would overflow the current band width
    if (cursorX > 0 && cursorX + w > bandUnits) {
      cursorX = 0;
      cursorY += bandH + blockGap;
      bandH = 0;
    }
    const block = {
      name: z.name, arch: z.arch, tint: z.tint, glyph: z.glyph,
      packets: z.packets, cols, rows, ox: cursorX, oy: cursorY, w, h,
    };
    blocks.push(block);
    cursorX += w + blockGap;
    bandH = Math.max(bandH, h);
    planW = Math.max(planW, cursorX - blockGap);
  }
  const planH = cursorY + bandH;
  return { blocks, planW: Math.max(planW, 0), planH: Math.max(planH, 0), plotGap, blockGap };
}

/* Plot center (grid units) for the i-th packet inside a block, row-major. */
export function plotInBlock(block, i, plotGap) {
  const c = i % block.cols, r = Math.floor(i / block.cols);
  return { gx: block.ox + c * plotGap, gy: block.oy + r * plotGap };
}
