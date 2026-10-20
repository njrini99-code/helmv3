/* Compares two results of perf-pages.mjs (before and after) case by case. Usage: node scripts/clubhouse/perf-pages-compare.mjs <before-label> <after-label> */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, '.helm', 'runtime', 'clubhouse-perf', 'results');
const [beforeLabel, afterLabel] = process.argv.slice(2);
if (!beforeLabel || !afterLabel) throw new Error('usage: perf-pages-compare.mjs <before-label> <after-label>');

const load = (label) => {
  const file = join(DIR, `${label}.json`);
  if (!existsSync(file)) throw new Error(`no results for ${label}: ${file}`);
  return JSON.parse(readFileSync(file, 'utf8'));
};
const before = load(beforeLabel);
const after = load(afterLabel);
const byKey = (o) => new Map(o.rows.map((r) => [r.key, r]));
const b = byKey(before);
const a = byKey(after);

const cell = (x, y, digits = 0) => {
  if (x == null && y == null) return '-';
  const f = (v) => (v == null ? '-' : String(Math.round(v * 10 ** digits) / 10 ** digits));
  return `${f(x)} -> ${f(y)}`;
};

console.log(`before ${beforeLabel} (${before.at}) against after ${afterLabel} (${after.at}); medians of ${after.runsPerCase} runs, 4x CPU\n`);
console.log('| case | content ms | optional-done ms | tap INP ms | reads | waves | server ms | CLS raw | flash |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const [key, ra] of a) {
  const rb = b.get(key);
  if (!rb) {
    console.log(`| ${key} | (new case) | | | | | | | |`);
    continue;
  }
  // Before the section streams existed, optional-done is the content time: a before pass without the column is read that way.
  const optionalBefore = rb.optional ?? rb.content;
  console.log(
    `| ${key} | ${cell(rb.content, ra.content)} | ${cell(optionalBefore, ra.optional)} | ${cell(rb.inp, ra.inp)} | ${cell(rb.reads, ra.reads)} | ${cell(rb.waves, ra.waves)} | ${cell(rb.serverMs, ra.serverMs)} | ${cell(rb.clsRaw, ra.clsRaw, 3)} | ${rb.flash ? 'YES' : 'no'} -> ${ra.flash ? 'YES' : 'no'} |`,
  );
}
for (const key of b.keys()) if (!a.has(key)) console.log(`| ${key} | (not measured after) | | | | | | | |`);

if (after.geometry?.length) {
  const gb = new Map((before.geometry ?? []).map((g) => [`${g.role} ${g.viewport} ${g.scenario}`, g]));
  console.log('\nSkeleton geometry: height delta (loaded - skeleton) per block, before -> after\n');
  console.log('| case | block | skeleton / loaded (after) | top delta | height delta | before height delta |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const g of after.geometry) {
    const prev = gb.get(`${g.role} ${g.viewport} ${g.scenario}`);
    g.landmarks.forEach((l, i) => {
      const d = l.skeleton && l.loaded ? [l.loaded[0] - l.skeleton[0], l.loaded[1] - l.skeleton[1]] : null;
      const pl = prev?.landmarks[i];
      const pd = pl?.skeleton && pl?.loaded ? pl.loaded[1] - pl.skeleton[1] : null;
      console.log(`| ${g.role} ${g.viewport} ${g.scenario} | ${l.sel} | ${l.skeleton ? l.skeleton.join('/') : '-'} / ${l.loaded ? l.loaded.join('/') : '-'} | ${d ? d[0] : '-'} | ${d ? d[1] : '-'} | ${pd ?? '-'} |`);
    });
  }
}
