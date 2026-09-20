import importlib.util
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('source_registry', HERE / 'factory' / 'source_registry.py')
registry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(registry)


class SourceRegistryTests(unittest.TestCase):
    def test_every_region_keeps_a_public_analysis_fallback(self):
        for region in ('NC', 'VA', 'OH', 'SC', 'GA', 'ZZ'):
            providers = registry.providers_for_region(region)
            self.assertTrue(providers)
            self.assertEqual(providers[-1]['id'], 'usgs_naip_plus')

    def test_only_declared_image_servers_can_enter_feature_extraction(self):
        for provider in registry.IMAGERY_PROVIDERS.values():
            if provider.role == 'feature_extraction':
                self.assertEqual(provider.service_type, 'arcgis_image_server')
                self.assertTrue(provider.service_url.startswith('https://'))
            else:
                self.assertNotEqual(provider.role, 'feature_extraction' if provider.service_type != 'arcgis_image_server' else 'impossible')

    def test_ohio_county_imagery_is_qa_not_automatic_geometry_evidence(self):
        provider = registry.provider_document('licking_county_2023_visual_qa')
        self.assertEqual(provider['role'], 'visual_review_only')
        self.assertIn('writing', provider['licensing'])

    def test_palm_beach_rgb_review_cannot_claim_ground_gsd_or_statewide_coverage(self):
        provider = registry.provider_document('palm_beach_2025_visual_qa')
        self.assertEqual(provider['role'], 'visual_review_only')
        self.assertIsNone(provider['expected_gsd_m'])
        self.assertEqual(provider['expected_bands'], ['red', 'green', 'blue'])
        self.assertNotIn(provider['id'], registry.imagery_policy('FL'))

    def test_ohio_original_tiles_need_an_adapter_and_do_not_assume_nir(self):
        provider = registry.provider_document('ohio_osip3_3in_geotiff')
        self.assertEqual(provider['role'], 'visual_review_only')
        self.assertEqual(provider['service_type'], 'arcgis_tile_download_index')
        self.assertNotIn('nir', provider['expected_bands'])
        self.assertIn('public domain', provider['licensing'])


if __name__ == '__main__':
    unittest.main()

class NcHistoricalImageryPolicyTests(unittest.TestCase):
    def test_historical_four_band_source_is_not_the_default_but_is_a_declared_extraction_source(self):
        provider = registry.provider_document('nc_onemap_2020_2023_analysis')
        self.assertEqual(provider['role'], 'feature_extraction')
        self.assertEqual(provider['expected_bands'], ['red', 'green', 'blue', 'nir'])
        self.assertNotIn('nc_onemap_2020_2023_analysis', registry.imagery_policy('NC'))

class NativeImageryReviewContractTests(unittest.TestCase):
    def test_complete_bound_native_imagery_can_create_review_candidates_but_not_measurements(self):
        index = {
            'schema': 'golfhelm-facility-native-ortho-index-v2',
            'complete': True,
            'tileCountPlanned': 1,
            'qualitySummary': {'passedTiles': 1, 'failedTileKeys': []},
            'tiles': [{'key': 'r00-c00'}],
        }
        source_items = {
            'schema': 'golfhelm-nc-ortho-source-items-v1',
            'complete': True,
            'inputIndexSha256': 'native-index-hash',
            'tiles': [{'tileKey': 'r00-c00', 'status': 'one_native_resolution_catalog_item'}],
        }
        contract = registry.native_ortho_review_contract(index, source_items, index_sha256='native-index-hash')
        self.assertTrue(contract['canCreateReviewCandidates'])
        self.assertFalse(contract['canMeasurePhysicalGeometry'])
        self.assertEqual(contract['sourceTruthClass'], 'measured')
        self.assertEqual(contract['candidateGeometryTruthClass'], 'derived')

    def test_unbound_imagery_fails_closed_for_review_candidate_creation(self):
        index = {
            'schema': 'golfhelm-facility-native-ortho-index-v2',
            'complete': True,
            'tileCountPlanned': 1,
            'qualitySummary': {'passedTiles': 1, 'failedTileKeys': []},
            'tiles': [{'key': 'r00-c00'}],
        }
        contract = registry.native_ortho_review_contract(index, {'complete': False, 'tiles': []}, index_sha256='native-index-hash')
        self.assertFalse(contract['canCreateReviewCandidates'])
        self.assertIn('source item', contract['reason'])

    def test_mismatched_sidecar_hash_fails_closed_even_when_tile_keys_match(self):
        index = {
            'schema': 'golfhelm-facility-native-ortho-index-v2',
            'complete': True,
            'tileCountPlanned': 1,
            'qualitySummary': {'passedTiles': 1, 'failedTileKeys': []},
            'tiles': [{'key': 'r00-c00'}],
        }
        source_items = {
            'schema': 'golfhelm-nc-ortho-source-items-v1',
            'complete': True,
            'inputIndexSha256': 'another-acquisition',
            'tiles': [{'tileKey': 'r00-c00', 'status': 'one_native_resolution_catalog_item'}],
        }
        contract = registry.native_ortho_review_contract(index, source_items, index_sha256='native-index-hash')
        self.assertFalse(contract['canCreateReviewCandidates'])
        self.assertIn('does not bind', contract['reason'])
