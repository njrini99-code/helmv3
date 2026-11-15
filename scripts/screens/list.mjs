// Every screen the app can show, from the filesystem: each Next App Router `page.tsx` under src/app (GolfHelm, BaseballHelm,
// Lift Lab, admin, the public site) plus every Clubhouse preview fixture and its states. Nothing is listed by hand, so a
// new page is in the list the day it lands (the old `ui-intelligence` route table was golf-only and kept by hand).
//
//   node scripts/screens/list.mjs [--json] [--product golf,baseball,...]
//
// Each screen: { id, route, product, area, access, dynamic, file, kind } where
//   product  golf | baseball | lifting | admin | public | fixtures
//   access   public (no sign-in) | signed-in | admin | fixture (development-only mock data)
//   dynamic  the route's [params], which a sweep resolves from links it finds (or skips)
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../..');

/** Route groups and folders that mean "no sign-in". */
const PUBLIC_GROUPS = new Set(['(auth)', '(public)', '(legal)']);
const PUBLIC_LEAVES = /\/(login|signup|forgot-password|reset-password|complete-signup|demo|join|welcome|auth)(\/|$)/;
const MARKETING = new Set(['', 'about', 'pricing', 'products', 'privacy', 'terms', 'support', 'help', 'splash']);

/** `src/app/golf/(dashboard)/dashboard/roster/page.tsx` → `{ route: '/golf/dashboard/roster', groups: ['(dashboard)'], dynamic: [] }`. */
export function routeFromPageFile(file) {
  const parts = file.split(/[\\/]/);
  const app = parts.indexOf('app');
  const segs = parts.slice(app + 1, -1);
  const groups = segs.filter((s) => /^\(.+\)$/.test(s));
  const dynamic = [];
  const path = segs
    .filter((s) => !/^\(.+\)$/.test(s) && !s.startsWith('@'))
    .map((s) => {
      const m = /^\[{1,2}(?:\.\.\.)?([^\]]+)\]{1,2}$/.exec(s);
      if (m) dynamic.push(m[1]);
      return s;
    });
  return { route: `/${path.join('/')}`.replace(/\/$/, '') || '/', groups, dynamic, catchAll: segs.some((s) => s.startsWith('[...') || s.startsWith('[[...')) };
}

export function productOf(route) {
  const first = route.split('/')[1] ?? '';
  if (first === 'golf' && route.startsWith('/golf/admin')) return 'admin';
  if (['golf', 'baseball', 'lifting', 'admin'].includes(first)) return first;
  if (first === 'clubhouse-preview') return 'fixtures';
  return 'public';
}

/** Who can open it: the route group or folder decides; anything under a dashboard or admin needs a session. */
export function accessOf({ route, groups }) {
  const product = productOf(route);
  if (product === 'fixtures') return 'fixture';
  if (product === 'admin' || /\/admin(\/|$)/.test(route)) return 'admin';
  if (product === 'public' && MARKETING.has(route.split('/')[1] ?? '')) return 'public';
  if (groups.some((g) => PUBLIC_GROUPS.has(g)) || PUBLIC_LEAVES.test(route)) return 'public';
  if (route === '/golf' || route === '/baseball' || route === '/lifting') return 'public';
  return 'signed-in';
}

/** The area inside a product: the first segment after `dashboard`, or after the product. */
export function areaOf(route) {
  const segs = route.split('/').filter(Boolean);
  const i = segs.indexOf('dashboard');
  const pick = i >= 0 ? segs[i + 1] : segs[1];
  return pick && !pick.startsWith('[') ? pick : i >= 0 ? 'home' : segs[1] ?? 'home';
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === '__tests__' || name === 'api' || name === 'actions') continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name === 'page.tsx' || name === 'page.ts' || name === 'page.jsx') out.push(p);
  }
  return out;
}

/** Every route screen. The Clubhouse preview's `[screen]` page is replaced by its fixtures (`fixtureScreens`). */
export function routeScreens(root = ROOT) {
  return walk(join(root, 'src/app'))
    .map((f) => relative(root, f).split(sep).join('/'))
    .map((file) => ({ file, ...routeFromPageFile(file) }))
    .filter((r) => r.route !== '/clubhouse-preview/[screen]')
    .map((r) => ({
      id: r.route,
      route: r.route,
      product: productOf(r.route),
      area: areaOf(r.route),
      access: accessOf(r),
      dynamic: r.dynamic,
      catchAll: r.catchAll,
      file: r.file,
      kind: 'route',
    }))
    .sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * Every Clubhouse fixture screen and state: the component catalog's preview routes plus the state list the accessibility
 * scan already keeps (`CH_A11Y_PAGES`), deduplicated by URL. Fixtures render mock data in `next dev` only.
 */
export async function fixtureScreens(root = ROOT) {
  const { readFileSync } = await import('node:fs');
  const catalog = JSON.parse(readFileSync(join(root, 'src/clubhouse/preview/component-catalog.json'), 'utf8'));
  const { CH_A11Y_PAGES } = await import(pathToFileURL(join(root, 'scripts/clubhouse/a11y.mjs')).href);
  const urls = new Map();
  for (const p of catalog.previews ?? []) urls.set(p.href, p.name);
  for (const [name, href] of CH_A11Y_PAGES) if (!urls.has(href)) urls.set(href, name);
  return [...urls.entries()]
    .map(([route, name]) => ({
      id: route,
      route,
      product: 'fixtures',
      area: name,
      access: 'fixture',
      dynamic: [],
      catchAll: false,
      file: 'src/app/clubhouse-preview/[screen]/page.tsx',
      kind: 'fixture',
    }))
    .sort((a, b) => a.route.localeCompare(b.route));
}

export async function listScreens({ root = ROOT, products } = {}) {
  const routes = routeScreens(root);
  const have = new Set(routes.map((r) => r.id));
  // A preview with its own page (popup-lab, auth, entry, onboard) is listed once, from its page file.
  const all = [...routes, ...(await fixtureScreens(root)).filter((f) => !have.has(f.id))];
  return products?.length ? all.filter((s) => products.includes(s.product)) : all;
}

/** Counts per product and access, for the summary line. */
export function summarize(screens) {
  const out = {};
  for (const s of screens) {
    out[s.product] ??= { total: 0, public: 0, 'signed-in': 0, admin: 0, fixture: 0, dynamic: 0 };
    out[s.product].total += 1;
    out[s.product][s.access] += 1;
    if (s.dynamic.length) out[s.product].dynamic += 1;
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--product');
  const products = i >= 0 ? argv[i + 1].split(',') : undefined;
  const screens = await listScreens({ products });
  if (argv.includes('--json')) console.log(JSON.stringify(screens, null, 2));
  else {
    for (const s of screens) console.log(`${s.product.padEnd(9)} ${s.access.padEnd(9)} ${s.route}${s.dynamic.length ? `   (needs ${s.dynamic.join(', ')})` : ''}`);
    const sum = summarize(screens);
    console.log(`\n${screens.length} screens: ${Object.entries(sum).map(([p, c]) => `${p} ${c.total}`).join(', ')}`);
  }
}
