"""Diff a freshly built factory package against a golden reference package.

Both packages are projected into one shared metres frame — an azimuthal
equidistant projection centered on the *golden* package's own origin — so a
candidate whose own `originWgs84` drifted from the golden's cannot silently
pass. Holes are matched by ordinal, not by `key`: a fresh replay's hole keys
may differ from the golden's (Factory v2 Phase 2's hole-key crosswalk note).

Reports, per hole and surface class (every feature `kind` except the route
centerline, which has no area):
  - feature counts, golden vs. candidate
  - polygon IoU (the union of that class's features, in the shared frame)

Also reports, when the manifests/reviews are supplied:
  - terrain source identity (the elevation raster's own sha256, e.g. the
    known Peek'n Peak Upper source `ce26e9ad...`)
  - canopy group counts

Exit status is non-zero unless every surface class the golden package has for
a hole reaches --iou-floor (default 0.85) in the candidate, or is named by an
explicit --allow-missing "<holeKey>:<class>" exception.

Usage:
  python3 scripts/golf/course-geometry/compare-golden.py \
    --candidate output/course-geometry/factory-fresh/layouts/peek-n-peak-upper/package/normalized.json \
    --golden src/test/fixtures/course-geometry/peek-n-peak-upper.json \
    --terrain-manifest output/course-geometry/factory-fresh/facilities/peek-n-peak/terrain/<key>-perimeter-v1/source-manifest.json \
    --golden-terrain-manifest src/test/fixtures/course-geometry/sources/peek-n-peak-upper-terrain/source-manifest.json \
    --canopy output/course-geometry/factory-fresh/layouts/peek-n-peak-upper/canopy-review.json \
    --golden-canopy src/test/fixtures/course-geometry/peek-n-peak-upper-canopy-review.json \
    --allow-missing peek-n-peak-upper-11:fairway \
    --json output/course-geometry/factory-fresh/golden-report.json
"""
import argparse
import json
import sys
from pathlib import Path

import pyproj
from shapely.geometry import shape
from shapely.ops import transform as shapely_transform
from shapely.ops import unary_union

DEFAULT_IOU_FLOOR = 0.85
# The hole's tee-to-green centerline has no area; it never enters the IoU
# gate, though its per-hole feature count is still reported.
LINEAR_KINDS = {'route'}


def load(path):
    return json.loads(Path(path).read_text())


def projector(origin_wgs84):
    """A local metres frame centered on `origin_wgs84`: azimuthal equidistant,
    so both packages compare in the same frame regardless of whose origin
    a factory run happened to record."""
    lon, lat = origin_wgs84
    proj = f'+proj=aeqd +lat_0={lat} +lon_0={lon} +units=m +datum=WGS84'
    return pyproj.Transformer.from_crs('EPSG:4326', proj, always_xy=True).transform


def polygon_shape(feature, project):
    geometry = feature.get('geometryWgs84') or {}
    if geometry.get('type') not in ('Polygon', 'MultiPolygon'):
        return None
    shp = shape(geometry)
    if not shp.is_valid:
        shp = shp.buffer(0)
    return shapely_transform(project, shp)


def hole_index(pkg):
    """ordinal -> {'key': hole key, 'byKind': {kind: [feature, ...]}}"""
    features = {f['id']: f for f in pkg.get('features', [])}
    by_ordinal = {}
    for hole in pkg.get('holes', []):
        grouped = {}
        for fid in hole.get('featureIds') or []:
            feature = features.get(fid)
            if feature:
                grouped.setdefault(feature['kind'], []).append(feature)
        by_ordinal[hole['ordinal']] = {'key': hole.get('key'), 'byKind': grouped}
    return by_ordinal


def surface_union(features, project):
    shapes = [s for f in features for s in (polygon_shape(f, project),) if s is not None and not s.is_empty]
    return unary_union(shapes) if shapes else None


def iou(a, b):
    if a is None or b is None or a.is_empty or b.is_empty:
        return None
    union_area = a.union(b).area
    if union_area <= 0:
        return None
    return round(a.intersection(b).area / union_area, 4)


def compare_holes(candidate, golden, project, iou_floor, allow_missing):
    cand_holes = hole_index(candidate)
    gold_holes = hole_index(golden)
    hole_reports = []
    failures = []
    for ordinal in sorted(set(gold_holes) | set(cand_holes)):
        gold = gold_holes.get(ordinal, {'key': None, 'byKind': {}})
        cand = cand_holes.get(ordinal, {'key': None, 'byKind': {}})
        classes = {}
        for kind in sorted(set(gold['byKind']) | set(cand['byKind'])):
            gold_features = gold['byKind'].get(kind, [])
            cand_features = cand['byKind'].get(kind, [])
            entry = {'goldenCount': len(gold_features), 'candidateCount': len(cand_features)}
            if kind not in LINEAR_KINDS:
                gold_shape = surface_union(gold_features, project)
                cand_shape = surface_union(cand_features, project)
                score = iou(gold_shape, cand_shape)
                exception = f'{gold["key"]}:{kind}' in allow_missing
                entry.update(iou=score, allowedException=exception)
                if gold_shape is not None and not gold_shape.is_empty and (score is None or score < iou_floor) and not exception:
                    failures.append({'ordinal': ordinal, 'holeKey': gold['key'], 'class': kind, 'iou': score})
            classes[kind] = entry
        hole_reports.append({'ordinal': ordinal, 'goldenKey': gold['key'], 'candidateKey': cand['key'], 'classes': classes})
    return hole_reports, failures


def terrain_report(candidate_manifest, golden_manifest):
    cand = load(candidate_manifest) if candidate_manifest else None
    gold = load(golden_manifest) if golden_manifest else None
    cand_sha = ((cand or {}).get('fileHashes') or {}).get('elevation.tiff')
    gold_sha = ((gold or {}).get('fileHashes') or {}).get('elevation.tiff')
    return {
        'candidateElevationSha256': cand_sha, 'goldenElevationSha256': gold_sha,
        'candidateTitle': (cand or {}).get('selectedTitle'), 'goldenTitle': (gold or {}).get('selectedTitle'),
        'match': bool(cand_sha and cand_sha == gold_sha),
    }


def canopy_report(candidate_canopy, golden_canopy):
    cand = load(candidate_canopy) if candidate_canopy else None
    gold = load(golden_canopy) if golden_canopy else None
    return {
        'candidateGroups': len((cand or {}).get('regions') or []), 'goldenGroups': len((gold or {}).get('regions') or []),
        'candidateSource': (cand or {}).get('source'), 'goldenSource': (gold or {}).get('source'),
        'candidateSourceSelection': (cand or {}).get('sourceSelection'), 'goldenSourceSelection': (gold or {}).get('sourceSelection'),
    }


def build_report(args):
    candidate = load(args.candidate)
    golden = load(args.golden)
    if not golden.get('originWgs84'):
        raise SystemExit('golden package has no originWgs84 to project against')
    project = projector(golden['originWgs84'])
    allow_missing = set(args.allow_missing or [])
    hole_reports, failures = compare_holes(candidate, golden, project, args.iou_floor, allow_missing)
    report = {
        'schema': 'golfhelm-factory-compare-golden-v1',
        'candidatePackage': str(args.candidate), 'goldenPackage': str(args.golden),
        'candidateContentHash': candidate.get('contentHash'), 'goldenContentHash': golden.get('contentHash'),
        'candidateHoleCount': len(candidate.get('holes', [])), 'goldenHoleCount': len(golden.get('holes', [])),
        'iouFloor': args.iou_floor, 'allowMissing': sorted(allow_missing),
        'holes': hole_reports, 'failures': failures,
    }
    if args.terrain_manifest or args.golden_terrain_manifest:
        report['terrain'] = terrain_report(args.terrain_manifest, args.golden_terrain_manifest)
    if args.canopy or args.golden_canopy:
        report['canopy'] = canopy_report(args.canopy, args.golden_canopy)
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--candidate', required=True, type=Path, help="the fresh build's package/normalized.json")
    parser.add_argument('--golden', required=True, type=Path, help='the checked-in golden package (e.g. peek-n-peak-upper.json)')
    parser.add_argument('--terrain-manifest', type=Path, help="the candidate's terrain source-manifest.json")
    parser.add_argument('--golden-terrain-manifest', type=Path, help="the golden's terrain source-manifest.json")
    parser.add_argument('--canopy', type=Path, help="the candidate's canopy-review.json")
    parser.add_argument('--golden-canopy', type=Path, help="the golden's canopy-review.json")
    parser.add_argument('--iou-floor', type=float, default=DEFAULT_IOU_FLOOR)
    parser.add_argument('--allow-missing', action='append', metavar='HOLEKEY:CLASS',
                         help='a documented exception, e.g. peek-n-peak-upper-11:fairway; repeatable')
    parser.add_argument('--json', type=Path, help='also write the full report as JSON to this path')
    args = parser.parse_args(argv)

    report = build_report(args)
    text = json.dumps(report, indent=2, sort_keys=True)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(text + '\n')
    print(text)
    if report['failures']:
        print(f'FAILED: {len(report["failures"])} hole/class combination(s) below IoU {args.iou_floor}', file=sys.stderr)
        return 1
    print('PASSED: every golden surface class reached the IoU floor (or was an allowed exception)', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
