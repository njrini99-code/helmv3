"""Compile canonical local-metre source geometry into a physical GolfHelm world.

This is deliberately separate from Blender.  It describes metric truth and
what each feature is permitted to claim.  A renderer can improve materials or
instantiate vegetation from it, but cannot promote a footprint-only bunker or
macro-only green into measured micro-geometry.

Usage:
  python3 scripts/golf/course-geometry/compile-physical-world.py \
    normalized.json physical-world.json
"""
import argparse
import hashlib
import json
from pathlib import Path


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n')


RULES = {
    'fairway': {
        'physicalRole': 'terrain_surface_classification',
        'heightModel': 'shared_terrain_field',
        'analytics': ['lie_classification', 'corridor_constraint'],
        'forbiddenClaims': ['independent_micro_elevation', 'historical_ball_coordinate'],
    },
    'tee': {
        'physicalRole': 'terrain_surface_classification',
        'heightModel': 'shared_terrain_field',
        'analytics': ['tee_surface_context'],
        'forbiddenClaims': ['daily_tee_marker_coordinate'],
    },
    'green': {
        'physicalRole': 'terrain_surface_classification',
        'heightModel': 'shared_terrain_field',
        'analytics': ['green_boundary', 'macro_slope_context'],
        'forbiddenClaims': ['putting_break', 'sub_meter_tier', 'daily_pin_coordinate'],
    },
    'bunker': {
        'physicalRole': 'negative_feature_footprint',
        'heightModel': 'shared_terrain_field',
        'analytics': ['bunker_boundary', 'lie_classification'],
        'forbiddenClaims': ['bunker_depth', 'bunker_lip_height', 'bunker_face_slope', 'target_visibility'],
    },
    'water': {
        'physicalRole': 'water_surface_footprint',
        'heightModel': 'shared_terrain_field',
        'analytics': ['hazard_boundary'],
        'forbiddenClaims': ['water_level_without_source'],
    },
}

TRUTH_CLASSES = {'measured', 'derived', 'estimated', 'visual_only'}


def truth_class(feature):
    """Classify only from declared evidence; never promote an unknown input."""
    provenance = feature.get('provenance', {})
    declared = feature.get('truthClass', provenance.get('truthClass'))
    if declared in TRUTH_CLASSES:
        return declared
    extraction = str(provenance.get('extraction', '')).lower()
    source_ids = provenance.get('sourceIds', [])
    if any(str(source).startswith(('osm', 'usgs')) for source in source_ids):
        # An OSM/USGS vector remains externally derived geometry. The phrase
        # "not imagery-derived" only says that it was not segmented from the
        # current orthophoto; it does not erase its vector source. An imagery
        # provider name by itself is never sufficient: it needs an explicit
        # extraction record or declared truth class.
        return 'derived'
    if 'not imagery-derived' in extraction or 'scorecard' in extraction:
        return 'estimated'
    # Legacy geometry with no declared provenance remains renderable context,
    # but it cannot silently acquire analytical authority during compilation.
    return 'visual_only'


def rendering_contract(kind, truth, provenance):
    rule = RULES[kind]
    return {
        'renderable': True,
        # Source class alone is insufficient. A candidate must also have a
        # recorded boundary uncertainty and explicit review before it can be
        # used as an authoritative analytical measurement.
        'measurementAuthority': truth in {'measured', 'derived'} and bool(provenance.get('humanReviewed')) and provenance.get('boundaryAccuracyMeters') is not None,
        'mayUseVisualInterpolation': True,
        'mayUseVisualOnlyGeometry': truth in {'estimated', 'visual_only'},
        'visualOnlyExamples': (
            ['procedural_bunker_bowl', 'sand_material', 'lip_grass'] if kind == 'bunker' else
            ['smooth_visual_mesh', 'grass_material'] if kind == 'green' else
            ['surface_material', 'transition_treatment']
        ),
        'physicalClaimsRemainBoundedBy': rule['forbiddenClaims'],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('canonical_study', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    source = json.loads(args.canonical_study.read_text())
    if source.get('kind') != 'golfhelm-canonical-local-meter-study':
        raise ValueError('Physical world input must be canonical local-metre geometry')
    if not source.get('coordinateSystem', {}).get('oneWorldUnitEqualsMeters'):
        raise ValueError('Physical world requires one world unit to equal one metre')
    features = []
    unsupported = []
    for feature in source.get('features', []):
        kind = feature.get('kind')
        rule = RULES.get(kind)
        if rule is None:
            unsupported.append({'featureId': feature.get('id'), 'kind': kind, 'reason': 'No physical-world rule exists for this source class'})
            continue
        provenance = feature.get('provenance', {})
        feature_truth = truth_class(feature)
        features.append({
            'id': feature['id'],
            'kind': kind,
            'geometryMeters': feature['geometryMeters'],
            'sourceGeometryWgs84': feature.get('sourceGeometryWgs84'),
            'provenance': provenance,
            'truthClass': feature_truth,
            'physical': rule,
            'confidence': {
                'boundary': provenance.get('boundaryAccuracyMeters'),
                'height': 'shared_macro_terrain_only',
                'status': 'source_candidate' if not provenance.get('humanReviewed') else 'reviewed_source_candidate',
            },
            'rendering': rendering_contract(kind, feature_truth, provenance),
        })
    world = {
        'schemaVersion': 1,
        'kind': 'golfhelm-physical-world-v1',
        'sourceCanonicalHash': source['contentHash'],
        'siteId': source['siteId'],
        'physicalStudyKey': source['physicalStudyKey'],
        'status': source['status'],
        'coordinateSystem': source['coordinateSystem'],
        'terrainField': {
            'grid': source['terrain']['grid'],
            'source': source['terrain']['source'],
            'physicalRole': 'bare_earth_macro_terrain',
            'truthClass': source.get('terrain', {}).get('truthClass', 'derived'),
        },
        'semanticSurfaces': features,
        'unsupportedFeatures': unsupported,
        'visualWorldContract': {
            'mayAdd': ['materials', 'grass_height_visual_only', 'roughness', 'mowing_patterns', 'tree_assets', 'lighting', 'atmosphere', 'lod'],
            'mustNotChange': ['coordinateSystem', 'terrainField', 'semanticSurfaces.geometryMeters', 'observed_shot_coordinates'],
            'mustNotInvent': ['bunker_depth', 'bunker_lip_height', 'green_micro_slope', 'daily_pin', 'historical_ball_position'],
        },
        'limitations': [
            *source.get('limitations', []),
            'Bunker footprints are not physical cavities until a source-backed bunker floor/rim surface is supplied.',
            'Green surfaces inherit macro terrain only; they are not a measured putting surface.',
        ],
        'sources': source.get('sources', {}),
    }
    world['contentHash'] = hashlib.sha256(canonical(world).encode()).hexdigest()
    write_json(args.output, world)
    print(canonical({'contentHash': world['contentHash'], 'surfaceCount': len(features), 'unsupportedFeatures': len(unsupported), 'worldUnitMeters': 1}))


if __name__ == '__main__':
    main()
