import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { main, measureBuild, parseArgs, routeAddress } from '../route-js-budget.mjs';

/** A finished build in miniature: a runtime chunk, a shared layout chunk, and two pages, one of which pulls a heavy chunk. */
function fakeBuild() {
  const dir = mkdtempSync(join(tmpdir(), 'route-js-budget-'));
  mkdirSync(join(dir, 'static', 'chunks'), { recursive: true });
  const chunk = (name, bytes, seed) => {
    // Random-ish text compresses poorly, so the gzipped size tracks the raw size.
    let s = '';
    let x = seed;
    while (s.length < bytes) {
      x = (x * 1103515245 + 12345) % 2147483648;
      s += x.toString(36);
    }
    writeFileSync(join(dir, 'static', 'chunks', name), s.slice(0, bytes));
  };
  chunk('runtime.js', 40_000, 1);
  chunk('layout.js', 30_000, 2);
  chunk('light.js', 5_000, 3);
  chunk('heavy.js', 400_000, 4);
  writeFileSync(join(dir, 'BUILD_ID'), 'test-build');
  writeFileSync(join(dir, 'build-manifest.json'), JSON.stringify({ rootMainFiles: ['static/chunks/runtime.js'] }));
  const page = (route, files) => {
    const folder = join(dir, 'server', 'app', ...route.split('/').filter(Boolean));
    mkdirSync(folder, { recursive: true });
    const entry = `${route}/page`;
    const manifest = {
      clientModules: { '[project]/src/screens/Heavy.tsx <module evaluation>': { id: 1, name: '*', chunks: ['/_next/static/chunks/heavy.js'], async: false } },
      entryJSFiles: {
        '[project]/src/app/layout': ['static/chunks/layout.js'],
        [`[project]/src/app${entry}`]: files,
      },
      entryCSSFiles: {},
    };
    writeFileSync(join(folder, 'page_client-reference-manifest.js'), `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\nglobalThis.__RSC_MANIFEST[${JSON.stringify(entry)}] = ${JSON.stringify(manifest)};\n`);
  };
  page('/golf/(dashboard)/dashboard/light', ['static/chunks/light.js']);
  page('/golf/(dashboard)/dashboard/heavy', ['static/chunks/light.js', 'static/chunks/heavy.js']);
  page('/admin/elsewhere', ['static/chunks/heavy.js']);
  return dir;
}

test('route addresses drop route groups, slots and the page segment', () => {
  assert.equal(routeAddress('/golf/(dashboard)/dashboard/qualifiers/[id]/page'), '/golf/dashboard/qualifiers/[id]');
  assert.equal(routeAddress('/golf/(dashboard)/dashboard/@modal/page'), '/golf/dashboard');
  assert.equal(routeAddress('/page'), '/');
});

test('first-load JS is the runtime plus every entry chunk, gzipped, and only the Clubhouse prefix by default', () => {
  const dir = fakeBuild();
  try {
    const { rows, budget, buildId } = measureBuild(dir, { budgetKb: 100 });
    assert.equal(buildId, 'test-build');
    assert.equal(budget, 100_000);
    assert.deepEqual(rows.map((r) => r.route), ['/golf/dashboard/heavy', '/golf/dashboard/light']);
    const [heavy, light] = rows;
    const gz = (n, seed) => {
      let s = '';
      let x = seed;
      while (s.length < n) {
        x = (x * 1103515245 + 12345) % 2147483648;
        s += x.toString(36);
      }
      return gzipSync(Buffer.from(s.slice(0, n)), { level: 9 }).length;
    };
    assert.equal(light.gzip, gz(40_000, 1) + gz(30_000, 2) + gz(5_000, 3));
    assert.equal(light.raw, 75_000);
    assert.equal(light.chunks, 3);
    assert.equal(light.over, false);
    assert.equal(heavy.over, true);
    assert.equal(measureBuild(dir, { prefix: null }).rows.length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exits 1 over budget, 0 with --report-only or a roomier budget, 2 on bad input', () => {
  const dir = fakeBuild();
  const out = [];
  const log = (line) => out.push(line);
  try {
    assert.equal(main(['--next', dir, '--budget-kb', '100'], log), 1);
    assert.match(out.join('\n'), /\/golf\/dashboard\/heavy .* OVER/);
    assert.equal(main(['--next', dir, '--budget-kb', '100', '--report-only'], log), 0);
    assert.equal(main(['--next', dir, '--budget-kb', '1000'], log), 0);
    out.length = 0;
    assert.equal(main(['--next', dir, '--route', '/golf/dashboard/heavy', '--chunks', '--json', '--budget-kb', '1000'], log), 0);
    const json = JSON.parse(out.join('\n'));
    assert.equal(json.routes.length, 1);
    assert.equal(json.chunks['/golf/dashboard/heavy'][0].chunk, 'static/chunks/heavy.js');
    assert.deepEqual(json.chunks['/golf/dashboard/heavy'][0].owners, ['src/screens/Heavy.tsx']);
    assert.equal(main(['--next', join(dir, 'nope')], log), 2);
    assert.equal(main(['--route', '/x', '--next', dir], log), 2);
    assert.equal(main(['--budget-kb', 'lots'], log), 2);
    assert.equal(main(['--help'], log), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parses options strictly', () => {
  assert.equal(parseArgs(['--all']).prefix, null);
  assert.throws(() => parseArgs(['--wat']), /unknown option/);
  assert.throws(() => parseArgs(['--top', '0']), /--top/);
});
