"""Facility-scoped tasks: the physical property and its OSM snapshots.
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


def eval_aoi_resolve(node, ctx):
    facility = ctx.facility(node.scope.facility_id) or {}
    inputs = {'aoi': doc_hash(facility, ('aoi',))}      # the catalog edge orders the work; only the AOI itself is an input
    if not facility.get('aoi'):
        return evaluation(inputs, [blocked('FACILITY_AOI_REQUIRED', facilityId=node.scope.facility_id)])
    path = ctx.aoi_path(node.scope.facility_id)
    doc = ctx.json(path) if ctx.can_adopt(path) else None
    if not doc:
        return evaluation(inputs)
    if doc.get('element') != facility['aoi']['id'] or doc.get('marginM') != facility['aoi']['marginM']:
        return evaluation(inputs, [], [], False, [f'resolved AOI is for {doc.get("element")} ± {doc.get("marginM")} m'])
    return evaluation(inputs, [], [artifact('aoi', path, 'A')], True, [f'AOI {doc["element"]} bbox {doc["bboxWgs84"]} (retrieved {doc.get("retrievedAt")})'], output=digest(doc['bboxWgs84']))


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
