import os

from ..fingerprints import digest, file_sha256_or_none
from ..model import ArtifactRef, Blocker, Evaluation

SCRIPTS = 'scripts/golf/course-geometry'


def script(name):
    return f'{SCRIPTS}/{name}'


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
