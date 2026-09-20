"""Provider-policy selection stays explicit and network-free."""
import unittest

from factory.providers import select_terrain_provider, supported_terrain_provider_ids


class TerrainProviderSelectionTest(unittest.TestCase):
    def test_selects_the_first_policy_provider_with_a_real_adapter(self):
        self.assertEqual(select_terrain_provider(['nc_onemap_dem03']).compiler_id, 'nc_onemap_dem03')
        # S1M discovery is intentionally not an acquisition adapter yet; the
        # declared 3DEP fallback stays visible and is selected explicitly.
        self.assertEqual(select_terrain_provider(['usgs_s1m', 'usgs_3dep_project_1m']).compiler_id,
                         'usgs_3dep_project_1m')

    def test_unknown_policy_cannot_silently_fall_back(self):
        self.assertIsNone(select_terrain_provider(['unreviewed_dem']))
        self.assertEqual(set(supported_terrain_provider_ids()), {'usgs_3dep_project_1m', 'nc_onemap_dem03'})


if __name__ == '__main__':
    unittest.main()
