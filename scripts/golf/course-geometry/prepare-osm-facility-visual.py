"""Create a visual-only facility package when a layout's hole route is unresolved.

This is deliberately separate from ``prepare-osm-course.py``. It retains
source-backed site surfaces at their recorded coordinates for a static course
context render, but has no tee-to-green route and never associates a source
feature with a played hole. It can therefore render a facility without
letting an attractive scene become a source of physical shot measurements.

Usage:
  python3 scripts/golf/course-geometry/prepare-osm-facility-visual.py \
    <overpass.json.gz> <facility-card.json> <output-directory>
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path


GOLF_KIND = {
    'tee': 'tee',
    'fairway': 'fairway',
    'green': 'green',
    'bunker': 'bunker',
}
VISUAL_KINDS = {'tee', 'fairway', 'green', 'bunker', 'water', 'woods'}
# These counts describe only the retained facility-scoped OSM extract.  They
# prioritize imagery/review work; they must never promote a render candidate
# into hole ownership, metric truth, or physical validation.
CORE_SEMANTIC_KINDS = ('tee', 'fairway', 'green', 'bunker')


def source_coverage(features):
    counts = {kind: sum(feature['kind'] == kind for feature in features) for kind in sorted(VISUAL_KINDS)}
    missing = sorted(kind for kind in CORE_SEMANTIC_KINDS if not counts[kind])
    # One green/fairway across a facility is not enough evidence that every
    # playable hole has been represented.  It remains useful source context,
    # but needs native imagery extraction before a reviewer sees it as a
    # candidate whole-course visual world.
    sparse = bool(missing or counts['green'] <= 1 or counts['fairway'] <= 1)
    return {
        'status': 'sparse' if sparse else 'contextual',
        'semanticFeatureCounts': counts,
        'missingSemanticKinds': missing,
        'rule': 'Facility-scoped OSM counts prioritize imagery extraction and review; they never establish a played-hole route or physical measurement.',
    }


def visual_readiness(coverage):
    sparse = coverage['status'] == 'sparse'
    return {
        'status': 'requires_imagery_enhancement' if sparse else 'requires_route_and_boundary_review',
        'highFidelityHoleWorld': False,
        'nextAction': ('Acquire native imagery and derive/review missing or underrepresented surfaces before visual polish.'
                       if sparse else
                       'Confirm tee-to-green routes and complete boundary review before a physical hole world can be considered.'),
        'rule': 'A facility visual package remains render-only until the independent physical route and boundary contracts pass.',
    }


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n')


def polygon_geometry(element):
    points = [[point['lon'], point['lat']] for point in element.get('geometry') or []]
    if len(points) < 4 or points[0] != points[-1]:
        return None
    return {'type': 'Polygon', 'coordinates': [points]}


def feature_kind(tags):
    if tags.get('golf') in GOLF_KIND:
        return GOLF_KIND[tags['golf']]
    if tags.get('natural') == 'water':
        return 'water'
    if tags.get('natural') in {'wood', 'tree_row'} or tags.get('landuse') in {'forest', 'wood'}:
        return 'woods'
    return None


def context_geometry(raw, card):
    """Use a source golf-course polygon when one exists, otherwise the
    facility AOI bbox. This feature only controls render extent; it never
    claims a playable boundary or hole route."""
    for element in raw.get('elements') or []:
        if (element.get('tags') or {}).get('leisure') == 'golf_course':
            geometry = polygon_geometry(element)
            if geometry:
                return geometry, 'osm-golf-course-boundary'
    west, south, east, north = card['bboxWgs84']
    return {
        'type': 'Polygon',
        'coordinates': [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
    }, 'facility-aoi-bbox'


def build_package(raw, card, manifest):
    source_id = 'osm-overpass-' + str(manifest.get('retrievedAt') or 'unknown')
    context, context_method = context_geometry(raw, card)
    key = card['slug'] + '-visual'
    features = [{
        'id': 'visual-context-' + card['slug'],
        'kind': 'visual_context',
        'truthClass': 'visual_only',
        'sourceIds': [source_id],
        'reviewed': False,
        'accuracyMeters': None,
        'holeKeys': [key],
        'geometryWgs84': context,
        'provenance': {
            'extraction': context_method,
            'purpose': 'render extent only; no playable-surface or hole-route claim',
        },
    }]
    for element in raw.get('elements') or []:
        tags = element.get('tags') or {}
        kind = feature_kind(tags)
        geometry = polygon_geometry(element)
        if kind not in VISUAL_KINDS or not geometry:
            continue
        features.append({
            'id': f'osm-way-{element["id"]}',
            'kind': kind,
            'truthClass': 'derived',
            'sourceIds': [source_id],
            'reviewed': False,
            'accuracyMeters': None,
            'holeKeys': [key],
            'geometryWgs84': geometry,
            'provenance': {
                'extraction': 'OSM source feature; facility-scoped and not associated to a played hole',
                'sourceTags': {field: tags[field] for field in ('golf', 'natural', 'landuse', 'source') if field in tags},
            },
        })
    package = {
        'schemaVersion': 1,
        'kind': 'golfhelm-facility-visual-package-v1',
        'siteId': card['siteId'],
        'name': card['name'],
        'status': 'source_candidate',
        'candidateScope': 'facility_visual_only',
        'canonicalHoleRoutesAdmitted': False,
        'originWgs84': card['originWgs84'],
        'projection': 'wgs84-local-enu-v1',
        'features': features,
        'holes': [{
            'key': key,
            'ordinal': 1,
            'par': 0,
            'scorecardYards': None,
            'featureIds': [feature['id'] for feature in features],
            'routeFeatureId': None,
            'greenFeatureId': None,
            # normalize-study deliberately accepts this source candidate so
            # the static renderer can consume it. The gap is copied through
            # every artifact and keeps physical analytics disabled.
            'completeness': 'partial',
            'gaps': [
                'facility visual context does not identify any played hole route',
                'no tee-to-green distance, pin, tee-marker, or historical ball coordinate is present',
                'feature placement is source-backed where OSM supplies a polygon, but hole ownership is unresolved',
            ],
        }],
        'sources': [{
            'id': source_id,
            'provider': 'OpenStreetMap via Overpass API',
            'licenseId': manifest.get('licenseId', 'ODbL-1.0'),
            'url': manifest.get('endpoint', 'https://overpass-api.de/api/interpreter'),
            'capturedAt': manifest.get('osm3sTimestamp'),
            'retrievedAt': manifest.get('retrievedAt'),
            'attribution': manifest.get('attribution', '© OpenStreetMap contributors · ODbL 1.0'),
            'extractSha256': manifest.get('uncompressedSha256'),
        }],
    }
    package['contentHash'] = hashlib.sha256(canonical(package).encode()).hexdigest()
    coverage = source_coverage(features)
    report = {
        'schemaVersion': 1,
        'kind': 'golfhelm-facility-visual-candidate-report-v1',
        'facilityId': card['slug'],
        'packageHash': package['contentHash'],
        'extractSha256': manifest.get('uncompressedSha256'),
        'featureCounts': {kind: sum(feature['kind'] == kind for feature in features) for kind in sorted({feature['kind'] for feature in features})},
        'sourceCoverage': coverage,
        'visualReadiness': visual_readiness(coverage),
        'renderingContract': {
            'canRender': True,
            'canMeasure': False,
            'maySupplyHoleAssociation': False,
            'routeStatus': 'unresolved',
            'rule': 'This facility GLB is a visual context candidate. It cannot provide tee-to-green distance, lie classification, hazard ownership, or shot constraints.',
        },
        'limitations': list(package['holes'][0]['gaps']),
    }
    return package, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('overpass', type=Path)
    parser.add_argument('facility_card', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    raw_bytes = args.overpass.read_bytes()
    if args.overpass.suffix == '.gz':
        raw_bytes = gzip.decompress(raw_bytes)
    raw = json.loads(raw_bytes)
    card = json.loads(args.facility_card.read_text())
    manifest_path = args.overpass.with_name('manifest.json')
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    expected = manifest.get('uncompressedSha256')
    actual = hashlib.sha256(raw_bytes).hexdigest()
    if expected and expected != actual:
        raise ValueError('Overpass extract does not match its source manifest')
    package, report = build_package(raw, card, manifest)
    write_json(args.output / 'normalized.json', package)
    write_json(args.output / 'visual-candidate-report.json', report)
    write_json(args.output / 'source-metadata.json', {'facility': card, 'overpassSha256': actual, 'source': package['sources'][0]})
    print(canonical({'packageHash': package['contentHash'], 'features': len(package['features']), 'renderable': True, 'measurable': False}))


if __name__ == '__main__':
    main()
