/** Use the inline renderer's exact bounded display outlines for terrain too. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseGeometryPackage, localFeature } from '../../../src/lib/golf/course-geometry/schema';
import { displayOutline, DISPLAY_EDGE_LIMIT_M } from '../../../src/lib/golf/course-geometry/display-outline';
import data from '../../../src/test/fixtures/course-geometry/cacapon.json';

const pkg = parseGeometryPackage(process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : data);
const hole = process.argv[4] ? pkg.holes.find(h => h.key === process.argv[4])! : pkg.holes[6]!;
if (!hole) throw new Error('Unknown requested physical hole');
const surfaces = pkg.features.filter(f => hole.featureIds.includes(f.id) && f.kind !== 'route').map(f => {
  const canonical = localFeature(f, pkg);
  return { ...displayOutline(canonical), canonicalParts: canonical.parts };
});
const manifest = { geometryHash: pkg.contentHash, displayRevision: 'bounded-outline-v1',
  maxBoundaryDisplacementM: DISPLAY_EDGE_LIMIT_M, surfaces };
const serialized = JSON.stringify(manifest);
const directory = process.argv[2] ?? 'src/test/fixtures/course-geometry/sources/cacapon-07-terrain';
fs.writeFileSync(path.join(directory, 'display-surfaces.json'), JSON.stringify({ ...manifest,
  contentHash: createHash('sha256').update(serialized).digest('hex') }) + '\n');
