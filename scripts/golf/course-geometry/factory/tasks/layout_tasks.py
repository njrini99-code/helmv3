from source_geometry import resolved_routes

"""Layout-scoped tasks: identity, routes, the scorecard the pipeline reads,
the package and its evidence (Factory v2 §8.2). Route identity is pinned by
a person or proposed from uniquely numbered OSM hole ways inside the site;
an ambiguous set blocks with the candidates as evidence and nothing guesses."""
import json
import os

from .. import imagery
from ..context import MAX_HOLE_COUNT, MIN_HOLE_COUNT, supported_hole_count
from ..fingerprints import (
    content_hash_matches,
    digest,
    terrain_source_identity,
)
from ..model import TaskSpec
from ..providers import select_terrain_provider, supported_terrain_provider_ids
from .common import (
    CRS_FILES,
    TERRAIN_COMPILER_FILES,
    artifact,
    blocked,
    dep_input,
    doc_hash,
    evaluation,
    exists,
    script,
)

CANOPY_SHARE_SUSPECT = 0.02  # below this share of the export, the canopy layer needs a look (Cacapon 2024-09 tile before calibration: 0.03%)
CANOPY_TURF_NDVI_COMPRESSED = 0.25  # fairway NDVI medians: Winchester / the Upper ≈ 0.37; Forsyth 0.12, Cacapon 0.16, Grande Dunes 0.21

INLINE = 'inline'


def eval_identity_resolve(node, ctx):
    layout = ctx.layout(node.scope.layout_id) or {}
    inputs = {'identity': doc_hash(layout, ('layoutId', 'facilityId', 'siteIds', 'externalBindings'))}
    blockers = [] if layout.get('siteIds') or (layout.get('externalBindings') or {}).get('golfCourseIds') else [blocked('LAYOUT_IDENTITY_AMBIGUOUS', layoutId=node.scope.layout_id)]
    return evaluation(inputs, blockers)


def eval_scorecard_validate(node, ctx):
    layout = ctx.layout(node.scope.layout_id) or {}
    card = ctx.scorecard(node.scope.layout_id)
    inputs = {'scorecard': digest([card['profileId'], card['holes']] if card else None), 'holes': digest(layout.get('holeOrder'))}
    blockers = []
    if not card:
        blockers.append(blocked('SCORECARD_REQUIRED', layoutId=node.scope.layout_id))
    holes = len(layout.get('holeOrder') or [])
    if not supported_hole_count(holes):
        blockers.append(blocked('HOLE_COUNT_UNSUPPORTED', holes=holes, minimum=MIN_HOLE_COUNT, maximum=MAX_HOLE_COUNT))
    elif card and len(card['holes']) != holes:
        blockers.append(blocked('SCORECARD_HOLE_MISMATCH', scorecardHoles=len(card['holes']), layoutHoles=holes))
    return evaluation(inputs, blockers)


def eval_routes_resolve(node, ctx):
    layout_id = node.scope.layout_id
    layout = ctx.layout(layout_id) or {}
    resolution = ctx.route_resolution(layout_id)
    source_geometry = ctx.json(ctx.retained(layout, 'sourceGeometry'))
    route_traces = ctx.json(ctx.retained(layout, 'routeTraces'))
    inputs = {'holes': digest(layout.get('holeOrder')), 'catalogRoutes': digest(layout.get('routeWayIds')),
              'sourceGeometry': digest(source_geometry), 'routeTraces': digest(route_traces),
              'extract': None if layout.get('routeWayIds') else dep_input(ctx, node, 'facility.osm.snapshot')}
    if resolution is None:
        return evaluation(inputs)      # the extract is not retained yet; the dependency reports that
    if not resolved_routes(resolution):
        return evaluation(inputs, [blocked(resolution.get('problem') or 'ROUTE_WAY_IDS_REQUIRED', layoutId=layout_id, holes=len(layout.get('holeOrder') or []), **(resolution.get('evidence') or {}))])
    inputs['routes'] = digest(resolution)
    inputs['source'] = resolution['source']
    notes = [f'{resolution["source"]}: {len(layout['holeOrder'])} routes' + (f' inside {resolution.get("site")}' if resolution.get('site') else '')]
    disagreements = ((resolution.get('evidence') or {}).get('chosen') or {}).get('parDisagreements') or []
    if disagreements:
        notes.append(f'{len(disagreements)} OSM par disagreement(s) retained as source conflicts: holes {[d["hole"] for d in disagreements]}')
    path = ctx.routes_path(layout_id)
    doc = ctx.json(path) if ctx.can_adopt(path) else None
    adoptable = bool(doc) and all(doc.get(key) == value for key, value in resolution.items())
    return evaluation(inputs, [], [artifact('routes', path, 'A')] if adoptable else [], adoptable, notes, output=digest(resolution))


def eval_route_dossier(node, ctx):
    """Persist route-selection evidence even when no route may be admitted.

    A missing human pin is a physical-truth blocker, not a reason to discard
    the source evidence needed to resolve it. This task deliberately does not
    depend on ``layout.routes.resolve`` so it can produce a review dossier for
    ambiguous and incomplete OSM extracts.
    """
    layout_id = node.scope.layout_id
    resolution = ctx.route_resolution(layout_id) or {}
    manifest, _extract = ctx.snapshot(node.scope.facility_id)
    inputs = {
        'identity': dep_input(ctx, node, 'layout.identity.resolve'),
        'scorecard': dep_input(ctx, node, 'layout.scorecard.validate'),
        'osm': dep_input(ctx, node, 'facility.osm.snapshot'),
        'resolution': digest(resolution),
    }
    path = os.path.join(ctx.layout_out(layout_id), 'route-review.json')
    doc = ctx.json(path) if ctx.can_adopt(path) else None
    adoptable = bool(doc) and doc.get('layoutId') == layout_id and doc.get('extractSha256') == (manifest or {}).get('uncompressedSha256') \
        and digest(doc.get('routeResolution')) == digest(resolution)
    status = 'resolved' if resolved_routes(resolution) else 'source_confirmation_required'
    notes = [f'route dossier: {status}']
    return evaluation(inputs, [], [artifact('route-review', path, 'C')] if adoptable else [], adoptable, notes,
                      output=digest(doc) if adoptable else None)


def _visual_fallback_inputs(node, ctx):
    layout_id = node.scope.layout_id
    resolution = ctx.route_resolution(layout_id)
    admission = ctx.canonical_route_admission(layout_id)
    route_terrain_renderable = ctx.route_terrain_renderable(layout_id)
    return {
        'osm': dep_input(ctx, node, 'facility.osm.snapshot'),
        # The full evidence object, rather than a Boolean, makes a new source
        # proposal invalidate the visual pointer without admitting it to the
        # physical route chain.
        'routeResolution': digest(resolution),
        # A route proposal alone never suppresses a visual fallback.  A
        # matching scorecard is required before route-specific geometry can
        # become the authoritative physical chain.
        'canonicalRouteAdmission': digest(admission),
        # Native source availability is independent of route identity.  A
        # failed physical acquisition may still have a visual-only facility
        # scene, but it must never borrow the physical terrain pointer.
        'routeTerrainRenderable': route_terrain_renderable,
    }, resolution, admission, route_terrain_renderable


def eval_visual_candidates_compose(node, ctx):
    """A facility-scoped render package for a layout blocked on hole routes.

    It shares source geometry with sibling layouts at the facility but every
    layout receives its own pointer carrying the unresolved-route evidence.
    The pointer is intentionally not a canonical package locator.
    """
    layout_id = node.scope.layout_id
    inputs, resolution, admission, route_terrain_renderable = _visual_fallback_inputs(node, ctx)
    if resolution is None:
        return evaluation(inputs)
    pointer_path = ctx.visual_candidate_pointer_path(layout_id)
    pointer = ctx.json(pointer_path) if ctx.can_adopt(pointer_path) else None
    if admission.get('admitted') and route_terrain_renderable:
        valid = bool(pointer and pointer.get('layoutId') == layout_id
                     and pointer.get('status') == 'not_required_source_route_available'
                     and pointer.get('canonicalHoleRoutesAdmitted') is True
                     and pointer.get('routeSource') == resolution.get('source'))
        return evaluation(inputs, [], [artifact('visual-candidate-pointer', pointer_path, 'C')] if valid else [], valid,
                          ['facility visual fallback not required; source route is available'] if valid else [],
                          output=digest(pointer) if valid else None)
    package_path = ctx.visual_candidate_package_path(layout_id)
    report_path = ctx.visual_candidate_report_path(layout_id)
    package = ctx.json(package_path) if ctx.can_adopt(package_path) else None
    report = ctx.json(report_path) if ctx.can_adopt(report_path) else None
    manifest, _extract = ctx.snapshot(node.scope.facility_id)
    valid = bool(pointer and package and report and content_hash_matches(package)
                 and pointer.get('layoutId') == layout_id
                 and pointer.get('packageHash') == package.get('contentHash')
                 and pointer.get('extractSha256') == (manifest or {}).get('uncompressedSha256')
                 and pointer.get('canonicalHoleRoutesAdmitted') is False
                 and (report.get('renderingContract') or {}).get('canRender') is True
                 and (report.get('renderingContract') or {}).get('canMeasure') is False
                 and (report.get('sourceCoverage') or {}).get('status') in {'sparse', 'contextual'}
                 and (report.get('visualReadiness') or {}).get('highFidelityHoleWorld') is False
                 and pointer.get('sourceCoverage') == report.get('sourceCoverage')
                 and pointer.get('visualReadiness') == report.get('visualReadiness'))
    notes = [f'facility visual candidate {str(package.get("contentHash"))[:12]} (renderable, non-measurable)'] if valid else []
    artifacts = [artifact('visual-candidate-pointer', pointer_path, 'C'), artifact('package', package_path, 'C'),
                 artifact('visual-candidate-report', report_path, 'C')] if valid else []
    return evaluation(inputs, [], artifacts, valid, notes, output=package.get('contentHash') if valid else None)


def eval_visual_terrain_acquire(node, ctx):
    layout_id = node.scope.layout_id
    inputs = {'visualPackage': dep_input(ctx, node, 'layout.visual.candidates.compose')}
    pointer_path = ctx.visual_terrain_pointer_path(layout_id)
    pointer = ctx.json(pointer_path) if ctx.can_adopt(pointer_path) else None
    candidate_pointer = ctx.visual_candidate_pointer(layout_id) or {}
    if candidate_pointer.get('status') == 'not_required_source_route_available':
        valid = bool(pointer and pointer.get('layoutId') == layout_id and pointer.get('status') == 'not_required_source_route_available')
        return evaluation(inputs, [], [artifact('visual-terrain-pointer', pointer_path, 'C')] if valid else [], valid,
                          ['facility visual terrain not required; the route-specific terrain chain is available'] if valid else [],
                          output=digest(pointer) if valid else None)
    package = ctx.json(ctx.visual_candidate_package_path(layout_id))
    folder = ctx.visual_terrain_source_dir(layout_id)
    manifest = ctx.json(os.path.join(folder, 'source-manifest.json')) if folder and ctx.can_adopt(folder) else None
    valid = bool(pointer and package and manifest and manifest.get('coverageMethod') == 'perimeter-v1'
                 and (manifest.get('providerPolicyId') != 'nc_onemap_dem03' or manifest.get('sourceFrameContract') == 'nc-dem03-native-v2')
                 and pointer.get('packageHash') == package.get('contentHash')
                 and pointer.get('sourceIdentity') == terrain_source_identity(manifest)
                 and os.path.isfile(os.path.join(folder, 'elevation.tiff')))
    artifacts = [artifact('visual-terrain-pointer', pointer_path, 'C')]
    if valid:
        artifacts += [artifact(f'visual-terrain-{name}', os.path.join(folder, name), 'C') for name in manifest.get('fileHashes') or {}]
    notes = [f'facility visual terrain {str(pointer.get("sourceIdentity"))[:12]}'] if valid else []
    return evaluation(inputs, [], artifacts if valid else [], valid, notes, output=pointer.get('sourceIdentity') if valid else None)


def eval_visual_world_build(node, ctx):
    layout_id = node.scope.layout_id
    inputs = {'visualPackage': dep_input(ctx, node, 'layout.visual.candidates.compose'),
              'terrain': dep_input(ctx, node, 'layout.visual.terrain.acquire')}
    pointer_path = ctx.visual_world_pointer_path(layout_id)
    pointer = ctx.json(pointer_path) if ctx.can_adopt(pointer_path) else None
    candidate_pointer = ctx.visual_candidate_pointer(layout_id) or {}
    if candidate_pointer.get('status') == 'not_required_source_route_available':
        valid = bool(pointer and pointer.get('layoutId') == layout_id and pointer.get('status') == 'not_required_source_route_available')
        return evaluation(inputs, [], [artifact('visual-world-pointer', pointer_path, 'C')] if valid else [], valid,
                          ['facility visual world not required; route-specific world is available'] if valid else [],
                          output=digest(pointer) if valid else None)
    package = ctx.json(ctx.visual_candidate_package_path(layout_id))
    manifest_path = os.path.join(ctx.visual_world_dir(layout_id), 'course-world-manifest.json')
    manifest = ctx.json(manifest_path) if ctx.can_adopt(manifest_path) else None
    key = ((package or {}).get('holes') or [{}])[0].get('key')
    glb_path = os.path.join(ctx.visual_world_dir(layout_id), 'holes', str(key), 'rendering', f'{key}.glb') if key else None
    preview_path = os.path.join(ctx.visual_world_dir(layout_id), 'holes', str(key), 'rendering', f'{key}-preview.png') if key else None
    valid = bool(pointer and package and manifest and key and glb_path and preview_path
                 and pointer.get('layoutId') == layout_id
                 and pointer.get('visualPackageHash') == package.get('contentHash')
                 and manifest.get('packageHash') == package.get('contentHash')
                 and pointer.get('canonicalHoleRoutesAdmitted') is False
                 and (pointer.get('renderingContract') or {}).get('canRender') is True
                 and (pointer.get('renderingContract') or {}).get('canMeasure') is False
                 and os.path.isfile(glb_path) and os.path.isfile(preview_path))
    artifacts = [artifact('visual-world-pointer', pointer_path, 'C'), artifact('visual-world-manifest', manifest_path, 'C'),
                 artifact('visual-world-glb', glb_path, 'C'), artifact('visual-world-preview', preview_path, 'C')] if valid else []
    notes = [f'facility visual GLB {str(package.get("contentHash"))[:12]} (route unresolved; no measurement authority)'] if valid else []
    return evaluation(inputs, [], artifacts, valid, notes, output=package.get('contentHash') if valid else None)


def eval_scorecard_compose(node, ctx):
    layout_id = node.scope.layout_id
    inputs = {'routes': dep_input(ctx, node, 'layout.routes.resolve'), 'scorecard': dep_input(ctx, node, 'layout.scorecard.validate'),
              'aoi': dep_input(ctx, node, 'facility.aoi.resolve'), 'origin': digest((ctx.facility(node.scope.facility_id) or {}).get('originWgs84'))}
    doc = ctx.pilot_scorecard(layout_id)
    if not doc:
        return evaluation(inputs)
    path = ctx.scorecard_path(layout_id)
    existing = ctx.json(path) if ctx.can_adopt(path) else None
    adoptable = existing is not None and digest(existing) == digest(doc)
    return evaluation(inputs, [], [artifact('scorecard', path, 'A')] if adoptable else [], adoptable, [f'pilot scorecard: profile {doc["scorecardProfile"]}, routes {doc["routeSource"]}'], output=digest(doc))


def _package_eval(folder_fn, dep_ids, with_canopy=False):
    def evaluate(node, ctx):
        layout_id = node.scope.layout_id
        inputs = {dep: dep_input(ctx, node, dep) for dep in dep_ids}
        traces = ctx.json(ctx.retained(ctx.layout(layout_id), 'imageryTraces'))
        imported = ctx.json(ctx.retained(ctx.layout(layout_id), 'sourceGeometry'))
        route_traces = ctx.json(ctx.retained(ctx.layout(layout_id), 'routeTraces'))
        inputs['traces'] = digest(traces)
        inputs['sourceGeometry'] = digest(imported)
        inputs['routeTraces'] = digest(route_traces)
        if with_canopy:
            inputs['canopy'] = dep_input(ctx, node, 'layout.canopy.derive')
        folder = folder_fn(ctx, layout_id)
        path = os.path.join(folder, 'normalized.json')
        pkg = ctx.json(path) if ctx.can_adopt(path) else None
        if not pkg:
            return evaluation(inputs)
        if not content_hash_matches(pkg):
            return evaluation(inputs, [blocked('SOURCE_HASH_MISMATCH', path=ctx.relpath(path), detail='package contentHash does not recompute')])
        meta = ctx.json(os.path.join(folder, 'source-metadata.json')) or {}
        manifest, _extract = ctx.snapshot(node.scope.facility_id)
        card = ctx.pilot_scorecard(layout_id)
        notes = []
        adoptable = True
        expected_hashes = {
            'sourceGeometryHash': digest(imported) if imported is not None else None,
            # Route traces are normalized before their explicit bindings are
            # consumed. Compare the same normalized identity the importer
            # persisted, while raw bytes remain separately auditable.
            'routeTracesHash': (ctx.route_resolution(layout_id) or {}).get('routeTracesHash') if route_traces is not None else None,
            'imageryTracesHash': digest(traces) if traces is not None else None,
        }
        for key, expected in expected_hashes.items():
            if meta.get(key) != expected:
                adoptable, notes = False, notes + [f'package was prepared from another {key}']
        if manifest and meta.get('overpassSha256') != manifest.get('uncompressedSha256'):
            adoptable, notes = False, notes + ['package was prepared from another extract']
        if card and digest(meta.get('scorecard')) != digest(card):
            adoptable, notes = False, notes + ['package was prepared from another scorecard']
        report = ctx.json(os.path.join(folder, 'association-report.json')) or {}
        if with_canopy:
            terrain = ctx.terrain_source_manifest(layout_id)
            if not terrain or terrain.get('coverageMethod') != 'perimeter-v1':
                return evaluation(inputs, [], [], False, ['package canopy evidence depends on a terrain source that predates the perimeter-coverage contract'])
            canopy_used = bool((report.get('canopy') or {}).get('rasterSha256'))
            canopy_now = ctx.states.get(f'layout.canopy.derive[{layout_id}]') in ('cached', 'success') and exists(ctx.canopy_path(layout_id))
            if canopy_used != canopy_now:
                adoptable, notes = False, notes + ['package canopy merge differs from the current canopy review']
        if adoptable:
            partial = [h['key'] for h in pkg.get('holes', []) if h.get('completeness') not in (None, 'complete')]
            notes.append(f'package {pkg["contentHash"][:12]}: {len(pkg.get("holes", []))} holes, {len(pkg.get("features", []))} features, status {pkg.get("status")}'
                         + (f', {len(partial)} partial' if partial else ''))
        ref = artifact('package', path, 'A')
        ref.sha256 = pkg['contentHash']
        return evaluation(inputs, [], [ref, artifact('association-report', os.path.join(folder, 'association-report.json'), 'A'),
                                       artifact('source-metadata', os.path.join(folder, 'source-metadata.json'), 'A')], adoptable, notes, output=pkg['contentHash'])
    return evaluate


def eval_package_compose(node, ctx):
    """The served package: the catalog's checked-in package when it names one
    (verified by its contentHash), else the second prepare pass."""
    layout_id = node.scope.layout_id
    geometry = (ctx.layout(layout_id) or {}).get('geometry')
    if geometry:
        inputs = {'candidates': dep_input(ctx, node, 'layout.candidates.compose'), 'canopy': dep_input(ctx, node, 'layout.canopy.derive'),
                  'traces': digest(ctx.json(ctx.retained(ctx.layout(layout_id), 'imageryTraces'))),
                  'routeTraces': digest(ctx.json(ctx.retained(ctx.layout(layout_id), 'routeTraces'))), 'checkedIn': geometry['package']}
        path = ctx.package_path(layout_id)
        pkg = ctx.package(layout_id)
        if not pkg:
            return evaluation(inputs, [blocked('SOURCE_HASH_MISMATCH', path=geometry['package'], detail='the catalog names a package that does not exist')])
        if not content_hash_matches(pkg):
            return evaluation(inputs, [blocked('SOURCE_HASH_MISMATCH', path=ctx.relpath(path), detail='package contentHash does not recompute')])
        ref = artifact('package', path, 'A')
        ref.sha256 = pkg['contentHash']
        return evaluation(inputs, [], [ref], True, [f'checked-in package {pkg["contentHash"][:12]} status {pkg.get("status")}, {len(pkg.get("holes", []))} holes'], output=pkg['contentHash'])
    return _package_eval(lambda c, l: c.package_dir(l), ('layout.candidates.compose', 'layout.scorecard.compose', 'facility.osm.snapshot'), with_canopy=True)(node, ctx)


def eval_terrain_acquire(node, ctx):
    layout_id = node.scope.layout_id
    facility = ctx.facility(node.scope.facility_id) or {}
    providers = (facility.get('providerPolicy') or {}).get('terrain') or []
    # The input is the compiler's request bounds (hole extents snapped to its
    # grid), not the geometry itself: moving a bunker inside a hole does not
    # ask for a different raster.
    blockers = []
    footprint = None
    try:
        bounds = ctx.terrain_bounds(layout_id)
        footprint = digest(bounds) if bounds else None
    except ImportError as exc:
        blockers.append(blocked('TOOL_MISSING', tool=exc.name or 'python geometry stack', detail=f'compile-course-terrain.py needs it to size the terrain request: {exc}'))
    provider = select_terrain_provider(providers)
    inputs = {'footprint': footprint, 'origin': digest(facility.get('originWgs84')), 'providers': digest(providers),
              'selectedProvider': provider.policy_id if provider else None}
    if provider is None:
        blockers.append(blocked('TERRAIN_ADAPTER_MISSING', providers=providers, available=list(supported_terrain_provider_ids())))
    if blockers:
        return evaluation(inputs, blockers)
    pointer = ctx.terrain_pointer(layout_id)
    folder = ctx.terrain_source_dir(layout_id)
    manifest = ctx.json(os.path.join(folder, 'source-manifest.json')) if folder and ctx.can_adopt(folder) else None
    if not manifest:
        return evaluation(inputs)
    # A facility-context raster can be deliberately rendered at a derived
    # resolution after native acquisition fails.  That artifact is useful for
    # a scene, but it must never be adopted by the route-specific physical
    # branch merely because it has a terrain-shaped manifest.
    if manifest.get('renderingOnly'):
        return evaluation(inputs, [blocked(
            'RENDERING_ONLY_TERRAIN_SOURCE',
            layoutId=layout_id,
            sourceIdentity=terrain_source_identity(manifest),
            detail='rendering-only terrain cannot support physical terrain, hole association, or measurement',
        )])
    if manifest.get('coverageMethod') != 'perimeter-v1':
        return evaluation(inputs, [], [], False, ['terrain source predates the perimeter-coverage contract'])
    if manifest.get('providerPolicyId') == 'nc_onemap_dem03' and manifest.get('sourceFrameContract') != 'nc-dem03-native-v2':
        return evaluation(inputs, [], [], False, ['NC source predates verified native-frame contract; preserve old evidence and acquire a new revision'])
    notes = [f'{manifest.get("selectedTitle")} retrieved {manifest.get("retrievedAt")}']
    # The verified artifacts are the raster files and the pointer. The source
    # manifest itself is evidence, not an artifact: the compiler appends every
    # package it serves to it, so its bytes change while the source does not.
    artifacts = [artifact('terrain-source-pointer', ctx.terrain_pointer_path(layout_id), 'A')] if pointer else []
    adoptable = True
    for name, sha in (manifest.get('fileHashes') or {}).items():
        ref = artifact(f'terrain-{name}', os.path.join(folder, name), 'A')
        artifacts.append(ref)
        if ref.sha256 != sha:
            adoptable = False
            notes.append(f'{name} does not match the manifest hash' if ref.sha256 else f'{name} is missing')
    candidates = ctx.json(ctx.candidates_package_path(layout_id)) if ctx.can_adopt(ctx.candidates_package_path(layout_id)) else None
    served = [manifest.get('packageHash'), *(manifest.get('previousPackageHashes') or [])]
    if candidates and candidates.get('contentHash') not in served and not ctx.retained(facility, 'terrain'):
        adoptable = False
        notes.append('terrain source has not served the current candidate package (bounds are re-checked on acquire)')
    return evaluation(inputs, [], artifacts, adoptable, notes, output=terrain_source_identity(manifest))


def canopy_identity(doc):
    """What the package merge consumes: the groups and the method that drew
    them (and the raster they came from), not the day the pass ran. A
    re-derivation that changes the groups must reach the package and every
    hole compile; one that reproduces them must not."""
    return digest({k: v for k, v in doc.items() if k not in ('reviewedAt', 'reviewer', 'packageHash')})


def eval_canopy_derive(node, ctx):
    layout_id = node.scope.layout_id
    inputs = {'terrain': dep_input(ctx, node, 'layout.terrain.acquire'), 'candidates': dep_input(ctx, node, 'layout.candidates.compose')}
    indexed = ctx.indexed_imagery(layout_id)
    if indexed:
        inputs['indexedImagery'] = indexed['identity']
    path = ctx.canopy_path(layout_id)
    doc = ctx.json(path) if ctx.can_adopt(path) else None
    if not doc:
        return evaluation(inputs)
    terrain = ctx.terrain_source_manifest(layout_id)
    if not terrain or terrain.get('coverageMethod') != 'perimeter-v1':
        return evaluation(inputs, [], [], False, ['canopy review depends on a terrain source that predates the perimeter-coverage contract'])
    naip = ctx.naip_dir(layout_id)
    naip_manifest = ctx.json(os.path.join(naip, 'manifest.json')) if naip else None
    notes = [f'canopy review {doc.get("reviewedAt", "")}: {len(doc.get("regions", []))} groups, raster {str(doc.get("rasterSha256"))[:12]}']
    share = (doc.get('stats') or {}).get('canopyShareOfExport')
    if share is not None and share < CANOPY_SHARE_SUSPECT:
        # Not a blocker: a treeless course exists. A reviewer decides whether
        # the tile is bright/hazy (fixed NDVI threshold missed the canopy) or
        # the course really has no tree groups.
        notes.append(f'CANOPY_SHARE_SUSPECT: canopy covers {share:.2%} of the export (tiles {", ".join(doc.get("catalogTiles") or [])}); '
                     f'check the NAIP capture before trusting the canopy layer')
    calibration = (doc.get('method') or {}).get('ndviCalibration') or {}
    turf = calibration.get('turfNdviMedian')
    if turf is not None and turf < CANOPY_TURF_NDVI_COMPRESSED:
        # The gate was loosened for this export; forest in deep shadow may
        # still fall below it. A reviewer decides whether another NAIP year
        # (leaf-on, clearer) should replace this capture.
        notes.append(f'CANOPY_EXPORT_COMPRESSED: fairway NDVI median {turf:.2f}, gate loosened to {calibration.get("ndviMin")} (captured {", ".join(doc.get("capturedAt") or [])}); '
                     f'shadowed forest may still fall below it; check the canopy overlay, another NAIP year may read better')
    stale = imagery.stale(ctx, layout_id)
    if stale:
        # Not a blocker either: tree groups outlive most renovations. The
        # imagery audit, which reads the surfaces a renovation moves, blocks.
        notes.append(f'{imagery.CODE}: captured {stale["earliestCapture"]}..{stale["latestCapture"]}, renovation after {stale["knownRenovationAfter"]}; '
                     f'the canopy layer shows the course before it')
    adoptable = True
    if indexed and (doc.get('sourceIdentity') != indexed['identity'] or not naip_manifest
                    or naip_manifest.get('sourceIdentity') != indexed['identity']):
        adoptable, notes = False, notes + ['canopy must be rederived from the verified facility imagery cache']
    if naip_manifest and naip_manifest.get('rasterSha256') != doc.get('rasterSha256'):
        adoptable, notes = False, notes + ['canopy review was derived from another NAIP export']
    candidates = ctx.json(ctx.candidates_package_path(layout_id)) if ctx.can_adopt(ctx.candidates_package_path(layout_id)) else None
    if candidates and doc.get('packageHash') and doc['packageHash'] != candidates.get('contentHash') and not ctx.retained(ctx.layout(layout_id), 'canopyReview'):
        adoptable, notes = False, notes + [f'canopy review is for candidate package {doc["packageHash"][:12]}']
    artifacts = [artifact('canopy-review', path, 'A')]
    if naip_manifest:
        artifacts += [artifact('naip-manifest', os.path.join(naip, 'manifest.json'), 'B'), artifact('naip-raster', os.path.join(naip, 'naip.tif'), 'B')]
    return evaluation(inputs, [], artifacts, adoptable, notes, output=canopy_identity(doc))


def eval_package_validate(node, ctx):
    layout_id = node.scope.layout_id
    inputs = {'package': dep_input(ctx, node, 'layout.package.compose') or ctx.package_hash(layout_id), 'context': digest((ctx.context_layer(layout_id) or {}).get('contentHash')),
              'reviewOverlay': digest(ctx.review_overlay(layout_id))}
    pkg = ctx.package(layout_id)
    if pkg and not content_hash_matches(pkg):
        return evaluation(inputs, [blocked('SOURCE_HASH_MISMATCH', detail='package contentHash does not recompute')])
    notes = []
    if pkg:
        partial = [h['key'] for h in pkg.get('holes', []) if h.get('completeness') not in (None, 'complete')]
        notes.append(f'{len(partial)} of {len(pkg.get("holes", []))} holes partial' if partial else 'every hole complete')
    path = os.path.join(ctx.layout_out(layout_id), 'hole-subhashes.json')
    doc = ctx.json(path) if ctx.can_adopt(path) else None
    adoptable = bool(doc) and bool(pkg) and doc.get('packageHash') == pkg.get('contentHash') and doc.get('contextHash') == (ctx.context_layer(layout_id) or {}).get('contentHash')
    return evaluation(inputs, [], [artifact('hole-subhashes', path, 'C')] if adoptable else [], adoptable, notes, output=digest(doc) if adoptable else None)


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


def eval_terrain_base(node, ctx):
    layout_id = node.scope.layout_id
    inputs = {'package': dep_input(ctx, node, 'layout.package.compose'), 'terrain': dep_input(ctx, node, 'layout.terrain.acquire')}
    # A retained full compile of this package is the base the retained
    # context layer was classified against; it serves as the base here.
    folder = ctx.terrain_base_dir(layout_id)
    retained = ctx.retained(ctx.layout(layout_id), 'compiled')
    manifest = ctx.json(os.path.join(folder, 'asset-manifest.json')) if ctx.can_adopt(folder) else None
    if not manifest:
        return evaluation(inputs)
    holes = len(manifest.get('holes') or {})
    wanted = len((ctx.package(layout_id) or {}).get('holes') or [])
    adoptable = manifest.get('geometryHash') == ctx.package_hash(layout_id) and ctx.compiled_source_matches(layout_id, folder) and holes == wanted
    notes = [f'{"retained" if folder == retained else "base"} compile: {holes} of {wanted} holes for package {str(manifest.get("geometryHash"))[:12]}']
    return evaluation(inputs, [], [artifact('compiled-base-assets', os.path.join(folder, 'asset-manifest.json'), 'C')], adoptable, notes, output=digest(manifest) if adoptable else None)


def eval_imagery_audit(node, ctx):
    layout_id = node.scope.layout_id
    inputs = {'package': dep_input(ctx, node, 'layout.package.compose'), 'imagery': dep_input(ctx, node, 'layout.canopy.derive')}
    stale = imagery.stale(ctx, layout_id)
    if stale:
        # Sand shares read against pre-renovation ground would send a
        # reviewer after bunkers that were rebuilt, so the audit is a
        # freshness failure (v2 §21.5) until a later capture is retained or
        # the owner lifts the date. An earlier success does not outrank this.
        return evaluation(inputs, [blocked(imagery.CODE, layoutId=layout_id, capturedAt=', '.join(stale['capturedAt']), knownRenovationAfter=stale['knownRenovationAfter'])])
    path = ctx.imagery_review_path(layout_id)
    doc = ctx.json(path) if ctx.can_adopt(path) else None
    if not doc:
        return evaluation(inputs)
    if doc.get('packageHash') and doc['packageHash'] != ctx.package_hash(layout_id):
        return evaluation(inputs, [], [], False, [f'imagery review is for package {doc["packageHash"][:12]}'])
    return evaluation(inputs, [], [artifact('imagery-review', path, 'A')], True, [f'imagery review dossier: {len(doc.get("holes", []))} holes'], output=digest(doc))


def eval_context_classify(node, ctx):
    layout_id = node.scope.layout_id
    inputs = {'package': dep_input(ctx, node, 'layout.package.compose'), 'context': dep_input(ctx, node, 'facility.context.snapshot'),
              'base': dep_input(ctx, node, 'layout.terrain.base')}
    path = ctx.context_layer_path(layout_id)
    doc = ctx.json(path) if ctx.can_adopt(path) else None
    if not doc:
        return evaluation(inputs)
    if not content_hash_matches(doc):
        return evaluation(inputs, [blocked('SOURCE_HASH_MISMATCH', path=ctx.relpath(path), detail='context contentHash does not recompute')])
    if doc.get('packageHash') != ctx.package_hash(layout_id):
        return evaluation(inputs, [], [], False, [f'context layer is for package {str(doc.get("packageHash"))[:12]}'])
    if not ctx.compiled_source_matches(layout_id, ctx.terrain_base_dir(layout_id)):
        return evaluation(inputs, [], [], False, ['context layer depends on a terrain source that predates the perimeter-coverage contract'])
    report_path = ctx.context_report_path(layout_id)
    report = ctx.json(report_path) if ctx.can_adopt(report_path) else None
    ref = artifact('context-layer', path, 'A')
    ref.sha256 = doc['contentHash']
    artifacts = [ref] + ([artifact('context-report', report_path, 'A')] if report and report.get('layerHash') == doc['contentHash'] else [])
    return evaluation(inputs, [], artifacts, True, [f'context layer {doc["contentHash"][:12]}, {len(doc.get("zones", []))} zones, status {doc.get("status")}'], output=doc['contentHash'])


def eval_review_compose(node, ctx):
    layout_id = node.scope.layout_id
    overlay = ctx.review_overlay(layout_id)
    inputs = {'package': dep_input(ctx, node, 'layout.package.validate'), 'overlay': digest(overlay)}
    notes = [f'{len(overlay.get("decisions", []))} review decisions'] if overlay else ['no review overlay yet (PR E)']
    return evaluation(inputs, [], [], False, notes)


SPECS = [
    TaskSpec('layout.identity.resolve', '2', 'layout', ('catalog.validate',), eval_identity_resolve, executor=INLINE),
    TaskSpec('layout.scorecard.validate', '1', 'layout', ('catalog.validate',), eval_scorecard_validate, executor=INLINE),
    TaskSpec('layout.routes.resolve', '3', 'layout', ('layout.identity.resolve', 'layout.scorecard.validate', 'facility.osm.snapshot'), eval_routes_resolve, impl_files=(script('source_geometry.py'), script('factory/context.py')), retention='A', estimated_bytes=10_000),
    TaskSpec('layout.route.dossier', '1', 'layout', ('layout.identity.resolve', 'layout.scorecard.validate', 'facility.osm.snapshot'), eval_route_dossier,
             impl_files=(script('factory/adapters.py'),), retention='C', estimated_bytes=20_000),
    TaskSpec('layout.visual.candidates.compose', '2', 'layout', ('layout.identity.resolve', 'facility.osm.snapshot', 'layout.routes.resolve?', 'layout.terrain.acquire?'), eval_visual_candidates_compose,
             impl_files=(script('prepare-osm-facility-visual.py'),), retention='C', estimated_bytes=20_000_000),
    TaskSpec('layout.visual.terrain.acquire', '1', 'layout', ('layout.visual.candidates.compose',), eval_visual_terrain_acquire,
             impl_files=TERRAIN_COMPILER_FILES, retention='C', estimated_bytes=450_000_000),
    TaskSpec('layout.visual.world.build', '1', 'layout', ('layout.visual.candidates.compose', 'layout.visual.terrain.acquire'), eval_visual_world_build,
             impl_files=(script('build-course-world.py'), script('normalize-study.py'), script('compile-physical-world.py'),
                         script('course-truth-gate.py'), script('blender/generate_hole.py'), script('blender/validate_glb.py')),
             retention='C', estimated_bytes=120_000_000),
    TaskSpec('layout.scorecard.compose', '2', 'layout', ('layout.routes.resolve', 'layout.scorecard.validate', 'facility.aoi.resolve'), eval_scorecard_compose, impl_files=(script('source_geometry.py'), script('factory/context.py')), retention='A', estimated_bytes=10_000),
    TaskSpec('layout.candidates.compose', '1', 'layout', ('facility.osm.snapshot', 'layout.scorecard.compose'),
             _package_eval(lambda c, l: c.candidates_dir(l), ('facility.osm.snapshot', 'layout.scorecard.compose')),
             impl_files=(script('prepare-osm-course.py'), script('source_geometry.py')) + CRS_FILES, retention='A', estimated_bytes=20_000_000),
    TaskSpec('layout.terrain.acquire', '1', 'layout', ('layout.candidates.compose',), eval_terrain_acquire,
             impl_files=TERRAIN_COMPILER_FILES, retention='A', estimated_bytes=300_000_000),
    TaskSpec('layout.canopy.derive', '1', 'layout', ('layout.terrain.acquire', 'layout.candidates.compose'), eval_canopy_derive,
             impl_files=(script('derive-canopy-naip.py'), script('indexed_naip.py'), script('fetch-usgs-naip-facility-ortho.py'), script('factory/payload_reuse.py')) + CRS_FILES, retention='B', estimated_bytes=500_000_000),
    TaskSpec('layout.package.compose', '1', 'layout', ('layout.candidates.compose', 'layout.scorecard.compose', 'facility.osm.snapshot', 'layout.canopy.derive?'), eval_package_compose,
             impl_files=(script('prepare-osm-course.py'), script('source_geometry.py')) + CRS_FILES, retention='A', estimated_bytes=5_000_000),
    TaskSpec('layout.package.validate', '1', 'layout', ('layout.package.compose', 'layout.context.classify?'), eval_package_validate, executor=run_package_validate, retention='C'),
    TaskSpec('layout.terrain.base', '1', 'layout', ('layout.package.compose', 'layout.terrain.acquire'), eval_terrain_base,
             impl_files=TERRAIN_COMPILER_FILES + (script('factory/payload_reuse.py'),), retention='C', estimated_bytes=100_000_000),
    TaskSpec('layout.imagery.audit', '1', 'layout', ('layout.package.compose', 'layout.canopy.derive'), eval_imagery_audit,
             impl_files=(script('review-course-imagery.py'),) + CRS_FILES, retention='A', estimated_bytes=200_000_000),
    TaskSpec('layout.context.classify', '1', 'layout', ('layout.package.compose', 'facility.context.snapshot', 'layout.terrain.base'), eval_context_classify,
             impl_files=(script('prepare-context-layer.py'), script('factory/payload_reuse.py')), retention='A', estimated_bytes=5_000_000),
    TaskSpec('layout.review.compose', '1', 'layout', ('layout.package.validate', 'layout.imagery.audit?', 'layout.context.classify?'), eval_review_compose, executor=INLINE),
]
