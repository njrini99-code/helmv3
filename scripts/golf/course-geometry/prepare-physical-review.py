"""Create a pending, source-bound physical review kit; never approve geometry.

Usage: python3 prepare-physical-review.py package.json world/ pending-review.json

Inspect the retained orthophoto/geometry in the existing QGIS review kit, then
record independent check points and dated review evidence in this sidecar.
Bind the reviewed file with layout.retained.physicalAdmission. Existing review
files are never overwritten. Missing study files fail instead of guessing.
"""
import argparse
import json
from pathlib import Path

from physical_admission import CORE_FEATURES, REVIEW_KIND, digest, source_revision
from shapely.geometry import mapping, shape
from shapely.ops import unary_union


def pending_review():
    return {'status': 'pending', 'reviewer': None, 'reviewedAt': None, 'evidenceHash': None}


def prepare(package, world_directory):
    holes = {}
    for package_hole in package['holes']:
        key = package_hole['key']
        if Path(key).name != key or key in ('.', '..'):
            raise ValueError('Hole key must be one path segment')
        study = json.loads((world_directory / 'holes' / key / 'study.json').read_text())
        if study.get('physicalStudyKey') != key or study.get('siteId') != package.get('siteId'):
            raise ValueError(f'{key}: study identity mismatch')
        # Legacy studies predate packageHash, so only allow matching actual
        # retained WGS84 features. This constructs a new pending review, never
        # trusts old approvals or relabels the source world.
        actual = {f['id']: f.get('sourceGeometryWgs84') for f in study['features']}
        wanted = {f['id']: f['geometryWgs84'] for f in package['features'] if f['id'] in package_hole['featureIds']}
        if actual != wanted or (study.get('packageHash') and study['packageHash'] != package['contentHash']):
            raise ValueError(f'{key}: study geometry/package revision mismatch')
        features = [f for f in study['features'] if f['kind'] in (*CORE_FEATURES, 'route')]
        area = json.loads(json.dumps(mapping(unary_union([shape(f['sourceGeometryWgs84']) for f in features]).envelope)))
        area_hash = digest(area)
        source_hash = source_revision(study)
        vertical = study.get('sources', {}).get('terrain', {})
        holes[key] = {
            'holeKey': key, 'sourceRevisionHash': source_hash, 'review': pending_review(),
            'reviewedArea': {'geometryWgs84': area, 'sha256': area_hash},
            'identity': {'physicalHoleKey': key, 'review': pending_review()},
            'featureAvailability': {kind: {'state': 'present', 'featureIds': [f['id'] for f in features if f['kind'] == kind]}
                                    if any(f['kind'] == kind for f in features) else {'state': 'unknown', 'reason': 'No feature supplied; absence has not been reviewed'}
                                    for kind in CORE_FEATURES},
            'featureEvidence': {f['id']: {'geometryHash': digest(f['sourceGeometryWgs84']),
                                        'sourceIds': f.get('provenance', {}).get('sourceIds', []),
                                        'truthClass': None, 'method': None, 'boundaryAccuracyMeters': None, 'review': pending_review()}
                                for f in features},
            'registration': {'review': pending_review(), 'distributedCoverageReviewed': False, 'checkpoints': []},
            'vertical': {'review': pending_review(), 'rasterSha256': study.get('terrain', {}).get('source', {}).get('rasterSha256'),
                         'datum': vertical.get('verticalDatum'), 'unitToMeters': vertical.get('verticalUnitToMeters'),
                         'featureCoverage': 'unknown', 'verticalAccuracy95Meters': None},
            'holeDistanceGeometry': {'truthClass': None, 'humanReviewed': False, 'routeFeatureId': package_hole.get('routeFeatureId'),
                                     'greenFeatureId': package_hole.get('greenFeatureId'), 'teeFeatureId': None,
                                     'routeLengthMeters': None, 'scorecardYards': package_hole.get('scorecardYards')},
            'fieldValidation': {'review': pending_review(), 'method': 'independent_geodetic_checkpoints',
                                'distributedCoverageReviewed': False, 'checkpoints': []},
        }
    return {'kind': REVIEW_KIND, 'packageHash': package['contentHash'], 'holes': holes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    parser.add_argument('world_directory', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    document = prepare(json.loads(args.package.read_text()), args.world_directory)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x') as stream:
        json.dump(document, stream, indent=2, ensure_ascii=False, allow_nan=False)
        stream.write('\n')
    print(json.dumps({'pendingHoles': len(document['holes']), 'approvedHoles': 0, 'path': str(args.output)}))


if __name__ == '__main__':
    main()
