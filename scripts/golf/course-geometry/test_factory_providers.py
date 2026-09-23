"""Provider-policy selection stays explicit and network-free."""
import unittest

from factory.providers import (
    select_terrain_provider,
    supported_terrain_provider_ids,
    terrain_provider_contract,
    terrain_provider_policy_contract,
)


class TerrainProviderSelectionTest(unittest.TestCase):
    def test_selects_the_first_policy_provider_with_a_real_adapter(self):
        self.assertEqual(select_terrain_provider(['nc_onemap_dem03']).compiler_id, 'nc_onemap_dem03')
        self.assertEqual(select_terrain_provider(['charleston_county_dem_2025']).compiler_id,
                         'charleston_county_dem_2025')
        # S1M discovery is intentionally not an acquisition adapter yet; the
        # declared 3DEP fallback stays visible and is selected explicitly.
        self.assertEqual(select_terrain_provider(['usgs_s1m', 'usgs_3dep_project_1m']).compiler_id,
                         'usgs_3dep_project_1m')

    def test_unknown_policy_cannot_silently_fall_back(self):
        self.assertIsNone(select_terrain_provider(['unreviewed_dem']))
        self.assertEqual(set(supported_terrain_provider_ids()),
                         {'usgs_3dep_project_1m', 'nc_onemap_dem03', 'charleston_county_dem_2025'})

    def test_provider_contract_carries_measurement_relevant_frame_evidence(self):
        nc = terrain_provider_contract(select_terrain_provider(['nc_onemap_dem03']))
        self.assertEqual(nc['sourceContract'], 'nc-dem03-native-frame-v2')
        self.assertEqual(nc['horizontalCrs'], 'EPSG:6543')
        self.assertTrue(nc['requiresVerifiedVerticalReference'])
        self.assertAlmostEqual(nc['nativeResolutionM'], 0.9525019050038099)

    def test_ordered_policy_contract_keeps_unknown_candidate_visible(self):
        contract = terrain_provider_policy_contract(['state_lidar_pending', 'usgs_3dep_project_1m'])
        self.assertEqual(contract['orderedPolicyIds'], ('state_lidar_pending', 'usgs_3dep_project_1m'))
        self.assertEqual(contract['declaredContracts'][0], ('state_lidar_pending', None))
        self.assertEqual(contract['selected']['policyId'], 'usgs_3dep_project_1m')


if __name__ == '__main__':
    unittest.main()
