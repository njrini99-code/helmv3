"""Shared raster/geometry helpers for the surface-trace and route-proposal
tools (Phase 2 items 1 and 6 of the course-factory replay plan).

Everything here is generic GDAL/shapely plumbing: reading a GeoTIFF into a
numpy array with its GeoTransform and EPSG, warping two rasters onto one
shared grid so pixel-for-pixel arithmetic is valid, WGS84 <-> projected-CRS
geometry transforms, a fast windowed standard deviation, and turning a
boolean raster mask back into a vector polygon. It carries no course-specific
policy; `derive-surface-traces.py` and `propose-routes.py` own that.
"""
from __future__ import annotations

import numpy as np
import pyproj
import shapely
from osgeo import gdal, ogr, osr
from shapely import wkt as shapely_wkt
from shapely.geometry import shape as shapely_shape
from shapely.ops import transform as shapely_transform, unary_union

gdal.UseExceptions()


class Raster:
    """An in-memory raster: bands as a (count, height, width) float64 array,
    its GDAL GeoTransform, EPSG code and per-band nodata value."""

    def __init__(self, array, geotransform, epsg, nodata):
        self.array = array
        self.geotransform = geotransform
        self.epsg = epsg
        self.nodata = nodata

    @property
    def shape(self):
        return self.array.shape[-2:]

    def pixel_size(self):
        return abs(self.geotransform[1]), abs(self.geotransform[5])

    def bounds(self):
        h, w = self.shape
        gt = self.geotransform
        x0, x1 = gt[0], gt[0] + gt[1] * w
        y1, y0 = gt[3], gt[3] + gt[5] * h
        return min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)

    def xy_grid(self):
        """Pixel-center (x, y) coordinate grids, in the raster's own CRS."""
        h, w = self.shape
        gt = self.geotransform
        cols = np.arange(w) + 0.5
        rows = np.arange(h) + 0.5
        col_grid, row_grid = np.meshgrid(cols, rows)
        xs = gt[0] + col_grid * gt[1] + row_grid * gt[2]
        ys = gt[3] + col_grid * gt[4] + row_grid * gt[5]
        return xs, ys


def _epsg_of(ds):
    srs = osr.SpatialReference(wkt=ds.GetProjection())
    if not (srs.IsProjected() or srs.IsGeographic()):
        return None
    srs.AutoIdentifyEPSG()
    code = srs.GetAuthorityCode(None)
    return int(code) if code else None


def read_raster(path):
    ds = gdal.Open(str(path))
    if ds is None:
        raise ValueError(f'Cannot open raster: {path}')
    array = ds.ReadAsArray().astype(np.float64)
    if array.ndim == 2:
        array = array[np.newaxis, :, :]
    nodata = [ds.GetRasterBand(i + 1).GetNoDataValue() for i in range(ds.RasterCount)]
    result = Raster(array, ds.GetGeoTransform(), _epsg_of(ds), nodata)
    ds = None
    return result


def warp_to_grid(path, epsg, bounds, pixel_size, resample='bilinear'):
    """Warp a raster on disk onto an explicit CRS/extent/resolution grid, in
    memory. `bounds` is (xmin, ymin, xmax, ymax) in the target CRS."""
    xres, yres = pixel_size
    width = max(1, int(round((bounds[2] - bounds[0]) / xres)))
    height = max(1, int(round((bounds[3] - bounds[1]) / yres)))
    options = gdal.WarpOptions(dstSRS=f'EPSG:{epsg}', outputBounds=bounds, width=width, height=height,
                                resampleAlg=resample, format='MEM')
    ds = gdal.Warp('', str(path), options=options)
    if ds is None:
        raise ValueError(f'Warp failed for {path}')
    array = ds.ReadAsArray().astype(np.float64)
    if array.ndim == 2:
        array = array[np.newaxis, :, :]
    nodata = [ds.GetRasterBand(i + 1).GetNoDataValue() for i in range(ds.RasterCount)]
    result = Raster(array, ds.GetGeoTransform(), epsg, nodata)
    ds = None
    return result


def transformer(src_epsg, dst_epsg):
    return pyproj.Transformer.from_crs(f'EPSG:{src_epsg}', f'EPSG:{dst_epsg}', always_xy=True)


def project_geometry(geometry, src_epsg, dst_epsg):
    if src_epsg == dst_epsg:
        return geometry
    tf = transformer(src_epsg, dst_epsg)
    return shapely_transform(lambda x, y, z=None: tf.transform(x, y), geometry)


def wgs84_to_epsg(geometry, epsg):
    return project_geometry(geometry, 4326, epsg)


def epsg_to_wgs84(geometry, epsg):
    return project_geometry(geometry, epsg, 4326)


def distance_to_geometry(xs, ys, geometry):
    """Per-pixel distance from a grid of (x, y) points to `geometry`, in the
    grid's own units. Vectorized over `shapely.distance`."""
    points = shapely.points(xs.ravel(), ys.ravel())
    return shapely.distance(points, geometry).reshape(xs.shape)


def binary_opening(mask, radius_m, pixel_m):
    """Erosion then dilation with a square structuring element sized to
    `radius_m`: drops thin noise bridges (a fence line, a cart-path sliver)
    without doing anything when `radius_m` is 0."""
    if radius_m <= 0:
        return mask
    from scipy.ndimage import binary_opening as _opening
    radius_px = max(1, int(round(radius_m / max(pixel_m[0], 1e-6))))
    structure = np.ones((2 * radius_px + 1, 2 * radius_px + 1))
    return _opening(mask, structure=structure)


def local_std(array, size):
    """Windowed standard deviation via uniform-filter moments: O(n), unlike
    `scipy.ndimage.generic_filter(np.std, ...)`."""
    from scipy.ndimage import uniform_filter
    mean = uniform_filter(array, size=size, mode='nearest')
    mean_sq = uniform_filter(array * array, size=size, mode='nearest')
    variance = np.clip(mean_sq - mean * mean, 0, None)
    return np.sqrt(variance)


def largest_component(mask, seed_mask=None):
    """The largest 4-connected True region of `mask`. When `seed_mask` is
    given, only components that touch it at all are eligible — this is how
    the segmentation stays anchored to the hole's own route instead of
    picking an unrelated turf patch elsewhere in the raster."""
    from scipy.ndimage import label
    labeled, count = label(mask)
    if count == 0:
        return np.zeros_like(mask, dtype=bool)
    if seed_mask is not None:
        touched = set(int(v) for v in np.unique(labeled[seed_mask]) if v > 0)
        if not touched:
            return np.zeros_like(mask, dtype=bool)
        sizes = {i: int((labeled == i).sum()) for i in touched}
    else:
        sizes = {i: int((labeled == i).sum()) for i in range(1, count + 1)}
    best = max(sizes, key=sizes.get)
    return labeled == best


def polygonize_mask(mask, geotransform, epsg):
    """The mask's True region as one shapely polygon (holes merged away) in
    the raster's own CRS, or None when the mask is empty."""
    if not mask.any():
        return None
    driver = gdal.GetDriverByName('MEM')
    ds = driver.Create('', mask.shape[1], mask.shape[0], 1, gdal.GDT_Byte)
    ds.SetGeoTransform(geotransform)
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(epsg)
    ds.SetProjection(srs.ExportToWkt())
    band = ds.GetRasterBand(1)
    band.WriteArray(mask.astype(np.uint8))
    band.SetNoDataValue(0)
    mem_driver = ogr.GetDriverByName('Memory')
    ogr_ds = mem_driver.CreateDataSource('polygons')
    layer = ogr_ds.CreateLayer('mask', srs=srs)
    layer.CreateField(ogr.FieldDefn('value', ogr.OFTInteger))
    gdal.Polygonize(band, band, layer, 0, [], callback=None)
    polygons = []
    for feature in layer:
        if feature.GetField('value') != 1:
            continue
        geom = feature.GetGeometryRef()
        if geom is not None:
            polygons.append(shapely_wkt.loads(geom.ExportToWkt()))
    ds = None
    ogr_ds = None
    if not polygons:
        return None
    merged = unary_union(polygons)
    return merged


def largest_polygon(geometry):
    if geometry.geom_type == 'Polygon':
        return geometry
    return max(geometry.geoms, key=lambda g: g.area)


def iou(polygon_a, polygon_b):
    if polygon_a.is_empty or polygon_b.is_empty:
        return 0.0
    inter = polygon_a.intersection(polygon_b).area
    union = polygon_a.union(polygon_b).area
    return inter / union if union else 0.0


def to_shapely(geometry_wgs84):
    return shapely_shape(geometry_wgs84)
