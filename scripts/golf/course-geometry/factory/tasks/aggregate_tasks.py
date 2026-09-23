"""Layout aggregates over every hole (Factory v2 §8.4), the human review
queue, and the capability report, which is derived from evidence, never
asserted (§48)."""
import json
import os

from physical_admission import POLICY_VERSION, decision

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
        artifacts = [artifact(name, path, 'C')]
        if name == 'terrain-summary':
            from ..payload_reuse import validated_bound_files
            try:
                artifacts += [artifact(os.path.basename(item), str(item), 'C') for item in validated_bound_files(ctx, layout_id)]
            except (OSError, ValueError, KeyError, TypeError):
                adoptable = False
        return evaluation(inputs, [], artifacts, adoptable, [f'{name}: {len(doc.get("holes") or [])} holes'], output=digest(doc) if adoptable else None)
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
    from ..publication import publication_snapshot
    return evaluation({'published': dep_input(ctx, node, 'layout.publish.prepare'), 'terrain': digest(fan_in_inputs(ctx, node, 'hole.terrain.compile')),
                       'boundTerrain': dep_input(ctx, node, 'layout.terrain.aggregate'),
                       'publishedBytes': digest(publication_snapshot(ctx, node.scope.layout_id)),
                       'context': dep_input(ctx, node, 'layout.context.classify')})


def eval_capability(node, ctx):
    inputs = {'package': dep_input(ctx, node, 'layout.package.validate'), 'terrain': digest(fan_in_inputs(ctx, node, 'hole.terrain.compile')),
              'world': digest(fan_in_inputs(ctx, node, 'hole.world.build')), 'published': dep_input(ctx, node, 'layout.publish.prepare'),
              'publishVerification': dep_input(ctx, node, 'layout.publish.verify'),
              'publishVerificationState': ctx.states.get(f'layout.publish.verify[{node.scope.layout_id}]'),
              'admissionPolicy': POLICY_VERSION, 'catalogTier': (ctx.layout(node.scope.layout_id) or {}).get('capabilityTier'), 'imageryCurrency': digest(imagery.currency(ctx, node.scope.layout_id))}
    return evaluation(inputs)


def _hole_admissions(ctx, layout_id, holes):
    admissions = {}
    for key in holes:
        hole = ctx.package_hole(layout_id, int(key.rsplit(':', 1)[1]))
        record = ctx.json(os.path.join(ctx.layout_out(layout_id), 'world', 'holes', hole['key'], 'record.json')) if hole else None
        if not (record and ctx.states.get(f'hole.world.build[{key}]') in DONE
                and record.get('key') == hole['key'] and record.get('packageHash') == ctx.package_hash(layout_id)):
            continue
        admission = record.get('admission')
        if not isinstance(admission, dict):
            continue
        payload = {k: value for k, value in admission.items() if k != 'admissionVersion'}
        if (admission.get('policyVersion') == POLICY_VERSION and admission.get('holeKey') == hole['key']
                and admission.get('packageHash') == ctx.package_hash(layout_id)
                and admission.get('admissionVersion') == digest(payload)):
            admissions[hole['key']] = admission
    return admissions


def _truth_verdicts(ctx, layout_id, holes):
    return {key: value.get('physicalCompleteness', {}).get('allowed') is True
            for key, value in _hole_admissions(ctx, layout_id, holes).items()}


def capability_report(node, ctx):
    layout_id = node.scope.layout_id
    layout = ctx.layout(layout_id) or {}
    pkg = ctx.package(layout_id)
    holes = ctx.graph.layout_holes.get(layout_id, []) if ctx.graph else []
    terrain_done = bool(holes) and all(ctx.states.get(f'hole.terrain.compile[{h}]') in DONE for h in holes)
    admissions = _hole_admissions(ctx, layout_id, holes)
    verdicts = {key: value.get('physicalCompleteness', {}).get('allowed') is True for key, value in admissions.items()}
    truth_done = bool(holes) and len(verdicts) == len(holes) and all(verdicts.values())
    prepared = ctx.states.get(f'layout.publish.prepare[{layout_id}]') in DONE
    verification = ctx.json(os.path.join(ctx.layout_out(layout_id), 'publish-verification.json')) or {}
    published = (prepared and ctx.states.get(f'layout.publish.verify[{layout_id}]') in DONE
                 and verification.get('kind') == 'golfhelm-factory-publish-verification-v1'
                 and verification.get('layoutId') == layout_id and verification.get('ok') is True
                 and verification.get('packageHash') == ctx.package_hash(layout_id))
    blocked_tiers = {}
    earned = 'C0'
    if pkg and terrain_done:
        earned = 'C1'
    else:
        blocked_tiers['C1'] = ['PACKAGE_REQUIRED' if not pkg else 'TERRAIN_COMPILE_INCOMPLETE']
    if earned == 'C1' and published:
        earned = 'C2'
    elif earned == 'C1':
        blocked_tiers['C2'] = ['PUBLISH_VERIFICATION_REQUIRED' if prepared else 'PUBLISH_NOT_APPROVED']
    unreviewed = [f['id'] for f in (pkg or {}).get('features', []) if f.get('reviewed') is not True]
    c3 = []
    if unreviewed:
        c3.append('HUMAN_BOUNDARY_REVIEW_REQUIRED')
    if (pkg or {}).get('status') != 'reviewed_draft':
        c3.append('HUMAN_IMAGERY_REVIEW_REQUIRED')
    currency = imagery.currency(ctx, layout_id)
    if currency and currency['predatesRenovation']:
        c3.append(imagery.CODE)
    if not truth_done:
        c3.append('TRUTH_GATE_FAILED' if verdicts else 'TRUTH_GATE_NOT_RUN')
    if earned == 'C2' and not c3:
        earned = 'C3'
    else:
        blocked_tiers['C3'] = c3 or ['VERIFIED_PUBLICATION_REQUIRED']
    field_done = bool(holes) and len(admissions) == len(holes) and all(a.get('fieldVerification', {}).get('allowed') is True for a in admissions.values())
    if earned == 'C3' and field_done:
        earned = 'C4'
    else:
        blocked_tiers['C4'] = ['FIELD_VERIFICATION_REQUIRED'] if not field_done else ['PHYSICAL_ADMISSION_REQUIRED']
    per_hole = {}
    for physical_hole in (pkg or {}).get('holes', []):
        key = physical_hole['key']
        admission = admissions.get(key)
        decisions = {}
        for name in ('renderHole', 'associateRoundHole', 'measureGreenDistance', 'suggestLie', 'resolveShotAgainstSurface',
                     'measureElevationDelta', 'inferNextHole', 'highlightSelectedTee', 'puttingBreak', 'bunkerDepth'):
            candidate = (admission or {}).get('capabilities', {}).get(name)
            reasons = [] if candidate and candidate.get('allowed') is True else (candidate or {}).get('reasons', ['PHYSICAL_ADMISSION_NOT_RUN'])
            # Rendering remains independently available; admission does not
            # invent measurements or hide candidates from the review lab.
            if name == 'renderHole':
                hole_key = f"{layout_id}:{physical_hole['ordinal']:02d}"
                reasons = [] if ctx.states.get(f'hole.terrain.compile[{hole_key}]') in DONE else ['TERRAIN_COMPILE_INCOMPLETE']
            elif currency and currency['predatesRenovation']:
                reasons = [*reasons, imagery.CODE]
            decisions[name] = decision({'physicalEvidence': reasons, 'publication': [] if published else ['PUBLISH_VERIFICATION_REQUIRED']},
                                       [(admission or {}).get('admissionVersion')])
            for field in ('uncertainty', 'uncertaintyByFeature'):
                if candidate and field in candidate:
                    decisions[name][field] = candidate[field]
        per_hole[key] = {'holeKey': key, 'capabilities': decisions, 'scope': (admission or {}).get('scope'), 'physicalAdmissionVersion': (admission or {}).get('admissionVersion')}
        per_hole[key]['admissionVersion'] = digest(per_hole[key])
    catalog_tier = layout.get('capabilityTier', 'C0')
    note = f'catalog declares {catalog_tier}; evidence supports {earned}'
    if TIER_ORDER.index(catalog_tier) > TIER_ORDER.index(earned):
        note += ' — the catalog tier is not earned by retained evidence alone'
    report = {
        'schema': 'golfhelm-factory-capability-report-v1', 'layoutId': layout_id, 'packageHash': (pkg or {}).get('contentHash'),
        'packageStatus': (pkg or {}).get('status'), 'catalogTier': catalog_tier, 'earnedTier': earned, 'blockedHigherTiers': blocked_tiers,
        'capabilities': {'productionVisual': earned in ('C2', 'C3', 'C4'), 'tapToMeasure': earned in ('C3', 'C4'),
                         'authoritativeLieClassification': earned in ('C3', 'C4'), 'reviewShotResolution': earned in ('C3', 'C4'), 'fieldVerified': earned == 'C4'},
        'evidence': {'holes': len(holes), 'terrainCompiled': terrain_done, 'truthGate': {'passed': sum(verdicts.values()), 'failed': sum(1 for v in verdicts.values() if not v), 'notRun': len(holes) - len(verdicts)},
                     'publishPrepared': prepared, 'published': published, 'unreviewedFeatures': len(unreviewed), 'imageryCurrency': currency},
        'note': note, 'perHole': per_hole, 'admissionPolicy': POLICY_VERSION,
    }
    report['admissionVersion'] = digest(report)
    return report


def run_capability(node, ctx, run):
    out = os.path.join(ctx.layout_out(node.scope.layout_id), 'capability-report.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(capability_report(node, ctx), f, indent=1, sort_keys=True)
    return [artifact('capability-report', out, 'C')]


SPECS = [
    TaskSpec('layout.terrain.aggregate', '3', 'layout', ('hole.terrain.compile*',),
             _summary_eval('terrain-summary', 'hole.terrain.compile', lambda c, l: os.path.join(c.layout_out(l), 'terrain-summary.json'), 'contentHash'),
             impl_files=(script('factory/payload_reuse.py'), script('factory/terrain_contract.py')), retention='C', estimated_bytes=100_000),
    TaskSpec('layout.world.aggregate', '1', 'layout', ('hole.world.build*',),
             _summary_eval('world-manifest', 'hole.world.build', lambda c, l: os.path.join(c.layout_out(l), 'world', 'course-world-manifest.json'), 'physicalWorldHash'), retention='C', estimated_bytes=100_000),
    TaskSpec('layout.review.queue', '1', 'layout', ('layout.package.validate', 'layout.routes.resolve', 'layout.imagery.audit?', 'layout.context.classify?', 'hole.world.build*?',
                                                    'layout.visual.aggregate?', 'layout.player.aggregate?'), eval_review_queue,
             retention='C', estimated_bytes=100_000),
    TaskSpec('layout.visual.aggregate', '1', 'layout', ('hole.visual.canary*',), eval_visual_aggregate, impl_files=(script('build-canary-sheet.py'),), estimated_bytes=10_000_000),
    TaskSpec('layout.player.aggregate', '1', 'layout', ('hole.player.capture*',), eval_player_aggregate, impl_files=(script('build-player-sheet.py'),), estimated_bytes=10_000_000),
    TaskSpec('layout.publish.prepare', '1', 'layout', ('layout.package.validate', 'hole.terrain.compile*', 'layout.terrain.aggregate', 'layout.context.classify?'), eval_publish_prepare,
             impl_files=(script('publish-course-assets.mts'),), retention='D', estimated_bytes=60_000_000),
    TaskSpec('layout.publish.verify', '2', 'layout', ('layout.publish.prepare', 'hole.terrain.compile*', 'layout.terrain.aggregate', 'layout.context.classify?'), eval_publish_verify, impl_files=(script('factory/publication.py'),), estimated_bytes=100_000),
    TaskSpec('layout.capability.evaluate', '3', 'layout', ('layout.package.validate', 'hole.terrain.compile*', 'hole.world.build*?', 'layout.publish.prepare?', 'layout.publish.verify?'), eval_capability,
             executor=run_capability, impl_files=(script('physical_admission.py'),), retention='C'),
]
