import importlib.util
from pathlib import Path
import unittest

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


if __name__ == '__main__':
    unittest.main()

class NcHistoricalImageryPolicyTests(unittest.TestCase):
    def test_historical_four_band_source_is_not_the_default_but_is_a_declared_extraction_source(self):
        provider = registry.provider_document('nc_onemap_2020_2023_analysis')
        self.assertEqual(provider['role'], 'feature_extraction')
        self.assertEqual(provider['expected_bands'], ['red', 'green', 'blue', 'nir'])
        self.assertNotIn('nc_onemap_2020_2023_analysis', registry.imagery_policy('NC'))
