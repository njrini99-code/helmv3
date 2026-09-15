"""Fetch one bounded, native-grid NC OneMap DEM03 terrain study.

Usage:
  python3 scripts/golf/course-geometry/fetch-nc-lidar-study.py \
    src/test/fixtures/course-geometry/cardinal-study.json \
    cardinal-green-study output/course-geometry/cardinal-lidar

DEM03 is a LiDAR-derived bare-earth elevation service.  Its horizontal and
vertical values are US survey feet, so this script retains the raw F32 TIFF
and writes the one authoritative feet-to-meters conversion into an immutable
manifest.  It is a source-acquisition tool only: it never publishes a course,
binds an unreviewed study to a played hole, or invents terrain where the
service reports no data.
"""
import argparse
import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import HTTPRedirectHandler, build_opener

import pyproj

BASE = 'https://services.nconemap.gov/secure/rest/services/Elevation/DEM03/ImageServer'
SOURCE_HOST = 'services.nconemap.gov'
SOURCE_PATH = '/secure/rest/services/Elevation/DEM03/ImageServer'
EXPORT_PATH = '/secure/rest/directories/arcgisoutput/Elevation/DEM03_ImageServer/'
SOURCE_CRS = 'EPSG:2264'  # NAD83(2011) / North Carolina (ftUS)
US_SURVEY_FOOT_TO_METERS = 0.3048006096012192
NATIVE_PIXEL_US_FEET = 3.125
DEFAULT_PADDING_M = 80
MAX_PIXELS = 2_000_000


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Unexpected source redirect; inspect manually')


def read(url, limit):
    parsed = urlparse(url)
    allowed = (
        parsed.scheme == 'https'
        and parsed.netloc == SOURCE_HOST
        and (parsed.path == SOURCE_PATH or parsed.path.startswith(SOURCE_PATH + '/') or parsed.path.startswith(EXPORT_PATH))
    )
    if not allowed:
        raise ValueError('Source URL outside the NC OneMap DEM03 allowlist')
    with build_opener(NoRedirect()).open(url, timeout=30) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Source response exceeds bounded acquisition cap')
    return data


def request(operation, values):
    payload = json.loads(read(BASE + '/' + operation + '?' + urlencode({'f': 'json', **values}), 2_000_000))
    if 'error' in payload:
        raise ValueError('NC OneMap DEM03 request failed: ' + str(payload['error']))
    return payload


def points(value):
    if isinstance(value[0], (float, int)):
        yield value
    else:
        for child in value:
            yield from points(child)


def study_bounds_wgs84(package, key, padding_m):
    hole = next((item for item in package['holes'] if item['key'] == key), None)
    if hole is None:
        raise ValueError('Unknown physical study key: ' + key)
    features = {item['id']: item for item in package['features']}
    selected = [features[feature_id] for feature_id in hole['featureIds'] if features[feature_id]['kind'] != 'woods']
    if not selected:
        raise ValueError('Study has no bounded non-wooded source features')
    coords = [point for feature in selected for point in points(feature['geometryWgs84']['coordinates'])]
    transformer = pyproj.Transformer.from_crs(4326, SOURCE_CRS, always_xy=True)
    xs, ys = transformer.transform([point[0] for point in coords], [point[1] for point in coords])
    pad = padding_m / US_SURVEY_FOOT_TO_METERS
    return min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad


def native_grid_bounds(bounds, source_extent, native_pixel_us_feet=NATIVE_PIXEL_US_FEET):
    """Expand bounds to the service's own grid; never resize to an arbitrary output."""
    if not math.isclose(native_pixel_us_feet, NATIVE_PIXEL_US_FEET, rel_tol=0, abs_tol=1e-9):
        raise ValueError('DEM03 native cell size changed; source review required')
    origin_x, origin_y = source_extent['xmin'], source_extent['ymin']
    west, south, east, north = bounds
    left = origin_x + math.floor((west - origin_x) / native_pixel_us_feet) * native_pixel_us_feet
    bottom = origin_y + math.floor((south - origin_y) / native_pixel_us_feet) * native_pixel_us_feet
    right = origin_x + math.ceil((east - origin_x) / native_pixel_us_feet) * native_pixel_us_feet
    top = origin_y + math.ceil((north - origin_y) / native_pixel_us_feet) * native_pixel_us_feet
    width, height = round((right - left) / native_pixel_us_feet), round((top - bottom) / native_pixel_us_feet)
    if width <= 1 or height <= 1 or width * height > MAX_PIXELS:
        raise ValueError('Native-grid source request violates the fixed acquisition pixel cap')
    return [left, bottom, right, top], [width, height]


def canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def file_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n')


def validate_service(service):
    if service.get('pixelType') != 'F32' or service.get('serviceDataType') != 'esriImageServiceDataTypeElevation':
        raise ValueError('DEM03 service type changed; source review required')
    if not math.isclose(float(service.get('pixelSizeX', 0)), NATIVE_PIXEL_US_FEET, abs_tol=1e-9) or not math.isclose(float(service.get('pixelSizeY', 0)), NATIVE_PIXEL_US_FEET, abs_tol=1e-9):
        raise ValueError('DEM03 native raster resolution changed; source review required')
    if 'Foot_US' not in service.get('spatialReference', {}).get('wkt', ''):
        raise ValueError('DEM03 source CRS no longer reports US survey feet')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    parser.add_argument('study_key')
    parser.add_argument('output', type=Path)
    parser.add_argument('--padding-m', type=float, default=DEFAULT_PADDING_M)
    args = parser.parse_args()
    if not math.isfinite(args.padding_m) or args.padding_m < 0 or args.padding_m > 500:
        raise ValueError('Padding must be finite and between 0 and 500 meters')

    names = ['service.json', 'export.json', 'elevation.tiff', 'source-manifest.json']
    existing = [(args.output / name).exists() for name in names]
    if all(existing):
        manifest = json.loads((args.output / 'source-manifest.json').read_text())
        package = json.loads(args.package.read_text())
        if manifest['packageHash'] != package['contentHash'] or manifest['physicalStudyKey'] != args.study_key:
            raise ValueError('Immutable source cache belongs to another package/study; choose a new directory')
        if any(file_hash(args.output / name) != manifest['fileHashes'][name] for name in names[:-1]):
            raise ValueError('Immutable source cache hash mismatch')
        print('Using immutable NC OneMap DEM03 cache')
        return
    if any(existing):
        raise ValueError('Incomplete source cache; preserve evidence and choose another directory')

    package = json.loads(args.package.read_text())
    requested = study_bounds_wgs84(package, args.study_key, args.padding_m)
    service = json.loads(read(BASE + '?f=json', 2_000_000))
    validate_service(service)
    bounds, size = native_grid_bounds(requested, service['extent'], float(service['pixelSizeX']))
    exported = request('exportImage', {
        'bbox': ','.join(map(str, bounds)), 'bboxSR': 2264, 'imageSR': 2264,
        'size': ','.join(map(str, size)), 'format': 'tiff', 'pixelType': 'F32',
        'interpolation': 'RSP_BilinearInterpolation', 'renderingRule': json.dumps({'rasterFunction': 'None'}),
    })
    if [exported.get('width'), exported.get('height')] != size:
        raise ValueError('Export dimensions changed; source resampling requires review')
    actual = exported.get('extent', {})
    if any(not math.isclose(float(actual[field]), expected, abs_tol=1e-6) for field, expected in zip(('xmin', 'ymin', 'xmax', 'ymax'), bounds)):
        raise ValueError('Export extent changed; native-grid alignment requires review')
    raster = read(exported['href'], 40_000_000)

    args.output.mkdir(parents=True, exist_ok=True)
    retrieved = datetime.now(timezone.utc).date().isoformat()
    exported.update(retrievedAt=retrieved, requestedNativeBoundsUSFeet=bounds, sourceCrs=SOURCE_CRS)
    write_json(args.output / 'service.json', service)
    write_json(args.output / 'export.json', exported)
    (args.output / 'elevation.tiff').write_bytes(raster)
    manifest = {
        'schemaVersion': 1,
        'provider': 'NC OneMap',
        'title': 'NC OneMap DEM03',
        'derivation': 'LiDAR-derived bare-earth elevation service',
        'sourceEndpoint': BASE,
        'licenseUrl': None,
        'licenseStatus': 'not supplied by the DEM03 service metadata; review before redistribution',
        'packageHash': package['contentHash'],
        'physicalStudyKey': args.study_key,
        'requestedPaddingM': args.padding_m,
        'requestedBoundsNativeUSFeet': bounds,
        'horizontalExportCrs': SOURCE_CRS,
        'nativePixelUSFeet': NATIVE_PIXEL_US_FEET,
        'nativeResolutionM': NATIVE_PIXEL_US_FEET * US_SURVEY_FOOT_TO_METERS,
        'exportPixelNativeUnits': [NATIVE_PIXEL_US_FEET, NATIVE_PIXEL_US_FEET],
        'exportPixelM': [NATIVE_PIXEL_US_FEET * US_SURVEY_FOOT_TO_METERS] * 2,
        'rawVerticalUnit': 'US survey foot',
        'verticalUnitToMeters': US_SURVEY_FOOT_TO_METERS,
        'verticalDatum': None,
        'verticalDatumStatus': 'not verified from DEM03 service metadata; never infer NAVD88',
        'retrievedAt': retrieved,
        'sourceSelection': 'bounded_native_grid_single_service_export',
        'fileHashes': {name: file_hash(args.output / name) for name in names[:-1]},
    }
    write_json(args.output / 'source-manifest.json', manifest)
    print(canonical_json({'study': args.study_key, 'pixels': size, 'nativeResolutionM': manifest['nativeResolutionM'], 'bytes': len(raster)}))


if __name__ == '__main__':
    main()
