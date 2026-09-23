#!/usr/bin/env python3
"""Whole-course route overview PNG -- the owner review input for a proposed
route (Phase D1 `ship --confirm-route`), and optionally for an OSM-routed
layout too, since the per-hole contact sheet has no way to show hole ORDER.

Next to the map (a NAIP export with every hole's numbered tee->green line,
hole numbers at the tee) it draws a per-hole table of scorecard vs measured
(straight-line) yards and confidence, so an owner can approve or reject the
order and the individual holes from one image.

Two input shapes feed the same renderer:
  * `auto-route-v1` (`layout.routes.propose`'s own `route-proposal.json`,
    a `golfhelm-factory-route-proposal-v1`-shaped doc with `features`/
    `report`) is used as-is -- it already carries every hole's measured
    yardage and the proposer's confidence.
  * an OSM-sourced or catalog-pinned route (`routes.json`'s `routeWayIds`)
    has no such document, so `synthesize_doc_from_osm` builds an
    equivalent `{'features', 'report'}` shape straight from the numbered
    `golf=hole` ways: tee = the way's first node, green = its last node,
    confidence is not a proposer score (there is none) so it is reported
    as the resolution source instead (e.g. "osm_ref_unique (resolved)").

No retained NAIP export is a normal state (not every facility in this
factory has one yet, e.g. a course with only an OSM-context extract) so
`render_overview` also has a raster-less fallback: it projects every hole
into local UTM metres and draws the same lines on a plain background
instead of failing outright. An owner reviewing route ORDER over blank
ground is materially more useful than a missing PNG.

Ownership: this script belongs to `layout.routes.propose`'s ship-side
review work (task item 5, "order checkable at approval"). It reads
`overlay_png.py`'s and `course_raster.py`'s public helpers but does not
edit either file.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from shapely.geometry import Polygon, shape as shapely_shape

import course_raster as cr
from course_crs import utm_epsg
from factory import osm as osmlib

YARD_TO_M = 0.9144
MAP_MAX_WIDTH_PX = 1600
MAP_MAX_HEIGHT_PX = 1400
FALLBACK_MARGIN_M = 40.0
FALLBACK_MAX_PX_PER_M = 4.0

TABLE_COLUMNS = [
    ('Hole', 46), ('Par', 46), ('Scorecard yds', 118), ('Measured yds', 118),
    ('Delta yds', 80), ('Confidence', 210),
]
TABLE_ROW_H = 22
TABLE_HEADER_H = 26
TABLE_PAD = 12


def _xy(lonlat, epsg):
    point = cr.wgs84_to_epsg(cr.to_shapely({'type': 'Point', 'coordinates': list(lonlat)}), epsg)
    return (point.x, point.y)


def _dist(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


def _stretch(band):
    finite = band[np.isfinite(band)]
    lo, hi = np.percentile(finite, (2, 98)) if finite.size else (0, 1)
    if hi <= lo:
        hi = lo + 1
    return np.clip((band - lo) / (hi - lo) * 255, 0, 255).astype(np.uint8)


def _raster_project(naip):
    gt = naip.geotransform
    det = gt[1] * gt[5] - gt[2] * gt[4]

    def project(xy):
        x, y = xy
        dx, dy = x - gt[0], y - gt[3]
        col = (gt[5] * dx - gt[2] * dy) / det
        row = (gt[1] * dy - gt[4] * dx) / det
        return col, row
    return project


def _fallback_project(all_xy):
    xs = [p[0] for p in all_xy]
    ys = [p[1] for p in all_xy]
    minx, maxx = min(xs) - FALLBACK_MARGIN_M, max(xs) + FALLBACK_MARGIN_M
    miny, maxy = min(ys) - FALLBACK_MARGIN_M, max(ys) + FALLBACK_MARGIN_M
    width_m, height_m = max(maxx - minx, 1.0), max(maxy - miny, 1.0)
    scale = min(MAP_MAX_WIDTH_PX / width_m, MAP_MAX_HEIGHT_PX / height_m, FALLBACK_MAX_PX_PER_M)
    width_px, height_px = max(int(width_m * scale), 200), max(int(height_m * scale), 200)

    def project(xy):
        x, y = xy
        return (x - minx) * scale, (maxy - y) * scale
    return project, width_px, height_px


def _scorecard_by_ordinal(scorecard):
    """Normalizes either scorecard shape retained in this repo: the raw
    catalog card (`{'holes': [{'hole', 'par', 'yards'}, ...]}`, what
    `ctx.scorecard()`/`ctx.route_proposal_scorecard()` read) and the
    validated `scorecard.json` a layout retains on disk
    (`{'pars': [...], 'scorecardYards': [...]}`, ordinal = list index + 1)."""
    if not scorecard:
        return {}
    if scorecard.get('holes'):
        return {h['hole']: {'par': h.get('par'), 'yards': h.get('yards')} for h in scorecard['holes']}
    pars, yards = scorecard.get('pars') or [], scorecard.get('scorecardYards') or []
    return {i + 1: {'par': (pars[i] if i < len(pars) else None), 'yards': (yards[i] if i < len(yards) else None)}
            for i in range(max(len(pars), len(yards)))}


def synthesize_doc_from_osm(routes_doc, extract, scorecard, layout_name=None):
    """`{'features', 'report'}` for a resolved OSM/catalog route -- see the
    module docstring. `extract` is the Overpass-shaped dict
    (`factory.osm.load_extract`'s return), not a path."""
    way_ids = routes_doc.get('routeWayIds') or []
    by_id = {el['id']: el for el in extract.get('elements', []) if el.get('type') == 'way'}
    scorecard_by_ordinal = _scorecard_by_ordinal(scorecard)
    origin = None
    for way_id in way_ids:
        pts = osmlib.way_points(by_id[way_id]) if way_id in by_id else []
        if pts:
            origin = pts[0]
            break
    epsg = utm_epsg(*origin) if origin else None
    features, report = [], []
    for index, way_id in enumerate(way_ids):
        ordinal = index + 1
        hole_key = f'hole-{ordinal}'
        card_row = scorecard_by_ordinal.get(ordinal) or {}
        par = card_row.get('par')
        scorecard_yards = card_row.get('yards')
        pts = osmlib.way_points(by_id[way_id]) if way_id in by_id else []
        if len(pts) < 2:
            report.append({'ordinal': ordinal, 'holeKey': hole_key, 'decision': 'unassigned',
                           'par': par, 'scorecardYards': scorecard_yards, 'wayId': way_id})
            continue
        tee, green = pts[0], pts[-1]
        features.append({'id': f'{hole_key}-route', 'kind': 'route',
                         'geometryWgs84': {'type': 'LineString', 'coordinates': [list(tee), list(green)]}})
        straight_yards = None
        if epsg:
            straight_yards = round(_dist(_xy(tee, epsg), _xy(green, epsg)) / YARD_TO_M, 1)
        delta = (round(straight_yards - scorecard_yards, 1)
                 if straight_yards is not None and scorecard_yards is not None else None)
        report.append({'ordinal': ordinal, 'holeKey': hole_key, 'decision': 'proposed', 'par': par,
                       'scorecardYards': scorecard_yards, 'straightLineYards': straight_yards,
                       'yardageDeltaYards': delta, 'confidence': 1.0,
                       'confidenceLabel': f'{routes_doc.get("source")} (resolved)', 'wayId': way_id})
    return {'kind': 'golfhelm-route-overview-osm-source-v1', 'layoutName': layout_name,
           'features': features, 'report': report}


def _all_route_points_wgs84(doc):
    points = []
    for feature in doc['features']:
        if feature.get('kind') == 'route':
            points.extend(feature['geometryWgs84']['coordinates'])
    return points


def _faint_osm_polygons(extract):
    """Every `golf=tee`/`golf=green` way in `extract`, as `(kind, [lonlat,
    ...])` closed-ring points -- drawn faintly under the routes so an owner
    can see the actual tee/green shapes a proposal or resolution worked
    from, not just the tee->green line. Mirrors `propose-routes.py`'s
    `_way_polygon` closed-ring/validity check; not imported from there,
    since that script is a standalone CLI (hyphenated name), not a shared
    module -- this is a five-line tag filter, not the routing algorithm."""
    polygons = []
    for element in (extract or {}).get('elements', []):
        if element.get('type') != 'way':
            continue
        golf = (element.get('tags') or {}).get('golf')
        if golf not in ('tee', 'green'):
            continue
        points = osmlib.way_points(element)
        if len(points) < 4 or points[0] != points[-1]:
            continue
        polygon = Polygon(points)
        if polygon.is_empty or not polygon.is_valid or polygon.area <= 0:
            continue
        polygons.append((golf, points))
    return polygons


def render_overview(doc, out_path, naip=None, naip_epsg=None, extract=None, layout_name=None, caption=None):
    """Draw `doc` (a `{'features', 'report'}` mapping -- see
    `synthesize_doc_from_osm` and `layout.routes.propose`'s own
    `route-proposal.json`) as a numbered tee->green map with a per-hole
    table underneath. `naip`/`naip_epsg` are optional: without them the map
    falls back to a plain local-projection background so a facility with no
    retained NAIP export still gets a reviewable overview -- but that
    fallback is called out in a title strip above the map so it is never
    mistaken for a real aerial background. `extract` (an already-loaded
    Overpass dict) is also optional: when given, every `golf=tee`/
    `golf=green` way is drawn faintly under the routes."""
    by_id = {f['id']: f for f in doc['features']}
    route_points = _all_route_points_wgs84(doc)
    if naip is not None:
        rgb = np.stack([_stretch(naip.array[i]) for i in (0, 1, 2)], axis=-1)
        map_image = Image.fromarray(rgb, mode='RGB').convert('RGBA')
        project = _raster_project(naip)
        to_px = lambda lonlat: project(cr.wgs84_to_epsg(shapely_shape({'type': 'Point', 'coordinates': lonlat}), naip_epsg).coords[0])  # noqa: E731
    else:
        if not route_points:
            raise ValueError('no route points to render (no resolved holes)')
        epsg = utm_epsg(*route_points[0])
        all_xy = [_xy(p, epsg) for p in route_points]
        project, width_px, height_px = _fallback_project(all_xy)
        map_image = Image.new('RGBA', (width_px, height_px), (235, 240, 230, 255))
        to_px = lambda lonlat: project(_xy(lonlat, epsg))  # noqa: E731

    font = ImageFont.load_default(size=20)
    small_font = ImageFont.load_default(size=13)
    table_font = ImageFont.load_default(size=14)

    if extract is not None:
        polygons = _faint_osm_polygons(extract)
        if polygons:
            # Drawn onto a transparent layer and alpha_composite'd in, not
            # onto map_image directly: ImageDraw only blends a fill's alpha
            # against a separate RGBA layer -- drawn straight onto
            # map_image the fill alpha is stored, not blended, and comes
            # out fully opaque the moment map_image is later flattened to
            # RGB for the canvas (hiding the very NAIP this exists to show).
            overlay = Image.new('RGBA', map_image.size, (0, 0, 0, 0))
            overlay_draw = ImageDraw.Draw(overlay)
            for kind, points in polygons:
                pts_px = [to_px(p) for p in points]
                if kind == 'green':
                    # Not (60,220,60): that is the high-confidence route
                    # color: a green polygon outline that shade would read,
                    # to an owner, as a confident route rather than an OSM
                    # green shape. Cyan is not in the confidence palette
                    # (green/orange/red) at all.
                    fill, outline = (0, 200, 210, 60), (0, 200, 210, 170)
                else:
                    # Not blue (reads as water on aerial imagery) and not
                    # orange/red (the mid/low-confidence route colors):
                    # violet is in neither set.
                    fill, outline = (170, 80, 220, 60), (170, 80, 220, 170)
                overlay_draw.polygon(pts_px, fill=fill, outline=outline)
            map_image = Image.alpha_composite(map_image, overlay)

    draw = ImageDraw.Draw(map_image)

    unassigned = []
    for row in doc['report']:
        if row['decision'] != 'proposed':
            unassigned.append(row['ordinal'])
            continue
        route = by_id[f"{row['holeKey']}-route"]
        tee_lonlat, green_lonlat = route['geometryWgs84']['coordinates']
        tee_px, green_px = to_px(tee_lonlat), to_px(green_lonlat)
        confidence = row.get('confidence')
        color = ((60, 220, 60, 255) if (confidence or 0.0) >= 0.6
                 else ((255, 165, 0, 255) if (confidence or 0.0) >= 0.3 else (255, 60, 60, 255)))
        draw.line([tee_px, green_px], fill=color, width=4)
        draw.ellipse([tee_px[0] - 6, tee_px[1] - 6, tee_px[0] + 6, tee_px[1] + 6], fill=(0, 120, 255, 255), outline=(0, 0, 0, 255))
        draw.ellipse([green_px[0] - 5, green_px[1] - 5, green_px[0] + 5, green_px[1] + 5], fill=(255, 255, 255, 255), outline=(0, 0, 0, 255))
        # Hole number AT THE TEE (not the midpoint): the tee is where an
        # owner walking the routing actually needs the number.
        label_xy = (tee_px[0] + 9, tee_px[1] - 9)
        draw.text(label_xy, str(row['ordinal']), fill=(255, 255, 0, 255), font=font, stroke_width=2, stroke_fill=(0, 0, 0, 255))

    footer_lines = []
    if naip is None:
        # ASCII "--", not an em dash: ImageFont.load_default() has no glyph
        # for U+2014 and silently draws a tofu box in its place.
        footer_lines.append('NO NAIP IMAGERY RETAINED FOR THIS FACILITY -- plain background (routes/order still reviewable)')
    if layout_name:
        footer_lines.append(layout_name)
    if unassigned:
        footer_lines.append(f'Unassigned slots: {", ".join(str(n) for n in unassigned)}')
    if caption:
        footer_lines.append(caption)
    # A separate strip between the map and the table, not a translucent band
    # overlaid on the map itself: the fallback's local-UTM crop is fit to
    # the route points with only a small margin, so an overlaid band could
    # cover a hole sitting near the bottom edge (as it did here for Bryan
    # Park's southernmost hole) instead of just dimming empty background.
    footer_pad = 8
    footer_height = 0
    if footer_lines:
        text = '\n'.join(footer_lines)
        measure = ImageDraw.Draw(Image.new('RGB', (1, 1)))
        bbox = measure.multiline_textbbox((0, 0), text, font=small_font)
        footer_height = (bbox[3] - bbox[1]) + 2 * footer_pad

    table_width = sum(w for _, w in TABLE_COLUMNS) + 2 * TABLE_PAD
    table_height = TABLE_HEADER_H + TABLE_ROW_H * len(doc['report']) + 2 * TABLE_PAD
    canvas_width = max(map_image.width, table_width)
    canvas = Image.new('RGB', (canvas_width, footer_height + map_image.height + table_height), (255, 255, 255))
    table_draw = ImageDraw.Draw(canvas)
    if footer_lines:
        # Above the map, not below: this is the image's title (the "no
        # imagery" line an owner must read before judging the routes),
        # not a caption for the table underneath.
        table_draw.rectangle([0, 0, canvas_width, footer_height], fill=(20, 20, 20))
        table_draw.multiline_text((footer_pad, footer_pad), text, fill=(255, 255, 255, 255), font=small_font)
    canvas.paste(map_image.convert('RGB'), (0, footer_height))
    y = footer_height + map_image.height + TABLE_PAD
    x = TABLE_PAD
    for label, width in TABLE_COLUMNS:
        table_draw.text((x, y), label, fill=(0, 0, 0, 255), font=table_font)
        x += width
    y += TABLE_HEADER_H
    table_draw.line([(TABLE_PAD, y - 2), (TABLE_PAD + sum(w for _, w in TABLE_COLUMNS), y - 2)], fill=(0, 0, 0, 255), width=1)
    for row in sorted(doc['report'], key=lambda r: r['ordinal']):
        x = TABLE_PAD
        if row['decision'] == 'proposed':
            cells = [str(row['ordinal']), str(row.get('par') or '-'),
                     f"{row.get('scorecardYards'):.0f}" if row.get('scorecardYards') is not None else '-',
                     f"{row.get('straightLineYards'):.0f}" if row.get('straightLineYards') is not None else '-',
                     f"{row.get('yardageDeltaYards'):+.0f}" if row.get('yardageDeltaYards') is not None else '-',
                     row.get('confidenceLabel') or (f"{row['confidence']:.2f}" if row.get('confidence') is not None else '-')]
            fill = (0, 0, 0, 255)
        else:
            cells = [str(row['ordinal']), str(row.get('par') or '-'),
                     f"{row.get('scorecardYards'):.0f}" if row.get('scorecardYards') is not None else '-',
                     '-', '-', 'UNASSIGNED']
            fill = (180, 0, 0, 255)
        for value, (_, width) in zip(cells, TABLE_COLUMNS):
            table_draw.text((x, y), value, fill=fill, font=table_font)
            x += width
        y += TABLE_ROW_H

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path, optimize=True)
    return out_path


def build_overview(routes_doc, out_path, proposal_doc=None, extract=None, scorecard=None,
                   naip=None, naip_epsg=None, layout_name=None, caption=None):
    """Picks `proposal_doc` (an `auto-route-v1` `route-proposal.json`) when
    given, else synthesizes an equivalent doc from `routes_doc`'s
    `routeWayIds` plus `extract` (an already-loaded Overpass dict) and
    `scorecard`. Raises `ValueError` when neither input can produce a
    reviewable route (mirrors `resolved_routes`'s own precondition --
    callers should check that first). `extract`, when given, is also passed
    through to `render_overview` to draw the faint tee/green polygons --
    even when it was `proposal_doc`, not `extract`, that supplied the
    route features themselves."""
    if proposal_doc is not None:
        doc = proposal_doc
    elif routes_doc.get('routeWayIds') and extract is not None:
        doc = synthesize_doc_from_osm(routes_doc, extract, scorecard, layout_name=layout_name)
    else:
        raise ValueError('no proposal doc and no routeWayIds+extract to synthesize a route overview from')
    return render_overview(doc, out_path, naip=naip, naip_epsg=naip_epsg, extract=extract,
                           layout_name=layout_name, caption=caption)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--routes', required=True, help='routes.json (golfhelm-factory-routes-v1)')
    parser.add_argument('--proposal', help='route-proposal.json, required when routes.json source is auto-route-v1')
    parser.add_argument('--osm', help='Overpass extract (.json/.json.gz), required to synthesize an OSM-sourced overview')
    parser.add_argument('--scorecard', help='scorecard.json, for par/scorecard yards in the table')
    parser.add_argument('--naip', help='NAIP GeoTIFF; omitted falls back to a plain local-projection background')
    parser.add_argument('--layout-name', help='footer label')
    parser.add_argument('--caption', help='extra footer text (validation numbers, data caveats)')
    parser.add_argument('--out', required=True)
    args = parser.parse_args(argv)

    routes_doc = json.loads(Path(args.routes).read_text())
    proposal_doc = json.loads(Path(args.proposal).read_text()) if args.proposal else None
    scorecard = json.loads(Path(args.scorecard).read_text()) if args.scorecard else None
    extract = osmlib.load_extract(args.osm) if args.osm else None
    naip, naip_epsg = None, None
    if args.naip:
        naip = cr.read_raster(args.naip)
        naip_epsg = naip.epsg

    out = build_overview(routes_doc, args.out, proposal_doc=proposal_doc, extract=extract, scorecard=scorecard,
                         naip=naip, naip_epsg=naip_epsg, layout_name=args.layout_name, caption=args.caption)
    print(out, file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
