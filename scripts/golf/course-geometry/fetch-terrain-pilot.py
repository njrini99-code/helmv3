"""Read-only, bounded USGS acquisition for Cacapon 7; no production client.

python3 scripts/golf/course-geometry/fetch-terrain-pilot.py /tmp/golf-terrain-pilot
Reuses a complete cache. Keep it to reproduce the exact accepted raster hash;
the live ImageServer and its OBJECTIDs are not immutable source identifiers.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import HTTPRedirectHandler, build_opener

BASE = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer'
TITLE = 'USGS 1 Meter 17 x73y438 MD_Western_2021_D21'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Unexpected source redirect; inspect manually')


def read(url, limit):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.netloc != 'elevation.nationalmap.gov' or not parsed.path.startswith('/arcgis/rest/'):
        raise ValueError('Source URL outside the fixed USGS allowlist')
    with build_opener(NoRedirect()).open(url, timeout=30) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Source response exceeds pilot cap')
    return data


def request(operation, values):
    payload = json.loads(read(BASE + '/' + operation + '?' + urlencode({'f': 'json', **values}), 2_000_000))
    if 'error' in payload:
        raise ValueError('USGS request failed: ' + str(payload['error']))
    return payload


def main():
    destination = Path(sys.argv[1])
    destination.mkdir(parents=True, exist_ok=True)
    names = ['catalog.json', 'export.json', 'elevation.tiff']
    if all((destination / name).exists() for name in names):
        print('Using complete local terrain cache')
        return
    if any((destination / name).exists() for name in names):
        raise ValueError('Incomplete cache; use a new directory to preserve existing evidence')
    catalog = request('query', {
        'where': 'Category=1', 'geometryType': 'esriGeometryPoint',
        'geometry': json.dumps({'x': -78.294, 'y': 39.517, 'spatialReference': {'wkid': 4326}}),
        'spatialRel': 'esriSpatialRelIntersects', 'returnGeometry': 'false',
        'outFields': 'OBJECTID,Name,title,URL,AcquisitionDate,StartDate,EndDate,Resolution_X,DEM_Type,VerticalDatum',
    })
    selected = next(f['attributes'] for f in catalog['features'] if f['attributes']['title'] == TITLE)
    if selected['OBJECTID'] != 129279 or selected['VerticalDatum'] != 'NAVD88':
        raise ValueError('Catalogue identity changed; source review required before recompiling')
    exported = request('exportImage', {
        'bbox': '-78.2958,39.5140,-78.2922,39.5196', 'bboxSR': 4326, 'imageSR': 4326,
        'size': '256,512', 'format': 'tiff', 'pixelType': 'F32', 'interpolation': 'RSP_BilinearInterpolation',
        'renderingRule': json.dumps({'rasterFunction': 'None'}),
        'mosaicRule': json.dumps({'mosaicMethod': 'esriMosaicLockRaster', 'lockRasterIds': [129279]}),
    })
    if exported['width'] != 256 or exported['height'] != 512:
        raise ValueError('Unexpected raster dimensions')
    raster = read(exported['href'], 2_000_000)
    exported['retrievedAt'] = datetime.now(timezone.utc).date().isoformat()
    (destination / 'catalog.json').write_text(json.dumps(catalog, indent=2) + '\n')
    (destination / 'export.json').write_text(json.dumps(exported, indent=2) + '\n')
    (destination / 'elevation.tiff').write_bytes(raster)
    print(f'Cached bounded USGS source: {len(raster)} bytes')


if __name__ == '__main__':
    main()
