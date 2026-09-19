"""Facility-scoped tasks: the physical property and its source snapshots.
Every layout at the facility shares these nodes (Factory v2 §8.1)."""
import os

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


def eval_identity(node, ctx):
    facility = ctx.facility(node.scope.facility_id) or {}
    inputs = {'identity': doc_hash(facility, ('facilityId', 'aoi', 'sourcePins', 'originWgs84'))}
    blockers = [] if facility.get('aoi') else [blocked('FACILITY_AOI_REQUIRED', facilityId=node.scope.facility_id)]
    return evaluation(inputs, blockers)


def _snapshot_eval(retained_key, blocker_code):
    def evaluate(node, ctx):
        facility = ctx.facility(node.scope.facility_id) or {}
        inputs = {'aoi': doc_hash(facility, ('aoi', 'sourcePins')), 'identity': dep_input(ctx, node, 'facility.identity')}
        folder = ctx.retained(facility, retained_key)
        manifest = os.path.join(folder, 'manifest.json') if folder else None
        doc = ctx.json(manifest) if ctx.can_adopt(manifest) else None
        artifacts, adoptable, notes = [], False, []
        if doc:
            payload = os.path.join(folder, doc.get('file', ''))
            artifacts = [artifact(f'{retained_key}-manifest', manifest, 'A'), artifact(f'{retained_key}-extract', payload, 'A')]
            adoptable = exists(payload)
            if not adoptable:
                notes.append(f'{doc.get("file")} named by the manifest is missing')
            notes.append(f'retained {doc.get("provider", "extract")} {doc.get("retrievedAt", "")}'.strip())
        return evaluation(inputs, [], artifacts, adoptable, notes, output=digest(doc) if doc else None)
    return evaluate


def eval_terrain_discover(node, ctx):
    facility = ctx.facility(node.scope.facility_id) or {}
    inputs = {'aoi': doc_hash(facility, ('aoi',)), 'providers': digest(facility.get('providerPolicy', {}).get('terrain')),
              'identity': dep_input(ctx, node, 'facility.identity')}
    folder = ctx.retained(facility, 'terrain')
    catalog = os.path.join(folder, 'catalog.json') if folder else None
    if ctx.can_adopt(catalog) and exists(catalog):
        return evaluation(inputs, [], [artifact('terrain-catalog', catalog, 'A')], True, ['retained provider catalog'])
    return evaluation(inputs)


def eval_terrain_acquire(node, ctx):
    facility = ctx.facility(node.scope.facility_id) or {}
    inputs = {'discover': dep_input(ctx, node, 'facility.terrain.discover'), 'providers': digest(facility.get('providerPolicy', {}).get('terrain'))}
    folder = ctx.retained(facility, 'terrain')
    manifest = os.path.join(folder, 'source-manifest.json') if folder else None
    doc = ctx.json(manifest) if ctx.can_adopt(manifest) else None
    if not doc:
        return evaluation(inputs)
    artifacts = [artifact('terrain-source-manifest', manifest, 'A')]
    notes = [f'{doc.get("selectedTitle", "terrain")} retrieved {doc.get("retrievedAt", "")}'.strip()]
    adoptable = True
    for name, sha in (doc.get('fileHashes') or {}).items():
        path = os.path.join(folder, name)
        ref = artifact(f'terrain-{name}', path, 'A')
        artifacts.append(ref)
        if ref.sha256 != sha:
            adoptable = False
            notes.append(f'{name} does not match the manifest hash' if ref.sha256 else f'{name} is missing')
    # The output identity is the compiler's `sourceManifestHash`.
    return evaluation(inputs, [], artifacts, adoptable, notes, output=digest(doc))


def eval_imagery_discover(node, ctx):
    facility = ctx.facility(node.scope.facility_id) or {}
    inputs = {'aoi': doc_hash(facility, ('aoi',)), 'providers': digest(facility.get('providerPolicy', {}).get('imagery')),
              'identity': dep_input(ctx, node, 'facility.identity')}
    folder = ctx.retained(facility, 'naip')
    manifest = os.path.join(folder, 'manifest.json') if folder else None
    doc = ctx.json(manifest) if ctx.can_adopt(manifest) else None
    if doc:
        # The retained export's manifest names the tiles discovery chose.
        return evaluation(inputs, [], [artifact('naip-manifest', manifest, 'B')], True, ['retained NAIP export manifest'], output=digest(doc))
    return evaluation(inputs)


def eval_imagery_acquire(node, ctx):
    facility = ctx.facility(node.scope.facility_id) or {}
    inputs = {'discover': dep_input(ctx, node, 'facility.imagery.discover'), 'providers': digest(facility.get('providerPolicy', {}).get('imagery'))}
    folder = ctx.retained(facility, 'naip')
    manifest = os.path.join(folder, 'manifest.json') if folder else None
    doc = ctx.json(manifest) if ctx.can_adopt(manifest) else None
    if not doc:
        return evaluation(inputs)
    raster = os.path.join(folder, 'naip.tif')
    artifacts = [artifact('naip-manifest', manifest, 'B'), artifact('naip-raster', raster, 'B')]
    return evaluation(inputs, [], artifacts, exists(raster), ['retained NAIP export'], output=doc.get('rasterSha256') or digest(doc))


SPECS = [
    TaskSpec('catalog.validate', '1', 'facility', (), eval_catalog_validate, executor=INLINE, retention='C'),
    TaskSpec('facility.identity', '1', 'facility', ('catalog.validate',), eval_identity, executor=INLINE),
    TaskSpec('facility.osm.snapshot', '1', 'facility', ('catalog.validate', 'facility.identity'), _snapshot_eval('osm', 'OSM_SOURCE_UNAVAILABLE'),
             impl_files=(script('fetch-osm-course.py'),), retention='A', estimated_bytes=5_000_000),
    TaskSpec('facility.terrain.discover', '1', 'facility', ('facility.identity',), eval_terrain_discover,
             impl_files=(script('compile-course-terrain.py'), script('elevation_raster.py')), retention='A', estimated_bytes=1_000_000),
    TaskSpec('facility.terrain.acquire', '1', 'facility', ('facility.terrain.discover',), eval_terrain_acquire,
             impl_files=(script('compile-course-terrain.py'), script('elevation_raster.py')), retention='A', estimated_bytes=300_000_000),
    TaskSpec('facility.imagery.discover', '1', 'facility', ('facility.identity',), eval_imagery_discover,
             impl_files=(script('derive-canopy-naip.py'),), retention='B', estimated_bytes=1_000_000),
    TaskSpec('facility.imagery.acquire', '1', 'facility', ('facility.imagery.discover',), eval_imagery_acquire,
             impl_files=(script('derive-canopy-naip.py'),), retention='B', estimated_bytes=500_000_000),
    TaskSpec('facility.context.snapshot', '1', 'facility', ('facility.identity',), _snapshot_eval('osmContext', 'OSM_SOURCE_UNAVAILABLE'),
             impl_files=(script('fetch-osm-context.py'),), retention='A', estimated_bytes=5_000_000),
]
