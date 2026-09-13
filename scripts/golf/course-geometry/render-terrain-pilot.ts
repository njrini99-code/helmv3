/** Export the real GPU scene's projection/material for vector visibility QA.
 * Run with tsx, then vectorize-terrain.py. No browser/production dependency. */
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildHoleScene } from '../../../src/lib/golf/course-geometry/build-scene';
import { parseGeometryPackage } from '../../../src/lib/golf/course-geometry/schema';
import { fitTerrainCamera, parseTerrainMesh, projectTerrainPoint, TERRAIN_PRESETS, type Point3M } from '../../../src/lib/golf/course-geometry/terrain';
import { terrainColors } from '../../../src/lib/golf/course-geometry/terrain-material';
import { terrainCanopy } from '../../../src/lib/golf/course-geometry/terrain-canopy';
import { TerrainCanopyLayer } from '../../../src/components/golf/course-geometry/TerrainCanopyLayer';
import data from '../../../src/test/fixtures/course-geometry/cacapon.json';
import terrain from '../../../src/test/fixtures/course-geometry/cacapon-07-terrain.json';

const pkg = parseGeometryPackage(data), mesh = parseTerrainMesh(terrain, pkg);
const scene = buildHoleScene(pkg, 'cacapon-07', [], mesh);
const css = fs.readFileSync('src/styles/design-tokens.css', 'utf8');
const hex = (kind: string) => css.match(new RegExp(`--fw-diagram-${kind}: (#[a-f0-9]{6})`, 'i'))![1]!;
const rgb = (kind: string) => [1, 3, 5].map(i => parseInt(hex(kind).slice(i, i + 2), 16) / 255);
const palette = mesh.featureKinds.map(rgb);
const colors = terrainColors(mesh, palette, { surround: rgb('surround'), fringe: rgb('fringe') });
const directory = path.resolve(process.argv[2] ?? 'output/course-geometry/terrain');
fs.mkdirSync(directory, { recursive: true });
for (const [preset, pose] of Object.entries(TERRAIN_PRESETS)) {
  const camera = fitTerrainCamera(scene, mesh, 'hole', 620, 480, pose);
  const triangles = mesh.triangleFeatures.map((feature, i) => ({
    featureId: mesh.featureIds[feature],
    material: mesh.triangleMaterials[i],
    baseColor: hex(mesh.triangleMaterials[i] === 3 ? 'surround' : mesh.triangleMaterials[i] === 4 ? 'fringe' : mesh.featureKinds[feature]!),
    color: `#${Array.from(colors.slice(i * 9, i * 9 + 3)).map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`,
    points: [0, 3, 6].map(offset => projectTerrainPoint(mesh.vertices.slice(i*9 + offset, i*9 + offset + 3) as unknown as Point3M, camera)),
  }));
  const annotations = renderToStaticMarkup(createElement('svg', { xmlns: 'http://www.w3.org/2000/svg' }, createElement(TerrainCanopyLayer, {
    canopy: terrainCanopy(scene, mesh, camera), width: 620, height: 480,
  }))).replace(/^<svg[^>]*>|<\/svg>$/g, '').replace(/var\(--fw-diagram-([\w-]+)\)/g, (_, kind: string) => hex(kind));
  fs.writeFileSync(path.join(directory, `${preset}.json`), JSON.stringify({ width: 620, height: 480, background: hex('ground'),
    geometryHash: scene.packageHash, terrainHash: mesh.contentHash, preset, camera, triangles, annotations }));
}
console.log(JSON.stringify({ triangles: mesh.triangleFeatures.length, terrainBytesGzip: gzipSync(JSON.stringify(terrain)).byteLength, directory }));
