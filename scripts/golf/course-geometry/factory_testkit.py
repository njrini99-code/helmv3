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
from factory.fingerprints import digest, file_sha256
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


def ring(cx, cy, r=0.0003, n=6):
    import math
    return [[round(cx + r * math.cos(2 * math.pi * i / n), 7), round(cy + r * math.sin(2 * math.pi * i / n), 7)] for i in range(n)] + [[round(cx + r, 7), round(cy, 7)]]


class World:
    """The 'real world' the fake pipeline observes. Tests mutate it (a bunker
    moves, a scorecard changes) and re-run the factory."""

    def __init__(self):
        self.bunker_shift = {}      # hole ordinal -> extra offset (a bunker edit in OSM)
        self.canopy = True
        self.naip_sha = 'naip-' + '0' * 60

    def hole_ways(self, layout_slug, offset_lon):
        ways = []
        base = 1000 * (1 if offset_lon == 0 else 2)
        for n in range(1, HOLES + 1):
            lat = ORIGIN[1] + n * 0.001
            lon = ORIGIN[0] + offset_lon
            ways.append({'type': 'way', 'id': base + n, 'tags': {'golf': 'hole', 'ref': str(n), 'par': '4'},
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
        from factory.fingerprints import terrain_source_identity
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
        doc = {'schemaVersion': 1, 'compilerVersion': 'course-terrain-v4', 'geometryHash': ctx.package_hash(layout_id), 'sourceManifestHash': digest(manifest), 'holes': holes}
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
        folder = ctx.compiled_out(layout_id)
        os.makedirs(folder, exist_ok=True)
        hole = ctx.package_hole(layout_id, node.scope.ordinal)
        sub = ctx.hole_subhashes(layout_id, node.scope.ordinal)
        context = ctx.context_layer(layout_id) if ctx.states.get(f'layout.context.classify[{layout_id}]') in ('cached', 'success') else None
        terrain = {'kind': 'terrain', 'hole': hole['key'], 'terrainInput': sub['holeTerrainInputHash'], 'source': ctx.terrain_pointer(layout_id)['sourceIdentity']}
        terrain['contentHash'] = digest(terrain)
        write_json(os.path.join(folder, f'{hole["key"]}-terrain.json'), terrain)
        report = {'geometryHash': ctx.package_hash(layout_id), 'contentHash': terrain['contentHash'], 'triangles': 1000 + node.scope.ordinal,
                  'contextLayerHash': (context or {}).get('contentHash'), 'noding': {'tJunctionVertices': 0}, 'asset': {'fileName': f'{hole["key"]}-terrain.json.gz'}}
        write_json(os.path.join(folder, f'{hole["key"]}-report.json'), report)
        manifest = ctx.json(os.path.join(folder, 'asset-manifest.json'), fresh=True) or {'holes': {}}
        holes = {**manifest.get('holes', {}), hole['key']: report['asset']} if manifest.get('geometryHash') == ctx.package_hash(layout_id) else {hole['key']: report['asset']}
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

    def plan_rows(self, layout):
        code, text = self.run('plan', '--layout', layout, '--json')
        assert code == 0, text
        return {r['key']: r for r in json.loads(text)['rows']}

    def states(self, layout):
        return {k: (r['state'], r['reason']) for k, r in self.plan_rows(layout).items()}
