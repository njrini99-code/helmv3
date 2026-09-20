"""Imagery currency (Factory v2 §21.5, v2-next §20): the catalog's
knownRenovationAfter against the capture dates the retained imagery
evidence states. Imagery captured before a known renovation is a freshness
failure for the changed-surface review, never a silent acceptance."""
import os
import re

CODE = 'IMAGERY_TOO_OLD_FOR_KNOWN_RENOVATION'
DATE = re.compile(r'^(\d{4})-?(\d{2})-?(\d{2})$')


def iso_date(value):
    """NAIP tile names end in YYYYMMDD; the catalog writes YYYY-MM-DD."""
    match = DATE.match(str(value or '').strip())
    return '-'.join(match.groups()) if match else None


def capture_dates(ctx, layout_id):
    """Every capture date the retained imagery evidence states: the NAIP
    manifest when the raster is kept, and the canopy and imagery reviews,
    which are all the checked-in fixtures keep for Upper."""
    naip = ctx.naip_dir(layout_id)
    docs = [ctx.json(os.path.join(naip, 'manifest.json')) if naip else None,
            ctx.json(ctx.canopy_path(layout_id)),
            (ctx.json(ctx.imagery_review_path(layout_id)) or {}).get('imagery')]
    dates = set()
    for doc in docs:
        for value in (doc or {}).get('captureDates') or (doc or {}).get('capturedAt') or []:
            iso = iso_date(value)
            if iso:
                dates.add(iso)
    return sorted(dates)


def renovation_after(ctx, layout_id):
    """The layout's date wins over the facility's."""
    layout = ctx.layout(layout_id) or {}
    facility = ctx.facility(layout.get('facilityId')) or {}
    return layout.get('knownRenovationAfter') or facility.get('knownRenovationAfter')


def currency(ctx, layout_id):
    """None when the catalog states no renovation. Otherwise the comparison;
    `predatesRenovation` is None until imagery is retained, and True when
    any tile in the export was flown before the renovation, since one old
    quarter-quad is enough to put pre-renovation ground under the review."""
    after = renovation_after(ctx, layout_id)
    if not after:
        return None
    dates = capture_dates(ctx, layout_id)
    predates = (dates[0] < after) if dates else None
    return {'knownRenovationAfter': after, 'capturedAt': dates, 'earliestCapture': dates[0] if dates else None,
            'latestCapture': dates[-1] if dates else None, 'predatesRenovation': predates, 'code': CODE if predates else None}


def stale(ctx, layout_id):
    """The currency record when the imagery predates the renovation, else None."""
    record = currency(ctx, layout_id)
    return record if record and record['predatesRenovation'] else None
