/**
 * composite.js — Image compositing with Sharp
 *
 * Takes a rendered creative (from render.js) and composites it with
 * backgrounds, overlays, logos, and effects to produce the final Instagram image.
 *
 * Usage:
 *   node composite.js <creative.png> [options]
 *
 * Examples:
 *   node composite.js creative.png --bg=backgrounds/bg-grass-1.jpg
 *   node composite.js creative.png --bg=backgrounds/bg-dark-1.jpg --logo=logo.png
 *   node composite.js creative.png --overlay=dark --noise=5
 */

import sharp from 'sharp';
import { readFile, writeFile, access, mkdir } from 'fs/promises';
import { resolve, basename, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

// GolfHelm brand overlays as SVG
const OVERLAYS = {
  // Grass photo overlay — desaturate + darken + green tint
  grass: {
    tint: { r: 22, g: 163, b: 74 },    // brand green
    tintOpacity: 0.08,
    darken: 0.25,
    desaturate: 0.2,
  },
  // Dark aurora overlay
  dark: {
    background: '#0f172a',
    gradient: 'radial-gradient(ellipse at center, rgba(22, 163, 74, 0.15), transparent 70%)',
  },
  // Cream gradient (pure CSS — no photo needed)
  cream: {
    stops: ['#FFFEFA', '#FDF9F0', '#F5F0E6', '#EDE8DD'],
  },
};

/**
 * Generate noise texture as a buffer
 */
async function generateNoise(width, height, opacity = 0.03) {
  // Create random noise using Sharp's raw pixel creation
  const channels = 4; // RGBA
  const pixels = Buffer.alloc(width * height * channels);

  for (let i = 0; i < pixels.length; i += channels) {
    const noise = Math.random() * 255;
    pixels[i] = noise;       // R
    pixels[i + 1] = noise;   // G
    pixels[i + 2] = noise;   // B
    pixels[i + 3] = Math.round(opacity * 255); // A
  }

  return sharp(pixels, {
    raw: { width, height, channels },
  }).png().toBuffer();
}

/**
 * Create a green glow overlay
 */
async function createGlowOverlay(width, height) {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="glow" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="rgb(22, 163, 74)" stop-opacity="0.12"/>
          <stop offset="100%" stop-color="rgb(22, 163, 74)" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#glow)"/>
    </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Create cream gradient background
 */
async function createCreamGradient(width, height) {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cream" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFFEFA"/>
          <stop offset="35%" stop-color="#FDF9F0"/>
          <stop offset="70%" stop-color="#F5F0E6"/>
          <stop offset="100%" stop-color="#EDE8DD"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#cream)"/>
    </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Create dark aurora background
 */
async function createDarkAurora(width, height) {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#020617"/>
        </linearGradient>
        <radialGradient id="aurora" cx="50%" cy="35%" r="50%">
          <stop offset="0%" stop-color="rgb(22, 163, 74)" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="rgb(22, 163, 74)" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#dark)"/>
      <rect width="100%" height="100%" fill="url(#aurora)"/>
    </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Process a background photo with GolfHelm grass treatment
 */
async function processGrassBackground(bgPath, width, height) {
  const config = OVERLAYS.grass;

  return sharp(bgPath)
    .resize(width, height, { fit: 'cover', position: 'center' })
    // Desaturate slightly
    .modulate({ saturation: 1 - config.desaturate })
    // Darken
    .linear(1 - config.darken, 0)
    // Apply green tint via composite
    .composite([{
      input: {
        create: {
          width,
          height,
          channels: 4,
          background: {
            r: config.tint.r,
            g: config.tint.g,
            b: config.tint.b,
            alpha: config.tintOpacity,
          },
        },
      },
      blend: 'over',
    }])
    .png()
    .toBuffer();
}

/**
 * Main composite function
 */
async function composite(creativePath, options = {}) {
  const {
    bgPath = null,
    bgType = 'cream',       // cream | dark | grass (auto if bgPath provided)
    logoPath = null,
    logoPosition = 'top-left',
    logoSize = 120,
    logoPadding = 48,
    noise = 3,               // noise opacity percentage (0-10)
    glow = false,
    outputPath = null,
    width = null,             // auto-detect from creative
    height = null,
  } = options;

  const input = resolve(creativePath);
  const meta = await sharp(input).metadata();
  const w = width || meta.width;
  const h = height || meta.height;

  console.log(`🎨 Compositing: ${basename(input)} (${w}×${h})`);

  const layers = [];

  // Layer 1: Background
  if (bgPath) {
    console.log(`   Background: ${basename(bgPath)} (grass treatment)`);
    const bg = await processGrassBackground(resolve(bgPath), w, h);
    layers.push({ input: bg, top: 0, left: 0 });
  } else if (bgType === 'dark') {
    console.log(`   Background: Dark Aurora`);
    const bg = await createDarkAurora(w, h);
    layers.push({ input: bg, top: 0, left: 0 });
  } else {
    console.log(`   Background: Cream Gradient`);
    const bg = await createCreamGradient(w, h);
    layers.push({ input: bg, top: 0, left: 0 });
  }

  // Layer 2: Green glow (optional)
  if (glow) {
    console.log(`   Glow: Green radial`);
    const glowBuf = await createGlowOverlay(w, h);
    layers.push({ input: glowBuf, top: 0, left: 0 });
  }

  // Layer 3: Creative (the rendered HTML)
  console.log(`   Creative: ${basename(input)}`);
  const creative = await sharp(input)
    .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  layers.push({ input: creative, top: 0, left: 0 });

  // Layer 4: Noise texture
  if (noise > 0) {
    console.log(`   Noise: ${noise}% opacity`);
    const noiseBuf = await generateNoise(w, h, noise / 100);
    layers.push({ input: noiseBuf, top: 0, left: 0, blend: 'over' });
  }

  // Layer 5: Logo (optional)
  if (logoPath) {
    try {
      await access(resolve(logoPath));
      const logoBuffer = await sharp(resolve(logoPath))
        .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

      const positions = {
        'top-left':     { top: logoPadding, left: logoPadding },
        'top-right':    { top: logoPadding, left: w - logoSize - logoPadding },
        'bottom-left':  { top: h - logoSize - logoPadding, left: logoPadding },
        'bottom-right': { top: h - logoSize - logoPadding, left: w - logoSize - logoPadding },
      };

      const pos = positions[logoPosition] || positions['top-left'];
      console.log(`   Logo: ${basename(logoPath)} (${logoPosition})`);
      layers.push({ input: logoBuffer, ...pos });
    } catch {
      console.log(`   ⚠️  Logo not found: ${logoPath} (skipping)`);
    }
  }

  // Compose all layers
  const outputFile = outputPath
    ? resolve(outputPath)
    : resolve(dirname(input), `final-${basename(input)}`);

  // Start with a transparent base
  const result = await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(layers)
    .png({ quality: 95, compressionLevel: 6 })
    .toBuffer();

  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, result);

  console.log(`\n✅ Final: ${outputFile}`);
  console.log(`   Size: ${(result.length / 1024).toFixed(0)}KB`);

  return outputFile;
}

// Only run CLI when executed directly (not when imported as a module)
const __composite_filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === __composite_filename) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(`
GolfHelm Image Compositor (Sharp)
──────────────────────────────────
Usage: node composite.js <creative.png> [options]

Options:
  --bg=FILE        Background photo (applies grass treatment)
  --bg-type=TYPE   Background type: cream, dark, grass (default: cream)
  --logo=FILE      Logo overlay
  --logo-pos=POS   Logo position: top-left, top-right, bottom-left, bottom-right
  --logo-size=N    Logo size in px (default: 120)
  --noise=N        Noise opacity 0-10 (default: 3)
  --glow           Add green glow overlay
  --out=FILE       Output path

Examples:
  node composite.js creative.png --bg-type=cream
  node composite.js creative.png --bg=backgrounds/bg-grass-1.jpg --noise=4
  node composite.js creative.png --bg-type=dark --glow --logo=logo.png
  node composite.js creative.png --bg=bg.jpg --logo=logo.png --out=final.png
`);
    process.exit(0);
  }

  const inputFile = args.find(a => !a.startsWith('--'));
  const parseArg = (name) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : undefined;
  };
  const hasFlag = (name) => args.includes(`--${name}`);

  composite(inputFile, {
    bgPath: parseArg('bg'),
    bgType: parseArg('bg-type') || 'cream',
    logoPath: parseArg('logo'),
    logoPosition: parseArg('logo-pos') || 'top-left',
    logoSize: parseInt(parseArg('logo-size') || '120'),
    noise: parseInt(parseArg('noise') || '3'),
    glow: hasFlag('glow'),
    outputPath: parseArg('out'),
  }).catch(err => {
    console.error('❌ Composite failed:', err.message);
    process.exit(1);
  });
}

export { composite, OVERLAYS };
