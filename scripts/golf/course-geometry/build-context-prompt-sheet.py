#!/usr/bin/env python3
"""Per-hole §39 review prompt sheet for the outside-world context layer.

Writes one section per hole with the evidence the reviewer needs in front of
them (playing-surface and context class areas, the derived rough bands, the
unexplained share and its gate, paths, built context, neighbouring holes,
DEM relief, per-hole signature facts) and a draft answer for every prompt in
`CONTEXT_REVIEW_PROMPTS`. Draft answers come from the data alone and say so;
judgement prompts are marked `human` and carry only the numbers. Nothing here
changes the layer: the reviewer copies confirmed answers into the layer's
`review.notes` and flips `review.status`.

Usage:
  python3 build-context-prompt-sheet.py <package.json> <context.json> \
      <context-report.json> <compiled-dir> <out.md> \
      [unexplained-naip.json] [canopy-rerun.json]

The optional NAIP report (`report-unexplained-naip.py --fixture=`) adds what
the imagery says the unexplained ground is (canopy / meadow / mown turf /
bare / dark) and the upper bound each class puts on the gate; the optional
canopy re-run measurement (`measure-canopy-rerun.py --fixture=`) adds what
the canopy pass would really keep out to the hole bounds. Both are evidence
for the reviewer, never a zone.
"""
import gzip
import importlib.util
import json
import math
import sys
from pathlib import Path

from shapely.geometry import Polygon, box
from shapely.ops import unary_union

if len(sys.argv) not in (6, 7, 8):
    print(__doc__); sys.exit(2)
package_path, context_path, report_path, compiled, out = map(Path, sys.argv[1:6])
naip_path = Path(sys.argv[6]) if len(sys.argv) >= 7 else None
rerun_path = Path(sys.argv[7]) if len(sys.argv) == 8 else None
here = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('prepare_context_layer', here / 'prepare-context-layer.py')
prepare = importlib.util.module_from_spec(spec); spec.loader.exec_module(prepare)

PROMPTS = [
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
]
GATE = .15
NEIGHBOUR_M = 60

pkg = json.loads(package_path.read_text())
context = json.loads(context_path.read_text())
report = json.loads(report_path.read_text())
if context['packageHash'] != pkg['contentHash'] or report['packageHash'] != pkg['contentHash']:
    raise SystemExit('context layer / report belong to another package revision')
local = prepare.make_local(pkg['originWgs84'])
naip = json.loads(naip_path.read_text()) if naip_path else None
if naip and (naip['packageHash'] != pkg['contentHash'] or naip['layerHash'] != context['contentHash']):
    raise SystemExit('NAIP unexplained report belongs to another package / layer revision')
naip_by_hole = {h['key']: h for h in naip['holes']} if naip else {}
rerun = json.loads(rerun_path.read_text()) if rerun_path else None
if rerun and (rerun['packageHash'] != pkg['contentHash'] or rerun['layerHash'] != context['contentHash']):
    raise SystemExit('canopy re-run measurement belongs to another package / layer revision')
rerun_by_hole = {h['key']: h for h in rerun['holes']} if rerun else {}
manifest = json.loads((compiled / 'asset-manifest.json').read_text())
if manifest['geometryHash'] != pkg['contentHash']:
    raise SystemExit('compiled terrain belongs to another package revision')

def mesh_for(entry):
    raw = (compiled / entry['fileName']).read_bytes()
    return json.loads(gzip.decompress(raw) if entry['fileName'].endswith('.gz') else raw)

bounds, relief = {}, {}
for key, entry in manifest['holes'].items():
    mesh = mesh_for(entry)
    xs, ys, zs = mesh['vertices'][0::3], mesh['vertices'][1::3], mesh['vertices'][2::3]
    bounds[key] = (min(xs), min(ys), max(xs), max(ys))
    relief[key] = (min(zs), max(zs))

def gap(a, b):
    dx = max(0, max(a[0], b[0]) - min(a[2], b[2]))
    dy = max(0, max(a[1], b[1]) - min(a[3], b[3]))
    return math.hypot(dx, dy)

def line_length(coords):
    pts = [local(p) for p in coords]
    return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))

features = {f['id']: f for f in pkg['features']}
# Canopy groups overlap across holes, so the report's per-feature `package:woods`
# sum overstates cover; the union against the hole bounds is the honest share.
woods_union = unary_union([Polygon([local(p) for p in f['geometryWgs84']['coordinates'][0]]) for f in pkg['features']
                           if f['kind'] == 'woods' and f['geometryWgs84']['type'] == 'Polygon'])
def woods_share(key):
    minx, miny, maxx, maxy = bounds[key]
    m = prepare.HOLE_MARGIN_M
    hole_box = box(minx - m, miny - m, maxx + m, maxy + m)
    return woods_union.intersection(hole_box).area / hole_box.area
by_hole = {h['key']: h for h in pkg['holes']}
report_by_hole = {h['key']: h for h in report['holes']}
zones_by_hole = {}
for zone in context['zones']:
    for key in zone['holeKeys']:
        zones_by_hole.setdefault(key, []).append(zone)

def ha(m2): return f'{m2 / 10000:.1f} ha'
def pct(x): return f'{100 * x:.0f} %'

lines = ['<!-- markdownlint-disable MD013 MD060 -->', f"# Outside-world §39 review prompts — {pkg['name']} ({pkg['siteId']})", '',
         f"Generated by `scripts/golf/course-geometry/build-context-prompt-sheet.py` from package `{pkg['contentHash'][:12]}`, "
         f"context layer `{context['contentHash'][:12]}` ({context['review']['status']}) and the context report"
         + (f", with NAIP evidence from `report-unexplained-naip.py` (raster `{naip['raster']['rasterSha256'][:12]}`, {', '.join(naip['raster']['captureDates'])})" if naip else '') + '. '
         "Draft answers are derived from the data and are not a review; prompts marked **human** need the reviewer's eye "
         "(imagery, course knowledge). Confirmed answers go into the layer's `review.notes`.", '',
         '| Hole | Par | Yards | Unexplained | Gate | Zones | Paths | Buildings | Neighbours within 60 m |', '|---|---|---|---|---|---|---|---|---|']
sections = []
previous = None
for hole in sorted(pkg['holes'], key=lambda h: h['ordinal']):
    key, n = hole['key'], hole['ordinal']
    rep = report_by_hole[key]
    zones = zones_by_hole.get(key, [])
    areas = rep['classAreasM2']
    playing = {k[8:]: v for k, v in areas.items() if k.startswith('package:')}
    derived = {k[8:]: v for k, v in areas.items() if k.startswith('derived:')}
    ctx_areas = {k: v for k, v in areas.items() if ':' not in k}
    total = rep['contextBoundsM2']
    unexplained = rep['uncertainShare']
    feats = [features[i] for i in hole['featureIds'] if i in features]
    kinds = {}
    for f in feats: kinds[f['kind']] = kinds.get(f['kind'], 0) + 1
    paths = [z for z in zones if z['class'] in ('cart_path', 'service_path', 'road') and z['geometryWgs84']['type'] == 'LineString']
    path_len = {cls: sum(line_length(z['geometryWgs84']['coordinates']) for z in paths if z['class'] == cls) for cls in ('cart_path', 'service_path', 'road')}
    built = {cls: sum(1 for z in zones if z['class'] == cls) for cls in ('building', 'clubhouse', 'maintenance', 'lift_line', 'fence', 'parking', 'ski_slope')}
    built = {k: v for k, v in built.items() if v}
    neighbours = sorted(other[-2:] for other in bounds if other != key and gap(bounds[key], bounds[other]) <= NEIGHBOUR_M)
    zmin, zmax = relief[key]
    woods_cover = woods_share(key)
    nh = naip_by_hole.get(key)
    naip_mix = ''
    naip_bound = ''
    naip_canopy = ''
    if nh:
        c = nh['classes']
        naip_mix = (f" NAIP (leaf-on {', '.join(naip['raster']['captureDates'])}) inside that unexplained ground: canopy {pct(c['canopy']['share'])}, "
                    f"meadow {pct(c['meadow']['share'])}, mown turf {pct(c['turf']['share'])}, bare / hardscape {pct(c['bare']['share'])}, dark {pct(c['dark']['share'])}.")
        sc = nh['scenarios']
        naip_bound = (f" If every pixel of a class were explained by a new source-backed derivation (the review sidecar only accepts, adjusts or rejects existing zones; this ground needs a new derived zone): "
                      f"canopy pixels → {pct(sc['canopy']['uncertainShare'])} ({sc['canopy']['gate']}); turf + meadow → {pct(sc['turf+meadow']['uncertainShare'])} ({sc['turf+meadow']['gate']}); "
                      f"all vegetation → {pct(sc['vegetation']['uncertainShare'])} ({sc['vegetation']['gate']}).")
        beyond = nh['canopy']['beyondCanopyPassReach'] / c['canopy']['pixels'] if c['canopy']['pixels'] else 0
        naip_canopy = (f" NAIP canopy the groups do not cover: {ha(c['canopy']['m2'])} inside the unexplained ground, {pct(beyond)} of it in the {prepare.HOLE_MARGIN_M} m rim beyond the canopy pass's reach.")
    rr = rerun_by_hole.get(key)
    if rr:
        naip_bound += (f" Measured with the pass's own rules out to the hole bounds (`measure-canopy-rerun.py`): {pct(rr['uncertainShareRerun'])} ({rr['gateRerun']}), "
                       f"woods {ha(rr['woodsM2'])} → {ha(rr['woodsM2Rerun'])} — a new package hash if done for real.")
    ranked = sorted(((k, v) for k, v in areas.items() if not k.startswith('package:')), key=lambda kv: -kv[1])
    top = ', '.join(f'{k.replace("derived:", "")} {ha(v)}' for k, v in ranked[:4])
    gate = 'pass' if unexplained < GATE else 'fail'
    lines.append(f"| {n} | {hole['par']} | {hole['scorecardYards']} | {pct(unexplained)} | {gate} | {len(zones)} | "
                 f"{sum(1 for z in paths)} ({path_len['cart_path'] / 1000:.1f} km cart) | {built.get('building', 0)} | {', '.join(neighbours) or '—'} |")
    sig = []
    if kinds.get('water'): sig.append(f"{kinds['water']} water feature{'s' if kinds['water'] > 1 else ''}")
    if kinds.get('bunker'): sig.append(f"{kinds['bunker']} bunker{'s' if kinds['bunker'] > 1 else ''}")
    sig.append(f"green {playing.get('green', 0):.0f} m²")
    if built.get('building'): sig.append(f"{built['building']} buildings")
    if built.get('ski_slope'): sig.append('ski slope')
    if built.get('lift_line'): sig.append('lift line')
    prev_line = ''
    if previous:
        prev_line = f" Previous hole {previous['ordinal']}: par {previous['par']}, {previous['scorecardYards']} yd, {previous['sig']}."
    answers = [
        (PROMPTS[0], 'derived', f"By the derived rule the primary rough ends {prepare.ROUGH_PRIMARY_M} m from the nearest playing surface ({ha(derived.get('rough_primary', 0))}) and the secondary band at {prepare.ROUGH_SECONDARY_M} m ({ha(derived.get('rough_secondary', 0))}); beyond that the ground is outer rough or a source zone. Whether the mown corridor really ends there is a human check against imagery."),
        (PROMPTS[1], 'derived', f"Largest non-playing areas inside the hole bounds: {top}. Unexplained (no source or rule): {pct(unexplained)} of {ha(total)}.{naip_mix}"),
        (PROMPTS[2], 'human', f"Woods on record: the package canopy groups cover {pct(woods_cover)} of the hole bounds ({ha(woods_cover * total)}, union — the report's per-feature sum {ha(playing.get('woods', 0))} counts overlapping groups more than once); OSM forest mass {ha(ctx_areas.get('forest_mass', 0))}.{naip_canopy} Density inside those polygons is seeded placement, not a source count."),
        (PROMPTS[3], 'derived', (f"Hole meshes within {NEIGHBOUR_M} m: {', '.join(neighbours)}." if neighbours else f"No other hole mesh within {NEIGHBOUR_M} m.") + ' Sightlines (trees, relief) are a human check.'),
        (PROMPTS[4], 'derived', f"Paths crossing the hole bounds: {sum(1 for z in paths if z['class'] == 'cart_path')} cart path ways ({path_len['cart_path']:.0f} m), {sum(1 for z in paths if z['class'] == 'service_path')} service ({path_len['service_path']:.0f} m), {sum(1 for z in paths if z['class'] == 'road')} road ({path_len['road']:.0f} m). A missing path is a source gap: nothing is drawn without a way."),
        (PROMPTS[5], 'human', f"DEM relief across the hole mesh: {zmax - zmin:.1f} m ({zmin:.0f}–{zmax:.0f} m). Slope shading, landform occlusion and the shelter/exposure tone come from the DEM; whether the key bank reads is a human check in the Terrain view."),
        (PROMPTS[6], 'human', f"Green {playing.get('green', 0):.0f} m² with {kinds.get('bunker', 0)} bunkers on the hole; surround ring, derived apron and slope-evidenced run-offs are rendered; back banks and collection hollows wait for review (tracker row 19)."),
        (PROMPTS[7], 'derived', (', '.join(f'{v} {k.replace("_", " ")}' for k, v in built.items()) or 'No building, lift, fence, parking or ski-slope zone') + f"; {sum(1 for z in paths if z['class'] == 'road')} road ways."),
        (PROMPTS[8], 'derived', f"Par {hole['par']}, {hole['scorecardYards']} yd; {', '.join(sig)}.{prev_line} Character beyond the record is a human read."),
        (PROMPTS[9], 'human', f"Unexplained share {pct(unexplained)} ({'passes' if gate == 'pass' else 'fails'} the < {pct(GATE)} gate); the unexplained ground is painted as outer rough with terrain-following tone only, never a class.{naip_bound}"),
    ]
    section = [f"## Hole {n} — par {hole['par']}, {hole['scorecardYards']} yd (`{key}`)", '',
               f"Completeness `{hole['completeness']}`; context zones {len(zones)}; unexplained {pct(unexplained)} (gate {gate}).", '',
               '| Prompt | Basis | Draft answer |', '|---|---|---|']
    section += [f'| {p} | {b} | {a} |' for p, b, a in answers]
    section.append('')
    sections.append('\n'.join(section))
    previous = {'ordinal': n, 'par': hole['par'], 'scorecardYards': hole['scorecardYards'], 'sig': ', '.join(sig)}

passing = sum(1 for h in report['holes'] if h['uncertainShare'] < GATE)
lines += ['', f"{passing} of {len(report['holes'])} holes pass the unexplained-context gate (< {pct(GATE)})."]
if naip:
    cc = naip['courseClasses']
    g = naip['gate']['holesPassing']
    lines += ['', (f"NAIP evidence (course-wide, {sum(h['unexplainedM2'] for h in naip['holes']) / 1e4:.0f} ha unexplained): canopy {pct(cc['canopy'])}, meadow {pct(cc['meadow'])}, mown turf {pct(cc['turf'])}, "
                   f"bare / hardscape {pct(cc['bare'])}, dark {pct(cc['dark'])}. {naip['courseCanopy']['beyondCanopyPassReachM2'] / 1e4:.0f} ha of that canopy lies in the {prepare.HOLE_MARGIN_M} m rim beyond the canopy pass's reach. "
                   f"Holes under the gate if every pixel of a class were explained by a new derivation: canopy {g['canopy']}, turf {g['turf']}, turf + meadow {g['turf+meadow']}, all vegetation {g['vegetation']} of {len(naip['holes'])} "
                   f"(pixel bounds; the review sidecar cannot add zones — each needs a new derived zone). Overlays: `output/course-geometry/peek-n-peak-upper-unexplained/hNN-unexplained.png`.")]
if rerun:
    hp = rerun['holesPassingGate']
    lines += ['', (f"Canopy re-run measured with the pass's own rules out to the hole bounds (`measure-canopy-rerun.py`): {hp['today']} → {hp['rerun']} holes under the gate "
                   f"({', '.join(str(h['ordinal']) for h in rerun['holes'] if h['gateRerun'] == 'pass')}), woods union {rerun['woodsUnionM2']['today'] / 1e4:.1f} → {rerun['woodsUnionM2']['rerun'] / 1e4:.1f} ha, "
                   f"regions {rerun['regions']['today']} → {rerun['regions']['rerun']}. Doing it for real is a new package hash (owner decision).")]
lines.append('')
out.write_text('\n'.join(lines) + '\n' + '\n'.join(sections))
print(f'{out}: {len(sections)} holes, {passing} pass the gate')
