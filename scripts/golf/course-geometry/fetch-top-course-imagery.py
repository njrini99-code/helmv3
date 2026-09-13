"""Local high-resolution source review for the owner's four-course trial.

Source pixels stay in ignored output, especially WV county view-only imagery.
No tracing permission or geographic accuracy is inferred from pixel size.
"""
import hashlib
import io
import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageStat

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'output/course-geometry/top-course-imagery'
NC = 'https://services.gis.nc.gov/secure/rest/services/Imagery/Orthoimagery_Latest/ImageServer'
VA = 'https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VBMP_Imagery/MostRecentImagery_WGS/MapServer'
WV = 'https://services.wvgis.wvu.edu/arcgis/rest/services/Imagery_BaseMaps_EarthCover/wv_imagery_WVGISTC_leaf_off_mosaic/MapServer'
STUDIES = [
    ('bryan', NC, [-79.7396, 36.1730, -79.7368, 36.1777], .1524, 'NC native six-inch 2022 imagery; capture seamline evidence in top-course-source-audit.json', {}),
    ('cardinal', NC, [-79.9165, 36.1343, -79.9140, 36.1373], .1524, 'NC native six-inch 2022 imagery; capture seamline evidence in top-course-source-audit.json', {}),
    ('winchester', VA, [-78.1478, 39.1655, -78.1450, 39.1695], .3048, 'VBMP native twelve-inch 2022 imagery; tile-index evidence in top-course-source-audit.json', {}),
    ('cacapon', WV, [-78.2952, 39.5145, -78.2927, 39.5191], .1524, 'Morgan 2024 leaf-off; requested GSD is not verified native GSD; view only', {'layers': 'show:992'}),
]


def read(url, limit):
    allowed = {'services.gis.nc.gov', 'vginmaps.vdem.virginia.gov', 'services.wvgis.wvu.edu'}
    if urllib.parse.urlparse(url).hostname not in allowed:
        raise ValueError('Unexpected imagery host')
    with urllib.request.urlopen(url, timeout=40) as response:
        if urllib.parse.urlparse(response.url).hostname not in allowed:
            raise ValueError('Unexpected imagery redirect')
        body = response.read(limit + 1)
    if len(body) > limit:
        raise ValueError('Source response over cap')
    return body


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for key, service, bbox, ground_pixel, description, extra in STUDIES:
        if (OUT / (key + '.png')).exists():
            print(key + ': retained cached export; native GSD remains separately audited', flush=True)
            continue
        w, s, e, n = bbox
        def mercator(lon, lat):
            return 6378137 * math.radians(lon), 6378137 * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
        x0, y0 = mercator(w, s)
        x1, y1 = mercator(e, n)
        projected_pixel = ground_pixel / math.cos(math.radians((s + n) / 2))
        size = [math.ceil((x1-x0) / projected_pixel), math.ceil((y1-y0) / projected_pixel)]
        if max(size) > 4096:
            raise ValueError('Use smaller source crops; never silently lower fidelity')
        params = {'f': 'json', 'bbox': ','.join(map(str, [x0,y0,x1,y1])), 'bboxSR': 3857, 'imageSR': 3857,
                  'size': ','.join(map(str, size)), 'format': 'png', 'transparent': 'false', **extra}
        if service.endswith('ImageServer'):
            params['interpolation'] = 'RSP_NearestNeighbor'
        url = service + ('/exportImage?' if service.endswith('ImageServer') else '/export?') + urllib.parse.urlencode(params)
        try:
            result = json.loads(read(url, 2_000_000))
            if 'error' in result:
                raise ValueError(result['error'])
            pixels = read(result['href'], 32_000_000)
            if not pixels.startswith(b'\x89PNG'):
                raise ValueError('Expected PNG response')
            picture = Image.open(io.BytesIO(pixels)).convert('RGB')
            if picture.size != tuple(size) or max(ImageStat.Stat(picture).stddev) < 2:
                raise ValueError('Blank or rescaled imagery is not accepted as high-fidelity coverage')
            manifest = {'course': key, 'service': service, 'request': params, 'result': result,
                        'requestedGroundPixelM': ground_pixel, 'nativeGsdVerified': key in ('bryan','cardinal','winchester'),
                        'description': description, 'retrievedAt': '2026-09-13',
                        'sha256': hashlib.sha256(pixels).hexdigest(),
                        'distribution': 'Local source inspection only; do not publish imagery or infer tracing rights'}
            (OUT / (key + '.json')).write_text(json.dumps(manifest, indent=2) + '\n')
            (OUT / (key + '.png')).write_bytes(pixels)
            print(key + ': ' + str(size) + ', ' + str(len(pixels)) + ' bytes', flush=True)
        except (OSError, ValueError, KeyError) as error:
            print(key + ': source unavailable: ' + str(error), flush=True)


if __name__ == '__main__':
    main()
