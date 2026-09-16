"""QGIS review kit for one canonical course package (master plan §79–80).

Reviewers never edit raw JSON. This exports the canonical package (WGS84) as
one GeoJSON layer per feature kind, a flags layer for low-confidence features,
the classified context zones, an empty review-adjustments layer (the
corrections sidecar the renderer-redesign plan §23 asks for) and a PyQGIS
loader that styles everything by review status and labels featureId / hole /
source / confidence. Nothing here moves a polygon or passes a truth gate.

Usage:
  python3 build-qgis-review-kit.py <package.json> <out-dir> \
      [--context=<context.json>] [--imagery-review=<review.json>]

Then in QGIS: Plugins → Python Console → exec(open('<out-dir>/load_review_kit.py').read())
"""
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
if len(args) != 2:
    print(__doc__); sys.exit(2)
package_path, out = Path(args[0]), Path(args[1])
package = json.loads(package_path.read_text())
context = json.loads(Path(opts['context']).read_text()) if 'context' in opts else None
review = json.loads(Path(opts['imagery-review']).read_text()) if 'imagery-review' in opts else None
out.mkdir(parents=True, exist_ok=True)

hole_by_key = {h['key']: h for h in package['holes']}
sources = {s['id']: s for s in package.get('sources', [])}

# Imagery review: bunker sand shares become a confidence hint, never a verdict.
bunker_share = {}
low_share = review['method'].get('lowSandShare', .35) if review else .35
if review:
    for hole in review['holes']:
        for entry in hole.get('bunkers', []):
            bunker_share[entry['featureId']] = entry.get('sandShareInside')


def confidence(feature):
    share = bunker_share.get(feature['id'])
    if share is not None:
        return 'low' if share < low_share else 'ok'
    return 'reviewed' if feature.get('reviewed') else 'unreviewed'


def status(feature):
    return 'accepted' if feature.get('reviewed') else 'candidate'


def properties(feature):
    holes = [hole_by_key[k]['ordinal'] for k in feature.get('holeKeys', []) if k in hole_by_key]
    return {
        'featureId': feature['id'], 'kind': feature['kind'],
        'hole': ','.join(str(h) for h in holes) or None,
        'source': ','.join(feature.get('sourceIds', [])) or None,
        'provider': ','.join(sorted({sources[s]['provider'] for s in feature.get('sourceIds', []) if s in sources})) or None,
        'reviewed': bool(feature.get('reviewed')), 'accuracyMeters': feature.get('accuracyMeters'),
        'confidence': confidence(feature), 'status': status(feature),
        'sandShareInside': bunker_share.get(feature['id']),
    }


def collection(features):
    return {'type': 'FeatureCollection', 'features': features}


def write(name, features, note=None):
    body = collection(features)
    if note:
        body['note'] = note
    (out / f'{name}.geojson').write_text(json.dumps(body) + '\n')
    return len(features)


by_kind = defaultdict(list)
flags = []
for feature in package['features']:
    props = properties(feature)
    geo = {'type': 'Feature', 'id': feature['id'], 'properties': props, 'geometry': feature['geometryWgs84']}
    by_kind[feature['kind']].append(geo)
    if props['confidence'] in ('low', 'unreviewed') and feature['kind'] in ('bunker', 'green', 'fairway', 'tee', 'water'):
        flags.append({**geo, 'properties': {**props, 'reason': 'low sand share in leaf-on NAIP' if props['confidence'] == 'low' else 'source candidate, not yet reviewed'}})

counts = {kind: write(kind, features) for kind, features in sorted(by_kind.items())}
counts['flags'] = write('flags', flags, 'Low-confidence features for human review. Reasons are hints from imagery statistics or missing review, never measurements.')

if context:
    zones = []
    for zone in context.get('zones', []):
        holes = [hole_by_key[k]['ordinal'] for k in zone.get('holeKeys', []) if k in hole_by_key]
        zones.append({'type': 'Feature', 'id': zone['id'], 'properties': {
            'featureId': zone['id'], 'kind': 'context', 'class': zone.get('class'), 'basis': zone.get('basis'),
            'fidelity': zone.get('fidelity'), 'reviewed': bool(zone.get('reviewed')), 'hole': ','.join(str(h) for h in holes) or None,
            'source': ','.join(zone.get('sourceIds', [])) or None, 'status': 'accepted' if zone.get('reviewed') else 'candidate',
            'confidence': 'reviewed' if zone.get('reviewed') else 'unreviewed',
            'attributes': json.dumps(zone.get('attributes', {})),
        }, 'geometry': zone['geometryWgs84']})
    counts['context'] = write('context', zones)

adjustments_note = ('Review adjustments sidecar (renderer-redesign §23). One feature per decision: draw the corrected shape, set '
                    'featureId to the canonical feature being reviewed, decision to accepted | adjust | reject, and add note, '
                    'reviewer and reviewedAt. Adjust/reject never edit the canonical package; a later import step applies them '
                    'with provenance.')
if not (out / 'review-adjustments.geojson').exists():
    write('review-adjustments', [], adjustments_note)

hole_rows = [{'hole': h['ordinal'], 'key': h['key'], 'par': h.get('par'), 'yards': h.get('scorecardYards'),
              'completeness': h.get('completeness'), 'gaps': h.get('gaps', [])} for h in package['holes']]
(out / 'holes.json').write_text(json.dumps(hole_rows, indent=2) + '\n')

loader = f'''# Run inside the QGIS Python console: exec(open(r"{(out / 'load_review_kit.py').resolve()}").read())
# Loads the {package['name']} review kit (package {package['contentHash'][:12]}), styled by review status.
from qgis.core import (QgsProject, QgsVectorLayer, QgsRasterLayer, QgsCoordinateReferenceSystem, QgsCategorizedSymbolRenderer,
                       QgsRendererCategory, QgsSymbol, QgsPalLayerSettings, QgsVectorLayerSimpleLabeling, QgsTextFormat)
from qgis.PyQt.QtGui import QColor
from qgis.PyQt.QtCore import Qt
from pathlib import Path

KIT = Path(r"{out.resolve()}")
project = QgsProject.instance()
project.setCrs(QgsCoordinateReferenceSystem("EPSG:3857"))
project.setTitle("{package['name']} review kit")

def add_basemap(name, uri):
    layer = QgsRasterLayer(uri, name, "wms")
    if layer.isValid():
        project.addMapLayer(layer)
    else:
        print("basemap unavailable:", name)

add_basemap("OSM source", "type=xyz&url=https://tile.openstreetmap.org/%7Bz%7D/%7Bx%7D/%7By%7D.png&zmax=19&zmin=0")
add_basemap("NAIP", "crs=EPSG:3857&format=image/png&layers=USGSNAIPPlus&styles=&url=https://imagery.nationalmap.gov/arcgis/services/USGSNAIPPlus/ImageServer/WMSServer")

STATUS_STYLE = {{
    "accepted": ("#1E9E4A", Qt.SolidLine, "accepted"),
    "adjust": ("#E0A030", Qt.SolidLine, "adjust"),
    "reject": ("#D8342A", Qt.SolidLine, "reject"),
    "candidate": ("#3C6E9E", Qt.DashLine, "candidate"),
}}

def styled(layer, geometry_type):
    categories = []
    for value, (color, pen, label) in STATUS_STYLE.items():
        symbol = QgsSymbol.defaultSymbol(geometry_type)
        for i in range(symbol.symbolLayerCount()):
            sl = symbol.symbolLayer(i)
            if hasattr(sl, "setStrokeColor"):
                sl.setStrokeColor(QColor(color)); sl.setStrokeWidth(.6)
                if hasattr(sl, "setStrokeStyle"): sl.setStrokeStyle(pen)
            if hasattr(sl, "setFillColor"):
                fill = QColor(color); fill.setAlpha(40); sl.setFillColor(fill)
            if hasattr(sl, "setPenStyle"): sl.setPenStyle(pen)
            if hasattr(sl, "setColor") and geometry_type == 1: sl.setColor(QColor(color)); sl.setWidth(.8)
        categories.append(QgsRendererCategory(value, symbol, label))
    layer.setRenderer(QgsCategorizedSymbolRenderer("status", categories))
    settings = QgsPalLayerSettings()
    settings.fieldName = "concat(featureId, ' · hole ', coalesce(hole, '?'), ' · ', coalesce(source, ''), ' · ', confidence)"
    settings.isExpression = True
    settings.placement = QgsPalLayerSettings.Line if geometry_type == 1 else QgsPalLayerSettings.OverPoint
    fmt = QgsTextFormat(); fmt.setSize(8); settings.setFormat(fmt)
    layer.setLabelsEnabled(True); layer.setLabeling(QgsVectorLayerSimpleLabeling(settings))

ORDER = ["context", "woods", "water", "fairway", "tee", "green", "bunker", "route", "flags", "review-adjustments"]
for name in ORDER:
    path = KIT / (name + ".geojson")
    if not path.exists():
        continue
    layer = QgsVectorLayer(str(path), name, "ogr")
    if not layer.isValid():
        print("could not load", path); continue
    styled(layer, layer.geometryType())
    layer.setReadOnly(name != "review-adjustments")
    project.addMapLayer(layer)
print("Loaded review kit from", KIT, "— edit only the review-adjustments layer; snapping: Project → Snapping Options → vertex, 2 px")
'''
(out / 'load_review_kit.py').write_text(loader)

readme = f"""# {package['name']} — QGIS review kit

Package `{package['contentHash']}` · status `{package['status']}` · generated {datetime.now(timezone.utc).isoformat(timespec='seconds')}

Layers (EPSG:4326 GeoJSON, read-only except `review-adjustments`):

| Layer | Features | Meaning |
| --- | --- | --- |
""" + ''.join(f"| `{name}.geojson` | {count} | {'low-confidence features for human review' if name == 'flags' else 'classified non-playing context zones' if name == 'context' else 'canonical ' + name + ' features'} |\n" for name, count in counts.items()) + f"""| `review-adjustments.geojson` | 0 | the corrections sidecar: your decisions, never the source |

Styles: accepted = green outline, adjust = amber, reject = red, candidate = dashed blue.
Labels: `featureId · hole · source · confidence`.

1. Open QGIS 3.34+ (4.x fine), Python console: `exec(open(r"{(out / 'load_review_kit.py').resolve()}").read())`.
2. Compare each candidate against NAIP; write one feature into `review-adjustments` per decision
   (`featureId`, `decision` = accepted | adjust | reject, `note`, `reviewer`, `reviewedAt`).
3. Save the layer. The sidecar is imported with provenance by a later step; the canonical package is never edited by hand.

Hole completeness and known gaps are in `holes.json`. Confidence hints come from imagery statistics
({'the imagery review sidecar' if review else 'no imagery review supplied'}); they are hints, not measurements.
"""
(out / 'README.md').write_text(readme)
print(json.dumps(counts))
