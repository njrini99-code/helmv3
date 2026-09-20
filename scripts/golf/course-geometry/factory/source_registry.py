"""Authoritative public imagery-source policy for the course factory.

This registry is deliberately more conservative than an image-search list.
An entry can be used for feature extraction only when its role says so and a
run has retained the metadata, request and resulting georeferenced raster.
Entries marked visual_review_only or discovery_only may improve human review,
but cannot silently become geometry evidence.
"""
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class ImageryProvider:
    id: str
    name: str
    service_url: str
    service_type: str
    role: str
    expected_gsd_m: float | None
    expected_bands: tuple[str, ...]
    licensing: str
    notes: str


# Source capabilities are facts about the services, not a promise that a
# particular course lies in a current tile. preflight-imagery-sources.py
# records the live service metadata and has to pass before an adapter imports a
# raster.
IMAGERY_PROVIDERS = {
    'nc_onemap_2024_2027_analysis': ImageryProvider(
        'nc_onemap_2024_2027_analysis',
        'NC OneMap 2024–2027 analysis orthoimagery',
        'https://services.nconemap.gov/secure/rest/services/Imagery/Orthoimagery_20242027_analysis/ImageServer',
        'arcgis_image_server',
        'feature_extraction',
        0.1524003048,
        ('red', 'green', 'blue', 'nir'),
        'Review NC OneMap terms before redistribution; retain NC OneMap attribution.',
        'Lossless 4-band analysis imagery. Query the selected raster item for date and native pixel size.',
    ),
    'nc_onemap_2020_2023_analysis': ImageryProvider(
        'nc_onemap_2020_2023_analysis',
        'NC OneMap 2020–2023 four-band analysis orthoimagery',
        'https://services.nconemap.gov/secure/rest/services/Imagery/Orthoimagery_2020_2023_4band_analysis/ImageServer',
        'arcgis_image_server',
        'feature_extraction',
        0.1524003048,
        ('red', 'green', 'blue', 'nir'),
        'Review NC OneMap terms before redistribution; retain NC OneMap attribution.',
        'Historical fallback only after the 2024–2027 native analysis source fails coverage or quality; retain tile-level selection and rejection evidence.',
    ),
    'vgin_vbmp_most_recent': ImageryProvider(
        'vgin_vbmp_most_recent',
        'Virginia Base Mapping Program most-recent imagery',
        'https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VBMP_Imagery/MostRecentImagery_WGS/MapServer',
        'arcgis_map_server',
        'visual_review_only',
        None,
        ('red', 'green', 'blue'),
        'VGIN service terms and the selected tile’s vintage/GSD govern use.',
        'Use to inspect current geometry and capture provenance. A MapServer preview is not an analysis raster until an export contract is verified.',
    ),
    'palm_beach_2025_visual_qa': ImageryProvider(
        'palm_beach_2025_visual_qa',
        'Palm Beach County 2025 aerial photography',
        'https://gis.pbcgov.org/image/rest/services/Aerialphotography_2025_Webmercator/ImageServer',
        'arcgis_image_server',
        'visual_review_only',
        None,
        ('red', 'green', 'blue'),
        'Public county service; retain county attribution. Confirm derivative-use terms before geometry extraction or redistribution.',
        'Verified RGB export. The 0.1524003048-m service pixel is in Web Mercator, not verified native ground GSD. '
        'Service year is 2025; exact flight date remains unconfirmed. No NIR is exposed. '
        'Facility-scoped source for PGA National, not a statewide Florida default.',
    ),
    'licking_county_2023_visual_qa': ImageryProvider(
        'licking_county_2023_visual_qa',
        'Licking County 2023 orthoimagery',
        'https://gis.lickingcounty.gov/server/rest/services/Imagery/Imagery2023/MapServer',
        'arcgis_map_server',
        'visual_review_only',
        0.0762,
        ('red', 'green', 'blue'),
        'No automated derivative/export use until Licking County grants it in writing.',
        '3-inch imagery is valuable for QA at Denison, but the public service is not an automatic source-geometry license.',
    ),
    'ohio_osip3_3in_geotiff': ImageryProvider(
        'ohio_osip3_3in_geotiff',
        'Ohio OSIP enhanced three-inch original GeoTIFF tiles',
        'https://maps.ohio.gov/arcgis/rest/services/OSIP3Downloads/MapServer/4',
        'arcgis_tile_download_index',
        'visual_review_only',
        0.0762001524,
        ('red', 'green', 'blue', 'unclassified'),
        'Selected LIC_2023 tile XML declares public domain; credit Licking County and Ohio Statewide Imagery Program. '
        'For planning, not legal/cadastral purposes. Validate each selected project metadata.',
        'Query TILE/FOLDER/CollYear by AOI, then retrieve the bounded ZIP from the state 3INGEOTIFF/_ENHANCED archive. '
        'Denison sample BS19660755 decodes as 5000x5000, 0.25 US-survey-foot pixels, four bands. '
        'The fourth band is retained but has no decoded spectral label; do not assume NIR. '
        'A native tile acquisition adapter and registration/feature review remain required before geometry use.',
    ),
    'sc_statewide_aerial_discovery': ImageryProvider(
        'sc_statewide_aerial_discovery',
        'South Carolina statewide aerial imagery program',
        'https://rfa.sc.gov/programs-services/geodetic/statewide-aerial-imagery',
        'landing_page',
        'discovery_only',
        0.1524,
        ('red', 'green', 'blue', 'nir'),
        'Resolve and review the actual public service and terms before import.',
        'Program documentation identifies 6-inch, four-band imagery; this landing page is not a reproducible raster endpoint.',
    ),
    'usgs_naip_plus': ImageryProvider(
        'usgs_naip_plus',
        'USGS NAIP Plus / High Resolution Orthoimagery',
        'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer',
        'arcgis_image_server',
        'feature_extraction',
        None,
        ('red', 'green', 'blue', 'nir'),
        'US public-domain imagery; retain USGS/USDA attribution and selected item metadata.',
        'National fallback. Actual selected raster GSD, bands, date, CRS and item ID are acquired per course.',
    ),
}

REGION_IMAGERY_POLICY = {
    'NC': ('nc_onemap_2024_2027_analysis', 'usgs_naip_plus'),
    'VA': ('vgin_vbmp_most_recent', 'usgs_naip_plus'),
    'OH': ('licking_county_2023_visual_qa', 'usgs_naip_plus'),
    'SC': ('sc_statewide_aerial_discovery', 'usgs_naip_plus'),
    'GA': ('usgs_naip_plus',),
}


def imagery_policy(region: str) -> list[str]:
    """Return ordered policy IDs, ending in a reusable public fallback."""
    return list(REGION_IMAGERY_POLICY.get((region or '').upper(), ('usgs_naip_plus',)))


def provider_document(provider_id: str) -> dict:
    provider = IMAGERY_PROVIDERS[provider_id]
    doc = asdict(provider)
    doc['expected_bands'] = list(provider.expected_bands)
    return doc


def providers_for_region(region: str) -> list[dict]:
    return [provider_document(provider_id) for provider_id in imagery_policy(region)]


def native_ortho_review_contract(index: dict, source_items: dict, *, index_sha256: str | None = None) -> dict:
    """State whether retained native pixels may drive *review* candidates.

    The raster itself is a measured source. Any feature proposed from it is a
    derived, unreviewed observation until the canonical review workflow accepts
    it. Keeping this contract here makes it impossible for an imagery script to
    confuse high-resolution pixels with physical measurement authority.
    """
    tile_keys = {tile.get('key') for tile in index.get('tiles') or [] if tile.get('key')}
    quality = index.get('qualitySummary') or {}
    index_complete = (
        index.get('schema') == 'golfhelm-facility-native-ortho-index-v2'
        and index.get('complete') is True
        and bool(tile_keys)
        and quality.get('passedTiles') == index.get('tileCountPlanned') == len(tile_keys)
        and not quality.get('failedTileKeys')
    )
    item_tiles = {tile.get('tileKey') for tile in source_items.get('tiles') or [] if tile.get('tileKey')}
    bound_items = (
        source_items.get('schema') == 'golfhelm-nc-ortho-source-items-v1'
        and source_items.get('complete') is True
        and bool(index_sha256)
        and source_items.get('inputIndexSha256') == index_sha256
        and tile_keys == item_tiles
        and all(tile.get('status') == 'one_native_resolution_catalog_item' for tile in source_items.get('tiles') or [])
    )
    can_create = index_complete and bound_items
    if not index_complete:
        reason = 'A complete native RGB+NIR index is required before review candidate creation.'
    elif not source_items.get('complete'):
        reason = 'A complete source item sidecar is required before review candidate creation.'
    elif not index_sha256 or source_items.get('inputIndexSha256') != index_sha256:
        reason = 'The source item sidecar does not bind to this exact native imagery index.'
    elif not bound_items:
        reason = 'A complete source item sidecar is required before review candidate creation.'
    else:
        reason = 'Native source pixels are sufficient for derived review candidates only.'
    return {
        'canCreateReviewCandidates': can_create,
        'canMeasurePhysicalGeometry': False,
        'sourceTruthClass': 'measured',
        'candidateGeometryTruthClass': 'derived',
        'reviewRequired': True,
        'reason': reason,
    }
