#!/usr/bin/env python3
"""Acquire a lidar canopy-height model (CHM) for one layout's terrain export.

USGS 3DEP publishes classified point clouds as Entwine Point Tiles
(`s3://usgs-lidar-public/<project>/ept.json`). This streams the export's
extent through PDAL -- noise dropped, height above the nearest ground
return -- into a max-height raster on the terrain export's own grid (same
CRS, origin and pixel), so `derive-canopy-naip.py --lidar-chm` reads it cell
for cell against the NAIP export without resampling.

Project discovery reads the hobuinc boundaries index, but never trusts it:
an index polygon has claimed coverage 130 km from the project's real data
(`VA_SouthamptonHenricoWMBG_1_2019` vs Golden Horseshoe). Each candidate's
own `ept.json` `boundsConforming` must contain the export, and the newest
covering acquisition wins. Coverage is then measured from the raster itself
(cells with any return), because a bounding box is not a footprint.

A covering bounding box can still hold no points over the course
(`KY_Western_1_A22` claims University Club of Kentucky, 250 km from its
data), so a CHM covering under half the export rejects that project and the
next one is tried. An S3 tile read can fail transiently (Forsyth), so PDAL
is retried before a project counts as failed.

Not every 3DEP project is published as EPT (Horry County, SC: Grande Dunes).
When no EPT project yields coverage, the National Map's per-tile LAZ
downloads are the fallback: the newest project whose tiles cover the export,
one tile at a time (download, height-above-ground onto the export grid,
delete), max-mosaicked, under a byte cap.

No covering project is an answer, not an error: the manifest says
`no_coverage` and canopy falls back to NAIP alone, by name. A missing PDAL
binary or a failed read is an error: silence there would look identical to
a course with no lidar.
"""
import argparse
import hashlib
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pyproj
from osgeo import gdal



def _sibling(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


course_crs = _sibling('course_crs', 'course_crs.py')

gdal.UseExceptions()

INDEX_URL = 'https://raw.githubusercontent.com/hobuinc/usgs-lidar/master/boundaries/resources.geojson'
EPT_ROOT = 'https://s3-us-west-2.amazonaws.com/usgs-lidar-public/'
INDEX_MAX_BYTES = 64_000_000
EPT_JSON_MAX_BYTES = 1_000_000
NOISE_CLASSES = (7, 18)  # ASPRS low / high noise: a 2013 VA delivery carried -877..+831 m points in a 0..25 m site
NODATA = -9999.0
SCHEMA = 'golfhelm-lidar-chm-v1'
COVERAGE_MIN = 0.5  # derive-canopy-naip.py LIDAR_COVERAGE_MIN: below it lidar cannot lead anyway
PDAL_ATTEMPTS = 3
TNM_API = 'https://tnmaccess.nationalmap.gov/api/v1/products'
TNM_DATASET = 'Lidar Point Cloud (LPC)'
TNM_PAGE = 200
TNM_MAX_ITEMS = 2000
TNM_PROJECT_MAX_BYTES = 800_000_000  # every tile is on disk at once while the batch keeps its 9 GB floor
TNM_DOWNLOAD_WORKERS = 4  # rockyweb serves ~160 KB/s per connection
TNM_TILE_MAX_BYTES = 400_000_000
TNM_TITLE_PREFIX = 'USGS Lidar Point Cloud '


def read(url, limit):
    with urllib.request.urlopen(url, timeout=300) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError(f'{url} exceeds the {limit}-byte cap')
    return data


def acquisition_year(name):
    """The first 4-digit year in a 3DEP project name is its acquisition
    (`USGS_LPC_VA_Norfolk_2013_LAS_2015`: flown 2013, delivered 2015). An
    inference from the name, recorded as such."""
    years = re.findall(r'(?<!\d)(19[89]\d|20[0-4]\d)(?!\d)', name)
    return int(years[0]) if years else None


def export_bounds_3857(extent, crs):
    to_web = pyproj.Transformer.from_crs(crs, 3857, always_xy=True)
    xs, ys = zip(*(to_web.transform(x, y) for x in (extent['xmin'], extent['xmax']) for y in (extent['ymin'], extent['ymax'])))
    return min(xs), min(ys), max(xs), max(ys)


def export_polygon_wgs84(extent, crs):
    from shapely.geometry import Polygon
    to_geo = pyproj.Transformer.from_crs(crs, 4326, always_xy=True)
    corners = [(extent['xmin'], extent['ymin']), (extent['xmax'], extent['ymin']), (extent['xmax'], extent['ymax']), (extent['xmin'], extent['ymax'])]
    return Polygon([to_geo.transform(x, y) for x, y in corners])


def index_candidates(index, polygon):
    from shapely.geometry import shape
    hits = []
    for feature in index.get('features') or []:
        props = feature.get('properties') or {}
        try:
            if shape(feature['geometry']).intersects(polygon):
                hits.append({'name': props['name'], 'url': props.get('url') or f'{EPT_ROOT}{props["name"]}/ept.json'})
        except (KeyError, ValueError, TypeError, AttributeError):
            continue
    return hits


def covers(ept, bounds_3857):
    """`boundsConforming` is the data's own extent; `bounds` is the padded
    octree cube and says nothing about where points are."""
    srs = (ept.get('srs') or {}).get('horizontal')
    if str(srs) != '3857':
        return False, f'EPT horizontal SRS {srs!r}, expected 3857'
    b = ept.get('boundsConforming') or []
    if len(b) != 6:
        return False, 'ept.json has no boundsConforming'
    minx, miny, maxx, maxy = bounds_3857
    if b[0] <= minx and b[1] <= miny and b[3] >= maxx and b[4] >= maxy:
        return True, None
    return False, 'boundsConforming does not contain the terrain export'


def choose(candidates, fetch_ept, bounds_3857):
    """Newest verified covering project first; every rejection kept."""
    rejected, covering = [], []
    for candidate in candidates:
        try:
            raw = fetch_ept(candidate['url'])
            ept = json.loads(raw)
        except (OSError, ValueError) as error:
            rejected.append({**candidate, 'reason': f'ept.json unreadable: {error}'})
            continue
        ok, reason = covers(ept, bounds_3857)
        if not ok:
            rejected.append({**candidate, 'reason': reason})
            continue
        covering.append({**candidate, 'eptJsonSha256': hashlib.sha256(raw).hexdigest(), 'points': ept.get('points'),
                         'acquisitionYearInferred': acquisition_year(candidate['name'])})
    covering.sort(key=lambda c: (c['acquisitionYearInferred'] or 0, c['name']), reverse=True)
    return covering, rejected


def pipeline(url, bounds_3857, crs, extent, width, height, out):
    minx, miny, maxx, maxy = bounds_3857
    px = (extent['xmax'] - extent['xmin']) / width
    return {'pipeline': [
        {'type': 'readers.ept', 'filename': url, 'bounds': f'([{minx},{maxx}],[{miny},{maxy}])'},
        {'type': 'filters.reprojection', 'in_srs': 'EPSG:3857', 'out_srs': f'EPSG:{crs}'},
        {'type': 'filters.range', 'limits': ','.join(f'Classification![{c}:{c}]' for c in NOISE_CLASSES)},
        {'type': 'filters.hag_nn'},
        # One leaf only: PDAL 2.10's `pipeline` runs just the first of
        # several writers and then fails the EPT hierarchy read.
        {'type': 'writers.gdal', 'filename': str(out), 'dimension': 'HeightAboveGround', 'output_type': 'max',
         'resolution': px, 'origin_x': extent['xmin'], 'origin_y': extent['ymin'], 'width': width, 'height': height,
         'gdaldriver': 'GTiff', 'nodata': NODATA, 'data_type': 'float32'},
    ]}


# A project whose points carry no spatial reference (NC_PHASE1B_2001 under
# Starmount and Longleaf) is a permanent defect in the published data, not a
# transient read: PDAL refuses it identically every time. It is rejected like
# a thin project -- recorded by name -- instead of failing the whole acquire.
NO_SRS_MARKER = 'source data has no spatial reference'


class LidarProjectUnusable(Exception):
    """A covering project whose published data cannot be used as-is."""


def run_pdal(pdal, spec, workdir, attempts=PDAL_ATTEMPTS, sleep=time.sleep):
    path = workdir / 'pipeline.json'
    metadata = workdir / 'pipeline-metadata.json'
    path.write_text(json.dumps(spec, indent=2))
    for attempt in range(1, attempts + 1):
        result = subprocess.run([pdal, 'pipeline', str(path), '--metadata', str(metadata)], capture_output=True, text=True)
        if result.returncode == 0:
            return attempt
        if NO_SRS_MARKER in result.stderr:
            raise LidarProjectUnusable(f'source data has no spatial reference: {result.stderr.strip()[-300:]}')
        if attempt < attempts:
            sleep(10 * attempt)
    raise RuntimeError(f'pdal pipeline failed ({result.returncode}) after {attempts} attempts: {result.stderr.strip()[-600:]}')


def tile_pipeline(laz, crs, extent, width, height, out):
    """One downloaded LAZ tile onto the export grid. The tile carries its own
    SRS; a tile without one fails reprojection rather than being guessed."""
    px = (extent['xmax'] - extent['xmin']) / width
    return {'pipeline': [
        {'type': 'readers.las', 'filename': str(laz)},
        {'type': 'filters.reprojection', 'out_srs': f'EPSG:{crs}'},
        {'type': 'filters.range', 'limits': ','.join(f'Classification![{c}:{c}]' for c in NOISE_CLASSES)},
        {'type': 'filters.hag_nn'},
        {'type': 'writers.gdal', 'filename': str(out), 'dimension': 'HeightAboveGround', 'output_type': 'max',
         'resolution': px, 'origin_x': extent['xmin'], 'origin_y': extent['ymin'], 'width': width, 'height': height,
         'gdaldriver': 'GTiff', 'nodata': NODATA, 'data_type': 'float32'},
    ]}


def tnm_items(bbox_wgs84, fetch_json):
    """Every LPC tile the National Map lists over the export bbox."""
    west, south, east, north = bbox_wgs84
    items, offset = [], 0
    while offset < TNM_MAX_ITEMS:
        query = urllib.parse.urlencode({'datasets': TNM_DATASET, 'bbox': f'{west},{south},{east},{north}',
                                        'max': TNM_PAGE, 'offset': offset, 'outputFormat': 'JSON'})
        page = fetch_json(f'{TNM_API}?{query}')
        batch = page.get('items') or []
        items += batch
        offset += len(batch)
        if not batch or offset >= (page.get('total') or 0):
            break
    return items


def tnm_projects(items, polygon):
    """Group tiles by project; keep a project only when its tiles' boxes
    cover the export. Newest inferred acquisition first, then newest
    publication; every rejection kept."""
    from shapely.geometry import box
    from shapely.ops import unary_union
    groups = {}
    for item in items:
        title, url, bb = item.get('title') or '', item.get('downloadURL') or '', item.get('boundingBox') or {}
        if not title.startswith(TNM_TITLE_PREFIX) or not url.lower().endswith('.laz'):
            continue
        try:
            tile_box = box(bb['minX'], bb['minY'], bb['maxX'], bb['maxY'])
        except (KeyError, TypeError):
            continue
        if not tile_box.intersects(polygon):
            continue
        name = title[len(TNM_TITLE_PREFIX):].rsplit(' ', 1)[0]
        groups.setdefault(name, []).append({'url': url, 'bytes': item.get('sizeInBytes'), 'box': tile_box,
                                            'published': item.get('publicationDate')})
    covering, rejected = [], []
    for name, tiles in groups.items():
        total = sum(t['bytes'] or 0 for t in tiles)
        if not unary_union([t['box'] for t in tiles]).buffer(1e-9).covers(polygon):
            rejected.append({'name': name, 'source': 'tnm_lpc', 'reason': 'tiles do not cover the terrain export'})
        elif total > TNM_PROJECT_MAX_BYTES or any((t['bytes'] or 0) > TNM_TILE_MAX_BYTES for t in tiles):
            rejected.append({'name': name, 'source': 'tnm_lpc', 'reason': f'{total} bytes exceeds the download cap'})
        else:
            covering.append({'name': name, 'source': 'tnm_lpc', 'url': TNM_API, 'acquisitionYearInferred': acquisition_year(name),
                             'published': max(t['published'] or '' for t in tiles), 'bytes': total,
                             'tiles': sorted((t['url'] for t in tiles))})
    covering.sort(key=lambda p: (p['acquisitionYearInferred'] or 0, p['published'], p['name']), reverse=True)
    return covering, rejected


def download(url, path, limit):
    with urllib.request.urlopen(url, timeout=600) as response, open(path, 'wb') as handle:
        h, size = hashlib.sha256(), 0
        for block in iter(lambda: response.read(1 << 20), b''):
            size += len(block)
            if size > limit:
                raise ValueError(f'{url} exceeds the {limit}-byte cap')
            h.update(block)
            handle.write(block)
    return h.hexdigest(), size


def mosaic(rasters, out):
    """Cell-wise max of per-tile CHMs on the same grid; nodata stays nodata."""
    import numpy as np
    first = gdal.Open(str(rasters[0]))
    merged = first.GetRasterBand(1).ReadAsArray().astype('float32')
    for path in rasters[1:]:
        dataset = gdal.Open(str(path))
        other = dataset.GetRasterBand(1).ReadAsArray().astype('float32')
        merged = np.where(merged == NODATA, other, np.where(other == NODATA, merged, np.maximum(merged, other)))
        dataset = None
    target = gdal.GetDriverByName('GTiff').CreateCopy(str(out), first)
    target.GetRasterBand(1).WriteArray(merged)
    target.GetRasterBand(1).SetNoDataValue(NODATA)
    target.FlushCache()
    target = first = None


def build_from_tiles(pdal, project, crs, extent, width, height, out_dir, chm_path, fetch=download):
    """Downloads run in parallel (the byte cap bounds disk); PDAL runs tile by
    tile so it holds one tile's points, and each LAZ is deleted once used."""
    from concurrent.futures import ThreadPoolExecutor
    work = out_dir / 'tiles'
    work.mkdir(parents=True, exist_ok=True)
    rasters, receipts = [], []
    try:
        lazs = [work / f'{index:03d}.laz' for index in range(len(project['tiles']))]
        with ThreadPoolExecutor(TNM_DOWNLOAD_WORKERS) as pool:
            fetched = list(pool.map(lambda pair: fetch(pair[0], pair[1], TNM_TILE_MAX_BYTES), zip(project['tiles'], lazs)))
        for url, laz, (digest, size) in zip(project['tiles'], lazs, fetched):
            tif = laz.with_suffix('.tif')
            run_pdal(pdal, tile_pipeline(laz, crs, extent, width, height, tif), work)
            laz.unlink(missing_ok=True)
            rasters.append(tif)
            receipts.append({'url': url, 'sha256': digest, 'bytes': size})
        mosaic(rasters, chm_path)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    return receipts


def raster_stats(path, width, height):
    dataset = gdal.Open(str(path))
    chm = dataset.GetRasterBand(1).ReadAsArray().astype(float)
    if chm.shape != (height, width):
        raise RuntimeError(f'CHM grid {chm.shape} is not the export grid {(height, width)}')
    data = chm != NODATA
    return {'coverageShare': round(float(data.mean()), 4),
            'treeShareOfCovered': round(float((chm[data] >= 3).mean()), 4) if data.any() else None,
            'maxHeightM': round(float(chm[data].max()), 2) if data.any() else None}


def file_sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('terrain_source', type=Path)
    parser.add_argument('output_dir', type=Path)
    parser.add_argument('--index-cache', type=Path, help='cached boundaries index (downloaded when absent)')
    parser.add_argument('--pdal', default=shutil.which('pdal') or '/opt/homebrew/bin/pdal')
    args = parser.parse_args()

    if not Path(args.pdal).is_file():
        raise SystemExit(f'LIDAR_PDAL_MISSING: no pdal binary at {args.pdal}')
    export_path = args.terrain_source / 'export.json'
    export = json.loads(export_path.read_text())
    extent, width, height = export['extent'], export['width'], export['height']
    crs = course_crs.export_epsg(export)
    px_x, px_y = (extent['xmax'] - extent['xmin']) / width, (extent['ymax'] - extent['ymin']) / height
    if abs(px_x - px_y) > 1e-6:
        raise SystemExit(f'terrain export pixels are not square ({px_x} x {px_y}); the CHM grid cannot match it')
    bounds = export_bounds_3857(extent, crs)

    cache = args.index_cache or (args.output_dir / 'resources.geojson')
    if not cache.is_file():
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(read(INDEX_URL, INDEX_MAX_BYTES))
    index_raw = cache.read_bytes()
    candidates = index_candidates(json.loads(index_raw), export_polygon_wgs84(extent, crs))
    covering, rejected = choose(candidates, lambda url: read(url, EPT_JSON_MAX_BYTES), bounds)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    chm_path = args.output_dir / 'chm.tif'
    manifest = {'schema': SCHEMA, 'retrievedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                'terrainExportSha256': file_sha256(export_path), 'crs': f'EPSG:{crs}', 'extent': {k: extent[k] for k in ('xmin', 'ymin', 'xmax', 'ymax')},
                'width': width, 'height': height, 'indexSha256': hashlib.sha256(index_raw).hexdigest(), 'indexUrl': INDEX_URL,
                'candidatesRejected': rejected, 'treeHeightMinM': 3, 'noiseClassesDropped': list(NOISE_CLASSES)}
    failures, thin, unusable = [], [], []

    def attempt(project, build):
        try:
            extra = build()
            stats = raster_stats(chm_path, width, height)
        except LidarProjectUnusable as error:
            unusable.append({'name': project['name'], 'source': project.get('source', 'ept'), 'reason': str(error)})
            chm_path.unlink(missing_ok=True)
            return False
        except (RuntimeError, OSError, ValueError) as error:
            failures.append({'name': project['name'], 'reason': str(error)})
            chm_path.unlink(missing_ok=True)
            return False
        if stats['coverageShare'] < COVERAGE_MIN:
            thin.append({'name': project['name'], 'source': project.get('source', 'ept'), 'coverageShare': stats['coverageShare'],
                         'reason': f'points cover {stats["coverageShare"]} of the export, below {COVERAGE_MIN}'})
            chm_path.unlink(missing_ok=True)
            return False
        manifest.update({'status': 'covered', 'project': {**project, **(extra or {})}, **stats, 'chmSha256': file_sha256(chm_path)})
        return True

    def from_ept(project):
        run_pdal(args.pdal, pipeline(project['url'], bounds, crs, extent, width, height, chm_path), args.output_dir)

    done = any(attempt({**project, 'source': 'ept'}, lambda project=project: from_ept(project)) for project in covering)
    if not done:
        polygon = export_polygon_wgs84(extent, crs)
        try:
            tiles_covering, tiles_rejected = tnm_projects(tnm_items(polygon.bounds, lambda url: json.loads(read(url, EPT_JSON_MAX_BYTES * 8))), polygon)
        except (OSError, ValueError) as error:
            tiles_covering, tiles_rejected = [], []
            failures.append({'name': 'tnm_lpc', 'reason': f'National Map listing failed: {error}'})
        rejected += tiles_rejected
        done = any(attempt(project, lambda project=project: {'tileReceipts': build_from_tiles(args.pdal, project, crs, extent, width, height, args.output_dir, chm_path)})
                   for project in tiles_covering)
    manifest.update({'failures': failures, 'candidatesThin': thin, 'candidatesUnusable': unusable})
    if not done:
        if failures:
            (args.output_dir / 'manifest.json').write_text(json.dumps({**manifest, 'status': 'failed'}, indent=2) + '\n')
            raise SystemExit(f'LIDAR_READ_FAILED: every covering project failed: {failures}')
        manifest['status'] = 'no_coverage'
    (args.output_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({k: manifest.get(k) for k in ('status', 'coverageShare', 'treeShareOfCovered', 'maxHeightM')} | {'project': (manifest.get('project') or {}).get('name')}))


if __name__ == '__main__':
    main()
