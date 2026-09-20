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
import shutil
import tempfile
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import pyproj
import numpy as np
from osgeo import gdal

gdal.UseExceptions()
from PIL import Image, ImageStat

SERVICE = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer'
USER_AGENT = 'GolfHelm course-geometry NAIP Plus acquisition'
DEFAULT_TILE_M = 280.0
MAX_FACILITY_TILES = 256
MAX_FACILITY_PIXELS = 256_000_000
MAX_PIXELS_PER_EXPORT = 4_000_000
RASTER_READ_ATTEMPTS = 3
INDEX_SCHEMA = 'golfhelm-facility-usgs-naip-plus-index-v2'
DEFAULT_RESERVE_GB = 8.0
TILE_ARTIFACTS = ('export.json', 'item.json', 'ortho.tif', 'preview.png', 'imagery-quality.json')


def write_json(path, document):
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_suffix(path.suffix + '.tmp')
    pending.write_text(json.dumps(document, indent=2, ensure_ascii=False) + '\n')
    pending.replace(path)


def read_bytes(url, limit):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https':
        raise ValueError('USGS NAIP Plus requests must use HTTPS')
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                content = response.read(limit + 1)
            break
        except urllib.error.HTTPError as error:
            if error.code not in {429, 502, 503, 504} or attempt == 2:
                raise
            time.sleep(2 ** attempt)
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
    if width_cells * height_cells > MAX_FACILITY_PIXELS:
        raise ValueError('facility exceeds the bounded native imagery pixel budget; partition the site')
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


def ranked_catalog_items(payload):
    features = ((payload.get('catalogItems') or {}).get('features') or [])
    candidates = []
    for feature in features:
        attrs = feature.get('attributes') or {}
        resolution = attrs.get('resolution_value')
        bands = attrs.get('band_count')
        if attrs.get('Category') != 1 or not isinstance(resolution, (int, float)) or resolution <= 0:
            continue
        if not isinstance(bands, (int, float)) or bands != 4 or attrs.get('resolution_units') != 'METER':
            continue
        candidates.append(attrs)
    if not candidates:
        raise ValueError('no four-band source catalog item covers this tile')
    density = min(float(item['resolution_value']) for item in candidates)
    best = [item for item in candidates if math.isclose(float(item['resolution_value']), density, abs_tol=1e-9)]
    if len(best) > 1:
        if any(not isinstance(item.get('acquisition_date'), (int, float))
               or not math.isfinite(item['acquisition_date']) or item['acquisition_date'] <= 0 for item in best):
            raise ValueError('ambiguous highest-density four-band source catalog items lack acquisition dates')
        newest = max(item['acquisition_date'] for item in best)
        best = [item for item in best if item['acquisition_date'] == newest]
    # Adjacent NAIP source sheets overlap. Equal resolution/date is not an
    # unknown source: choose deterministically, then validate TIFF coverage.
    # Sparse unknown pixels remain excluded from extraction and measurement.
    return sorted(best, key=lambda item: item['OBJECTID'])


def select_native_catalog_item(payload):
    return ranked_catalog_items(payload)[0]


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


def validate_raster(raw, bounds, pixels, target_wkid):
    """Validate retained bytes, not just the export response's declarations."""
    path = f'/vsimem/naip-{uuid.uuid4().hex}.tif'
    gdal.FileFromMemBuffer(path, raw)
    ds = None
    try:
        ds = gdal.Open(path)
        if ds.RasterCount != 4 or [ds.RasterXSize, ds.RasterYSize] != pixels:
            raise ValueError('NAIP TIFF must contain the requested four-band pixel grid')
        if not ds.GetProjectionRef() or not pyproj.CRS.from_wkt(ds.GetProjectionRef()).equals(pyproj.CRS.from_epsg(target_wkid)):
            raise ValueError('NAIP TIFF CRS differs from the requested local frame')
        west, south, east, north = bounds
        expected = (west, (east - west) / pixels[0], 0, north, 0, -(north - south) / pixels[1])
        transform = ds.GetGeoTransform()
        if any(not math.isclose(a, b, abs_tol=1e-7, rel_tol=0) for a, b in zip(transform, expected)):
            raise ValueError('NAIP TIFF grid differs from the requested extent or density')
        data = ds.ReadAsArray()
        valid = np.any(data != 0, axis=0)
        for number in range(1, 5):
            band = ds.GetRasterBand(number)
            if band.GetMaskFlags() & gdal.GMF_NODATA:
                valid &= band.GetMaskBand().ReadAsArray() != 0
        share = float(valid.mean())
        # A sparse void is unknown evidence, not a reason to discard the
        # surrounding source image. Keep it unfilled and exclude it in review
        # scans. Larger gaps still reject the source sheet for this request.
        # This is a review-coverage gate, never physical feature admission.
        if share < .999:
            raise ValueError(f'Locked NAIP raster does not cover the full tile: valid share {share:.6f}')
        return {'validPixelShare': share, 'geotransform': list(transform),
                'crsWkt': ds.GetProjectionRef(), 'rasterBandCount': ds.RasterCount,
                'unknownPixelCount': int(valid.size - np.count_nonzero(valid)),
                'physicalCoverageComplete': share == 1.0,
                'unknownPixelPolicy': 'retain_unfilled_exclude_from_extraction',
                'canMeasurePhysicalGeometry': False}
    finally:
        ds = None
        gdal.Unlink(path)


def lock_rule(source_item):
    object_id = source_item.get('OBJECTID')
    if not isinstance(object_id, int) or isinstance(object_id, bool) or object_id < 1:
        raise ValueError('A catalog raster OBJECTID is required for a locked export')
    return {'mosaicMethod': 'esriMosaicLockRaster', 'lockRasterIds': [object_id],
            'mosaicOperation': 'MT_FIRST'}


def source_metadata_hashes(folder):
    return {name: hashlib.sha256((folder / name).read_bytes()).hexdigest()
            for name in ('item.json', 'export.json', 'imagery-quality.json')}


def cached_tile(tile, folder, target_wkid):
    export = json.loads((folder / 'export.json').read_text())
    item = json.loads((folder / 'item.json').read_text())
    quality = json.loads((folder / 'imagery-quality.json').read_text())
    request = export.get('request') or {}
    if not item.get('OBJECTID') or request.get('mosaicRule') != lock_rule(item):
        raise ValueError('Retained imagery lacks a locked source request; use a new v2 output directory')
    if request.get('imageSR') != target_wkid or request.get('bounds') != tile['boundsLocalMeters']:
        raise ValueError('Retained NAIP tile names a different request frame or bounds')
    if quality.get('schema') != 'golfhelm-usgs-naip-plus-tile-quality-v2' or not quality.get('passed'):
        raise ValueError('Retained NAIP tile lacks a passing v2 quality contract')
    raw = (folder / 'ortho.tif').read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if quality.get('rasterSha256') != digest:
        raise ValueError('Retained NAIP raster hash changed')
    validate_raster(raw, tile['boundsLocalMeters'], tile['pixels'], target_wkid)
    return {**tile, 'status': 'cached', 'quality': quality,
            'catalogItemObjectId': item['OBJECTID'], 'rasterSha256': digest, 'rasterBytes': len(raw),
            'sourceMetadataHashes': source_metadata_hashes(folder)}


def validate_index(index_path):
    """Recheck every retained raster before it can drive offline review."""
    index_path = Path(index_path)
    index = json.loads(index_path.read_text())
    records = index.get('tiles') or []
    if (index.get('schema') != INDEX_SCHEMA or index.get('complete') is not True
            or index.get('acquisitionContract') != 'locked_catalog_item_four_band_geotiff_v2'
            or not records or len(records) != index.get('tileCountPlanned')
            or len(records) != len({row.get('key') for row in records})):
        raise ValueError('A complete source-locked NAIP v2 index is required')
    wkid = index['source']['targetWkid']
    for tile in records:
        if tile.get('status') not in {'acquired', 'cached'}:
            raise ValueError('NAIP index contains an unverified tile')
        retained = cached_tile(tile, index_path.parent / 'tiles' / tile['key'], wkid)
        if (retained['rasterSha256'] != tile.get('rasterSha256') or
                retained['catalogItemObjectId'] != tile.get('catalogItemObjectId') or
                retained['sourceMetadataHashes'] != tile.get('sourceMetadataHashes') or
                retained['quality'] != tile.get('quality')):
            raise ValueError('NAIP index differs from retained tile provenance')
    return index


def export_tile(tile, target_wkid, source_item):
    source_resolution = float(source_item['resolution_value'])
    values = {
        'f': 'json', 'bbox': ','.join(map(str, tile['boundsLocalMeters'])),
        'bboxSR': target_wkid, 'imageSR': target_wkid,
        'size': ','.join(map(str, tile['pixels'])), 'format': 'tiff',
        'pixelType': 'U8', 'interpolation': 'RSP_NearestNeighbor',
        'bandIds': '0,1,2,3', 'adjustAspectRatio': 'false',
        'mosaicRule': json.dumps(lock_rule(source_item), separators=(',', ':')),
        'renderingRule': json.dumps({'rasterFunction': 'None'}),
    }
    payload = read_json(SERVICE + '/exportImage?' + urllib.parse.urlencode(values))
    validate_export(payload, tile['boundsLocalMeters'], tile['pixels'])
    try:
        raw, image = read_tiff_with_retry(payload['href'])
    except ValueError as error:
        # ArcGIS temporary image URLs can fail after a successful export.
        # The documented streaming operation keeps the exact same locked
        # raster, grid and bands. Validate its TIFF just like the href bytes.
        direct = {**values, 'f': 'image'}
        raw, image = read_tiff_with_retry(SERVICE + '/exportImage?' + urllib.parse.urlencode(direct))
        payload = {**payload, 'delivery': 'direct_image_after_href_failure',
                   'hrefFailure': str(error)[:500]}
    raster_quality = validate_raster(raw, tile['boundsLocalMeters'], tile['pixels'], target_wkid)
    payload = {**payload, 'request': {'mosaicRule': lock_rule(source_item), 'imageSR': target_wkid,
                                     'bounds': tile['boundsLocalMeters'], 'bandIds': [0, 1, 2, 3],
                                     'interpolation': 'RSP_NearestNeighbor', 'renderingRule': {'rasterFunction': 'None'}}}
    if image.size != tuple(tile['pixels']) or len(image.getbands()) != 4:
        raise ValueError('NAIP Plus export did not retain four expected image bands')
    width = tile['boundsLocalMeters'][2] - tile['boundsLocalMeters'][0]
    height = tile['boundsLocalMeters'][3] - tile['boundsLocalMeters'][1]
    actual = [width / tile['pixels'][0], height / tile['pixels'][1]]
    if any(not math.isclose(value, source_resolution, rel_tol=0, abs_tol=1e-8) for value in actual):
        raise ValueError('NAIP Plus export grid no longer matches the selected source density')
    stddev = [round(value, 5) for value in ImageStat.Stat(image).stddev]
    quality = {
        'schema': 'golfhelm-usgs-naip-plus-tile-quality-v2',
        'rasterSha256': hashlib.sha256(raw).hexdigest(), **raster_quality,
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
        return cached_tile(tile, folder, target_wkid)
    if folder.exists():
        raise ValueError(f'partial NAIP Plus imagery tile retained at {folder}; choose a new output directory')
    lon, lat = centre_wgs84(tile, target_wkid)
    identify_payload = identify(lon, lat, service_wkid_value)
    candidates = ranked_catalog_items(identify_payload)
    if not math.isclose(float(candidates[0]['resolution_value']), expected_resolution, abs_tol=1e-9):
        raise ValueError('mixed source-item resolutions in one facility require separate reviewed acquisition')
    attempts = []
    for item in candidates:
        try:
            export, raw, image, quality = export_tile(tile, target_wkid, item)
            break
        except ValueError as error:
            if 'does not cover the full tile' not in str(error):
                raise
            attempts.append({'catalogItemObjectId': item['OBJECTID'], 'rejection': str(error)})
    else:
        raise ValueError('No highest-resolution, newest catalog sheet covers this tile: ' + json.dumps(attempts))
    item = {**item, 'selectionEvidence': {
        'policy': 'best_resolution_then_latest_acquisition_then_stable_id_with_bounded_review_coverage',
        'equivalentResolutionDateIds': [row['OBJECTID'] for row in candidates],
        'rejectedCoverage': attempts,
    }}
    preview = Image.merge('RGB', tuple(image.getchannel(index) for index in range(3)))
    preview_bytes = io.BytesIO()
    preview.save(preview_bytes, format='PNG', optimize=True)
    folder.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.acquire-', dir=folder.parent) as tmp:
        pending = Path(tmp) / 'tile'
        pending.mkdir()
        write_json(pending / 'export.json', export)
        write_json(pending / 'item.json', item)
        (pending / 'ortho.tif').write_bytes(raw)
        (pending / 'preview.png').write_bytes(preview_bytes.getvalue())
        write_json(pending / 'imagery-quality.json', quality)
        pending.rename(folder)
    return {
        **tile, 'status': 'acquired', 'quality': quality,
        'catalogItemObjectId': item.get('OBJECTID'),
        'rasterSha256': hashlib.sha256(raw).hexdigest(),
        'rasterBytes': len(raw),
        'sourceMetadataHashes': source_metadata_hashes(folder),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('aoi', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--tile-m', type=float, default=DEFAULT_TILE_M)
    parser.add_argument('--limit', type=int, default=None)
    parser.add_argument('--reserve-gb', type=float, default=DEFAULT_RESERVE_GB)
    parser.add_argument('--workers', type=int, default=3)
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        raise ValueError('--limit must be positive')
    if not math.isfinite(args.reserve_gb) or args.reserve_gb < DEFAULT_RESERVE_GB:
        raise ValueError('Reserve must be at least 8 GB')
    if not 1 <= args.workers <= 4:
        raise ValueError('Use between one and four download workers')
    aoi = json.loads(args.aoi.read_text())
    args.output.mkdir(parents=True, exist_ok=True)
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
    records, failures = {}, []
    index_path = args.output / 'index.json'
    if index_path.exists():
        previous = json.loads(index_path.read_text())
        if (previous.get('schema') != INDEX_SCHEMA or previous.get('facilityId') != aoi['facilityId']
                or previous.get('aoiResponseSha256') != aoi['responseSha256']
                or previous.get('tileCountPlanned') != len(tiles)
                or (previous.get('acquisitionBoundsWgs84') is not None and previous['acquisitionBoundsWgs84'] != aoi['bboxWgs84'])
                or previous.get('sourceResolutionMeters') != source_resolution):
            raise ValueError('Existing index has different acquisition inputs; use a new output directory')
        # Retain previously verified tiles beyond --limit. Never downgrade a
        # complete index just because a caller requests a small resumed run.
        by_key = {tile['key']: tile for tile in tiles}
        for row in previous.get('tiles') or []:
            if row.get('status') in {'acquired', 'cached'}:
                retained = cached_tile(by_key[row['key']], args.output / 'tiles' / row['key'], target_wkid)
                if row.get('sourceMetadataHashes') and row['sourceMetadataHashes'] != retained['sourceMetadataHashes']:
                    raise ValueError('Retained source metadata changed; refusing to replace prior provenance')
                if row.get('rasterSha256') != retained['rasterSha256']:
                    raise ValueError('Retained raster differs from the existing acquisition index')
                records[row['key']] = retained

    def acquire(tile):
        if shutil.disk_usage(args.output).free < args.reserve_gb * 1024**3 + args.workers * 90_000_000:
            raise ValueError('DISK_RESERVE_BLOCKED: insufficient space for the next bounded export')
        return acquire_tile(tile, args.output, target_wkid, service_wkid_value, source_resolution)

    def checkpoint():
        write_json(index_path, {
            'schema': INDEX_SCHEMA,
            'facilityId': aoi['facilityId'],
            'aoiResponseSha256': aoi['responseSha256'],
            'acquisitionBoundsWgs84': aoi['bboxWgs84'],
            'acquisitionExtent': aoi.get('acquisitionExtent'),
            'source': {
                'provider': 'USGS NAIP Plus', 'service': SERVICE,
                'serviceWkid': service_wkid_value, 'targetWkid': target_wkid,
                'retainedBands': ['red', 'green', 'blue', 'nir'],
                'artifactFormat': 'four_band_geotiff',
                'attribution': metadata.get('copyrightText'),
                'licenseStatus': 'US public-domain service; retain USGS/USDA item metadata and attribution.',
            },
            'selectedSourceItem': seed_item,
            'acquisitionContract': 'locked_catalog_item_four_band_geotiff_v2',
            'canMeasurePhysicalGeometry': False,
            'sourceResolutionMeters': source_resolution,
            'tileCountPlanned': len(tiles), 'tileCountAcquired': len(records),
            'complete': len(records) == len(tiles), 'retrievedAt': datetime.now(timezone.utc).isoformat(),
            'tiles': [records[key] for key in sorted(records)], 'failures': failures,
            'rule': ('Exports retain four source-requested bands and selected-item provenance at reprojected native density. '
                     'This index is imagery evidence only until feature-specific extraction and review are admitted.'),
        })
    checkpoint()
    pending_pixels = sum(tile['pixels'][0] * tile['pixels'][1] for tile in selected if tile['key'] not in records)
    # Reserve enough space for the whole remaining job (four source bands plus
    # preview/metadata headroom), not merely the next HTTP response. This lets
    # multi-course properties retain native density without exhausting disk.
    if shutil.disk_usage(args.output).free < args.reserve_gb * 1024**3 + pending_pixels * 8 + args.workers * 90_000_000:
        raise ValueError('DISK_RESERVE_BLOCKED: remaining native source/preview footprint exceeds free-space budget')
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(acquire, tile): tile for tile in selected if tile['key'] not in records}
        for future in as_completed(futures):
            tile = futures[future]
            try:
                records[tile['key']] = future.result()
                print(json.dumps({'tile': tile['key'], 'pixels': tile['pixels'],
                                  'catalogItem': records[tile['key']]['catalogItemObjectId']}), flush=True)
            except Exception as error:
                failures.append({'tile': tile['key'], 'error': str(error)[:1000]})
                print(json.dumps(failures[-1]), flush=True)
            checkpoint()
    if failures:
        raise ValueError(f'{len(failures)} tiles failed; verified tiles retained for resume')


if __name__ == '__main__':
    main()
