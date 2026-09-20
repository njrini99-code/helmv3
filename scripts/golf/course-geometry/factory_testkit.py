"""Shared fixtures for the factory tests: a synthetic two-layout facility and
fake executors that write the same artifact shapes the real scripts write,
without touching the network or any geospatial library."""
import gzip
import hashlib
import io
import json
import os
import sys
from contextlib import redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from factory import cli
from factory.adapters import prepare_compiled_dir
from factory.fingerprints import digest, file_sha256, terrain_source_identity
from factory.ledger import Ledger
from factory.tasks.common import artifact

HOLES = 18
ORIGIN = [-78.2958511, 39.5119114]
SITE_WAY = 900000001
SITE_A = 900000002
SITE_B = 900000003
COURSE_ID_A = '11111111-1111-4111-8111-111111111111'
COURSE_ID_B = '22222222-2222-4222-8222-222222222222'


def write_json(path, doc):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, indent=1, sort_keys=True, ensure_ascii=False)


def read_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def ring(cx, cy, r=0.0003, n=6):
    import math
    return [[round(cx + r * math.cos(2 * math.pi * i / n), 7), round(cy + r * math.sin(2 * math.pi * i / n), 7)] for i in range(n)] + [[round(cx + r, 7), round(cy, 7)]]


class World:
    """The 'real world' the fake pipeline observes. Tests mutate it (a bunker
    moves, a scorecard changes) and re-run the factory."""

    def __init__(self):
        self.bunker_shift = {}      # hole ordinal -> extra offset (a bunker edit in OSM)
        self.hole_labels = {}       # layout slug -> how a mapper named that course's holes ('Synthetic A' -> 'Synthetic A Hole 3')
        self.canopy = True
        self.naip_sha = 'naip-' + '0' * 60
        # What the fake lab draws: holes whose captures breach the draw-call
        # budget, holes whose page throws, and holes the lab draws from a
        # different mesh than the fixture names (a stale bundle).
        self.draw_call_over = set()
        self.lab_page_errors = set()
        self.lab_mesh_override = {}

    def hole_ways(self, layout_slug, offset_lon):
        ways = []
        base = 1000 * (1 if offset_lon == 0 else 2)
        for n in range(1, HOLES + 1):
            lat = ORIGIN[1] + n * 0.001
            lon = ORIGIN[0] + offset_lon
            tags = {'golf': 'hole', 'ref': str(n), 'par': '4'}
            if self.hole_labels.get(layout_slug):
                tags['description'] = f'{self.hole_labels[layout_slug]} Hole {n}'
            ways.append({'type': 'way', 'id': base + n, 'tags': tags,
                         'geometry': [{'lon': lon, 'lat': lat}, {'lon': lon + 0.0004, 'lat': lat + 0.0004}]})
            # The bunker is part of the OSM extract too, so an edit changes
            # the snapshot the factory re-fetches, not just the fake package.
            shift = self.bunker_shift.get(n, 0) if offset_lon == 0 else 0
            ways.append({'type': 'way', 'id': base + 500 + n, 'tags': {'golf': 'bunker'},
                         'geometry': [{'lon': x, 'lat': y} for x, y in ring(lon + 0.0003 + shift, lat + 0.0002, 0.00005)]})
        return ways

    def extract(self):
        west, south, east, north = ORIGIN[0] - 0.01, ORIGIN[1] - 0.005, ORIGIN[0] + 0.02, ORIGIN[1] + 0.03
        mid = ORIGIN[0] + 0.006

        def box(way_id, name, w, e):
            return {'type': 'way', 'id': way_id, 'tags': {'leisure': 'golf_course', 'name': name},
                    'geometry': [{'lon': w, 'lat': south}, {'lon': e, 'lat': south}, {'lon': e, 'lat': north}, {'lon': w, 'lat': north}, {'lon': w, 'lat': south}]}
        # One resort polygon holds both courses (like Peek'n Peak); each course
        # also has its own polygon, which is what a layout names as its site.
        site = box(SITE_WAY, 'Synthetic Golf Club', west, east)
        course_a = box(SITE_A, 'Synthetic A', west, mid)
        course_b = box(SITE_B, 'Synthetic B', mid, east)
        return {'version': 0.6, 'elements': [site, course_a, course_b] + self.hole_ways('a', 0.0) + self.hole_ways('b', 0.012)}

    def features(self, layout_id, offset_lon):
        feats = []
        for n in range(1, HOLES + 1):
            key = f'{layout_id}-{n:02}'
            lat = ORIGIN[1] + n * 0.001
            lon = ORIGIN[0] + offset_lon
            shift = self.bunker_shift.get(n, 0)
            feats.append({'id': f'{layout_id}-route-{n}', 'kind': 'route', 'holeKeys': [key], 'sourceIds': ['osm'], 'reviewed': False, 'accuracyMeters': None,
                          'geometryWgs84': {'type': 'LineString', 'coordinates': [[lon, lat], [lon + 0.0004, lat + 0.0004]]}})
            feats.append({'id': f'{layout_id}-green-{n}', 'kind': 'green', 'holeKeys': [key], 'sourceIds': ['osm'], 'reviewed': False, 'accuracyMeters': None,
                          'geometryWgs84': {'type': 'Polygon', 'coordinates': [ring(lon + 0.0004, lat + 0.0004)]}})
            feats.append({'id': f'{layout_id}-bunker-{n}', 'kind': 'bunker', 'holeKeys': [key], 'sourceIds': ['osm'], 'reviewed': False, 'accuracyMeters': None,
                          'geometryWgs84': {'type': 'Polygon', 'coordinates': [ring(lon + 0.0003 + shift, lat + 0.0002, 0.00005)]}})
        return feats


class FakePipeline:
    def __init__(self, world):
        self.world = world
        self.calls = []

    # ---- helpers -----------------------------------------------------------
    def _mark(self, node):
        self.calls.append(node.key)

    def executors(self):
        return {
            'facility.aoi.resolve': self.aoi, 'facility.osm.snapshot': self.osm, 'facility.context.snapshot': self.context_snapshot,
            'layout.routes.resolve': self.routes, 'layout.scorecard.compose': self.scorecard, 'layout.candidates.compose': self.candidates,
            'layout.terrain.acquire': self.terrain, 'layout.canopy.derive': self.canopy, 'layout.package.compose': self.package,
            'layout.package.validate': self.package_validate, 'layout.terrain.base': self.terrain_base, 'layout.imagery.audit': self.imagery,
            'layout.context.classify': self.context, 'hole.terrain.compile': self.hole_terrain, 'hole.world.build': self.hole_world,
            'layout.terrain.aggregate': self.terrain_aggregate, 'layout.world.aggregate': self.world_aggregate, 'layout.review.queue': self.review_queue,
            'layout.capability.evaluate': self.capability,
        }

    # ---- facility ----------------------------------------------------------
    def aoi(self, node, ctx, run):
        self._mark(node)
        facility = ctx.facility(node.scope.facility_id)
        ex = self.world.extract()
        site = ex['elements'][0]
        pts = [(p['lon'], p['lat']) for p in site['geometry']]
        bbox = [min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)]
        doc = {'kind': 'golfhelm-factory-aoi-v1', 'facilityId': facility['facilityId'], 'element': facility['aoi']['id'], 'elementBboxWgs84': bbox,
               'marginM': facility['aoi']['marginM'], 'bboxWgs84': [bbox[0] - 0.003, bbox[1] - 0.003, bbox[2] + 0.003, bbox[3] + 0.003],
               'centroidWgs84': ORIGIN, 'polygon': pts, 'retrievedAt': '2026-09-19', 'responseSha256': 'x' * 64}
        write_json(ctx.aoi_path(facility['facilityId']), doc)
        return [artifact('aoi', ctx.aoi_path(facility['facilityId']), 'A')]

    def _snapshot(self, node, ctx, folder, doc, prefix):
        raw = json.dumps(doc, sort_keys=True).encode()
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, 'overpass.json.gz'), 'wb') as f:
            f.write(gzip.compress(raw, mtime=0))
        manifest = {'schemaVersion': 1, 'file': 'overpass.json.gz', 'retrievedAt': '2026-09-19', 'elementCount': len(doc['elements']),
                    'uncompressedSha256': hashlib.sha256(raw).hexdigest()}
        write_json(os.path.join(folder, 'manifest.json'), manifest)
        return [artifact(f'{prefix}-manifest', os.path.join(folder, 'manifest.json'), 'A'), artifact(f'{prefix}-extract', os.path.join(folder, 'overpass.json.gz'), 'A')]

    def osm(self, node, ctx, run):
        self._mark(node)
        return self._snapshot(node, ctx, ctx.snapshot_dir(node.scope.facility_id, 'osm'), self.world.extract(), 'osm')

    def context_snapshot(self, node, ctx, run):
        self._mark(node)
        doc = {'version': 0.6, 'elements': [{'type': 'way', 'id': 5, 'tags': {'highway': 'service'}, 'geometry': [{'lon': ORIGIN[0], 'lat': ORIGIN[1]}, {'lon': ORIGIN[0] + 0.001, 'lat': ORIGIN[1]}]}]}
        return self._snapshot(node, ctx, ctx.snapshot_dir(node.scope.facility_id, 'osm-context'), doc, 'osm-context')

    # ---- layout ------------------------------------------------------------
    def routes(self, node, ctx, run):
        self._mark(node)
        from factory.adapters import resolve_routes
        return resolve_routes(node, ctx, run)

    def scorecard(self, node, ctx, run):
        self._mark(node)
        from factory.adapters import compose_scorecard
        return compose_scorecard(node, ctx, run)

    def _prepare(self, node, ctx, folder, with_canopy):
        layout_id = node.scope.layout_id
        card = ctx.json(ctx.scorecard_path(layout_id))
        offset = 0.0 if layout_id.endswith('-a') else 0.012
        features = self.world.features(layout_id, offset)
        holes = []
        for n in range(1, HOLES + 1):
            key = f'{layout_id}-{n:02}'
            holes.append({'key': key, 'ordinal': n, 'par': card['pars'][n - 1], 'scorecardYards': card['scorecardYards'][n - 1],
                          'featureIds': [f['id'] for f in features if key in f['holeKeys']], 'routeFeatureId': f'{layout_id}-route-{n}',
                          'greenFeatureId': f'{layout_id}-green-{n}', 'completeness': 'partial'})
        pkg = {'schemaVersion': 1, 'siteId': card['siteId'], 'name': card['name'], 'status': 'source_candidate', 'originWgs84': card['originWgs84'],
               'projection': 'wgs84-local-enu-v1', 'features': features, 'holes': holes, 'sources': [{'id': 'osm'}]}
        canopy_summary = None
        if with_canopy:
            canopy = ctx.json(ctx.canopy_path(layout_id))
            for region in canopy['regions']:
                pkg['features'].append({'id': 'naip-' + region['id'], 'kind': 'woods', 'sourceIds': ['naip'], 'holeKeys': [region['holeKey']], 'reviewed': True,
                                        'accuracyMeters': None, 'geometryWgs84': {'type': 'Polygon', 'coordinates': [region['coordinatesWgs84']]}})
                next(h for h in holes if h['key'] == region['holeKey'])['featureIds'].append('naip-' + region['id'])
            canopy_summary = {'groups': len(canopy['regions']), 'rasterSha256': canopy['rasterSha256']}
        pkg['contentHash'] = digest(pkg)
        manifest, _ = ctx.snapshot(node.scope.facility_id)
        write_json(os.path.join(folder, 'normalized.json'), pkg)
        write_json(os.path.join(folder, 'source-metadata.json'), {'scorecard': card, 'overpassSha256': manifest['uncompressedSha256']})
        write_json(os.path.join(folder, 'association-report.json'), {'packageHash': pkg['contentHash'], 'canopy': canopy_summary, 'holes': []})
        ref = artifact('package', os.path.join(folder, 'normalized.json'), 'A')
        ref.sha256 = pkg['contentHash']
        return [ref, artifact('association-report', os.path.join(folder, 'association-report.json'), 'A'), artifact('source-metadata', os.path.join(folder, 'source-metadata.json'), 'A')]

    def candidates(self, node, ctx, run):
        self._mark(node)
        return self._prepare(node, ctx, ctx.candidates_dir(node.scope.layout_id), False)

    def package(self, node, ctx, run):
        self._mark(node)
        with_canopy = ctx.states.get(f'layout.canopy.derive[{node.scope.layout_id}]') in ('cached', 'success')
        return self._prepare(node, ctx, ctx.package_dir(node.scope.layout_id), with_canopy)

    def terrain(self, node, ctx, run):
        self._mark(node)
        layout_id = node.scope.layout_id
        pkg = ctx.json(ctx.candidates_package_path(layout_id), fresh=True)
        bounds = ctx.terrain_bounds(layout_id)    # the real compiler's request bounds (snapped to its grid)
        folder = os.path.join(ctx.facility_out(node.scope.facility_id), 'terrain', digest(bounds)[:12])
        manifest_path = os.path.join(folder, 'source-manifest.json')
        manifest = ctx.json(manifest_path, fresh=True)
        if manifest and manifest['packageHash'] != pkg['contentHash']:
            manifest['previousPackageHashes'] = manifest.get('previousPackageHashes', []) + [manifest['packageHash']]
            manifest['packageHash'] = pkg['contentHash']
            write_json(manifest_path, manifest)
        if not manifest:
            os.makedirs(folder, exist_ok=True)
            with open(os.path.join(folder, 'elevation.tiff'), 'wb') as f:
                f.write(b'TIFF' * 64)
            write_json(os.path.join(folder, 'export.json'), {'extent': {'xmin': 0, 'ymin': 0, 'xmax': 1000, 'ymax': 1000}, 'width': 1000, 'height': 1000})
            hashes = {name: file_sha256(os.path.join(folder, name)) for name in ('elevation.tiff', 'export.json')}
            manifest = {'schemaVersion': 1, 'packageHash': pkg['contentHash'], 'requestedLocalBoundsM': bounds, 'selectedTitle': 'Synthetic 1m tile',
                        'retrievedAt': '2026-09-19', 'fileHashes': hashes}
            write_json(manifest_path, manifest)
        pointer = {'kind': 'golfhelm-factory-terrain-source-v1', 'layoutId': layout_id, 'directory': ctx.relpath(folder), 'requestedLocalBoundsM': bounds,
                   'sourceManifestHash': digest(manifest), 'sourceIdentity': terrain_source_identity(manifest), 'selectedTitle': manifest['selectedTitle']}
        write_json(ctx.terrain_pointer_path(layout_id), pointer)
        arts = [artifact('terrain-source-pointer', ctx.terrain_pointer_path(layout_id), 'A')]
        arts += [artifact(f'terrain-{name}', os.path.join(folder, name), 'A') for name in manifest['fileHashes']]
        return arts

    def canopy(self, node, ctx, run):
        self._mark(node)
        layout_id = node.scope.layout_id
        naip = ctx.naip_out(layout_id)
        os.makedirs(naip, exist_ok=True)
        with open(os.path.join(naip, 'naip.tif'), 'wb') as f:
            f.write(b'NAIP' * 64)
        write_json(os.path.join(naip, 'manifest.json'), {'rasterSha256': self.world.naip_sha, 'captureDates': ['2024-06-01']})
        pkg = ctx.json(ctx.candidates_package_path(layout_id), fresh=True)
        regions = [{'id': f'{layout_id}-woods-1', 'holeKey': f'{layout_id}-05', 'coordinatesWgs84': ring(ORIGIN[0] - 0.002, ORIGIN[1] + 0.005, 0.0005)}] if self.world.canopy else []
        doc = {'kind': 'golfhelm-canopy-review-v1', 'siteId': pkg['siteId'], 'packageHash': pkg['contentHash'], 'reviewedAt': '2026-09-19',
               'rasterSha256': self.world.naip_sha, 'regions': regions, 'method': {'name': 'fake'}}
        write_json(ctx.canopy_out(layout_id), doc)
        return [artifact('canopy-review', ctx.canopy_out(layout_id), 'A'), artifact('naip-manifest', os.path.join(naip, 'manifest.json'), 'B'), artifact('naip-raster', os.path.join(naip, 'naip.tif'), 'B')]

    def package_validate(self, node, ctx, run):
        self._mark(node)
        from factory.tasks.layout_tasks import run_package_validate
        return run_package_validate(node, ctx, run)

    def _asset_manifest(self, ctx, layout_id, folder, holes):
        manifest = ctx.terrain_source_manifest(layout_id)
        doc = {'schemaVersion': 1, 'compilerVersion': 'course-terrain-v4', 'geometryHash': ctx.package_hash(layout_id), 'sourceManifestHash': digest(manifest),
               'sourceIdentity': terrain_source_identity(manifest), 'holes': dict(sorted(holes.items()))}
        write_json(os.path.join(folder, 'asset-manifest.json'), doc)
        # Like the real compiler, the compilation report embeds the source manifest.
        write_json(os.path.join(folder, 'compilation-report.json'), {'compilerVersion': 'course-terrain-v4', 'packageHash': ctx.package_hash(layout_id), 'source': manifest,
                                                                     'sourceManifestHash': digest(manifest), 'contextLayerHash': self._context_hash(ctx, layout_id)})
        return doc

    def _context_hash(self, ctx, layout_id):
        if ctx.states.get(f'layout.context.classify[{layout_id}]') in ('cached', 'success'):
            return (ctx.context_layer(layout_id) or {}).get('contentHash')
        return None

    def terrain_base(self, node, ctx, run):
        self._mark(node)
        layout_id = node.scope.layout_id
        folder = ctx.terrain_base_out(layout_id)
        holes = {h['key']: {'fileName': f'{h["key"]}-terrain.json.gz'} for h in ctx.package(layout_id)['holes']}
        self._asset_manifest(ctx, layout_id, folder, holes)
        return [artifact('compiled-base-assets', os.path.join(folder, 'asset-manifest.json'), 'C'), artifact('compiled-base-report', os.path.join(folder, 'compilation-report.json'), 'C')]

    def imagery(self, node, ctx, run):
        self._mark(node)
        layout_id = node.scope.layout_id
        doc = {'packageHash': ctx.package_hash(layout_id), 'holes': [{'key': h['key'], 'bunkers': [{'featureId': f'{layout_id}-bunker-{h["ordinal"]}', 'sandShareInside': 0.5}]} for h in ctx.package(layout_id)['holes']],
               'lowSandShare': 0.35}
        write_json(ctx.imagery_review_out(layout_id), doc)
        return [artifact('imagery-review', ctx.imagery_review_out(layout_id), 'A')]

    def context(self, node, ctx, run):
        self._mark(node)
        layout_id = node.scope.layout_id
        pkg = ctx.package(layout_id)
        zones = [{'id': f'{layout_id}-zone-1', 'class': 'service_path', 'holeKeys': [f'{layout_id}-01'], 'geometryWgs84': {'type': 'LineString', 'coordinates': [[ORIGIN[0], ORIGIN[1]], [ORIGIN[0] + 0.001, ORIGIN[1]]]}, 'fidelity': 'osm'}]
        layer = {'kind': 'golfhelm-context-layer-v1', 'siteId': pkg['siteId'], 'packageHash': pkg['contentHash'], 'status': 'source_candidate', 'zones': zones}
        layer['contentHash'] = digest(layer)
        write_json(ctx.context_layer_out(layout_id), layer)
        report = {'kind': 'golfhelm-context-report-v1', 'packageHash': pkg['contentHash'], 'layerHash': layer['contentHash'], 'holes': [{'key': h['key'], 'uncertainShare': 0.1} for h in pkg['holes']]}
        write_json(ctx.context_report_out(layout_id), report)
        ref = artifact('context-layer', ctx.context_layer_out(layout_id), 'A')
        ref.sha256 = layer['contentHash']
        return [ref, artifact('context-report', ctx.context_report_out(layout_id), 'A')]

    # ---- hole --------------------------------------------------------------
    def hole_terrain(self, node, ctx, run):
        self._mark(node)
        layout_id = node.scope.layout_id
        folder = prepare_compiled_dir(ctx, layout_id)
        os.makedirs(folder, exist_ok=True)
        hole = ctx.package_hole(layout_id, node.scope.ordinal)
        sub = ctx.hole_subhashes(layout_id, node.scope.ordinal)
        context = ctx.context_layer(layout_id) if ctx.states.get(f'layout.context.classify[{layout_id}]') in ('cached', 'success') else None
        # Like the real compiler: the source identity comes from the source
        # manifest (built or retained), never from the built pointer alone.
        source_manifest = ctx.terrain_source_manifest(layout_id)
        identity = terrain_source_identity(source_manifest)
        # And like the real compiler, an existing manifest for another
        # package or source refuses the directory before anything is written.
        manifest = ctx.json(os.path.join(folder, 'asset-manifest.json'), fresh=True)
        holes = {}
        if manifest:
            same_source = manifest['sourceIdentity'] == identity if manifest.get('sourceIdentity') else manifest['sourceManifestHash'] == digest(source_manifest)
            if manifest['geometryHash'] != ctx.package_hash(layout_id) or not same_source:
                raise ValueError('Output manifest belongs to a different package/source; choose a new directory')
            holes = dict(manifest['holes'])
        terrain = {'kind': 'terrain', 'hole': hole['key'], 'terrainInput': sub['holeTerrainInputHash'], 'source': identity}
        terrain['contentHash'] = digest(terrain)
        write_json(os.path.join(folder, f'{hole["key"]}-terrain.json'), terrain)
        with open(os.path.join(folder, f'{hole["key"]}-terrain.json'), 'rb') as f:
            payload = f.read()
        with open(os.path.join(folder, f'{hole["key"]}-terrain.json.gz'), 'wb') as f:
            f.write(gzip.compress(payload, mtime=0))
        report = {'geometryHash': ctx.package_hash(layout_id), 'contentHash': terrain['contentHash'], 'triangles': 1000 + node.scope.ordinal,
                  'contextLayerHash': (context or {}).get('contentHash'), 'noding': {'tJunctionVertices': 0},
                  'asset': {'ordinal': hole['ordinal'], 'fileName': f'{hole["key"]}-terrain.json.gz', 'contentHash': terrain['contentHash']}}
        write_json(os.path.join(folder, f'{hole["key"]}-report.json'), report)
        holes[hole['key']] = report['asset']
        self._asset_manifest(ctx, layout_id, folder, holes)
        return [artifact('terrain', os.path.join(folder, f'{hole["key"]}-terrain.json'), 'C'), artifact('terrain-report', os.path.join(folder, f'{hole["key"]}-report.json'), 'C')]

    def hole_world(self, node, ctx, run):
        self._mark(node)
        layout_id = node.scope.layout_id
        hole = ctx.package_hole(layout_id, node.scope.ordinal)
        folder = os.path.join(ctx.layout_out(layout_id), 'world', 'holes', hole['key'])
        sub = ctx.hole_subhashes(layout_id, node.scope.ordinal)
        study = {'hole': hole['key'], 'golf': sub['holeGolfGeometryHash']}
        study['contentHash'] = digest(study)
        write_json(os.path.join(folder, 'study.json'), study)
        write_json(os.path.join(folder, 'validation', 'course-truth.json'), {'passed': False})
        record = {'packageHash': ctx.package_hash(layout_id), 'terrainRasterSha256': 'x', 'builtAt': '2026-09-19T00:00:00+00:00', 'blender': False, 'key': hole['key'],
                  'ordinal': hole['ordinal'], 'par': hole['par'], 'studyHash': study['contentHash'], 'physicalWorldHash': digest(['world', study['contentHash']]), 'truthGatePassed': False}
        write_json(os.path.join(folder, 'record.json'), record)
        return [artifact('world-record', os.path.join(folder, 'record.json'), 'C'), artifact('world-study', os.path.join(folder, 'study.json'), 'C'),
                artifact('world-truth', os.path.join(folder, 'validation', 'course-truth.json'), 'C')]

    # ---- aggregates ---------------------------------------------------------
    def terrain_aggregate(self, node, ctx, run):
        self._mark(node)
        from factory.adapters import aggregate_terrain
        return aggregate_terrain(node, ctx, run)

    def world_aggregate(self, node, ctx, run):
        self._mark(node)
        from factory.adapters import aggregate_world
        return aggregate_world(node, ctx, run)

    def review_queue(self, node, ctx, run):
        self._mark(node)
        from factory.adapters import review_queue
        return review_queue(node, ctx, run)

    def capability(self, node, ctx, run):
        self._mark(node)
        from factory.tasks.aggregate_tasks import run_capability
        return run_capability(node, ctx, run)


def write_catalog(root, two_layouts=True, yards_a=None, routes_a=None, site_a_shared=False):
    facility = {'schema': 'golfhelm-facility-v1', 'facilityId': 'synthetic', 'name': 'Synthetic Golf Club', 'country': 'US', 'region': 'WV', 'originWgs84': ORIGIN,
                'aoi': {'kind': 'osm', 'id': f'way/{SITE_WAY}', 'marginM': 300}, 'sourcePins': {'osm': [f'way/{SITE_WAY}', f'way/{SITE_A}', f'way/{SITE_B}']},
                'providerPolicy': {'terrain': ['usgs_s1m'], 'imagery': ['naip_current'], 'context': ['osm']}}
    write_json(os.path.join(root, 'facilities', 'synthetic.json'), facility)
    layouts = [('synthetic-a', COURSE_ID_A, routes_a)] + ([('synthetic-b', COURSE_ID_B, None)] if two_layouts else [])
    for layout_id, course_id, routes in layouts:
        holes = [f'{layout_id}-{n:02}' for n in range(1, HOLES + 1)]
        write_json(os.path.join(root, 'layouts', f'{layout_id}.json'), {
            'schema': 'golfhelm-layout-v1', 'layoutId': layout_id, 'facilityId': 'synthetic', 'name': f'Synthetic {layout_id[-1].upper()}',
            'siteIds': [f'osm-way-{(SITE_WAY if site_a_shared else SITE_A) if layout_id.endswith("-a") else SITE_B}'], 'segments': {'main': {'holes': holes}}, 'segmentOrder': ['main'], 'holeOrder': holes,
            'routeWayIds': routes, 'bboxWgs84': None, 'capabilityTier': 'C0', 'externalBindings': {'golfCourseIds': [course_id]},
            'scorecardProfiles': [f'{layout_id}-blue'], 'geometry': None})
        yards = yards_a if (yards_a and layout_id == 'synthetic-a') else [400 + n for n in range(1, HOLES + 1)]
        write_json(os.path.join(root, 'scorecards', f'{layout_id}-blue.json'), {
            'schema': 'golfhelm-scorecard-profile-v1', 'profileId': f'{layout_id}-blue', 'layoutId': layout_id, 'teeName': 'Blue',
            'source': {'provider': 'owner_supplied', 'url': None, 'retrievedAt': '2026-09-19'},
            'holes': [{'hole': n, 'par': 4, 'yards': yards[n - 1]} for n in range(1, HOLES + 1)]})


# A one-pixel PNG: the fake lab's captures are real image files, so the
# artifact checks (presence, bytes, sha) run on them like on the real ones.
PNG_1PX = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8ffff3f0005fe02fe'
                        'a735814a0000000049454e44ae426082')


class FakeLabCommands:
    """Stands in for adapters.run_command when a test drives the real capture
    executors: writes what the two capture scripts and the two sheet builders
    write, from the same argv, without node, playwright or a browser."""

    def __init__(self, world):
        self.world = world
        self.calls = []

    @staticmethod
    def _args(command):
        return {a[2:].split('=', 1)[0]: a[2:].split('=', 1)[1] if '=' in a else True for a in command if a.startswith('--')}

    def _mesh(self, ctx, course, hole):
        from factory import lab
        manifest = read_json(lab.fixture_manifest_path(ctx, course))
        entry = next(e for e in manifest['holes'].values() if e['ordinal'] == hole)
        return self.world.lab_mesh_override.get(hole, entry['contentHash'])

    def __call__(self, ctx, run, node, command, env=None, check=True):
        command = [str(c) for c in command]
        name = os.path.basename(command[1])
        self.calls.append((name, command[2:]))
        args = self._args(command)
        code = 0
        if name == 'capture-visual-canaries.cjs':
            hole, out, course = int(args['holes']), args['out'], args['course']
            presets, viewports = args['presets'].split(','), args['viewports'].split(',')
            pkg = read_json(os.path.join(ctx.repo_root, 'src', 'test', 'fixtures', 'course-geometry', f'{course}.json'))
            report = {'label': args['label'], 'course': course, 'packageHash': pkg['contentHash'], 'base': args['base'], 'capturedAt': '2026-09-19T00:00:00.000Z',
                      'debugView': None, 'holes': [hole], 'presets': presets, 'viewports': viewports,
                      'uncertainGate': {'max': 0.15, 'contextLayerHash': None, 'pass': [hole], 'fail': [], 'unavailable': []}, 'captures': [], 'errors': []}
            os.makedirs(out, exist_ok=True)
            for viewport in viewports:
                if hole in self.world.lab_page_errors:
                    report['errors'].append({'viewport': viewport, 'message': 'Uncaught TypeError: fake page error'})
                for preset in presets:
                    file = f'hole-{hole:02d}-{preset.lower()}-{viewport}.png'
                    with open(os.path.join(out, file), 'wb') as f:
                        f.write(PNG_1PX)
                    over = hole in self.world.draw_call_over and viewport.startswith('390')
                    report['captures'].append({'hole': hole, 'preset': preset, 'viewport': viewport, 'file': file,
                                               'metadata': {'packageHash': pkg['contentHash'], 'drawCalls': 350 if over else 120, 'drawCallBudget': 200,
                                                            'drawCallStatus': 'over' if over else 'within', 'renderTriangles': 90000, 'terrainHash': self._mesh(ctx, course, hole),
                                                            'uncertainShare': 0.1, 'uncertainGate': 'pass'}})
            write_json(os.path.join(out, 'canaries.json'), report)
            code = 1 if report['errors'] or any(c['metadata']['drawCallStatus'] != 'within' for c in report['captures']) else 0
        elif name == 'capture-player-view.cjs':
            out, hole, course = args['out'], int(args['hole']), args['course']
            os.makedirs(os.path.dirname(out), exist_ok=True)
            with open(out, 'wb') as f:
                f.write(PNG_1PX)
            over = hole in self.world.draw_call_over and args['viewport'] == 'phone'
            doc = {'course': course, 'hole': hole, 'viewport': {'width': 390, 'height': 844} if args['viewport'] == 'phone' else {'width': 1440, 'height': 1000},
                   'view': args['view'], 'dataset': {'drawCalls': 350 if over else 130, 'drawCallBudget': 200, 'drawCallStatus': 'over' if over else 'within',
                                                     'renderTriangles': 90000, 'terrainHash': self._mesh(ctx, course, hole)},
                   'chrome': ['Close', 'Top', 'Terrain', 'Green'], 'errors': ['Uncaught TypeError: fake page error'] if hole in self.world.lab_page_errors else []}
            write_json(out[:-4] + '.json', doc)
            code = 1 if doc['errors'] or over else 0
        elif name in ('build-canary-sheet.py', 'build-player-sheet.py'):
            os.makedirs(os.path.dirname(command[-1]), exist_ok=True)
            with open(command[-1], 'wb') as f:
                f.write(PNG_1PX)
        else:
            raise AssertionError(f'unexpected command {command}')
        if check and code:
            raise RuntimeError(f'{name} exited {code}')
        return type('Result', (), {'returncode': code})()


class Harness:
    """Runs the CLI in-process against a temp repo root, with fake executors."""

    def __init__(self, tmp, world=None, two_layouts=True, site_a_shared=False):
        self.repo = os.path.join(tmp, 'repo')
        self.catalog = os.path.join(self.repo, 'course-geometry', 'catalog')
        self.output = os.path.join(self.repo, 'output', 'course-geometry', 'factory')
        os.makedirs(self.catalog, exist_ok=True)
        # The real repo's scripts are the impl files; point the fake repo at copies so impl hashes exist.
        scripts = os.path.join(self.repo, 'scripts', 'golf', 'course-geometry')
        os.makedirs(scripts, exist_ok=True)
        for name in os.listdir(HERE):
            if name.endswith(('.py', '.mts', '.cjs')) and os.path.isfile(os.path.join(HERE, name)):
                with open(os.path.join(HERE, name), 'rb') as f, open(os.path.join(scripts, name), 'wb') as g:
                    g.write(f.read())
        self.world = world or World()
        self.two_layouts = two_layouts
        write_catalog(self.catalog, two_layouts, site_a_shared=site_a_shared)
        self.pipeline = FakePipeline(self.world)
        self.ledger = Ledger(os.path.join(self.output, 'state.sqlite'))
        self.overrides = None

    def run(self, *argv, executors=None):
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = cli.main(['--repo-root', self.repo, '--output', self.output, *argv], out=buf, ledger=self.ledger,
                            executors=self.pipeline.executors() if executors is None else executors, spec_overrides=self.overrides)
        return code, buf.getvalue()

    def lab_executors(self):
        """The fakes plus the real capture executors: a test drives them with
        FakeLabCommands in place of adapters.run_command (see lab_session)."""
        from factory import adapters
        return {**self.pipeline.executors(), 'hole.visual.canary': adapters.capture_visual_canary, 'hole.player.capture': adapters.capture_player_view,
                'layout.visual.aggregate': adapters.aggregate_visual, 'layout.player.aggregate': adapters.aggregate_player}

    def lab_session(self, listening=True):
        """Patches the lab probe, the node lookup and the command runner so the
        real capture executors run against the fake lab; returns (context manager, commands)."""
        from contextlib import ExitStack
        from unittest import mock
        commands = FakeLabCommands(self.world)
        stack = ExitStack()
        stack.enter_context(mock.patch('factory.lab.listening', return_value=listening))
        stack.enter_context(mock.patch('factory.adapters.shutil.which', return_value='/usr/bin/node'))
        stack.enter_context(mock.patch('factory.adapters.run_command', commands))
        return stack, commands

    def retain_in_lab(self, layout):
        """What a PR does for a course the owner wants in the lab: the compiled
        directory and the package become checked-in fixtures the lab is
        hash-locked to (src/test/fixtures/course-geometry/compiled-<layout>)."""
        import shutil
        fixtures = os.path.join(self.repo, 'src', 'test', 'fixtures', 'course-geometry')
        os.makedirs(fixtures, exist_ok=True)
        target = os.path.join(fixtures, f'compiled-{layout}')
        shutil.rmtree(target, ignore_errors=True)
        shutil.copytree(os.path.join(self.output, 'layouts', layout, 'compiled'), target)
        shutil.copyfile(os.path.join(self.output, 'layouts', layout, 'package', 'normalized.json'), os.path.join(fixtures, f'{layout}.json'))

    def plan_rows(self, layout, executors=None):
        code, text = self.run('plan', '--layout', layout, '--json', executors=executors)
        assert code == 0, text
        return {r['key']: r for r in json.loads(text)['rows']}

    def states(self, layout, executors=None):
        return {k: (r['state'], r['reason']) for k, r in self.plan_rows(layout, executors).items()}
