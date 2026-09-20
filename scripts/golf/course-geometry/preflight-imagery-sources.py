#!/usr/bin/env python3
"""Record live public-imagery service capabilities before source acquisition.

The preflight deliberately does *not* download a raster. It answers whether a
facility policy has a service that can be considered for extraction and
records its current metadata. A later acquisition must still query the
course AOI, calculate native output dimensions, retain the GeoTIFF and pass
the imagery-quality gate.

Usage:
  python3 scripts/golf/course-geometry/preflight-imagery-sources.py \\
    course-geometry/catalog/facilities/denison-golf-club.json out.json
"""
import argparse
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from factory.source_registry import IMAGERY_PROVIDERS, provider_document  # noqa: E402

MAX_BYTES = 2_000_000
USER_AGENT = 'GolfHelm course-geometry imagery preflight'


def metadata_url(provider):
    if provider.service_type == 'arcgis_image_server':
        return provider.service_url + '?f=pjson'
    if provider.service_type == 'arcgis_map_server':
        return provider.service_url + '?f=pjson'
    return None


def read_json(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https':
        raise ValueError('public imagery source must use HTTPS')
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('source metadata exceeds the fixed response budget')
    return json.loads(raw)


def service_contract(provider, metadata):
    bands = metadata.get('bandCount')
    return {
        'name': metadata.get('name'),
        'description': (metadata.get('description') or '')[:2000],
        'copyright': metadata.get('copyrightText'),
        'capabilities': metadata.get('capabilities'),
        'spatialReference': metadata.get('spatialReference'),
        'pixelSize': [metadata.get('pixelSizeX'), metadata.get('pixelSizeY')],
        'bandCount': bands,
        'role': provider.role,
        'acquisitionAllowed': provider.role == 'feature_extraction' and provider.service_type == 'arcgis_image_server',
        'requiresNativeGsdCheck': True,
        'requiresCourseItemQuery': provider.service_type == 'arcgis_image_server',
        'requiresLicenseReview': provider.role != 'feature_extraction',
    }


def preflight(facility):
    results = []
    for provider_id in (facility.get('providerPolicy') or {}).get('imagery') or []:
        provider = IMAGERY_PROVIDERS.get(provider_id)
        if provider is None:
            results.append({'providerId': provider_id, 'status': 'unknown_provider_policy'})
            continue
        url = metadata_url(provider)
        entry = {'provider': provider_document(provider_id)}
        if url is None:
            entry.update(status='discovery_required',
                         reason='The policy points at documentation, not a reproducible image export endpoint.')
            results.append(entry)
            continue
        try:
            metadata = read_json(url)
            entry.update(status='metadata_recorded', metadata=service_contract(provider, metadata))
        except Exception as error:  # recorded evidence, never silently fall back
            entry.update(status='metadata_unavailable', error=f'{type(error).__name__}: {str(error)[:300]}')
        results.append(entry)
    return {
        'schema': 'golfhelm-imagery-source-preflight-v1',
        'facilityId': facility['facilityId'],
        'region': facility['region'],
        'preflightAt': datetime.now(timezone.utc).isoformat(),
        'policy': list((facility.get('providerPolicy') or {}).get('imagery') or []),
        'sources': results,
        'rule': ('A metadata result is source-discovery evidence only. Feature extraction requires an AOI item query, a native-resolution '
                 'GeoTIFF export, hash/provenance retention, and the separate imagery-quality gate.'),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('facility', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    facility = json.loads(args.facility.read_text())
    document = preflight(facility)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, indent=2) + '\n')
    print(json.dumps({'facilityId': document['facilityId'], 'sources': [(s.get('provider') or {}).get('id', s.get('providerId')) for s in document['sources']]}))


if __name__ == '__main__':
    main()
