"""`ship`: the automated QA gates between a built layout and an owner's
approval (plan "Design: one command, ship"; Phase 2 item 7).

Every gate here is a pure function over already-loaded documents, so each one
is unit-testable without touching disk or a subprocess. `evaluate_gates`
is the only reader: it loads whatever evidence the DAG left under a layout's
output directory and calls the pure gates. Evidence that is simply absent
(a task never ran, or ran but produced nothing) is its own blocker code
(`..._MISSING`) rather than a silent pass — `ship` fails loudly by design.

The one gate that cannot be a pure disk-reader is the factory-lab capture
evidence (`gate_bundle_captures`/`gate_draw_call_budget`): it needs a live
capture run against the factory lab (`:8774`), which is impure by nature.
`ship_run.py` owns that impure step and passes the already-loaded
`captures.json` document (and any infrastructure-level blocker, such as the
lab not listening) into `evaluate_gates`, keeping every gate in this module
itself a pure function over already-loaded documents.
"""
import json
import os

from .fingerprints import content_hash_matches

# Backstop only (advisory, not a target): Peek's own golden build's worst
# accepted hole is 0.495 uncertain share (hole 02); +0.10 margin = 0.595,
# rounded up to a clean 0.60. No real course, including Peek's, holds to a
# tight uncertain-share target -- context review is owner sign-off at
# `ship --approve` time (the same pattern as route confirmation), not a DAG
# gate. This constant catches only an obviously broken context layer.
CONTEXT_UNCERTAIN_MAX = 0.60
GLB_SPAN_MAX_M = 0.02
# Holes below this par carry no fairway feature by design (a short par-3
# tees straight at the green); every other par requires one.
FAIRWAY_MIN_PAR = 4


def blocker(code, **fields):
    return {'code': code, **fields}


# --- pure gates --------------------------------------------------------------
def gate_holes_shape(package, expected_holes=18):
    """Every hole has a green and a tee; a fairway when its par is at least
    `FAIRWAY_MIN_PAR`. Reads `package['features'][*]['kind']` joined through
    each hole's `featureIds` — never the free-text `gaps` notes, which are
    for a human reviewer, not a gate."""
    if not package:
        return [blocker('PACKAGE_MISSING')]
    blockers = []
    holes = package.get('holes') or []
    if len(holes) != expected_holes:
        blockers.append(blocker('HOLE_COUNT_WRONG', expected=expected_holes, actual=len(holes)))
    features_by_id = {f['id']: f for f in package.get('features', [])}
    for hole in holes:
        key, ordinal, par = hole.get('key'), hole.get('ordinal'), hole.get('par')
        kinds = {features_by_id[fid]['kind'] for fid in (hole.get('featureIds') or []) if fid in features_by_id}
        required = {'green', 'tee'} | ({'fairway'} if (par or 0) >= FAIRWAY_MIN_PAR else set())
        for surface_class in sorted(required - kinds):
            blockers.append(blocker('HOLE_SURFACE_MISSING', holeKey=key, ordinal=ordinal, par=par, surfaceClass=surface_class))
    return blockers


def gate_hash_chain(package, asset_manifest, context_layer, hole_docs):
    """package.contentHash == compiled-terrain geometryHash == context
    packageHash, and every hole's bound mesh/report/manifest-entry agree on
    that hole's own contentHash (the binding chain `aggregate_terrain`/
    `bind_verified_hole` produce)."""
    if not package:
        return [blocker('PACKAGE_MISSING')]
    blockers = []
    if not content_hash_matches(package):
        blockers.append(blocker('PACKAGE_HASH_MISMATCH'))
    expected = package.get('contentHash')
    if not asset_manifest:
        blockers.append(blocker('TERRAIN_ASSET_MANIFEST_MISSING'))
    elif asset_manifest.get('geometryHash') != expected:
        blockers.append(blocker('HASH_CHAIN_BROKEN', field='terrain.geometryHash', expected=expected, actual=asset_manifest.get('geometryHash')))
    if context_layer is not None:
        if context_layer.get('packageHash') != expected:
            blockers.append(blocker('HASH_CHAIN_BROKEN', field='context.packageHash', expected=expected, actual=context_layer.get('packageHash')))
        if not content_hash_matches(context_layer):
            blockers.append(blocker('CONTEXT_HASH_MISMATCH'))
    for key, docs in sorted((hole_docs or {}).items()):
        mesh, report, entry = docs.get('mesh'), docs.get('report'), docs.get('entry')
        if not (mesh and report and entry):
            blockers.append(blocker('HOLE_TERRAIN_EVIDENCE_MISSING', holeKey=key))
            continue
        if mesh.get('geometryHash') != expected:
            blockers.append(blocker('HASH_CHAIN_BROKEN', field=f'{key}.mesh.geometryHash', expected=expected, actual=mesh.get('geometryHash')))
        own = {mesh.get('contentHash'), report.get('contentHash'), entry.get('contentHash')}
        if len(own) != 1 or None in own:
            blockers.append(blocker('HOLE_MESH_HASH_MISMATCH', holeKey=key,
                                    meshContentHash=mesh.get('contentHash'), reportContentHash=report.get('contentHash'), manifestContentHash=entry.get('contentHash')))
    return blockers


def gate_terrain_contract(hole_docs):
    """Bound meshes the runtime schema would refuse (terrain_contract.py),
    one blocker per distinct problem with the holes it covers -- otherwise
    the factory lab refuses the bundle and every hole times out at capture."""
    from .terrain_contract import contract_problems
    grouped = {}
    for key, docs in sorted((hole_docs or {}).items()):
        for problem in contract_problems(docs.get('mesh') or {}) if docs.get('mesh') else []:
            ident = json.dumps(problem, sort_keys=True)
            grouped.setdefault(ident, (problem, []))[1].append(key)
    return [blocker(problem['code'], holeKeys=keys, **{k: v for k, v in problem.items() if k != 'code'}) for problem, keys in grouped.values()]


def gate_t_junctions(terrain_summary):
    if not terrain_summary:
        return [blocker('TERRAIN_SUMMARY_MISSING')]
    return [blocker('T_JUNCTIONS_PRESENT', holeKey=hole.get('key'), ordinal=hole.get('ordinal'), tJunctionVertices=hole.get('tJunctionVertices'))
            for hole in (terrain_summary.get('holes') or []) if hole.get('tJunctionVertices')]


# Tree cover inside each hole's play corridor (the routed centreline +/-
# CANOPY_CORRIDOR_BUFFER_M): what renders as a hole played through forest.
# Measured 2026-09-23 over 23 built layouts: every healthy course's worst
# hole is <= 0.34 (a straight route cutting a dogleg's corner through real
# trees). Golden Horseshoe averaged 0.76 with the dropped-clearing bug and
# 0.47 after it, while a 3DEP lidar canopy-height model (trees >= 3 m) puts
# the same corridors at 0.07-0.22 (over cells with lidar returns; >= 84%
# of each corridor but one) -- the remainder is NAIP NDVI/texture
# classifying open ground as canopy. 0.40 sits above every real dogleg.
CANOPY_CORRIDOR_BUFFER_M = 20
CANOPY_CORRIDOR_MAX = 0.40


def canopy_corridor_shares(package, buffer_m=CANOPY_CORRIDOR_BUFFER_M):
    """Per hole, the share of its play corridor that the package's `woods`
    features cover -- what the renderer will fill with crowns. Informational
    for every hole; `gate_canopy_in_play` blocks on the outliers."""
    if not package or not package.get('originWgs84'):
        return []
    import pyproj
    from shapely.geometry import shape
    from shapely.ops import transform, unary_union
    lon, lat = package['originWgs84']
    local = pyproj.CRS.from_proj4(f'+proj=aeqd +lat_0={lat} +lon_0={lon} +units=m')
    project = pyproj.Transformer.from_crs(4326, local, always_xy=True).transform
    features = {f['id']: f for f in package.get('features') or []}
    woods = [transform(project, shape(f['geometryWgs84'])).buffer(0)
             for f in features.values() if f['kind'] == 'woods']
    canopy = unary_union(woods) if woods else None
    shares = []
    for hole in package.get('holes') or []:
        route = features.get(hole.get('routeFeatureId'))
        if not route:
            continue
        corridor = transform(project, shape(route['geometryWgs84'])).buffer(buffer_m)
        share = canopy.intersection(corridor).area / corridor.area if canopy is not None and corridor.area else 0.0
        shares.append({'holeKey': hole['key'], 'ordinal': hole.get('ordinal'), 'canopyShare': round(share, 3)})
    return shares


def gate_canopy_in_play(shares, max_share=CANOPY_CORRIDOR_MAX):
    over = [s for s in shares if s['canopyShare'] > max_share]
    if not over:
        return []
    return [blocker('CANOPY_IN_PLAY_CORRIDOR', holeKeys=[s['holeKey'] for s in over],
                    canopyShares=[s['canopyShare'] for s in over], max=max_share, corridorBufferMeters=CANOPY_CORRIDOR_BUFFER_M)]


def gate_context_uncertain(context_report, max_share=CONTEXT_UNCERTAIN_MAX):
    """Advisory backstop only (owner sign-off happens at `ship --approve`,
    not here): fires only for an obviously broken context layer, well above
    any real course's actual shares. See `context_uncertain_shares` for the
    per-hole numbers every course reports regardless."""
    if not context_report:
        return [blocker('CONTEXT_REPORT_MISSING')]
    blockers = []
    for hole in context_report.get('holes') or []:
        share = hole.get('uncertainShare')
        if share is not None and share > max_share:
            blockers.append(blocker('CONTEXT_UNCERTAIN_SHARE_EXCEEDED', holeKey=hole.get('key'), uncertainShare=share, max=max_share))
    return blockers


def context_uncertain_shares(context_report):
    """Every hole's uncertain share, for the QA report and contact sheet --
    informational, not a gate. Owner review of these numbers at
    `ship --approve` is the actual sign-off (master plan §39/HUMAN_CONTEXT_
    REVIEW_REQUIRED is a separate review-queue item, not a ship gate)."""
    if not context_report:
        return []
    return [{'holeKey': hole.get('key'), 'uncertainShare': hole.get('uncertainShare')} for hole in context_report.get('holes') or []]


# `naip-trace-<tracedAt>`: an imagery-only auto/hand trace.
# `lidar-trace-<tracedAt>`: an auto trace whose lidar canopy-height signal
# also confirmed open ground -- still owner review, never OSM truth.
TRACE_SOURCE_PREFIXES = ('naip-trace-', 'lidar-trace-')


def traced_surfaces(package):
    """Every surface that came from an imagery trace (hand or auto) rather
    than a mapped source -- `prepare-osm-course.py --traces` stamps each one
    with a `naip-trace-<tracedAt>` or `lidar-trace-<tracedAt>` source id. Not
    a gate: the plan makes the owner's `ship --approve` the review of these,
    the same pattern as context sign-off, so every one is listed in the QA
    report and the proposed approval rather than passing `gate_holes_shape`
    silently."""
    if not package:
        return []
    return [{'featureId': f['id'], 'kind': f['kind'], 'holeKeys': f.get('holeKeys') or [],
             'sourceIds': [s for s in f.get('sourceIds') or [] if s.startswith(TRACE_SOURCE_PREFIXES)]}
            for f in package.get('features') or []
            if any(s.startswith(TRACE_SOURCE_PREFIXES) for s in f.get('sourceIds') or [])]


def enrich_missing_surface_blockers(blockers, trace_report):
    """Attach the `layout.surfaces.trace` report row for any hole a
    `HOLE_SURFACE_MISSING` blocker names, when that task ran: an owner
    reading `ship`'s output for a still-blocked hole sees why the auto-trace
    itself refused (no candidate, below the confidence floor, ...) instead of
    just the bare blocker. Never changes which holes block -- `gate_holes_
    shape` stays the pure, untouched source of truth for that; this only
    attaches evidence to its output."""
    if not trace_report:
        return blockers
    by_hole = {row.get('holeKey'): row for row in trace_report.get('report') or [] if row.get('holeKey')}
    enriched = []
    for b in blockers:
        if b['code'] == 'HOLE_SURFACE_MISSING' and b.get('surfaceClass') == 'fairway' and b.get('holeKey') in by_hole:
            row = by_hole[b['holeKey']]
            evidence = row.get('evidence') or {}
            lidar_used = bool((evidence.get('lidar') or {}).get('used'))
            b = {**b, 'autoTrace': {'decision': row.get('decision'), 'confidence': evidence.get('confidence'),
                                    'reason': evidence.get('reason'),
                                    'evidenceSource': 'lidar_chm+naip' if lidar_used else 'naip'}}
        enriched.append(b)
    return enriched


def gate_bundle_captures(captures_report, expected_holes=18):
    """Ship's own player-capture evidence: every hole rendered by the
    factory lab (`:8774`) from THIS candidate's own content-addressed
    bundle (`ship_run._capture_bundle`), with no page errors. This replaces
    the legacy `hole.player.capture` DAG task, which is permanently
    hash-locked to checked-in fixtures (`lab.py`) and can never serve a
    not-yet-published candidate. The full preset x viewport canary sign-off
    matrix is not reproduced here -- the factory lab captures one fixed
    viewport per hole -- so canary sign-off remains a post-approval check.
    """
    if not captures_report:
        return [blocker('SHIP_CAPTURES_MISSING')]
    blockers = []
    captures = captures_report.get('captures') or []
    if len(captures) != expected_holes:
        blockers.append(blocker('SHIP_CAPTURE_HOLE_COUNT_WRONG', expected=expected_holes, actual=len(captures)))
    for error in captures_report.get('errors') or []:
        blockers.append(blocker('SHIP_CAPTURE_CONSOLE_ERRORS', holeKey=error.get('hole'), message=error.get('message')))
    return blockers


def gate_draw_call_budget(captures_report):
    """The real V2_BUDGETS enforcement (`v2-batching.ts`/`artifact-
    residency.ts`) happens at runtime on what the renderer actually draws.
    The factory-lab captures run that same production renderer against this
    candidate, so their recorded `drawCallStatus` is the real budget gate --
    not the offline display-LOD reports, which describe LODs that are not
    part of what ships (see `evaluate_gates`'s `displayLodBudgets` advisory).
    Absence of `captures_report` is `gate_bundle_captures`'s
    `SHIP_CAPTURES_MISSING`, not repeated here."""
    if not captures_report:
        return []
    blockers = []
    for capture in captures_report.get('captures') or []:
        renderer = capture.get('renderer') or {}
        status = renderer.get('drawCallStatus')
        if status not in (None, 'within'):
            blockers.append(blocker('DRAW_CALL_BUDGET_EXCEEDED', holeKey=capture.get('holeKey'),
                                    drawCalls=renderer.get('drawCalls'), drawCallBudget=renderer.get('drawCallBudget'), status=status))
    return blockers


def gate_glb_span(glb_reports, max_meters=GLB_SPAN_MAX_M):
    """glb_reports: {holeKey: doc or None}. A hole built with `--skip-blender`
    (no Blender on PATH) has no report and is not gated here at all — the
    "if Blender ran" qualifier. A hole whose round trip actually failed the
    tolerance already failed `hole.world.build` outright (build-course-world.py
    raises), so a present-but-failing report would be unexpected; still
    checked defensively rather than assumed."""
    blockers = []
    for key, doc in sorted((glb_reports or {}).items()):
        if not doc:
            continue
        worst = max(doc.get('absoluteErrorMeters') or [0])
        if not doc.get('passed') or worst > max_meters:
            blockers.append(blocker('GLB_SPAN_EXCEEDED', holeKey=key, worstErrorMeters=worst, max=max_meters))
    return blockers


# --- evidence readers ---------------------------------------------------------
def bound_dir(ctx, layout_id):
    return os.path.join(ctx.layout_out(layout_id), 'compiled-bound')


def collect_hole_docs(ctx, layout_id, asset_manifest):
    bound = bound_dir(ctx, layout_id)
    docs = {}
    for key, entry in ((asset_manifest or {}).get('holes') or {}).items():
        docs[key] = {'mesh': ctx.json(os.path.join(bound, f'{key}-terrain.json'), fresh=True),
                     'report': ctx.json(os.path.join(bound, f'{key}-report.json'), fresh=True), 'entry': entry}
    return docs


def collect_glb_reports(ctx, layout_id, package):
    reports = {}
    for hole in (package or {}).get('holes') or []:
        path = os.path.join(ctx.layout_out(layout_id), 'world', 'holes', hole['key'], 'validation', 'glb-roundtrip.json')
        reports[hole['key']] = ctx.json(path, fresh=True) if os.path.isfile(path) else None
    return reports


def evaluate_gates(ctx, layout_id, captures_report=None, capture_blockers=None):
    """Every gate the plan lists for `ship`, read from whatever the DAG left
    on disk for this layout, plus the caller's already-loaded factory-lab
    capture evidence (see the module docstring). Returns `(blockers,
    advisory)`: `blockers` empty is the only thing that means
    READY_FOR_APPROVAL; `advisory` is informational-only evidence that never
    gates readiness (context shares, the GLB span, and display-LOD budgets --
    none of which describe what actually ships -- and the canary matrix,
    deferred to a post-approval check).
    """
    package = ctx.package(layout_id)
    asset_manifest = ctx.json(os.path.join(bound_dir(ctx, layout_id), 'asset-manifest.json'), fresh=True)
    context_layer = ctx.context_layer(layout_id)
    context_report = ctx.json(ctx.context_report_path(layout_id), fresh=True)
    terrain_summary = ctx.json(os.path.join(ctx.layout_out(layout_id), 'terrain-summary.json'), fresh=True)
    hole_docs = collect_hole_docs(ctx, layout_id, asset_manifest)
    glb_reports = collect_glb_reports(ctx, layout_id, package)

    blockers = []
    holes_shape_blockers = gate_holes_shape(package)
    trace_report_path = ctx.surfaces_trace_out(layout_id)
    trace_report = ctx.json(trace_report_path, fresh=True) if trace_report_path and os.path.isfile(trace_report_path) else None
    blockers += enrich_missing_surface_blockers(holes_shape_blockers, trace_report)
    blockers += gate_hash_chain(package, asset_manifest, context_layer, hole_docs)
    blockers += gate_t_junctions(terrain_summary)
    blockers += gate_terrain_contract(hole_docs)
    canopy_shares = canopy_corridor_shares(package)
    blockers += gate_canopy_in_play(canopy_shares)
    blockers += gate_context_uncertain(context_report)
    blockers += (capture_blockers or [])
    blockers += gate_bundle_captures(captures_report)
    blockers += gate_draw_call_budget(captures_report)

    advisory = {
        'contextUncertainShares': context_uncertain_shares(context_report),
        'tracedSurfaces': traced_surfaces(package),
        'canopyCorridorShares': canopy_shares,
        'canopySource': (ctx.json(ctx.canopy_path(layout_id), fresh=True) or {}).get('canopySource') if ctx.canopy_path(layout_id) else None,
        'glbSpan': {'status': 'unassessed (not shipped)',
                    'reason': 'GLBs are visual review products only (aggregate_world\'s own manifest text); the published package never includes one.',
                    'findings': gate_glb_span(glb_reports)},
        'displayLodBudgets': {'status': 'unassessed (not shipped)',
                              'reason': 'the display-LOD reports describe offline LODs that are not part of the published assets; the real V2_BUDGETS enforcement is gate_draw_call_budget, against factory-lab captures.'},
        'canary': {'status': 'post-approval check',
                   'reason': 'the factory lab captures one fixed viewport per hole; the full preset x viewport sign-off matrix (master plan §8) still runs only against the checked-in fixture lab, after approval.'},
        'factoryLabScopeNote': 'the factory lab renders package/terrain/context geometry only; it does not exercise hole bindings or live-round placement (§77) -- that is proven only by the preview round after approval.',
    }
    return blockers, advisory
