#!/usr/bin/env python3
"""Plan or run source-backed per-hole review overlays from retained NC imagery.

The batch has no downloader and no canonical-geometry writer. It only invokes
``review-native-ortho.py`` after both native RGB+NIR and tile-level source
provenance are complete. Layouts without a hole-associated candidate package
remain queued rather than becoming facility-wide pseudo-holes.

Usage:
  python3 scripts/golf/course-geometry/batch-native-ortho-review.py \
    course-geometry/catalog output/course-geometry/factory output/.../native-review-batch.json [--execute]
"""
import argparse
import hashlib
import importlib.util
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('golfhelm_source_registry', HERE / 'factory' / 'source_registry.py')
source_registry = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(source_registry)


def write_json(path, document):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(document, indent=2, ensure_ascii=False) + '\n')


def load_cards(catalog_root):
    return [json.loads(path.read_text()) for path in sorted((Path(catalog_root) / 'facilities').glob('*.json'))]


def load_layout_packages(catalog_root, factory_root):
    layouts = [json.loads(path.read_text()) for path in sorted((Path(catalog_root) / 'layouts').glob('*.json'))]
    packages = {}
    for layout in layouts:
        package = Path(factory_root) / 'layouts' / layout['layoutId'] / 'candidates' / 'normalized.json'
        if package.is_file():
            packages[layout['layoutId']] = {'facilityId': layout['facilityId'], 'package': str(package)}
    return packages


def index_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def native_assets(factory_root, facility_id):
    native_index = Path(factory_root) / 'facilities' / facility_id / 'native-ortho-nir-v2' / 'index.json'
    if not native_index.is_file():
        return {'nativeIndex': None, 'sourceItems': None}
    wanted_hash = index_hash(native_index)
    sidecars = sorted(native_index.parent.parent.glob('native-ortho-nir-v2-source-items-v*/source-items.json'))
    for sidecar in reversed(sidecars):
        try:
            source_items = json.loads(sidecar.read_text())
        except ValueError:
            continue
        if source_items.get('inputIndexSha256') == wanted_hash:
            return {'nativeIndex': str(native_index), 'sourceItems': str(sidecar)}
    return {'nativeIndex': str(native_index), 'sourceItems': None}


def build_jobs(facilities, assets, packages, output_root):
    jobs = []
    for facility in sorted(facilities, key=lambda card: card['facilityId']):
        facility_id = facility['facilityId']
        asset = assets.get(facility_id) or {'nativeIndex': None, 'sourceItems': None}
        layouts = [(layout_id, package) for layout_id, package in sorted(packages.items()) if package['facilityId'] == facility_id]
        if not asset.get('nativeIndex') or not asset.get('sourceItems'):
            jobs.append({'facilityId': facility_id, 'status': 'native_source_provenance_required',
                         'reason': 'Complete native RGB+NIR imagery and a matching source-item sidecar are required.'})
            continue
        if not layouts:
            jobs.append({'facilityId': facility_id, 'status': 'route_candidate_package_required',
                         'reason': 'A per-hole source-candidate package is required; a facility visual package cannot stand in for a hole layout.'})
            continue
        for layout_id, package in layouts:
            jobs.append({
                'facilityId': facility_id, 'layoutId': layout_id, 'package': package['package'],
                'nativeIndex': asset['nativeIndex'], 'sourceItems': asset['sourceItems'],
                'output': str(Path(output_root) / 'layouts' / layout_id / 'native-imagery-review-v1'),
                'status': 'ready_native_hole_review', 'execute': False,
            })
    return jobs


def source_contract(job):
    index = json.loads(Path(job['nativeIndex']).read_text())
    sidecar = json.loads(Path(job['sourceItems']).read_text())
    return source_registry.native_ortho_review_contract(
        index, sidecar, index_sha256=index_hash(job['nativeIndex']),
    )


def run_jobs(plan, report):
    for job in plan['jobs']:
        if job['status'] != 'ready_native_hole_review':
            continue
        contract = source_contract(job)
        if not contract['canCreateReviewCandidates']:
            job.update(status='native_source_provenance_required', reason=contract['reason'])
            write_json(report, plan)
            continue
        command = [sys.executable, str(HERE / 'review-native-ortho.py'), job['package'], job['nativeIndex'], job['sourceItems'], job['output']]
        result = subprocess.run(command, cwd=HERE.parents[2], text=True, capture_output=True)
        job['command'] = command
        job['stdoutTail'] = result.stdout[-2000:]
        job['stderrTail'] = result.stderr[-2000:]
        if result.returncode == 0:
            observations = json.loads((Path(job['output']) / 'candidate-observations.json').read_text())
            job.update(status='native_hole_review_complete', holes=len(observations.get('holes') or []),
                       reviewRequired=observations.get('reviewRequired'))
        else:
            job.update(status='native_hole_review_failed', returncode=result.returncode)
        write_json(report, plan)
    return plan


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('catalog_root', type=Path)
    parser.add_argument('factory_root', type=Path)
    parser.add_argument('report', type=Path)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    facilities = load_cards(args.catalog_root)
    assets = {card['facilityId']: native_assets(args.factory_root, card['facilityId']) for card in facilities}
    packages = load_layout_packages(args.catalog_root, args.factory_root)
    plan = {
        'schema': 'golfhelm-native-ortho-review-batch-v1',
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'jobs': build_jobs(facilities, assets, packages, args.factory_root),
        'rule': 'This batch creates review overlays and derived observation prompts only. It never edits canonical geometry or grants measurement authority.',
    }
    write_json(args.report, plan)
    if args.execute:
        plan = run_jobs(plan, args.report)
    print(json.dumps({
        'jobs': len(plan['jobs']),
        'ready': sum(job['status'] == 'ready_native_hole_review' for job in plan['jobs']),
        'complete': sum(job['status'] == 'native_hole_review_complete' for job in plan['jobs']),
        'blocked': sum(job['status'] not in {'ready_native_hole_review', 'native_hole_review_complete'} for job in plan['jobs']),
    }))


if __name__ == '__main__':
    main()
