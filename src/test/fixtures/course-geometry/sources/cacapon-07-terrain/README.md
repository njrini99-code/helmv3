# Cacapon 7 terrain source cache

Read-only USGS 3DEPElevation ImageServer acquisition on September 13, 2026.
This cache contains public elevation data and public catalogue metadata, with
no player events, account identifiers or credentials.

- Product: **USGS 1 Meter 17 x73y438 MD_Western_2021_D21**.
- Captured December 4–21, 2021; NAVD88 orthometric metres.
- [USGS source and use terms](https://www.usgs.gov/3d-elevation-program/about-3dep-products-services).
- `elevation.tiff`: F32, 256×512, bilinear export locked to raster 129279.
- `export.json`: returned georeferencing extent and retrieval date. Its
  provider-generated download URL is temporary; the cached TIFF is authoritative
  for reproducing this fixture.
- `catalog.json`: bounded spatial query with explicit EPSG:4326 point and
  public product metadata. The chosen source title and original product URL
  are retained because catalogue OBJECTIDs can change.

Regenerate locally with the tested dependencies in
`scripts/golf/course-geometry/requirements-terrain.txt` and:

```sh
python3 scripts/golf/course-geometry/prepare-terrain-pilot.py \
  src/test/fixtures/course-geometry/sources/cacapon-07-terrain
```

The compiler uses the returned extent, pixel centres and the same local XY
projection as the existing geometry. The report records the TIFF SHA-256.
Native source resolution is 1m; the exported grid is approximately 1.2m east/
west by 1.6m north/south, and the display mesh uses 8m cells plus boundary
triangles. Neither interpolation nor edge highlighting adds measured detail.

This remains a terrain source candidate. The 2024 imagery is newer; renovation
agreement, registration residuals and course-familiar approval are pending.
No putting-break, bunker-lip or tree-height accuracy is established.
