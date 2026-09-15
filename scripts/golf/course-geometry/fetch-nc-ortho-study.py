"""Acquire one Cardinal study orthophoto without losing native NC OneMap GSD.

The analysis service is tried first because it advertises four 6-inch bands.
Some areas legitimately return a transparent analysis raster.  In that case
this tool records the rejected attempt and uses the matching 3-band visual
service only as a *visual-review* source; it never describes it as NIR or as
an analysis raster.

The output is an immutable local study cache.  It is not a licence to publish
the imagery, trace it into a playable hole, or bind the unassigned Cardinal
green complex to a recorded round.
"""
import argparse
import hashlib
import io
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import HTTPRedirectHandler, build_opener

import pyproj
from PIL import Image, ImageStat

ROOT = Path(__file__).resolve().parents[3]
ANALYSIS = 'https://services.nconemap.gov/secure/rest/services/Imagery/Orthoimagery_Latest_Analysis/ImageServer'
VISUAL = 'https://services.nconemap.gov/secure/rest/services/Imagery/Orthoimagery_Latest/ImageServer'
HOST = 'services.nconemap.gov'
EXPORT_PREFIX = '/secure/rest/directories/arcgisoutput/Imagery/'
SOURCE_CRS = 'EPSG:6543'  # NAD83(2011) / North Carolina (ftUS)
US_SURVEY_FOOT_TO_METERS = 0.3048006096012192
NATIVE_PIXEL_US_FEET = 0.5
MAX_PIXELS = 4_000_000


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Unexpected NC OneMap redirect; source review required')


def canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n')


def file_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(url, limit):
    parsed = urlparse(url)
    allowed = parsed.scheme == 'https' and parsed.netloc == HOST and (
        '/ImageServer' in parsed.path or parsed.path.startswith(EXPORT_PREFIX))
    if not allowed:
        raise ValueError('Source URL is outside the NC OneMap imagery allowlist')
    with build_opener(NoRedirect()).open(url, timeout=60) as response:
        body = response.read(limit + 1)
    if len(body) > limit:
        raise ValueError('Source response exceeds the bounded imagery cap')
    return body


def service_metadata(base):
    payload = json.loads(read(base + '?f=pjson', 2_000_000))
    if 'error' in payload:
        raise ValueError('NC OneMap metadata request failed: ' + str(payload['error']))
    return payload


def validate_service(service, expected_bands):
    if service.get('pixelType') != 'U8' or service.get('bandCount') != expected_bands:
        raise ValueError('NC OneMap imagery band/pixel contract changed; source review required')
    if not math.isclose(float(service.get('pixelSizeX', 0)), NATIVE_PIXEL_US_FEET, abs_tol=1e-9) or not math.isclose(float(service.get('pixelSizeY', 0)), NATIVE_PIXEL_US_FEET, abs_tol=1e-9):
        raise ValueError('NC OneMap native six-inch grid changed; source review required')
    if service.get('spatialReference', {}).get('latestWkid') != 6543:
        raise ValueError('NC OneMap imagery CRS changed; source review required')


def points(value):
    if isinstance(value[0], (float, int)):
        yield value
    else:
        for child in value:
            yield from points(child)


def study_bounds(package, key, padding_m):
    study = next((item for item in package['holes'] if item['key'] == key), None)
    if study is None:
        raise ValueError('Unknown physical study key: ' + key)
    features = {item['id']: item for item in package['features']}
    selected = [features[item] for item in study['featureIds'] if features[item]['kind'] != 'woods']
    if not selected:
        raise ValueError('Study has no bounded source features')
    coords = [point for feature in selected for point in points(feature['geometryWgs84']['coordinates'])]
    transformer = pyproj.Transformer.from_crs(4326, SOURCE_CRS, always_xy=True)
    xs, ys = transformer.transform([point[0] for point in coords], [point[1] for point in coords])
    padding_ft = padding_m / US_SURVEY_FOOT_TO_METERS
    return min(xs) - padding_ft, min(ys) - padding_ft, max(xs) + padding_ft, max(ys) + padding_ft


def native_grid_bounds(bounds, extent, cell=NATIVE_PIXEL_US_FEET):
    if not math.isclose(cell, NATIVE_PIXEL_US_FEET, abs_tol=1e-9):
        raise ValueError('Native six-inch cell changed; source review required')
    origin_x, origin_y = float(extent['xmin']), float(extent['ymin'])
    west, south, east, north = bounds
    left = origin_x + math.floor((west - origin_x) / cell) * cell
    bottom = origin_y + math.floor((south - origin_y) / cell) * cell
    right = origin_x + math.ceil((east - origin_x) / cell) * cell
    top = origin_y + math.ceil((north - origin_y) / cell) * cell
    size = [round((right - left) / cell), round((top - bottom) / cell)]
    if min(size) <= 1 or size[0] * size[1] > MAX_PIXELS:
        raise ValueError('Native-resolution request violates the imagery pixel cap')
    return [left, bottom, right, top], size


def export(base, bounds, size):
    values = {
        'f': 'json', 'bbox': ','.join(map(str, bounds)), 'bboxSR': 6543,
        'imageSR': 6543, 'size': ','.join(map(str, size)), 'format': 'png32',
        'pixelType': 'U8', 'interpolation': 'RSP_NearestNeighbor',
    }
    payload = json.loads(read(base + '/exportImage?' + urlencode(values), 2_000_000))
    if 'error' in payload:
        raise ValueError('NC OneMap export failed: ' + str(payload['error']))
    if [payload.get('width'), payload.get('height')] != size:
        raise ValueError('Export dimensions changed; native GSD was not preserved')
    actual = payload.get('extent', {})
    for field, expected in zip(('xmin', 'ymin', 'xmax', 'ymax'), bounds):
        if not math.isclose(float(actual.get(field, float('nan'))), expected, abs_tol=1e-6):
            raise ValueError('Export extent changed; source alignment requires review')
    pixels = read(payload['href'], 40_000_000)
    image = Image.open(io.BytesIO(pixels)).convert('RGBA')
    if image.size != tuple(size):
        raise ValueError('Raster dimensions differ from the source export metadata')
    rgb = image.convert('RGB')
    alpha = image.getchannel('A')
    quality = {
        'dimensions': list(image.size),
        'rgbStdDev': [round(value, 5) for value in ImageStat.Stat(rgb).stddev],
        'alphaExtrema': list(alpha.getextrema()),
        'nonTransparent': alpha.getbbox() is not None,
    }
    usable = quality['nonTransparent'] and max(quality['rgbStdDev']) >= 2
    return payload, pixels, quality, usable


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    parser.add_argument('study_key')
    parser.add_argument('output', type=Path)
    parser.add_argument('--padding-m', type=float, default=80)
    args = parser.parse_args()
    if not math.isfinite(args.padding_m) or not 0 <= args.padding_m <= 500:
        raise ValueError('Padding must be finite and between 0 and 500 metres')
    names = ['analysis-service.json', 'visual-service.json', 'analysis-export.json', 'visual-export.json', 'ortho.png', 'source-manifest.json', 'imagery-quality.json']
    existing = [(args.output / name).exists() for name in names]
    if all(existing):
        print('Using immutable NC OneMap orthophoto cache')
        return
    if any(existing):
        raise ValueError('Incomplete source cache; preserve evidence and choose a new output directory')

    package = json.loads(args.package.read_text())
    analysis = service_metadata(ANALYSIS)
    visual = service_metadata(VISUAL)
    validate_service(analysis, 4)
    validate_service(visual, 3)
    requested = study_bounds(package, args.study_key, args.padding_m)
    bounds, size = native_grid_bounds(requested, analysis['extent'], float(analysis['pixelSizeX']))
    analysis_export, analysis_pixels, analysis_quality, analysis_usable = export(ANALYSIS, bounds, size)
    visual_export, visual_pixels, visual_quality, visual_usable = export(VISUAL, bounds, size)
    if not visual_usable:
        raise ValueError('Both NC OneMap analysis and visual exports failed the imagery quality gate')
    selected = 'analysis' if analysis_usable else 'visual'
    selected_pixels = analysis_pixels if analysis_usable else visual_pixels
    args.output.mkdir(parents=True, exist_ok=True)
    retrieved = datetime.now(timezone.utc).isoformat()
    write_json(args.output / 'analysis-service.json', analysis)
    write_json(args.output / 'visual-service.json', visual)
    write_json(args.output / 'analysis-export.json', analysis_export)
    write_json(args.output / 'visual-export.json', visual_export)
    (args.output / 'ortho.png').write_bytes(selected_pixels)
    quality = {
        'schemaVersion': 1, 'qualityGate': 'native_grid_nearest_neighbour_v1',
        'requestedBoundsNativeUSFeet': bounds, 'requestedPixels': size,
        'nativeGsdMeters': NATIVE_PIXEL_US_FEET * US_SURVEY_FOOT_TO_METERS,
        'actualGsdMeters': NATIVE_PIXEL_US_FEET * US_SURVEY_FOOT_TO_METERS,
        'analysis': {**analysis_quality, 'passed': analysis_usable, 'bands': 4},
        'visual': {**visual_quality, 'passed': visual_usable, 'bands': 3},
        'selected': selected,
        'reason': 'Analysis raster passed native-quality gate' if analysis_usable else 'Analysis raster was transparent; selected valid visual-only fallback',
    }
    write_json(args.output / 'imagery-quality.json', quality)
    manifest = {
        'schemaVersion': 1, 'provider': 'NC OneMap', 'physicalStudyKey': args.study_key,
        'packageHash': package['contentHash'], 'retrievedAt': retrieved,
        'selectedService': ANALYSIS if analysis_usable else VISUAL,
        'selectedKind': 'analysis_rgb_nir' if analysis_usable else 'visual_rgb_only',
        'analysisService': ANALYSIS, 'analysisStatus': 'usable' if analysis_usable else 'rejected_transparent_raster',
        'visualService': VISUAL, 'sourceCrs': SOURCE_CRS,
        'nativePixelUSFeet': NATIVE_PIXEL_US_FEET,
        'nativeResolutionM': NATIVE_PIXEL_US_FEET * US_SURVEY_FOOT_TO_METERS,
        'requestedPaddingM': args.padding_m,
        'licenseStatus': 'NC OneMap service copyright retained; redistribution/tracing rights require separate review',
        'attribution': 'NC OneMap, NC Center for Geographic Information and Analysis, NC 911 Board',
        'fileHashes': {name: file_hash(args.output / name) for name in names[:-2]},
    }
    write_json(args.output / 'source-manifest.json', manifest)
    print(canonical_json({'study': args.study_key, 'pixels': size, 'selected': selected, 'nativeResolutionM': manifest['nativeResolutionM']}))


if __name__ == '__main__':
    main()
