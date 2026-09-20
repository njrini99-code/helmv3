#!/usr/bin/env python3
"""Acquire resumable, source-locked public imagery across the catalog.

NC keeps its higher-resolution regional workflow. This batch acquires a
national fallback for other facilities; it does not declare that fallback the
best available local image. AOIs use the existing factory resolver. Work is
serial and each raster downloader enforces an 8 GiB free-space reserve.
"""
import argparse
import json
import math
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent


def write_json(path, document):
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_suffix(path.suffix + '.tmp')
    pending.write_text(json.dumps(document, indent=2) + '\n')
    pending.replace(path)


def build_jobs(facilities, layouts, root):
    jobs = []
    for facility in sorted(facilities, key=lambda card: card['facilityId']):
        fid = facility['facilityId']
        policy = (facility.get('providerPolicy') or {}).get('imagery') or []
        matches = sorted(layout['layoutId'] for layout in layouts if layout['facilityId'] == fid)
        status = ('regional_workflow' if facility.get('region') == 'NC' else
                  'ready' if facility.get('country') == 'US' and 'usgs_naip_plus' in policy and matches else
                  'policy_or_layout_required')
        jobs.append({'facilityId': fid, 'status': status, 'layoutId': matches[0] if matches else None,
                     'aoi': str(root / 'facilities' / fid / 'aoi.json'),
                     'output': str(root / 'facilities' / fid / 'naip-plus-locked-v2'),
                     'sourceRole': 'public_national_fallback_not_best_local_source'})
    return jobs


def run_logged(command, log):
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open('a') as stream:
        stream.write('\n' + json.dumps({'command': command, 'startedAt': datetime.now(timezone.utc).isoformat()}) + '\n')
        stream.flush()
        result = subprocess.run(command, cwd=HERE.parents[2], stdout=stream, stderr=subprocess.STDOUT)
    return result.returncode


def execute(plan, args):
    for job in plan['jobs']:
        if job['status'] != 'ready':
            continue
        job['status'] = 'running'
        write_json(args.report, plan)
        print(json.dumps({'facility': job['facilityId'], 'status': 'running'}), flush=True)
        out = Path(job['output'])
        log = out.parent / 'naip-plus-locked-v2.log'
        job['log'] = str(log)
        if not Path(job['aoi']).is_file():
            command = [sys.executable, str(HERE / 'course-factory.py'), '--catalog', str(args.catalog),
                       '--output', str(args.factory_root), 'run', '--layout', job['layoutId'],
                       '--task', 'facility.aoi.resolve', '--json']
            code = run_logged(command, log)
            if code or not Path(job['aoi']).is_file():
                job.update(status='aoi_resolution_failed', returncode=code)
                write_json(args.report, plan)
                continue
        command = [sys.executable, str(HERE / 'fetch-usgs-naip-facility-ortho.py'), job['aoi'],
                   job['output'], '--reserve-gb', str(args.reserve_gb)]
        code = run_logged(command, log)
        index = json.loads((out / 'index.json').read_text()) if (out / 'index.json').is_file() else {}
        complete = code == 0 and index.get('complete') is True
        job.update(status='acquired' if complete else 'acquisition_failed', returncode=code,
                   tiles=index.get('tileCountAcquired', 0), tilesPlanned=index.get('tileCountPlanned'),
                   sourceResolutionMeters=index.get('sourceResolutionMeters'))
        write_json(args.report, plan)
        print(json.dumps({key: job[key] for key in ('facilityId', 'status', 'tiles')}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('catalog', type=Path)
    parser.add_argument('factory_root', type=Path)
    parser.add_argument('report', type=Path)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--reserve-gb', type=float, default=8)
    args = parser.parse_args()
    if not math.isfinite(args.reserve_gb) or args.reserve_gb < 8:
        raise ValueError('Reserve must be at least 8 GiB')
    facilities = [json.loads(p.read_text()) for p in sorted((args.catalog / 'facilities').glob('*.json'))]
    layouts = [json.loads(p.read_text()) for p in sorted((args.catalog / 'layouts').glob('*.json'))]
    plan = {'schema': 'golfhelm-source-locked-naip-batch-v1', 'generatedAt': datetime.now(timezone.utc).isoformat(),
            'jobs': build_jobs(facilities, layouts, args.factory_root), 'canMeasurePhysicalGeometry': False}
    write_json(args.report, plan)
    if args.execute:
        execute(plan, args)
    print(json.dumps({'jobs': len(plan['jobs']), 'acquired': sum(j['status'] == 'acquired' for j in plan['jobs'])}))


if __name__ == '__main__':
    main()
