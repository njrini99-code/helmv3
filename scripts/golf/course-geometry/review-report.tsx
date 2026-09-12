/** Offline deterministic SVG/report generator. Never reads player data or DB.
 * npx tsx scripts/golf/course-geometry/review-report.tsx
 */
import React from 'react';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseHoleScene, SCENE_STYLE_VERSION } from '../../../src/components/golf/course-geometry/CourseHoleScene';
import { PilotContexts } from '../../../src/test/fixtures/course-geometry/PilotContexts';
import { pilotPackage, pilotScene } from '../../../src/test/fixtures/course-geometry/pilot';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
const out = 'output/course-geometry';
await mkdir(out, { recursive: true });
const { contentHash, ...content } = pilotPackage;
// Python preparation uses Unicode codepoint key order (these keys are ASCII).
const hash = createHash('sha256').update(canonical(content)).digest('hex');
if (hash !== contentHash) throw new Error('Package hash mismatch');
const tokens = await readFile('src/styles/design-tokens.css', 'utf8');
const palette = new Map([...tokens.matchAll(/(--fw-diagram-[\w-]+):\s*(#[a-f\d]{6});/gi)].map(m => [m[1]!, m[2]!]));
const resolveColors = (svg: string) => svg.replace(/var\((--fw-diagram-[\w-]+)\)/g, (_, key: string) => palette.get(key) ?? 'none');
const manifest: { file: string; sha256: string; hole: string; mode: string }[] = [];
const rows: string[] = [];
const contactTiles: { input: Buffer; left: number; top: number }[] = [];
const modes = [ ['source', 320, 380], ['review', 320, 380], ['compact', 320, 320], ['strip', 48, 140] ] as const;
for (const hole of pilotPackage.holes) {
  const scene = pilotScene(hole.key, false);
  const cells: string[] = [`<td><img src="${hole.key}-source-overlay.png" width="640" height="440" alt="${hole.key} NAIP 2022 comparison" /></td>`];
  for (const [mode, width, height] of modes) {
    const file = `${hole.key}-${mode}.svg`;
    const svg = resolveColors(renderToStaticMarkup(<CourseHoleScene scene={scene} width={width} height={height} mode={mode} />));
    await writeFile(`${out}/${file}`, svg);
    if (mode === 'review') {
      const label = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#f6f3ed"/><text x="8" y="20" font-family="sans-serif" font-size="14" fill="#18251f">${hole.key} · Par ${hole.par} · ${hole.scorecardYards ?? '—'} yd</text></svg>`;
      const tile = await sharp(Buffer.from(label)).composite([{ input: await sharp(Buffer.from(svg)).png().toBuffer(), top: 32, left: 0 }]).png().toBuffer();
      const index = hole.ordinal - 1;
      contactTiles.push({ input: tile, left: (index % 6) * 336 + 16, top: Math.floor(index / 6) * 496 + 72 });
    }
    manifest.push({ file, sha256: createHash('sha256').update(svg).digest('hex'), hole: hole.key, mode });
    cells.push(`<td><img src="${file}" width="${width}" height="${height}" alt="${hole.key} ${mode}" /></td>`);
  }
  rows.push(`<tr><th>Hole ${hole.ordinal}<br/>Par ${hole.par} · ${hole.scorecardYards ?? '—'} yd<br/><small>${hole.key}<br/>Partial · pin unknown</small></th>${cells.join('')}</tr>`);
}
const sheetBase = `<svg xmlns="http://www.w3.org/2000/svg" width="2032" height="1576"><rect width="2032" height="1576" fill="#f6f3ed"/><text x="16" y="24" font-family="sans-serif" font-size="18" fill="#18251f">Cacapon · Partial source-reviewed draft · © OpenStreetMap contributors · ODbL 1.0</text><text x="16" y="48" font-family="sans-serif" font-size="12" fill="#18251f">${hash} · ${SCENE_STYLE_VERSION} · No pin or shot locations</text></svg>`;
await sharp(Buffer.from(sheetBase)).composite(contactTiles).png().toFile(`${out}/contact-sheet.png`);
const summary = { packageHash: hash, style: SCENE_STYLE_VERSION, projection: pilotPackage.projection,
  algorithm: 'evidence-only-v1', compressedBytes: gzipSync(JSON.stringify(pilotPackage)).length, artifacts: manifest };
await writeFile(`${out}/manifest.json`, JSON.stringify(summary, null, 2) + '\n');
await writeFile(`${out}/contact-sheet.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Cacapon geometry contact sheet</title>
<style>body{font:14px system-ui;background:#f6f3ed;color:#18251f;margin:24px}table{border-collapse:collapse}td,th{padding:12px;border-bottom:1px solid #ccc}img{display:block}small{font-weight:400}th{text-align:left}p{max-width:1000px}</style>
<h1>Cacapon · 18-hole geometry review</h1><p>© OpenStreetMap contributors · ODbL 1.0. Reviewed draft; independent course-familiar and current boundary review pending. NAIP 2022 comparison is a source agreement check; canopy and imagery age leave boundary accuracy unresolved. Original-vector column is north up. Rebuild optional comparison images with source-overlay.py. No inferred cup or ball coordinates. Scorecard yardage does not resize a hole.</p>
<p>Package ${hash} · ${SCENE_STYLE_VERSION} · wgs84-local-enu-v1</p>
<table><thead><tr><th>Physical hole</th><th>NAIP 2022 / OSM overlay</th><th>Source vectors · north up</th><th>Review</th><th>Manual entry</th><th>Strip</th></tr></thead><tbody>${rows.join('')}</tbody></table></html>`);
await writeFile(`${out}/contexts.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GolfHelm shared SVG pilot</title><link rel="icon" href="data:,"><link rel="stylesheet" href="proof.css"><style>${tokens}</style>${renderToStaticMarkup(<PilotContexts />)}</html>`);
console.log(JSON.stringify({ packageHash: hash, svgPreviews: manifest.length, compressedBytes: summary.compressedBytes, output: out }));
