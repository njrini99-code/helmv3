import os

from ..fingerprints import digest, file_sha256_or_none
from ..model import ArtifactRef, Blocker, Evaluation

SCRIPTS = 'scripts/golf/course-geometry'


def script(name):
    return f'{SCRIPTS}/{name}'


# Every file whose edit changes what a script produces belongs in its task's
# impl_files, or the edit ships silently under an unchanged fingerprint. The
# compiler loads its projection rule, the local frame and the fetch helpers
# from sibling modules at import time.
CRS_FILES = (script('course_crs.py'),)
# Provider contracts decide which source adapter is permitted, its source
# grid/frame expectations, and whether Z evidence can support measurements.
# Hash the registry with acquisition and compilation tasks: otherwise a
# registry contract edit could leave a cached terrain result looking current.
TERRAIN_PROVIDER_FILES = (script('factory/providers.py'),)
# `compile-course-terrain.py --acquire-only` (the executor every
# `*.terrain.acquire` task runs) returns before triangulating a single face:
# it never reaches `terrain_triangulate.py`. Keep that module out of this
# list so an edit confined to mesh output does not move the acquire tasks'
# fingerprint and force a ~300-450MB DEM re-download; TERRAIN_COMPILE_FILES
# below is for the tasks that actually call the compiler without
# --acquire-only and so do reach it.
TERRAIN_ACQUIRE_FILES = (
    script('compile-course-terrain.py'), script('hole_footprint.py'),
    script('elevation_raster.py'), script('prepare-pilot.py'),
    script('fetch-terrain-pilot.py'),
) + CRS_FILES + TERRAIN_PROVIDER_FILES
TERRAIN_COMPILE_FILES = TERRAIN_ACQUIRE_FILES + (script('terrain_triangulate.py'),)


def artifact(key, path, retention='C'):
    return ArtifactRef(key=key, path=path, retention=retention, sha256=file_sha256_or_none(path) if path and os.path.isfile(path) else None,
                       bytes=os.path.getsize(path) if path and os.path.isfile(path) else None)


def exists(path):
    return bool(path) and os.path.isfile(path)


def evaluation(inputs=None, blockers=(), artifacts=(), adoptable=False, notes=(), output=None):
    return Evaluation(inputs=dict(inputs or {}), blockers=list(blockers), artifacts=list(artifacts), adoptable=adoptable, notes=list(notes), output=output)


def blocked(code, **evidence):
    return Blocker(code, evidence)


def dep_input(ctx, node, dep_id):
    """The output hash of a dependency node, by task id."""
    for key in node.deps:
        if key.split('[', 1)[0] == dep_id:
            return ctx.output_hash(key)
    return None


def fan_in_inputs(ctx, node, dep_id):
    return {key: ctx.output_hash(key) for key in node.deps if key.split('[', 1)[0] == dep_id}


def doc_hash(doc, keys):
    return digest({k: doc.get(k) for k in keys})
