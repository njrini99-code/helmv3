#!/usr/bin/env python3
"""Acquire native-GSD NC OneMap imagery as bounded facility tiles.

The output is source evidence for later segmentation/review. It is *not* a
course package and does not create fairway, green, bunker, tee or hole-route
geometry. The tile index records exactly which requests passed the native-grid
quality gate, so a later vector extractor can cite a pixel source instead of
a browser screenshot.

Usage:
  python3 scripts/golf/course-geometry/fetch-nc-facility-ortho.py \
    output/.../aoi.json output/.../nc-ortho

The default 280 m tiles stay beneath the service's four-million-pixel cap at
six-inch GSD. --limit is useful to prove service/crop behavior before a full
facility acquisition. A partial index is explicit and never becomes a
complete imagery source.
"""
import argparse
import hashlib
import io
import importlib.util
import json
import math
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

import pyproj
from PIL import Image, ImageStat
from osgeo import gdal

gdal.UseExceptions()

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('nc_ortho_source', HERE / 'fetch-nc-ortho-study.py')
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)

MAX_FACILITY_TILES = 128
DEFAULT_TILE_M = 280.0
TILE_ARTIFACTS = ('rgb-export.json', 'nir-export.json', 'rgb.tif', 'nir.tif', 'preview.png', 'imagery-quality.json')
RASTER_READ_ATTEMPTS = 3
ANALYSIS_CANDIDATES = (
    {
        'id': 'nc_onemap_2024_2027_analysis',
        'service': 'https://services.nconemap.gov/secure/rest/services/Imagery/Orthoimagery_20242027_analysis/ImageServer',
    },
    {
        'id': 'nc_onemap_2020_2023_analysis',
        'service': 'https://services.nconemap.gov/secure/rest/services/Imagery/Orthoimagery_2020_2023_4band_analysis/ImageServer',
    },
)


def write_json(path, document):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, indent=2, ensure_ascii=False) + '\n')


def source_bounds(aoi):
    west, south, east, north = aoi['bboxWgs84']
    transformer = pyproj.Transformer.from_crs(4326, source.SOURCE_CRS, always_xy=True)
    xs, ys = transformer.transform([west, east, east, west], [south, south, north, north])
    return min(xs), min(ys), max(xs), max(ys)


def native_tiles(bounds, extent, tile_m):
    if not math.isfinite(tile_m) or not 50 <= tile_m <= 300:
        raise ValueError('tile width must be finite and between 50 and 300 metres')
    cell = source.NATIVE_PIXEL_US_FEET
    # A facility can exceed the one-export cap; snap the *whole* extent to
    # the provider grid here, then enforce the cap independently on every
    # tile. Calling the single-crop helper would reject the exact case this
    # tiler exists to handle.
    origin_x, origin_y = float(extent['xmin']), float(extent['ymin'])
    west, south, east, north = bounds
    grid = [
        origin_x + math.floor((west - origin_x) / cell) * cell,
        origin_y + math.floor((south - origin_y) / cell) * cell,
        origin_x + math.ceil((east - origin_x) / cell) * cell,
        origin_y + math.ceil((north - origin_y) / cell) * cell,
    ]
    tile_cells = max(2, int(math.floor(tile_m / source.US_SURVEY_FOOT_TO_METERS / cell)))
    width_cells = int(round((grid[2] - grid[0]) / cell))
    height_cells = int(round((grid[3] - grid[1]) / cell))
    result = []
    for row, bottom_cell in enumerate(range(0, height_cells, tile_cells)):
        for column, left_cell in enumerate(range(0, width_cells, tile_cells)):
            cells_w = min(tile_cells, width_cells - left_cell)
            cells_h = min(tile_cells, height_cells - bottom_cell)
            bbox = [
                grid[0] + left_cell * cell,
                grid[1] + bottom_cell * cell,
                grid[0] + (left_cell + cells_w) * cell,
                grid[1] + (bottom_cell + cells_h) * cell,
            ]
            result.append({'key': f'r{row:02d}-c{column:02d}', 'row': row, 'column': column,
                           'boundsNativeUSFeet': bbox, 'pixels': [cells_w, cells_h]})
    return result


def quality_summary(records):
    """Summarize native RGB+NIR passes without turning pixels into geometry."""
    failed = []
    gsds = set()
    for record in records:
        quality = record.get('quality') or {}
        gsd = quality.get('nativeGsdMeters')
        if isinstance(gsd, (int, float)):
            gsds.add(float(gsd))
        rgb = (quality.get('rgb') or {}).get('passed')
        nir = (quality.get('nir') or {}).get('passed')
        if record.get('selected') != 'analysis_rgb_nir' or rgb is not True or nir is not True:
            failed.append(record['key'])
    return {
        'passedTiles': len(records) - len(failed),
        'failedTileKeys': sorted(failed),
        'nativeGsdMeters': sorted(gsds),
        'rule': 'Every listed tile must pass both independently exported RGB and NIR native-grid checks; this verifies imagery evidence only, never feature geometry.',
    }


def acquire_from_analysis_candidates(candidates, acquire):
    """Use an older four-band source only when newer coverage fails closed."""
    failures = []
    for candidate in candidates:
        try:
            return acquire(candidate), failures
        except ValueError as error:
            failures.append({'sourceId': candidate['id'], 'reason': str(error)})
    raise ValueError('No NC OneMap four-band analysis candidate passed: ' + '; '.join(
        f"{failure['sourceId']}: {failure['reason']}" for failure in failures))


def validate_export(payload, bounds, size):
    if 'error' in payload:
        raise ValueError('NC OneMap export failed: ' + str(payload['error']))
    if [payload.get('width'), payload.get('height')] != size:
        raise ValueError('Export dimensions changed; native GSD was not preserved')
    actual = payload.get('extent', {})
    for field, expected in zip(('xmin', 'ymin', 'xmax', 'ymax'), bounds):
        if not math.isclose(float(actual.get(field, float('nan'))), expected, abs_tol=1e-6):
            raise ValueError('Export extent changed; source alignment requires review')


def read_tiff_with_retry(url, label, read=source.read):
    """Decode a complete TIFF or fail closed after bounded public retries."""
    last_error = None
    for _attempt in range(RASTER_READ_ATTEMPTS):
        try:
            pixels = read(url, 45_000_000)
            image = Image.open(io.BytesIO(pixels))
            # PIL can defer TIFF decoding until conversion/statistics. Force it
            # here so a partial ImageServer response never looks retained.
            image.load()
            return pixels, image
        except (OSError, ValueError) as error:
            if 'pixels' in locals() and tiff_is_all_zero(pixels):
                raise ValueError(f'{label} source TIFF has no imagery coverage (all bands are zero)')
            last_error = error
    raise ValueError(f'{label} TIFF did not decode after {RASTER_READ_ATTEMPTS} attempts: {last_error}')


def tiff_is_all_zero(pixels):
    """Recognize a valid ImageServer no-data TIFF even when Pillow rejects it."""
    path = f'/vsimem/golfhelm-ortho-{uuid.uuid4().hex}.tif'
    try:
        gdal.FileFromMemBuffer(path, pixels)
        dataset = gdal.Open(path)
        if dataset is None or dataset.RasterCount < 1:
            return False
        return all(
            band.ComputeRasterMinMax(False) == (0.0, 0.0)
            for band in (dataset.GetRasterBand(index) for index in range(1, dataset.RasterCount + 1))
        )
    except (RuntimeError, OSError):
        return False
    finally:
        gdal.Unlink(path)


def export_tiff(base, bounds, size, band_ids, label):
    values = {
        'f': 'json', 'bbox': ','.join(map(str, bounds)), 'bboxSR': 6543,
        'imageSR': 6543, 'size': ','.join(map(str, size)), 'format': 'tiff',
        'pixelType': 'U8', 'interpolation': 'RSP_NearestNeighbor',
        'bandIds': ','.join(str(value) for value in band_ids),
    }
    payload = json.loads(source.read(base + '/exportImage?' + urlencode(values), 2_000_000))
    validate_export(payload, bounds, size)
    pixels, image = read_tiff_with_retry(payload['href'], label)
    if image.size != tuple(size):
        raise ValueError('Raster dimensions differ from the source export metadata')
    expected_bands = len(band_ids)
    if len(image.getbands()) != expected_bands:
        raise ValueError(f'{label} export preserved {len(image.getbands())} bands, expected {expected_bands}')
    if expected_bands == 1:
        image = image.convert('L')
    elif expected_bands == 3:
        image = image.convert('RGB')
    else:
        raise ValueError('Only RGB and NIR source exports are supported')
    stddev = [round(value, 5) for value in ImageStat.Stat(image).stddev]
    quality = {
        'bands': list(image.getbands()),
        'dimensions': list(image.size),
        'stdDev': stddev,
        'extrema': [list(image.getchannel(index).getextrema()) for index in range(len(image.getbands()))],
        'passed': max(stddev) >= 2,
    }
    return payload, pixels, image, quality


def validate_facility_tile_count(tiles):
    if len(tiles) > MAX_FACILITY_TILES:
        raise ValueError(f'facility needs {len(tiles)} native tiles, above fixed cap {MAX_FACILITY_TILES}; reduce AOI before acquisition')


def acquire_tile(tile, output, analysis_candidates):
    folder = output / 'tiles' / tile['key']
    complete = all((folder / name).is_file() for name in TILE_ARTIFACTS)
    if complete:
        quality = json.loads((folder / 'imagery-quality.json').read_text())
        return {**tile, 'status': 'cached', 'selected': quality['selected'], 'quality': quality}
    if folder.exists():
        raise ValueError(f'partial imagery tile retained at {folder}; choose a new output directory')
    def acquire_from(candidate):
        analysis = candidate['service']
        rgb_export, rgb_pixels, rgb_image, rgb_quality = export_tiff(analysis, tile['boundsNativeUSFeet'], tile['pixels'], (0, 1, 2), 'RGB')
        nir_export, nir_pixels, _nir_image, nir_quality = export_tiff(analysis, tile['boundsNativeUSFeet'], tile['pixels'], (3,), 'NIR')
        if not rgb_quality['passed'] or not nir_quality['passed']:
            raise ValueError(f'{tile["key"]}: RGB or NIR analysis export failed the native-quality gate')
        return {
            'candidate': candidate,
            'rgbExport': rgb_export, 'rgbPixels': rgb_pixels, 'rgbImage': rgb_image, 'rgbQuality': rgb_quality,
            'nirExport': nir_export, 'nirPixels': nir_pixels, 'nirQuality': nir_quality,
        }

    selected, rejected_candidates = acquire_from_analysis_candidates(analysis_candidates, acquire_from)
    rgb_export = selected['rgbExport']
    rgb_pixels = selected['rgbPixels']
    rgb_image = selected['rgbImage']
    rgb_quality = selected['rgbQuality']
    nir_export = selected['nirExport']
    nir_pixels = selected['nirPixels']
    nir_quality = selected['nirQuality']
    preview = io.BytesIO()
    rgb_image.save(preview, format='PNG', optimize=True)
    quality = {
        'schema': 'golfhelm-native-ortho-tile-quality-v2',
        'nativeGsdMeters': source.NATIVE_PIXEL_US_FEET * source.US_SURVEY_FOOT_TO_METERS,
        'actualGsdMeters': source.NATIVE_PIXEL_US_FEET * source.US_SURVEY_FOOT_TO_METERS,
        'pixels': tile['pixels'],
        'boundsNativeUSFeet': tile['boundsNativeUSFeet'],
        'rgb': rgb_quality,
        'nir': nir_quality,
        'selected': 'analysis_rgb_nir',
        'analysisSourceId': selected['candidate']['id'],
        'analysisService': selected['candidate']['service'],
        'rejectedAnalysisCandidates': rejected_candidates,
    }
    folder.mkdir(parents=True)
    write_json(folder / 'rgb-export.json', rgb_export)
    write_json(folder / 'nir-export.json', nir_export)
    (folder / 'rgb.tif').write_bytes(rgb_pixels)
    (folder / 'nir.tif').write_bytes(nir_pixels)
    (folder / 'preview.png').write_bytes(preview.getvalue())
    write_json(folder / 'imagery-quality.json', quality)
    return {
        **tile, 'status': 'acquired', 'selected': 'analysis_rgb_nir', 'sourceId': selected['candidate']['id'], 'quality': quality,
        'rasterSha256': {'rgb': hashlib.sha256(rgb_pixels).hexdigest(), 'nir': hashlib.sha256(nir_pixels).hexdigest()},
        'rasterBytes': {'rgb': len(rgb_pixels), 'nir': len(nir_pixels)},
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
    services = []
    for candidate in ANALYSIS_CANDIDATES:
        service = source.service_metadata(candidate['service'])
        source.validate_service(service, 4)
        services.append((candidate, service))
    tiles = native_tiles(source_bounds(aoi), services[0][1]['extent'], args.tile_m)
    validate_facility_tile_count(tiles)
    selected_tiles = tiles if args.limit is None else tiles[:args.limit]
    records = []
    for tile in selected_tiles:
        record = acquire_tile(tile, args.output, ANALYSIS_CANDIDATES)
        records.append(record)
        write_json(args.output / 'index.json', {
            'schema': 'golfhelm-facility-native-ortho-index-v2',
            'facilityId': aoi['facilityId'],
            'aoiResponseSha256': aoi['responseSha256'],
            'source': {
                'provider': 'NC OneMap',
                'analysisCandidates': [candidate for candidate, _service in services],
                'sourceCrs': source.SOURCE_CRS,
                'nativeGsdMeters': source.NATIVE_PIXEL_US_FEET * source.US_SURVEY_FOOT_TO_METERS,
                'analysisBands': ['red', 'green', 'blue', 'nir'],
                'retainedBands': ['red', 'green', 'blue', 'nir'],
                'artifactFormat': 'separate_rgb_and_nir_geotiff',
                'attribution': services[0][1].get('copyrightText'),
                'licenseStatus': 'Service attribution retained; extraction/reuse review remains required.',
            },
            'tileWidthMeters': args.tile_m,
            'tileCountPlanned': len(tiles),
            'tileCountAcquired': len(records),
            'complete': len(records) == len(tiles),
            'sourceGsdMeters': source.NATIVE_PIXEL_US_FEET * source.US_SURVEY_FOOT_TO_METERS,
            'qualitySummary': quality_summary(records),
            'retrievedAt': datetime.now(timezone.utc).isoformat(),
            'tiles': records,
            'rule': ('Every tile must retain native-grid RGB and NIR exports, request metadata, dimensions, quality result, and raster hashes. '
                     'This index is imagery evidence only until a feature-specific extraction and review are admitted.'),
        })
        print(json.dumps({'tile': tile['key'], 'selected': record['selected'], 'pixels': tile['pixels']}), flush=True)


if __name__ == '__main__':
    main()
