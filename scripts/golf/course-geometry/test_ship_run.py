"""`ship_run._build_route_overview`'s `--osm` wiring for the auto-route-v1
branch (the faint tee/green polygon overlay `route-overview.py` now draws):
best-effort only -- present when a snapshot resolves, silently absent (not
an error) when it doesn't, unlike the `routeWayIds` branch below it where a
missing snapshot IS a hard `OSM_SNAPSHOT_MISSING` blocker."""
import os
import subprocess
import tempfile
import unittest
from unittest import mock

from factory import ship_run


class _StubContext:
    """Just enough of `Context`'s surface for `_build_route_overview`: no
    real repo, no real catalog -- every path either doesn't need to exist
    (skipped via `os.path.isfile`) or is a real tempfile the test creates."""

    def __init__(self, tmp, *, snapshot_extract_path):
        self.repo_root = tmp
        self._tmp = tmp
        self._snapshot_extract_path = snapshot_extract_path
        self.proposal_path = os.path.join(tmp, 'route-proposal.json')
        with open(self.proposal_path, 'w', encoding='utf-8') as f:
            f.write('{}')

    def abspath(self, path):
        return os.path.join(self._tmp, path)

    def layout(self, layout_id):
        return {'facilityId': 'a-facility', 'name': 'A Layout'}

    def routes_path(self, layout_id):
        return os.path.join(self._tmp, 'routes.json')

    def route_proposal_path(self, layout_id):
        return self.proposal_path

    def snapshot(self, facility_id, kind='osm'):
        if self._snapshot_extract_path is None:
            return None, None
        return {'file': 'overpass.json.gz'}, self._snapshot_extract_path

    def scorecard_path(self, layout_id):
        return os.path.join(self._tmp, 'scorecard.json')  # deliberately does not exist

    def naip_dir(self, layout_id):
        return None  # not under test here

    def json(self, path):
        return None


class AutoRouteOverlayWiringTests(unittest.TestCase):
    def _run(self, ctx):
        captured = {}

        def fake_run(cmd, **kwargs):
            captured['cmd'] = cmd
            return subprocess.CompletedProcess(cmd, returncode=0, stdout='', stderr='')

        with mock.patch.object(ship_run.subprocess, 'run', fake_run):
            with tempfile.TemporaryDirectory() as dest:
                path, error = ship_run._build_route_overview(
                    ctx, 'a-layout', {'source': 'auto-route-v1'}, {'features': [], 'report': []}, dest)
        return path, error, captured['cmd']

    def test_osm_is_passed_when_a_snapshot_resolves(self):
        with tempfile.TemporaryDirectory() as tmp:
            extract_path = os.path.join(tmp, 'overpass.json.gz')
            open(extract_path, 'w').close()
            ctx = _StubContext(tmp, snapshot_extract_path=extract_path)
            path, error, cmd = self._run(ctx)
        self.assertIsNone(error)
        self.assertIn('--osm', cmd)
        self.assertEqual(cmd[cmd.index('--osm') + 1], extract_path)
        self.assertIn('--proposal', cmd)  # still the review input, same as before this fix

    def test_a_missing_snapshot_is_silently_skipped_not_a_blocker(self):
        # Unlike the routeWayIds branch (which returns OSM_SNAPSHOT_MISSING
        # when there's no retained extract), an auto-route-v1 proposal
        # already carries its own confidence/yardage table -- the overlay
        # is a nice-to-have, so a missing snapshot must not fail the render.
        with tempfile.TemporaryDirectory() as tmp:
            ctx = _StubContext(tmp, snapshot_extract_path=None)
            path, error, cmd = self._run(ctx)
        self.assertIsNone(error)
        self.assertNotIn('--osm', cmd)
        self.assertIn('--proposal', cmd)


if __name__ == '__main__':
    unittest.main()
