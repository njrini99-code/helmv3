/** Deterministic local source trial; same React SVG as the app. */
import React from 'react';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { CourseHoleScene, SCENE_STYLE_VERSION } from '../../../src/components/golf/course-geometry/CourseHoleScene';
import { parseGeometryPackage } from '../../../src/lib/golf/course-geometry/schema';
import { buildHoleScene } from '../../../src/lib/golf/course-geometry/build-scene';

const out = 'output/course-geometry/top-courses';
await fs.mkdir(out, { recursive: true });
const css = await fs.readFile('src/styles/design-tokens.css', 'utf8');
const report = [];
for (const name of ['cacapon', 'winchester', 'bryan-study', 'cardinal-study']) {
  const pkg = parseGeometryPackage(JSON.parse(await fs.readFile(`src/test/fixtures/course-geometry/${name}.json`, 'utf8')));
  const cells = [];
  const cellHeight = 414;
  for (const hole of pkg.holes) {
    const scene = buildHoleScene(pkg, hole.key);
    let svg = renderToStaticMarkup(<CourseHoleScene scene={scene} width={300} height={360} mode="review" view={hole.routeFeatureId ? 'hole' : 'green'} />);
    svg = svg.replace(/var\(--fw-diagram-([\w-]+)\)/g, (_, key: string) => css.match(new RegExp(`--fw-diagram-${key}: (#[a-f0-9]{6})`, 'i'))![1]!);
    await fs.writeFile(`${out}/${hole.key}.svg`, svg);
    const image = await sharp(Buffer.from(svg)).png().toBuffer();
    const index = cells.length / 2;
    const left = (index % 6) * 310, top = Math.floor(index / 6) * cellHeight;
    // QA labels stay outside the physical scene. An unassigned study has no
    // played-hole number or tee claim. Full identifiers remain in the manifest.
    const title = hole.displayLabel ? 'Unassigned green study' : `Hole ${hole.ordinal} · ${hole.scorecardYards ?? '—'} yd`;
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="50"><rect width="300" height="50" fill="#f6f3ed"/><g fill="#292820" font-family="sans-serif"><text x="8" y="18" font-size="13">${title}</text><text x="8" y="36" font-size="10">${pkg.contentHash.slice(0, 12)} · ${SCENE_STYLE_VERSION} · partial</text></g></svg>`);
    cells.push({ input: label, left, top }, { input: image, left, top: top + 50 });
    report.push({ course: name, physicalKey: hole.key, assignedHole: hole.displayLabel ? null : hole.ordinal,
      capability: hole.completeness, geometryHash: pkg.contentHash, style: SCENE_STYLE_VERSION,
      svgHash: createHash('sha256').update(svg).digest('hex'), svgGzipBytes: gzipSync(svg).length });
  }
  await sharp({ create: { width: Math.min(6, pkg.holes.length) * 310, height: Math.ceil(pkg.holes.length / 6) * cellHeight,
    channels: 3, background: '#f6f3ed' } }).composite(cells).png().toFile(`${out}/${name}-contact.png`);
}
await fs.writeFile(`${out}/manifest.json`, JSON.stringify(report, null, 2) + '\n');
console.log(`${report.length} shared-renderer previews`);
