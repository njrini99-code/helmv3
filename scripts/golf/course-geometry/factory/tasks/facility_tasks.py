"""Facility-scoped tasks: the physical property and its OSM snapshots.
Every layout at the facility shares these nodes (Factory v2 §8.1)."""
import hashlib
import json
import math
import os
from datetime import datetime, timezone

from ..fingerprints import digest
from ..model import TaskSpec
from .common import artifact, blocked, dep_input, doc_hash, evaluation, exists, script

INLINE = 'inline'


def eval_catalog_validate(node, ctx):
    facility = ctx.facility(node.scope.facility_id)
    layouts = ctx.catalog.layouts_of(node.scope.facility_id)
    cards = [c for l in layouts for c in ctx.scorecards(l['layoutId'])]
    inputs = {'catalog': digest({'facility': facility, 'layouts': layouts, 'scorecards': cards})}
    blockers = [blocked('CATALOG_INVALID', problems=ctx.catalog.problems[:20])] if ctx.catalog.problems else []
    return evaluation(inputs, blockers)


def pinned_route_way_ids(ctx, facility_id):
    """Every routeWayIds pin (Overpass way ids) across every catalogued
    layout at this facility, sorted and de-duplicated. A pinned route can
    sit outside the facility's own AOI element (Peek'n Peak's
    `leisure=golf_course` way covers only the clubhouse grounds; its 18
    pinned route ways sit up to ~2 km outside it), so the AOI fetch bbox
    must be widened to reach every one of them, not only the site element."""
    ids = set()
    for layout in ctx.catalog.layouts_of(facility_id):
        for way_id in layout.get('routeWayIds') or []:
            ids.add(int(way_id))
    return sorted(ids)


def eval_aoi_resolve(node, ctx):
    facility = ctx.facility(node.scope.facility_id) or {}
    route_way_ids = pinned_route_way_ids(ctx, node.scope.facility_id)
    # The catalog edge orders the work; the AOI element and every pinned
    # route way (any layout's, since the fetch bbox is shared) are the
    # actual inputs — a new or removed pin must reach this node.
    inputs = {'aoi': doc_hash(facility, ('aoi',)), 'routeWayIds': digest(route_way_ids)}
    if not facility.get('aoi'):
        return evaluation(inputs, [blocked('FACILITY_AOI_REQUIRED', facilityId=node.scope.facility_id)])
    path = ctx.aoi_path(node.scope.facility_id)
    doc = ctx.json(path) if ctx.can_adopt(path) else None
    if not doc:
        return evaluation(inputs)
    if (doc.get('element') != facility['aoi']['id'] or doc.get('marginM') != facility['aoi']['marginM']
            or sorted(doc.get('routeWayIds') or []) != route_way_ids):
        return evaluation(inputs, [], [], False,
                          [f'resolved AOI is for {doc.get("element")} ± {doc.get("marginM")} m, route pins {sorted(doc.get("routeWayIds") or [])}'])
    return evaluation(inputs, [], [artifact('aoi', path, 'A')], True,
                      [f'AOI {doc["element"]} bbox {doc["bboxWgs84"]} (retrieved {doc.get("retrievedAt")}), {len(route_way_ids)} pinned route way(s) covered'],
                      output=digest(doc['bboxWgs84']))


def _points_from_elements(elements):
    """(lon, lat) points from every way/relation element's own geometry, or
    its `bounds` corners when Overpass answered with bounds only."""
    points = []
    for element in elements:
        if element.get('type') == 'way':
            points.extend((p['lon'], p['lat']) for p in element.get('geometry') or [])
        for member in element.get('members') or []:
            points.extend((p['lon'], p['lat']) for p in member.get('geometry') or [])
        bounds = element.get('bounds')
        if bounds and not points:
            points.extend([(bounds['minlon'], bounds['minlat']), (bounds['maxlon'], bounds['maxlat'])])
    return points


def resolve_aoi(node, ctx, run):
    """The site element's own bbox, widened to also cover every pinned route
    way at this facility (any layout's), then padded by the margin.

    Two bounded Overpass requests: one for the site element (its own polygon
    stays site-only — `site_candidates()` matches OSM ways against exactly
    that shape, and must not gain the route ways' extent), one for every
    pinned route way, only when at least one is pinned.
    """
    from .. import adapters   # deferred: adapters.py imports factory.tasks at module load, so this cannot be a top-level import

    facility = ctx.facility(node.scope.facility_id)
    kind, ident = facility['aoi']['id'].split('/')
    margin = facility['aoi']['marginM']
    raw = adapters.overpass(f'[out:json][timeout:60];{kind}({ident});out geom;', adapters.MAX_AOI_BYTES)
    doc = json.loads(raw)
    elements = doc.get('elements') or []
    if not elements:
        raise ValueError(f'Overpass returned no element for {facility["aoi"]["id"]}')
    polygon = next(([(p['lon'], p['lat']) for p in e.get('geometry') or []] for e in elements if e.get('type') == 'way'), None)
    points = _points_from_elements(elements)
    if not points:
        raise ValueError('AOI element carries no geometry')
    site_west, site_south = min(p[0] for p in points), min(p[1] for p in points)
    site_east, site_north = max(p[0] for p in points), max(p[1] for p in points)
    west, south, east, north = site_west, site_south, site_east, site_north

    route_way_ids = pinned_route_way_ids(ctx, facility['facilityId'])
    route_response_sha256 = None
    if route_way_ids:
        ids = ','.join(str(i) for i in route_way_ids)
        route_raw = adapters.overpass(f'[out:json][timeout:60];way(id:{ids});out geom;', adapters.MAX_AOI_BYTES)
        route_response_sha256 = hashlib.sha256(route_raw).hexdigest()
        route_points = _points_from_elements(json.loads(route_raw).get('elements') or [])
        if route_points:
            west = min(west, min(p[0] for p in route_points))
            south = min(south, min(p[1] for p in route_points))
            east = max(east, max(p[0] for p in route_points))
            north = max(north, max(p[1] for p in route_points))

    lat = (south + north) / 2
    dlat = margin / 111_320
    dlon = margin / (111_320 * max(math.cos(math.radians(lat)), 0.2))
    aoi = {'kind': 'golfhelm-factory-aoi-v1', 'facilityId': facility['facilityId'], 'element': facility['aoi']['id'],
           'elementBboxWgs84': [round(site_west, 7), round(site_south, 7), round(site_east, 7), round(site_north, 7)], 'marginM': margin,
           'routeWayIds': route_way_ids, 'routeWayBboxWgs84': [round(west, 7), round(south, 7), round(east, 7), round(north, 7)] if route_way_ids else None,
           'bboxWgs84': [round(west - dlon, 7), round(south - dlat, 7), round(east + dlon, 7), round(north + dlat, 7)],
           'centroidWgs84': [round((west + east) / 2, 7), round(lat, 7)], 'polygon': polygon,
           'retrievedAt': datetime.now(timezone.utc).date().isoformat(), 'endpoint': adapters.OVERPASS,
           'responseSha256': hashlib.sha256(raw).hexdigest(), 'routeWayResponseSha256': route_response_sha256,
           'license': 'ODbL-1.0', 'attribution': '© OpenStreetMap contributors'}
    path = ctx.aoi_path(facility['facilityId'])
    adapters._write_json(path, aoi)
    return [artifact('aoi', path, 'A')]


def _snapshot_eval(kind, artifact_prefix):
    def evaluate(node, ctx):
        facility_id = node.scope.facility_id
        aoi = ctx.aoi(facility_id)
        inputs = {'aoi': dep_input(ctx, node, 'facility.aoi.resolve') or (digest(aoi['bboxWgs84']) if aoi else None)}
        manifest, extract = ctx.snapshot(facility_id, kind)
        if not manifest:
            return evaluation(inputs)
        folder = os.path.dirname(extract)
        notes = [f'retained extract {manifest.get("retrievedAt", "")}: {manifest.get("elementCount")} elements, sha {str(manifest.get("uncompressedSha256"))[:12]}']
        artifacts = [artifact(f'{artifact_prefix}-manifest', os.path.join(folder, 'manifest.json'), 'A'), artifact(f'{artifact_prefix}-extract', extract, 'A')]
        return evaluation(inputs, [], artifacts, exists(extract), notes, output=manifest.get('uncompressedSha256'))
    return evaluate


SPECS = [
    TaskSpec('catalog.validate', '1', 'facility', (), eval_catalog_validate, executor=INLINE, retention='C'),
    TaskSpec('facility.aoi.resolve', '1', 'facility', ('catalog.validate',), eval_aoi_resolve, retention='A', estimated_bytes=100_000),
    TaskSpec('facility.osm.snapshot', '1', 'facility', ('facility.aoi.resolve',), _snapshot_eval('osm', 'osm'),
             impl_files=(script('fetch-osm-course.py'),), retention='A', estimated_bytes=5_000_000),
    TaskSpec('facility.context.snapshot', '1', 'facility', ('facility.aoi.resolve',), _snapshot_eval('context', 'osm-context'),
             impl_files=(script('fetch-osm-context.py'),), retention='A', estimated_bytes=12_000_000),
]
