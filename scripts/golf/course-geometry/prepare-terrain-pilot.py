"""Compile one bounded USGS DEM crop into a local, source-linked terrain fixture.

No production writes. Requires NumPy, Pillow and Shapely 2.1.2 / GEOS 3.13.
Usage: python3 scripts/golf/course-geometry/prepare-terrain-pilot.py /tmp/golf-terrain-pilot
Input: elevation.tiff, export.json and catalog.json from the USGS ImageServer.
The export's returned extent, not the requested extent, defines pixel centers.
"""
import hashlib
import importlib.util
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image
from shapely import constrained_delaunay_triangles
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / 'src/test/fixtures/course-geometry'
spec = importlib.util.spec_from_file_location('pilot', Path(__file__).with_name('prepare-pilot.py'))
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)


def main():
    source = Path(sys.argv[1])
    pkg = json.loads(Path(sys.argv[2]).read_text()) if len(sys.argv) > 2 else json.loads((FIXTURES / 'cacapon.json').read_text())
    display = json.loads((source / 'display-surfaces.json').read_text())
    assert display['geometryHash'] == pkg['contentHash']
    pilot.ORIGIN = pkg['originWgs84']
    hole = next(h for h in pkg['holes'] if h['key'] == sys.argv[3]) if len(sys.argv) > 3 else pkg['holes'][6]
    destination = Path(sys.argv[4]) if len(sys.argv) > 4 else FIXTURES / 'cacapon-07-terrain.json'
    exported = json.loads((source / 'export.json').read_text())
    extent = exported['extent']
    catalog = json.loads((source / 'catalog.json').read_text())
    source_id = exported.get('selectedObjectId', 129279)
    dem = next(f['attributes'] for f in catalog['features'] if f['attributes']['OBJECTID'] == source_id)
    if not dem['title'].startswith('USGS 1 Meter '):
        raise ValueError('Only verified native 1m products are supported by this pilot')
    assert dem['VerticalDatum'] in ('NAVD88', 'North American Vertical Datum of 1988 (NAVD 88)')
    raster = np.asarray(Image.open(source / 'elevation.tiff'))
    assert raster.shape == (exported['height'], exported['width'])

    def source_date(value):
        if value is None:
            raise ValueError('Missing source capture date requires review')
        text = str(value)
        if len(text) == 8 and text.isdigit():
            return datetime.strptime(text, '%Y%m%d').replace(tzinfo=timezone.utc).date().isoformat()
        if len(text) == 4 and text.isdigit():
            return text
        return datetime.fromtimestamp(float(value) / 1000, timezone.utc).date().isoformat()

    def geographic(x, y):
        lon, lat = pilot.ORIGIN[0] + x / 85800, pilot.ORIGIN[1] + y / 111000
        for _ in range(4):
            ex, ny = pilot.local([lon, lat])
            lon += (x - ex) / 85800
            lat += (y - ny) / 111000
        assert math.dist(pilot.local([lon, lat]), [x, y]) < .001
        return lon, lat

    def elevation(x, y):
        lon, lat = geographic(x, y)
        px = (lon - extent['xmin']) / (extent['xmax'] - extent['xmin']) * raster.shape[1] - .5
        py = (extent['ymax'] - lat) / (extent['ymax'] - extent['ymin']) * raster.shape[0] - .5
        ix, iy = math.floor(px), math.floor(py)
        assert 0 <= ix < raster.shape[1] - 1 and 0 <= iy < raster.shape[0] - 1
        fx, fy = px - ix, py - iy
        samples = raster[iy:iy + 2, ix:ix + 2]
        assert np.isfinite(samples).all() and (samples > -1000).all() and (samples < 9000).all()
        return float(samples[0, 0] * (1-fx) * (1-fy) + samples[0, 1] * fx * (1-fy)
                     + samples[1, 0] * (1-fx) * fy + samples[1, 1] * fx * fy)

    surfaces = []
    order = ['woods', 'rough', 'water', 'fairway', 'tee', 'green', 'bunker']
    outline_reports = []
    for f in display['surfaces']:
        shape = unary_union([Polygon(rings[0], rings[1:]) for rings in f['parts']])
        canonical = unary_union([Polygon(rings[0], rings[1:]) for rings in f['canonicalParts']])
        displacement = shape.boundary.hausdorff_distance(canonical.boundary)
        assert shape.is_valid and displacement <= display['maxBoundaryDisplacementM']
        assert abs(shape.area / canonical.area - 1) <= .015
        assert len(f['parts']) == len(f['canonicalParts'])
        assert [len(r) for r in f['parts']] == [len(r) for r in f['canonicalParts']]
        outline_reports.append({'id': f['id'], 'boundaryDisplacementM': displacement,
                                'areaChangePercent': 100 * (shape.area / canonical.area - 1)})
        surfaces.append((f['id'], f['kind'], shape))
    surfaces.sort(key=lambda f: (order.index(f[1]), f[0]))
    # Display crop only. It is neutral terrain, never inferred rough or a hole boundary.
    context = unary_union([s for _, kind, s in surfaces if kind != 'woods']).convex_hull.buffer(24, quad_segs=8)
    xmin, ymin, xmax, ymax = context.bounds
    visible, covered = [], Polygon()
    for ident, kind, shape in reversed(surfaces):
        accepted = shape.intersection(context).difference(covered)
        visible.append((ident, kind, accepted))
        covered = covered.union(shape)
    visible.append(('terrain-context', 'ground', context.difference(covered)))
    visible.reverse()
    fairways = unary_union([shape for _, kind, shape in surfaces if kind == 'fairway'])
    greens = unary_union([shape for _, kind, shape in surfaces if kind == 'green'])
    # Same illustrative surrounds as SVG's 13m fairway / 2.8m green strokes.
    # These color regions do not become physical feature IDs or lie evidence.
    surround = fairways.buffer(6.5).difference(fairways)
    collar = greens.buffer(1.4).difference(greens)
    vertices, triangle_features, triangle_materials, feature_ids, kinds, reports = [], [], [], [], [], []
    step = 8.0
    for ident, kind, shape in visible:
        feature_index = len(feature_ids)
        feature_ids.append(ident)
        kinds.append(kind)
        triangle_area, count = 0.0, 0
        if not shape.is_empty:
            # Color ribbons partition the footprint INWARD. They never widen a
            # fairway, invent fringe coverage, or assert a surveyed bunker lip.
            # All bands sample the same DEM, with no visual Z offsets.
            widths = {'green': (.35, .65), 'bunker': (.28, .55), 'fairway': (.6, .5)}
            regions = [(0, shape)]
            if kind == 'ground':
                regions = [(0, shape.difference(surround).difference(collar)),
                           (3, shape.intersection(surround).difference(collar)), (4, shape.intersection(collar))]
            if kind in widths:
                edge, light = widths[kind]
                inset = shape.buffer(-edge)
                interior = shape.buffer(-edge - light)
                regions = [(1, shape.difference(inset)), (2, inset.difference(interior)), (0, interior)]
                if kind == 'fairway':
                    regions = [(material, region.difference(collar)) for material, region in regions] + [(4, shape.intersection(collar))]
            for material, region in regions:
                if region.is_empty:
                    continue
                a, b, c, d = region.bounds
                for x in np.arange(math.floor(a / step) * step, c, step):
                    for y in np.arange(math.floor(b / step) * step, d, step):
                        cut = region.intersection(box(x, y, x + step, y + step))
                        for tri in constrained_delaunay_triangles(cut).geoms:
                            if tri.area < 1e-8:
                                continue
                            for px, py in list(tri.exterior.coords)[:3]:
                                vertices.extend([round(px, 5), round(py, 5), round(elevation(px, py), 4)])
                            triangle_features.append(feature_index)
                            triangle_materials.append(material)
                            triangle_area += tri.area
                            count += 1
        assert abs(triangle_area - shape.area) < .001, (ident, triangle_area, shape.area)
        reports.append({'id': ident, 'kind': kind, 'triangles': count,
                        'clippedAreaM2': round(shape.area, 6), 'triangleAreaM2': round(triangle_area, 6)})
    assert 0 < len(triangle_features) < 20000
    heights = vertices[2::3]
    result = {
        'schemaVersion': 1, 'physicalHoleKey': hole['key'], 'geometryHash': pkg['contentHash'],
        'displayRevision': display['displayRevision'], 'surfaceManifestHash': display['contentHash'],
        'status': 'source_candidate',
        'horizontalFrame': 'wgs84-local-enu-v1', 'originWgs84': pkg['originWgs84'],
        'verticalDatum': 'NAVD88', 'verticalUnits': 'meters',
        'referenceElevationM': round(min(heights), 4),
        'vertices': vertices, 'triangleFeatures': triangle_features, 'triangleMaterials': triangle_materials,
        'featureIds': feature_ids, 'featureKinds': kinds,
        'source': {
            'provider': 'USGS 3DEP', 'catalogObjectId': source_id,
            'title': dem['title'], 'url': dem['URL'],
            'acquisitionStart': source_date(dem.get('StartDate')),
            'acquisitionEnd': source_date(dem.get('EndDate')),
            'retrievedAt': exported['retrievedAt'], 'nativeResolutionM': 1 if dem['title'].startswith('USGS 1 Meter ') else float(dem['Resolution_X']),
            'verticalAccuracyM': None, 'registrationResidualM': None,
            'licenseUrl': 'https://www.usgs.gov/3d-elevation-program/about-3dep-products-services',
            'rasterSha256': hashlib.sha256((source / 'elevation.tiff').read_bytes()).hexdigest(),
            'exportExtent': extent, 'exportSize': [exported['width'], exported['height']],
            'meshCellM': step,
        },
        'limitations': ['Terrain source candidate; independent registration and renovation review pending',
                        'Macro elevation only; no bunker-lip or putting-break accuracy',
                        'No observed ball, cup, tree height or flight coordinates',
                        'Height is NAVD88 orthometric elevation, not ellipsoidal ENU Up'],
    }
    result['contentHash'] = hashlib.sha256(json.dumps(result, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    destination.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    report = {'contentHash': result['contentHash'], 'triangles': len(triangle_features),
              'elevationRangeM': [min(heights), max(heights)], 'features': reports,
              'displayOutlines': outline_reports,
              'boundsM': [xmin, ymin, xmax, ymax], 'source': result['source'], 'limitations': result['limitations']}
    destination.with_name(destination.stem + '-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ['contentHash', 'triangles', 'elevationRangeM']}))


if __name__ == '__main__':
    main()
