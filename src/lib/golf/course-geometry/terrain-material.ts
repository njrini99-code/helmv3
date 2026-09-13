import type { TerrainMesh } from './terrain';

/** Shared vector/GPU flat-shade material. Light stays in world space. */
export function terrainColors(mesh: TerrainMesh, palette: readonly (readonly number[])[], surrounds: { surround: readonly number[]; fringe: readonly number[] }): Float32Array {
  const colors = new Float32Array(mesh.vertices.length), v = mesh.vertices;
  for (let t = 0; t < mesh.triangleFeatures.length; t++) {
    const i = t * 9;
    const ax = v[i+3]!-v[i]!, ay = v[i+4]!-v[i+1]!, az = v[i+5]!-v[i+2]!;
    const bx = v[i+6]!-v[i]!, by = v[i+7]!-v[i+1]!, bz = v[i+8]!-v[i+2]!;
    const nx = ay*bz-az*by, ny = az*bx-ax*bz, nz = ax*by-ay*bx;
    const length = Math.hypot(nx, ny, nz), sign = nz < 0 ? -1 : 1;
    const illumination = .90 + .13 * Math.max(0, sign * (.4*nx-.45*ny+.799*nz) / length);
    const kind = mesh.featureKinds[mesh.triangleFeatures[t]!]!;
    const material = mesh.triangleMaterials[t];
    let rgb = material === 3 ? surrounds.surround : material === 4 ? surrounds.fringe : palette[mesh.triangleFeatures[t]!]!;
    if (kind === 'woods') {
      const ground = palette[mesh.featureKinds.indexOf('ground')]!;
      rgb = rgb.map((channel, index) => channel * .35 + ground[index]! * .65);
    }
    const edge = kind === 'bunker' ? .65 : kind === 'green' ? .72 : .9;
    const tint = material === 1 ? edge : material === 2 ? 1.1 : 1;
    for (let j = 0; j < 9; j++) colors[i+j] = Math.min(1, rgb[j % 3]! * illumination * tint);
  }
  return colors;
}
