"""Layout aggregates over every hole (Factory v2 §8.4), the human review
queue, and the capability report, which is derived from evidence, never
asserted (§48)."""
import json
import os

from .. import imagery
from ..fingerprints import digest
from ..model import TaskSpec
from .common import artifact, blocked, dep_input, evaluation, fan_in_inputs, script

TIER_ORDER = ('C0', 'C1', 'C2', 'C3', 'C4')
DONE = ('cached', 'success')


def _summary_eval(name, dep_id, path_fn, hash_key):
    def evaluate(node, ctx):
        layout_id = node.scope.layout_id
        inputs = {'holes': digest(fan_in_inputs(ctx, node, dep_id)), 'package': ctx.package_hash(layout_id)}
        path = path_fn(ctx, layout_id)
        doc = ctx.json(path) if ctx.can_adopt(path) else None
        if not doc:
            return evaluation(inputs)
        holes = ctx.graph.layout_holes.get(layout_id, []) if ctx.graph else []
        adoptable = doc.get('packageHash') == ctx.package_hash(layout_id) and len(doc.get('holes') or []) == len(holes)
        return evaluation(inputs, [], [artifact(name, path, 'C')], adoptable, [f'{name}: {len(doc.get("holes") or [])} holes'], output=digest(doc) if adoptable else None)
    return evaluate


def eval_review_queue(node, ctx):
    layout_id = node.scope.layout_id
    inputs = {'package': dep_input(ctx, node, 'layout.package.validate'), 'imagery': dep_input(ctx, node, 'layout.imagery.audit'),
              'context': dep_input(ctx, node, 'layout.context.classify'), 'routes': dep_input(ctx, node, 'layout.routes.resolve'),
              'world': digest(fan_in_inputs(ctx, node, 'hole.world.build')), 'visual': dep_input(ctx, node, 'layout.visual.aggregate'),
              'player': dep_input(ctx, node, 'layout.player.aggregate'), 'imageryCurrency': digest(imagery.currency(ctx, layout_id))}
    path = os.path.join(ctx.layout_out(layout_id), 'review-queue.json')
    doc = ctx.json(path) if ctx.can_adopt(path) else None
    adoptable = bool(doc) and doc.get('packageHash') == ctx.package_hash(layout_id)
    return evaluation(inputs, [], [artifact('review-queue', path, 'C')] if adoptable else [], adoptable,
                      [f'{len(doc.get("items", []))} human passes queued'] if doc else [], output=digest(doc) if adoptable else None)


def eval_visual_aggregate(node, ctx):
    return evaluation({'canaries': digest(fan_in_inputs(ctx, node, 'hole.visual.canary'))})


def eval_player_aggregate(node, ctx):
    return evaluation({'captures': digest(fan_in_inputs(ctx, node, 'hole.player.capture'))})


def eval_publish_prepare(node, ctx):
    """Publishing copies hash-named files under public/: a source change that
    ships through a PR and a deploy, so the factory only recognises a
    published manifest, it never writes one (Factory v2 §11)."""
    layout = ctx.layout(node.scope.layout_id) or {}
    inputs = {'package': ctx.package_hash(node.scope.layout_id), 'terrain': digest(fan_in_inputs(ctx, node, 'hole.terrain.compile')),
              'context': dep_input(ctx, node, 'layout.context.classify')}
    published = ctx.abspath((layout.get('geometry') or {}).get('published'))
    doc = ctx.json(published) if ctx.can_adopt(published) else None
    if not doc:
        return evaluation(inputs, [blocked('PUBLISH_NOT_APPROVED', layoutId=node.scope.layout_id, detail='publish-course-assets.mts runs in a PR once the owner approves the package hash')])
    if doc.get('geometryVersion') != ctx.package_hash(node.scope.layout_id):
        return evaluation(inputs, [blocked('PUBLISH_NOT_APPROVED', layoutId=node.scope.layout_id, published=str(doc.get('geometryVersion'))[:12], detail='the published manifest is for another package hash')])
    terrain = doc.get('terrainByHole') or {}
    return evaluation(inputs, [], [artifact('published-manifest', published, 'D')], True, [f'published {doc["geometryVersion"][:12]}, {len(terrain)} terrain files'], output=doc['geometryVersion'])


def eval_publish_verify(node, ctx):
    # The prepare node's output is the published package hash alone, so the
    # meshes and the context layer enter here directly: a recompiled hole
    # re-verifies what is published even though the package did not move.
    return evaluation({'published': dep_input(ctx, node, 'layout.publish.prepare'), 'terrain': digest(fan_in_inputs(ctx, node, 'hole.terrain.compile')),
                       'context': dep_input(ctx, node, 'layout.context.classify')})


def eval_capability(node, ctx):
    inputs = {'package': dep_input(ctx, node, 'layout.package.validate'), 'terrain': digest(fan_in_inputs(ctx, node, 'hole.terrain.compile')),
              'world': digest(fan_in_inputs(ctx, node, 'hole.world.build')), 'published': dep_input(ctx, node, 'layout.publish.prepare'),
              'catalogTier': (ctx.layout(node.scope.layout_id) or {}).get('capabilityTier'), 'imageryCurrency': digest(imagery.currency(ctx, node.scope.layout_id))}
    return evaluation(inputs)


def _truth_verdicts(ctx, layout_id, holes):
    verdicts = {}
    for key in holes:
        hole = ctx.package_hole(layout_id, int(key.rsplit(':', 1)[1]))
        record = ctx.json(os.path.join(ctx.layout_out(layout_id), 'world', 'holes', hole['key'], 'record.json')) if hole else None
        if record and ctx.states.get(f'hole.world.build[{key}]') in DONE:
            verdicts[hole['key']] = bool(record.get('truthGatePassed'))
    return verdicts


def capability_report(node, ctx):
    layout_id = node.scope.layout_id
    layout = ctx.layout(layout_id) or {}
    pkg = ctx.package(layout_id)
    holes = ctx.graph.layout_holes.get(layout_id, []) if ctx.graph else []
    terrain_done = bool(holes) and all(ctx.states.get(f'hole.terrain.compile[{h}]') in DONE for h in holes)
    verdicts = _truth_verdicts(ctx, layout_id, holes)
    truth_done = bool(holes) and len(verdicts) == len(holes) and all(verdicts.values())
    published = ctx.states.get(f'layout.publish.prepare[{layout_id}]') in DONE
    blocked_tiers = {}
    earned = 'C0'
    if pkg and terrain_done:
        earned = 'C1'
    else:
        blocked_tiers['C1'] = ['PACKAGE_REQUIRED' if not pkg else 'TERRAIN_COMPILE_INCOMPLETE']
    if earned == 'C1' and published:
        earned = 'C2'
    elif earned == 'C1':
        blocked_tiers['C2'] = ['PUBLISH_NOT_APPROVED']
    unreviewed = [f['id'] for f in (pkg or {}).get('features', []) if f.get('kind') != 'route' and not f.get('reviewed')]
    c3 = []
    if unreviewed:
        c3.append('HUMAN_BOUNDARY_REVIEW_REQUIRED')
    if (pkg or {}).get('status') == 'source_candidate':
        c3.append('HUMAN_IMAGERY_REVIEW_REQUIRED')
    currency = imagery.currency(ctx, layout_id)
    if currency and currency['predatesRenovation']:
        c3.append(imagery.CODE)
    if not truth_done:
        c3.append('TRUTH_GATE_FAILED' if verdicts else 'TRUTH_GATE_NOT_RUN')
    blocked_tiers['C3'] = c3 or ['HUMAN_BOUNDARY_REVIEW_REQUIRED']
    blocked_tiers['C4'] = ['FIELD_VERIFICATION_REQUIRED']
    catalog_tier = layout.get('capabilityTier', 'C0')
    note = f'catalog declares {catalog_tier}; evidence supports {earned}'
    if TIER_ORDER.index(catalog_tier) > TIER_ORDER.index(earned):
        note += ' — the catalog tier is not earned by retained evidence alone'
    return {
        'schema': 'golfhelm-factory-capability-report-v1', 'layoutId': layout_id, 'packageHash': (pkg or {}).get('contentHash'),
        'packageStatus': (pkg or {}).get('status'), 'catalogTier': catalog_tier, 'earnedTier': earned, 'blockedHigherTiers': blocked_tiers,
        'capabilities': {'productionVisual': earned in ('C2', 'C3', 'C4'), 'tapToMeasure': earned in ('C2', 'C3', 'C4'),
                         'authoritativeLieClassification': earned in ('C3', 'C4'), 'reviewShotResolution': earned in ('C3', 'C4'), 'fieldVerified': earned == 'C4'},
        'evidence': {'holes': len(holes), 'terrainCompiled': terrain_done, 'truthGate': {'passed': sum(verdicts.values()), 'failed': sum(1 for v in verdicts.values() if not v), 'notRun': len(holes) - len(verdicts)},
                     'published': published, 'unreviewedFeatures': len(unreviewed), 'imageryCurrency': currency},
        'note': note,
    }


def run_capability(node, ctx, run):
    out = os.path.join(ctx.layout_out(node.scope.layout_id), 'capability-report.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(capability_report(node, ctx), f, indent=1, sort_keys=True)
    return [artifact('capability-report', out, 'C')]


SPECS = [
    TaskSpec('layout.terrain.aggregate', '1', 'layout', ('hole.terrain.compile*',),
             _summary_eval('terrain-summary', 'hole.terrain.compile', lambda c, l: os.path.join(c.layout_out(l), 'terrain-summary.json'), 'contentHash'), retention='C', estimated_bytes=100_000),
    TaskSpec('layout.world.aggregate', '1', 'layout', ('hole.world.build*',),
             _summary_eval('world-manifest', 'hole.world.build', lambda c, l: os.path.join(c.layout_out(l), 'world', 'course-world-manifest.json'), 'physicalWorldHash'), retention='C', estimated_bytes=100_000),
    TaskSpec('layout.review.queue', '1', 'layout', ('layout.package.validate', 'layout.routes.resolve', 'layout.imagery.audit?', 'layout.context.classify?', 'hole.world.build*?',
                                                    'layout.visual.aggregate?', 'layout.player.aggregate?'), eval_review_queue,
             retention='C', estimated_bytes=100_000),
    TaskSpec('layout.visual.aggregate', '1', 'layout', ('hole.visual.canary*',), eval_visual_aggregate, impl_files=(script('build-canary-sheet.py'),), estimated_bytes=10_000_000),
    TaskSpec('layout.player.aggregate', '1', 'layout', ('hole.player.capture*',), eval_player_aggregate, impl_files=(script('build-player-sheet.py'),), estimated_bytes=10_000_000),
    TaskSpec('layout.publish.prepare', '1', 'layout', ('layout.package.validate', 'hole.terrain.compile*', 'layout.context.classify?'), eval_publish_prepare,
             impl_files=(script('publish-course-assets.mts'),), retention='D', estimated_bytes=60_000_000),
    TaskSpec('layout.publish.verify', '1', 'layout', ('layout.publish.prepare', 'hole.terrain.compile*', 'layout.context.classify?'), eval_publish_verify, estimated_bytes=100_000),
    TaskSpec('layout.capability.evaluate', '1', 'layout', ('layout.package.validate', 'hole.terrain.compile*', 'hole.world.build*?', 'layout.publish.prepare?'), eval_capability,
             executor=run_capability, retention='C'),
]
