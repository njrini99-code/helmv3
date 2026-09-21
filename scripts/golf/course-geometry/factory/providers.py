"""Declared source-provider capabilities used by the course factory.

Provider policy is ordered by the facility card.  A provider becomes eligible
only when this module has an acquisition adapter that preserves the standard
immutable terrain-manifest contract.  Selection records the adapter actually
used; it never silently falls back to a different source family.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class TerrainProvider:
    policy_id: str
    compiler_id: str
    display_name: str


# `usgs_s1m` remains deliberately absent: the S1M research spike is evidence
# discovery, not yet an acquisition adapter.  Facilities may name it first
# and fall through explicitly to 3DEP when their policy permits that.
TERRAIN_PROVIDERS = {
    'usgs_3dep_project_1m': TerrainProvider(
        'usgs_3dep_project_1m', 'usgs_3dep_project_1m', 'USGS 3DEP project 1 m'),
    'nc_onemap_dem03': TerrainProvider(
        'nc_onemap_dem03', 'nc_onemap_dem03', 'NC OneMap DEM03'),
    'charleston_county_dem_2025': TerrainProvider(
        'charleston_county_dem_2025', 'charleston_county_dem_2025', 'Charleston County LiDAR DEM 2025'),
}


def select_terrain_provider(policy_ids):
    """Return the first policy-listed provider with a production adapter.

    The caller must surface an empty result as TERRAIN_ADAPTER_MISSING.  It is
    intentionally not a geographic coverage decision: each adapter validates
    its own source response and can still block a particular facility.
    """
    for policy_id in policy_ids or ():
        provider = TERRAIN_PROVIDERS.get(policy_id)
        if provider:
            return provider
    return None


def supported_terrain_provider_ids():
    return tuple(TERRAIN_PROVIDERS)
