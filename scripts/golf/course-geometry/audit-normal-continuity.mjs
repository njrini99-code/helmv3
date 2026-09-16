#!/usr/bin/env node
/**
 * Normal continuity audit (Meridian §16). Reads one compiled per-hole terrain
 * package (.json or .json.gz), rebuilds triangle adjacency from shared vertex
 * coordinates, and reports the dihedral angle across every shared edge
 * (P50 / P95 / P99 / max) grouped by edge class:
 *   interior          both triangles belong to the same feature and material
 *   material-boundary same feature, different compiler material (ribbons)
 *   feature-boundary  different features (fairway/rough, green/fringe …)
 *   context-boundary  a context ("ground") triangle against a hole feature
 * It also reports the angle between coincident *vertex* normals (source DEM
 * gradient normals when present, otherwise area-weighted triangle normals):
 * a non-zero value there is a lighting seam, not terrain.
 *
 *   node scripts/golf/course-geometry/audit-normal-continuity.mjs <mesh.json[.gz]> [--out report.json] [--exaggeration 1]
 *
 * Diagnostic only: nothing is written except the optional report.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const exaggeration = args.includes('--exaggeration') ? Number(args[args.indexOf('--exaggeration') + 1]) : 1;
if (!file) { console.error('usage: audit-normal-continuity.mjs <mesh.json[.gz]> [--out report.json]'); process.exit(2); }
const raw = readFileSync(file);
const mesh = JSON.parse((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8'));
const ref = mesh.referenceElevationM;
const v = mesh.vertices, triangles = mesh.triangleFeatures.length;
const displayZ = z => ref + (z - ref) * exaggeration;
const key = (x, y) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
const faceNormals = new Float64Array(triangles * 3);
for (let t = 0; t < triangles; t++) {
  const o = t * 9;
  const ax = v[o + 3] - v[o], ay = v[o + 4] - v[o + 1], az = displayZ(v[o + 5]) - displayZ(v[o + 2]);
  const bx = v[o + 6] - v[o], by = v[o + 7] - v[o + 1], bz = displayZ(v[o + 8]) - displayZ(v[o + 2]);
  let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
  const length = Math.hypot(nx, ny, nz) || 1;
  faceNormals.set([nx / length, ny / length, nz / length], t * 3);
}
// Edge map: undirected edge (by rounded XY) → triangles.
const edges = new Map();
for (let t = 0; t < triangles; t++) for (let c = 0; c < 3; c++) {
  const a = t * 9 + c * 3, b = t * 9 + ((c + 1) % 3) * 3;
  const ka = key(v[a], v[a + 1]), kb = key(v[b], v[b + 1]);
  const edge = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  const list = edges.get(edge) ?? []; list.push(t); edges.set(edge, list);
}
const classes = { interior: [], 'material-boundary': [], 'feature-boundary': [], 'context-boundary': [] };
let nonManifold = 0, boundary = 0;
const kindOf = t => mesh.featureKinds[mesh.triangleFeatures[t]];
for (const list of edges.values()) {
  if (list.length === 1) { boundary++; continue; }
  if (list.length > 2) { nonManifold++; continue; }
  const [a, b] = list;
  const dot = faceNormals[a * 3] * faceNormals[b * 3] + faceNormals[a * 3 + 1] * faceNormals[b * 3 + 1] + faceNormals[a * 3 + 2] * faceNormals[b * 3 + 2];
  const degrees = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
  const sameFeature = mesh.triangleFeatures[a] === mesh.triangleFeatures[b];
  const cls = sameFeature ? (mesh.triangleMaterials[a] === mesh.triangleMaterials[b] ? 'interior' : 'material-boundary')
    : (kindOf(a) === 'ground' || kindOf(b) === 'ground') ? 'context-boundary' : 'feature-boundary';
  classes[cls].push(degrees);
}
// Vertex-normal discontinuity: coincident vertices with different normals.
const vertexNormals = new Map();
// course-terrain-v4 packages carry no per-vertex array: sample the metric
// grid's gradient at each vertex (central differences over one spacing).
function gridNormals(grid) {
  if (!grid) return null;
  const sample = (x, y) => {
    const gx = (x - grid.originM[0]) / grid.spacingM, gy = (y - grid.originM[1]) / grid.spacingM;
    if (gx < 0 || gy < 0 || gx > grid.columns - 1 || gy > grid.rows - 1) return null;
    const ix = Math.min(Math.floor(gx), grid.columns - 2), iy = Math.min(Math.floor(gy), grid.rows - 2), fx = gx - ix, fy = gy - iy, i = iy * grid.columns + ix;
    const a = grid.heightsM[i], b = grid.heightsM[i + 1], c = grid.heightsM[i + grid.columns], d = grid.heightsM[i + grid.columns + 1];
    if (a == null || b == null || c == null || d == null) return null;
    return (1 - fx) * ((1 - fy) * a + fy * c) + fx * ((1 - fy) * b + fy * d);
  };
  const out = new Float64Array(v.length), s = grid.spacingM;
  for (let i = 0; i < v.length; i += 3) {
    const x = v[i], y = v[i + 1], z = sample(x, y), l = sample(x - s, y), r = sample(x + s, y), b = sample(x, y - s), t = sample(x, y + s);
    const dx = l != null && r != null ? (r - l) / (2 * s) : r != null && z != null ? (r - z) / s : l != null && z != null ? (z - l) / s : 0;
    const dy = b != null && t != null ? (t - b) / (2 * s) : t != null && z != null ? (t - z) / s : b != null && z != null ? (z - b) / s : 0;
    const length = Math.hypot(dx, dy, 1);
    out[i] = -dx / length; out[i + 1] = -dy / length; out[i + 2] = 1 / length;
  }
  return out;
}
const source = mesh.sourceNormals ?? gridNormals(mesh.metricGrid);
for (let i = 0; i < v.length; i += 3) {
  const k = key(v[i], v[i + 1]);
  const n = source ? [source[i], source[i + 1], source[i + 2] / exaggeration] : faceNormals.slice(Math.floor(i / 9) * 3, Math.floor(i / 9) * 3 + 3);
  const length = Math.hypot(n[0], n[1], n[2]) || 1;
  const list = vertexNormals.get(k) ?? []; list.push([n[0] / length, n[1] / length, n[2] / length]); vertexNormals.set(k, list);
}
const vertexSeams = [];
for (const list of vertexNormals.values()) {
  if (list.length < 2) continue;
  let worst = 0;
  for (let i = 1; i < list.length; i++) {
    const dot = list[0][0] * list[i][0] + list[0][1] * list[i][1] + list[0][2] * list[i][2];
    worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI);
  }
  vertexSeams.push(worst);
}
const stats = values => {
  if (!values.length) return { count: 0, p50: null, p95: null, p99: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
  return { count: sorted.length, p50: +q(.5).toFixed(3), p95: +q(.95).toFixed(3), p99: +q(.99).toFixed(3), max: +sorted[sorted.length - 1].toFixed(3) };
};
const report = {
  file, terrainHash: mesh.contentHash, physicalHoleKey: mesh.physicalHoleKey, triangles, exaggeration,
  normalSource: mesh.sourceNormals ? 'source_dem_gradient' : source ? 'metric_grid_gradient' : 'triangle_area_weighted',
  edges: { shared: [...edges.values()].filter(l => l.length === 2).length, boundary, nonManifold },
  dihedralDegreesByEdgeClass: Object.fromEntries(Object.entries(classes).map(([cls, values]) => [cls, stats(values)])),
  vertexNormalSeamDegrees: stats(vertexSeams),
  interpretation: 'Dihedral angles are terrain shape (real slope changes plus tessellation). Vertex-normal seams are lighting discontinuities: with source DEM normals they must be ~0 at every shared vertex.',
};
console.log(JSON.stringify(report, null, 2));
if (out) writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
