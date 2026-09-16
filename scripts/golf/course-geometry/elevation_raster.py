"""Decode an immutable elevation GeoTIFF into a float array plus its nodata mask.

GDAL is the reference decoder: Pillow silently mis-decodes some tiled Float32
exports (the PA_WesternPA_2019_D20 course export decoded to 3e38 values under
Pillow while GDAL read it correctly). Pillow remains a fallback only when the
osgeo bindings are absent, and the caller records which decoder produced the
array so a review can tell the two apart.
"""
import numpy as np

try:
    from osgeo import gdal
    gdal.UseExceptions()
except ImportError:  # pragma: no cover - exercised only where GDAL is missing
    gdal = None


def read_elevation(path):
    """Return (raster, nodata, decoder). Nodata pixels are already NaN."""
    if gdal is not None:
        dataset = gdal.Open(str(path))
        band = dataset.GetRasterBand(1)
        raster = band.ReadAsArray().astype(float)
        nodata = band.GetNoDataValue()
        decoder = 'gdal'
    else:
        from PIL import Image
        with Image.open(path) as image:
            raster = np.asarray(image, dtype=float)
            tag = image.tag_v2.get(42113)
        nodata = None if tag is None else float(str(tag).strip('\x00'))
        decoder = 'pillow'
    if nodata is not None:
        # Honor an explicit nodata tag, including a zero sentinel. A genuine
        # zero elevation otherwise remains a valid measurement.
        raster = np.where(raster == nodata, np.nan, raster)
    return raster, nodata, decoder


def empty_fraction(raster):
    """Share of pixels that carry no elevation: NaN, or the image service's
    implicit zero fill outside a locked tile's real data."""
    return float((~np.isfinite(raster) | (raster == 0)).mean())
