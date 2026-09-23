"""Declared terrain-source contracts used by the course factory.

Provider policy is ordered by the facility card.  A provider becomes eligible
only when this module has an acquisition adapter that preserves the standard
immutable terrain-manifest contract.  Selection records the adapter actually
used; it never silently falls back to a different source family.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class TerrainProvider:
    policy_id: str
    compiler_id: str
    display_name: str
    # A provider contract is intentionally more specific than a display name.
    # It participates in the factory's implementation fingerprint so a change
    # to native resolution, frame, or vertical-evidence requirements cannot
    # silently reuse a terrain result made under an older assumption.
    # Defaults retain compatibility with narrowly scoped test doubles and
    # external callers that only model adapter selection. Registered providers
    # below must always state the full physical contract.
    source_contract: str = 'unversioned-test-contract'
    native_resolution_m: Optional[float] = None
    horizontal_crs: Optional[str] = None
    requires_verified_vertical_reference: bool = True


# `usgs_s1m` remains deliberately absent: the S1M research spike is evidence
# discovery, not yet an acquisition adapter.  Facilities may name it first
# and fall through explicitly to 3DEP when their policy permits that.
TERRAIN_PROVIDERS = {
    'usgs_3dep_project_1m': TerrainProvider(
        'usgs_3dep_project_1m', 'usgs_3dep_project_1m', 'USGS 3DEP project 1 m',
        'usgs-3dep-native-grid-v1', 1.0, None, True),
    'nc_onemap_dem03': TerrainProvider(
        'nc_onemap_dem03', 'nc_onemap_dem03', 'NC OneMap DEM03',
        'nc-dem03-native-frame-v2', 3.125 * 0.3048006096012192, 'EPSG:6543', True),
    'charleston_county_dem_2025': TerrainProvider(
        'charleston_county_dem_2025', 'charleston_county_dem_2025', 'Charleston County LiDAR DEM 2025',
        'charleston-county-dem-2025-v1', 2.0 * 0.3048, 'EPSG:6570', True),
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


def terrain_provider_contract(provider):
    """Stable, serialisable terrain contract for a selected provider.

    A facility policy itself is evidence: its order decides the selected
    adapter.  Do not turn an unimplemented source into an implicit fallback.
    Callers can hash this value with their acquisition inputs without pulling
    timestamps or mutable remote metadata into cache identity.
    """
    if provider is None:
        return None
    return {
        'policyId': provider.policy_id,
        'compilerId': provider.compiler_id,
        'sourceContract': provider.source_contract,
        'nativeResolutionM': provider.native_resolution_m,
        'horizontalCrs': provider.horizontal_crs,
        'requiresVerifiedVerticalReference': provider.requires_verified_vertical_reference,
    }


def terrain_provider_policy_contract(policy_ids):
    """Record ordered policy intent plus the currently selected contract.

    Unknown IDs are retained as ``None`` rather than discarded.  That makes a
    policy edit visible to the plan and prevents an adapter registry update
    from changing acquisition selection behind an unchanged fingerprint.
    """
    ordered = tuple(policy_ids or ())
    selected = select_terrain_provider(ordered)
    return {
        'orderedPolicyIds': ordered,
        'selected': terrain_provider_contract(selected),
        'declaredContracts': tuple(
            (policy_id, TERRAIN_PROVIDERS[policy_id].source_contract if policy_id in TERRAIN_PROVIDERS else None)
            for policy_id in ordered
        ),
    }
