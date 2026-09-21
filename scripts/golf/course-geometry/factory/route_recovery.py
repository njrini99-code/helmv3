"""Retained-only route work inventory. No inference, downloader or approval writer.

Readiness here means the existing route/scorecard prerequisites permit an
assembly attempt. The preparer still validates endpoint/green associations;
neither this report nor a successful candidate assembly grants physical truth.
"""
import gzip
import hashlib
import json
import math
import os
import shlex
from collections import Counter

from source_geometry import resolved_routes

from . import osm
from .context import supported_hole_count

MAX_EXTRACT_BYTES = 64 * 1024 * 1024
VISUAL_CORRIDOR_MIN_METERS = 20
VISUAL_CORRIDOR_MAX_METERS = 900


def _polygon_feature(element, kind):
    """Return a retained OSM polygon with its source identity intact.

    This deliberately accepts only closed way geometry.  A visual candidate
    must be able to point back to a source feature; it must not repair a way,
    turn a line into an area, or fill missing coordinates in order to make an
    attractive scene.
    """
    points = osm.way_points(element)
    if len(points) < 4 or points[0] != points[-1]:
        return None
    try:
        from shapely.geometry import Polygon
        polygon = Polygon(points)
        if polygon.is_empty or not polygon.is_valid or polygon.area <= 0:
            return None
        center = polygon.centroid
    except (TypeError, ValueError):
        return None
    return {
        'id': f'osm-way-{element["id"]}',
        'wayId': element['id'],
        'kind': kind,
        'centerWgs84': [center.x, center.y],
        # The original source geometry is referenced by its retained extract
        # and way ID.  Copying it into an inferred route artifact would make
        # it too easy for a consumer to mistake the candidate for a reviewed
        # hole package.
        'sourceTags': {key: value for key, value in (element.get('tags') or {}).items()
                       if key in {'golf', 'name', 'ref', 'source'}},
    }


def _distance_meters(a, b):
    """Great-circle distance for candidate ranking only.

    It is never a hole yardage, does not use the scorecard, and is not written
    into a measurement-capable world.  The raw longitude/latitude coordinates
    remain the source evidence for a later projected-meter review.
    """
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    sin_lat = math.sin((lat2 - lat1) / 2)
    sin_lon = math.sin((lon2 - lon1) / 2)
    h = sin_lat * sin_lat + math.cos(lat1) * math.cos(lat2) * sin_lon * sin_lon
    return 6_371_008.8 * 2 * math.asin(min(1.0, math.sqrt(h)))


def visual_corridor_candidates(extract, layout):
    """Build source-referenced *visual* tee-to-green pair candidates.

    The result is intentionally not a route resolver.  OSM often records tee
    and green polygons without ``golf=hole`` lines.  Those polygons can make
    a useful, per-green 3D review scene, but they cannot establish which
    scorecard hole the scene is, the playing route, a tee marker, or any
    metric distance.  We therefore emit anonymous stable candidate keys and
    an estimated display line, never a ``routeWayId``/``physicalHoleId``.

    A renderer may use these candidates to build per-candidate assets.  The
    candidate contract is fail-closed for One Tap and physical consumers:
    ``maySupplyHoleAssociation`` and ``canMeasure`` are both false.
    """
    features = {'tee': [], 'green': [], 'fairway': []}
    for element in (extract or {}).get('elements', []):
        if element.get('type') != 'way':
            continue
        kind = (element.get('tags') or {}).get('golf')
        if kind not in features:
            continue
        feature = _polygon_feature(element, kind)
        if feature:
            features[kind].append(feature)
    for values in features.values():
        values.sort(key=lambda feature: feature['wayId'])

    candidates, green_only = [], []
    tee_use = Counter()
    pair_rows = []
    for green in features['green']:
        ranked = sorted(((_distance_meters(green['centerWgs84'], tee['centerWgs84']), tee)
                         for tee in features['tee']), key=lambda item: (item[0], item[1]['wayId']))
        eligible = [(distance, tee) for distance, tee in ranked
                    if VISUAL_CORRIDOR_MIN_METERS <= distance <= VISUAL_CORRIDOR_MAX_METERS]
        if not eligible:
            green_only.append({
                'candidateId': f'visual-green-osm-way-{green["wayId"]}',
                'truthClass': 'derived', 'authority': 'visual_only',
                'greenSourceFeature': green,
                'reason': 'NO_TEE_POLYGON_IN_VISUAL_CORRIDOR_RANGE',
                'limitations': [
                    'source-backed green context has no eligible source tee polygon; no tee-to-green display line exists',
                    'candidate key is not a physical hole ID or scorecard ordinal',
                    'candidate cannot supply tee identity, hole association, distance, lie, slope, pin, or shot constraint',
                ],
            })
            continue
        distance, tee = eligible[0]
        tee_use[tee['wayId']] += 1
        second_distance = eligible[1][0] if len(eligible) > 1 else None
        pair_rows.append((green, tee, distance, second_distance))

    for green, tee, distance, second_distance in pair_rows:
        fairways = sorted(((_distance_meters(green['centerWgs84'], fairway['centerWgs84']), fairway)
                           for fairway in features['fairway']), key=lambda item: (item[0], item[1]['wayId']))
        # A nearby fairway polygon is useful visual context but has no bearing
        # on ownership.  It must not be used as an analytical corridor.
        fairway = fairways[0][1] if fairways and fairways[0][0] <= 500 else None
        candidate_id = f'visual-corridor-osm-way-{green["wayId"]}-from-{tee["wayId"]}'
        candidates.append({
            'candidateId': candidate_id,
            'truthClass': 'estimated',
            'authority': 'visual_only',
            'reviewStatus': 'candidate',
            'sourceFeatures': {
                'tee': tee,
                'green': green,
                'fairwayContext': fairway,
            },
            # This is an estimated line joining two source-backed centroids;
            # it is not copied into canonical geometry and must never be
            # renamed a physical route after a renderer consumes it.
            'visualCorridorWgs84': {
                'type': 'LineString',
                'coordinates': [tee['centerWgs84'], green['centerWgs84']],
            },
            'pairingEvidence': {
                'method': 'nearest_source_tee_to_source_green_v1',
                'candidateDistanceMeters': round(distance, 3),
                'nextNearestTeeDistanceMeters': round(second_distance, 3) if second_distance is not None else None,
                'teeReusedAcrossGreenCandidates': None,  # filled below without changing source inputs
                'rangeMeters': [VISUAL_CORRIDOR_MIN_METERS, VISUAL_CORRIDOR_MAX_METERS],
                'layoutScorecardUsed': False,
                'holeOrderUsed': False,
            },
            'limitations': [
                'estimated display line joins source feature centroids; it is not a measured playing route',
                'candidate key is not a physical hole ID or scorecard ordinal',
                'tee polygon is a maintained surface candidate, not a daily tee marker',
                'candidate cannot supply tee identity, hole association, distance, lie, slope, pin, or shot constraint',
            ],
        })
    for candidate in candidates:
        tee_id = candidate['sourceFeatures']['tee']['wayId']
        candidate['pairingEvidence']['teeReusedAcrossGreenCandidates'] = tee_use[tee_id]
        if tee_use[tee_id] > 1:
            candidate['limitations'].append('same source tee polygon is nearest to more than one green; association ambiguity remains')
    candidates.sort(key=lambda candidate: candidate['candidateId'])
    green_only.sort(key=lambda candidate: candidate['candidateId'])
    return {
        'schema': 'golfhelm-visual-route-candidates-v1',
        'layoutId': layout['layoutId'],
        'sourceFeatureCounts': {kind: len(values) for kind, values in features.items()},
        'candidateCount': len(candidates),
        'greenOnlyCount': len(green_only),
        'candidates': candidates,
        'greenOnlyCandidates': green_only,
        'renderingContract': {
            'canRender': bool(candidates or green_only),
            'canMeasure': False,
            'maySupplyHoleAssociation': False,
            'maySupplyTeeIdentity': False,
            'maySupplyRouteIdentity': False,
            'maySupplyPhysicalGeometry': False,
            'rule': 'These are anonymous visual candidates. Only a separate reviewed route/surface import may create canonical hole geometry.',
        },
    }


def visual_render_plan(ctx, layout, source, candidates, canonical_route_available):
    """Describe display-only candidate assets without compiling or publishing.

    The plan is the only hand-off from retained visual candidates to a renderer.
    Each requested asset references one verified retained source artifact and
    source way IDs.  It intentionally has no canonical package path, no
    physical-hole key, and no production/One-Tap loader identifier.
    """
    layout_id = layout['layoutId']
    contract = candidates['renderingContract']
    if source.get('status') != 'verified':
        status = 'blocked_source_artifact_unverified'
    elif canonical_route_available:
        status = 'not_required_canonical_route_available'
    elif not contract['canRender']:
        status = 'blocked_no_renderable_source_features'
    else:
        status = 'ready_display_only_compile'
    source_artifact = None
    if source.get('status') == 'verified':
        source_artifact = {
            'kind': 'retained_overpass_extract',
            'path': source['path'],
            'sha256': source['sha256'],
            'license': 'ODbL-1.0',
            'verification': 'snapshot_manifest_sha256_verified',
        }
    assets = []
    if status == 'ready_display_only_compile':
        scene_rows = [(candidate, 'tee_green_candidate') for candidate in candidates['candidates']]
        scene_rows += [(candidate, 'green_complex_context') for candidate in candidates['greenOnlyCandidates']]
        for candidate, scene_type in scene_rows:
            source_features = candidate.get('sourceFeatures') or {'green': candidate.get('greenSourceFeature')}
            way_ids = sorted(feature['wayId'] for feature in source_features.values() if feature)
            assets.append({
                'assetKey': f'{layout_id}--{candidate["candidateId"]}',
                'candidateId': candidate['candidateId'],
                'sceneType': scene_type,
                'sourceArtifact': source_artifact,
                'sourceWayIds': way_ids,
                'truthClass': candidate['truthClass'],
                'authority': 'visual_only',
                # Deliberately a derived-output suggestion, never a public
                # manifest entry. A renderer must store the exact plan hash
                # with any preview/GLB it creates.
                'suggestedDerivedDirectory': ctx.relpath(
                    os.path.join(ctx.layout_out(layout_id), 'visual-route-candidates', candidate['candidateId'])),
                'limitations': candidate['limitations'] + [
                    'asset is review/display-only and must not be registered in the canonical hole asset manifest',
                    'asset must retain this plan hash and source artifact hash for audit',
                ],
            })
    plan = {
        'schema': 'golfhelm-visual-route-render-plan-v1',
        'layoutId': layout_id,
        'status': status,
        'sourceArtifact': source_artifact,
        'candidateCoverage': {
            'candidateCount': candidates['candidateCount'],
            'greenOnlyCount': candidates['greenOnlyCount'],
            'expectedHoleCount': len(layout.get('holeOrder') or []),
            'candidateCountMatchesExpectedHoleCount': candidates['candidateCount'] == len(layout.get('holeOrder') or []),
            'greenCountMatchesExpectedHoleCount': candidates['sourceFeatureCounts']['green'] == len(layout.get('holeOrder') or []),
        },
        'assets': assets,
        'renderingContract': {
            **contract,
            'mayEnterCanonicalPackage': False,
            'mayEnterOneTap': False,
            'mayPublishAsPhysicalHoleWorld': False,
            'rule': 'A visual candidate asset is an auditable display artifact, never a route, tee, scorecard, physical-hole, or measurement authority.',
        },
    }
    plan['contentHash'] = hashlib.sha256(json.dumps(plan, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    return plan


def _snapshot(ctx, facility_id):
    manifest, path = ctx.snapshot(facility_id)
    if not path:
        return {'status': 'missing', 'path': None}, None
    opener = gzip.open if str(path).endswith('.gz') else open
    with opener(path, 'rb') as source:
        raw = source.read(MAX_EXTRACT_BYTES + 1)
    if len(raw) > MAX_EXTRACT_BYTES:
        raise ValueError('retained Overpass extract exceeds 64 MiB inspection limit')
    sha = hashlib.sha256(raw).hexdigest()
    expected = (manifest or {}).get('uncompressedSha256')
    if not expected or sha != expected:
        return {'status': 'invalid', 'path': ctx.relpath(path), 'sha256': sha,
                'declaredSha256': expected, 'problem': 'OSM_SNAPSHOT_HASH_MISMATCH'}, None
    document = json.loads(raw)
    if not isinstance(document, dict) or not isinstance(document.get('elements'), list):
        raise TypeError('retained Overpass extract has no elements array')
    if any(not isinstance(e, dict) or not isinstance(e.get('tags', {}), dict) for e in document['elements']):
        raise TypeError('retained Overpass extract contains an invalid element or tags object')
    counts = Counter((e.get('tags') or {}).get('golf') for e in document['elements'] if e.get('type') == 'way')
    return {'status': 'verified', 'path': ctx.relpath(path), 'sha256': sha,
            'holeWayCount': counts['hole'], 'greenWayCount': counts['green']}, document


def _course_sites(extract, layout):
    """Expose mapped subcourses for review without choosing one for a layout.

    An enclosing resort polygon can hide named, independently numbered
    courses. Completeness alone never establishes the layout's identity.
    """
    sites = []
    for element in (extract or {}).get('elements', []):
        tags = element.get('tags') or {}
        if element.get('type') != 'way' or tags.get('leisure') != 'golf_course':
            continue
        points = osm.way_points(element)
        if len(points) < 4 or points[0] != points[-1]:
            continue
        site_id = f'osm-way-{element["id"]}'
        routes, evidence = osm.propose_routes(extract, {'polygon': points}, len(layout.get('holeOrder') or []), layout_name=layout.get('name'))
        sites.append({'siteId': site_id, 'name': tags.get('name'), 'catalogSelected': site_id in (layout.get('siteIds') or []),
                      'proposedWayIds': routes, 'evidence': evidence})
    return sites


def _command(ctx, *args):
    return ['python3', 'scripts/golf/course-geometry/course-factory.py',
            '--repo-root', ctx.repo_root, '--catalog', ctx.catalog.root, '--output', ctx.output_root, *args]


def inventory(ctx, layout_id=None, facility_id=None):
    layouts = [layout for key, layout in sorted(ctx.catalog.layouts.items())
               if (layout_id is None or key == layout_id) and (facility_id is None or layout['facilityId'] == facility_id)]
    snapshots, rows = {}, []
    for layout in layouts:
        key, facility = layout['layoutId'], layout['facilityId']
        blockers = []
        card = ctx.scorecard(key)
        count = len(layout.get('holeOrder') or [])
        card_valid = bool(card and supported_hole_count(count) and len(card.get('holes') or []) == count)
        if not card_valid:
            blockers.append('SCORECARD_REQUIRED' if not card else 'SCORECARD_HOLE_MISMATCH')
        try:
            if facility not in snapshots:
                snapshots[facility] = _snapshot(ctx, facility)
            source, extract = snapshots[facility]
            if source['status'] != 'verified':
                blockers.append(source.get('problem', 'OSM_SNAPSHOT_REQUIRED'))
            # Do not present a proposal from bytes whose checksum failed.
            resolution = ctx.route_resolution(key) if extract or ctx.retained(layout, 'sourceGeometry') or ctx.retained(layout, 'routeTraces') else None
            resolution = resolution or {}
            attempts = (resolution.get('evidence') or {}).get('attempts') or []
            candidates = osm.hole_ways(extract) if extract else []
            course_sites = _course_sites(extract, layout)
            # Route-resolved layouts already have a route-specific package
            # path.  Do not spend build/review capacity on anonymous visual
            # candidates for those layouts, and never let their presence
            # compete with canonical route geometry.
            visual_candidates = visual_corridor_candidates(extract, layout) if extract and not resolved_routes(resolution) else {
                'schema': 'golfhelm-visual-route-candidates-v1', 'layoutId': key,
                'sourceFeatureCounts': {'tee': 0, 'green': 0, 'fairway': 0},
                'candidateCount': 0, 'greenOnlyCount': 0, 'candidates': [], 'greenOnlyCandidates': [],
                'renderingContract': {'canRender': False, 'canMeasure': False, 'maySupplyHoleAssociation': False,
                                      'maySupplyTeeIdentity': False, 'maySupplyRouteIdentity': False,
                                      'maySupplyPhysicalGeometry': False,
                                      'rule': ('A canonical route exists; anonymous visual candidates are intentionally not generated.'
                                               if extract else 'No retained source extract is available.')},
            }
            if resolution.get('problem'):
                status = 'invalid_source'
                blockers.append(resolution['problem'])
            elif source['status'] == 'invalid':
                status = 'invalid_source'
            elif resolved_routes(resolution):
                status = 'routes_resolved'
            elif any(attempt.get('duplicateRefs') for attempt in attempts):
                status = 'identity_review_required'
                blockers.append('ROUTE_IDENTITY_AMBIGUOUS')
            elif candidates:
                status = 'route_completion_required'
                blockers.append('NUMBERED_ROUTE_SET_INCOMPLETE')
            else:
                status = 'route_source_required'
                blockers.append('NUMBERED_ROUTE_SOURCE_REQUIRED')
            # Pinned IDs still need matching retained ways; no synthetic IDs or
            # fallback ordinal matching can make an assembly attempt ready.
            if resolved_routes(resolution) and resolution.get('routeWayIds') and extract:
                ways = {e['id']: e for e in extract['elements'] if e.get('type') == 'way'}
                invalid = [way_id for number, way_id in enumerate(resolution['routeWayIds'], 1)
                           if (ways.get(way_id, {}).get('tags') or {}).get('golf') != 'hole'
                           or str((ways.get(way_id, {}).get('tags') or {}).get('ref')) != str(number)
                           or len(ways.get(way_id, {}).get('geometry') or []) < 2]
                if invalid:
                    blockers.append('OSM_ROUTE_ASSEMBLY_CONTRACT_MISMATCH')
        except (OSError, ValueError, TypeError, KeyError, EOFError) as exc:
            source, resolution, candidates, attempts, course_sites, visual_candidates = {'status': 'invalid', 'problem': str(exc)}, {}, [], [], [], {
                'schema': 'golfhelm-visual-route-candidates-v1', 'layoutId': key,
                'sourceFeatureCounts': {'tee': 0, 'green': 0, 'fairway': 0}, 'candidateCount': 0,
                'greenOnlyCount': 0, 'candidates': [], 'greenOnlyCandidates': [],
                'renderingContract': {'canRender': False, 'canMeasure': False, 'maySupplyHoleAssociation': False,
                                      'maySupplyTeeIdentity': False, 'maySupplyRouteIdentity': False,
                                      'maySupplyPhysicalGeometry': False,
                                      'rule': 'Retained source is invalid or unreadable.'},
            }
            status = 'invalid_source'
            blockers.append('ROUTE_SOURCE_UNREADABLE')
        ready = status == 'routes_resolved' and not blockers
        visual_plan = visual_render_plan(ctx, layout, source, visual_candidates, resolved_routes(resolution))
        commands = []
        if source['status'] == 'missing':
            commands.append(_command(ctx, 'run', '--layout', key, '--until', 'facility.osm.snapshot'))
        commands.append(_command(ctx, 'run', '--layout', key, '--task', 'layout.route.dossier'))
        if ready:
            commands.append(_command(ctx, 'run', '--layout', key, '--until', 'layout.candidates.compose'))
        if status == 'identity_review_required':
            action = 'Confirm the complete ordered course against numbered source evidence; retain actual selected OSM way IDs. Duplicate refs are not resolved by par, length or proximity.'
        elif status in ('route_source_required', 'route_completion_required'):
            action = 'Retain numbered georeferenced route and green evidence as sourceGeometry with explicit physical hole keys. No route may be generated from scorecard yardage.'
        elif status == 'invalid_source':
            action = 'Repair or replace the invalid retained source before proposing or assembling geometry.'
        elif blockers:
            action = 'Resolve the listed source/scorecard prerequisites before candidate assembly.'
        else:
            action = 'Run bounded candidate assembly; its green association checks and all physical review gates remain required.'
        rows.append({'layoutId': key, 'facilityId': facility, 'holeOrder': layout.get('holeOrder'),
                     'scorecardProfileId': (card or {}).get('profileId'), 'scorecardValid': card_valid,
                     'source': source, 'routeStatus': status, 'routeSource': resolution.get('source'),
                     'selectedWayIds': resolution.get('routeWayIds'), 'sourceGeometryHash': resolution.get('sourceGeometryHash'),
                     'routeTracesHash': resolution.get('routeTracesHash'),
                     'attempts': attempts, 'osmWayCandidates': candidates, 'osmCourseSites': course_sites,
                     # This object belongs only to the visual compiler/review
                     # queue.  It intentionally cannot alter ``ready`` or
                     # cause a route-specific package to be assembled.
                     'visualRouteCandidates': visual_candidates,
                     # This only compares counts for review capacity. It
                     # neither chooses a subset nor maps a candidate to a
                     # scorecard ordinal/physical hole.
                     'visualCandidateCoverage': {
                         'expectedHoleCount': count,
                         'candidateCountMatchesExpectedHoleCount': visual_candidates['candidateCount'] == count,
                         'greenCountMatchesExpectedHoleCount': visual_candidates['sourceFeatureCounts']['green'] == count,
                     },
                     'visualRenderPlan': visual_plan,
                     'candidateAssemblyReady': ready, 'blockers': blockers, 'nextAction': action, 'commands': commands})
    return {'schema': 'golfhelm-factory-route-recovery-v1', 'workingDirectory': ctx.repo_root,
            'contract': {'retainedSourcesOnly': True, 'maySupplyHoleAssociation': False,
                         'canMeasure': False, 'grantsReviewApproval': False,
                         'readinessMeans': 'route and scorecard prerequisites only; the preparer validates surfaces'},
            'totals': {'layouts': len(rows), 'candidateAssemblyReady': sum(r['candidateAssemblyReady'] for r in rows),
                       'unresolvedRoutes': sum(r['routeStatus'] not in ('routes_resolved', 'invalid_source') for r in rows),
                       'invalidSources': sum(r['routeStatus'] == 'invalid_source' for r in rows),
                       'scorecardsMissingOrInvalid': sum(not r['scorecardValid'] for r in rows),
                       'visualCorridorCandidates': sum(r['visualRouteCandidates']['candidateCount'] for r in rows),
                       'visualGreenOnlyCandidates': sum(r['visualRouteCandidates']['greenOnlyCount'] for r in rows),
                       'layoutsWithVisualCandidates': sum(bool(r['visualRouteCandidates']['renderingContract']['canRender']) for r in rows),
                       'layoutsReadyForVisualCandidateCompile': sum(r['visualRenderPlan']['status'] == 'ready_display_only_compile' for r in rows),
                       'plannedVisualCandidateAssets': sum(len(r['visualRenderPlan']['assets']) for r in rows)},
            'batchCommands': [_command(ctx, 'batch', '--all-layouts', '--until', task)
                              for task in ('layout.route.dossier', 'layout.candidates.compose')], 'layouts': rows}


def render_inventory(report):
    totals = report['totals']
    lines = [(f'route recovery: {totals["layouts"]} layouts; {totals["candidateAssemblyReady"]} ready to attempt vector assembly; '
              f'{totals["unresolvedRoutes"]} unresolved; {totals["invalidSources"]} invalid sources'),
             (f'visual-only route candidates: {totals["visualCorridorCandidates"]} tee-to-green pair candidates; '
              f'{totals["visualGreenOnlyCandidates"]} green-only candidates; '
              f'{totals["plannedVisualCandidateAssets"]} display assets ready to compile'),
             'Retained sources only. Candidate assembly still validates greens; visual candidates grant no hole association, review, or measurement authority.']
    for row in report['layouts']:
        lines.append(f'  {row["layoutId"]}: {row["routeStatus"]}; ' + (', '.join(row['blockers']) or 'assembly prerequisites available'))
        lines.append('    ' + row['nextAction'])
    lines.append('Bounded batches (no implicit terrain or Blender tasks):')
    lines.extend('  ' + shlex.join(command) for command in report['batchCommands'])
    return '\n'.join(lines)
