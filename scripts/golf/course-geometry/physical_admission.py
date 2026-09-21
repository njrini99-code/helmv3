"""Evidence-scoped physical admission; rendering never grants measurement rights.

A review sidecar is human-produced evidence, not a compiler approval switch.
Its package, source revision, hole, reviewed area and independent checkpoints
must match the current study. Numeric thresholds are engineering policy, not
survey guarantees. Empty feature collections always remain unknown without
an explicit, current absence review.
"""
import hashlib
import json
import math
from datetime import date, datetime, timezone
from pathlib import Path

from pyproj import Geod
from shapely.errors import GEOSException
from shapely.geometry import MultiPoint, shape
from shapely.ops import unary_union

CORE_FEATURES = ('tee', 'fairway', 'green', 'bunker', 'water')
REVIEW_KIND = 'golfhelm-physical-admission-review-v1'
POLICY_VERSION = 'physical-admission-v1'
HORIZONTAL_P95_LIMIT_M = 2.0
VERTICAL_P95_LIMIT_M = 0.5
MIN_CHECKPOINTS = 3


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def positive(value, allow_zero=False):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and (value >= 0 if allow_zero else value > 0)


def source_revision(study):
    return digest(study.get('sources', {}))


def load_review(path):
    if not path:
        return None
    try:
        return json.loads(Path(path).read_text())
    except (OSError, UnicodeError, ValueError):
        # A malformed review never grants authority and must not prevent a
        # renderable candidate world from being inspected and repaired.
        return {'kind': 'unreadable-physical-review', 'holes': {}}


def review_input(sidecar, hole_key):
    if not isinstance(sidecar, dict):
        return None
    holes = sidecar.get('holes')
    return {'kind': sidecar.get('kind'), 'packageHash': sidecar.get('packageHash'),
            'hole': holes.get(hole_key) if isinstance(holes, dict) else None}


def review_input_hash(sidecar, hole_key):
    selected = review_input(sidecar, hole_key)
    return digest(selected) if selected else None


def has_review(item):
    if not isinstance(item, dict) or item.get('status') != 'approved':
        return False
    try:
        reviewed_date = date.fromisoformat(item.get('reviewedAt', ''))
    except (TypeError, ValueError):
        return False
    return (reviewed_date <= datetime.now(timezone.utc).date() and isinstance(item.get('reviewer'), str) and bool(item['reviewer'].strip())
            and isinstance(item.get('evidenceHash'), str) and len(item['evidenceHash']) == 64
            and all(ch in '0123456789abcdef' for ch in item['evidenceHash']))


def decision(dependencies, evidence_hashes=()):
    return {'allowed': all(not reasons for reasons in dependencies.values()),
            'dependencies': sorted(dependencies),
            'reasons': sorted({reason for reasons in dependencies.values() for reason in reasons}),
            'evidenceHashes': sorted({item for item in evidence_hashes if item})}


def review_scope(study):
    entry = study.get('admissionReview')
    errors = []
    if not isinstance(entry, dict) or entry.get('kind') != REVIEW_KIND:
        return {}, ['REVIEW_INPUT_UNREADABLE' if isinstance(entry, dict) and entry.get('kind') == 'unreadable-physical-review' else 'PHYSICAL_REVIEW_REQUIRED']
    if entry.get('packageHash') != study.get('packageHash') or not study.get('packageHash'):
        errors.append('REVIEW_PACKAGE_MISMATCH')
    hole = entry.get('hole')
    if not isinstance(hole, dict):
        return {}, [*errors, 'HOLE_REVIEW_REQUIRED']
    if hole.get('holeKey') != study.get('physicalStudyKey'):
        errors.append('REVIEW_HOLE_MISMATCH')
    if hole.get('sourceRevisionHash') != source_revision(study):
        errors.append('REVIEW_SOURCE_REVISION_MISMATCH')
    if not has_review(hole.get('review')):
        errors.append('DATED_HUMAN_REVIEW_REQUIRED')
    area = hole.get('reviewedArea', {})
    try:
        raw = area['geometryWgs84']
        geometry = shape(raw)
        if (raw.get('type') not in ('Polygon', 'MultiPolygon') or geometry.is_empty or not geometry.is_valid
                or geometry.area <= 0 or area.get('sha256') != digest(raw)):
            raise ValueError('invalid review area')
        min_x, min_y, max_x, max_y = geometry.bounds
        if not (-180 <= min_x <= max_x <= 180 and -90 <= min_y <= max_y <= 90):
            raise ValueError('not WGS84 longitude/latitude')
        required = [feature for feature in study.get('features', []) if feature.get('kind') in (*CORE_FEATURES, 'route')]
        if not required or any(not geometry.covers(shape(feature['sourceGeometryWgs84'])) for feature in required):
            errors.append('REVIEW_AREA_DOES_NOT_COVER_HOLE')
    except (KeyError, TypeError, ValueError, AttributeError, GEOSException):
        errors.append('REVIEW_AREA_INVALID')
    return hole, sorted(set(errors))


def reviewed_feature(study, feature):
    """Apply an explicit source-bound feature review without moving any vertex.

    Provider names and a package review checkbox cannot establish whether a
    general imported trace was measured, derived, estimated, or decorative.
    This evidence names the exact retained geometry and source IDs instead.
    """
    hole, scope_errors = review_scope(study)
    entries = hole.get('featureEvidence', {})
    item = entries.get(feature.get('id')) if isinstance(entries, dict) else None
    if not isinstance(item, dict):
        return feature
    provenance = feature.get('provenance', {})
    source_ids = provenance.get('sourceIds', feature.get('sourceIds', []))
    valid = (not scope_errors and has_review(item.get('review'))
             and item.get('geometryHash') == digest(feature.get('sourceGeometryWgs84'))
             and source_ids and item.get('sourceIds') == source_ids
             and item.get('truthClass') in ('measured', 'derived', 'estimated', 'visual_only')
             and positive(item.get('boundaryAccuracyMeters')) and bool(item.get('method')))
    if not valid:
        return {**feature, 'provenance': {**provenance, 'humanReviewed': False}}
    return {**feature, 'truthClass': item['truthClass'],
            'provenance': {**provenance, 'humanReviewed': True, 'sourceIds': source_ids,
                           'boundaryAccuracyMeters': item['boundaryAccuracyMeters'], 'extraction': item['method'],
                           'featureReviewEvidenceHash': item['review']['evidenceHash']}}


def availability(study, kind, features):
    """Absence proves completeness of an area, never a fabricated measurement."""
    hole, scope_errors = review_scope(study)
    declarations = hole.get('featureAvailability', {})
    declaration = declarations.get(kind, {}) if isinstance(declarations, dict) else {}
    if not isinstance(declaration, dict):
        declaration = {}
    if features:
        conflicts = ['FEATURE_ABSENCE_CONFLICT'] if declaration.get('state') == 'confirmed_absent' else []
        if declaration.get('state') == 'unknown':
            conflicts.append('FEATURE_AVAILABILITY_UNKNOWN')
        elif declaration and declaration.get('state') not in ('present', 'confirmed_absent'):
            conflicts.append('FEATURE_AVAILABILITY_INVALID')
        supplied_ids = declaration.get('featureIds')
        if declaration.get('state') == 'present' and (not isinstance(supplied_ids, list) or not all(isinstance(value, str) for value in supplied_ids)
                or sorted(supplied_ids) != sorted(f['id'] for f in features)):
            conflicts.append('FEATURE_MEMBERSHIP_MISMATCH')
        return {'state': 'present' if not conflicts else 'unknown', 'featureIds': [f['id'] for f in features], 'confirmed': not conflicts, 'reasons': conflicts}
    errors = list(scope_errors)
    if declaration.get('state') != 'confirmed_absent':
        errors.append('FEATURE_AVAILABILITY_UNKNOWN')
    else:
        if kind not in ('bunker', 'water') and not (kind == 'fairway' and study.get('par') == 3):
            errors.append('CORE_FEATURE_ABSENCE_NOT_PERMITTED')
        if not has_review(declaration.get('review')):
            errors.append('ABSENCE_REVIEW_REQUIRED')
        reviewed_area = hole.get('reviewedArea') if isinstance(hole.get('reviewedArea'), dict) else {}
        if declaration.get('reviewedAreaHash') != reviewed_area.get('sha256'):
            errors.append('ABSENCE_AREA_MISMATCH')
        if declaration.get('sourceRevisionHash') != source_revision(study):
            errors.append('ABSENCE_SOURCE_REVISION_MISMATCH')
    return {'state': 'confirmed_absent' if not errors else 'unknown', 'featureIds': [], 'confirmed': not errors,
            'reasons': sorted(set(errors)), 'evidenceHash': declaration.get('review', {}).get('evidenceHash') if not errors else None}


def geographic_coordinate(value):
    return (isinstance(value, list) and len(value) == 2
            and all(isinstance(v, (float, int)) and not isinstance(v, bool) and math.isfinite(v) for v in value)
            and -180 <= value[0] <= 180 and -90 <= value[1] <= 90)


def checkpoint_errors(block, limit, prefix, dimensions, reviewed_area=None, required_features=()):
    errors = []
    if not isinstance(block, dict) or not has_review(block.get('review')):
        return [f'{prefix}_REVIEW_REQUIRED']
    checkpoints = block.get('checkpoints')
    if not isinstance(checkpoints, list) or len(checkpoints) < MIN_CHECKPOINTS:
        return [f'{prefix}_INDEPENDENT_CHECKPOINTS_REQUIRED']
    identifiers, points, residuals = set(), set(), []
    for point in checkpoints:
        if not isinstance(point, dict):
            errors.append(f'{prefix}_CHECKPOINT_INVALID')
            continue
        key = point.get('id')
        xy = point.get('coordinateWgs84')
        observed = point.get('observedCoordinateWgs84')
        if (not isinstance(key, str) or not key or key in identifiers or point.get('usedForFit') is not False
                or point.get('independentReference') is not True or not geographic_coordinate(xy)
                or not geographic_coordinate(observed) or not point.get('referenceSource')):
            errors.append(f'{prefix}_CHECKPOINT_INVALID')
            continue
        identifiers.add(key)
        points.add(tuple(xy))
        azimuth, _back_azimuth, separation = Geod(ellps='WGS84').inv(*xy, *observed)
        values = [math.sin(math.radians(azimuth)) * separation, math.cos(math.radians(azimuth)) * separation]
        supplied = [point.get(dimension) for dimension in dimensions]
        if any(not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value)
               or abs(value - actual) > .01 for value, actual in zip(supplied, values)):
            errors.append(f'{prefix}_RESIDUAL_DOES_NOT_MATCH_COORDINATES')
            continue
        accuracy = point.get('referenceAccuracy95Meters')
        if not positive(accuracy) or accuracy > limit:
            errors.append(f'{prefix}_REFERENCE_ACCURACY_UNSUPPORTED')
            continue
        residuals.append(math.sqrt(sum(value * value for value in values)) + accuracy)
    if len(points) < MIN_CHECKPOINTS or len(residuals) < MIN_CHECKPOINTS:
        errors.append(f'{prefix}_INDEPENDENT_CHECKPOINTS_REQUIRED')
    try:
        area = shape(reviewed_area['geometryWgs84'])
        controls = MultiPoint(list(points))
        coverage = controls.convex_hull
        required = [shape(feature['sourceGeometryWgs84']) for feature in required_features
                    if feature.get('kind') in (*CORE_FEATURES, 'route')]
        if not area.covers(controls):
            errors.append(f'{prefix}_CHECKPOINTS_OUTSIDE_REVIEW_AREA')
        # These are topological inclusion tests, not degree-based distances.
        # Non-collinear controls must enclose the actual played-hole surfaces;
        # a reviewer Boolean cannot turn another course's points into controls.
        if coverage.geom_type != 'Polygon' or not required or not coverage.covers(unary_union(required)):
            errors.append(f'{prefix}_CHECKPOINTS_DO_NOT_SPAN_HOLE')
    except (KeyError, TypeError, ValueError, GEOSException):
        errors.append(f'{prefix}_REVIEW_AREA_REQUIRED')
    # No average can hide a bad critical control. This deliberately uses a
    # conservative worst checked discrepancy including reference uncertainty.
    if residuals and max(residuals) > limit:
        errors.append(f'{prefix}_ERROR_BUDGET_EXCEEDED')
    if block.get('distributedCoverageReviewed') is not True:
        errors.append(f'{prefix}_CHECKPOINT_DISTRIBUTION_UNREVIEWED')
    return sorted(set(errors))


def registration_bound(block, errors):
    if errors:
        return None
    checkpoints = block['checkpoints']
    return max(Geod(ellps='WGS84').inv(*point['coordinateWgs84'], *point['observedCoordinateWgs84'])[2]
               + point['referenceAccuracy95Meters'] for point in checkpoints)


def capabilities(study, rows):
    hole, scope = review_scope(study)
    row_map = {item['feature']: item for item in rows}
    feature_dependencies = {
        kind: [] if row_map.get(kind, {}).get('completenessPassed') is True else [f'{kind.upper()}_PHYSICAL_EVIDENCE_REQUIRED']
        for kind in CORE_FEATURES}
    boundary_dependencies = {
        kind: [] if row_map.get(kind, {}).get('canMeasure') is True else [f'{kind.upper()}_BOUNDARY_UNAVAILABLE']
        for kind in CORE_FEATURES}
    distance = [] if row_map.get('hole-distance geometry', {}).get('canMeasure') is True else ['HOLE_DISTANCE_GEOMETRY_REQUIRED']
    identity = hole.get('identity', {})
    if not isinstance(identity, dict):
        identity = {}
    identity_errors = [] if has_review(identity.get('review')) and identity.get('physicalHoleKey') == study.get('physicalStudyKey') else ['ROUTE_IDENTITY_UNCONFIRMED']
    registration = checkpoint_errors(hole.get('registration'), HORIZONTAL_P95_LIMIT_M, 'REGISTRATION', ('eastResidualMeters', 'northResidualMeters'), hole.get('reviewedArea'), study.get('features', []))
    registration_error = registration_bound(hole.get('registration'), registration)
    uncertainty = {}
    for kind in CORE_FEATURES:
        feature_values = [feature.get('provenance', {}).get('boundaryAccuracyMeters')
                          for feature in study.get('features', []) if feature.get('kind') == kind]
        boundary_error = max(feature_values) if feature_values and all(positive(value) for value in feature_values) else None
        total_error = boundary_error + registration_error if boundary_error is not None and registration_error is not None else None
        uncertainty[kind] = {'registrationUpperBoundMeters': registration_error, 'boundaryUpperBoundMeters': boundary_error,
                             'geometryUpperBoundMeters': total_error, 'maximumGeometryUpperBoundMeters': HORIZONTAL_P95_LIMIT_M,
                             'semantics': 'Conservative sum of worst independently checked registration residual plus reference uncertainty and declared boundary uncertainty; excludes device/GNSS uncertainty.'}
        if feature_values and (total_error is None or total_error > HORIZONTAL_P95_LIMIT_M):
            reason = f'{kind.upper()}_GEOMETRY_UNCERTAINTY_EXCEEDS_BUDGET' if total_error is not None else f'{kind.upper()}_GEOMETRY_UNCERTAINTY_UNKNOWN'
            feature_dependencies[kind] = [*feature_dependencies[kind], reason]
            boundary_dependencies[kind] = [*boundary_dependencies[kind], reason]
    source = study.get('terrain', {}).get('source', {})
    terrain = study.get('sources', {}).get('terrain', {})
    vertical = hole.get('vertical', {})
    if not isinstance(vertical, dict):
        vertical = {}
    vertical_errors = []
    if (source.get('renderingOnly') or study.get('terrain', {}).get('truthClass') in ('estimated', 'visual_only')
            or not terrain.get('verticalDatum') or not positive(terrain.get('verticalUnitToMeters'))
            or 'unknown' in str(terrain.get('verticalDatum')).lower()):
        vertical_errors.append('VERTICAL_SOURCE_AUTHORITY_REQUIRED')
    if (not has_review(vertical.get('review')) or vertical.get('rasterSha256') != source.get('rasterSha256')
            or vertical.get('datum') != terrain.get('verticalDatum') or vertical.get('unitToMeters') != terrain.get('verticalUnitToMeters')):
        vertical_errors.append('VERTICAL_UNIT_DATUM_REVIEW_REQUIRED')
    if vertical.get('featureCoverage') != 'complete_no_nodata':
        vertical_errors.append('FEATURE_TERRAIN_COVERAGE_REQUIRED')
    if not positive(vertical.get('verticalAccuracy95Meters')) or vertical.get('verticalAccuracy95Meters', math.inf) > VERTICAL_P95_LIMIT_M:
        vertical_errors.append('VERTICAL_ACCURACY_UNSUPPORTED')
    if not positive(source.get('sourceNativeResolutionMeters', source.get('nativeResolutionMeters'))) or source.get('sourceNativeResolutionMeters', source.get('nativeResolutionMeters', math.inf)) > 2:
        vertical_errors.append('MACRO_TERRAIN_RESOLUTION_UNSUPPORTED')
    shared = {'reviewScope': scope, 'identity': identity_errors, 'registration': registration}
    hashes = [source_revision(study), digest(study.get('admissionReview'))] if study.get('admissionReview') else [source_revision(study)]
    result = {
        'renderHole': decision({}, hashes),
        'associateRoundHole': decision({'reviewScope': scope, 'identity': identity_errors}, hashes),
        'measureGreenDistance': decision({**shared, 'greenBoundary': boundary_dependencies['green']}, hashes),
        'suggestLie': decision({**shared, **feature_dependencies}, hashes),
        'resolveShotAgainstSurface': decision({**shared, **feature_dependencies}, hashes),
        'measureElevationDelta': decision({**shared, 'vertical': vertical_errors}, hashes),
        'inferNextHole': decision({**shared, 'teeBoundary': boundary_dependencies['tee'], 'greenBoundary': boundary_dependencies['green'], 'route': distance}, hashes),
        'highlightSelectedTee': decision({'teeProfileMapping': ['TEE_PROFILE_BINDING_REQUIRED']}, hashes),
        'puttingBreak': decision({'microSurface': ['PUTTING_GRADE_SURFACE_UNSUPPORTED']}, hashes),
        'bunkerDepth': decision({'bunkerSurface': ['BUNKER_FLOOR_RIM_SURFACE_UNSUPPORTED']}, hashes),
    }
    result['measureGreenDistance']['uncertainty'] = uncertainty['green']
    for name in ('suggestLie', 'resolveShotAgainstSurface'):
        result[name]['uncertaintyByFeature'] = uncertainty
    for kind in CORE_FEATURES:
        result[f'measureBoundary:{kind}'] = {**decision({**shared, 'boundary': boundary_dependencies[kind]}, hashes), 'uncertainty': uncertainty[kind]}
    complete = decision({**shared, **feature_dependencies, 'holeDistance': distance}, hashes)
    field_errors = checkpoint_errors(hole.get('fieldValidation'), HORIZONTAL_P95_LIMIT_M, 'FIELD', ('eastResidualMeters', 'northResidualMeters'), hole.get('reviewedArea'), study.get('features', []))
    field = hole.get('fieldValidation', {})
    if not isinstance(field, dict) or field.get('method') != 'independent_geodetic_checkpoints':
        field_errors.append('FIELD_OBSERVATION_METHOD_REQUIRED')
    field_verified = decision({'physicalCompleteness': complete['reasons'], 'field': field_errors}, hashes)
    payload = {'policyVersion': POLICY_VERSION, 'holeKey': study.get('physicalStudyKey'), 'packageHash': study.get('packageHash'),
               'sourceRevisionHash': source_revision(study), 'scope': {'crs': 'EPSG:4326', 'reviewedArea': hole.get('reviewedArea'),
               'rule': 'Capabilities apply only inside this reviewed area; absence is not a claim about the rest of the facility.'},
               'capabilities': result, 'physicalCompleteness': complete,
               'fieldVerification': field_verified}
    payload['admissionVersion'] = digest(payload)
    return payload
