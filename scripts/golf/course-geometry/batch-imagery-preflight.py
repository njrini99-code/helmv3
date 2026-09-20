#!/usr/bin/env python3
"""Record live imagery-service capability for every catalog facility.

This is a source-discovery fan-out. It does not fetch rasters, create vectors,
or alter any physical-world gate.

Usage:
  python3 scripts/golf/course-geometry/batch-imagery-preflight.py \
    course-geometry/catalog output/course-geometry/factory/research/imagery-preflight.json
"""
import argparse
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('imagery_preflight', HERE / 'preflight-imagery-sources.py')
preflight_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight_module)


def read_facilities(catalog_root):
    return [json.loads(path.read_text()) for path in sorted((catalog_root / 'facilities').glob('*.json'))]


def run(facilities, preflight):
    records = []
    for facility in sorted(facilities, key=lambda item: item['facilityId']):
        result = preflight(facility)
        acquisition_candidates = [
            (source.get('provider') or {}).get('id')
            for source in result.get('sources', [])
            if source.get('status') == 'metadata_recorded'
            and (source.get('metadata') or {}).get('acquisitionAllowed') is True
        ]
        records.append({
            'facilityId': facility['facilityId'],
            'region': facility.get('region'),
            'acquisitionCandidates': acquisition_candidates,
            'preflight': result,
        })
    return {
        'schema': 'golfhelm-imagery-preflight-batch-v1',
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'summary': {
            'facilityCount': len(records),
            'withAcquisitionCandidate': sum(bool(record['acquisitionCandidates']) for record in records),
            'withoutAcquisitionCandidate': sum(not record['acquisitionCandidates'] for record in records),
        },
        'facilities': records,
        'rule': ('This document records live provider capability only. It does not admit imagery, vectors, terrain, route, or physical geometry.'),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('catalog', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    document = run(read_facilities(args.catalog), preflight_module.preflight)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps(document['summary']))


if __name__ == '__main__':
    main()
