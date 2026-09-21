"""Synthetic evidence tests. These fixtures approve no real course or hole."""
import copy
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from physical_admission import REVIEW_KIND, digest, review_input, source_revision
from pyproj import Geod

SPEC = importlib.util.spec_from_file_location('admission_truth_gate', Path(__file__).with_name('course-truth-gate.py'))
GATE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GATE)


def review():
    return {'status': 'approved', 'reviewer': 'synthetic-fixture-only', 'reviewedAt': '2026-01-01', 'evidenceHash': 'f' * 64}


def polygon(x, y, delta=.00002):
    return {'type': 'Polygon', 'coordinates': [[[x - delta, y - delta], [x + delta, y - delta],
                                               [x + delta, y + delta], [x - delta, y + delta], [x - delta, y - delta]]]}


def controls():
    return {'review': review(), 'distributedCoverageReviewed': True, 'checkpoints': [
        {'id': f'cp-{i}', 'coordinateWgs84': [-80 + x, 35 + y], 'usedForFit': False, 'independentReference': True,
         'observedCoordinateWgs84': list(Geod(ellps='WGS84').fwd(-80 + x, 35 + y, 0, .15)[:2]),
         'eastResidualMeters': 0, 'northResidualMeters': .15, 'referenceAccuracy95Meters': .2, 'referenceSource': 'synthetic independent survey'}
        for i, (x, y) in enumerate([(-.002, -.002), (.002, 0), (0, .002)])]}


def study_fixture():
    """An entirely synthetic 3-par fixture with independently reviewed absence."""
    features = []
    for kind, geometry in [('tee', polygon(-80, 35)), ('green', polygon(-80, 35.001)),
                           ('route', {'type': 'LineString', 'coordinates': [[-80, 35], [-80, 35.001]]})]:
        features.append({'id': kind, 'kind': kind, 'truthClass': 'derived', 'sourceGeometryWgs84': geometry,
                         'geometryMeters': {'type': geometry['type'], 'coordinates': []},
                         'provenance': {'sourceIds': ['synthetic-only'], 'humanReviewed': True, 'boundaryAccuracyMeters': .3}})
    study = {'kind': 'golfhelm-canonical-local-meter-study', 'physicalStudyKey': 'test-01', 'packageHash': 'a' * 64,
             'par': 3, 'scorecardYards': 121, 'siteId': 'test', 'status': 'reviewed_draft', 'features': features,
             'coordinateSystem': {'units': 'meters', 'oneWorldUnitEqualsMeters': True},
             'terrain': {'truthClass': 'derived', 'grid': {'width': 2, 'height': 2, 'positionsMeters': []},
                         'source': {'rasterSha256': 'd' * 64, 'nativeResolutionMeters': 1}},
             'sources': {'geometry': ['synthetic-only'], 'terrain': {'verticalDatum': 'NAVD88', 'verticalUnitToMeters': 1}}}
    area = polygon(-80, 35, .003)
    hole = {'holeKey': 'test-01', 'sourceRevisionHash': source_revision(study), 'review': review(),
            'reviewedArea': {'geometryWgs84': area, 'sha256': digest(area)},
            'identity': {'physicalHoleKey': 'test-01', 'review': review()}, 'registration': controls(),
            'vertical': {'review': review(), 'rasterSha256': 'd' * 64, 'datum': 'NAVD88', 'unitToMeters': 1,
                         'featureCoverage': 'complete_no_nodata', 'verticalAccuracy95Meters': .2},
            'holeDistanceGeometry': {'truthClass': 'derived', 'humanReviewed': True, 'routeLengthMeters': Geod(ellps='WGS84').inv(-80, 35, -80, 35.001)[2],
                                     'scorecardYards': 121, 'routeFeatureId': 'route', 'teeFeatureId': 'tee', 'greenFeatureId': 'green'},
            'featureAvailability': {kind: {'state': 'confirmed_absent', 'review': review(),
                                           'reviewedAreaHash': digest(area), 'sourceRevisionHash': source_revision(study)}
                                    for kind in ('fairway', 'bunker', 'water')}}
    study['admissionReview'] = review_input({'kind': REVIEW_KIND, 'packageHash': 'a' * 64, 'holes': {'test-01': hole}}, 'test-01')
    study['contentHash'] = digest(study)
    return study


def admit(study):
    return GATE.hole_report(study['physicalStudyKey'], study['features'], study)


class PhysicalAdmissionTest(unittest.TestCase):
    def test_empty_osm_is_unknown_but_reviewed_absence_passes_completeness(self):
        study = study_fixture()
        report = admit(study)
        self.assertTrue(report['passed'])
        water = next(row for row in report['features'] if row['feature'] == 'water')
        self.assertEqual(water['availability']['state'], 'confirmed_absent')
        self.assertTrue(water['completenessPassed'])
        self.assertFalse(water['canMeasure'])
        del study['admissionReview']['hole']['featureAvailability']['water']
        report = admit(study)
        self.assertFalse(report['passed'])
        self.assertEqual(next(row for row in report['features'] if row['feature'] == 'water')['availability']['state'], 'unknown')
        self.assertTrue(report['admission']['capabilities']['measureGreenDistance']['allowed'])
        self.assertFalse(report['admission']['capabilities']['suggestLie']['allowed'])

    def test_absence_rejects_stale_source_package_wrong_hole_or_small_area(self):
        for mutation in ('source', 'package', 'hole', 'area', 'absence_area', 'absence_source'):
            with self.subTest(mutation=mutation):
                study = study_fixture()
                entry = study['admissionReview']
                if mutation == 'source':
                    study['sources']['geometry'] = ['changed']
                elif mutation == 'package':
                    study['packageHash'] = 'b' * 64
                elif mutation == 'hole':
                    entry['hole']['holeKey'] = 'test-02'
                elif mutation == 'area':
                    area = polygon(-80, 35)
                    entry['hole']['reviewedArea'] = {'geometryWgs84': area, 'sha256': digest(area)}
                else:
                    key = 'reviewedAreaHash' if mutation == 'absence_area' else 'sourceRevisionHash'
                    entry['hole']['featureAvailability']['water'][key] = 'b' * 64
                self.assertFalse(admit(study)['passed'])

    def test_tee_green_cannot_be_absent_fairway_absence_requires_par_three(self):
        for kind in ('tee', 'green', 'fairway'):
            study = study_fixture()
            study['features'] = [f for f in study['features'] if f['kind'] != kind]
            study['admissionReview']['hole']['featureAvailability'][kind] = copy.deepcopy(study['admissionReview']['hole']['featureAvailability']['water'])
            if kind == 'fairway':
                study['par'] = 4
            self.assertFalse(admit(study)['passed'])

    def test_declared_absence_conflicts_with_current_feature(self):
        study = study_fixture()
        water = copy.deepcopy(study['features'][1])
        water.update({'id': 'water', 'kind': 'water'})
        study['features'].append(water)
        result = admit(study)
        self.assertFalse(result['passed'])
        self.assertIn('FEATURE_ABSENCE_CONFLICT', next(r for r in result['features'] if r['feature'] == 'water')['validation'])

    def test_registration_needs_independent_distributed_bounded_checkpoints(self):
        for mutation in ('fit', 'count', 'error', 'distribution'):
            study = study_fixture()
            registration = study['admissionReview']['hole']['registration']
            if mutation == 'fit':
                registration['checkpoints'][0]['usedForFit'] = True
            elif mutation == 'count':
                registration['checkpoints'] = registration['checkpoints'][:2]
            elif mutation == 'error':
                registration['checkpoints'][0]['eastResidualMeters'] = 3
            else:
                registration['distributedCoverageReviewed'] = False
            result = admit(study)['admission']
            self.assertFalse(result['capabilities']['measureGreenDistance']['allowed'])
            self.assertTrue(result['capabilities']['renderHole']['allowed'])

    def test_unknown_vertical_datum_denies_elevation_only(self):
        study = study_fixture()
        study['sources']['terrain']['verticalDatum'] = None
        # Review the changed source, but do not manufacture its missing datum.
        study['admissionReview']['hole']['sourceRevisionHash'] = source_revision(study)
        result = admit(study)['admission']
        self.assertTrue(result['capabilities']['measureGreenDistance']['allowed'])
        self.assertFalse(result['capabilities']['measureElevationDelta']['allowed'])
        self.assertIn('VERTICAL_SOURCE_AUTHORITY_REQUIRED', result['capabilities']['measureElevationDelta']['reasons'])

    def test_nodata_or_render_only_terrain_cannot_authorize_heights(self):
        for flag in ('nodata', 'renderingOnly'):
            study = study_fixture()
            if flag == 'nodata':
                study['admissionReview']['hole']['vertical']['featureCoverage'] = 'has_nodata'
            else:
                study['terrain']['source']['renderingOnly'] = True
            self.assertFalse(admit(study)['admission']['capabilities']['measureElevationDelta']['allowed'])

    def test_field_tier_requires_actual_independent_observations(self):
        study = study_fixture()
        self.assertFalse(admit(study)['admission']['fieldVerification']['allowed'])
        study['admissionReview']['hole']['fieldValidation'] = {**controls(), 'method': 'independent_geodetic_checkpoints'}
        self.assertTrue(admit(study)['admission']['fieldVerification']['allowed'])
        study['admissionReview']['hole']['fieldValidation']['checkpoints'][0]['usedForFit'] = True
        self.assertFalse(admit(study)['admission']['fieldVerification']['allowed'])

    def test_route_length_cannot_be_declared_or_stretched_to_scorecard(self):
        study = study_fixture()
        study['admissionReview']['hole']['holeDistanceGeometry']['routeLengthMeters'] += 2
        self.assertFalse(admit(study)['passed'])
        study = study_fixture()
        study['admissionReview']['hole']['holeDistanceGeometry']['scorecardYards'] = 130
        self.assertFalse(admit(study)['passed'])

    def test_source_bound_feature_review_can_admit_general_import_without_rewriting_geometry(self):
        study = study_fixture()
        green = study['features'][1]
        original_geometry = copy.deepcopy(green['sourceGeometryWgs84'])
        green.pop('truthClass')
        green['provenance']['humanReviewed'] = False
        self.assertFalse(admit(study)['admission']['capabilities']['measureGreenDistance']['allowed'])
        evidence = {'truthClass': 'derived', 'review': review(), 'sourceIds': ['synthetic-only'],
                    'geometryHash': digest(original_geometry), 'boundaryAccuracyMeters': .3,
                    'method': 'Human-reviewed trace over independently registered synthetic fixture raster'}
        study['admissionReview']['hole']['featureEvidence'] = {'green': evidence}
        result = admit(study)
        self.assertTrue(result['admission']['capabilities']['measureGreenDistance']['allowed'])
        self.assertEqual(study['features'][1]['sourceGeometryWgs84'], original_geometry)
        evidence['geometryHash'] = 'b' * 64
        self.assertFalse(admit(study)['admission']['capabilities']['measureGreenDistance']['allowed'])

    def test_field_residuals_are_computed_from_retained_coordinates(self):
        study = study_fixture()
        study['admissionReview']['hole']['fieldValidation'] = {**controls(), 'method': 'independent_geodetic_checkpoints'}
        study['admissionReview']['hole']['fieldValidation']['checkpoints'][0]['observedCoordinateWgs84'] = [-81, 36]
        result = admit(study)['admission']['fieldVerification']
        self.assertFalse(result['allowed'])
        self.assertIn('FIELD_RESIDUAL_DOES_NOT_MATCH_COORDINATES', result['reasons'])

    def test_malformed_optional_review_does_not_stop_rendering(self):
        for field in ('identity', 'vertical', 'registration'):
            study = study_fixture()
            study['admissionReview']['hole'][field] = None
            result = admit(study)
            self.assertTrue(result['admission']['capabilities']['renderHole']['allowed'])
        study = study_fixture()
        study['admissionReview']['hole']['featureAvailability']['water'] = None
        self.assertFalse(admit(study)['passed'])

    def test_pending_review_generator_retains_geometry_and_never_approves_absence(self):
        study = study_fixture()
        package = {'siteId': study['siteId'], 'contentHash': study['packageHash'],
                   'holes': [{'key': 'test-01', 'featureIds': [f['id'] for f in study['features']],
                              'routeFeatureId': 'route', 'greenFeatureId': 'green', 'scorecardYards': 121}],
                   'features': [{'id': f['id'], 'geometryWgs84': f['sourceGeometryWgs84']} for f in study['features']]}
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / 'world' / 'holes' / 'test-01').mkdir(parents=True)
            (directory / 'world' / 'holes' / 'test-01' / 'study.json').write_text(json.dumps(study))
            (directory / 'package.json').write_text(json.dumps(package))
            output = directory / 'review.json'
            command = ['python3', str(Path(__file__).with_name('prepare-physical-review.py')), str(directory / 'package.json'), str(directory / 'world'), str(output)]
            subprocess.run(command, check=True, capture_output=True)
            document = json.loads(output.read_text())
            self.assertEqual(document['holes']['test-01']['featureAvailability']['water']['state'], 'unknown')
            self.assertEqual(document['holes']['test-01']['review']['status'], 'pending')
            study['admissionReview'] = review_input(document, 'test-01')
            result = admit(study)
            self.assertFalse(result['passed'])
            self.assertTrue(result['admission']['capabilities']['renderHole']['allowed'])
            self.assertNotEqual(subprocess.run(command, capture_output=True, check=False).returncode, 0, 'Existing human review files must not be overwritten')

    def test_large_boundary_uncertainty_and_combined_budget_deny_measurement(self):
        for boundary in (100, 1.8):
            study = study_fixture()
            study['features'][1]['provenance']['boundaryAccuracyMeters'] = boundary
            report = admit(study)
            self.assertFalse(report['passed'])
            caps = report['admission']['capabilities']
            self.assertTrue(caps['renderHole']['allowed'])
            self.assertFalse(caps['measureGreenDistance']['allowed'])
            self.assertFalse(caps['suggestLie']['allowed'])
            self.assertIn('GREEN_GEOMETRY_UNCERTAINTY_EXCEEDS_BUDGET', caps['measureGreenDistance']['reasons'])
            uncertainty = caps['measureGreenDistance']['uncertainty']
            self.assertEqual(uncertainty['boundaryUpperBoundMeters'], boundary)
            self.assertGreater(uncertainty['geometryUpperBoundMeters'], 2)

    def test_wrong_course_checkpoints_cannot_qualify_registration_or_field_verification(self):
        for field in ('registration', 'fieldValidation'):
            study = study_fixture()
            block = {**controls(), 'method': 'independent_geodetic_checkpoints'}
            for i, point in enumerate(block['checkpoints']):
                point['coordinateWgs84'] = [-120 + i * .001, 40]
                point['observedCoordinateWgs84'] = list(Geod(ellps='WGS84').fwd(*point['coordinateWgs84'], 0, .15)[:2])
            study['admissionReview']['hole'][field] = block
            report = admit(study)['admission']
            decision = report['capabilities']['measureGreenDistance'] if field == 'registration' else report['fieldVerification']
            self.assertFalse(decision['allowed'])
            self.assertTrue(any('CHECKPOINTS_OUTSIDE_REVIEW_AREA' in reason for reason in decision['reasons']))

    def test_explicit_unknown_feature_cannot_be_promoted_by_polygon_presence(self):
        study = study_fixture()
        water = copy.deepcopy(study['features'][1])
        water.update({'id': 'water', 'kind': 'water'})
        study['features'].append(water)
        study['admissionReview']['hole']['featureAvailability']['water'] = {'state': 'unknown', 'reason': 'Unresolved current imagery'}
        report = admit(study)
        self.assertFalse(report['passed'])
        self.assertFalse(report['admission']['capabilities']['suggestLie']['allowed'])
        self.assertTrue(report['admission']['capabilities']['renderHole']['allowed'])
        water_row = next(row for row in report['features'] if row['feature'] == 'water')
        self.assertEqual(water_row['availability']['state'], 'unknown')
        self.assertFalse(water_row['completenessPassed'])

    def test_cli_emits_same_absence_capabilities_and_renderer_contract(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source, report, world = [directory / name for name in ('study.json', 'report.json', 'world.json')]
            source.write_text(json.dumps(study_fixture()))
            for args in ([str(SPEC.origin), str(source), str(report), str(directory / 'report.md'), '--require-pass'],
                         [str(Path(__file__).with_name('compile-physical-world.py')), str(source), str(world)]):
                subprocess.run(['python3', *args], check=True, capture_output=True)
            gate = json.loads(report.read_text())['holes'][0]['admission']
            compiled = json.loads(world.read_text())
            self.assertEqual(compiled['admission']['admissionVersion'], gate['admissionVersion'])
            self.assertEqual(compiled['featureAvailability']['water']['state'], 'confirmed_absent')
            self.assertTrue(compiled['semanticSurfaces'][0]['rendering']['measurementAuthority'])
            self.assertFalse(gate['capabilities']['puttingBreak']['allowed'])
            self.assertFalse(gate['capabilities']['bunkerDepth']['allowed'])


if __name__ == '__main__':
    unittest.main()
