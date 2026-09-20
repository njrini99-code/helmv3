#!/usr/bin/env python3
"""Acquire source-backed four-band USGS NAIP Plus facility imagery.

This is a national public fallback for facilities without a stronger,
reproducible regional adapter. It retains exported GeoTIFF pixels, the selected
catalog item, the actual item resolution and acquisition date. It does not
create feature geometry; downstream extraction/review decides whether a
boundary is admissible.

The service mosaic is reprojected into a local UTM request frame. Its original
source pixel-grid origin is not exposed by the ImageServer, so the index calls
this `reprojected_native_density`, never raw-native-grid alignment.

Usage:
  python3 scripts/golf/course-geometry/fetch-usgs-naip-facility-ortho.py \
    output/.../aoi.json output/.../naip-plus-v1
"""
import argparse
import hashlib
import io
import json
import math
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pyproj
from PIL import Image, ImageStat

SERVICE = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer'
USER_AGENT = 'GolfHelm course-geometry NAIP Plus acquisition'
DEFAULT_TILE_M = 280.0
MAX_FACILITY_TILES = 128
MAX_PIXELS_PER_EXPORT = 4_000_000
RASTER_READ_ATTEMPTS = 3
TILE_ARTIFACTS = ('export.json', 'item.json', 'ortho.tif', 'preview.png', 'imagery-quality.json')


def write_json(path, document):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, indent=2, ensure_ascii=False) + '\n')


def read_bytes(url, limit):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https':
        raise ValueError('USGS NAIP Plus requests must use HTTPS')
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=90) as response:
        content = response.read(limit + 1)
    if len(content) > limit:
        raise ValueError(f'response exceeds fixed {limit}-byte budget')
    return content


def read_json(url, limit=2_000_000):
    return json.loads(read_bytes(url, limit))


def service_metadata():
    return read_json(SERVICE + '?f=pjson')


def service_wkid(metadata):
    spatial_ref = metadata.get('spatialReference') or {}
    wkid = spatial_ref.get('latestWkid') or spatial_ref.get('wkid')
    if not isinstance(wkid, int):
        raise ValueError('NAIP Plus service lacks a usable spatial-reference WKID')
    return wkid


def local_utm_wkid(aoi):
    west, _south, east, _north = aoi['bboxWgs84']
    longitude = (float(west) + float(east)) / 2
    zone = int(math.floor((longitude + 180) / 6) + 1)
    if not 1 <= zone <= 60:
        raise ValueError('AOI longitude cannot select a UTM zone')
    # The catalog only uses contiguous-US courses, where NAD83 UTM is the
    # appropriate local metre frame. The exact selected item CRS remains in
    # source provenance for audit rather than being assumed from this export.
    return 26900 + zone


def aoi_bounds(aoi, target_wkid):
    west, south, east, north = aoi['bboxWgs84']
    transformer = pyproj.Transformer.from_crs(4326, target_wkid, always_xy=True)
    xs, ys = transformer.transform([west, east, east, west], [south, south, north, north])
    return min(xs), min(ys), max(xs), max(ys)


def native_tiles(bounds, resolution_m, tile_m):
    if not math.isfinite(resolution_m) or resolution_m <= 0:
        raise ValueError('source item must have a positive resolution in metres')
    if not math.isfinite(tile_m) or not 50 <= tile_m <= 300:
        raise ValueError('tile width must be finite and between 50 and 300 metres')
    cells_per_tile = max(1, int(math.floor(tile_m / resolution_m)))
    west, south, east, north = bounds
    # Snap to the requested source density. This preserves density through the
    # ImageServer reprojection but does not assert the hidden raw source grid.
    snapped = [
        math.floor(west / resolution_m) * resolution_m,
        math.floor(south / resolution_m) * resolution_m,
        math.ceil(east / resolution_m) * resolution_m,
        math.ceil(north / resolution_m) * resolution_m,
    ]
    width_cells = int(round((snapped[2] - snapped[0]) / resolution_m))
    height_cells = int(round((snapped[3] - snapped[1]) / resolution_m))
    tiles = []
    for row, bottom in enumerate(range(0, height_cells, cells_per_tile)):
        for column, left in enumerate(range(0, width_cells, cells_per_tile)):
            cells_w = min(cells_per_tile, width_cells - left)
            cells_h = min(cells_per_tile, height_cells - bottom)
            if cells_w * cells_h > MAX_PIXELS_PER_EXPORT:
                raise ValueError('one requested NAIP Plus tile exceeds the fixed pixel budget')
            tile_bounds = [
                snapped[0] + left * resolution_m,
                snapped[1] + bottom * resolution_m,
                snapped[0] + (left + cells_w) * resolution_m,
                snapped[1] + (bottom + cells_h) * resolution_m,
            ]
            tiles.append({
                'key': f'r{row:02d}-c{column:02d}',
                'row': row,
                'column': column,
                'boundsLocalMeters': tile_bounds,
                'pixels': [cells_w, cells_h],
            })
    if len(tiles) > MAX_FACILITY_TILES:
        raise ValueError(f'facility needs {len(tiles)} NAIP Plus tiles, above fixed cap {MAX_FACILITY_TILES}; reduce AOI before acquisition')
    return tiles


def identify(lon, lat, service_wkid_value):
    transformer = pyproj.Transformer.from_crs(4326, service_wkid_value, always_xy=True)
    x, y = transformer.transform(lon, lat)
    values = {
        'f': 'json', 'geometry': f'{x},{y}', 'geometryType': 'esriGeometryPoint',
        'sr': service_wkid_value, 'returnCatalogItems': 'true',
        'returnGeometry': 'false', 'returnPixelValues': 'false',
    }
    return read_json(SERVICE + '/identify?' + urllib.parse.urlencode(values))


def select_native_catalog_item(payload):
    features = ((payload.get('catalogItems') or {}).get('features') or [])
    candidates = []
    for feature in features:
        attrs = feature.get('attributes') or {}
        resolution = attrs.get('resolution_value')
        bands = attrs.get('band_count')
        if attrs.get('Category') != 1 or not isinstance(resolution, (int, float)) or resolution <= 0:
            continue
        if not isinstance(bands, (int, float)) or bands < 4:
            continue
        candidates.append(attrs)
    if not candidates:
        raise ValueError('no four-band source catalog item covers this tile')
    density = min(float(item['resolution_value']) for item in candidates)
    best = [item for item in candidates if math.isclose(float(item['resolution_value']), density, abs_tol=1e-9)]
    if len(best) != 1:
        raise ValueError('ambiguous highest-density four-band source catalog items require review')
    return best[0]


def centre_wgs84(tile, target_wkid):
    west, south, east, north = tile['boundsLocalMeters']
    transformer = pyproj.Transformer.from_crs(target_wkid, 4326, always_xy=True)
    return transformer.transform((west + east) / 2, (south + north) / 2)


def read_tiff_with_retry(url):
    last_error = None
    for _attempt in range(RASTER_READ_ATTEMPTS):
        try:
            pixels = read_bytes(url, 45_000_000)
            image = Image.open(io.BytesIO(pixels))
            image.load()
            return pixels, image
        except (OSError, ValueError) as error:
            last_error = error
    raise ValueError(f'NAIP Plus TIFF did not decode after {RASTER_READ_ATTEMPTS} attempts: {last_error}')


def validate_export(payload, bounds, pixels):
    if 'error' in payload:
        raise ValueError('NAIP Plus export failed: ' + str(payload['error']))
    if [payload.get('width'), payload.get('height')] != pixels:
        raise ValueError('NAIP Plus export dimensions changed; source density was not preserved')
    actual = payload.get('extent') or {}
    for field, expected in zip(('xmin', 'ymin', 'xmax', 'ymax'), bounds):
        if not math.isclose(float(actual.get(field, float('nan'))), expected, abs_tol=1e-6):
            raise ValueError('NAIP Plus export extent changed; source alignment requires review')


def export_tile(tile, target_wkid, source_item):
    source_resolution = float(source_item['resolution_value'])
    values = {
        'f': 'json', 'bbox': ','.join(map(str, tile['boundsLocalMeters'])),
        'bboxSR': target_wkid, 'imageSR': target_wkid,
        'size': ','.join(map(str, tile['pixels'])), 'format': 'tiff',
        'pixelType': 'U8', 'interpolation': 'RSP_NearestNeighbor',
        'bandIds': '0,1,2,3',
    }
    payload = read_json(SERVICE + '/exportImage?' + urllib.parse.urlencode(values))
    validate_export(payload, tile['boundsLocalMeters'], tile['pixels'])
    raw, image = read_tiff_with_retry(payload['href'])
    if image.size != tuple(tile['pixels']) or len(image.getbands()) != 4:
        raise ValueError('NAIP Plus export did not retain four expected image bands')
    width = tile['boundsLocalMeters'][2] - tile['boundsLocalMeters'][0]
    height = tile['boundsLocalMeters'][3] - tile['boundsLocalMeters'][1]
    actual = [width / tile['pixels'][0], height / tile['pixels'][1]]
    if any(not math.isclose(value, source_resolution, rel_tol=0, abs_tol=1e-8) for value in actual):
        raise ValueError('NAIP Plus export grid no longer matches the selected source density')
    stddev = [round(value, 5) for value in ImageStat.Stat(image).stddev]
    quality = {
        'schema': 'golfhelm-usgs-naip-plus-tile-quality-v1',
        'selectedSourceResolutionMeters': source_resolution,
        'actualExportGsdMeters': actual,
        'bands': list(image.getbands()),
        'semanticBandOrder': ['red', 'green', 'blue', 'nir'],
        'pixels': tile['pixels'],
        'stdDev': stddev,
        'passed': max(stddev) >= 2,
        'sourceGridAlignment': 'reprojected_native_density_not_raw_source_grid',
    }
    if not quality['passed']:
        raise ValueError('NAIP Plus tile lacks measurable source variation')
    return payload, raw, image, quality


def acquire_tile(tile, output, target_wkid, service_wkid_value, expected_resolution):
    folder = output / 'tiles' / tile['key']
    complete = all((folder / name).is_file() for name in TILE_ARTIFACTS)
    if complete:
        quality = json.loads((folder / 'imagery-quality.json').read_text())
        return {**tile, 'status': 'cached', 'quality': quality}
    if folder.exists():
        raise ValueError(f'partial NAIP Plus imagery tile retained at {folder}; choose a new output directory')
    lon, lat = centre_wgs84(tile, target_wkid)
    identify_payload = identify(lon, lat, service_wkid_value)
    item = select_native_catalog_item(identify_payload)
    if not math.isclose(float(item['resolution_value']), expected_resolution, abs_tol=1e-9):
        raise ValueError('mixed source-item resolutions in one facility require separate reviewed acquisition')
    export, raw, image, quality = export_tile(tile, target_wkid, item)
    preview = Image.merge('RGB', tuple(image.getchannel(index) for index in range(3)))
    preview_bytes = io.BytesIO()
    preview.save(preview_bytes, format='PNG', optimize=True)
    folder.mkdir(parents=True)
    write_json(folder / 'export.json', export)
    write_json(folder / 'item.json', item)
    (folder / 'ortho.tif').write_bytes(raw)
    (folder / 'preview.png').write_bytes(preview_bytes.getvalue())
    write_json(folder / 'imagery-quality.json', quality)
    return {
        **tile, 'status': 'acquired', 'quality': quality,
        'catalogItemObjectId': item.get('OBJECTID'),
        'rasterSha256': hashlib.sha256(raw).hexdigest(),
        'rasterBytes': len(raw),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('aoi', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--tile-m', type=float, default=DEFAULT_TILE_M)
    parser.add_argument('--limit', type=int, default=None)
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        raise ValueError('--limit must be positive')
    aoi = json.loads(args.aoi.read_text())
    metadata = service_metadata()
    if metadata.get('bandCount') != 4:
        raise ValueError('NAIP Plus service does not currently advertise four bands')
    target_wkid = local_utm_wkid(aoi)
    service_wkid_value = service_wkid(metadata)
    centre = ((aoi['bboxWgs84'][0] + aoi['bboxWgs84'][2]) / 2, (aoi['bboxWgs84'][1] + aoi['bboxWgs84'][3]) / 2)
    seed_item = select_native_catalog_item(identify(*centre, service_wkid_value))
    source_resolution = float(seed_item['resolution_value'])
    tiles = native_tiles(aoi_bounds(aoi, target_wkid), source_resolution, args.tile_m)
    selected = tiles if args.limit is None else tiles[:args.limit]
    records = []
    for tile in selected:
        records.append(acquire_tile(tile, args.output, target_wkid, service_wkid_value, source_resolution))
        write_json(args.output / 'index.json', {
            'schema': 'golfhelm-facility-usgs-naip-plus-index-v1',
            'facilityId': aoi['facilityId'],
            'aoiResponseSha256': aoi['responseSha256'],
            'source': {
                'provider': 'USGS NAIP Plus', 'service': SERVICE,
                'serviceWkid': service_wkid_value, 'targetWkid': target_wkid,
                'retainedBands': ['red', 'green', 'blue', 'nir'],
                'artifactFormat': 'four_band_geotiff',
                'attribution': metadata.get('copyrightText'),
                'licenseStatus': 'US public-domain service; retain USGS/USDA item metadata and attribution.',
            },
            'selectedSourceItem': seed_item,
            'sourceResolutionMeters': source_resolution,
            'tileCountPlanned': len(tiles), 'tileCountAcquired': len(records),
            'complete': len(records) == len(tiles), 'retrievedAt': datetime.now(timezone.utc).isoformat(),
            'tiles': records,
            'rule': ('Exports retain four source-requested bands and selected-item provenance at reprojected native density. '
                     'This index is imagery evidence only until feature-specific extraction and review are admitted.'),
        })
        print(json.dumps({'tile': tile['key'], 'pixels': tile['pixels'], 'catalogItem': records[-1].get('catalogItemObjectId')}), flush=True)


if __name__ == '__main__':
    main()
