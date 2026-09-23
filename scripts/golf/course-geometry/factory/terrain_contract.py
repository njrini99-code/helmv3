"""The runtime terrain-mesh contract (`src/lib/golf/course-geometry/terrain.ts`
`meshSchema`), as the factory must meet it before a mesh is bound.

The compiler keeps each source's own vertical-datum wording as provenance
(`source.verticalDatum` stays verbatim: a raster CRS says "North American
Vertical Datum 1988", 3DEP product metadata says "...of 1988"). The mesh's
top-level `verticalDatum` is a different field: the runtime contract, a
literal `NAVD88`. `conform_mesh` maps only exact spellings the compiler
already emits from verified evidence onto that literal -- never a substring,
never a guess -- at bind time (`layout.terrain.aggregate`), so no producer
artifact or compiler fingerprint changes. Anything else it leaves alone, and
`contract_problems` names it for `ship`, instead of the factory lab refusing
the bundle at capture time with 18 identical timeouts.
"""
import copy

from .fingerprints import digest

RUNTIME_DATUM = 'NAVD88'
# Exact spellings, each emitted by compile-course-terrain.py only from
# verified evidence (raster compound CRS, product metadata record, or a
# provider declaration carrying its own evidence URL).
NAVD88_SPELLINGS = frozenset({
    'NAVD88',
    'North American Vertical Datum 1988',      # pyproj datum name from a raster's compound CRS
    'North American Vertical Datum of 1988',   # 3DEP product metadata statement
    'NAVD88 (Geoid 18)',                       # county DEM declaration (NAVD88 heights realized via GEOID18)
})
# Mirrors meshSchema.source.provider's z.enum; test_terrain_contract checks
# the two stay aligned.
RUNTIME_PROVIDERS = frozenset({'USGS 3DEP', 'usgs_3dep_project_1m', 'nc_onemap_dem03'})
# meshSchema.triangleFeatures is z.number().int().min(0).max(255): one byte
# per triangle indexes the mesh's feature table.
RUNTIME_MAX_FEATURES = 256


def conform_mesh(mesh):
    """Returns `(mesh, changes)`. `mesh` is the input object itself when
    nothing changes, else a conformed deep copy with its `contentHash`
    recomputed; `changes` records each field rewritten."""
    datum = mesh.get('verticalDatum')
    if datum == RUNTIME_DATUM or datum not in NAVD88_SPELLINGS:
        return mesh, []
    conformed = copy.deepcopy(mesh)
    conformed['verticalDatum'] = RUNTIME_DATUM
    conformed['contentHash'] = digest({k: v for k, v in conformed.items() if k != 'contentHash'})
    return conformed, [{'field': 'verticalDatum', 'from': datum, 'to': RUNTIME_DATUM}]


def contract_problems(mesh):
    """Runtime-contract violations `conform_mesh` cannot fix, as ship blocker
    codes with evidence. Empty means the fields checked here will parse."""
    problems = []
    source = mesh.get('source') or {}
    if mesh.get('verticalDatum') != RUNTIME_DATUM:
        problems.append({'code': 'TERRAIN_VERTICAL_DATUM_UNSUPPORTED', 'verticalDatum': mesh.get('verticalDatum')})
    if source.get('provider') not in RUNTIME_PROVIDERS:
        problems.append({'code': 'TERRAIN_PROVIDER_UNSUPPORTED', 'provider': source.get('provider')})
    features = len(mesh.get('featureIds') or [])
    if features > RUNTIME_MAX_FEATURES:
        problems.append({'code': 'TERRAIN_FEATURE_TABLE_OVERFLOW', 'features': features, 'max': RUNTIME_MAX_FEATURES})
    # Acquisition dates may be null: NC OneMap DEM03 publishes none, and the
    # owner chose (2026-09-23) to show such terrain credited by provider
    # without a year rather than infer one from a raster title. A date that
    # is present must still be a string.
    bad = [k for k in ('acquisitionStart', 'acquisitionEnd') if source.get(k) is not None and not isinstance(source.get(k), str)]
    if bad:
        problems.append({'code': 'TERRAIN_ACQUISITION_DATE_INVALID', 'provider': source.get('provider'), 'fields': bad})
    return problems
