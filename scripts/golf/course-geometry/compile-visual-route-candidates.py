"""Compile checksum-verified visual-route candidates into review-only GLBs.

This job consumes ``golfhelm-visual-route-render-plan-v1`` output from route
recovery.  It does not read a catalog, scorecard, canonical package, physical
world, runtime manifest, or One Tap data.  Candidate IDs remain anonymous
display IDs throughout the build.

The default is one serial asset.  Increase ``--max-assets`` only after review;
each asset is admitted independently against the Factory's 8 GiB disk reserve.

Example:
  python3 scripts/golf/course-geometry/compile-visual-route-candidates.py \
    /tmp/golfhelm-visual-route-recovery.json --layout alamance-cc --max-assets 18
"""
import argparse
import gzip
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from factory import disk


HERE = Path(__file__).resolve().parent
REQUIRED_FALSE = ('mayEnterCanonicalPackage', 'mayEnterOneTap', 'mayPublishAsPhysicalHoleWorld', 'canMeasure')
MAX_ASSETS_PER_RUN = 36
DEFAULT_ESTIMATED_BYTES = 64 * 1024 * 1024


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def sha256_bytes(value):
    return hashlib.sha256(value).hexdigest()


def sha256_path(path):
    return sha256_bytes(Path(path).read_bytes())


def checked_path(repo_root, relative, required_root=None):
    """Resolve a plan path without allowing a crafted plan to escape roots."""
    candidate = Path(relative)
    if candidate.is_absolute():
        raise ValueError('visual render plan path must be repository-relative')
    resolved = (repo_root / candidate).resolve()
    allowed = (required_root or repo_root).resolve()
    if os.path.commonpath((str(allowed), str(resolved))) != str(allowed):
        raise ValueError('visual render plan path escapes its allowed root')
    return resolved


def load_raw_extract(source_path, source_hash):
    raw = Path(source_path).read_bytes()
    if source_path.suffix == '.gz':
        raw = gzip.decompress(raw)
    if sha256_bytes(raw) != source_hash:
        raise ValueError('retained source extract does not match visual render plan SHA-256')
    doc = json.loads(raw)
    if not isinstance(doc, dict) or not isinstance(doc.get('elements'), list):
        raise ValueError('retained source extract has no elements array')
    return doc


def source_polygon(element, expected_kind):
    if not isinstance(element, dict) or element.get('type') != 'way':
        raise ValueError('planned source feature is not an OSM way')
    if (element.get('tags') or {}).get('golf') != expected_kind:
        raise ValueError('planned source feature golf kind changed')
    ring = [[point.get('lon'), point.get('lat')] for point in element.get('geometry') or []]
    if len(ring) < 4 or ring[0] != ring[-1] or any(not all(isinstance(v, (int, float)) for v in point) for point in ring):
        raise ValueError('planned source feature does not retain a closed coordinate polygon')
    return {'kind': expected_kind, 'wayId': element['id'], 'centerWgs84': None,
            'geometryWgs84': {'type': 'Polygon', 'coordinates': [ring]}}


def compile_input(asset, plan, raw_extract):
    """Rehydrate source way geometry only after artifact checksum verification."""
    contract = plan.get('renderingContract') or {}
    if any(contract.get(key) is not False for key in REQUIRED_FALSE):
        raise ValueError('visual render plan would permit authoritative use')
    candidate_id = asset.get('candidateId')
    if not isinstance(candidate_id, str) or not candidate_id:
        raise ValueError('visual render asset has no anonymous candidate ID')
    # The asset plan deliberately omits raw feature geometry.  Match the exact
    # source way IDs against the verified retained extract before copying just
    # those polygons into an ephemeral compiler input.
    ways = {element.get('id'): element for element in raw_extract['elements'] if element.get('type') == 'way'}
    expected = set(asset.get('sourceWayIds') or [])
    if not expected:
        raise ValueError('visual render asset has no explicit source way IDs')
    # Candidate details only live in the original plan report.  The plan uses
    # source way IDs plus the display-candidate ID, so select it from the row.
    candidates = plan.get('_routeCandidates') or []
    candidate = next((item for item in candidates if item.get('candidateId') == candidate_id), None)
    if not candidate:
        raise ValueError('visual render asset cannot be reconnected to its candidate evidence')
    if any(key in candidate for key in ('physicalHoleId', 'holeKey', 'ordinal', 'routeWayId')):
        raise ValueError('visual candidate has canonical identifiers')
    source_features = []
    sources = candidate.get('sourceFeatures') or {'green': candidate.get('greenSourceFeature')}
    for kind in ('tee', 'green', 'fairwayContext'):
        source = sources.get(kind)
        if not source:
            continue
        expected_kind = 'fairway' if kind == 'fairwayContext' else kind
        if source.get('wayId') not in expected:
            raise ValueError('candidate source way is absent from the render asset plan')
        item = source_polygon(ways.get(source['wayId']), expected_kind)
        if source.get('centerWgs84'):
            item['centerWgs84'] = source['centerWgs84']
        source_features.append(item)
    if not any(feature['kind'] == 'green' for feature in source_features):
        raise ValueError('visual candidate needs an explicit retained green source polygon')
    candidate_copy = {key: value for key, value in candidate.items()
                      if key in {'candidateId', 'truthClass', 'authority', 'visualCorridorWgs84', 'limitations'}}
    return {
        'schema': 'golfhelm-visual-route-candidate-compile-input-v1',
        'planSha256': plan['contentHash'],
        'sourceArtifact': asset['sourceArtifact'],
        'candidate': candidate_copy,
        'sourceFeatures': source_features,
        'renderingContract': contract,
    }


def route_candidates_for(plan_row):
    candidates = (plan_row.get('visualRouteCandidates') or {})
    return list(candidates.get('candidates') or []) + list(candidates.get('greenOnlyCandidates') or [])


def plan_rows(document, layout_id):
    if document.get('schema') == 'golfhelm-visual-route-render-plan-v1':
        # A standalone plan needs adjacent candidate evidence because its asset
        # list intentionally stores only referenced source IDs.  Refuse it
        # rather than creating geometry the plan cannot audit.
        if not document.get('_routeCandidates'):
            raise ValueError('standalone plan lacks retained candidate evidence; use route-recovery report output')
        rows = [{'layoutId': document.get('layoutId'), 'visualRenderPlan': document}]
    elif document.get('schema') == 'golfhelm-factory-route-recovery-v1':
        rows = document.get('layouts') or []
    else:
        raise ValueError('input is not route-recovery output or a visual render plan')
    rows = [row for row in rows if layout_id is None or row.get('layoutId') == layout_id]
    if layout_id and not rows:
        raise ValueError('requested layout is absent from route-recovery report')
    selected = []
    for row in rows:
        plan = dict(row.get('visualRenderPlan') or {})
        if not plan:
            continue
        plan['_routeCandidates'] = route_candidates_for(row)
        selected.append(plan)
    return selected


def run_blender(blender, script, args):
    result = subprocess.run([str(blender), '--background', '--python-exit-code', '1', '--python', str(script), '--',
                             *[str(item) for item in args]], check=False, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError((result.stdout + result.stderr)[-4000:])
    return result.stdout.strip()


def renderer_identity():
    """A renderer revision receives a separate review-artifact directory.

    A material/camera update must not make an older preview look current just
    because source geometry and the candidate plan did not change.
    """
    parts = [HERE / 'blender/generate_visual_route_candidate.py', HERE / 'blender/validate_visual_route_candidate.py']
    return sha256_bytes(b''.join(path.read_bytes() for path in parts))


def asset_output(repo_root, factory_output, asset, plan_hash, renderer_hash):
    suggested = checked_path(repo_root, asset['suggestedDerivedDirectory'], factory_output)
    # A hash-scoped build directory prevents an interrupted/revised visual plan
    # from mutating a previous review artifact in place.
    return suggested / ('build-' + plan_hash[:12] + '-r' + renderer_hash[:8])


def reusable(output, plan_hash, source_hash, renderer_hash):
    manifest = output / 'review-manifest.json'
    glb, preview, validation = output / 'scene.glb', output / 'preview.png', output / 'validation.json'
    if not all(path.is_file() for path in (manifest, glb, preview, validation)):
        return False
    try:
        value = json.loads(manifest.read_text())
        check = json.loads(validation.read_text())
        return (value.get('planSha256') == plan_hash and value.get('sourceSha256') == source_hash
                and value.get('rendererSha256') == renderer_hash
                and value.get('glbSha256') == sha256_path(glb) and check.get('passed') is True
                and check.get('glbSha256') == sha256_path(glb))
    except (OSError, ValueError, TypeError):
        return False


def compile_asset(args, plan, asset, raw_extract, repo_root, factory_output):
    if any(asset.get('sourceArtifact', {}).get(key) != plan.get('sourceArtifact', {}).get(key) for key in ('path', 'sha256')):
        raise ValueError('asset source artifact differs from its display-only plan')
    if any(asset.get(key) for key in ('physicalHoleId', 'holeKey', 'ordinal', 'routeWayId')):
        raise ValueError('asset carries a canonical identifier')
    renderer_hash = renderer_identity()
    output = asset_output(repo_root, factory_output, asset, plan['contentHash'], renderer_hash)
    if reusable(output, plan['contentHash'], asset['sourceArtifact']['sha256'], renderer_hash):
        return {'assetKey': asset['assetKey'], 'candidateId': asset['candidateId'], 'status': 'reused',
                'directory': str(output), 'glb': str(output / 'scene.glb')}
    guard = disk.guard(str(output.parent), args.estimated_bytes_per_asset)
    if guard:
        return {'assetKey': asset['assetKey'], 'candidateId': asset['candidateId'], 'status': 'disk_reserve_blocked',
                'blocker': {'code': guard.code, 'evidence': guard.evidence}}
    if args.dry_run:
        return {'assetKey': asset['assetKey'], 'candidateId': asset['candidateId'], 'status': 'dry_run_validated',
                'directory': str(output)}
    input_data = compile_input(asset, plan, raw_extract)
    output.mkdir(parents=True, exist_ok=True)
    input_path = output / 'compile-input.json'
    input_path.write_text(json.dumps(input_data, indent=2, ensure_ascii=False) + '\n')
    glb, preview, export, validation = output / 'scene.glb', output / 'preview.png', output / 'blender-export.json', output / 'validation.json'
    run_blender(args.blender, HERE / 'blender/generate_visual_route_candidate.py', [input_path, glb, preview, export])
    run_blender(args.blender, HERE / 'blender/validate_visual_route_candidate.py', [input_path, glb, validation])
    valid = json.loads(validation.read_text())
    if valid.get('passed') is not True:
        raise ValueError('visual route candidate GLB contract validation failed')
    manifest = {
        'schema': 'golfhelm-visual-route-candidate-review-manifest-v1',
        'assetKey': asset['assetKey'], 'candidateId': asset['candidateId'],
        'planSha256': plan['contentHash'], 'sourceSha256': asset['sourceArtifact']['sha256'],
        'rendererSha256': renderer_hash,
        'inputSha256': sha256_path(input_path), 'glbSha256': sha256_path(glb),
        'previewSha256': sha256_path(preview), 'validationSha256': sha256_path(validation),
        'renderingContract': plan['renderingContract'],
        'artifactClass': 'C', 'reviewOnly': True,
        'mayEnterCanonicalPackage': False, 'mayEnterOneTap': False,
        'mayPublishAsPhysicalHoleWorld': False, 'canMeasure': False,
    }
    (output / 'review-manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    return {'assetKey': asset['assetKey'], 'candidateId': asset['candidateId'], 'status': 'compiled',
            'directory': str(output), 'glb': str(glb), 'glbBytes': glb.stat().st_size}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report', type=Path, help='route-recovery JSON report containing visualRenderPlan and candidate evidence')
    parser.add_argument('--layout')
    parser.add_argument('--repo-root', type=Path, default=Path.cwd())
    parser.add_argument('--factory-output', type=Path, default=Path('output/course-geometry/factory'))
    parser.add_argument('--max-assets', type=int, default=1)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--estimated-bytes-per-asset', type=int, default=DEFAULT_ESTIMATED_BYTES)
    parser.add_argument('--blender', default=shutil.which('blender') or 'blender')
    parser.add_argument('--report-out', type=Path)
    args = parser.parse_args(argv)
    if not 1 <= args.max_assets <= MAX_ASSETS_PER_RUN:
        raise SystemExit(f'--max-assets must be between 1 and {MAX_ASSETS_PER_RUN}; builds are serial by contract')
    if args.estimated_bytes_per_asset < 1:
        raise SystemExit('--estimated-bytes-per-asset must be positive')
    repo_root = args.repo_root.resolve()
    factory_output = (args.factory_output if args.factory_output.is_absolute() else repo_root / args.factory_output).resolve()
    document = json.loads(args.report.read_text())
    plans = plan_rows(document, args.layout)
    selected = []
    for plan in plans:
        if plan.get('status') != 'ready_display_only_compile':
            continue
        source = plan.get('sourceArtifact') or {}
        source_path = checked_path(repo_root, source.get('path', ''), factory_output)
        raw_extract = load_raw_extract(source_path, source.get('sha256'))
        for asset in plan.get('assets') or []:
            selected.append((plan, asset, raw_extract))
    selected = selected[:args.max_assets]
    results = []
    for plan, asset, raw_extract in selected:
        try:
            results.append(compile_asset(args, plan, asset, raw_extract, repo_root, factory_output))
        except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
            results.append({'assetKey': asset.get('assetKey'), 'candidateId': asset.get('candidateId'), 'status': 'failed', 'error': str(exc)})
    body = {
        'schema': 'golfhelm-visual-route-candidate-batch-v1', 'mode': 'dry_run' if args.dry_run else 'serial',
        'maxAssets': args.max_assets, 'selectedAssets': len(selected), 'results': results,
        'renderingContract': {'mayEnterCanonicalPackage': False, 'mayEnterOneTap': False,
                              'mayPublishAsPhysicalHoleWorld': False, 'canMeasure': False},
    }
    text = json.dumps(body, indent=2, ensure_ascii=False)
    if args.report_out:
        args.report_out.parent.mkdir(parents=True, exist_ok=True)
        args.report_out.write_text(text + '\n')
    print(text)
    return 1 if any(result['status'] in {'failed', 'disk_reserve_blocked'} for result in results) else 0


if __name__ == '__main__':
    sys.exit(main())
