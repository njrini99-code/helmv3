"""Course Geometry Factory v2 — the build engine (PR B, 2026-09-19).

Reads the checked-in library catalog (`course-geometry/catalog/`), builds the
facility → layout → hole task graph, fingerprints every task from its direct
inputs only, keeps disposable build state in SQLite under ignored output, and
explains why any task is cached, stale or blocked. Geospatial work stays in
the existing scripts; they become task adapters in PR C. Everything here runs
without the network and without the geo stack.
"""

FACTORY_VERSION = '1'
