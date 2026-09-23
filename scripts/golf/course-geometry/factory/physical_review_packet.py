"""Build deterministic, pending physical-review packets from retained artifacts.

This module is deliberately a *reader* of catalog and factory output.  It
does not normalize, compile, copy, or modify geographic geometry.  A packet
binds a review to the bytes it describes, but it is never an approval record
and cannot grant a runtime capability.
"""
import hashlib
import json
import re
from pathlib import Path

from .fingerprints import content_hash_matches


SCHEMA = 'golfhelm-physical-review-packet-v1'
SAFE_KEY = re.compile(r'[a-z0-9][a-z0-9-]{0,127}\Z')
_JSON_LIMIT = 16 * 1024 * 1024


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def _digest(value):
    return hashlib.sha256(_canonical(value).encode('utf-8')).hexdigest()


def _checked(root, relative):
    """Return a regular non-symlink file below ``root`` or fail closed."""
    root = Path(root).absolute()
    path = (root / relative).absolute()
    try:
        parts = path.relative_to(root).parts
    except ValueError as exc:
        raise ValueError('review packet reference escapes its configured root') from exc
    current = root
    if current.is_symlink():
        raise ValueError('review packet root must not be a symlink')
    for part in parts:
        current = current / part
        if current.is_symlink():
            raise ValueError(f'review packet symlink is forbidden: {relative}')
    if not path.is_file():
        raise ValueError(f'review packet artifact is missing: {relative}')
    return path


def _sha256(path):
    value = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def _reference(root, relative, role, required=True):
    """Create a byte-bound path reference without copying the artifact."""
    try:
        path = _checked(root, relative)
    except ValueError:
        if required:
            raise
        return None
    return {
        'relativePath': str(Path(relative)),
        'sha256': _sha256(path),
        'bytes': path.stat().st_size,
        'role': role,
    }


def _json(root, relative, required=True):
    reference = _reference(root, relative, 'json-manifest', required=required)
    if reference is None:
        return None, None
    if reference['bytes'] > _JSON_LIMIT:
        raise ValueError(f'review packet JSON artifact exceeds byte limit: {relative}')
    try:
        return json.loads(_checked(root, relative).read_text(encoding='utf-8')), reference
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f'review packet JSON artifact is unreadable: {relative}') from exc


def _rendering_references(output_root, layout_id, hole_key, record):
    """List retained visual/validation files without treating them as truth.

    Factory world records have stable GLB/preview names, but reports have
    changed names over compiler versions.  Listing direct rendering files
    keeps old output reviewable without inventing expected artifacts.
    """
    base = Path('layouts') / layout_id / 'world' / 'holes' / hole_key / 'rendering'
    directory = Path(output_root).absolute() / base
    if not directory.exists():
        if record.get('glb'):
            raise ValueError(f'{hole_key}: world record declares a missing rendering directory')
        return [], [], []
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError(f'review packet rendering directory is invalid: {base}')
    previews, validations, artifacts = [], [], []
    for entry in sorted(directory.iterdir(), key=lambda item: item.name):
        if entry.is_symlink() or not entry.is_file():
            raise ValueError(f'review packet rendering child is invalid: {entry.name}')
        relative = base / entry.name
        lowered = entry.name.lower()
        role = 'render-artifact'
        if lowered.endswith(('.png', '.jpg', '.jpeg', '.webp')):
            role = 'preview'
            previews.append(_reference(output_root, relative, role))
        elif any(token in lowered for token in ('validation', 'roundtrip', 'export-report', 'render-receipt')):
            role = 'validation'
            validations.append(_reference(output_root, relative, role))
        else:
            artifacts.append(_reference(output_root, relative, role))
    # A record declaring a GLB must bind to that exact byte.  This detects a
    # stale or substituted rendering asset before a reviewer opens it.
    declared = record.get('glb') if isinstance(record, dict) else None
    if declared:
        if Path(declared).name != declared:
            raise ValueError(f'{hole_key}: invalid GLB basename in world record')
        glb = next((item for item in artifacts if item['relativePath'].endswith('/' + declared)), None)
        if glb is None:
            raise ValueError(f'{hole_key}: world record declares a missing GLB')
        if record.get('glbSha256') and record['glbSha256'] != glb['sha256']:
            raise ValueError(f'{hole_key}: GLB hash differs from world record')
    return previews, validations, artifacts


def _compiled_reference(output_root, layout_id):
    for folder in ('compiled-bound', 'compiled-base'):
        relative = Path('layouts') / layout_id / folder / 'asset-manifest.json'
        document, reference = _json(output_root, relative, required=False)
        if document is not None:
            return document, reference
    return None, None


def build_packet(output_root, catalog_root, layout_id):
    """Return a deterministic pending packet for one canonical layout.

    Only layouts with a normalized factory package can receive a physical
    review packet.  This intentionally rejects facility-only scenes: they do
    not have authoritative numbered-hole identities to review.
    """
    if not SAFE_KEY.fullmatch(layout_id):
        raise ValueError('invalid layout ID')
    output_root, catalog_root = Path(output_root).absolute(), Path(catalog_root).absolute()
    layout_doc, layout_ref = _json(catalog_root, Path('layouts') / f'{layout_id}.json')
    if layout_doc.get('layoutId') != layout_id:
        raise ValueError('catalog layout identity does not match requested layout')
    facility_id = layout_doc.get('facilityId')
    if not isinstance(facility_id, str) or not SAFE_KEY.fullmatch(facility_id):
        raise ValueError('catalog layout has no valid facility ID')
    facility_doc, facility_ref = _json(catalog_root, Path('facilities') / f'{facility_id}.json')
    if facility_doc.get('facilityId') != facility_id:
        raise ValueError('catalog facility identity does not match layout')

    package_relative = Path('layouts') / layout_id / 'package' / 'normalized.json'
    package, package_ref = _json(output_root, package_relative)
    if not content_hash_matches(package):
        raise ValueError('normalized package contentHash mismatch')
    package_hash = package['contentHash']
    holes = package.get('holes')
    if not isinstance(holes, list) or not holes:
        raise ValueError('normalized package has no holes')
    keys = set()
    for hole in holes:
        key = hole.get('key') if isinstance(hole, dict) else None
        if not isinstance(key, str) or not SAFE_KEY.fullmatch(key) or key in keys:
            raise ValueError('normalized package hole keys are invalid')
        keys.add(key)

    context_relative = Path('layouts') / layout_id / 'context' / f'{layout_id}-context.json'
    context, context_ref = _json(output_root, context_relative, required=False)
    if context is not None and context.get('packageHash') != package_hash:
        raise ValueError('context artifact does not match normalized package')
    compiled, compiled_ref = _compiled_reference(output_root, layout_id)
    compiled_directory = None
    if compiled_ref is not None:
        compiled_directory = Path(compiled_ref['relativePath']).parent
    if compiled is not None and compiled.get('geometryHash') != package_hash:
        raise ValueError('compiled artifact does not match normalized package')
    capability_relative = Path('layouts') / layout_id / 'capability-report.json'
    capability, capability_ref = _json(output_root, capability_relative, required=False)
    if capability is not None and capability.get('packageHash') != package_hash:
        raise ValueError('capability artifact does not match normalized package')

    packet_holes = []
    for hole in sorted(holes, key=lambda item: (item.get('ordinal'), item.get('key'))):
        key = hole['key']
        record_relative = Path('layouts') / layout_id / 'world' / 'holes' / key / 'record.json'
        record, record_ref = _json(output_root, record_relative, required=False)
        if record is not None:
            if record.get('key') != key or record.get('packageHash') != package_hash:
                raise ValueError(f'{key}: world record identity/package mismatch')
        previews, validations, render_artifacts = _rendering_references(output_root, layout_id, key, record or {})
        mesh_reference = None
        if compiled is not None:
            entry = (compiled.get('holes') or {}).get(key)
            if entry is None:
                raise ValueError(f'{key}: compiled asset manifest omits package hole')
            filename = entry.get('fileName')
            if not isinstance(filename, str) or Path(filename).name != filename:
                raise ValueError(f'{key}: compiled asset filename is invalid')
            mesh_reference = _reference(output_root, compiled_directory / filename, 'compiled-terrain')
            if entry.get('sha256') and mesh_reference['sha256'] != entry['sha256']:
                raise ValueError(f'{key}: compiled terrain hash mismatch')
        capability_hole = (capability.get('perHole') or {}).get(key) if capability else None
        packet_holes.append({
            'holeKey': key,
            'ordinal': hole.get('ordinal'),
            'routeFeatureId': hole.get('routeFeatureId'),
            'greenFeatureId': hole.get('greenFeatureId'),
            'status': 'pending',
            'approval': False,
            'worldRecord': record_ref,
            'compiledTerrain': mesh_reference,
            'previews': previews,
            'validationReferences': validations,
            'renderArtifacts': render_artifacts,
            'capabilityEvidence': {
                'allowedCapabilities': sorted(name for name, value in ((capability_hole or {}).get('capabilities') or {}).items()
                                              if isinstance(value, dict) and value.get('allowed') is True),
                'report': capability_ref,
            },
        })

    inputs = [layout_ref, facility_ref, package_ref]
    for reference in (context_ref, compiled_ref, capability_ref):
        if reference is not None:
            inputs.append(reference)
    packet = {
        'schema': SCHEMA,
        'layoutId': layout_id,
        'facilityId': facility_id,
        'packageHash': package_hash,
        'purpose': 'physical-review-only',
        'review': {
            'status': 'pending',
            'approval': False,
            'approvalRecord': None,
            'capabilitiesGranted': [],
            'limitations': [
                'This packet is an immutable evidence index, not an approval record.',
                'Visual artifacts remain non-authoritative until independent scoped route, terrain, and feature reviews are approved.',
            ],
        },
        'canonicalInputs': inputs,
        'holes': packet_holes,
    }
    packet['contentHash'] = _digest(packet)
    return packet


def write_packet(packet, destination):
    """Create one packet with exclusive create; existing decisions stay intact."""
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    encoded = (_canonical(packet) + '\n').encode('utf-8')
    with destination.open('xb') as stream:
        stream.write(encoded)
    return destination
