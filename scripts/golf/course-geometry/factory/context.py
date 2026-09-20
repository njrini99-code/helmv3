"""What task specs may read while a plan is computed: the catalog, retained
artifacts, the factory's own outputs, the ledger, and the outputs of nodes
planned before them. Paths are decided here once so evaluators and executors
agree on where every artifact lives."""
import importlib.util
import json
import os

from . import osm
from .fingerprints import (
    content_hash_matches,
    digest,
    files_digest,
    package_subhashes,
    terrain_source_identity,
)

SCRIPTS_DIR = 'scripts/golf/course-geometry'
MIN_HOLE_COUNT = 9
MAX_HOLE_COUNT = 36


def supported_hole_count(value):
    """The canonical catalog and package compiler support a nine-hole loop,
    a standard eighteen, and multi-segment layouts up to 36 holes.  The
    factory must not discard a course merely because its round is nine holes.
    Route and source truth are still independently gated."""
    return isinstance(value, int) and MIN_HOLE_COUNT <= value <= MAX_HOLE_COUNT


_COMPILERS = {}


def _compiler_module(path):
    """compile-course-terrain.py, imported once per process (it loads shapely,
    pyproj and numpy) so planning many layouts stays cheap."""
    if path not in _COMPILERS:
        spec = importlib.util.spec_from_file_location('golfhelm_compile_course_terrain', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _COMPILERS[path] = module
    return _COMPILERS[path]


class Context:
    def __init__(self, repo_root, catalog, output_root, ledger=None, adopt_output=True, executors=None, spec_overrides=None):
        self.repo_root = os.path.abspath(repo_root)
        self.catalog = catalog
        self.output_root = os.path.abspath(output_root)
        self.ledger = ledger
        self.adopt_output = adopt_output
        self.executors = executors or {}
        self.spec_overrides = spec_overrides or {}
        self.graph = None
        self.outputs = {}          # node key -> output hash of a cached/successful node
        self.states = {}           # node key -> state
        self.rows = {}             # node key -> PlanRow
        self._json = {}
        self._extracts = {}
        self._subhashes = {}
        self._impl = {}
        self._bounds = {}
        self._routes = {}

    # --- catalog ------------------------------------------------------------
    def facility(self, facility_id):
        return self.catalog.facilities.get(facility_id)

    def layout(self, layout_id):
        return self.catalog.layouts.get(layout_id)

    def scorecards(self, layout_id):
        return self.catalog.scorecards_of(layout_id)

    def scorecard(self, layout_id):
        """The profile the build uses: the first one the layout names."""
        layout = self.layout(layout_id) or {}
        cards = {c['profileId']: c for c in self.scorecards(layout_id)}
        for profile in layout.get('scorecardProfiles') or []:
            if profile in cards:
                return cards[profile]
        return next(iter(cards.values()), None)

    # --- paths --------------------------------------------------------------
    def abspath(self, path):
        if path is None:
            return None
        return path if os.path.isabs(path) else os.path.join(self.repo_root, path)

    def relpath(self, path):
        try:
            return os.path.relpath(path, self.repo_root)
        except ValueError:
            return path

    def is_output_path(self, path):
        path = os.path.abspath(path)
        return path.startswith((self.output_root, os.path.join(self.repo_root, 'output') + os.sep))

    def can_adopt(self, path):
        return path is not None and (self.adopt_output or not self.is_output_path(path))

    def retained(self, doc, key):
        retained = (doc or {}).get('retained') or {}
        return self.abspath(retained.get(key))

    def layout_out(self, layout_id):
        return os.path.join(self.output_root, 'layouts', layout_id)

    def facility_out(self, facility_id):
        return os.path.join(self.output_root, 'facilities', facility_id)

    # facility artifacts
    def aoi_path(self, facility_id):
        return os.path.join(self.facility_out(facility_id), 'aoi.json')

    def card_path(self, facility_id):
        return os.path.join(self.facility_out(facility_id), 'card.json')

    # A facility visual candidate is deliberately distinct from the layout
    # package. It may show a source-backed property before a tee-to-green
    # route is known, but it never supplies a hole association or a metric
    # measurement to GolfHelm.
    def visual_candidate_dir(self, layout_id):
        facility_id = (self.layout(layout_id) or {}).get('facilityId')
        return os.path.join(self.facility_out(facility_id), 'visual-candidate')

    def visual_candidate_package_path(self, layout_id):
        return os.path.join(self.visual_candidate_dir(layout_id), 'normalized.json')

    def visual_candidate_report_path(self, layout_id):
        return os.path.join(self.visual_candidate_dir(layout_id), 'visual-candidate-report.json')

    def visual_candidate_pointer_path(self, layout_id):
        return os.path.join(self.layout_out(layout_id), 'visual-candidate.json')

    def visual_candidate_pointer(self, layout_id):
        return self.json(self.visual_candidate_pointer_path(layout_id)) if self.can_adopt(self.visual_candidate_pointer_path(layout_id)) else None

    def visual_terrain_pointer_path(self, layout_id):
        return os.path.join(self.layout_out(layout_id), 'visual-terrain-source.json')

    def visual_terrain_pointer(self, layout_id):
        return self.json(self.visual_terrain_pointer_path(layout_id)) if self.can_adopt(self.visual_terrain_pointer_path(layout_id)) else None

    def visual_terrain_source_dir(self, layout_id):
        pointer = self.visual_terrain_pointer(layout_id)
        return self.abspath(pointer.get('directory')) if pointer and pointer.get('directory') else None

    def visual_world_dir(self, layout_id):
        facility_id = (self.layout(layout_id) or {}).get('facilityId')
        return os.path.join(self.facility_out(facility_id), 'visual-world')

    def visual_world_pointer_path(self, layout_id):
        return os.path.join(self.layout_out(layout_id), 'visual-world.json')

    def aoi(self, facility_id):
        return self.json(self.aoi_path(facility_id)) if self.can_adopt(self.aoi_path(facility_id)) else None

    def _aoi_key(self, facility_id):
        aoi = self.aoi(facility_id)
        return digest(aoi['bboxWgs84'])[:8] if aoi else None

    def snapshot_pointer_path(self, facility_id, kind):
        """`kind` is `osm` or `osm-context`. The pointer names the current
        revision directory; a manual invalidation makes the adapter fetch a
        new revision and move it."""
        return os.path.join(self.facility_out(facility_id), kind, 'current.json')

    def snapshot_dir(self, facility_id, kind):
        key = self._aoi_key(facility_id)
        if not key:
            return None
        pointer = self.json(self.snapshot_pointer_path(facility_id, kind)) if self.can_adopt(self.snapshot_pointer_path(facility_id, kind)) else None
        if pointer and pointer.get('aoiKey') == key and pointer.get('directory'):
            return self.abspath(pointer['directory'])
        return os.path.join(self.facility_out(facility_id), kind, key)

    def osm_dir(self, facility_id):
        return self._current(self.snapshot_dir(facility_id, 'osm'), self.retained(self.facility(facility_id), 'osm'), lambda d: os.path.isfile(os.path.join(d, 'manifest.json')))

    def context_dir(self, facility_id):
        return self._current(self.snapshot_dir(facility_id, 'osm-context'), self.retained(self.facility(facility_id), 'osmContext'), lambda d: os.path.isfile(os.path.join(d, 'manifest.json')))

    def snapshot(self, facility_id, kind='osm'):
        """(manifest, extract path) of a retained golf/context extract, or (None, None)."""
        folder = self.osm_dir(facility_id) if kind == 'osm' else self.context_dir(facility_id)
        if not folder or not self.can_adopt(folder):
            return None, None
        manifest = self.json(os.path.join(folder, 'manifest.json'))
        extract = os.path.join(folder, manifest.get('file', 'overpass.json.gz')) if manifest else None
        return (manifest, extract) if manifest and extract and os.path.isfile(extract) else (None, None)

    # layout artifacts
    def routes_path(self, layout_id):
        return os.path.join(self.layout_out(layout_id), 'routes.json')

    def scorecard_path(self, layout_id):
        return os.path.join(self.layout_out(layout_id), 'scorecard.json')

    def candidates_dir(self, layout_id):
        return os.path.join(self.layout_out(layout_id), 'candidates')

    def candidates_package_path(self, layout_id):
        return os.path.join(self.candidates_dir(layout_id), 'normalized.json')

    def package_dir(self, layout_id):
        return os.path.join(self.layout_out(layout_id), 'package')

    def terrain_pointer_path(self, layout_id):
        return os.path.join(self.layout_out(layout_id), 'terrain-source.json')

    def terrain_pointer(self, layout_id):
        path = self.terrain_pointer_path(layout_id)
        return self.json(path) if self.can_adopt(path) else None

    # Read locators answer "which artifact is current": something the factory
    # built (and may adopt) wins, then retained checked-in evidence, then the
    # path a build would create. Write locators (`*_out`) are always under the
    # output root: the factory never writes to, or deletes, retained evidence.
    def _current(self, built, retained, present=os.path.isfile):
        if built and self.can_adopt(built) and present(built):
            return built
        if retained and present(retained):
            return retained
        return built or retained

    def terrain_source_dir(self, layout_id):
        pointer = self.terrain_pointer(layout_id)
        built = self.abspath(pointer['directory']) if pointer else None
        retained = self.retained(self.facility((self.layout(layout_id) or {}).get('facilityId')), 'terrain')
        return self._current(built, retained, lambda d: os.path.isfile(os.path.join(d, 'source-manifest.json')))

    def terrain_source_manifest(self, layout_id):
        folder = self.terrain_source_dir(layout_id)
        return self.json(os.path.join(folder, 'source-manifest.json')) if folder else None

    def compiled_source_matches(self, layout_id, compiled_dir):
        """A compiled directory was built from the current terrain source when
        the source manifest it embeds names the same files (and bounds)."""
        compilation = self.json(os.path.join(compiled_dir, 'compilation-report.json')) or {}
        embedded = compilation.get('source')
        current = self.terrain_source_manifest(layout_id)
        # A four-corner crop can miss a valid edge after CRS conversion. Its
        # immutable artifact remains auditable, but it cannot underwrite a
        # current physical or visual compiler output.
        if not current or current.get('coverageMethod') != 'perimeter-v1':
            return False
        if embedded:
            return terrain_source_identity(embedded) == terrain_source_identity(current)
        assets = self.json(os.path.join(compiled_dir, 'asset-manifest.json')) or {}
        return assets.get('sourceManifestHash') == digest(current)

    def naip_out(self, layout_id):
        """The NAIP export keyed like the terrain source it was cut to."""
        source = self.terrain_source_dir(layout_id)
        if not source:
            return None
        return os.path.join(self.facility_out((self.layout(layout_id) or {}).get('facilityId')), 'naip', os.path.basename(os.path.normpath(source)))

    def naip_dir(self, layout_id):
        retained = self.retained(self.facility((self.layout(layout_id) or {}).get('facilityId')), 'naip')
        return self._current(self.naip_out(layout_id), retained, lambda d: os.path.isfile(os.path.join(d, 'manifest.json')))

    def canopy_out(self, layout_id):
        return os.path.join(self.layout_out(layout_id), 'canopy-review.json')

    def canopy_path(self, layout_id):
        return self._current(self.canopy_out(layout_id), self.retained(self.layout(layout_id), 'canopyReview'))

    def compiled_out(self, layout_id):
        return os.path.join(self.layout_out(layout_id), 'compiled')

    def compiled_dir(self, layout_id, hole_key=None):
        """Per hole when asked: a retained full compile keeps serving the holes
        the factory has not rebuilt, and each hole's report, compilation
        report and asset manifest are read from the one directory."""
        marker = f'{hole_key}-report.json' if hole_key else 'asset-manifest.json'
        return self._current(self.compiled_out(layout_id), self.retained(self.layout(layout_id), 'compiled'), lambda d: os.path.isfile(os.path.join(d, marker)))

    def terrain_base_out(self, layout_id):
        return os.path.join(self.layout_out(layout_id), 'compiled-base')

    def terrain_base_dir(self, layout_id):
        """The full compile the context layer is classified against: the built
        base, else a retained full compile of this layout."""
        return self._current(self.terrain_base_out(layout_id), self.retained(self.layout(layout_id), 'compiled'), lambda d: os.path.isfile(os.path.join(d, 'asset-manifest.json')))

    def imagery_review_out(self, layout_id):
        return os.path.join(self.layout_out(layout_id), 'imagery-review.json')

    def imagery_review_path(self, layout_id):
        return self._current(self.imagery_review_out(layout_id), self.retained(self.layout(layout_id), 'imageryReview'))

    def context_layer_out(self, layout_id):
        return os.path.join(self.layout_out(layout_id), 'context', f'{layout_id}-context.json')

    def context_layer_path(self, layout_id):
        return self._current(self.context_layer_out(layout_id), self.retained(self.layout(layout_id), 'context'))

    def context_report_out(self, layout_id):
        return os.path.join(self.layout_out(layout_id), 'context', f'{layout_id}-context-report.json')

    def context_report_path(self, layout_id):
        return self._current(self.context_report_out(layout_id), self.retained(self.layout(layout_id), 'contextReport'))

    def inside_output(self, path):
        """True when `path` is under the factory's output root."""
        root = os.path.join(self.output_root, '')
        return bool(path) and (os.path.abspath(path) + os.sep).startswith(root)

    # --- documents ----------------------------------------------------------
    def json(self, path, fresh=False):
        path = self.abspath(path)
        if path is None or not os.path.isfile(path):
            if path in self._json:
                del self._json[path]
            return None
        if fresh or path not in self._json:
            with open(path, encoding='utf-8') as f:
                self._json[path] = json.load(f)
        return self._json[path]

    def forget(self, path):
        """Drop cached reads of a path an executor just rewrote."""
        path = self.abspath(path)
        self._json.pop(path, None)
        self._extracts.pop(path, None)
        self._routes.clear()
        self._subhashes.clear()

    def extract(self, path):
        if path not in self._extracts:
            self._extracts[path] = osm.load_extract(path) if path and os.path.isfile(path) else None
        return self._extracts[path]

    def package_path(self, layout_id):
        geometry = (self.layout(layout_id) or {}).get('geometry')
        built = os.path.join(self.package_dir(layout_id), 'normalized.json')
        if self.can_adopt(built) and os.path.isfile(built):
            return built
        if geometry:
            return self.abspath(geometry['package'])
        return None

    def package(self, layout_id):
        return self.json(self.package_path(layout_id))

    def package_hash(self, layout_id):
        pkg = self.package(layout_id)
        return pkg.get('contentHash') if pkg else None

    def package_verified(self, layout_id):
        pkg = self.package(layout_id)
        return bool(pkg) and content_hash_matches(pkg)

    def context_layer(self, layout_id):
        path = self.context_layer_path(layout_id)
        return self.json(path) if self.can_adopt(path) else None

    def review_overlay(self, layout_id):
        return self.json(self.retained(self.layout(layout_id), 'reviewOverlay'))

    def subhashes(self, layout_id):
        pkg = self.package(layout_id)
        key = (layout_id, (pkg or {}).get('contentHash'), (self.context_layer(layout_id) or {}).get('contentHash'))
        if key not in self._subhashes:
            self._subhashes[key] = package_subhashes(pkg, self.context_layer(layout_id), self.review_overlay(layout_id)) if pkg else {}
        return self._subhashes[key]

    def package_hole(self, layout_id, ordinal):
        pkg = self.package(layout_id)
        if not pkg:
            return None
        return next((h for h in pkg.get('holes', []) if h.get('ordinal') == ordinal), None)

    def hole_subhashes(self, layout_id, ordinal):
        hole = self.package_hole(layout_id, ordinal)
        return self.subhashes(layout_id).get(hole['key']) if hole else None

    # --- derived inputs -----------------------------------------------------
    def site_candidates(self, layout_id):
        """Site polygons to test hole ways against, most specific first: the
        layout's own site ways, then the facility AOI element."""
        layout = self.layout(layout_id) or {}
        facility = self.facility(layout.get('facilityId')) or {}
        _manifest, extract_path = self.snapshot(layout.get('facilityId'))
        extract = self.extract(extract_path) if extract_path else None
        ways = {e['id']: e for e in (extract or {}).get('elements', []) if e.get('type') == 'way'}
        candidates = []
        for site in layout.get('siteIds') or []:
            parts = site.split('-')
            if len(parts) == 3 and parts[1] == 'way' and int(parts[2]) in ways:
                candidates.append({'site': site, 'polygon': osm.way_points(ways[int(parts[2])])})
        aoi = self.aoi(layout.get('facilityId'))
        if aoi:
            candidates.append({'site': aoi['element'], 'polygon': aoi.get('polygon'), 'bboxWgs84': aoi.get('elementBboxWgs84')})
        elif (facility.get('aoi') or {}).get('id', '').startswith('way/') and int(facility['aoi']['id'][4:]) in ways:
            candidates.append({'site': facility['aoi']['id'], 'polygon': osm.way_points(ways[int(facility['aoi']['id'][4:])])})
        return candidates

    def route_resolution(self, layout_id):
        """Catalog routeWayIds when pinned; otherwise the unambiguous proposal
        from the retained extract, or None with the evidence of why not."""
        if layout_id in self._routes:
            return self._routes[layout_id]
        layout = self.layout(layout_id) or {}
        result = None
        if layout.get('routeWayIds'):
            result = {'source': 'catalog', 'routeWayIds': list(layout['routeWayIds']), 'evidence': None}
        else:
            manifest, extract_path = self.snapshot(layout.get('facilityId'))
            extract = self.extract(extract_path) if extract_path else None
            if extract:
                card = self.scorecard(layout_id)
                pars = [h['par'] for h in card['holes']] if card else None
                attempts = []
                for site in self.site_candidates(layout_id) or [None]:
                    ids, evidence = osm.propose_routes(extract, site, len(layout.get('holeOrder') or []), pars, layout.get('name'))
                    attempts.append({'site': (site or {}).get('site'), **evidence})
                    if ids:
                        result = {'source': 'osm_ref_named' if evidence.get('series') else 'osm_ref_unique', 'routeWayIds': ids, 'site': (site or {}).get('site'),
                                  'extractSha256': manifest.get('uncompressedSha256'), 'evidence': {'chosen': attempts[-1], 'attempts': attempts}}
                        break
                if result is None:
                    result = {'source': None, 'routeWayIds': None, 'extractSha256': manifest.get('uncompressedSha256'), 'evidence': {'attempts': attempts}}
        self._routes[layout_id] = result
        return result

    def canonical_route_admission(self, layout_id):
        """Return the narrow prerequisite for a route-specific physical world.

        A uniquely numbered OSM series is useful evidence, but is not enough
        to make a playable course world: its hole order has to agree with a
        retained scorecard profile as well.  This does not itself publish a
        physical package; it only prevents the visual fallback from being
        incorrectly suppressed while a layout is still physically blocked.
        """
        layout = self.layout(layout_id) or {}
        card = self.scorecard(layout_id)
        expected = len(layout.get('holeOrder') or [])
        actual = len((card or {}).get('holes') or [])
        routes = self.route_resolution(layout_id) or {}
        scorecard_valid = bool(card and supported_hole_count(expected) and actual == expected)
        return {
            'admitted': bool(scorecard_valid and routes.get('routeWayIds')),
            'scorecardValid': scorecard_valid,
            'expectedHoles': expected,
            'scorecardHoles': actual if card else None,
            'routeSource': routes.get('source'),
            'routeWayIds': routes.get('routeWayIds'),
        }

    def pilot_scorecard(self, layout_id):
        """The scorecard-shaped document the pipeline scripts consume, composed
        from the catalog: facility origin, layout routes, profile pars/yards."""
        layout = self.layout(layout_id) or {}
        facility = self.facility(layout.get('facilityId')) or {}
        card = self.scorecard(layout_id)
        routes = self.route_resolution(layout_id)
        aoi = self.aoi(layout.get('facilityId'))
        bbox = layout.get('bboxWgs84') or (aoi or {}).get('bboxWgs84')
        if not (card and routes and routes.get('routeWayIds') and bbox):
            return None
        holes = sorted(card['holes'], key=lambda h: h['hole'])
        return {'siteId': (layout.get('siteIds') or ['osm-' + facility['aoi']['id'].replace('/', '-')])[0], 'name': layout.get('name'), 'slug': layout_id,
                'originWgs84': facility.get('originWgs84'), 'scorecardYards': [h['yards'] for h in holes], 'pars': [h['par'] for h in holes],
                'routeWayIds': routes['routeWayIds'], 'routeSource': routes['source'], 'officialScorecardUrl': (card.get('source') or {}).get('url'),
                'retrievedAt': (card.get('source') or {}).get('retrievedAt'), 'bboxWgs84': bbox, 'scorecardProfile': card['profileId']}

    def terrain_bounds(self, layout_id):
        """The compiler's request bounds for the candidate package: the hole
        extents snapped to the compiler's grid, which is why a small edit
        inside a hole leaves them (and the acquired raster) alone. None until
        a candidate package exists; raises ImportError when the compiler's
        geometry stack is not installed."""
        path = self.candidates_package_path(layout_id)
        pkg = self.json(path, fresh=True) if self.can_adopt(path) else None
        if not pkg:
            return None
        cache_key = (layout_id, pkg.get('contentHash'))
        if cache_key in self._bounds:
            return self._bounds[cache_key]
        compiler = _compiler_module(self.abspath(f'{SCRIPTS_DIR}/compile-course-terrain.py'))
        compiler.pilot.ORIGIN = pkg['originWgs84']
        raw_features = {f['id']: f for f in pkg['features']}
        raw_shapes = {i: compiler.local_geometry(f) for i, f in raw_features.items()}
        extents = [compiler.hole_bounds(hole, raw_shapes, raw_features)[1] for hole in pkg['holes']]
        bounds = [min(b[0] for b in extents) - 8, min(b[1] for b in extents) - 8, max(b[2] for b in extents) + 8, max(b[3] for b in extents) + 8]
        self._bounds[cache_key] = bounds
        return bounds

    # --- graph outputs ------------------------------------------------------
    def output_hash(self, key):
        return self.outputs.get(key)

    def impl_hash(self, spec):
        if spec.id not in self._impl:
            self._impl[spec.id] = files_digest([self.abspath(p) for p in spec.impl_files])
        return self._impl[spec.id]

    def executor(self, spec):
        if spec.id in self.executors:
            return self.executors[spec.id]
        return spec.executor
