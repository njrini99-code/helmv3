// Generate the iOS app icon: the existing helm ship-in-wheel mark on the brand
// cream (#EDE0C8) — the SAME cream as the splash + launch screen, so icon →
// launch → splash → app read as one continuous brand surface.
//
// Technique: the source icon is the green mark on an OPAQUE WHITE square. We
// composite it onto a cream canvas with a `darken` blend — channel-wise min, so
// white (255) collapses to cream while the darker green mark is preserved exactly
// and its anti-aliased edges blend green→cream (no white halo). Output is fully
// opaque (no alpha) — App Store compliant. 1024×1024.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png';
const STORE_DIR = 'ios/appstore';
const cream = { r: 237, g: 224, b: 200 };
const SIZE = 1024;
const MARK = 800; // mark box ~78% of the box → ~64% of canvas after centering

mkdirSync(STORE_DIR, { recursive: true });

const mark = await sharp(SRC).resize(MARK, MARK, { fit: 'contain', background: cream }).toBuffer();

const icon = await sharp({
  create: { width: SIZE, height: SIZE, channels: 3, background: cream },
})
  .composite([{ input: mark, blend: 'darken', gravity: 'center' }])
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toBuffer();

await sharp(icon).toFile(SRC);
await sharp(icon).toFile(`${STORE_DIR}/AppIcon-1024.png`);

const meta = await sharp(SRC).metadata();
console.log(`icon written: ${meta.width}x${meta.height} hasAlpha=${meta.hasAlpha} channels=${meta.channels}`);
console.log(`app-store marketing copy: ${STORE_DIR}/AppIcon-1024.png`);
