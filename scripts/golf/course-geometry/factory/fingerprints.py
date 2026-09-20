"""Canonical hashing (Factory v2 §9–10).

`canonical_json`/`digest` are byte-identical to the compilers'
(`prepare-osm-course.py`, `compile-course-terrain.py`), so a package's
`contentHash`, a context layer's `contentHash` and a compiled report's
`sourceManifestHash` all recompute here and retained artifacts can be
checked against the inputs they were built from.
"""
import hashlib
import json
import os

_FILE_CACHE = {}


def canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical_json(value).encode('utf-8')).hexdigest()


def digest_text(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def file_sha256(path, chunk=1 << 20):
    """sha256 of a file, cached per (path, size, mtime) for the process."""
    path = os.fspath(path)
    st = os.stat(path)
    cache_key = (path, st.st_size, st.st_mtime_ns)
    hit = _FILE_CACHE.get(cache_key)
    if hit:
        return hit
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(chunk), b''):
            h.update(block)
    _FILE_CACHE[cache_key] = h.hexdigest()
    return _FILE_CACHE[cache_key]


def file_sha256_or_none(path):
    return file_sha256(path) if path and os.path.isfile(path) else None


def files_digest(paths):
    """One hash over several implementation files, by repo-relative name."""
    return digest([[str(p), file_sha256_or_none(p)] for p in paths])


def fingerprint(task_id, version, impl_hash, settings, inputs):
    return digest({'task': task_id, 'version': version, 'impl': impl_hash, 'settings': settings, 'inputs': inputs})


def content_hash_matches(document):
    """A package or context layer hashes everything but its own `contentHash`."""
    stored = document.get('contentHash')
    if not stored:
        return False
    return digest({k: v for k, v in document.items() if k != 'contentHash'}) == stored


# --- per-hole bookkeeping hashes -------------------------------------------
# The package has one contentHash; these say which holes actually changed.
# Every hash is an explicit allow-list so a new package field never joins a
# fingerprint by accident (a scorecard yardage edit must not rebuild terrain).

GOLF_KINDS = ('tee', 'fairway', 'green', 'bunker', 'water', 'route', 'rough', 'hazard', 'path')
CANOPY_KINDS = ('woods',)


def hole_features(package, hole_key):
    return [f for f in package.get('features', []) if hole_key in (f.get('holeKeys') or [])]


def hole_zones(context, hole_key):
    if not context:
        return []
    return [z for z in context.get('zones', []) if hole_key in (z.get('holeKeys') or [])]


def hole_subhashes(package, hole, context=None, review_overlay=None):
    hole_key = hole['key']
    features = sorted(hole_features(package, hole_key), key=lambda f: f['id'])
    golf = [[f['id'], f['kind'], f.get('geometryWgs84')] for f in features if f['kind'] in GOLF_KINDS]
    canopy = [[f['id'], f.get('geometryWgs84')] for f in features if f['kind'] in CANOPY_KINDS]
    source = [[f['id'], sorted(f.get('sourceIds') or [])] for f in features]
    review = [[f['id'], bool(f.get('reviewed')), f.get('accuracyMeters')] for f in features]
    if review_overlay:
        # Only decisions about this hole's features enter its hash: an overlay
        # that says nothing about a hole leaves that hole alone.
        ids = {f['id'] for f in features}
        decisions = [[d.get('featureId'), d.get('action'), digest(d)] for d in review_overlay.get('decisions', []) if d.get('featureId') in ids]
        if decisions:
            review.append(decisions)
    zones = sorted(hole_zones(context, hole_key), key=lambda z: z['id'])
    context_rows = [[z['id'], z.get('class'), z.get('geometryWgs84'), z.get('fidelity'), z.get('attributes')] for z in zones]
    frame = {'originWgs84': package.get('originWgs84'), 'projection': package.get('projection')}
    golf_hash = digest({'frame': frame, 'golf': golf, 'route': hole.get('routeFeatureId'), 'green': hole.get('greenFeatureId'), 'target': hole.get('nominalTargetWgs84')})
    canopy_hash = digest(canopy)
    context_hash = digest(context_rows)
    review_hash = digest(review)
    terrain_input = digest({'golf': golf_hash, 'canopy': canopy_hash, 'context': context_hash})
    display_input = digest({'terrain': terrain_input, 'par': hole.get('par'), 'yards': hole.get('scorecardYards'),
                            'completeness': hole.get('completeness'), 'review': review_hash})
    return {
        'holeSourceHash': digest(source),
        'holeGolfGeometryHash': golf_hash,
        'holeCanopyHash': canopy_hash,
        'holeContextHash': context_hash,
        'holeReviewHash': review_hash,
        'holeTerrainInputHash': terrain_input,
        'holeDisplayInputHash': display_input,
    }


def package_subhashes(package, context=None, review_overlay=None):
    return {hole['key']: hole_subhashes(package, hole, context, review_overlay) for hole in package.get('holes', [])}


def terrain_source_identity(manifest):
    """What makes a terrain source the same source: the retained files and
    the request bounds. The compiler's own `sourceManifestHash` also covers
    the list of package hashes the raster has served, which changes with
    every package revision although not one height did."""
    if not manifest:
        return None
    return digest({
        'fileHashes': manifest.get('fileHashes'),
        'bounds': manifest.get('requestedLocalBoundsM'),
        'crs': manifest.get('horizontalExportCrs'),
        # A visual-only terrain source must never share a cache identity with
        # a measurable source, even when the acquired files happen to match.
        # Keep this byte-for-byte aligned with compile-course-terrain.py.
        'renderingOnly': bool(manifest.get('renderingOnly')),
        'sourceNativeResolutionM': manifest.get('sourceNativeResolutionM'),
    })
