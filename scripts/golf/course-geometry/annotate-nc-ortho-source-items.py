#!/usr/bin/env python3
"""Record NC OneMap mosaic-item provenance for a v2 native imagery cache.

This is a metadata sidecar generator. It samples the ImageServer catalog at
one native-grid centre point per already-verified tile and records the item
that covers the requested six-inch pixel size. It does not alter the imagery
cache or create course geometry. A centre sample is deliberately labeled as
such; it is source identification evidence, not a proof that one item covers
every pixel in a tile.

Usage:
  python3 scripts/golf/course-geometry/annotate-nc-ortho-source-items.py \
    output/.../native-ortho-nir-v2/index.json output/.../source-items-v1
"""
import argparse
import hashlib
import importlib.util
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode


HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('nc_ortho_source', HERE / 'fetch-nc-ortho-study.py')
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def write_json(path, document):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, indent=2, ensure_ascii=False) + '\n')


def utc_date(value):
    if not isinstance(value, (int, float)):
        return None
    return datetime.fromtimestamp(value / 1000, timezone.utc).isoformat().replace('+00:00', 'Z')


def item_record(attributes):
    return {
        'objectid': attributes.get('objectid'),
        'name': attributes.get('name'),
        'lowps': attributes.get('lowps'),
        'highps': attributes.get('highps'),
        'catalogDate': utc_date(attributes.get('date')),
        'catalogDateRawMs': attributes.get('date'),
    }


def select_native_item(features, native_pixel_us_feet):
    """Select only an unambiguous catalog item that serves the native grid."""
    candidates = []
    for feature in features or []:
        attributes = feature.get('attributes') or {}
        low, high = attributes.get('lowps'), attributes.get('highps')
        if isinstance(low, (int, float)) and isinstance(high, (int, float)) and low <= native_pixel_us_feet <= high:
            candidates.append(item_record(attributes))
    candidates.sort(key=lambda item: (str(item['objectid']), str(item['name'])))
    if len(candidates) == 1:
        return {'status': 'one_native_resolution_catalog_item', 'item': candidates[0], 'candidates': candidates}
    if not candidates:
        return {'status': 'no_native_resolution_catalog_item', 'item': None, 'candidates': []}
    return {'status': 'ambiguous_native_resolution_catalog_items', 'item': None, 'candidates': candidates}


def sample_point(tile):
    west, south, east, north = tile['boundsNativeUSFeet']
    return [(west + east) / 2, (south + north) / 2]


def identify(point, analysis_service):
    values = {
        'f': 'json', 'geometry': ','.join(map(str, point)),
        'geometryType': 'esriGeometryPoint', 'geometryPrecision': '8',
        'returnGeometry': 'false', 'returnCatalogItems': 'true',
        'returnPixelValues': 'false', 'mosaicRule': '{}',
    }
    last_error = None
    for attempt in range(4):
        try:
            response = json.loads(source.read(analysis_service + '/identify?' + urlencode(values), 2_000_000))
            if 'error' in response:
                raise ValueError('NC OneMap identify failed: ' + str(response['error']))
            return response
        except (OSError, ValueError, json.JSONDecodeError) as error:
            last_error = error
            if attempt < 3:
                time.sleep(1 << attempt)
    raise ValueError(f'NC OneMap identify did not complete after 4 attempts: {last_error}')


def validate_index(index):
    if index.get('schema') != 'golfhelm-facility-native-ortho-index-v2':
        raise ValueError('source item annotation requires the separate RGB+NIR v2 imagery index')
    if not index.get('complete'):
        raise ValueError('source item annotation requires a complete imagery index')
    quality = index.get('qualitySummary') or {}
    if quality.get('passedTiles') != index.get('tileCountPlanned') or quality.get('failedTileKeys'):
        raise ValueError('source item annotation requires all indexed RGB+NIR tiles to pass quality')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('index', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    index_bytes = args.index.read_bytes()
    index = json.loads(index_bytes)
    validate_index(index)
    output = args.output / 'source-items.json'
    if output.exists():
        existing = json.loads(output.read_text())
        if existing.get('inputIndexSha256') == hashlib.sha256(index_bytes).hexdigest() and existing.get('complete'):
            print(canonical({'status': 'cached', 'tiles': len(existing.get('tiles') or [])}))
            return
        raise ValueError('source-item metadata directory is incomplete or names a different imagery index; choose a new output directory')
    records = []
    for tile in index['tiles']:
        point = sample_point(tile)
        analysis_service = ((tile.get('quality') or {}).get('analysisService') or source.ANALYSIS)
        response = identify(point, analysis_service)
        chosen = select_native_item((response.get('catalogItems') or {}).get('features') or [], source.NATIVE_PIXEL_US_FEET)
        method = 'ImageServer identify at tile centre; point sample only'
        response_hash = hashlib.sha256(canonical(response).encode()).hexdigest()
        records.append({
            'tileKey': tile['key'], 'samplePointNativeUSFeet': point,
            'analysisService': analysis_service,
            'analysisSourceId': (tile.get('quality') or {}).get('analysisSourceId'),
            'method': method,
            'sourceResponseSha256': response_hash,
            **chosen,
        })
        print(canonical({'tile': tile['key'], 'status': chosen['status']}), flush=True)
    document = {
        'schema': 'golfhelm-nc-ortho-source-items-v1',
        'inputIndex': str(args.index),
        'inputIndexSha256': hashlib.sha256(index_bytes).hexdigest(),
        'facilityId': index['facilityId'],
        'nativePixelUSFeet': source.NATIVE_PIXEL_US_FEET,
        'nativeGsdMeters': index['sourceGsdMeters'],
        'source': {
            'provider': 'NC OneMap',
            'analysisServices': sorted({record['analysisService'] for record in records}),
        },
        'sampleMethod': 'one centre-point ImageServer catalog identify per native imagery tile',
        'sourceDateMeaning': 'catalogDate comes from the ImageServer mosaic item. It is retained as catalog metadata and is not asserted to be the aerial flight date.',
        'tiles': records,
        'complete': all(record['status'] == 'one_native_resolution_catalog_item' for record in records),
        'rule': 'This metadata sidecar identifies rendered source pixels. It does not establish feature boundaries, physical measurements, or hole ownership.',
    }
    write_json(output, document)
    print(canonical({'status': 'complete' if document['complete'] else 'review_required', 'tiles': len(records)}))


if __name__ == '__main__':
    main()
