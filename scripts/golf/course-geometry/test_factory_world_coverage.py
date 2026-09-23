"""The catalog coverage audit must not confuse a GLB with course authority."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from factory.world_coverage import acquisition_tasks, audit_catalog, render_markdown, terrain_decisions  # noqa: E402


def write(path: Path, body: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(body), encoding="utf-8")


class WorldCoverageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.catalog = self.root / "catalog"
        self.output = self.root / "output"
        self.layout_id = "test-layout"
        self.keys = [f"test-{number:02d}" for number in range(1, 10)]
        write(self.catalog / "facilities" / "test-facility.json", {
            "schema": "golfhelm-facility-v1", "facilityId": "test-facility", "name": "Test Facility", "country": "US", "region": "NC",
            "originWgs84": [-80.0, 35.0], "aoi": {"kind": "osm", "id": "way/123", "marginM": 100}, "sourcePins": {"osm": ["way/123"]},
            "providerPolicy": {"terrain": ["usgs_3dep_project_1m"], "imagery": ["naip"], "context": ["osm"]},
        })
        write(self.catalog / "layouts" / f"{self.layout_id}.json", {
            "schema": "golfhelm-layout-v1", "layoutId": self.layout_id, "facilityId": "test-facility", "name": "Test", "siteIds": ["osm-way-123"],
            "segments": {"test": {"holes": self.keys}}, "segmentOrder": ["test"], "holeOrder": self.keys, "routeWayIds": list(range(1, 10)),
            "bboxWgs84": None, "capabilityTier": "C0", "externalBindings": {"golfCourseIds": []}, "scorecardProfiles": ["test-card"],
            "referenceScorecardProfileId": "test-card", "geometry": None,
        })
        write(self.catalog / "scorecards" / "test-card.json", {
            "schema": "golfhelm-scorecard-profile-v1", "profileId": "test-card", "layoutId": self.layout_id, "teeName": "Blue",
            "source": {"provider": "owner_supplied", "url": None, "retrievedAt": "2026-09-21"}, "courseRating": None, "slopeRating": None,
            "holes": [{"hole": number, "par": 4, "yards": 400} for number in range(1, 10)],
        })

    def tearDown(self):
        self.temp.cleanup()

    def _world(self, *, truth: bool, association: bool):
        root = self.output / "layouts" / self.layout_id
        manifest = {"holes": []}
        for key in self.keys:
            folder = root / "world" / "holes" / key
            (folder / "rendering").mkdir(parents=True, exist_ok=True)
            (folder / "rendering" / f"{key}.glb").write_bytes(b"glTF")
            write(folder / "validation" / "glb-roundtrip.json", {"passed": True})
            write(folder / "validation" / "course-truth.json", {"passed": truth, "holes": [{"features": [] if truth else [{"validation": ["not human reviewed"]}]}]})
            manifest["holes"].append({"key": key, "admission": {"capabilities": {
                "associateRoundHole": {"allowed": association, "reasons": [] if association else ["PHYSICAL_REVIEW_REQUIRED"]},
                "measureGreenDistance": {"allowed": association, "reasons": [] if association else ["PHYSICAL_REVIEW_REQUIRED"]},
                "highlightSelectedTee": {"allowed": association, "reasons": [] if association else ["TEE_PROFILE_BINDING_REQUIRED"]},
            }}})
        write(root / "world" / "course-world-manifest.json", manifest)

    def _routes(self):
        return {"layouts": [{"layoutId": self.layout_id, "routeStatus": "routes_resolved", "candidateAssemblyReady": True, "blockers": [], "nextAction": "review"}]}

    def test_visual_world_remains_ineligible_until_independent_admission(self):
        self._world(truth=False, association=False)
        with patch("factory.world_coverage.route_inventory", return_value=self._routes()):
            report = audit_catalog(str(self.root), str(self.catalog), str(self.output))
        row = report["layouts"][0]
        self.assertEqual(row["renderTier"], "full_hole_visual_candidate")
        self.assertEqual(row["assets"]["holeGlbs"], 9)
        self.assertFalse(row["physicalAdmission"]["ready"])
        self.assertFalse(row["oneTap"]["geometryEligible"])
        self.assertEqual(row["nextBlocker"], "not human reviewed")
        self.assertIn("not eligible", render_markdown(report))

    def test_eligible_one_tap_requires_every_hole_truth_and_association(self):
        self._world(truth=True, association=True)
        with patch("factory.world_coverage.route_inventory", return_value=self._routes()):
            report = audit_catalog(str(self.root), str(self.catalog), str(self.output))
        row = report["layouts"][0]
        self.assertEqual(row["renderTier"], "full_hole_physical_candidate")
        self.assertTrue(row["physicalAdmission"]["ready"])
        self.assertTrue(row["oneTap"]["geometryEligible"])
        self.assertTrue(row["oneTap"]["measurementEligible"])
        self.assertEqual(row["nextBlocker"], "READY")

    def test_ordinal_asset_match_without_canonical_hole_crosswalk_is_not_one_tap_eligible(self):
        self._world(truth=True, association=True)
        root = self.output / "layouts" / self.layout_id
        manifest_path = root / "world" / "course-world-manifest.json"
        manifest = json.loads(manifest_path.read_text())
        for number, hole in enumerate(manifest["holes"], start=1):
            old_key, artifact_key = hole["key"], f"legacy-{number:02d}"
            hole["ordinal"] = number
            hole["key"] = artifact_key
            old_folder, new_folder = root / "world" / "holes" / old_key, root / "world" / "holes" / artifact_key
            old_folder.rename(new_folder)
            glb = new_folder / "rendering" / f"{old_key}.glb"
            glb.rename(new_folder / "rendering" / f"{artifact_key}.glb")
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        with patch("factory.world_coverage.route_inventory", return_value=self._routes()):
            report = audit_catalog(str(self.root), str(self.catalog), str(self.output))
        row = report["layouts"][0]
        self.assertEqual(row["assets"]["holeGlbs"], 9)
        self.assertEqual(len(row["assets"]["physicalHoleKeyMismatches"]), 9)
        self.assertFalse(row["oneTap"]["geometryEligible"])
        self.assertTrue(row["physicalAdmission"]["ready"])
        self.assertTrue(row["nextBlocker"].startswith("PHYSICAL_HOLE_KEY_CROSSWALK_REQUIRED:"))

    def test_facility_visual_only_never_becomes_hole_or_measurement_coverage(self):
        root = self.output / "layouts" / self.layout_id
        visual = self.output / "facilities" / "test-facility" / "visual-world" / "test.glb"
        visual.parent.mkdir(parents=True, exist_ok=True)
        visual.write_bytes(b"glTF")
        write(root / "visual-world.json", {"canonicalHoleRoutesAdmitted": False, "glb": str(visual), "renderingContract": {"canRender": True, "canMeasure": False, "maySupplyHoleAssociation": False}})
        with patch("factory.world_coverage.route_inventory", return_value={"layouts": [{"layoutId": self.layout_id, "routeStatus": "unresolved", "candidateAssemblyReady": False, "blockers": ["ROUTE_WAY_IDS_REQUIRED"]}]}):
            report = audit_catalog(str(self.root), str(self.catalog), str(self.output))
        row = report["layouts"][0]
        self.assertEqual(row["renderTier"], "facility_visual_only")
        self.assertFalse(row["oneTap"]["geometryEligible"])
        self.assertFalse(row["assets"]["facilityVisual"]["maySupplyHoleAssociation"])
        self.assertEqual(row["nextBlocker"], "ROUTE_WAY_IDS_REQUIRED")
        self.assertEqual(row["lifecycleState"], "route_blocked")
        self.assertEqual(row["acquisitionTask"]["kind"], "route_evidence")
        self.assertIn("proximity", row["acquisitionTask"]["prohibitedResolution"])

    def _blocked_terrain_run_report(self, *, code: str = "NATIVE_TERRAIN_COVERAGE_GAP", suffix: str = "old") -> None:
        write(self.output / "runs" / f"run-2026092{suffix}" / "report.json", {"blocked": [
            {"key": f"layout.terrain.acquire[{self.layout_id}]",
             "blockers": [{"code": code, "evidence": {"layoutId": self.layout_id, "provider": "nc_onemap_dem03"}}]},
        ]})

    def test_stale_dossier_and_old_blocked_run_do_not_override_a_completed_source_manifest(self):
        # Reproduces the Benvenue/Eagle Point shape: a run once blocked on
        # NATIVE_TERRAIN_COVERAGE_GAP, and the terrain directory still holds
        # the rejected-candidate dossier and a stale coverage-exception from
        # that same episode -- but a source-manifest.json now exists,
        # recording that the acquisition fell back to a different provider
        # and completed. None of the retained-but-superseded evidence should
        # keep reporting this as still blocked or still pending.
        self._blocked_terrain_run_report()
        terrain_dir = self.output / "facilities" / "test-facility" / "terrain" / "abc123-nc-native-v2"
        write(terrain_dir / "coverage-exception.json", {"state": "needs_source_review", "packageHash": "old-hash"})
        write(terrain_dir / "source-selection-dossier.json", {"schema": "golfhelm-nc-dem03-source-selection-dossier-v1", "providerPolicyId": "nc_onemap_dem03"})
        write(terrain_dir / "source-manifest.json", {"providerPolicyId": "usgs_3dep_project_1m", "fallbackFrom": "nc_onemap_dem03", "packageHash": "new-hash"})
        with patch("factory.world_coverage.route_inventory", return_value=self._routes()):
            report = audit_catalog(str(self.root), str(self.catalog), str(self.output))
        row = report["layouts"][0]
        self.assertEqual(row["terrain"]["state"], "native_terrain_acquired")
        self.assertEqual(len(row["terrain"]["sourceManifests"]), 1)
        self.assertNotIn(row["lifecycleState"], {"native_terrain_incomplete", "terrain_decision_pending"})
        self.assertNotEqual(row["nextBlocker"], "NATIVE_TERRAIN_COVERAGE_GAP")
        self.assertEqual(terrain_decisions(report)["decisions"], [])

    def test_dossier_without_a_manifest_still_reports_a_pending_terrain_decision(self):
        # No source-manifest.json anywhere yet, and the latest run report
        # carries no NATIVE_TERRAIN_COVERAGE_GAP block for this key: the
        # dossier is the only evidence, and genuinely nothing has succeeded,
        # so the pending state must still surface.
        terrain_dir = self.output / "facilities" / "test-facility" / "terrain" / "abc123-nc-native-v2"
        write(terrain_dir / "source-selection-dossier.json", {"schema": "golfhelm-nc-dem03-source-selection-dossier-v1", "providerPolicyId": "nc_onemap_dem03"})
        with patch("factory.world_coverage.route_inventory", return_value=self._routes()):
            report = audit_catalog(str(self.root), str(self.catalog), str(self.output))
        row = report["layouts"][0]
        self.assertEqual(row["terrain"]["state"], "terrain_decision_pending")
        self.assertEqual(row["terrain"]["sourceManifests"], [])

    def test_an_old_terrain_keys_manifest_never_masks_a_blocker_on_the_current_key(self):
        # Two candidate directories under the same facility: an abandoned
        # "old" key (different requested bounds/policy) that happens to have
        # a manifest from a past attempt, and the layout's *current* key
        # (named by its terrain-source.json pointer, exactly as
        # `acquire_terrain` writes it), which is genuinely still blocked and
        # has no manifest of its own. The old key's manifest must not be
        # picked up as if it were current-key evidence.
        terrain_root = self.output / "facilities" / "test-facility" / "terrain"
        old_key_dir = terrain_root / "oldkey-nc-native-v2"
        write(old_key_dir / "source-manifest.json", {"providerPolicyId": "usgs_3dep_project_1m", "packageHash": "abandoned-hash"})
        current_key_dir = terrain_root / "currentkey-nc-native-v2"
        write(self.output / "layouts" / self.layout_id / "terrain-source.json", {
            "kind": "golfhelm-factory-terrain-source-v1", "layoutId": self.layout_id, "directory": str(current_key_dir),
        })
        self._blocked_terrain_run_report()
        with patch("factory.world_coverage.route_inventory", return_value=self._routes()):
            report = audit_catalog(str(self.root), str(self.catalog), str(self.output))
        row = report["layouts"][0]
        self.assertEqual(row["terrain"]["state"], "native_terrain_incomplete")
        self.assertEqual(row["terrain"]["sourceManifests"], [])
        self.assertEqual(row["nextBlocker"], "NATIVE_TERRAIN_COVERAGE_GAP")

    def test_external_work_projections_are_read_only_and_complete(self):
        with patch("factory.world_coverage.route_inventory", return_value={"layouts": [{"layoutId": self.layout_id, "routeStatus": "unresolved", "candidateAssemblyReady": False, "blockers": ["ROUTE_WAY_IDS_REQUIRED"]}]}):
            report = audit_catalog(str(self.root), str(self.catalog), str(self.output))
        tasks = acquisition_tasks(report)
        self.assertEqual(tasks["schema"], "golfhelm-factory-acquisition-tasks-v2")
        self.assertTrue(tasks["readOnly"])
        self.assertEqual([task["layoutId"] for task in tasks["tasks"]], [self.layout_id])
        decisions = terrain_decisions(report)
        self.assertEqual(decisions["schema"], "golfhelm-factory-terrain-decisions-v2")
        self.assertEqual(decisions["decisions"], [])


if __name__ == "__main__":
    unittest.main()
