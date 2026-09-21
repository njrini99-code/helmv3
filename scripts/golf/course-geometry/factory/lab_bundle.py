"""Immutable, local-only review bundles. No approval or catalog mutation.

The manifest references byte-addressed objects under one configured factory
output root. It is safe to rebuild the mutable factory outputs afterwards:
retained bundles keep their exact package, mesh and admission evidence.
"""
import argparse
import gzip
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path

from .fingerprints import content_hash_matches

SAFE_KEY = re.compile(r'[a-z0-9][a-z0-9-]{0,127}\Z')
MAX_FILE = 32 * 1024 * 1024
MAX_JSON = 8 * 1024 * 1024


def _bytes(doc):
    return (json.dumps(doc, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False) + '\n').encode()


def checked_path(root, path):
    """Reject traversal, symlinks (including ancestors), and non-files."""
    root, path = Path(root).absolute(), Path(path).absolute()
    try:
        parts = path.relative_to(root).parts
    except ValueError as exc:
        raise ValueError('asset outside configured factory output root') from exc
    if any(part in ('.', '..') for part in parts):
        raise ValueError('asset traversal is forbidden')
    current = root
    for part in ('', *parts):
        current = current / part
        if current.is_symlink():
            raise ValueError('symlink assets are forbidden')
    if not path.is_file() or not path.resolve().is_relative_to(root.resolve()):
        raise ValueError('asset missing or outside configured output root')
    return path


def read_checked(root, path, maximum=MAX_FILE):
    path = checked_path(root, path)
    if path.stat().st_size > maximum:
        raise ValueError('asset exceeds local lab byte budget')
    with open(path, 'rb') as handle:
        data = handle.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError('asset exceeds local lab byte budget')
    return data


def _immutable_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.is_symlink() or path.read_bytes() != data:
            raise ValueError(f'immutable object collision: {path.name}')
        return
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        temp = Path(handle.name)
        handle.write(data)
    try:
        # A link is create-if-absent, unlike replace(), which can overwrite a
        # concurrent export. Never link mutable source artifacts themselves.
        try:
            os.link(temp, path)
        except FileExistsError:
            if path.is_symlink() or path.read_bytes() != data:
                raise ValueError('immutable object collision') from None
        os.chmod(path, 0o444)
    finally:
        temp.unlink(missing_ok=True)


def export_bundle(output_root, layout_id, hole_keys=None):
    if not SAFE_KEY.fullmatch(layout_id):
        raise ValueError('invalid layout ID')
    root = Path(output_root).absolute()
    if root.is_symlink() or root.resolve() != root:
        raise ValueError('output root must be a real path, not a symlink')
    folder = root / 'layouts' / layout_id
    objects = root / 'lab' / 'objects'
    # Resolve output ancestors before writing, including pre-existing lab dirs.
    for path in (root / 'lab', objects, root / 'lab' / 'bundles', root / 'lab' / 'bundles' / layout_id):
        if path.is_symlink():
            raise ValueError('symlink output directories are forbidden')

    def retain(path, media_type, maximum=MAX_JSON):
        data = read_checked(root, path, maximum)
        sha = hashlib.sha256(data).hexdigest()
        _immutable_write(objects / sha, data)
        return {'sha256': sha, 'bytes': len(data), 'mediaType': media_type,
                'sourceRelativePath': str(Path(path).relative_to(root))}, data

    package_ref, package_bytes = retain(folder / 'package' / 'normalized.json', 'application/json')
    package = json.loads(package_bytes)
    if not content_hash_matches(package):
        raise ValueError('package contentHash mismatch')
    package_hash = package['contentHash']
    context = folder / 'context' / f'{layout_id}-context.json'
    context_ref = None
    if context.exists():
        context_ref, data = retain(context, 'application/json')
        context_doc = json.loads(data)
        if context_doc.get('packageHash') != package_hash or not content_hash_matches(context_doc):
            raise ValueError('context does not match package')
    compiled = folder / 'compiled-bound' if (folder / 'compiled-bound' / 'asset-manifest.json').is_file() else folder / 'compiled-base'
    assets = json.loads(read_checked(root, compiled / 'asset-manifest.json', MAX_JSON))
    if assets.get('geometryHash') != package_hash:
        raise ValueError('compiled manifest does not match package')
    selected = set(hole_keys or [hole['key'] for hole in package['holes']])
    known = {hole['key'] for hole in package['holes']}
    if not selected or not selected <= known:
        raise ValueError('unknown hole key; no fallback is allowed')
    holes = []
    for hole in package['holes']:
        key = hole['key']
        if key not in selected:
            continue
        if not SAFE_KEY.fullmatch(key):
            raise ValueError('invalid physical hole key')
        entry = assets.get('holes', {}).get(key)
        if not entry:
            raise ValueError(f'missing compiled hole: {key}')
        name = entry.get('fileName', '')
        if Path(name).name != name:
            raise ValueError('compiled asset filename must be a basename')
        terrain_ref, compressed = retain(compiled / name, 'application/gzip')
        if terrain_ref['sha256'] != entry.get('sha256') or len(compressed) != entry.get('compressedBytes'):
            raise ValueError('compiled terrain byte hash mismatch')
        if not isinstance(entry.get('uncompressedBytes'), int) or not 0 < entry['uncompressedBytes'] <= MAX_JSON:
            raise ValueError('terrain decoded byte budget exceeded')
        import io
        with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as stream:
            decoded = stream.read(MAX_JSON + 1)
        if len(decoded) != entry['uncompressedBytes'] or hashlib.sha256(decoded).hexdigest() != entry.get('uncompressedSha256'):
            raise ValueError('decoded terrain hash mismatch')
        mesh = json.loads(decoded)
        if (mesh.get('geometryHash') != package_hash or mesh.get('physicalHoleKey') != key
                or mesh.get('contentHash') != entry.get('contentHash') or not content_hash_matches(mesh)):
            raise ValueError('terrain identity mismatch')
        record_path = folder / 'world' / 'holes' / key / 'record.json'
        record = json.loads(read_checked(root, record_path, MAX_JSON)) if record_path.exists() else None
        glb_ref = None
        world_status = 'available' if record else 'not_built'
        if record and (record.get('packageHash') != package_hash or record.get('key') != key):
            # A stale optional Blender artifact cannot hide a valid terrain
            # candidate, and cannot be silently relabelled as the new world.
            world_status, record = 'different_package', None
        if record:
            glb_name = record.get('glb')
            if glb_name:
                if Path(glb_name).name != glb_name:
                    raise ValueError('invalid GLB basename')
                glb_ref, _ = retain(record_path.parent / 'rendering' / glb_name, 'model/gltf-binary', MAX_FILE)
                if glb_ref['sha256'] != record.get('glbSha256'):
                    raise ValueError('GLB byte hash mismatch')
        holes.append({'key': key, 'ordinal': hole['ordinal'], 'terrain': terrain_ref,
                      'meshHash': mesh['contentHash'], 'decodedSha256': entry['uncompressedSha256'],
                      'decodedBytes': entry['uncompressedBytes'], 'glb': glb_ref,
                      'worldRecordStatus': world_status, 'physicalWorldHash': (record or {}).get('physicalWorldHash'),
                      'truthGatePassed': (record or {}).get('truthGatePassed') is True})
    admission_path = folder / 'capability-report.json'
    admission = {'status': 'unassessed', 'version': None, 'report': None}
    if admission_path.exists():
        ref, data = retain(admission_path, 'application/json')
        doc = json.loads(data)
        if doc.get('layoutId') != layout_id or doc.get('packageHash') != package_hash:
            raise ValueError('admission evidence does not match package')
        admission = {'status': 'retained-report', 'version': doc.get('admissionVersion'), 'report': ref}
    manifest = {'schema': 'golfhelm-factory-lab-bundle-v1', 'layoutId': layout_id,
                'packageHash': package_hash, 'package': package_ref, 'context': context_ref,
                'admission': admission, 'holes': holes, 'purpose': 'local-review-only',
                'measurementAuthority': False}
    data = _bytes(manifest)
    bundle_hash = hashlib.sha256(data).hexdigest()
    path = root / 'lab' / 'bundles' / layout_id / f'{bundle_hash}.json'
    _immutable_write(path, data)
    return {'layoutId': layout_id, 'bundleHash': bundle_hash, 'manifest': str(path),
            'url': f'http://127.0.0.1:8774/?layout={layout_id}&bundle={bundle_hash}&hole={holes[0]["key"]}',
            'holeCount': len(holes), 'packageHash': package_hash, 'admission': admission['status']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, help='Existing factory output root; no external files may be imported')
    parser.add_argument('--layout', required=True)
    parser.add_argument('--hole', action='append', help='Explicit physical hole key; omit to include every hole')
    args = parser.parse_args()
    print(json.dumps(export_bundle(args.output, args.layout, args.hole), indent=2))


if __name__ == '__main__':
    main()
