"""One physical terrain source per course, chosen the same way for every
provider: a single project/source, full coverage of the course context, the
provider's native resolution, a verified NAVD88 vertical reference, and (once
everything else ties) the newest acquisition. Every rejected candidate is
recorded with its reason.

This module is deliberately network-free. `select_first_survivor` walks
candidates the caller has already filtered to native resolution and full
coverage, calling the caller's `evaluate` once per candidate in priority
order; `evaluate` does whatever provider-specific work is needed (an
`/info` vertical-reference lookup, a locked export empty-fraction check) and
raises `SourceRejected` to reject a candidate without stopping the walk.
"""
import re

# A four-digit acquisition year embedded in a source title/name, the same
# way USGS 3DEP project tiles and NC county rasters both carry one
# ("VA_NorthernShenandoah_2020_D20", "Durham_2024_QL1_03ft_CountywideRaster").
# Bounded by non-digit neighbours so a resolution token ("03ft") or a
# service suffix ("DEM03") can never look like a year.
ACQUISITION_YEAR = re.compile(r'(?<!\d)(19|20)\d{2}(?!\d)')


def parse_acquisition_year(title):
    """The acquisition year a source title/name declares, or None.

    This never guesses a date from anything but the title itself: a title
    without a year is treated as undated, not as old or new.
    """
    match = ACQUISITION_YEAR.search(str(title or ''))
    return int(match.group(0)) if match else None


def order_by_recency(candidates, title_of, tiebreak_of):
    """Sort candidates newest title-year first; undated candidates last.

    `title_of`/`tiebreak_of` read whatever the caller's candidate shape is.
    `tiebreak_of` only has to be stable and comparable (an object id, for
    example) -- it breaks a same-year tie deterministically, never by
    inventing a quality or recency signal the source doesn't declare.
    """
    def key(candidate):
        year = parse_acquisition_year(title_of(candidate))
        return (0 if year is not None else 1, -(year or 0), tiebreak_of(candidate))
    return sorted(candidates, key=key)


class SourceRejected(Exception):
    """An `evaluate` callback raises this to reject one candidate with a
    reason, without stopping `select_first_survivor`'s walk."""

    def __init__(self, reason, **evidence):
        super().__init__(reason)
        self.reason = reason
        self.evidence = evidence


def select_first_survivor(ordered, evaluate):
    """Walk `ordered` candidates in priority order.

    Returns `(candidate, extra, rejected)`: the first candidate whose
    `evaluate(candidate)` call returns normally (its return value is
    `extra`), and every earlier candidate's rejection reason. If every
    candidate is rejected, `candidate` and `extra` are both None and the
    caller decides what that means (still ambiguous, or physically
    unsupported).
    """
    rejected = []
    for candidate in ordered:
        try:
            extra = evaluate(candidate)
        except SourceRejected as exc:
            rejected.append({'candidate': candidate, 'reason': exc.reason, **exc.evidence})
            continue
        return candidate, extra, rejected
    return None, None, rejected
