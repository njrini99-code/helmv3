"""Create a source-candidate whole-course package from a retained Overpass response.

The output retains OSM geometry unchanged and makes only reproducible spatial
associations to explicitly selected golf=hole routes. It is deliberately not a
physical approval tool: every output surface is unreviewed with unknown boundary
uncertainty, so it may render but cannot pass CourseTruthGate.

Usage:
  python3 scripts/golf/course-geometry/prepare-osm-course.py \
    /path/to/overpass.json scripts/golf/course-geometry/pilots/<course>.json output/course-geometry/<course>
"""
import argparse
import copy
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path

import pyproj
from shapely.geometry import LineString, Point, Polygon
from shapely.geometry import shape as geometry_shape
from shapely.ops import transform
from source_geometry import identity, read_route_traces, read_source_geometry, selected_features


def _sibling(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


course_crs = _sibling('course_crs', 'course_crs.py')

TRACE_SMOOTHING_M = 0  # canonical source boundaries are never beautified
SAME_WAY_TOLERANCE_M = 0.05  # an imported osm-way feature this close to the OSM way IS that way


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def sha(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def source_route_par(tags):
    """Return the OSM route's stated par when it is usable.

    A route line is still legitimate source-backed geometry when its optional
    `par` tag is absent.  The scorecard remains the authoritative scoring
    input, while `None` preserves that OSM did not make a par claim.
    """
    try:
        value = int((tags or {}).get('par'))
    except (TypeError, ValueError):
        return None
    return value if 3 <= value <= 6 else None


def polygon(element, project):
    geometry = element.get('geometry') or []
    coordinates = [[p['lon'], p['lat']] for p in geometry]
    if len(coordinates) < 4 or coordinates[0] != coordinates[-1]:
        return None
    projected = [project.transform(*point) for point in coordinates]
    shape = Polygon(projected)
    return (coordinates, shape) if shape.is_valid and not shape.is_empty else None


def merge_imported_candidates(candidates, imported_features, to_metric):
    """Adds each imported non-route feature to `candidates` in place.

    An auto-route proposal re-carries the OSM tee/green it anchored on under
    the same osm-way id. That is the same way, not a conflict, so the OSM
    candidate is kept. Any other id collision, or a same-id feature whose
    geometry differs, is refused."""
    by_id = {c['id']: c for c in candidates}
    for feature in imported_features:
        if feature['kind'] == 'route':
            continue
        shape = transform(to_metric, geometry_shape(feature['geometryWgs84']))
        existing = by_id.get(feature['id'])
        if existing:
            if (existing['kind'] == feature['kind'] and feature['id'].startswith('osm-way-')
                    and existing['shape'].hausdorff_distance(shape) <= SAME_WAY_TOLERANCE_M):
                continue
            raise ValueError('SOURCE_FEATURE_CONFLICT: ' + feature['id'])
        candidates.append({'id': feature['id'], 'kind': feature['kind'], 'imported': feature, 'shape': shape})
        by_id[feature['id']] = candidates[-1]
    return candidates


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('overpass', type=Path)
    parser.add_argument('scorecard', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--canopy-review', type=Path, default=None,
                        help='derive-canopy-naip.py output; adds reviewed decorative woods groups per hole')
    parser.add_argument('--traces', type=Path, default=None,
                        help='imagery trace file; adds unreviewed surface candidates where OSM has none')
    parser.add_argument('--source-geometry', type=Path, help='retained source-independent routes and surfaces')
    parser.add_argument('--route-traces', '--routes', dest='route_traces', type=Path,
                        help='reviewed golfhelm-route-traces-v1 route and surface evidence; never converted to OSM IDs')
    args = parser.parse_args()

    raw_bytes = args.overpass.read_bytes()
    if args.overpass.suffix == '.gz':
        raw_bytes = gzip.decompress(raw_bytes)
    raw = json.loads(raw_bytes)
    retained = args.overpass.with_name('manifest.json')
    if retained.exists():
        manifest = json.loads(retained.read_text())
        if manifest.get('uncompressedSha256') != hashlib.sha256(raw_bytes).hexdigest():
            raise ValueError('Overpass extract does not match its retained manifest hash')
    card = json.loads(args.scorecard.read_text())
    retrieved_at = card['retrievedAt']
    if retained.exists():
        retrieved_at = manifest.get('retrievedAt', retrieved_at)
    source_id = f'osm-overpass-{retrieved_at}'
    counts = {len(card['pars']), len(card['scorecardYards'])}
    hole_order = card.get('holeOrder') or [f"{card['slug']}-{n:02}" for n in range(1, len(card['pars']) + 1)]
    counts.add(len(hole_order))
    if args.source_geometry and args.route_traces:
        raise ValueError('ROUTE_SOURCE_CONFLICT: select exactly one source geometry or reviewed route traces input')
    route_traces = None
    if args.route_traces:
        # Validate the bounded retained artifact before reading it again for
        # audit-copy output. Do not parse arbitrary-sized local JSON merely to
        # discover that it violates the route-trace intake contract.
        route_traces = args.route_traces
        imported = read_route_traces(args.route_traces, card.get('facilityId'), card['siteId'], hole_order)
    else:
        imported = read_source_geometry(args.source_geometry, card.get('facilityId'), card['siteId'], hole_order) if args.source_geometry else None
    if imported and card.get('routeWayIds'):
        raise ValueError('ROUTE_SOURCE_CONFLICT: select imported geometry or OSM way IDs explicitly')
    if not imported:
        counts.add(len(card.get('routeWayIds') or []))
    if len(counts) != 1 or not 9 <= counts.pop() <= 36:
        raise ValueError('The selected course must supply matching 9- through 36-hole route IDs, pars, and scorecard yardages')

    # Metric work happens in the course's own UTM zone; the package itself
    # stays in the local ENU frame about the card's origin.
    crs = course_crs.origin_epsg(card)
    project = pyproj.Transformer.from_crs(4326, crs, always_xy=True)
    ways = {element['id']: element for element in raw.get('elements', []) if element.get('type') == 'way'}
    routes = []
    for ordinal, (way_id, par) in enumerate(zip(card.get('routeWayIds') or [], card['pars']), start=1):
        element = ways.get(way_id)
        tags = (element or {}).get('tags', {})
        geometry = (element or {}).get('geometry') or []
        if not element or tags.get('golf') != 'hole' or str(tags.get('ref')) != str(ordinal):
            raise ValueError(f'Explicit route selection is not a matching golf=hole source: hole {ordinal}, way {way_id}')
        source_par = source_route_par(tags)
        coords = [[p['lon'], p['lat']] for p in geometry]
        if len(coords) < 2:
            raise ValueError(f'Route {way_id} has no usable geometry')
        line = LineString([project.transform(*point) for point in coords])
        routes.append({'id': f'osm-way-{way_id}', 'ordinal': ordinal, 'coordinates': coords, 'shape': line,
                       'sourcePar': source_par, 'scorecardPar': par, 'holeKey': hole_order[ordinal - 1]})
    imported_features = selected_features(imported, hole_order) if imported else []
    imported_by_id = {f['id']: f for f in imported_features}
    imported_holes = {h['holeKey']: h for h in imported['holes']} if imported else {}
    if imported:
        for ordinal, key in enumerate(hole_order, 1):
            binding = imported_holes[key]
            feature = imported_by_id[binding['routeFeatureId']]
            coords = feature['geometryWgs84']['coordinates']
            routes.append({'id': feature['id'], 'ordinal': ordinal, 'holeKey': key, 'coordinates': coords,
                           'shape': LineString([project.transform(*point) for point in coords]),
                           'sourcePar': None, 'scorecardPar': card['pars'][ordinal - 1]})

    candidates = []
    kind_map = {'tee': 'tee', 'fairway': 'fairway', 'green': 'green', 'bunker': 'bunker', 'water_hazard': 'water'}
    for way_id, element in ways.items():
        tags = element.get('tags', {})
        golf = tags.get('golf')
        kind = kind_map.get(golf)
        if tags.get('natural') == 'water':
            kind = 'water'
        if not kind:
            continue
        item = polygon(element, project)
        if not item:
            continue
        coordinates, shape = item
        candidates.append({'id': f'osm-way-{way_id}', 'kind': kind, 'coordinates': coordinates, 'shape': shape})

    merge_imported_candidates(candidates, imported_features, project.transform)

    traces = json.loads(args.traces.read_text()) if args.traces else None
    trace_source_ids = set()  # every distinct naip-trace-/lidar-trace- source id a feature actually used
    if traces:
        if traces.get('kind') != 'golfhelm-imagery-traces-v1' or traces.get('siteId') != card['siteId']:
            raise ValueError('Trace file does not belong to this course')
        for trace in traces['features']:
            ring = trace['coordinatesWgs84']
            if trace['holeKey'] not in hole_order or trace['kind'] not in ('fairway', 'tee', 'bunker', 'green', 'water') or len(ring) < 4 or ring[0] != ring[-1] or not Polygon(ring).is_valid:
                raise ValueError('Invalid trace: ' + trace['id'])
            if any(c['id'] == trace['id'] for c in candidates):
                raise ValueError('Duplicate trace id: ' + trace['id'])
            # A trace the lidar canopy-height signal also confirmed gets its
            # own source id (`lidar-trace-`), never merged into a plain
            # `naip-trace-` one -- both are still unreviewed owner-review
            # candidates, never OSM truth, but which evidence backed a given
            # trace must stay auditable per feature.
            trace_source = ('lidar-trace-' if trace.get('evidenceSource') == 'lidar_chm+naip' else 'naip-trace-') + traces['tracedAt']
            trace_source_ids.add(trace_source)
            feature = {'id': trace['id'], 'kind': trace['kind'], 'sourceIds': [trace_source],
                       'holeKeys': [trace['holeKey']], 'reviewed': False, 'accuracyMeters': trace['accuracyMeters'],
                       'geometryWgs84': {'type': 'Polygon', 'coordinates': [ring]}}
            candidates.append({'id': trace['id'], 'kind': trace['kind'], 'imported': feature,
                               'shape': Polygon([project.transform(*point) for point in ring])})

    by_route = {route['id']: {route['id']} for route in routes}
    owners = {}
    unclaimed = []
    route_lines = {route['id']: route['shape'] for route in routes}
    # Source polygons can overlap (for example a broad stale/incorrect green over a
    # smaller endpoint green). Pick the smallest endpoint-containing polygon only as
    # an association hypothesis and retain every discarded alternative in the report.
    selected_green = {}
    green_alternatives = {}
    for route in routes:
        containing = [feature for feature in candidates if feature['kind'] == 'green' and feature['shape'].covers(Point(route['shape'].coords[-1]))]
        if imported:
            selected = imported_holes[route['holeKey']]['greenFeatureId']
            containing = sorted(containing, key=lambda feature: feature['id'] != selected)
            if not containing or containing[0]['id'] != selected:
                raise ValueError('GREEN_ASSOCIATION_UNRESOLVED: ' + route['holeKey'])
        if not containing:
            raise ValueError('GREEN_ASSOCIATION_UNRESOLVED: ' + route['holeKey'])
        if not imported:
            containing.sort(key=lambda feature: feature['shape'].area)
        selected_green[route['id']] = containing[0]['id']
        green_alternatives[route['id']] = [feature['id'] for feature in containing[1:]]
    for feature in candidates:
        shape = feature['shape']
        if feature.get('imported'):
            assigned = {r['id'] for r in routes if r['holeKey'] in feature['imported']['holeKeys']}
        elif feature['kind'] == 'green':
            assigned = {route_id for route_id, green_id in selected_green.items() if green_id == feature['id']}
        elif feature['kind'] == 'fairway':
            assigned = {route['id'] for route in routes if route['shape'].intersection(shape).length >= 8}
        elif feature['kind'] == 'tee':
            assigned = {route['id'] for route in routes if shape.distance(Point(route['shape'].coords[0])) <= 28}
        else:
            distances = sorted((shape.distance(line), ident) for ident, line in route_lines.items())
            assigned = {distances[0][1]} if distances and distances[0][0] <= 55 else set()
        if not assigned:
            unclaimed.append(feature['id'])
            continue
        owners[feature['id']] = sorted(assigned)
        for route_id in assigned:
            by_route[route_id].add(feature['id'])

    route_by_id = {route['id']: route for route in routes}
    features = []
    for route in routes:
        features.append({'id': route['id'], 'kind': 'route', 'sourceIds': imported_by_id[route['id']]['sourceIds'] if imported else [source_id],
                         'holeKeys': [route['holeKey']], 'reviewed': False,
                         'accuracyMeters': imported_by_id[route['id']]['accuracyMeters'] if imported else None,
                         'geometryWgs84': {'type': 'LineString', 'coordinates': route['coordinates']}})
    for feature in candidates:
        if feature['id'] not in owners:
            continue
        if feature.get('imported'):
            features.append(copy.deepcopy(feature['imported']))
            continue
        features.append({'id': feature['id'], 'kind': feature['kind'], 'sourceIds': [source_id],
                         'holeKeys': [route_by_id[identifier]['holeKey'] for identifier in owners[feature['id']]],
                         'reviewed': False, 'accuracyMeters': None,
                         'geometryWgs84': {'type': 'Polygon', 'coordinates': [feature['coordinates']]}})

    feature_by_id = {feature['id']: feature for feature in features}
    holes, association_rows = [], []
    for route in routes:
        key = route['holeKey']
        ids = sorted(by_route[route['id']])
        green_ids = [feature_id for feature_id in ids if feature_by_id[feature_id]['kind'] == 'green']
        tee_ids = [feature_id for feature_id in ids if feature_by_id[feature_id]['kind'] == 'tee']
        fairway_ids = [feature_id for feature_id in ids if feature_by_id[feature_id]['kind'] == 'fairway']
        bunker_ids = [feature_id for feature_id in ids if feature_by_id[feature_id]['kind'] == 'bunker']
        water_ids = [feature_id for feature_id in ids if feature_by_id[feature_id]['kind'] == 'water']
        if green_ids != [selected_green[route['id']]]:
            raise ValueError(f'{key}: selected endpoint green association did not survive feature ownership')
        gaps = [
            'Source candidate; independent imagery registration and course-familiar review pending',
            'Boundary uncertainty, daily tee marker, and daily pin are unknown',
            'Macro terrain, bunker lip/depth, tree height, and putting break require separate evidence',
        ]
        if not tee_ids:
            gaps.append('No OSM tee polygon was within 28m of the selected route start')
        if not fairway_ids:
            gaps.append('No OSM fairway polygon intersected the selected route by at least 8m')
        holes.append({'key': key, 'ordinal': route['ordinal'], 'par': card['pars'][route['ordinal'] - 1],
                      'scorecardYards': card['scorecardYards'][route['ordinal'] - 1], 'featureIds': ids,
                      'routeFeatureId': route['id'], 'greenFeatureId': green_ids[0],
                      'nominalTargetWgs84': route['coordinates'][-1], 'completeness': 'partial', 'gaps': gaps})
        association_rows.append({'hole': route['ordinal'], 'routeId': route['id'], 'greenIds': green_ids,
                                 'teeIds': tee_ids, 'fairwayIds': fairway_ids, 'bunkerIds': bunker_ids,
                                 'waterIds': water_ids, 'routeLengthM': round(route['shape'].length, 3),
                                 'scorecardYards': card['scorecardYards'][route['ordinal'] - 1],
                                 'scorecardPar': route['scorecardPar'], 'osmRoutePar': route['sourcePar'],
                                 'parAgreement': route['scorecardPar'] == route['sourcePar'],
                                 'discardedEndpointGreenAlternatives': green_alternatives[route['id']]})

    package = {'schemaVersion': 1, 'siteId': card['siteId'], 'name': card['name'], 'status': 'source_candidate',
               'originWgs84': card['originWgs84'], 'projection': 'wgs84-local-enu-v1', 'features': features,
               'holes': holes, 'sources': [{'id': source_id, 'provider': 'OpenStreetMap via Overpass API',
                  'licenseId': 'ODbL-1.0', 'url': 'https://overpass-api.de/api/interpreter', 'capturedAt': None,
                  'retrievedAt': retrieved_at, 'attribution': '© OpenStreetMap contributors · ODbL 1.0'}]}
    if imported:
        package['sources'].extend(copy.deepcopy(imported['sources']))
    trace_summary = None
    route_trace_summary = None
    if route_traces:
        route_trace_summary = {'traceFile': args.route_traces.name, 'hash': identity(imported),
                               'associationReview': imported['routeTraceAssociationReview'],
                               'rule': 'confirms hole identity and route-to-green association only; boundaries remain source candidates'}
    if traces:
        for trace_source in sorted(trace_source_ids):
            is_lidar = trace_source.startswith('lidar-trace-')
            package['sources'].append({'id': trace_source, 'provider': traces['source']['provider'], 'licenseId': 'US-Public-Domain',
                                       'url': traces['source']['service'], 'capturedAt': ','.join(traces['source']['capturedAt']),
                                       'retrievedAt': traces['tracedAt'],
                                       'attribution': ('USDA NAIP + USGS 3DEP lidar; traced surface candidates, unreviewed' if is_lidar
                                                       else 'USDA NAIP; traced surface candidates, unreviewed')})
        trace_summary = {'traceFile': args.traces.name, 'features': [t['id'] for t in traces['features']],
                         'rasterSha256': traces['source']['rasterSha256'], 'tracer': traces['tracer'],
                         'cornerSmoothingM': TRACE_SMOOTHING_M}
    canopy_summary = None
    if args.canopy_review:
        # Decorative canopy groups derived from NAIP and visually reviewed. They
        # bound crown artwork only and never become a physical surface claim.
        canopy = json.loads(args.canopy_review.read_text())
        if canopy.get('kind') != 'golfhelm-canopy-review-v1' or canopy.get('siteId') != card['siteId']:
            raise ValueError('Canopy review does not belong to this course')
        canopy_source = 'naip-canopy-review-' + canopy['reviewedAt']
        hole_by_key = {hole['key']: hole for hole in holes}
        for region in canopy['regions']:
            coords = region['coordinatesWgs84']
            if not Polygon(coords).is_valid or region['holeKey'] not in hole_by_key:
                raise ValueError('Invalid canopy group: ' + region['id'])
            package['features'].append({'id': 'naip-' + region['id'], 'kind': 'woods', 'sourceIds': [canopy_source],
                                        'holeKeys': [region['holeKey']], 'reviewed': True, 'accuracyMeters': None,
                                        'geometryWgs84': {'type': 'Polygon', 'coordinates': [coords]}})
            hole_by_key[region['holeKey']]['featureIds'].append('naip-' + region['id'])
        package['sources'].append({'id': canopy_source, 'provider': canopy['source'], 'licenseId': 'US-Public-Domain',
                                   'url': canopy['sourceUrl'], 'capturedAt': ','.join(canopy['capturedAt']),
                                   'retrievedAt': canopy['retrievedAt'],
                                   'attribution': 'USDA NAIP; canopy groups approximate, tree symbols illustrative'})
        canopy_summary = {'reviewFile': args.canopy_review.name, 'groups': len(canopy['regions']),
                          'rasterSha256': canopy['rasterSha256'], 'method': canopy['method'], 'reviewer': canopy['reviewer']}
    package['contentHash'] = sha(package)
    report = {'schemaVersion': 1, 'status': 'needs_physical_review', 'course': card['name'],
              'packageHash': package['contentHash'], 'rawOverpassSha256': hashlib.sha256(raw_bytes).hexdigest(),
              'routeSelection': {'method': 'explicit reviewed route-trace physical-hole bindings' if route_traces else ('explicit imported physical-hole bindings' if imported else 'explicit selected OSM golf=hole way IDs; ref checked, source par compared against retained scorecard'),
                                 'routeWayIds': card.get('routeWayIds')},
              'associationPolicy': {'green': 'contains selected route endpoint', 'fairway': 'intersects route by 8m or more',
                                     'tee': 'within 28m of route start', 'bunker_water': 'nearest selected route within 55m'},
              'holes': association_rows, 'unclaimedSourceFeatureIds': unclaimed, 'canopy': canopy_summary,
              'traces': trace_summary, 'routeTraces': route_trace_summary,
              'discardedEndpointGreenAlternatives': green_alternatives,
              'limitations': ['OSM plan geometry is retained as a renderable source candidate only',
                              'No independent boundary uncertainty or course-familiar review exists',
                              'No imagery or terrain source is used by this preparation step',
                              'OSM route par disagreements are retained as source conflicts; the official scorecard remains the round-scoring authority',
                              'No inferred feature may be used for authoritative physical measurement']}
    write(args.output / 'normalized.json', package)
    write(args.output / 'source-metadata.json', {'scorecard': card, 'overpassSha256': report['rawOverpassSha256'],
                                                   'elementCount': len(raw.get('elements', [])), 'license': 'ODbL-1.0',
                                                   'sourceGeometryHash': identity(imported) if imported and not route_traces else None,
                                                   'routeTracesHash': identity(imported) if route_traces else None,
                                                   'sourceGeometryFileSha256': hashlib.sha256(args.source_geometry.read_bytes()).hexdigest() if args.source_geometry else None,
                                                   'routeTracesFileSha256': hashlib.sha256(args.route_traces.read_bytes()).hexdigest() if route_traces else None,
                                                   'imageryTracesHash': identity(json.loads(args.traces.read_text())) if args.traces else None})
    if imported:
        if route_traces:
            (args.output / 'route-traces.json').write_bytes(args.route_traces.read_bytes())
        else:
            (args.output / 'source-geometry.json').write_bytes(args.source_geometry.read_bytes())
    if traces:
        (args.output / 'imagery-traces.json').write_bytes(args.traces.read_bytes())
    write(args.output / 'association-report.json', report)
    print(json.dumps({'course': card['name'], 'holes': len(holes), 'features': len(features),
                      'unclaimed': len(unclaimed), 'packageHash': package['contentHash']}))

if __name__ == '__main__':
    main()
