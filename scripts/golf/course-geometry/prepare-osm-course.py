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
import hashlib
import json
from pathlib import Path

import pyproj
from shapely.geometry import LineString, Point, Polygon


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def sha(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def polygon(element, project):
    geometry = element.get('geometry') or []
    coordinates = [[p['lon'], p['lat']] for p in geometry]
    if len(coordinates) < 4 or coordinates[0] != coordinates[-1]:
        return None
    projected = [project.transform(*point) for point in coordinates]
    shape = Polygon(projected)
    return (coordinates, shape) if shape.is_valid and not shape.is_empty else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('overpass', type=Path)
    parser.add_argument('scorecard', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()

    raw_bytes = args.overpass.read_bytes()
    raw = json.loads(raw_bytes)
    card = json.loads(args.scorecard.read_text())
    if not (len(card['routeWayIds']) == len(card['pars']) == len(card['scorecardYards']) == 18):
        raise ValueError('The selected course must supply exactly 18 route IDs, pars, and scorecard yardages')

    project = pyproj.Transformer.from_crs(4326, 32617, always_xy=True)
    ways = {element['id']: element for element in raw.get('elements', []) if element.get('type') == 'way'}
    routes = []
    for ordinal, (way_id, par) in enumerate(zip(card['routeWayIds'], card['pars']), start=1):
        element = ways.get(way_id)
        tags = (element or {}).get('tags', {})
        geometry = (element or {}).get('geometry') or []
        if not element or tags.get('golf') != 'hole' or str(tags.get('ref')) != str(ordinal):
            raise ValueError(f'Explicit route selection is not a matching golf=hole source: hole {ordinal}, way {way_id}')
        source_par = int(tags.get('par', -1))
        if source_par < 3 or source_par > 6:
            raise ValueError(f'OSM route is missing a valid par: hole {ordinal}, way {way_id}')
        coords = [[p['lon'], p['lat']] for p in geometry]
        if len(coords) < 2:
            raise ValueError(f'Route {way_id} has no usable geometry')
        line = LineString([project.transform(*point) for point in coords])
        routes.append({'id': f'osm-way-{way_id}', 'ordinal': ordinal, 'coordinates': coords, 'shape': line,
                       'sourcePar': source_par, 'scorecardPar': par})

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
        if not containing:
            raise ValueError(f"{card['slug']}-{route['ordinal']:02}: no OSM green contains the selected route endpoint")
        containing.sort(key=lambda feature: feature['shape'].area)
        selected_green[route['id']] = containing[0]['id']
        green_alternatives[route['id']] = [feature['id'] for feature in containing[1:]]
    for feature in candidates:
        shape = feature['shape']
        if feature['kind'] == 'green':
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
        features.append({'id': route['id'], 'kind': 'route', 'sourceIds': ['osm-overpass-2026-09-15'],
                         'holeKeys': [f"{card['slug']}-{route['ordinal']:02}"], 'reviewed': False, 'accuracyMeters': None,
                         'geometryWgs84': {'type': 'LineString', 'coordinates': route['coordinates']}})
    for feature in candidates:
        if feature['id'] not in owners:
            continue
        features.append({'id': feature['id'], 'kind': feature['kind'], 'sourceIds': ['osm-overpass-2026-09-15'],
                         'holeKeys': [f"{card['slug']}-{route_by_id[identifier]['ordinal']:02}" for identifier in owners[feature['id']]],
                         'reviewed': False, 'accuracyMeters': None,
                         'geometryWgs84': {'type': 'Polygon', 'coordinates': [feature['coordinates']]}})

    feature_by_id = {feature['id']: feature for feature in features}
    holes, association_rows = [], []
    for route in routes:
        key = f"{card['slug']}-{route['ordinal']:02}"
        ids = sorted(by_route[route['id']])
        green_ids = [feature_id for feature_id in ids if feature_by_id[feature_id]['kind'] == 'green']
        tee_ids = [feature_id for feature_id in ids if feature_by_id[feature_id]['kind'] == 'tee']
        fairway_ids = [feature_id for feature_id in ids if feature_by_id[feature_id]['kind'] == 'fairway']
        bunker_ids = [feature_id for feature_id in ids if feature_by_id[feature_id]['kind'] == 'bunker']
        water_ids = [feature_id for feature_id in ids if feature_by_id[feature_id]['kind'] == 'water']
        if green_ids != [selected_green[route['id']]]:
            raise ValueError(f'{key}: selected endpoint green association did not survive feature ownership')
        gaps = [
            'OSM source candidate; independent imagery registration and course-familiar review pending',
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
               'holes': holes, 'sources': [{'id': 'osm-overpass-2026-09-15', 'provider': 'OpenStreetMap via Overpass API',
                  'licenseId': 'ODbL-1.0', 'url': 'https://overpass-api.de/api/interpreter', 'capturedAt': None,
                  'retrievedAt': card['retrievedAt'], 'attribution': '© OpenStreetMap contributors · ODbL 1.0'}]}
    package['contentHash'] = sha(package)
    report = {'schemaVersion': 1, 'status': 'needs_physical_review', 'course': card['name'],
              'packageHash': package['contentHash'], 'rawOverpassSha256': hashlib.sha256(raw_bytes).hexdigest(),
              'routeSelection': {'method': 'explicit selected OSM golf=hole way IDs; ref checked, source par compared against retained scorecard',
                                 'routeWayIds': card['routeWayIds']},
              'associationPolicy': {'green': 'contains selected route endpoint', 'fairway': 'intersects route by 8m or more',
                                     'tee': 'within 28m of route start', 'bunker_water': 'nearest selected route within 55m'},
              'holes': association_rows, 'unclaimedSourceFeatureIds': unclaimed,
              'discardedEndpointGreenAlternatives': green_alternatives,
              'limitations': ['OSM plan geometry is retained as a renderable source candidate only',
                              'No independent boundary uncertainty or course-familiar review exists',
                              'No imagery or terrain source is used by this preparation step',
                              'OSM route par disagreements are retained as source conflicts; the official scorecard remains the round-scoring authority',
                              'No inferred feature may be used for authoritative physical measurement']}
    write(args.output / 'normalized.json', package)
    write(args.output / 'source-metadata.json', {'scorecard': card, 'overpassSha256': report['rawOverpassSha256'],
                                                   'elementCount': len(raw.get('elements', [])), 'license': 'ODbL-1.0'})
    write(args.output / 'association-report.json', report)
    print(json.dumps({'course': card['name'], 'holes': len(holes), 'features': len(features),
                      'unclaimed': len(unclaimed), 'packageHash': package['contentHash']}))

if __name__ == '__main__':
    main()
