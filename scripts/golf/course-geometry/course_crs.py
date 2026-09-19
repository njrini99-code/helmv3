"""The metric CRS the course scripts project through.

A package lives in a local ENU frame about its `originWgs84`
(`wgs84-local-enu-v1`), which needs no zone. UTM is only the intermediate
metric CRS for raster requests (USGS 3DEP, NAIP exports) and for shapely
work in metres, so it follows the course instead of being pinned to 17N.
Rasters already on disk keep the CRS they were cut in: readers take it from
the export's spatial reference, never from the origin."""

LEGACY_EPSG = 32617  # what every export before zone parameterisation was cut in


def utm_zone(lon):
    return int((lon + 180) // 6) + 1


def utm_epsg(lon, lat):
    """WGS84 / UTM zone for a point: 326xx north of the equator, 327xx south."""
    return (32600 if lat >= 0 else 32700) + utm_zone(lon)


def origin_epsg(doc):
    """The UTM EPSG of a package, card or facility with `originWgs84` [lon, lat]."""
    lon, lat = doc['originWgs84'][:2]
    return utm_epsg(lon, lat)


def export_epsg(export, default=LEGACY_EPSG):
    """The EPSG an ArcGIS image export was cut in, from its extent's spatial
    reference; `default` only for exports retained before it was recorded."""
    reference = ((export or {}).get('extent') or {}).get('spatialReference') or {}
    return int(reference.get('latestWkid') or reference.get('wkid') or default)
