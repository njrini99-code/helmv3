# Four-course local source trial

September 13, 2026. No production geometry is published by these files.
The owning plan is `docs/plans/2026-09-12-golfhelm-course-geometry.md`, Sections
20–21. `top-course-source-audit.json` beside the fixture packages records native
imagery resolution separately from requested export resolution and accuracy.

`top-course-osm/` contains immutable gzip-compressed OpenStreetMap extracts for
Bryan Park, Cacapon, The Cardinal and Winchester. The discovery manifest retains
source URLs and SHA-256 of the **uncompressed** original response. Attribution:
© OpenStreetMap contributors; ODbL 1.0. Source feature identities and revision
metadata are retained. Source candidates are not accepted course bindings.
[OSM licence](https://www.openstreetmap.org/copyright).

The two terrain directories contain public USGS elevation rasters and catalogue
metadata, with no player events or credentials. Winchester's source is
**USGS 1 Meter 17 x74y434 VA_NorthernShenandoah_2020_D20**, captured November 29,
2020–January 12, 2021, NAVD88. Its 384×512 F32 export is locked to raster 41224.
Cacapon's directory has its own source dossier. Catalogue IDs and transient
export URLs alone are not identities; product URL, original raster and hashes
are retained. [USGS use terms](https://www.usgs.gov/3d-elevation-program/about-3dep-products-services).

NC six-inch and VA twelve-inch **image pixels are not distributed** here.
Morgan County's 2024 image is view-only; native GSD was not established and it
is not a tracing input. No upscaled image is accepted as new measured detail.

Reproduce the local candidates from the cached original vectors:

```sh
python3 scripts/golf/course-geometry/prepare-winchester.py
python3 scripts/golf/course-geometry/prepare-nc-studies.py
npx tsx scripts/golf/course-geometry/prepare-terrain-surfaces.ts \
  src/test/fixtures/course-geometry/sources/winchester-07-terrain \
  src/test/fixtures/course-geometry/winchester.json winchester-07
python3 scripts/golf/course-geometry/prepare-terrain-pilot.py \
  src/test/fixtures/course-geometry/sources/winchester-07-terrain \
  src/test/fixtures/course-geometry/winchester.json winchester-07 \
  src/test/fixtures/course-geometry/winchester-07-terrain.json
npx tsx scripts/golf/course-geometry/render-top-courses.tsx
```

The imagery fetcher performs bounded source review only and caches pixels under
`output/`. The OSM audit retains its cache; use a separately reviewed source
revision to refresh rather than overwriting originals. Prepared data is local
fixture material, not a publication or historical round association.
