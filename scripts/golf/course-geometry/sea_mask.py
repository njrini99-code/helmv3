"""Sea/land classification from OpenStreetMap coastline ways.

A coastal terrain export can be legitimately empty over open water: the
imagery/elevation service returns literal zero (or nodata) fill there
because there is no land elevation to report, not because the source has a
real gap. `compile-course-terrain.py`'s `MAX_EMPTY_EXPORT_FRACTION` gate
cannot tell those two causes apart on its own -- this module gives it a
second signal: an explicit sea polygon, built from the facility's own OSM
context snapshot, so an acquisition can accept empty fill *only* where it
falls inside that polygon and keep rejecting it everywhere else, unchanged.

OSM convention: a `natural=coastline` way is drawn with land on its LEFT in
the direction the way runs (https://wiki.openstreetmap.org/wiki/Tag:natural%3Dcoastline).
An island/rock is usually one closed way; a long shoreline is usually many
ways that share endpoint nodes and have to be joined before they mean
anything geometrically.

Algorithm
---------
1. `merge_ways` joins coastline ways into maximal chains by shared OSM node
   ids. A way whose first and last node id already match is a closed ring
   (island, rock, atoll) and is kept separate from the open chains.
2. Every chain/ring is projected into the caller's CRS. An open chain whose
   endpoint lands strictly inside the (padded) bounding box -- real,
   unmapped-further coastline, not a clipping artifact -- is extended along
   its terminal bearing until it leaves the box, so it can still close a
   face against the box edge.
3. The bbox boundary plus every clipped chain and ring is handed to
   `shapely.ops.polygonize`, splitting the box into faces along the
   coastline linework.
4. Each face is classified sea/land by sampling several interior points and
   voting on which side (left=land, right=sea) of the *nearest* coastline
   segment each one falls. A short, isolated scrap of line cannot flip an
   entire face on a single probe.
5. The union of sea faces is buffered by `tolerance_m` to absorb
   coastline/DEM misregistration, then returned.

No coastline ways at all -> `None`. Never an empty/degenerate polygon, so a
caller can treat "mask is None" as "not a coastal export" without a special
case, and an inland layout's behavior is provably unchanged.
"""
import gzip
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box
from shapely.ops import polygonize, unary_union

# Sea fill can never collapse back into "empty" on a later read.
# `elevation_raster.empty_fraction` treats literal 0.0 as empty -- that is
# the ImageServer's own convention for "fill outside a locked tile," which
# is exactly the ambiguity this module exists to resolve. Filling with an
# *exact* 0.0 would make every sea cell re-read as empty the next time
# anything recomputes `empty_fraction` over the retained raster (a re-run,
# a review tool, a future validation pass), silently reintroducing the bug
# this module fixes. 1 millimeter is indistinguishable from mean sea level
# for terrain, slope, or mesh purposes, but is never exactly zero.
SEA_FILL_VALUE_M = 0.001
# Coastline linework and the DEM are independently produced and not
# co-registered; a pixel within this distance of the mapped coastline is
# treated as ambiguous and folded into the sea side rather than rejected.
SEA_FILL_TOLERANCE_M = 3.0
# How far past the export bbox a coastline chain that dangles inside it is
# extended before re-clipping, and how far the bbox is padded before that
# containment test (an endpoint sitting exactly on the padded boundary must
# not look "dangling").
DANGLE_PAD_M = 200.0


def coastline_ways_from_snapshot(gz_path):
    """(ways, snapshotSha256) from a facility osm-context `overpass.json.gz`.

    `ways` is the raw list of `natural=coastline` elements (Overpass `out
    geom` shape: `nodes` + parallel `geometry` of `{lat, lon}`). The sha256
    is of the exact compressed file on disk -- the same bytes the osm-context
    snapshot pointer already treats as immutable evidence -- so it can be
    recorded as the sea mask's basis without re-deriving it from the whole
    facility context manifest.
    """
    gz_path = Path(gz_path)
    raw = gz_path.read_bytes()
    doc = json.loads(gzip.decompress(raw))
    ways = [el for el in doc.get('elements', [])
            if el.get('type') == 'way' and el.get('tags', {}).get('natural') == 'coastline' and el.get('geometry')]
    return ways, hashlib.sha256(raw).hexdigest()


def coastline_geometry_digest(ways):
    """A factory-input digest of the coastline geometry actually used: way
    ids plus their coordinates, so an edit to a way's shape under the same
    id (a node dragged, a tag re-tagged) changes this even though the id
    list alone would not. This is what `layout.terrain.acquire`'s fingerprint
    should include when a coastline reaches the AOI -- not the whole
    snapshot's sha256, so an unrelated OSM edit elsewhere in the facility's
    context (a bunker retraced, a tree added) does not force a re-acquire.
    """
    ordered = sorted(ways, key=lambda w: w.get('id', 0))
    return {'coastlineWayIds': [int(w['id']) for w in ordered if 'id' in w],
            'coordinatesHash': hashlib.sha256(json.dumps(
                [[[round(pt['lon'], 7), round(pt['lat'], 7)] for pt in w.get('geometry') or []] for w in ordered],
                separators=(',', ':')).encode('utf-8')).hexdigest()}


def coastline_basis(ways, snapshot_sha256):
    """The evidentiary basis recorded in a source manifest's `seaFill`: which
    ways, and the exact immutable snapshot they were read from. Unlike
    `coastline_geometry_digest`, this is meant to be read by a person
    auditing one acquired source, not compared across runs to decide whether
    to re-acquire -- so it deliberately includes `snapshotSha256`, even
    though two snapshots that happen to reuse the same coastline geometry
    would then show different bases here."""
    return {'coastlineWayIds': sorted(int(w['id']) for w in ways if 'id' in w),
            'snapshotSha256': snapshot_sha256}


def merge_ways(ways):
    """Join coastline ways sharing endpoint node ids into maximal chains.

    Returns (chains, rings): each a list of point lists `[(lon, lat), ...]`.
    A way already closed (`nodes[0] == nodes[-1]`) is a ring on its own --
    coastline rings do not chain with other ways in practice, and merging
    them would risk stitching an island onto an unrelated shoreline that
    happens to share a node id.
    """
    open_chains = []  # each: {'nodes': [id...], 'points': [(lon,lat)...]}
    rings = []
    for way in ways:
        nodes = way.get('nodes') or []
        geometry = way.get('geometry') or []
        if len(nodes) != len(geometry) or len(nodes) < 2:
            continue
        points = [(pt['lon'], pt['lat']) for pt in geometry]
        if nodes[0] == nodes[-1]:
            rings.append(points)
        else:
            open_chains.append({'nodes': list(nodes), 'points': points})

    merged = True
    while merged and len(open_chains) > 1:
        merged = False
        for i in range(len(open_chains)):
            if merged:
                break
            for j in range(len(open_chains)):
                if i == j:
                    continue
                a, b = open_chains[i], open_chains[j]
                if a['nodes'][-1] == b['nodes'][0]:
                    a['nodes'] = a['nodes'] + b['nodes'][1:]
                    a['points'] = a['points'] + b['points'][1:]
                elif a['nodes'][-1] == b['nodes'][-1]:
                    a['nodes'] = a['nodes'] + list(reversed(b['nodes']))[1:]
                    a['points'] = a['points'] + list(reversed(b['points']))[1:]
                elif a['nodes'][0] == b['nodes'][-1]:
                    a['nodes'] = b['nodes'] + a['nodes'][1:]
                    a['points'] = b['points'] + a['points'][1:]
                elif a['nodes'][0] == b['nodes'][0]:
                    a['nodes'] = list(reversed(b['nodes'])) + a['nodes'][1:]
                    a['points'] = list(reversed(b['points'])) + a['points'][1:]
                else:
                    continue
                del open_chains[j]
                if a['nodes'][0] == a['nodes'][-1]:
                    rings.append(a['points'])
                    del open_chains[i]
                merged = True
                break

    chains = [c['points'] for c in open_chains]
    return chains, rings


def _project(points, transformer):
    xs, ys = transformer.transform([p[0] for p in points], [p[1] for p in points])
    return list(zip(xs, ys))


def _extend_dangling_endpoints(line, padded_bbox):
    """Extend an endpoint that sits strictly inside `padded_bbox` -- a real
    end of the mapped coastline, not a clip artifact -- out past the box
    along its terminal bearing, so `polygonize` can still close a face
    against it."""
    coords = list(line.coords)
    if len(coords) < 2:
        return line
    diag = math.hypot(padded_bbox.bounds[2] - padded_bbox.bounds[0], padded_bbox.bounds[3] - padded_bbox.bounds[1])

    def extend(p, ref):
        px, py = p
        rx, ry = ref
        dx, dy = px - rx, py - ry
        norm = math.hypot(dx, dy)
        if norm == 0:
            return None
        return (px + dx / norm * diag, py + dy / norm * diag)

    start_changed = padded_bbox.covers(Point(coords[0]))
    end_changed = padded_bbox.covers(Point(coords[-1]))
    if start_changed:
        ext = extend(coords[0], coords[1])
        if ext is not None:
            coords = [ext] + coords
    if end_changed:
        ext = extend(coords[-1], coords[-2])
        if ext is not None:
            coords = coords + [ext]
    return LineString(coords) if (start_changed or end_changed) else line


def _as_linestrings(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == 'LineString':
        return [geom] if len(geom.coords) >= 2 else []
    if geom.geom_type == 'MultiLineString':
        return [g for g in geom.geoms if len(g.coords) >= 2]
    if geom.geom_type == 'GeometryCollection':
        out = []
        for g in geom.geoms:
            out += _as_linestrings(g)
        return out
    return []


def _segments(points):
    return [(points[i], points[i + 1]) for i in range(len(points) - 1)]


def _classify_points(xs, ys, seg_p1, seg_p2):
    """+1 = left of the nearest coastline segment's direction (land, OSM
    convention), -1 = right (sea). Vectorized nearest-segment side test."""
    xs = np.asarray(xs, dtype=float)
    ys = np.asarray(ys, dtype=float)
    seg_vec = seg_p2 - seg_p1
    seg_len2 = (seg_vec ** 2).sum(axis=1)
    seg_len2 = np.where(seg_len2 == 0, 1e-12, seg_len2)
    wx = xs[:, None] - seg_p1[None, :, 0]
    wy = ys[:, None] - seg_p1[None, :, 1]
    t = np.clip((wx * seg_vec[None, :, 0] + wy * seg_vec[None, :, 1]) / seg_len2[None, :], 0, 1)
    cx = seg_p1[None, :, 0] + t * seg_vec[None, :, 0]
    cy = seg_p1[None, :, 1] + t * seg_vec[None, :, 1]
    dist2 = (xs[:, None] - cx) ** 2 + (ys[:, None] - cy) ** 2
    idx = np.argmin(dist2, axis=1)
    chosen_vec = seg_vec[idx]
    chosen_p1 = seg_p1[idx]
    cross = chosen_vec[:, 0] * (ys - chosen_p1[:, 1]) - chosen_vec[:, 1] * (xs - chosen_p1[:, 0])
    return np.where(cross > 0, 1, -1)


def _sample_interior_points(face, n=5):
    pts = []
    rp = face.representative_point()
    pts.append((rp.x, rp.y))
    minx, miny, maxx, maxy = face.bounds
    for i in (1, 2, 3):
        for j in (1, 2, 3):
            if len(pts) >= n:
                break
            candidate = Point(minx + (maxx - minx) * i / 4, miny + (maxy - miny) * j / 4)
            if face.contains(candidate):
                pts.append((candidate.x, candidate.y))
        if len(pts) >= n:
            break
    return pts


def build_mask_from_projected(chains, rings, bbox, tolerance_m=SEA_FILL_TOLERANCE_M, dangle_pad_m=DANGLE_PAD_M):
    """Core, projection-agnostic algorithm: `chains`/`rings` are already in
    the target CRS (lists of `(x, y)` point lists). Kept separate from
    `build_sea_mask` so the geometry itself is unit-testable without a real
    coastline snapshot or a real projection."""
    if not chains and not rings:
        return None
    bbox_poly = box(*bbox)
    padded = box(bbox[0] - dangle_pad_m, bbox[1] - dangle_pad_m, bbox[2] + dangle_pad_m, bbox[3] + dangle_pad_m)

    edges = []
    seg_p1, seg_p2 = [], []
    for chain in chains:
        if len(chain) < 2:
            continue
        line = _extend_dangling_endpoints(LineString(chain), padded)
        edges += _as_linestrings(line.intersection(bbox_poly))
        for p1, p2 in _segments(chain):
            seg_p1.append(p1); seg_p2.append(p2)
    for ring in rings:
        if len(ring) < 4:
            continue
        line = LineString(ring)
        if not line.intersects(bbox_poly):
            continue
        edges += _as_linestrings(line.intersection(bbox_poly))
        for p1, p2 in _segments(ring):
            seg_p1.append(p1); seg_p2.append(p2)

    if not edges or not seg_p1:
        return None

    boundary = LineString(list(bbox_poly.exterior.coords))
    faces = list(polygonize(unary_union(edges + [boundary])))
    faces = [f for f in faces if f.is_valid and not f.is_empty and f.area > 1e-6]
    if not faces:
        return None

    seg_p1 = np.array(seg_p1, dtype=float)
    seg_p2 = np.array(seg_p2, dtype=float)

    sea_faces = []
    for face in faces:
        pts = _sample_interior_points(face)
        if not pts:
            continue
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        sides = _classify_points(xs, ys, seg_p1, seg_p2)
        if sides.sum() < 0:  # majority sea (-1)
            sea_faces.append(face)

    if not sea_faces:
        return None
    sea = unary_union(sea_faces)
    if tolerance_m:
        sea = sea.buffer(tolerance_m)
    return sea if not sea.is_empty else None


def build_sea_mask(ways, bbox, transformer, tolerance_m=SEA_FILL_TOLERANCE_M):
    """Sea polygon in the export's projected CRS, or `None` when `ways` is
    empty or no coastline reaches `bbox` (an `(xmin, ymin, xmax, ymax)` tuple
    in that same CRS). `transformer` is a `pyproj.Transformer` (EPSG:4326 ->
    the export CRS, `always_xy=True`)."""
    if not ways:
        return None
    chains, rings = merge_ways(ways)
    proj_chains = [_project(c, transformer) for c in chains]
    proj_rings = [_project(r, transformer) for r in rings]
    return build_mask_from_projected(proj_chains, proj_rings, bbox, tolerance_m)


def classify_and_fill(decoded, extent, sea_geom, fill_value_m=SEA_FILL_VALUE_M):
    """Fill empty cells that fall inside `sea_geom` with `fill_value_m`.

    `decoded`: 2D array as returned by `elevation_raster.read_elevation`
    (nodata already NaN). `extent`: `{'xmin','ymin','xmax','ymax'}` of the
    grid, north-up, matching `decoded.shape`. Pixel size is derived from
    `extent` and `decoded.shape` rather than assumed to be 1 unit/pixel --
    the render-only USGS grid and any feet-based provider are not 1:1.

    Returns `(filled, land_empty_count, sea_fill_count, total_count)`.
    `filled` is a new array; `decoded` is never mutated. `land_empty_count`
    is every empty cell (NaN or exact zero) that is *not* inside the sea
    polygon -- exactly what `elevation_raster.empty_fraction` would have
    counted before this module existed, so a caller with `sea_geom=None`
    (or a raster with no empty cells at all) reproduces today's behavior
    exactly, cell for cell."""
    empty_mask = ~np.isfinite(decoded) | (decoded == 0)
    total = decoded.size
    empty_count = int(empty_mask.sum())
    if sea_geom is None or empty_count == 0:
        return decoded, empty_count, 0, total
    rows, cols = np.nonzero(empty_mask)
    height, width = decoded.shape
    xmin, ymax = extent['xmin'], extent['ymax']
    px = (extent['xmax'] - extent['xmin']) / width
    py = (extent['ymax'] - extent['ymin']) / height
    xs = xmin + (cols.astype(float) + 0.5) * px
    ys = ymax - (rows.astype(float) + 0.5) * py
    inside_sea = shapely.contains_xy(sea_geom, xs, ys)
    filled = decoded.copy()
    filled[rows[inside_sea], cols[inside_sea]] = fill_value_m
    sea_fill_count = int(inside_sea.sum())
    land_empty_count = empty_count - sea_fill_count
    return filled, land_empty_count, sea_fill_count, total
