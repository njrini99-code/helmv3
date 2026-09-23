"""Byte-verified visual reuse; physical admission is always recomputed."""
import hashlib
import json
from pathlib import Path


def file_hash(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def render_identity(world, raster_hash, compiler_hash, blender_version):
    """Exactly the metric/display inputs consumed by generate_hole.py.

    A reviewer changing authority cannot change pixels. Geometry, renderer,
    raster and tool changes invalidate reuse. The full canonical world and
    its provenance remain separately hashed in every newly generated record.
    """
    terrain = world['terrainField']
    inputs = {
        'kind': 'golfhelm-render-input-v1',
        'coordinateSystem': world['coordinateSystem'],
        'grid': terrain['grid'],
        'terrainTruthClass': terrain.get('truthClass'),
        'sourceRasterHash': terrain['source']['rasterSha256'],
        'actualRasterHash': raster_hash,
        'surfaces': [{key: feature[key] for key in ('id', 'kind', 'truthClass', 'geometryMeters', 'renderGeometryMeters', 'renderClip')
                      if key in feature} for feature in world['semanticSurfaces']],
        'compilerHash': compiler_hash,
        'blenderVersion': blender_version,
    }
    return hashlib.sha256(json.dumps(inputs, sort_keys=True, separators=(',', ':'),
                                     ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def reusable(receipt_path, identity, glb, preview, export_report):
    try:
        receipt = json.loads(Path(receipt_path).read_text())
        if receipt.get('kind') != 'golfhelm-render-receipt-v1' or receipt.get('renderIdentity') != identity:
            return False
        return all(Path(path).is_file() and receipt.get(key) == file_hash(path)
                   for key, path in [('glbSha256', glb), ('previewSha256', preview), ('exportReportSha256', export_report)])
    except (OSError, ValueError, TypeError, AttributeError):
        return False


def write_receipt(path, identity, world_hash, glb, preview, export_report):
    receipt = {
        'kind': 'golfhelm-render-receipt-v1', 'renderIdentity': identity,
        'generatedFromWorldHash': world_hash,
        'glbSha256': file_hash(glb), 'previewSha256': file_hash(preview),
        'exportReportSha256': file_hash(export_report),
        'authority': 'visual_reuse_only; current physical admission and round-trip validation are independent',
    }
    Path(path).write_text(json.dumps(receipt, indent=2) + '\n')
