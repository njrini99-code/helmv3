"""Reject incomplete course geometry before it can become a playable GolfHelm hole.

This source-truth gate is intentionally upstream of Blender.  It accepts either
a canonical local-metre study (one physical study) or a whole-course source
package (every played hole) and writes both a machine-readable report and a
Markdown review table.  A feature may be rendered even when it fails this gate;
only measured/derived, reviewed physical geometry may support authoritative
course-world or analytics claims.

Usage:
  python3 scripts/golf/course-geometry/course-truth-gate.py \
    normalized.json validation/truth-gate.json validation/truth-gate.md
"""
import argparse
import json
import math
import sys
from itertools import pairwise
from pathlib import Path

from physical_admission import (
    availability,
    capabilities,
    positive,
    review_scope,
    reviewed_feature,
)
from pyproj import Geod
from shapely.geometry import Point, shape

TRUTH_CLASSES = {'measured', 'derived', 'estimated', 'visual_only'}
CORE_FEATURES = ('tee', 'fairway', 'green', 'bunker', 'water')


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n')


def feature_truth(feature):
    provenance = feature.get('provenance', {})
    declared = feature.get('truthClass', provenance.get('truthClass'))
    if declared in TRUTH_CLASSES:
        return declared
    extraction = str(provenance.get('extraction', '')).lower()
    source_ids = provenance.get('sourceIds', [])
    if any(str(source).startswith(('osm', 'usgs')) for source in source_ids):
        return 'derived'
    if 'not imagery-derived' in extraction or 'scorecard' in extraction:
        return 'estimated'
    return 'visual_only'


def source_label(feature):
    provenance = feature.get('provenance', {})
    return ', '.join(map(str, provenance.get('sourceIds', []))) or 'none'


def requirements(feature, kind):
    truth = feature_truth(feature)
    provenance = feature.get('provenance', {})
    reasons = []
    if truth not in {'measured', 'derived'}:
        reasons.append(f'truth class is {truth}, not measured/derived')
    if provenance.get('humanReviewed') is not True:
        reasons.append('not human reviewed')
    accuracy = provenance.get('boundaryAccuracyMeters')
    if not isinstance(accuracy, (float, int)) or isinstance(accuracy, bool) or not 0 < accuracy < float('inf'):
        reasons.append('horizontal boundary uncertainty is not recorded')
    if not provenance.get('sourceIds'):
        reasons.append('source identifiers are missing')
    return reasons


def row(kind, features):
    if not features:
        return {
            'feature': kind,
            'source': 'none',
            'resolutionMeters': None,
            'truthClass': 'visual_only',
            'confidence': 'missing',
            'reviewStatus': 'missing',
            'geometryExtractionMethod': 'none',
            'validation': ['no source feature supplied'],
            'canRender': True,
            'canMeasure': False,
            'remediation': 'Acquire or explicitly confirm absence from current licensed orthophoto/vector review.',
        }
    # Multiple features such as bunkers are all represented in one row.
    first = features[0]
    invalid = []
    for feature in features:
        invalid.extend(requirements(feature, kind))
    provenance = first.get('provenance', {})
    truths = sorted({feature_truth(feature) for feature in features})
    resolutions = sorted({feature.get('sourceResolutionMeters') or provenance.get('sourceResolutionMeters') for feature in features} - {None})
    return {
        'feature': kind,
        'source': '; '.join(sorted({source_label(feature) for feature in features})),
        'resolutionMeters': resolutions or None,
        'truthClass': ', '.join(truths),
        'confidence': 'physical_candidate' if not invalid else 'not_physical',
        'reviewStatus': 'reviewed' if all(feature.get('provenance', {}).get('humanReviewed') for feature in features) else 'review_required',
        'geometryExtractionMethod': '; '.join(sorted({str(feature.get('provenance', {}).get('extraction', 'unspecified')) for feature in features})),
        'validation': sorted(set(invalid)) or ['passes feature source contract'],
        'canRender': True,
        'canMeasure': not invalid,
        'measurementLimitations': (
            ['Bunker boundary may be authoritative after review; depth/lip/face analytics remain disabled until a source-backed surface is supplied.']
            if kind == 'bunker' and not first.get('physicalEvidence', {}).get('depthSurface') else []
        ),
        'remediation': 'Record feature-level source resolution and boundary uncertainty; obtain human approval after registered imagery/vector overlay.' if invalid else 'None.',
    }


def distance_row(source):
    review, _scope = review_scope(source)
    item = review.get('holeDistanceGeometry') or source.get('holeDistanceGeometry')
    if not item:
        return {
            'feature': 'hole-distance geometry', 'source': 'scorecard only or absent', 'resolutionMeters': None,
            'truthClass': 'visual_only', 'confidence': 'not_physical', 'reviewStatus': 'missing',
            'geometryExtractionMethod': 'none',
            'validation': ['no source-backed tee-to-green route or endpoint pair supplied'], 'canRender': True,
            'canMeasure': False,
            'remediation': 'Bind reviewed tee and green to a route/endpoint measurement; compare it to the official scorecard without stretching the route.',
        }
    truth = item.get('truthClass', 'visual_only')
    errors = []
    if truth not in {'measured', 'derived'}:
        errors.append(f'truth class is {truth}, not measured/derived')
    if not item.get('humanReviewed'):
        errors.append('not human reviewed')
    if not positive(item.get('routeLengthMeters')):
        errors.append('route length missing or invalid')
    if not positive(source.get('scorecardYards')) or item.get('scorecardYards') != source.get('scorecardYards'):
        errors.append('official scorecard yardage missing or mismatched; the review cannot change it')
    features = {feature.get('id'): feature for feature in source.get('features', [])}
    route, tee, green = [features.get(item.get(key)) for key in ('routeFeatureId', 'teeFeatureId', 'greenFeatureId')]
    if not route or not tee or not green or [f.get('kind') for f in (route, tee, green)] != ['route', 'tee', 'green']:
        errors.append('explicit current route/tee/green associations required')
    else:
        errors.extend(requirements(study_feature(route), 'route'))
        try:
            geometry = route['sourceGeometryWgs84']
            points = geometry['coordinates']
            if geometry['type'] != 'LineString' or len(points) < 2:
                raise ValueError('route must be a line')
            if not shape(tee['sourceGeometryWgs84']).covers(Point(points[0])) or not shape(green['sourceGeometryWgs84']).covers(Point(points[-1])):
                errors.append('route endpoints are not inside the explicitly bound tee and green')
            length = sum(Geod(ellps='WGS84').inv(*a[:2], *b[:2])[2] for a, b in pairwise(points))
            if not math.isfinite(length) or not positive(item.get('routeLengthMeters')) or abs(length - item['routeLengthMeters']) > .01:
                errors.append('recorded route length does not match the retained source geometry within 1 cm')
            if positive(source.get('scorecardYards')) and abs(length / .9144 - source['scorecardYards']) / source['scorecardYards'] > .20:
                errors.append('route differs from scorecard by more than 20%; resolve reference/identity without stretching')
        except (KeyError, TypeError, ValueError):
            errors.append('source route or endpoint geometry invalid')
    return {
        'feature': 'hole-distance geometry', 'source': ', '.join(item.get('sourceIds', [])) or 'none',
        'resolutionMeters': item.get('resolutionMeters'), 'truthClass': truth,
        'confidence': 'physical_candidate' if not errors else 'not_physical',
        'reviewStatus': 'reviewed' if item.get('humanReviewed') else 'review_required',
        'geometryExtractionMethod': item.get('method', 'unspecified'), 'validation': errors or ['passes distance source contract'],
        'canRender': True, 'canMeasure': not errors,
        'remediation': 'None.' if not errors else 'Use a reviewed tee/green association and source-backed route; retain the scorecard only as an independent check.',
    }


def study_feature(feature):
    """Present a whole-course package feature with the study provenance shape.

    A package feature records `reviewed` and `accuracyMeters` directly; the
    study form nests them under `provenance`.  Nothing is inferred here: a
    package feature with no declared truth class stays undeclared and the
    existing source-id rules decide.
    """
    if 'provenance' in feature:
        return feature
    return {**feature, 'provenance': {'sourceIds': feature.get('sourceIds', []), 'humanReviewed': feature.get('reviewed') is True,
                                      'boundaryAccuracyMeters': feature.get('accuracyMeters'), 'extraction': 'OSM source candidate; not imagery-derived'}}


def hole_report(label, features, distance_source):
    reviewed = [reviewed_feature(distance_source, study_feature(item)) for item in features]
    distance_source = {**distance_source, 'features': reviewed}
    by_kind = {kind: [item for item in reviewed if item.get('kind') == kind] for kind in CORE_FEATURES}
    rows = []
    for kind in CORE_FEATURES:
        result = row(kind, by_kind[kind])
        state = availability(distance_source, kind, by_kind[kind])
        result['availability'] = state
        result['completenessPassed'] = (result['canMeasure'] and not state['reasons']) or state['state'] == 'confirmed_absent'
        if state['state'] == 'confirmed_absent':
            result.update({'confidence': 'reviewed_absence', 'reviewStatus': 'reviewed',
                           'validation': ['absence reviewed against current source revision over the complete hole area'],
                           'remediation': 'None. Absence does not create a measurable feature.'})
        elif state['reasons'] and by_kind[kind]:
            result['canMeasure'] = False
            result['validation'].extend(state['reasons'])
        rows.append(result)
    rows.append(distance_row(distance_source))
    admission = capabilities(distance_source, rows)
    return {'hole': label, 'passed': admission['physicalCompleteness']['allowed'], 'features': rows, 'admission': admission}


def package_holes(source):
    features = {item['id']: item for item in source.get('features', [])}
    for hole in source.get('holes', []):
        owned = [features[identifier] for identifier in hole.get('featureIds', []) if identifier in features]
        # A package hole has a route and a scorecard yardage, but no reviewed
        # tee/green endpoint measurement; that is exactly what the distance row
        # must report rather than silently treating route length as measured.
        yield hole_report(hole['key'], owned, {
            'physicalStudyKey': hole['key'], 'packageHash': source.get('contentHash'), 'par': hole.get('par'), 'scorecardYards': hole.get('scorecardYards'),
            'features': owned, 'sources': {'geometry': source.get('sources', [])},
            'holeDistanceGeometry': hole.get('holeDistanceGeometry'),
        })


def markdown(report):
    lines = [
        '# GolfHelm Course Truth Gate', '',
        f"Status: **{'PASS' if report['passed'] else 'FAIL'}**", '',
        '| Feature | Source | Resolution | Truth class | Confidence | Review | Validation |',
        '| --- | --- | --- | --- | --- | --- | --- |',
    ]
    header = lines[4:6]
    lines = lines[:4]
    for hole in report['holes']:
        lines.extend([f"## {hole['hole']} — {'PASS' if hole['passed'] else 'FAIL'}", '', *header])
        for item in hole['features']:
            values = item['resolutionMeters']
            resolution = ', '.join(f'{v:g} m' for v in (values if isinstance(values, list) else [values])) if values else '—'
            validation = '; '.join([*item['validation'], *item.get('measurementLimitations', [])])
            lines.append(f"| {item['feature']} | {item['source']} | {resolution} | {item['truthClass']} | {item['confidence']} | {item['reviewStatus']} | {validation} |")
        lines.append('')
    lines.extend(['', 'A failing source truth gate blocks authoritative physical-world publication and analytics. It does not prohibit visual rendering; estimated and visual-only render geometry must remain non-authoritative.'])
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('canonical_study', type=Path)
    parser.add_argument('json_report', type=Path)
    parser.add_argument('markdown_report', type=Path)
    parser.add_argument('--require-pass', action='store_true', help='Exit nonzero after writing reports when any physical requirement fails')
    args = parser.parse_args()
    source = json.loads(args.canonical_study.read_text())
    if source.get('kind') == 'golfhelm-canonical-local-meter-study':
        holes = [hole_report(source.get('physicalStudyKey', 'study'), source.get('features', []), source)]
        input_kind = source['kind']
    elif source.get('schemaVersion') == 1 and 'holes' in source and 'features' in source and source.get('status') in ('source_candidate', 'reviewed_draft'):
        holes = list(package_holes(source))
        input_kind = 'golfhelm-course-package-v1'
    else:
        raise ValueError('Course truth gate requires canonical local-metre source geometry or a whole-course source package')
    report = {
        'schemaVersion': 3,
        'kind': 'golfhelm-course-truth-gate-v1',
        'inputKind': input_kind,
        'siteId': source.get('siteId'),
        'sourceCanonicalHash': source.get('contentHash'),
        'passed': all(hole['passed'] for hole in holes),
        'holes': holes,
        # Flat view retained for one-study callers and the existing tests.
        'features': holes[0]['features'] if len(holes) == 1 else [],
        'publicationRule': 'No failing candidate may be called production-ready or become authoritative physical geometry.',
        'renderingRule': 'All truth classes may render; only measured/derived approved geometry may become physical measurement input.',
    }
    write_json(args.json_report, report)
    args.markdown_report.parent.mkdir(parents=True, exist_ok=True)
    args.markdown_report.write_text(markdown(report))
    print(json.dumps({'passed': report['passed'], 'holes': len(holes), 'failedHoles': [hole['hole'] for hole in holes if not hole['passed']]}))
    if args.require_pass and not report['passed']:
        sys.exit(2)


if __name__ == '__main__':
    main()
