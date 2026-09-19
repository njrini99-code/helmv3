"""What task specs may read while a plan is computed: the catalog, retained
artifacts, the ledger, and the outputs of nodes planned before them."""
import json
import os

from .fingerprints import content_hash_matches, files_digest, package_subhashes

SCRIPTS_DIR = 'scripts/golf/course-geometry'


class Context:
    def __init__(self, repo_root, catalog, output_root, ledger=None, adopt_output=True, executors=None, spec_overrides=None):
        self.repo_root = os.path.abspath(repo_root)
        self.catalog = catalog
        self.output_root = os.path.abspath(output_root)
        self.ledger = ledger
        self.adopt_output = adopt_output
        self.executors = executors or {}
        self.spec_overrides = spec_overrides or {}
        self.graph = None
        self.outputs = {}          # node key -> output hash of a cached/successful node
        self.states = {}           # node key -> state
        self.rows = {}             # node key -> PlanRow
        self._json = {}
        self._subhashes = {}
        self._impl = {}

    # --- catalog ------------------------------------------------------------
    def facility(self, facility_id):
        return self.catalog.facilities.get(facility_id)

    def layout(self, layout_id):
        return self.catalog.layouts.get(layout_id)

    def scorecards(self, layout_id):
        return self.catalog.scorecards_of(layout_id)

    # --- paths --------------------------------------------------------------
    def abspath(self, path):
        if path is None:
            return None
        return path if os.path.isabs(path) else os.path.join(self.repo_root, path)

    def relpath(self, path):
        try:
            return os.path.relpath(path, self.repo_root)
        except ValueError:
            return path

    def is_output_path(self, path):
        path = os.path.abspath(path)
        return path.startswith(self.output_root) or path.startswith(os.path.join(self.repo_root, 'output') + os.sep)

    def can_adopt(self, path):
        return path is not None and (self.adopt_output or not self.is_output_path(path))

    def retained(self, doc, key):
        retained = (doc or {}).get('retained') or {}
        return self.abspath(retained.get(key))

    def layout_out(self, layout_id):
        return os.path.join(self.output_root, 'layouts', layout_id)

    def facility_out(self, facility_id):
        return os.path.join(self.output_root, 'facilities', facility_id)

    # --- documents ----------------------------------------------------------
    def json(self, path):
        path = self.abspath(path)
        if path is None or not os.path.isfile(path):
            return None
        if path not in self._json:
            with open(path, encoding='utf-8') as f:
                self._json[path] = json.load(f)
        return self._json[path]

    def package_path(self, layout_id):
        geometry = (self.layout(layout_id) or {}).get('geometry')
        return self.abspath(geometry['package']) if geometry else None

    def package(self, layout_id):
        return self.json(self.package_path(layout_id))

    def package_hash(self, layout_id):
        pkg = self.package(layout_id)
        return pkg.get('contentHash') if pkg else None

    def package_verified(self, layout_id):
        pkg = self.package(layout_id)
        return bool(pkg) and content_hash_matches(pkg)

    def context_layer(self, layout_id):
        return self.json(self.retained(self.layout(layout_id), 'context'))

    def review_overlay(self, layout_id):
        return self.json(self.retained(self.layout(layout_id), 'reviewOverlay'))

    def subhashes(self, layout_id):
        if layout_id not in self._subhashes:
            pkg = self.package(layout_id)
            self._subhashes[layout_id] = package_subhashes(pkg, self.context_layer(layout_id), self.review_overlay(layout_id)) if pkg else {}
        return self._subhashes[layout_id]

    def package_hole(self, layout_id, ordinal):
        pkg = self.package(layout_id)
        if not pkg:
            return None
        return next((h for h in pkg.get('holes', []) if h.get('ordinal') == ordinal), None)

    def hole_subhashes(self, layout_id, ordinal):
        hole = self.package_hole(layout_id, ordinal)
        return self.subhashes(layout_id).get(hole['key']) if hole else None

    # --- graph outputs ------------------------------------------------------
    def output_hash(self, key):
        return self.outputs.get(key)

    def impl_hash(self, spec):
        if spec.id not in self._impl:
            self._impl[spec.id] = files_digest([self.abspath(p) for p in spec.impl_files])
        return self._impl[spec.id]

    def executor(self, spec):
        if spec.id in self.executors:
            return self.executors[spec.id]
        return spec.executor
