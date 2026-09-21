"""Fresh bounded fingerprints of every public course asset, including bodies.

Public files are inputs, never task-owned outputs. Their immutable byte
inventory is retained beside the verification report by the executor.
"""
import hashlib
import json
from pathlib import Path

MAX_BYTES = 32 * 1024 * 1024


def public_asset(public_root, url):
    if not isinstance(url, str) or not url.startswith('/') or url.startswith('//') or any(c in url for c in ('?', '#', '\\', '%', '\0')):
        raise ValueError('published asset must be a local public path')
    parts = url[1:].split('/')
    if any(part in ('', '.', '..') for part in parts):
        raise ValueError('published path traversal refused')
    root = Path(public_root).absolute()
    if root.resolve() != root:
        raise ValueError('public root must not be a symlink')
    path = root
    for part in parts:
        path = path / part
        if path.is_symlink():
            raise ValueError('published symlink refused')
    if not path.resolve().is_relative_to(root) or not path.is_file() or path.stat().st_size > MAX_BYTES:
        raise ValueError('published asset missing or exceeds budget')
    data = path.read_bytes()
    if len(data) > MAX_BYTES:
        raise ValueError('published asset exceeds budget')
    return path, data


def publication_snapshot(ctx, layout_id):
    public_root = Path(ctx.repo_root) / 'public'
    manifest_path = ctx.abspath(((ctx.layout(layout_id) or {}).get('geometry') or {}).get('published'))
    result = {'manifestSha256': None, 'assets': [], 'error': None}
    try:
        manifest_url = '/' + str(Path(manifest_path).relative_to(public_root))
        _path, data = public_asset(public_root, manifest_url)
        result['manifestSha256'] = hashlib.sha256(data).hexdigest()
        manifest = json.loads(data)
        urls = [manifest.get('packageUrl'), *sorted((manifest.get('terrainByHole') or {}).values())]
        if manifest.get('contextLayerUrl'):
            urls.append(manifest['contextLayerUrl'])
        for url in urls:
            try:
                _path, body = public_asset(public_root, url)
                result['assets'].append({'url': url, 'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body)})
            except (OSError, ValueError, TypeError) as exc:
                result['assets'].append({'url': url, 'sha256': None, 'error': str(exc)})
    except (OSError, ValueError, TypeError, AttributeError) as exc:
        result['error'] = str(exc)
    return result
