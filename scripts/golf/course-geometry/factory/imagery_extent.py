"""Acquisition extents are coverage requests, never physical course boundaries."""
import hashlib
import json
import math
from pathlib import Path


def _bounds(value):
    if (not isinstance(value, list) or len(value) != 4
            or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in value)
            or not -180 <= value[0] < value[2] <= 180
            or not -90 <= value[1] < value[3] <= 90):
        raise ValueError('Imagery coverage needs finite ordered WGS84 bounds')
    return value


def acquisition_aoi(aoi, layouts):
    """Include explicit layout envelopes even when the site polygon is smaller.

    The OSM polygon/hash remain unchanged. An acquisition-only envelope cannot
    admit a route or establish ownership of any feature within the crop.
    """
    bounds = list(_bounds(aoi['bboxWgs84']))
    included = []
    for layout in sorted(layouts, key=lambda row: row['layoutId']):
        if layout['facilityId'] != aoi['facilityId'] or not layout.get('bboxWgs84'):
            continue
        other = _bounds(layout['bboxWgs84'])
        included.append({'layoutId': layout['layoutId'], 'bboxWgs84': other})
        bounds = [min(bounds[0], other[0]), min(bounds[1], other[1]),
                  max(bounds[2], other[2]), max(bounds[3], other[3])]
    result = dict(aoi)
    if bounds == aoi['bboxWgs84']:
        return result
    result.update(bboxWgs84=bounds, acquisitionExtent={
        'schema': 'golfhelm-imagery-acquisition-extent-v1',
        'sourceAoiBboxWgs84': aoi['bboxWgs84'], 'layoutEnvelopes': included,
        'canMeasurePhysicalGeometry': False, 'maySupplyHoleAssociation': False,
        'rule': 'Union for image coverage only; original site polygon and source response remain unchanged.',
    })
    return result


def index_for_aoi(folder, aoi):
    folder = Path(folder)
    if not aoi.get('acquisitionExtent'):
        return folder / 'naip-plus-locked-v2' / 'index.json'
    identity = {'facilityId': aoi['facilityId'], 'bboxWgs84': _bounds(aoi['bboxWgs84']),
                'sourceResponseSha256': aoi['responseSha256']}
    key = hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(',', ':')).encode()).hexdigest()[:16]
    return folder / f'naip-plus-locked-v2-{key}' / 'index.json'


def selected_index(folder):
    """An expanded request must not fall back to the old clipped acquisition."""
    folder = Path(folder)
    request = folder / 'imagery-aoi.json'
    if request.is_file():
        return index_for_aoi(folder, json.loads(request.read_text()))
    return folder / 'naip-plus-locked-v2' / 'index.json'
