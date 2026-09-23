"""Source-independent, lossless candidate import. Never grants physical review.

The retained artifact owns raw vectors and evidence; the package owns a selected
layout view. Identity review is distinct from boundary/measurement approval.
"""
import copy
import hashlib
import json
import math
import re
from pathlib import Path

from shapely.geometry import Point, shape

ID = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$')
KINDS = {'route', 'tee', 'fairway', 'green', 'bunker', 'water', 'rough', 'woods'}
ROUTE_TRACE_SCHEMA = 'golfhelm-route-traces-v1'


def identity(doc):
    return hashlib.sha256(json.dumps(doc, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def resolved_routes(result):
    return bool(result and (result.get('routeWayIds') or result.get('sourceGeometryHash') or result.get('routeTracesHash')) and not result.get('problem'))


def read_source_geometry(path, facility_id, site_id, hole_order):
    raw = Path(path).read_bytes()
    if len(raw) > 4_000_000:
        raise ValueError('SOURCE_GEOMETRY_INVALID: import exceeds 4 MB')
    doc = json.loads(raw)
    validate(doc, facility_id, site_id, hole_order)
    return doc


def read_route_traces(path, facility_id, site_id, hole_order):
    """Read a reviewed route/surface intake without creating synthetic OSM IDs.

    ``golfhelm-route-traces-v1`` deliberately carries the same lossless vector
    and provenance contract as source geometry, plus a review record that
    confirms *hole identity and route-to-green association only*. It does not
    grant boundary, terrain, or measurement approval.  The returned document
    is normalized to the internal source-geometry contract so the package
    compiler has one association path for OSM and non-OSM sources.
    """
    raw = Path(path).read_bytes()
    if len(raw) > 4_000_000:
        raise ValueError('ROUTE_TRACES_INVALID: import exceeds 4 MB')
    trace = json.loads(raw)

    def require(ok, message):
        if not ok:
            raise ValueError('ROUTE_TRACES_INVALID: ' + message)

    require(isinstance(trace, dict), 'object required')
    require(trace.get('schema') == ROUTE_TRACE_SCHEMA, 'schema')
    review = trace.get('associationReview') or {}
    require(review.get('status') == 'confirmed', 'confirmed route/green association review required')
    require(isinstance(review.get('reviewer'), str) and bool(review['reviewer']), 'association reviewer')
    require(isinstance(review.get('reviewedAt'), str) and bool(review['reviewedAt']), 'association review date')
    require(isinstance(review.get('evidenceIds'), list) and bool(review['evidenceIds']), 'association review evidence')

    # The wrapper is source data, not a new canonical type. Retain review
    # metadata through the compile path while validating every coordinate and
    # explicit feature binding with the established source-geometry contract.
    doc = copy.deepcopy(trace)
    doc['schema'] = 'golfhelm-source-geometry-v1'
    doc['routeTraceAssociationReview'] = copy.deepcopy(review)
    validate(doc, facility_id, site_id, hole_order)
    evidence_ids = {item['id'] for item in doc['evidence']}
    require(set(review['evidenceIds']) <= evidence_ids, 'association review evidence reference')
    selected = {h['holeKey']: h for h in doc['holes']}
    for key in hole_order:
        hole = selected[key]
        identity_review = hole.get('identityReview') or {}
        require(identity_review.get('status') == 'confirmed', 'confirmed hole identity: ' + key)
        require(set(identity_review.get('evidenceIds') or []) <= evidence_ids, 'hole identity evidence: ' + key)
    return doc


def validate(doc, facility_id, site_id, hole_order):
    def require(ok, message):
        if not ok:
            raise ValueError('SOURCE_GEOMETRY_INVALID: ' + message)
    require(isinstance(doc, dict), 'object required')
    require(doc.get('schema') == 'golfhelm-source-geometry-v1', 'schema')
    require(doc.get('facilityId') == facility_id and doc.get('siteId') == site_id, 'facility/site identity')
    require(doc.get('crs') == 'EPSG:4326' and doc.get('coordinateOrder') == 'longitude,latitude', 'declared interchange frame')
    require(isinstance(hole_order, list) and 9 <= len(hole_order) <= 36 and len(set(hole_order)) == len(hole_order), 'hole order')
    sources = doc.get('sources') or []
    require(isinstance(sources, list) and 1 <= len(sources) <= 32, 'source count')
    source_ids = set()
    for source in sources:
        require(isinstance(source, dict) and set(source) == {'id', 'provider', 'licenseId', 'url', 'capturedAt', 'retrievedAt', 'attribution'}, 'source fields')
        require(isinstance(source['id'], str) and ID.fullmatch(source['id']) and source['id'] not in source_ids, 'source identity')
        source_ids.add(source['id'])
        for key, limit in [('provider', 100), ('licenseId', 100), ('retrievedAt', 40), ('attribution', 300)]:
            require(isinstance(source[key], str) and 0 < len(source[key]) <= limit, 'source ' + key)
        require(isinstance(source['url'], str) and source['url'].startswith('https://') and len(source['url']) > 8, 'source HTTPS URL')
        require(source['capturedAt'] is None or isinstance(source['capturedAt'], str) and len(source['capturedAt']) <= 40, 'capture date')
    evidence = doc.get('evidence') or []
    require(isinstance(evidence, list) and len(evidence) <= 1000, 'evidence list')
    evidence_ids = set()
    for item in evidence:
        require(isinstance(item, dict) and isinstance(item.get('id'), str) and item['id'] not in evidence_ids, 'evidence identity')
        require(isinstance(item.get('sourceId'), str) and item['sourceId'] in source_ids and isinstance(item.get('snapshotSha256'), str)
                and re.fullmatch('[a-f0-9]{64}', item['snapshotSha256']) and isinstance(item.get('method'), str)
                and bool(item['method']) and isinstance(item.get('sourceCrs'), str) and bool(item['sourceCrs']), 'retained source evidence')
        evidence_ids.add(item['id'])
    require(bool(evidence_ids), 'source evidence required')
    features = doc.get('features') or []
    require(isinstance(features, list) and 1 <= len(features) <= 1000, 'feature count')
    by_id = {}
    vertices = 0
    for feature in features:
        require(isinstance(feature, dict) and isinstance(feature.get('id'), str) and ID.fullmatch(feature['id']) and feature['id'] not in by_id, 'feature identity')
        require(feature.get('kind') in KINDS, 'feature kind')
        for name, allowed in [('sourceIds', source_ids), ('evidenceIds', evidence_ids)]:
            refs = feature.get(name)
            require(isinstance(refs, list) and bool(refs) and all(isinstance(v, str) and v in allowed for v in refs), 'feature ' + name)
        require(isinstance(feature.get('holeKeys'), list) and 1 <= len(feature['holeKeys']) <= 36 and len(set(feature['holeKeys'])) == len(feature['holeKeys']), 'feature hole references')
        accuracy = feature.get('accuracyMeters')
        require(accuracy is None or type(accuracy) in (int, float) and math.isfinite(accuracy) and accuracy > 0, 'feature uncertainty')
        geom = feature.get('geometryWgs84') or {}
        require((feature['kind'] == 'route' and geom.get('type') == 'LineString') or (feature['kind'] != 'route' and geom.get('type') in ('Polygon', 'MultiPolygon')), 'geometry kind')
        parts = [[geom.get('coordinates')]] if geom['type'] == 'LineString' else [geom.get('coordinates')] if geom['type'] == 'Polygon' else geom.get('coordinates')
        require(isinstance(parts, list) and 1 <= len(parts) <= 32, 'polygon count')
        for rings in parts:
            require(isinstance(rings, list) and 1 <= len(rings) <= 16, 'ring count')
            for ring in rings:
                require(isinstance(ring, list) and (2 if geom['type'] == 'LineString' else 4) <= len(ring) <= 512, 'ring/line vertex count')
                for point in ring:
                    require(isinstance(point, list) and len(point) == 2 and all(type(v) in (int, float) and math.isfinite(v) for v in point) and -180 <= point[0] <= 180 and -90 <= point[1] <= 90, 'finite WGS84 position')
                require(geom['type'] == 'LineString' or ring[0] == ring[-1], 'unclosed ring')
                vertices += len(ring)
        require(vertices <= 40000, 'vertex budget')
        polygon = shape(geom)
        require(not polygon.is_empty and polygon.is_valid, 'invalid topology: ' + feature['id'])
        by_id[feature['id']] = feature
    holes = doc.get('holes') or []
    require(isinstance(holes, list) and all(isinstance(h, dict) and isinstance(h.get('holeKey'), str) and ID.fullmatch(h['holeKey']) for h in holes), 'physical hole identities')
    keys = [h.get('holeKey') for h in holes]
    require(len(keys) == len(set(keys)) and set(hole_order) <= set(keys), 'missing/duplicate physical holes')
    for hole in holes:
        key = hole['holeKey']
        review = hole.get('identityReview') or {}
        require(review.get('status') in ('candidate', 'confirmed') and bool(review.get('evidenceIds')) and set(review['evidenceIds']) <= evidence_ids, 'hole identity evidence')
        if review['status'] == 'confirmed':
            require(bool(review.get('reviewer')) and bool(review.get('reviewedAt')), 'identity reviewer/date')
        route, green = by_id.get(hole.get('routeFeatureId')), by_id.get(hole.get('greenFeatureId'))
        require(route and route['kind'] == 'route' and key in route['holeKeys'], 'explicit route binding: ' + key)
        require(green and green['kind'] == 'green' and key in green['holeKeys'], 'explicit green binding: ' + key)
        require(shape(green['geometryWgs84']).contains(Point(route['geometryWgs84']['coordinates'][-1])), 'GREEN_ASSOCIATION_UNRESOLVED: ' + key)
    require(all(set(f['holeKeys']) <= set(keys) for f in features), 'unknown physical hole')
    identity(doc)  # Reject non-finite values anywhere in evidence as well.


def selected_features(doc, hole_order):
    selected = set(hole_order)
    result = []
    for original in doc['features']:
        keys = [key for key in original['holeKeys'] if key in selected]
        if keys:
            feature = {key: copy.deepcopy(original[key]) for key in ('id', 'kind', 'sourceIds', 'accuracyMeters', 'geometryWgs84')}
            feature.update(holeKeys=keys, reviewed=False)
            result.append(feature)
    return result
