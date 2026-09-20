#!/usr/bin/env python3
"""Annotate complete NC native-ortho caches with ImageServer catalog items.

One center-point identification is retained per source tile so changing mosaic
coverage cannot quietly rewrite imagery provenance. The executor is serial to
avoid burdening the public ImageServer. It creates metadata sidecars only;
no vectors or physical measurements are produced.

Usage:
  python3 scripts/golf/course-geometry/batch-nc-ortho-source-items.py \
    output/course-geometry/factory output/.../nc-ortho-source-items-batch.json --execute
"""
import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent


def write_json(path, document):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, indent=2, ensure_ascii=False) + '\n')


def complete_index(facility_root):
    path = facility_root / 'native-ortho-nir-v2' / 'index.json'
    if not path.is_file():
        return False
    try:
        index = json.loads(path.read_text())
        summary = index.get('qualitySummary') or {}
        return bool(index.get('complete')) and summary.get('passedTiles') == index.get('tileCountPlanned') and not summary.get('failedTileKeys')
    except (OSError, ValueError, TypeError):
        return False


def build_jobs(facility_ids, factory_root, is_complete):
    jobs = []
    for facility_id in sorted(facility_ids):
        base = factory_root / 'facilities' / facility_id
        index = base / 'native-ortho-nir-v2' / 'index.json'
        output = base / 'native-ortho-nir-v2-source-items-v1'
        job = {'facilityId': facility_id, 'index': str(index), 'output': str(output), 'execute': False}
        if is_complete(facility_id):
            job['status'] = 'ready_source_item_annotation'
        else:
            job.update(status='imagery_index_required', reason='A complete passed native RGB+NIR imagery index is required before catalog item annotation.')
        jobs.append(job)
    return jobs


def run(plan, report):
    for job in plan['jobs']:
        if job['status'] != 'ready_source_item_annotation':
            continue
        command = [sys.executable, str(HERE / 'annotate-nc-ortho-source-items.py'), job['index'], job['output']]
        result = subprocess.run(command, cwd=HERE.parents[2], text=True, capture_output=True)
        job['command'] = command
        job['stdoutTail'] = result.stdout[-2000:]
        job['stderrTail'] = result.stderr[-2000:]
        if result.returncode == 0:
            sidecar = json.loads((Path(job['output']) / 'source-items.json').read_text())
            job.update(status='annotated_source_items' if sidecar.get('complete') else 'source_item_review_required', complete=sidecar.get('complete'))
        else:
            job.update(status='annotation_failed', returncode=result.returncode)
        write_json(report, plan)
    return plan


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('factory_root', type=Path)
    parser.add_argument('report', type=Path)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    facilities_root = args.factory_root / 'facilities'
    facility_ids = [path.name for path in facilities_root.iterdir() if path.is_dir()] if facilities_root.is_dir() else []
    plan = {
        'schema': 'golfhelm-nc-ortho-source-items-batch-v1',
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'jobs': build_jobs(facility_ids, args.factory_root, lambda facility: complete_index(facilities_root / facility)),
        'rule': 'This serial batch writes provenance sidecars only. It never extracts geometry or changes physical-truth gates.',
    }
    write_json(args.report, plan)
    if args.execute:
        plan = run(plan, args.report)
    print(json.dumps({
        'jobs': len(plan['jobs']),
        'annotated': sum(job['status'] == 'annotated_source_items' for job in plan['jobs']),
        'pending': sum(job['status'] == 'ready_source_item_annotation' for job in plan['jobs']),
        'failed': sum(job['status'] == 'annotation_failed' for job in plan['jobs']),
    }))


if __name__ == '__main__':
    main()
