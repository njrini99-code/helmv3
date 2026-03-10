/**
 * creative-pipeline.js — Full end-to-end creative generation
 *
 * Chains: HTML → Playwright render → Sharp composite → Final PNG
 *
 * Usage:
 *   node creative-pipeline.js <input.html> [options]
 *
 * Examples:
 *   node creative-pipeline.js creative.html
 *   node creative-pipeline.js creative.html --preset=story --bg-type=dark --glow
 *   node creative-pipeline.js creative.html --bg=backgrounds/bg-grass-1.jpg --logo=logo.png
 *   node creative-pipeline.js slides/*.html --preset=feed --bg-type=cream  # Batch carousel
 */

import { render, PRESETS } from './render.js';
import { composite } from './composite.js';
import { readdir, mkdir, stat } from 'fs/promises';
import { resolve, basename, extname, join } from 'path';
import { fileURLToPath } from 'url';

async function pipeline(inputPath, options = {}) {
  const {
    preset = 'feed',
    bgPath = null,
    bgType = 'cream',
    logoPath = null,
    logoPosition = 'top-left',
    noise = 3,
    glow = false,
    scale = 2,
    outputDir = './output',
    keepIntermediate = false,
  } = options;

  const dims = PRESETS[preset] || PRESETS.feed;

  console.log(`
╔══════════════════════════════════════════╗
║    GolfHelm Creative Pipeline            ║
╚══════════════════════════════════════════╝
`);

  await mkdir(resolve(outputDir), { recursive: true });

  // Resolve input files (support glob patterns for carousel batches)
  let inputFiles = [];
  const inputResolved = resolve(inputPath);

  try {
    const s = await stat(inputResolved);
    if (s.isDirectory()) {
      // Directory — process all HTML files
      const files = await readdir(inputResolved);
      inputFiles = files
        .filter(f => f.endsWith('.html'))
        .sort()
        .map(f => join(inputResolved, f));
      console.log(`📁 Directory mode: Found ${inputFiles.length} HTML files\n`);
    } else {
      inputFiles = [inputResolved];
    }
  } catch {
    inputFiles = [inputResolved];
  }

  const results = [];

  for (let i = 0; i < inputFiles.length; i++) {
    const htmlFile = inputFiles[i];
    const name = basename(htmlFile, extname(htmlFile));
    const slideLabel = inputFiles.length > 1 ? ` [${i + 1}/${inputFiles.length}]` : '';

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Step 1/2: Render${slideLabel}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Step 1: Render HTML → PNG
    const renderOutput = resolve(outputDir, `rendered-${name}.png`);
    await render(htmlFile, renderOutput, {
      ...dims,
      scale,
    });

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Step 2/2: Composite${slideLabel}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Step 2: Composite with background + overlays
    const finalOutput = resolve(outputDir, `${name}-final.png`);
    await composite(renderOutput, {
      bgPath,
      bgType,
      logoPath,
      logoPosition,
      noise,
      glow,
      outputPath: finalOutput,
      width: dims.width * scale,
      height: dims.height * scale,
    });

    // Clean up intermediate file
    if (!keepIntermediate) {
      const { unlink } = await import('fs/promises');
      try { await unlink(renderOutput); } catch {}
    }

    results.push(finalOutput);
    console.log('');
  }

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  ✅ Pipeline Complete                     ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log(`\nGenerated ${results.length} creative(s):`);
  results.forEach(r => console.log(`  📸 ${r}`));
  console.log(`\nOutput directory: ${resolve(outputDir)}`);

  return results;
}

// Only run CLI when executed directly (not when imported as a module)
const __pipeline_filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === __pipeline_filename) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(`
GolfHelm Creative Pipeline
──────────────────────────
Full end-to-end: HTML → Render → Composite → Instagram-ready PNG

Usage:
  node creative-pipeline.js <input.html|directory> [options]

Options:
  --preset=NAME     Dimensions: feed, story, square, landscape (default: feed)
  --bg=FILE         Background photo (applies grass overlay treatment)
  --bg-type=TYPE    Background: cream, dark (default: cream)
  --logo=FILE       Logo to overlay
  --logo-pos=POS    Logo position: top-left, top-right, bottom-left, bottom-right
  --noise=N         Noise texture opacity 0-10 (default: 3)
  --glow            Add green glow effect
  --scale=N         Retina scale: 1, 2, 3 (default: 2)
  --out=DIR         Output directory (default: ./output)
  --keep            Keep intermediate render files

Single Creative:
  node creative-pipeline.js feed-post.html --bg-type=cream
  node creative-pipeline.js hero.html --bg-type=dark --glow --logo=logo.png

Carousel Batch (pass a directory):
  node creative-pipeline.js ./carousel-slides/ --bg-type=cream --logo=logo.png

With Photo Background:
  node creative-pipeline.js creative.html --bg=backgrounds/bg-grass-1.jpg

Workflow:
  1. Claude generates HTML creative(s) using the skill
  2. Save to .html file(s)
  3. Run this pipeline
  4. Upload the final PNGs to Instagram
`);
    process.exit(0);
  }

  const inputFile = args.find(a => !a.startsWith('--'));
  const parseArg = (name) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : undefined;
  };
  const hasFlag = (name) => args.includes(`--${name}`);

  pipeline(inputFile, {
    preset: parseArg('preset') || 'feed',
    bgPath: parseArg('bg'),
    bgType: parseArg('bg-type') || 'cream',
    logoPath: parseArg('logo'),
    logoPosition: parseArg('logo-pos') || 'top-left',
    noise: parseInt(parseArg('noise') || '3'),
    glow: hasFlag('glow'),
    scale: parseInt(parseArg('scale') || '2'),
    outputDir: parseArg('out') || './output',
    keepIntermediate: hasFlag('keep'),
  }).catch(err => {
    console.error('❌ Pipeline failed:', err.message);
    process.exit(1);
  });
}

export { pipeline };
