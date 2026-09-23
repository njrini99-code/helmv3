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


def render_trace_overlay(naip, epsg, features, package, out_path, hand_trace_ring_wgs84=None, chm=None, chm_tree_min_m=None):
    rgb = np.stack([_stretch(naip.array[i]) for i in (0, 1, 2)], axis=-1)
    image = Image.fromarray(rgb, mode='RGB').convert('RGBA')
    if chm is not None and chm_tree_min_m is not None:
        # A translucent tint under the hard-exclusion threshold the tracer
        # actually used, so a reviewer can see whether a trace boundary
        # legitimately cleared the tree mask or is hugging it.
        chm_arr = chm.array[0]
        tree = chm_arr >= chm_tree_min_m
        tint = np.zeros((*tree.shape, 4), dtype=np.uint8)
        tint[tree] = (255, 120, 0, 120)
        image = Image.alpha_composite(image, Image.fromarray(tint, mode='RGBA'))
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


def render_route_overlay(naip, epsg, doc, out_path, extra_tee_candidates=None, caption=None):
    """A `propose-routes.py` result over its imagery: every proposed hole's
    tee->green line, numbered at its midpoint with `ordinal (confidence)`;
    every unassigned slot listed in a caption instead of drawn (there's
    nothing to draw); and, when given, every raw tee-complex candidate from
    `detect-tee-complexes.py` as a small marker (used or not) -- an owner
    reviewing this needs to see the detector's evidence, not just the
    winning picks. `caption`, if given, is drawn as a translucent footer
    band (validation numbers, data caveats)."""
    from PIL import ImageFont
    rgb = np.stack([_stretch(naip.array[i]) for i in (0, 1, 2)], axis=-1)
    image = Image.fromarray(rgb, mode='RGB').convert('RGBA')
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=20)
    small_font = ImageFont.load_default(size=13)

    by_id = {f['id']: f for f in doc['features']}
    if extra_tee_candidates:
        for cand in extra_tee_candidates:
            x, y = cr.wgs84_to_epsg(shapely_shape({'type': 'Point', 'coordinates': cand['centroidWgs84']}), epsg).coords[0]
            px, py = _to_pixel((x, y), naip.geotransform)
            r = 6
            draw.ellipse([px - r, py - r, px + r, py + r], outline=(255, 210, 0, 255), width=2)

    unassigned = []
    for row in doc['report']:
        if row['decision'] != 'proposed':
            unassigned.append(row['ordinal'])
            continue
        route = by_id[f"{row['holeKey']}-route"]
        (tee_lon, tee_lat), (green_lon, green_lat) = route['geometryWgs84']['coordinates']
        tee_xy = cr.wgs84_to_epsg(shapely_shape({'type': 'Point', 'coordinates': (tee_lon, tee_lat)}), epsg).coords[0]
        green_xy = cr.wgs84_to_epsg(shapely_shape({'type': 'Point', 'coordinates': (green_lon, green_lat)}), epsg).coords[0]
        tee_px, green_px = _to_pixel(tee_xy, naip.geotransform), _to_pixel(green_xy, naip.geotransform)
        confidence = row.get('confidence') or 0.0
        color = (60, 220, 60, 255) if confidence >= 0.6 else ((255, 165, 0, 255) if confidence >= 0.3 else (255, 60, 60, 255))
        draw.line([tee_px, green_px], fill=color, width=4)
        draw.ellipse([tee_px[0] - 5, tee_px[1] - 5, tee_px[0] + 5, tee_px[1] + 5], fill=(0, 120, 255, 255))
        draw.ellipse([green_px[0] - 5, green_px[1] - 5, green_px[0] + 5, green_px[1] + 5], fill=(255, 255, 255, 255), outline=(0, 0, 0, 255))
        mid = ((tee_px[0] + green_px[0]) / 2, (tee_px[1] + green_px[1]) / 2)
        label = f"{row['ordinal']} ({confidence:.2f})"
        draw.text(mid, label, fill=(255, 255, 0, 255), font=font, stroke_width=2, stroke_fill=(0, 0, 0, 255))

    footer_lines = []
    if unassigned:
        footer_lines.append(f'Unassigned slots: {", ".join(str(n) for n in unassigned)}')
    if caption:
        footer_lines.append(caption)
    if footer_lines:
        pad = 8
        text = '\n'.join(footer_lines)
        bbox = draw.multiline_textbbox((pad, image.height - pad), text, font=small_font, anchor='ld')
        band = Image.new('RGBA', image.size, (0, 0, 0, 0))
        band_draw = ImageDraw.Draw(band)
        band_draw.rectangle([0, bbox[1] - pad, image.width, image.height], fill=(0, 0, 0, 170))
        image = Image.alpha_composite(image, band)
        draw = ImageDraw.Draw(image)
        draw.multiline_text((pad, image.height - pad), text, fill=(255, 255, 255, 255), font=small_font, anchor='ld')

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    image.convert('RGB').save(out_path)
