"""Stable reason codes. Text may change; codes never do (Factory v2 §7)."""

# Blockers: a declared prerequisite, evidence or human decision is missing.
BLOCKERS = {
    'CATALOG_INVALID': 'the catalog fails its invariants',
    'FACILITY_AOI_REQUIRED': 'the facility has no area of interest',
    'LAYOUT_IDENTITY_AMBIGUOUS': 'the layout names no site or binding that identifies it',
    'ROUTE_WAY_IDS_REQUIRED': 'route identity is human-pinned: routeWayIds is null',
    'SCORECARD_REQUIRED': 'the layout has no scorecard profile',
    'SCORECARD_HOLE_MISMATCH': 'the scorecard profile and the layout disagree on the hole count',
    'HOLE_COUNT_UNSUPPORTED': 'the package builder requires a 9- through 36-hole layout',
    'TERRAIN_ADAPTER_MISSING': 'no adapter exists for the terrain provider the facility names',
    'HUMAN_ROUTE_CONFIRMATION_REQUIRED': 'the route ways were proposed from OSM numbering; a person confirms them',
    'TRUTH_GATE_NOT_RUN': 'the per-hole truth gate has not run',
    'PACKAGE_REQUIRED': 'no geometry package exists',
    'TERRAIN_COMPILE_INCOMPLETE': 'not every hole has compiled terrain',
    'OSM_SOURCE_UNAVAILABLE': 'no retained OSM snapshot',
    'OSM_SOURCE_RETRYABLE': 'the OSM provider failed in a retryable way',
    'TERRAIN_PROVIDER_UNAVAILABLE': 'no terrain provider answered',
    'TERRAIN_NO_NATIVE_SOURCE': 'no native 1 m terrain covers the AOI',
    'TERRAIN_EMPTY_FILL': 'the terrain export is mostly empty fill',
    'IMAGERY_PROVIDER_UNAVAILABLE': 'no imagery provider answered',
    'IMAGERY_TOO_OLD_FOR_KNOWN_RENOVATION': 'the retained imagery was flown before the catalog knownRenovationAfter date; retain a later capture or lift the date',
    'SOURCE_HASH_MISMATCH': 'an artifact was built from other inputs than the current ones',
    'PACKAGE_PARTIAL': 'the package is partial',
    'PACKAGE_HASH_NOT_APPROVED': 'the package hash is not approved for release',
    'HUMAN_IMAGERY_REVIEW_REQUIRED': 'a person has to review the imagery evidence',
    'HUMAN_CONTEXT_REVIEW_REQUIRED': 'a person has to review the context layer',
    'HUMAN_BOUNDARY_REVIEW_REQUIRED': 'a person has to review the surface boundaries',
    'SHARED_GREEN_DECISION_REQUIRED': 'two holes claim one green; a person decides',
    'FIELD_VERIFICATION_REQUIRED': 'field verification has not happened',
    'TRUTH_GATE_FAILED': 'the source-truth gate failed',
    'CONTEXT_UNCERTAIN_SHARE_HIGH': 'the unexplained context share is over the gate',
    'VISUAL_BUDGET_BREACH': 'a render budget was exceeded',
    'VISUAL_PAGE_ERROR': 'the page errored while rendering',
    'PLAYER_MATRIX_FAILED': 'the player capture matrix failed',
    'PUBLISH_NOT_APPROVED': 'publication is not approved',
    'DISK_GUARD_BLOCKED': 'the disk reserve would be crossed',
    'TOOL_MISSING': 'a required tool is not installed',
    'LAB_NOT_LISTENING': 'the local lab is not listening on its port (npx vite --config scripts/golf/course-geometry/browser.config.ts)',
    'LAB_COURSE_NOT_SERVED': 'the local lab renders checked-in course fixtures only, and this package is not one of them',
    'ADAPTER_NOT_IMPLEMENTED': 'no adapter runs this task in this session (every catalog task has one since PR C; an injected executor set may omit some)',
    'DEPENDENCY_BLOCKED': 'a dependency is blocked',
    'DEPENDENCY_PENDING': 'a dependency has not been built yet',
}

# Why a task needs work although nothing blocks it.
REBUILD_REASONS = {
    'NO_SUCCESSFUL_FINGERPRINT': 'no successful run for this task',
    'FINGERPRINT_CHANGED': 'an input changed since the last success',
    'ARTIFACT_MISSING': 'a recorded output is gone',
    'ARTIFACT_CORRUPT': 'a recorded output no longer matches its hash',
    'MANUAL_INVALIDATION': 'invalidated by hand',
    'PREVIOUS_RUN_FAILED': 'the last run of this fingerprint failed',
    'INTERRUPTED_RUN_RECOVERED': 'a running record had no live process',
}

# Why no work is needed.
NOOP_REASONS = {
    'FINGERPRINT_UNCHANGED': 'fingerprint unchanged',
    'ADOPTED_EXTERNAL': 'existing artifact matches the current inputs',
    'INLINE_VALIDATED': 'validated while planning; nothing to build',
    'RUNNING': 'a live process holds this task',
}

ALL_CODES = {**BLOCKERS, **REBUILD_REASONS, **NOOP_REASONS}


def describe(code):
    return ALL_CODES.get(code, code)
