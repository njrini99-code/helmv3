/** Run after render-terrain-pilot, vectorize-terrain and browser export capture. */
import fs from 'node:fs/promises';
import sharp from 'sharp';

const report = [];
for (const preset of ['top', 'terrain', 'side']) {
  const svg = `output/course-geometry/terrain/cacapon-07-${preset}.svg`;
  await sharp(svg).png().toFile(`output/playwright/course-geometry/export-svg-${preset}.png`);
  const a = await sharp(svg).removeAlpha().raw().toBuffer();
  const b = await sharp(`output/playwright/course-geometry/export-gpu-${preset}.png`).removeAlpha().raw().toBuffer();
  if (a.length !== b.length) throw new Error('Export dimensions differ');
  let differing = 0, error = 0;
  for (let i = 0; i < a.length; i += 3) {
    const delta = Math.max(...[0, 1, 2].map(k => Math.abs(a[i + k] - b[i + k])));
    differing += Number(delta > 32); error += delta;
  }
  const pixels = a.length / 3;
  report.push({ preset, pixels, percentOver32: 100 * differing / pixels, meanMaxChannelError: error / pixels });
}
await fs.writeFile('output/course-geometry/terrain/export-comparison.json', JSON.stringify({
  description: 'Chromium GPU vs librsvg, 620x480. Pixel agreement, not geographic accuracy. Allows antialiasing differences; analytic camera/containment tests run separately.',
  acceptance: 'Under 1 percent of pixels differ by more than 32/255 in any RGB channel', comparisons: report,
}, null, 2) + '\n');
if (report.some(r => r.percentOver32 >= 1)) throw new Error('Export parity needs inspection: ' + JSON.stringify(report));
console.log(JSON.stringify(report));
