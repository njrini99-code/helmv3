"""S1M discovery spike (Factory v2-next §19 C2): what the USGS Seamless 1 m
DEM offers over the catalog's facilities, measured, so the owner can write
the acceptance rule that would put `usgs_s1m` ahead of the project tiles.

Read-only: one TNM catalog query per facility and HTTP range reads of the
S1M cloud-optimised GeoTIFFs (a window over the AOI, never a 320 MB tile).
It writes the report under <root>/research/ and changes no provider
default, no catalog entry and no source manifest.

    python3 research-s1m-coverage.py [--root output/course-geometry/factory]...
                                     [--facility <id>]... [--offline]

Every root is searched for `facilities/<id>/aoi.json` and the retained
project export (`facilities/<id>/terrain/*/elevation.tiff`, or the
facility's `retained.terrain`); the report lands under the first root.
"""
import argparse
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import numpy as np
from osgeo import gdal, osr

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
TNM_PRODUCTS = 'https://tnmaccess.nationalmap.gov/api/v1/products'
S1M_DATASET = 'Seamless 1-m DEM (S1M)'
S1M_INDEX = 'https://index.nationalmap.gov/arcgis/rest/services/USGS_Seamless1m_Index/MapServer'
S1M_ITEM = 'https://www.sciencebase.gov/catalog/item/67af83c1d34e5020fb91f170'
ALBERS_EPSG = 6350          # NAD83(2011) / Conus Albers: the S1M tile grid
TILE_M = 10_000             # one S1M tile is 10 km x 10 km on that grid
MAX_CATALOG_BYTES = 2_000_000
MAX_WINDOW_PIXELS = 25_000_000   # ~100 MB of Float32 in memory; the AOIs here are ~6 M pixels
SAMPLE_STEP_M = 25          # comparison grid over the retained export
SHIFT_RANGE_M = 2.0         # best-fit horizontal offset search, ± this, 0.5 m steps
MAX_EMPTY_FRACTION = 0.001  # the compiler's MAX_EMPTY_EXPORT_FRACTION
PROXY_HALF_WIDTH_M = 1500   # discovery-only bbox for a facility without a resolved AOI
USER_AGENT = 'GolfHelm course-geometry factory research (bounded, one catalog query per facility)'

gdal.UseExceptions()


# --- pure helpers (tested without a network) ---------------------------------
def tile_square(title):
    """'S1M n2240e1320 20260521' → (x0, y0, x1, y1) in Albers metres: the name
    carries the tile's north-west corner in kilometres."""
    match = re.search(r'\bn(\d{3,5})e(\d{3,5})\b', str(title))
    if not match:
        return None
    y_top = int(match.group(1)) * 1000
    x0 = int(match.group(2)) * 1000
    return (x0, y_top - TILE_M, x0 + TILE_M, y_top)


def grid_cells(envelope):
    """Every 10 km grid cell an Albers envelope (x0, y0, x1, y1) touches."""
    x0, y0, x1, y1 = envelope
    cells = []
    for gx in range(math.floor(x0 / TILE_M), math.ceil(x1 / TILE_M)):
        for gy in range(math.floor(y0 / TILE_M), math.ceil(y1 / TILE_M)):
            cells.append((gx * TILE_M, gy * TILE_M, (gx + 1) * TILE_M, (gy + 1) * TILE_M))
    return cells


def coverage(envelope, tiles):
    """Which grid cells under the AOI the discovered tiles supply, and which are missing."""
    squares = {tile_square(t['title']) for t in tiles} - {None}
    needed = grid_cells(envelope)
    missing = [c for c in needed if c not in squares]
    return {'cellsNeeded': len(needed), 'cellsCovered': len(needed) - len(missing), 'covered': not missing, 'missingCells': missing}


def bilinear(array, cols, rows):
    """Bilinear samples of a 2-D array at fractional (col, row) pixel
    coordinates; NaN where the sample leaves the array or touches NaN."""
    h, w = array.shape
    out = np.full(len(cols), np.nan, dtype=np.float64)
    ok = (cols >= 0) & (rows >= 0) & (cols <= w - 1) & (rows <= h - 1)
    c, r = cols[ok], rows[ok]
    c0 = np.clip(np.floor(c).astype(int), 0, w - 2)
    r0 = np.clip(np.floor(r).astype(int), 0, h - 2)
    fc, fr = c - c0, r - r0
    a = array[r0, c0] * (1 - fc) * (1 - fr) + array[r0, c0 + 1] * fc * (1 - fr) + array[r0 + 1, c0] * (1 - fc) * fr + array[r0 + 1, c0 + 1] * fc * fr
    out[ok] = a
    return out


def difference_stats(delta):
    """Signed S1M − retained differences → the numbers an acceptance rule reads."""
    delta = delta[np.isfinite(delta)]
    if delta.size == 0:
        return {'points': 0}
    absd = np.abs(delta)
    return {'points': int(delta.size), 'meanSignedM': round(float(delta.mean()), 3), 'medianAbsM': round(float(np.median(absd)), 3),
            'p95AbsM': round(float(np.percentile(absd, 95)), 3), 'maxAbsM': round(float(absd.max()), 3),
            'within0p15m': round(float((absd <= 0.15).mean()), 4), 'within0p5m': round(float((absd <= 0.5).mean()), 4)}


def best_shift(sample, mosaic, cols, rows, pixel_m=1.0):
    """The horizontal offset (dx, dy metres, Albers) under ±SHIFT_RANGE_M that
    minimises the median |Δ|: a systematic offset between two exports of the
    same ground says datum handling, not terrain, separates them."""
    best = None
    steps = np.arange(-SHIFT_RANGE_M, SHIFT_RANGE_M + 1e-9, 0.5)
    for dx in steps:
        for dy in steps:
            values = bilinear(mosaic, cols + dx / pixel_m, rows - dy / pixel_m)
            delta = values - sample
            delta = delta[np.isfinite(delta)]
            if delta.size == 0:
                continue
            score = (round(float(np.median(np.abs(delta))), 3), dx * dx + dy * dy)   # ties go to the smaller shift
            if best is None or score < best[0]:
                best = (score, {'dxM': float(dx), 'dyM': float(dy), 'medianAbsM': score[0]})
    return best[1] if best else None


def mechanical_checks(record):
    """Pre-checks against the plan's example rule. The owner's written rule
    decides; these only say which inputs are already in hand."""
    window = record.get('window') or {}
    compare = record.get('comparison') or {}
    checks = {
        'aoiFullyCovered': bool((record.get('coverage') or {}).get('covered')),
        'emptyFractionUnderThreshold': window.get('nodataFraction') is not None and window['nodataFraction'] <= MAX_EMPTY_FRACTION,
        'crsAndGridRetained': bool(window.get('crs')) and window.get('pixelM') == [1.0, 1.0],
        'sourceProjectsKnown': bool(record.get('sourceProjects')),
        'sourceFlightKnown': bool(record.get('sourceAcquisition')),
        'comparedToRetainedTile': bool(compare.get('points')),
        'reproducibleWindow': bool(window.get('albersWindow')) and bool(record.get('tiles')),
    }
    return checks


# --- network ---------------------------------------------------------------------
RETRY_AFTER_S = (10,)   # one retry on a 5xx; the TNM API answers 500 now and then


def fetch_json(url, limit, sleep=time.sleep):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    for wait in (*RETRY_AFTER_S, None):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                data = response.read(limit + 1)
            break
        except urllib.error.HTTPError as exc:
            if exc.code not in (500, 502, 503, 504) or wait is None:
                raise
            sleep(wait)
    if len(data) > limit:
        raise ValueError('catalog response exceeds the bounded budget')
    return json.loads(data)


def item_provenance(meta_url):
    """The ScienceBase item behind a tile: the source lidar's acquisition
    window (a tile cut in 2026 can rest on a 2003 flight) and the per-pixel
    source-project GeoPackage the reader would open to see which project
    supplied which ground."""
    if not meta_url:
        return {}
    try:
        doc = fetch_json(meta_url + '?format=json&fields=dates,webLinks', MAX_CATALOG_BYTES)
    except Exception as exc:  # noqa: BLE001 — provenance is evidence, not a gate; the tile row still stands
        return {'error': f'{type(exc).__name__}: {exc}'}
    dates = {d.get('type'): d.get('dateString') for d in doc.get('dates') or []}
    links = {(w.get('title') or w.get('type')): w.get('uri') for w in doc.get('webLinks') or []}
    return {'acquisitionStart': dates.get('Start'), 'acquisitionEnd': dates.get('End'), 'spatialMetadata': links.get('Spatial Metadata'), 'productMetadata': links.get('Product Metadata')}


def discover(bbox_wgs84):
    """One TNM catalog query: the S1M tiles intersecting a WGS84 bbox, then
    one ScienceBase read per tile for its provenance."""
    query = {'datasets': S1M_DATASET, 'bbox': ','.join(f'{v:.7f}' for v in bbox_wgs84), 'prodFormats': 'GeoTIFF', 'outputFormat': 'JSON', 'max': 20}
    started = time.time()
    doc = fetch_json(TNM_PRODUCTS + '?' + urllib.parse.urlencode(query), MAX_CATALOG_BYTES)
    tiles = []
    for item in doc.get('items') or []:
        meta = str(item.get('vendorMetaUrl') or '')
        project = meta.split('prefix=StagedProducts/Elevation/metadata/', 1)[1] if 'StagedProducts/Elevation/metadata/' in meta else None
        tiles.append({'title': item.get('title'), 'publicationDate': item.get('publicationDate'), 'lastUpdated': item.get('lastUpdated'), 'sizeInBytes': item.get('sizeInBytes'),
                      'downloadURL': item.get('downloadURL'), 'boundingBoxWgs84': item.get('boundingBox'), 'sourceProject': project, 'metaUrl': item.get('metaUrl'),
                      'square': tile_square(item.get('title'))})
    latency = round(time.time() - started, 1)
    for tile in tiles:
        tile.update(item_provenance(tile['metaUrl']))
    return {'latencyS': latency, 'total': doc.get('total'), 'tiles': tiles}


def albers_transform(from_epsg):
    src = osr.SpatialReference(); src.ImportFromEPSG(from_epsg); src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    dst = osr.SpatialReference(); dst.ImportFromEPSG(ALBERS_EPSG); dst.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return osr.CoordinateTransformation(src, dst)


def envelope_albers(bbox_wgs84, densify=16):
    """The Albers envelope of a WGS84 bbox, from its densified ring."""
    west, south, east, north = bbox_wgs84
    ring = []
    for i in range(densify):
        t = i / densify
        ring += [(west + (east - west) * t, south), (east, south + (north - south) * t), (east - (east - west) * t, north), (west, north - (north - south) * t)]
    points = albers_transform(4326).TransformPoints(ring)
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return (math.floor(min(xs)), math.floor(min(ys)), math.ceil(max(xs)), math.ceil(max(ys)))


def read_window(tiles, envelope):
    """Mosaic the AOI envelope from the covering COGs by HTTP range reads.
    Returns (array north-up at 1 m, geotransform, per-tile notes, bytes)."""
    x0, y0, x1, y1 = envelope
    width, height = x1 - x0, y1 - y0
    if width * height > MAX_WINDOW_PIXELS:
        raise ValueError(f'window {width}x{height} exceeds the in-memory budget')
    mosaic = np.full((height, width), np.nan, dtype=np.float32)
    notes = []
    gdal.NetworkStatsReset()
    started = time.time()
    for tile in tiles:
        square = tile['square']
        if not square or square[2] <= x0 or square[0] >= x1 or square[3] <= y0 or square[1] >= y1:
            continue
        ds = gdal.Open('/vsicurl/' + tile['downloadURL'])
        gt = ds.GetGeoTransform()
        band = ds.GetRasterBand(1)
        nodata = band.GetNoDataValue()
        # Intersection of the envelope and the tile, in tile pixels.
        ix0, ix1 = max(x0, square[0]), min(x1, square[2])
        iy0, iy1 = max(y0, square[1]), min(y1, square[3])
        col0, row0 = round((ix0 - gt[0]) / gt[1]), round((gt[3] - iy1) / -gt[5])
        cols, rows = round((ix1 - ix0) / gt[1]), round((iy1 - iy0) / -gt[5])
        block = band.ReadAsArray(col0, row0, cols, rows).astype(np.float32)
        if nodata is not None:
            block[block == nodata] = np.nan
        mosaic[(y1 - iy1):(y1 - iy0), (ix0 - x0):(ix1 - x0)] = block
        srs = ds.GetSpatialRef()
        notes.append({'title': tile['title'], 'crs': srs.GetName() if srs else None, 'pixelM': [gt[1], -gt[5]], 'nodata': nodata, 'dataType': gdal.GetDataTypeName(band.DataType),
                      'layout': (ds.GetMetadata('IMAGE_STRUCTURE') or {}).get('LAYOUT'), 'compression': (ds.GetMetadata('IMAGE_STRUCTURE') or {}).get('COMPRESSION'),
                      'blockSize': band.GetBlockSize(), 'overviews': band.GetOverviewCount(), 'tileSize': [ds.RasterXSize, ds.RasterYSize], 'windowPixels': [cols, rows]})
        ds = None
    elapsed = round(time.time() - started, 1)
    stats = json.loads(gdal.NetworkStatsGetAsSerializedJSON() or '{}')
    return mosaic, (x0, 1.0, 0.0, y1, 0.0, -1.0), notes, elapsed, stats


def network_bytes(stats):
    """Bytes GDAL downloaded, from the top-level methods node of its network
    stats (the handlers and files below it repeat the same bytes)."""
    return sum(int(m.get('downloaded_bytes') or 0) for m in ((stats or {}).get('methods') or {}).values())


def raster_envelope_albers(path):
    """The Albers envelope of a raster's extent (its four corners transformed)."""
    ds = gdal.Open(path)
    rgt = ds.GetGeoTransform()
    epsg = int(ds.GetSpatialRef().GetAuthorityCode(None) or 0)
    w, h = ds.RasterXSize, ds.RasterYSize
    corners = [(rgt[0], rgt[3]), (rgt[0] + w * rgt[1], rgt[3]), (rgt[0], rgt[3] + h * rgt[5]), (rgt[0] + w * rgt[1], rgt[3] + h * rgt[5])]
    points = albers_transform(epsg).TransformPoints(corners)
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return (math.floor(min(xs)), math.floor(min(ys)), math.ceil(max(xs)), math.ceil(max(ys)))


def union(a, b):
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def compare(mosaic, gt, retained_path):
    """Sample the retained project export every SAMPLE_STEP_M and read S1M at
    the same ground positions."""
    ds = gdal.Open(retained_path)
    rgt = ds.GetGeoTransform()
    srs = ds.GetSpatialRef()
    epsg = int(srs.GetAuthorityCode(None) or 0)
    band = ds.GetRasterBand(1)
    array = band.ReadAsArray().astype(np.float64)
    nodata = band.GetNoDataValue()
    step = max(1, round(SAMPLE_STEP_M / rgt[1]))
    rows = np.arange(step // 2, array.shape[0], step)
    cols = np.arange(step // 2, array.shape[1], step)
    cc, rr = np.meshgrid(cols, rows)
    cc, rr = cc.ravel(), rr.ravel()
    sample = array[rr, cc]
    empty = ~np.isfinite(sample) | (sample == 0.0) | ((sample == nodata) if nodata is not None else False)
    x = rgt[0] + (cc + 0.5) * rgt[1]
    y = rgt[3] + (rr + 0.5) * rgt[5]
    points = albers_transform(epsg).TransformPoints([(float(px), float(py)) for px, py in zip(x, y)])
    ax = np.array([p[0] for p in points]); ay = np.array([p[1] for p in points])
    pcols = (ax - gt[0]) / gt[1] - 0.5
    prows = (gt[3] - ay) / -gt[5] - 0.5
    values = bilinear(mosaic.astype(np.float64), pcols, prows)
    keep = ~empty & np.isfinite(values)
    delta = values[keep] - sample[keep]
    out = difference_stats(delta)
    out.update({'retainedCrs': f'EPSG:{epsg}' if epsg else srs.GetName(), 'retainedGridM': [rgt[1], -rgt[5]], 'sampleStepM': SAMPLE_STEP_M, 'retainedEmptyPoints': int(empty.sum()),
                'outsideS1mWindow': int((~np.isfinite(values) & ~empty).sum()), 'bestShift': best_shift(sample[keep], mosaic.astype(np.float64), pcols[keep], prows[keep])})
    return out


# --- facilities ------------------------------------------------------------------
def load_json(path):
    if path and os.path.isfile(path):
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    return None


def find_aoi(roots, facility_id):
    for root in roots:
        doc = load_json(os.path.join(root, 'facilities', facility_id, 'aoi.json'))
        if doc:
            return doc, os.path.relpath(os.path.join(root, 'facilities', facility_id, 'aoi.json'), REPO)
    return None, None


def find_retained_export(roots, facility):
    candidates = []
    for root in roots:
        base = os.path.join(root, 'facilities', facility['facilityId'], 'terrain')
        if os.path.isdir(base):
            candidates += [os.path.join(base, d) for d in sorted(os.listdir(base))]
    retained = ((facility.get('retained') or {}).get('terrain'))
    if retained:
        candidates.append(os.path.join(REPO, retained))
    for folder in candidates:
        if os.path.isfile(os.path.join(folder, 'elevation.tiff')) and os.path.isfile(os.path.join(folder, 'source-manifest.json')):
            return folder
    return None


def proxy_bbox(origin):
    lon, lat = origin[:2]
    dlat = PROXY_HALF_WIDTH_M / 111_320
    dlon = PROXY_HALF_WIDTH_M / (111_320 * max(math.cos(math.radians(lat)), 0.2))
    return [round(lon - dlon, 7), round(lat - dlat, 7), round(lon + dlon, 7), round(lat + dlat, 7)]


def study(facility, roots, offline=False, log=print):
    facility_id = facility['facilityId']
    aoi, aoi_path = find_aoi(roots, facility_id)
    bbox = aoi['bboxWgs84'] if aoi else proxy_bbox(facility['originWgs84'])
    record = {'facilityId': facility_id, 'name': facility.get('name'), 'region': facility.get('region'), 'terrainPolicy': (facility.get('providerPolicy') or {}).get('terrain'),
              'bboxWgs84': bbox, 'aoiSource': aoi_path or f'origin_proxy_{PROXY_HALF_WIDTH_M}m', 'envelopeAlbers': envelope_albers(bbox)}
    if offline:
        record['skipped'] = 'offline'
        return record
    try:
        found = discover(bbox)
    except Exception as exc:  # noqa: BLE001 — the report records the failure; nothing retries into a rate limit
        record['discovery'] = {'error': f'{type(exc).__name__}: {exc}'}
        return record
    record['discovery'] = {'latencyS': found['latencyS'], 'total': found['total']}
    record['tiles'] = found['tiles']
    record['sourceProjects'] = sorted({t['sourceProject'] for t in found['tiles'] if t['sourceProject']})
    starts = sorted(t['acquisitionStart'] for t in found['tiles'] if t.get('acquisitionStart'))
    ends = sorted(t['acquisitionEnd'] for t in found['tiles'] if t.get('acquisitionEnd'))
    record['sourceAcquisition'] = [starts[0], ends[-1]] if starts and ends else None
    record['coverage'] = coverage(record['envelopeAlbers'], found['tiles'])
    log(f'  {facility_id}: {len(found["tiles"])} S1M tile(s) in {found["latencyS"]} s, coverage {record["coverage"]["cellsCovered"]}/{record["coverage"]["cellsNeeded"]}')
    if not found['tiles']:
        return record
    folder = find_retained_export(roots, facility)
    # The window covers the retained export too (its context margins reach
    # past the AOI), so the comparison samples the whole export.
    window_envelope = union(record['envelopeAlbers'], raster_envelope_albers(os.path.join(folder, 'elevation.tiff'))) if folder else record['envelopeAlbers']
    record['windowCoverage'] = coverage(window_envelope, found['tiles'])
    try:
        mosaic, gt, notes, elapsed, stats = read_window(found['tiles'], window_envelope)
    except Exception as exc:  # noqa: BLE001 — recorded, the other facilities still run
        record['window'] = {'error': f'{type(exc).__name__}: {exc}'}
        return record
    valid = np.isfinite(mosaic)
    record['window'] = {'albersWindow': list(window_envelope), 'pixels': [mosaic.shape[1], mosaic.shape[0]], 'nodataFraction': round(float(1 - valid.mean()), 5),
                        'minM': round(float(np.nanmin(mosaic)), 2) if valid.any() else None, 'maxM': round(float(np.nanmax(mosaic)), 2) if valid.any() else None,
                        'elapsedS': elapsed, 'downloadBytes': network_bytes(stats), 'crs': next((n['crs'] for n in notes), None), 'pixelM': next((n['pixelM'] for n in notes), None), 'tiles': notes}
    log(f'    window {mosaic.shape[1]}x{mosaic.shape[0]} px in {elapsed} s, {record["window"]["downloadBytes"] / 1e6:.1f} MB, nodata {record["window"]["nodataFraction"]:.4%}')
    if folder:
        manifest = load_json(os.path.join(folder, 'source-manifest.json')) or {}
        try:
            record['comparison'] = compare(mosaic, gt, os.path.join(folder, 'elevation.tiff'))
        except Exception as exc:  # noqa: BLE001 — recorded, the other facilities still run
            record['comparison'] = {'error': f'{type(exc).__name__}: {exc}'}
        record['comparison'].update({'retainedExport': os.path.relpath(folder, REPO), 'retainedTitle': manifest.get('selectedTitle'), 'retainedAcquisition': [manifest.get('acquisitionStart'), manifest.get('acquisitionEnd')],
                                     'retainedVerticalDatum': manifest.get('verticalDatum')})
        if record['comparison'].get('points'):
            c = record['comparison']
            log(f'    vs {manifest.get("selectedTitle")}: {c["points"]} pts, median |Δ| {c["medianAbsM"]} m, p95 {c["p95AbsM"]} m, mean {c["meanSignedM"]:+} m, best shift {c["bestShift"]}')
    record['mechanicalChecks'] = mechanical_checks(record)
    return record


def render(report):
    lines = ['# S1M coverage — discovery spike (Factory v2-next §19 C2)', '',
             f'Generated {report["generatedAt"]}. Dataset `{S1M_DATASET}` ([index]({S1M_INDEX}), [item]({S1M_ITEM})). Read-only; no provider default changed.', '',
             ('Discovery is one TNM catalog query per facility; the window is an HTTP range read of the AOI from the S1M COGs (never a whole tile); the comparison samples the retained project export every '
              f'{SAMPLE_STEP_M} m and reads S1M at the same ground positions (bilinear), then searches ±{SHIFT_RANGE_M:g} m for a systematic horizontal offset. '
              '"Mechanical checks" are the plan\'s example rule pre-checked; the owner\'s written rule decides.'), '',
             '| Facility | Policy | AOI | Tiles | Coverage | Published | Source flown | Source projects | Window | Nodata | Bytes | vs retained (n, median, p95, mean; its flight) | Best shift |',
             '|---|---|---|---|---|---|---|---|---|---|---|---|---|']
    for r in report['facilities']:
        tiles = r.get('tiles') or []
        cov = r.get('coverage') or {}
        win = r.get('window') or {}
        cmp_ = r.get('comparison') or {}
        published = ', '.join(sorted({t['publicationDate'] for t in tiles if t.get('publicationDate')})) or '—'
        cover = f'{cov.get("cellsCovered", 0)}/{cov.get("cellsNeeded", "?")}' + (' ✓' if cov.get('covered') else ' ✗') if cov else ('error' if 'error' in (r.get('discovery') or {}) else '—')
        window = f'{win["pixels"][0]}×{win["pixels"][1]} px, {win["elapsedS"]} s' if win.get('pixels') else (win.get('error', '—')[:40] if win else '—')
        nodata = f'{win["nodataFraction"]:.3%}' if win.get('nodataFraction') is not None else '—'
        size = f'{win["downloadBytes"] / 1e6:.1f} MB' if win.get('downloadBytes') else '—'
        flown = f'{cmp_["retainedAcquisition"][0]}..{cmp_["retainedAcquisition"][1]}' if cmp_.get('retainedAcquisition') and cmp_['retainedAcquisition'][0] else '?'
        versus = f'{cmp_["points"]}, {cmp_["medianAbsM"]} m, {cmp_["p95AbsM"]} m, {cmp_["meanSignedM"]:+} m; {flown}' if cmp_.get('points') else (cmp_.get('error', '—')[:40] if cmp_ else 'no retained export')
        acquired = f'{r["sourceAcquisition"][0]}..{r["sourceAcquisition"][1]}' if r.get('sourceAcquisition') else '—'
        shift = f'{cmp_["bestShift"]["dxM"]:+g}, {cmp_["bestShift"]["dyM"]:+g} m → {cmp_["bestShift"]["medianAbsM"]} m' if cmp_.get('bestShift') else '—'
        aoi = 'AOI' if str(r.get('aoiSource', '')).endswith('aoi.json') else 'origin proxy'
        lines.append(f'| {r["facilityId"]} | {", ".join(r.get("terrainPolicy") or [])} | {aoi} | {len(tiles)} | {cover} | {published} | {acquired} | {", ".join(r.get("sourceProjects") or []) or "—"} | {window} | {nodata} | {size} | {versus} | {shift} |')
    lines += ['', '## Mechanical checks (plan §19 example rule)', '',
              '| Facility | AOI covered | Empty ≤ 0.1 % | CRS + 1 m grid | Source projects known | Source flight known | Compared to retained tile | Window reproducible |', '|---|---|---|---|---|---|---|---|']
    for r in report['facilities']:
        checks = r.get('mechanicalChecks')
        if not checks:
            lines.append(f'| {r["facilityId"]} | — | — | — | — | — | — | — |')
            continue
        marks = ' | '.join('✓' if checks[k] else '✗' for k in ('aoiFullyCovered', 'emptyFractionUnderThreshold', 'crsAndGridRetained', 'sourceProjectsKnown', 'sourceFlightKnown', 'comparedToRetainedTile', 'reproducibleWindow'))
        lines.append(f'| {r["facilityId"]} | {marks} |')
    lines += ['', '## What the tiles are', '']
    seen = set()
    for r in report['facilities']:
        for t in r.get('tiles') or []:
            if t['title'] in seen:
                continue
            seen.add(t['title'])
            lines.append(f'- `{t["title"]}` — {t.get("sizeInBytes", 0) / 1e6:.0f} MB, published {t.get("publicationDate")}, source flown {t.get("acquisitionStart") or "?"}..{t.get("acquisitionEnd") or "?"}, '
                         f'project {t.get("sourceProject") or "? (open the spatial metadata)"}, Albers square {list(t.get("square") or [])}'
                         + (f', [per-pixel sources]({t["spatialMetadata"]})' if t.get('spatialMetadata') else ''))
    lines += ['', '## Notes for the acceptance rule', '',
              (f'- S1M tiles sit on the NAD83(2011) Conus Albers 10 km grid (EPSG:{ALBERS_EPSG}, NAVD88 heights), not on the UTM zone the project tiles and every retained export use; '
               'the compiler would warp from Albers to the course zone locally instead of asking the 3DEP image service to cut a UTM window.'),
              '- The comparison crosses NAD83(2011) → WGS84 UTM; a best-fit shift near zero says the two exports agree on where the ground is, a shift of a metre or more says datum handling, not terrain, separates them.',
              ('- A tile\'s `publicationDate` is when S1M was cut, not when the lidar flew: "source flown" is the ScienceBase acquisition window, and a 2026 tile over ground last flown in 2003 is 1 m '
               'only by resampling. The per-tile GeoPackage names the project under every pixel; the retained export\'s own flight window sits beside the comparison.'),
              '- A source start of 1947-01-01 or 1970-01-01 is a placeholder in the ScienceBase item, not a flight; read the project metadata for that tile.',
              '- Nothing here downloads a tile, writes a source manifest or moves `providerPolicy`.']
    return '\n'.join(lines) + '\n'


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--root', action='append', help='factory output root(s); the report lands under the first (default output/course-geometry/factory)')
    parser.add_argument('--facility', action='append', help='limit to these facility ids')
    parser.add_argument('--catalog', default=os.path.join(REPO, 'course-geometry', 'catalog', 'facilities'))
    parser.add_argument('--offline', action='store_true', help='write the report skeleton without any network call')
    args = parser.parse_args(argv)
    roots = [os.path.abspath(r) for r in (args.root or [os.path.join(REPO, 'output', 'course-geometry', 'factory')])]
    for key, value in (('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR'), ('CPL_VSIL_CURL_ALLOWED_EXTENSIONS', '.tif'), ('CPL_VSIL_NETWORK_STATS_ENABLED', 'YES'),
                       ('GDAL_HTTP_TIMEOUT', '120'), ('GDAL_HTTP_MAX_RETRY', '2'), ('GDAL_HTTP_RETRY_DELAY', '5'), ('GDAL_HTTP_USERAGENT', USER_AGENT)):
        gdal.SetConfigOption(key, value)
    facilities = []
    for name in sorted(os.listdir(args.catalog)):
        if name.endswith('.json'):
            doc = load_json(os.path.join(args.catalog, name))
            if doc and (not args.facility or doc['facilityId'] in args.facility):
                facilities.append(doc)
    report = {'kind': 'golfhelm-factory-s1m-coverage-v1', 'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'dataset': S1M_DATASET, 'index': S1M_INDEX, 'item': S1M_ITEM,
              'method': {'sampleStepM': SAMPLE_STEP_M, 'shiftRangeM': SHIFT_RANGE_M, 'maxEmptyFraction': MAX_EMPTY_FRACTION, 'albersEpsg': ALBERS_EPSG, 'proxyHalfWidthM': PROXY_HALF_WIDTH_M},
              'facilities': []}
    for facility in facilities:
        print(f'{facility["facilityId"]}', flush=True)
        report['facilities'].append(study(facility, roots, offline=args.offline, log=lambda m: print(m, flush=True)))
    out_dir = os.path.join(roots[0], 'research')
    os.makedirs(out_dir, exist_ok=True)
    # A partial run (--facility) refreshes those entries and keeps the rest of
    # the previous report, so a retried facility does not erase the cohort.
    previous = load_json(os.path.join(out_dir, 's1m-coverage.json')) or {}
    studied = {r['facilityId'] for r in report['facilities']}
    report['facilities'] = sorted(report['facilities'] + [r for r in previous.get('facilities') or [] if r['facilityId'] not in studied], key=lambda r: r['facilityId'])
    with open(os.path.join(out_dir, 's1m-coverage.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=1, sort_keys=True)
    with open(os.path.join(out_dir, 's1m-coverage.md'), 'w', encoding='utf-8') as f:
        f.write(render(report))
    report_path = os.path.join(out_dir, 's1m-coverage.md')
    print(f'report: {os.path.relpath(report_path, REPO) if report_path.startswith(REPO + os.sep) else report_path}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
