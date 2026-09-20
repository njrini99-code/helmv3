#!/usr/bin/env python3
"""Plan or run bounded NC OneMap RGB+NIR acquisition for catalog facilities.

The executor is intentionally NC-specific. Other facilities stay in their
source-registry policy queues until their provider has an equally reproducible
adapter; it never substitutes a browser raster merely to make batch output
look complete.

Usage:
  python3 scripts/golf/course-geometry/batch-nc-facility-ortho.py \
    course-geometry/catalog output/course-geometry/factory output/.../nc-ortho-plan.json
  python3 scripts/golf/course-geometry/batch-nc-facility-ortho.py \
    course-geometry/catalog output/course-geometry/factory output/.../nc-ortho-run.json --execute
"""
import argparse
import importlib.util
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('nc_facility_ortho', HERE / 'fetch-nc-facility-ortho.py')
ortho = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ortho)

NC_PROVIDER = 'nc_onemap_2024_2027_analysis'
DEFAULT_RESERVE_GB = 8.0
# Cape Fear's source bytes averaged below this. Reserve conservatively so a
# larger facility fails closed before it consumes the factory's disk reserve.
ESTIMATED_BYTES_PER_TILE = 20_000_000


def write_json(path, document):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, indent=2, ensure_ascii=False) + '\n')


def facility_cards(catalog_root):
    return [json.loads(path.read_text()) for path in sorted((catalog_root / 'facilities').glob('*.json'))]


def aoi_for(output_root, facility_id):
    path = output_root / 'facilities' / facility_id / 'aoi.json'
    return json.loads(path.read_text()) if path.is_file() else None


def build_plan(facilities, aois, output_root, service_extent):
    jobs = []
    # Tile alignment affects both the capacity forecast and its auditability.
    # Use the provider's current, recorded grid origin rather than an invented
    # State Plane value; acquisition revalidates it before retaining pixels.
    for facility in sorted(facilities, key=lambda item: item['facilityId']):
        facility_id = facility['facilityId']
        policy = list((facility.get('providerPolicy') or {}).get('imagery') or [])
        out = output_root / 'facilities' / facility_id / 'native-ortho-nir-v2'
        job = {
            'facilityId': facility_id,
            'region': facility.get('region'),
            'imageryPolicy': policy,
            'output': str(out),
            'execute': False,
        }
        if facility.get('region') != 'NC' or NC_PROVIDER not in policy:
            job.update(status='not_nc_adapter', reason='This batch has no reproducible NC OneMap RGB+NIR adapter for the facility policy.')
        elif facility_id not in aois:
            job.update(status='aoi_required', reason='Resolve and retain the facility AOI before calculating native source tiles.')
        else:
            aoi = aois[facility_id]
            bounds = ortho.source_bounds(aoi)
            tiles = ortho.native_tiles(bounds, service_extent, ortho.DEFAULT_TILE_M)
            job.update(
                status='ready_native_rgb_nir_v2',
                tileCount=len(tiles),
                estimatedBytes=len(tiles) * ESTIMATED_BYTES_PER_TILE,
                sourceGsdMeters=ortho.source.NATIVE_PIXEL_US_FEET * ortho.source.US_SURVEY_FOOT_TO_METERS,
                sourceProduct='separate_rgb_and_nir_geotiff',
                nativeGridOriginUSFeet=[service_extent['xmin'], service_extent['ymin']],
            )
            if len(tiles) > ortho.MAX_FACILITY_TILES:
                job.update(status='aoi_too_large', reason='The native tile count exceeds the hard per-facility cap; narrow the retained AOI.')
        jobs.append(job)
    return {
        'schema': 'golfhelm-nc-facility-ortho-batch-v1',
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'provider': NC_PROVIDER,
        'jobs': jobs,
        'rule': 'This batch retains source RGB+NIR pixels only. It creates no feature or hole geometry and does not alter physical-truth gates.',
    }


def execute(plan, catalog_root, factory_output, report_path, reserve_gb):
    free = shutil.disk_usage(factory_output).free
    reserve = int(reserve_gb * 1024 ** 3)
    for job in plan['jobs']:
        if job['status'] != 'ready_native_rgb_nir_v2':
            continue
        estimate = job['estimatedBytes']
        if free - estimate < reserve:
            job.update(status='disk_reserve_blocked', reason='Estimated source bytes would cross the factory disk reserve.', freeBytes=free, reserveBytes=reserve)
            write_json(report_path, plan)
            continue
        aoi = factory_output / 'facilities' / job['facilityId'] / 'aoi.json'
        command = [sys.executable, str(HERE / 'fetch-nc-facility-ortho.py'), str(aoi), job['output']]
        result = subprocess.run(command, cwd=HERE.parents[2], text=True, capture_output=True)
        job['command'] = command
        job['stdoutTail'] = result.stdout[-2000:]
        job['stderrTail'] = result.stderr[-2000:]
        if result.returncode == 0:
            job['status'] = 'acquired_native_rgb_nir_v2'
            free = shutil.disk_usage(factory_output).free
            job['freeBytesAfter'] = free
        else:
            job.update(status='acquisition_failed', returncode=result.returncode)
        write_json(report_path, plan)
    return plan


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('catalog', type=Path)
    parser.add_argument('factory_output', type=Path)
    parser.add_argument('report', type=Path)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--reserve-gb', type=float, default=DEFAULT_RESERVE_GB)
    args = parser.parse_args()
    if args.reserve_gb < 1:
        raise ValueError('--reserve-gb must be at least 1')
    facilities = facility_cards(args.catalog)
    aois = {facility['facilityId']: aoi for facility in facilities if (aoi := aoi_for(args.factory_output, facility['facilityId']))}
    service = ortho.source.service_metadata(ortho.source.ANALYSIS)
    ortho.source.validate_service(service, 4)
    plan = build_plan(facilities, aois, args.factory_output, service['extent'])
    write_json(args.report, plan)
    if args.execute:
        plan = execute(plan, args.catalog, args.factory_output, args.report, args.reserve_gb)
    print(json.dumps({
        'jobs': len(plan['jobs']),
        'ready': sum(job['status'] == 'ready_native_rgb_nir_v2' for job in plan['jobs']),
        'acquired': sum(job['status'] == 'acquired_native_rgb_nir_v2' for job in plan['jobs']),
        'blocked': sum(job['status'] not in {'ready_native_rgb_nir_v2', 'acquired_native_rgb_nir_v2'} for job in plan['jobs']),
    }))


if __name__ == '__main__':
    main()
