"""A small PIL-only PNG renderer: an auto-traced polygon (and, for the pilot
comparison, a hand trace) drawn over its source NAIP raster, for a human to
look at. No new geospatial policy lives here — just pixels."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from shapely.geometry import shape as shapely_shape

import course_raster as cr


def _stretch(band):
    lo, hi = np.percentile(band[np.isfinite(band)], (2, 98)) if np.isfinite(band).any() else (0, 1)
    if hi <= lo:
        hi = lo + 1
    return np.clip((band - lo) / (hi - lo) * 255, 0, 255).astype(np.uint8)


def _to_pixel(xy, geotransform):
    gt = geotransform
    det = gt[1] * gt[5] - gt[2] * gt[4]
    x, y = xy
    dx, dy = x - gt[0], y - gt[3]
    col = (gt[5] * dx - gt[2] * dy) / det
    row = (gt[1] * dy - gt[4] * dx) / det
    return col, row


def render_trace_overlay(naip, epsg, features, package, out_path, hand_trace_ring_wgs84=None):
    rgb = np.stack([_stretch(naip.array[i]) for i in (0, 1, 2)], axis=-1)
    image = Image.fromarray(rgb, mode='RGB').convert('RGBA')
    draw = ImageDraw.Draw(image)
    for feature in features:
        polygon = cr.wgs84_to_epsg(shapely_shape({'type': 'Polygon', 'coordinates': [feature['coordinatesWgs84']]}), epsg)
        pixels = [_to_pixel(xy, naip.geotransform) for xy in polygon.exterior.coords]
        draw.line(pixels + [pixels[0]], fill=(255, 60, 60, 255), width=3)
    if hand_trace_ring_wgs84:
        polygon = cr.wgs84_to_epsg(shapely_shape({'type': 'Polygon', 'coordinates': [hand_trace_ring_wgs84]}), epsg)
        pixels = [_to_pixel(xy, naip.geotransform) for xy in polygon.exterior.coords]
        draw.line(pixels + [pixels[0]], fill=(60, 140, 255, 255), width=3)
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    image.convert('RGB').save(out_path)
