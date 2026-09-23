"""Unit tests for factory/terrain_contract.py and ship's terrain-contract gate."""
import re
import unittest
from pathlib import Path

from factory import ship
from factory.fingerprints import content_hash_matches, digest
from factory.terrain_contract import NAVD88_SPELLINGS, RUNTIME_DATUM, RUNTIME_MAX_FEATURES, RUNTIME_PROVIDERS, conform_mesh, contract_problems

REPO = Path(__file__).resolve().parents[3]


def mesh(datum='NAVD88', provider='usgs_3dep_project_1m', start='2019-11-26', end='2019-12-01'):
    doc = {'physicalHoleKey': 'h01', 'verticalDatum': datum,
           'source': {'provider': provider, 'title': 'T', 'acquisitionStart': start, 'acquisitionEnd': end, 'verticalDatum': datum}}
    doc['contentHash'] = digest(doc)
    return doc


class ConformMeshTests(unittest.TestCase):
    def test_every_verified_navd88_spelling_becomes_the_runtime_literal(self):
        for spelling in NAVD88_SPELLINGS - {RUNTIME_DATUM}:
            conformed, changes = conform_mesh(mesh(spelling))
            self.assertEqual(conformed['verticalDatum'], 'NAVD88')
            self.assertTrue(content_hash_matches(conformed))
            self.assertEqual(changes, [{'field': 'verticalDatum', 'from': spelling, 'to': 'NAVD88'}])
            # Provenance keeps the source's own wording.
            self.assertEqual(conformed['source']['verticalDatum'], spelling)

    def test_already_conforming_mesh_is_returned_untouched(self):
        original = mesh()
        conformed, changes = conform_mesh(original)
        self.assertIs(conformed, original)
        self.assertEqual(changes, [])

    def test_other_datums_are_never_guessed(self):
        for datum in ('NGVD29', 'EGM2008', None, 'navd88', 'NAVD88-ish'):
            conformed, changes = conform_mesh(mesh(datum))
            self.assertEqual(conformed['verticalDatum'], datum)
            self.assertEqual(changes, [])

    def test_input_is_not_mutated(self):
        original = mesh('North American Vertical Datum 1988')
        before = dict(original)
        conform_mesh(original)
        self.assertEqual(original, before)


class ContractProblemsTests(unittest.TestCase):
    def test_conforming_mesh_has_no_problems(self):
        self.assertEqual(contract_problems(mesh()), [])

    def test_null_acquisition_dates_are_named_not_inferred(self):
        problems = contract_problems(mesh(provider='nc_onemap_dem03', start=None, end=None))
        self.assertEqual([p['code'] for p in problems], ['TERRAIN_ACQUISITION_DATE_UNKNOWN'])
        self.assertEqual(problems[0]['fields'], ['acquisitionStart', 'acquisitionEnd'])

    def test_unconformed_datum_and_unknown_provider_are_named(self):
        codes = [p['code'] for p in contract_problems(mesh('NGVD29', provider='charleston_county_dem_2025'))]
        self.assertEqual(codes, ['TERRAIN_VERTICAL_DATUM_UNSUPPORTED', 'TERRAIN_PROVIDER_UNSUPPORTED'])


class FeatureTableTests(unittest.TestCase):
    def test_more_features_than_one_byte_indexes_is_named(self):
        doc = mesh()
        doc['featureIds'] = [f'f{i}' for i in range(288)]
        self.assertEqual([p['code'] for p in contract_problems(doc)], ['TERRAIN_FEATURE_TABLE_OVERFLOW'])
        doc['featureIds'] = doc['featureIds'][:256]
        self.assertEqual(contract_problems(doc), [])


class RuntimeAlignmentTests(unittest.TestCase):
    def test_feature_table_limit_matches_the_runtime_schema(self):
        source = (REPO / 'src/lib/golf/course-geometry/terrain.ts').read_text()
        self.assertIn(f'triangleFeatures: z.array(z.number().int().min(0).max({RUNTIME_MAX_FEATURES - 1}))', source)

    def test_constants_match_the_runtime_mesh_schema(self):
        source = (REPO / 'src/lib/golf/course-geometry/terrain.ts').read_text()
        self.assertIn(f"verticalDatum: z.literal('{RUNTIME_DATUM}')", source)
        providers = re.search(r"provider: z\.enum\(\[([^\]]*)\]\)", source)
        self.assertIsNotNone(providers)
        self.assertEqual(set(re.findall(r"'([^']+)'", providers.group(1))), set(RUNTIME_PROVIDERS))


class ShipTerrainContractGateTests(unittest.TestCase):
    def test_problems_group_across_holes(self):
        bad = mesh(provider='nc_onemap_dem03', start=None, end=None)
        docs = {'h01': {'mesh': bad}, 'h02': {'mesh': dict(bad, physicalHoleKey='h02')}, 'h03': {'mesh': mesh()}}
        blockers = ship.gate_terrain_contract(docs)
        self.assertEqual(len(blockers), 1)
        self.assertEqual(blockers[0]['code'], 'TERRAIN_ACQUISITION_DATE_UNKNOWN')
        self.assertEqual(blockers[0]['holeKeys'], ['h01', 'h02'])

    def test_missing_mesh_is_left_to_the_hash_chain_gate(self):
        self.assertEqual(ship.gate_terrain_contract({'h01': {'mesh': None}}), [])


if __name__ == '__main__':
    unittest.main()
