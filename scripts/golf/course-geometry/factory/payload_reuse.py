"""Reuse numerical payloads only across reference-card-only package edits.

The full package remains authoritative and each serialized envelope is rebound
and rehashed. Receipts bind the prior bytes, implementation, sources and ALL
package fields except the two card values and the package's derived hash.
This is an optimization, never an admission record. A missing/changed receipt
runs the ordinary producer.
"""
import copy
import gzip
import hashlib
import json
from pathlib import Path

from .fingerprints import (
    canonical_json,
    content_hash_matches,
    digest,
    file_sha256,
    terrain_source_identity,
)


def physical_payload_hash(package):
    body = copy.deepcopy(package)
    body.pop('contentHash', None)
    for hole in body.get('holes', []):
        hole.pop('par', None)
        hole.pop('scorecardYards', None)
    return digest(body)


def write_json(path, doc):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(canonical_json(doc) + '\n')


def _receipt_path(ctx, layout_id, stage):
    return Path(ctx.layout_out(layout_id)) / 'payload-reuse' / f'{stage}.json'


def stage_identity(ctx, node, package, extra=None):
    return digest({'schema': 'card-independent-payload-v1', 'physicalPackage': physical_payload_hash(package),
                   'implementation': ctx.impl_hash(node.spec), 'settings': node.spec.settings,
                   'terrain': terrain_source_identity(ctx.terrain_source_manifest(node.scope.layout_id)),
                   'extra': extra or {}})


def load_receipt(ctx, layout_id, stage, identity):
    path = _receipt_path(ctx, layout_id, stage)
    if not path.is_file():
        return None
    try:
        doc = json.loads(path.read_text())
        if doc.get('schema') != 'golfhelm-payload-reuse-v1' or doc.get('inputHash') != identity:
            return None
        root = Path(ctx.output_root).resolve()
        for item in doc.get('files', []):
            candidate = root / item['path']
            if (not candidate.resolve().is_relative_to(root) or candidate.is_symlink()
                    or not candidate.is_file() or file_sha256(candidate) != item['sha256']):
                return None
        return doc if doc.get('files') else None
    except (ValueError, KeyError, TypeError, OSError):
        return None


def retain_receipt(ctx, layout_id, stage, identity, package_hash, paths):
    root = Path(ctx.output_root).resolve()
    files = []
    for path in sorted({Path(path).resolve() for path in paths}):
        if not path.is_relative_to(root) or not path.is_file():
            raise ValueError('reusable payload must remain in factory output root')
        files.append({'path': str(path.relative_to(root)), 'sha256': file_sha256(path)})
    target = _receipt_path(ctx, layout_id, stage)
    write_json(target, {'schema': 'golfhelm-payload-reuse-v1', 'inputHash': identity,
                        'packageHash': package_hash, 'files': files})
    return str(target)


def terrain_files(folder):
    return sorted(Path(folder).glob('*.json')) + sorted(Path(folder).glob('*.json.gz'))


def rebind_terrain(folder, package, old_hash, source_manifest):
    """Rebind one verified base payload; vertices/metric samples stay exact."""
    folder = Path(folder)
    assets = json.loads((folder / 'asset-manifest.json').read_text())
    summary = json.loads((folder / 'compilation-report.json').read_text())
    if assets.get('geometryHash') != old_hash or summary.get('packageHash') != old_hash:
        raise ValueError('reusable terrain envelope mismatch')
    if assets.get('sourceIdentity') != terrain_source_identity(source_manifest):
        raise ValueError('reusable terrain source mismatch')
    entries, reports = {}, []
    for hole in package['holes']:
        key = hole['key']
        old_entry = assets.get('holes', {}).get(key)
        if not old_entry or Path(old_entry['fileName']).name != old_entry['fileName']:
            raise ValueError('reusable terrain hole missing')
        mesh = json.loads((folder / f'{key}-terrain.json').read_text())
        report = json.loads((folder / f'{key}-report.json').read_text())
        if (mesh.get('geometryHash') != old_hash or mesh.get('physicalHoleKey') != key
                or not content_hash_matches(mesh) or report.get('contentHash') != mesh['contentHash']
                or old_entry.get('contentHash') != mesh['contentHash']):
            raise ValueError('reusable mesh identity mismatch')
        mesh['geometryHash'] = package['contentHash']
        mesh['contentHash'] = digest({k: v for k, v in mesh.items() if k != 'contentHash'})
        payload = (canonical_json(mesh) + '\n').encode()
        compressed = gzip.compress(payload, mtime=0)
        entry = {**old_entry, 'ordinal': hole['ordinal'], 'compressedBytes': len(compressed), 'uncompressedBytes': len(payload),
                 'sha256': hashlib.sha256(compressed).hexdigest(), 'uncompressedSha256': hashlib.sha256(payload).hexdigest(),
                 'contentHash': mesh['contentHash']}
        (folder / f'{key}-terrain.json').write_bytes(payload)
        (folder / entry['fileName']).write_bytes(compressed)
        report.update({'geometryHash': package['contentHash'], 'contentHash': mesh['contentHash'],
                       'compressedBytes': len(compressed), 'asset': entry})
        write_json(folder / f'{key}-report.json', report)
        entries[key] = entry
        reports.append(report)
    assets.update({'geometryHash': package['contentHash'], 'sourceManifestHash': digest(source_manifest), 'holes': entries})
    summary.update({'packageHash': package['contentHash'], 'sourceManifestHash': digest(source_manifest),
                    'source': source_manifest, 'holes': reports})
    write_json(folder / 'asset-manifest.json', assets)
    write_json(folder / 'compilation-report.json', summary)


def rebind_context(layer_path, report_path, new_hash, old_hash):
    layer = json.loads(Path(layer_path).read_text())
    report = json.loads(Path(report_path).read_text())
    if (layer.get('packageHash') != old_hash or report.get('packageHash') != old_hash
            or not content_hash_matches(layer) or report.get('layerHash') != layer['contentHash']):
        raise ValueError('reusable context envelope mismatch')
    layer['packageHash'] = new_hash
    layer['contentHash'] = digest({k: v for k, v in layer.items() if k != 'contentHash'})
    report.update({'packageHash': new_hash, 'layerHash': layer['contentHash']})
    write_json(layer_path, layer)
    write_json(report_path, report)


def bind_verified_hole(mesh, report, package, hole, producer_fingerprint, context_hash=None):
    """Bind a planner-verified numeric result to the current package envelope.

    Caller MUST first verify the current producer node's artifacts and require
    its cached/success state. This function does not infer compatibility from
    names or proximity. The returned binding records the exact producer input
    fingerprint and old content hash for audit and regression checks.
    """
    if (not producer_fingerprint or not content_hash_matches(mesh)
            or mesh.get('physicalHoleKey') != hole['key']
            or mesh.get('geometryHash') != report.get('geometryHash')
            or mesh.get('contentHash') != report.get('contentHash')):
        raise ValueError('unverified terrain payload cannot be rebound')
    rebound = copy.deepcopy(mesh)
    rebound['geometryHash'] = package['contentHash']
    rebound['contentHash'] = digest({k: v for k, v in rebound.items() if k != 'contentHash'})
    payload = (canonical_json(rebound) + '\n').encode()
    compressed = gzip.compress(payload, mtime=0)
    entry = {'ordinal': hole['ordinal'], 'fileName': f'{hole["key"]}-terrain.json.gz', 'encoding': 'gzip',
             'compressedBytes': len(compressed), 'uncompressedBytes': len(payload),
             'sha256': hashlib.sha256(compressed).hexdigest(), 'uncompressedSha256': hashlib.sha256(payload).hexdigest(),
             'contentHash': rebound['contentHash']}
    rebound_report = {**report, 'geometryHash': package['contentHash'], 'contentHash': rebound['contentHash'],
                      'contextLayerHash': context_hash, 'asset': entry, 'compressedBytes': len(compressed)}
    binding = {'schema': 'golfhelm-terrain-envelope-binding-v1', 'physicalHoleKey': hole['key'],
               'producerFingerprint': producer_fingerprint, 'producerMeshHash': mesh['contentHash'],
               'producerPackageHash': mesh['geometryHash'], 'packageHash': package['contentHash'],
               'meshHash': rebound['contentHash'], 'contextLayerHash': context_hash}
    return payload, compressed, entry, rebound_report, binding


def validated_bound_files(ctx, layout_id):
    """Validate retained delivery envelopes before fresh-ledger adoption."""
    folder = Path(ctx.layout_out(layout_id)) / 'compiled-bound'
    manifest_path = folder / 'asset-manifest.json'
    manifest = json.loads(manifest_path.read_text())
    if manifest.get('geometryHash') != ctx.package_hash(layout_id):
        raise ValueError('bound manifest package mismatch')
    files = [manifest_path]
    for scope_key in ctx.graph.layout_holes.get(layout_id, []):
        hole = ctx.package_hole(layout_id, int(scope_key.rsplit(':', 1)[1]))
        key = hole['key']
        row = ctx.rows.get(f'hole.terrain.compile[{scope_key}]')
        if not row or row.state not in ('cached', 'success'):
            raise ValueError('bound terrain producer unavailable')
        entry = manifest['holes'][key]
        if entry.get('fileName') != f'{key}-terrain.json.gz':
            raise ValueError('bound terrain filename mismatch')
        raw_path, compressed_path = folder / f'{key}-terrain.json', folder / entry['fileName']
        binding_path, report_path = folder / f'{key}-binding.json', folder / f'{key}-report.json'
        if file_sha256(raw_path) != entry.get('uncompressedSha256') or file_sha256(compressed_path) != entry.get('sha256'):
            raise ValueError('bound terrain byte hash mismatch')
        mesh = json.loads(raw_path.read_text())
        binding = json.loads(binding_path.read_text())
        report = json.loads(report_path.read_text())
        if (not content_hash_matches(mesh) or mesh.get('geometryHash') != manifest['geometryHash']
                or mesh.get('physicalHoleKey') != key or mesh.get('contentHash') != entry.get('contentHash')
                or binding.get('meshHash') != mesh['contentHash'] or binding.get('producerFingerprint') != row.fingerprint
                or report.get('contentHash') != mesh['contentHash']):
            raise ValueError('bound terrain evidence mismatch')
        files.extend([raw_path, compressed_path, binding_path, report_path])
    return files
