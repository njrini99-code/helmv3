"""Layout-scoped tasks: identity, routes, scorecard, package and its
reviews (Factory v2 §8.2). Route identity is human-pinned: a layout without
`routeWayIds` blocks here and nothing downstream guesses."""
import json
import os

from ..fingerprints import content_hash_matches, digest
from ..model import TaskSpec
from .common import artifact, blocked, dep_input, doc_hash, evaluation, exists, script

INLINE = 'inline'


def eval_identity_resolve(node, ctx):
    layout = ctx.layout(node.scope.layout_id) or {}
    inputs = {'identity': doc_hash(layout, ('layoutId', 'facilityId', 'siteIds', 'externalBindings')), 'catalog': dep_input(ctx, node, 'catalog.validate')}
    blockers = [] if layout.get('siteIds') or (layout.get('externalBindings') or {}).get('golfCourseIds') else [blocked('LAYOUT_IDENTITY_AMBIGUOUS', layoutId=node.scope.layout_id)]
    return evaluation(inputs, blockers)


def eval_scorecard_validate(node, ctx):
    layout = ctx.layout(node.scope.layout_id) or {}
    cards = ctx.scorecards(node.scope.layout_id)
    inputs = {'scorecards': digest([[c['profileId'], c['holes']] for c in cards]), 'holes': digest(layout.get('holeOrder'))}
    blockers = [] if cards else [blocked('SCORECARD_REQUIRED', layoutId=node.scope.layout_id)]
    return evaluation(inputs, blockers)


def eval_routes_resolve(node, ctx):
    layout = ctx.layout(node.scope.layout_id) or {}
    inputs = {'routes': digest(layout.get('routeWayIds')), 'holes': digest(layout.get('holeOrder'))}
    blockers = [] if layout.get('routeWayIds') else [blocked('ROUTE_WAY_IDS_REQUIRED', layoutId=node.scope.layout_id, holes=len(layout.get('holeOrder') or []))]
    return evaluation(inputs, blockers)


def eval_candidates_compose(node, ctx):
    layout = ctx.layout(node.scope.layout_id) or {}
    path = ctx.retained(layout, 'associations')
    doc = ctx.json(path) if ctx.can_adopt(path) else None
    inputs = {'osm': dep_input(ctx, node, 'facility.osm.snapshot') or (doc or {}).get('rawOverpassSha256'), 'routes': dep_input(ctx, node, 'layout.routes.resolve'),
              'scorecard': dep_input(ctx, node, 'layout.scorecard.validate')}
    if not doc:
        return evaluation(inputs)
    return evaluation(inputs, [], [artifact('association-report', path, 'A')], True, [f'retained association report, status {doc.get("status")}'])


def eval_canopy_derive(node, ctx):
    layout = ctx.layout(node.scope.layout_id) or {}
    path = ctx.retained(layout, 'canopyReview')
    doc = ctx.json(path) if ctx.can_adopt(path) else None
    inputs = {'imagery': dep_input(ctx, node, 'facility.imagery.acquire') or (doc or {}).get('rasterSha256'), 'candidates': dep_input(ctx, node, 'layout.candidates.compose')}
    if not doc:
        return evaluation(inputs)
    # The canopy review names the pre-canopy package it was derived from; the
    # package that carries its woods has another hash by construction.
    return evaluation(inputs, [], [artifact('canopy-review', path, 'A')], True, [f'retained canopy review {doc.get("reviewedAt", "")} ({doc.get("method", {}).get("name", "naip") if isinstance(doc.get("method"), dict) else "naip"})'])


def eval_package_compose(node, ctx):
    inputs = {'candidates': dep_input(ctx, node, 'layout.candidates.compose'), 'canopy': dep_input(ctx, node, 'layout.canopy.derive'),
              'traces': digest(ctx.json(ctx.retained(ctx.layout(node.scope.layout_id), 'imageryTraces')))}
    path = ctx.package_path(node.scope.layout_id)
    pkg = ctx.package(node.scope.layout_id)
    if not pkg or not ctx.can_adopt(path):
        return evaluation(inputs)
    if not content_hash_matches(pkg):
        return evaluation(inputs, [blocked('SOURCE_HASH_MISMATCH', path=ctx.relpath(path), detail='package contentHash does not recompute')])
    ref = artifact('package', path, 'A')
    ref.sha256 = pkg['contentHash']
    return evaluation(inputs, [], [ref], True, [f'package {pkg["contentHash"][:12]} status {pkg.get("status")}, {len(pkg.get("holes", []))} holes'], output=pkg['contentHash'])


def eval_package_validate(node, ctx):
    layout_id = node.scope.layout_id
    inputs = {'package': dep_input(ctx, node, 'layout.package.compose') or ctx.package_hash(layout_id), 'context': digest((ctx.context_layer(layout_id) or {}).get('contentHash')),
              'reviewOverlay': digest(ctx.review_overlay(layout_id))}
    pkg = ctx.package(layout_id)
    if pkg and not content_hash_matches(pkg):
        return evaluation(inputs, [blocked('SOURCE_HASH_MISMATCH', detail='package contentHash does not recompute')])
    notes = []
    if pkg:
        partial = [h['key'] for h in pkg.get('holes', []) if h.get('completeness') != 'complete']
        notes.append(f'{len(partial)} of {len(pkg.get("holes", []))} holes partial' if partial else 'every hole complete')
    return evaluation(inputs, [], [], False, notes)


def run_package_validate(node, ctx, run):
    layout_id = node.scope.layout_id
    out = os.path.join(ctx.layout_out(layout_id), 'hole-subhashes.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    pkg = ctx.package(layout_id) or {}
    body = {'schema': 'golfhelm-factory-hole-subhashes-v1', 'layoutId': layout_id, 'packageHash': pkg.get('contentHash'),
            'contextHash': (ctx.context_layer(layout_id) or {}).get('contentHash'), 'holes': ctx.subhashes(layout_id)}
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(body, f, indent=1, sort_keys=True)
    return [artifact('hole-subhashes', out, 'C')]


def eval_imagery_audit(node, ctx):
    layout = ctx.layout(node.scope.layout_id) or {}
    path = ctx.retained(layout, 'imageryReview')
    doc = ctx.json(path) if ctx.can_adopt(path) else None
    recorded_raster = ((doc or {}).get('imagery') or {}).get('rasterSha256') if isinstance((doc or {}).get('imagery'), dict) else None
    inputs = {'package': dep_input(ctx, node, 'layout.package.compose') or ctx.package_hash(node.scope.layout_id),
              'imagery': dep_input(ctx, node, 'facility.imagery.acquire') or recorded_raster}
    if not doc:
        return evaluation(inputs)
    if doc.get('packageHash') and doc['packageHash'] != ctx.package_hash(node.scope.layout_id):
        return evaluation(inputs, [], [], False, [f'retained imagery review is for package {doc["packageHash"][:12]}'])
    return evaluation(inputs, [], [artifact('imagery-review', path, 'A')], True, ['retained imagery review dossier'])


def eval_context_classify(node, ctx):
    layout = ctx.layout(node.scope.layout_id) or {}
    path = ctx.retained(layout, 'context')
    doc = ctx.json(path) if ctx.can_adopt(path) else None
    recorded_snapshot = next((s.get('sha256') or s.get('uncompressedSha256') for s in ((doc or {}).get('sources') or []) if isinstance(s, dict)), None)
    inputs = {'package': dep_input(ctx, node, 'layout.package.compose') or ctx.package_hash(node.scope.layout_id),
              'context': dep_input(ctx, node, 'facility.context.snapshot') or recorded_snapshot}
    if not doc:
        return evaluation(inputs)
    if not content_hash_matches(doc):
        return evaluation(inputs, [blocked('SOURCE_HASH_MISMATCH', path=ctx.relpath(path), detail='context contentHash does not recompute')])
    if doc.get('packageHash') != ctx.package_hash(node.scope.layout_id):
        return evaluation(inputs, [], [], False, [f'retained context layer is for package {str(doc.get("packageHash"))[:12]}'])
    ref = artifact('context-layer', path, 'A')
    ref.sha256 = doc['contentHash']
    return evaluation(inputs, [], [ref], True, [f'context layer {doc["contentHash"][:12]}, {len(doc.get("zones", []))} zones'], output=doc['contentHash'])


def eval_review_compose(node, ctx):
    layout_id = node.scope.layout_id
    overlay = ctx.review_overlay(layout_id)
    inputs = {'package': dep_input(ctx, node, 'layout.package.validate'), 'overlay': digest(overlay)}
    notes = [f'{len(overlay.get("decisions", []))} review decisions'] if overlay else ['no review overlay yet (PR E)']
    return evaluation(inputs, [], [], False, notes)


SPECS = [
    TaskSpec('layout.identity.resolve', '1', 'layout', ('catalog.validate',), eval_identity_resolve, executor=INLINE),
    TaskSpec('layout.scorecard.validate', '1', 'layout', ('catalog.validate',), eval_scorecard_validate, executor=INLINE),
    TaskSpec('layout.routes.resolve', '1', 'layout', ('layout.identity.resolve',), eval_routes_resolve, executor=INLINE),
    TaskSpec('layout.candidates.compose', '1', 'layout', ('facility.osm.snapshot', 'layout.routes.resolve', 'layout.scorecard.validate'), eval_candidates_compose,
             impl_files=(script('prepare-osm-course.py'),), retention='A', estimated_bytes=20_000_000),
    TaskSpec('layout.canopy.derive', '1', 'layout', ('facility.imagery.acquire', 'layout.candidates.compose'), eval_canopy_derive,
             impl_files=(script('derive-canopy-naip.py'),), retention='A', estimated_bytes=50_000_000),
    TaskSpec('layout.package.compose', '1', 'layout', ('layout.candidates.compose', 'layout.canopy.derive?'), eval_package_compose,
             impl_files=(script('prepare-osm-course.py'),), retention='A', estimated_bytes=5_000_000),
    TaskSpec('layout.package.validate', '1', 'layout', ('layout.package.compose',), eval_package_validate, executor=run_package_validate, retention='C'),
    TaskSpec('layout.imagery.audit', '1', 'layout', ('layout.package.compose', 'facility.imagery.acquire'), eval_imagery_audit,
             impl_files=(script('review-course-imagery.py'),), retention='A', estimated_bytes=200_000_000),
    TaskSpec('layout.context.classify', '1', 'layout', ('layout.package.compose', 'facility.context.snapshot'), eval_context_classify,
             impl_files=(script('prepare-context-layer.py'),), retention='A', estimated_bytes=5_000_000),
    TaskSpec('layout.review.compose', '1', 'layout', ('layout.package.validate', 'layout.imagery.audit?', 'layout.context.classify?'), eval_review_compose, executor=INLINE),
]
