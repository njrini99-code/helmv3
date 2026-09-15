"""Reject incomplete course geometry before it can become a playable GolfHelm hole.

This source-truth gate is intentionally upstream of Blender.  It accepts the
canonical local-metre package and writes both a machine-readable report and a
Markdown review table.  A feature may be rendered even when it fails this gate;
only measured/derived, reviewed physical geometry may support authoritative
course-world or analytics claims.

Usage:
  python3 scripts/golf/course-geometry/course-truth-gate.py \
    normalized.json validation/truth-gate.json validation/truth-gate.md
"""
import argparse
import json
import sys
from pathlib import Path

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
    if not provenance.get('humanReviewed'):
        reasons.append('not human reviewed')
    if provenance.get('boundaryAccuracyMeters') is None:
        reasons.append('horizontal boundary uncertainty is not recorded')
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
    truths = sorted(set(feature_truth(feature) for feature in features))
    resolutions = sorted({feature.get('sourceResolutionMeters') or provenance.get('sourceResolutionMeters') for feature in features} - {None})
    return {
        'feature': kind,
        'source': '; '.join(sorted(set(source_label(feature) for feature in features))),
        'resolutionMeters': resolutions or None,
        'truthClass': ', '.join(truths),
        'confidence': 'physical_candidate' if not invalid else 'not_physical',
        'reviewStatus': 'reviewed' if all(feature.get('provenance', {}).get('humanReviewed') for feature in features) else 'review_required',
        'geometryExtractionMethod': '; '.join(sorted(set(str(feature.get('provenance', {}).get('extraction', 'unspecified')) for feature in features))),
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
    item = source.get('holeDistanceGeometry')
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
    if item.get('routeLengthMeters') is None:
        errors.append('route length missing')
    if item.get('scorecardYards') is None:
        errors.append('official scorecard yardage missing')
    return {
        'feature': 'hole-distance geometry', 'source': ', '.join(item.get('sourceIds', [])) or 'none',
        'resolutionMeters': item.get('resolutionMeters'), 'truthClass': truth,
        'confidence': 'physical_candidate' if not errors else 'not_physical',
        'reviewStatus': 'reviewed' if item.get('humanReviewed') else 'review_required',
        'geometryExtractionMethod': item.get('method', 'unspecified'), 'validation': errors or ['passes distance source contract'],
        'canRender': True, 'canMeasure': not errors,
        'remediation': 'None.' if not errors else 'Use a reviewed tee/green association and source-backed route; retain the scorecard only as an independent check.',
    }


def markdown(report):
    lines = [
        '# GolfHelm Course Truth Gate', '',
        f"Status: **{'PASS' if report['passed'] else 'FAIL'}**", '',
        '| Feature | Source | Resolution | Truth class | Confidence | Review | Validation |',
        '| --- | --- | --- | --- | --- | --- | --- |',
    ]
    for item in report['features']:
        resolution = ', '.join(f'{v:g} m' for v in item['resolutionMeters']) if item['resolutionMeters'] else '—'
        validation = '; '.join([*item['validation'], *item.get('measurementLimitations', [])])
        lines.append(f"| {item['feature']} | {item['source']} | {resolution} | {item['truthClass']} | {item['confidence']} | {item['reviewStatus']} | {validation} |")
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
    if source.get('kind') != 'golfhelm-canonical-local-meter-study':
        raise ValueError('Course truth gate requires canonical local-metre source geometry')
    by_kind = {kind: [item for item in source.get('features', []) if item.get('kind') == kind] for kind in CORE_FEATURES}
    features = [row(kind, by_kind[kind]) for kind in CORE_FEATURES]
    features.append(distance_row(source))
    report = {
        'schemaVersion': 1,
        'kind': 'golfhelm-course-truth-gate-v1',
        'siteId': source.get('siteId'),
        'sourceCanonicalHash': source.get('contentHash'),
        'passed': all(item['canMeasure'] for item in features),
        'features': features,
        'publicationRule': 'No failing candidate may be called production-ready or become authoritative physical geometry.',
        'renderingRule': 'All truth classes may render; only measured/derived approved geometry may become physical measurement input.',
    }
    write_json(args.json_report, report)
    args.markdown_report.parent.mkdir(parents=True, exist_ok=True)
    args.markdown_report.write_text(markdown(report))
    print(json.dumps({'passed': report['passed'], 'failedFeatures': [item['feature'] for item in features if not item['canMeasure']]}))
    if args.require_pass and not report['passed']:
        sys.exit(2)


if __name__ == '__main__':
    main()
