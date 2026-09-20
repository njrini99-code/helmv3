"""Authoritative public imagery-source policy for the course factory.

This registry is deliberately more conservative than an image-search list.
An entry can be used for feature extraction only when its role says so and a
run has retained the metadata, request and resulting georeferenced raster.
Entries marked visual_review_only or discovery_only may improve human review,
but cannot silently become geometry evidence.
"""
from dataclasses import asdict, dataclass
from typing import Optional


@dataclass(frozen=True)
class ImageryProvider:
    id: str
    name: str
    service_url: str
    service_type: str
    role: str
    expected_gsd_m: Optional[float]
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
