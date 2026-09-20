"""Offline canopy raster from verified source-locked facility imagery.

This derived, terrain-aligned raster is decoration evidence, not a new native
source or a physical surface. Unknown source pixels stay unknown. No network.
"""
import hashlib
import importlib.util
import json
import math
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pyproj
from osgeo import gdal

from factory.fingerprints import native_imagery_identity

gdal.UseExceptions()


def _acquisition():
    spec = importlib.util.spec_from_file_location('locked_naip', Path(__file__).with_name('fetch-usgs-naip-facility-ortho.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def acquire(index_path, directory, extent, size, epsg):
    index_path, directory = Path(index_path), Path(directory)
    index = _acquisition().validate_index(index_path)
    identity = native_imagery_identity(index)
    width, height = size
    if min(size) < 1 or width * height > 32_000_000:
        raise ValueError('Canopy analysis grid exceeds its bounded pixel budget')
    bounds = [extent[key] for key in ('xmin', 'ymin', 'xmax', 'ymax')]
    request = {'bounds': bounds, 'pixels': list(size), 'epsg': epsg, 'resampling': 'nearest'}
    manifest_path = directory / 'manifest.json'
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        if manifest.get('sourceIdentity') != identity or manifest.get('request') != request:
            raise ValueError('Retained canopy raster names different source pixels or frame; use a new cache')
        if hashlib.sha256((directory / 'naip.tif').read_bytes()).hexdigest() != manifest.get('rasterSha256'):
            raise ValueError('Retained canopy raster hash changed')
        return manifest
    directory.mkdir(parents=True, exist_ok=True)
    items = [json.loads((index_path.parent / 'tiles' / row['key'] / 'item.json').read_text()) for row in index['tiles']]
    paths = [str(index_path.parent / 'tiles' / row['key'] / 'ortho.tif') for row in index['tiles']]
    with tempfile.TemporaryDirectory(prefix='.canopy-', dir=directory) as tmp:
        vrt = gdal.BuildVRT(str(Path(tmp) / 'source.vrt'), paths,
                            options=gdal.BuildVRTOptions(options=['-ignore_srcmaskband']))
        raster = Path(tmp) / 'naip.tif'
        ds = gdal.Warp(str(raster), vrt, format='GTiff', dstSRS=f'EPSG:{epsg}',
                       outputBounds=bounds, width=width, height=height,
                       resampleAlg='near', srcAlpha=False, dstAlpha=False,
                       srcNodata='0 0 0 0', dstNodata=0,
                       warpOptions=['UNIFIED_SRC_NODATA=YES'],
                       creationOptions=['COMPRESS=DEFLATE', 'TILED=YES'])
        expected = (bounds[0], (bounds[2] - bounds[0]) / width, 0,
                    bounds[3], 0, -(bounds[3] - bounds[1]) / height)
        if (ds.RasterCount != 4 or (ds.RasterXSize, ds.RasterYSize) != tuple(size)
                or not pyproj.CRS.from_wkt(ds.GetProjection()).equals(pyproj.CRS.from_epsg(epsg))
                or not all(math.isclose(a, b, abs_tol=1e-7, rel_tol=0) for a, b in zip(ds.GetGeoTransform(), expected))):
            raise ValueError('Derived imagery does not match the terrain grid')
        # Retain unknown coverage explicitly; neither empty context nor sparse
        # source gaps are filled to make a complete-looking physical claim.
        valid_count = 0
        for y in range(0, height, 256):
            block = ds.ReadAsArray(0, y, width, min(256, height - y))
            valid_count += int(np.count_nonzero(np.any(block != 0, axis=0)))
        ds.FlushCache(); ds = None; vrt = None
        if not valid_count:
            raise ValueError('Source imagery does not overlap the terrain grid')
        dates = sorted({datetime.fromtimestamp(item['acquisition_date'] / 1000, timezone.utc).date().isoformat()
                        for item in items if isinstance(item.get('acquisition_date'), (int, float)) and item['acquisition_date'] > 0})
        raw = raster.read_bytes()
        manifest = {'schemaVersion': 2, 'provider': 'USGS NAIP Plus source-locked facility cache',
                    'service': index['source']['service'], 'request': request,
                    'sourceIdentity': identity, 'sourceIndexSha256': hashlib.sha256(index_path.read_bytes()).hexdigest(),
                    'catalogTiles': sorted({str(item.get('Name') or item['OBJECTID']) for item in items}),
                    'captureDates': dates, 'captureDateUnknownCount': sum(not item.get('acquisition_date') for item in items),
                    'nativeResolutionM': index['sourceResolutionMeters'], 'exportPixelM': [expected[1], -expected[5]],
                    'bands': ['red', 'green', 'blue', 'nir'], 'validPixelShare': valid_count / (width * height),
                    'unknownPixelPolicy': 'retain_unfilled_exclude_from_extraction',
                    'canMeasurePhysicalGeometry': False, 'truthClass': 'derived', 'reviewStatus': 'review_required',
                    'retrievedAt': datetime.now(timezone.utc).date().isoformat(),
                    'license': index['source']['licenseStatus'],
                    'rasterSha256': hashlib.sha256(raw).hexdigest(), 'rasterBytes': len(raw)}
        raster.replace(directory / 'naip.tif')
        pending = Path(tmp) / 'manifest.json'
        pending.write_text(json.dumps(manifest, indent=2) + '\n')
        pending.replace(manifest_path)
    return manifest
