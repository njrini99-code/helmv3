import { describe, expect, it } from 'vitest';
import source from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';
import { pilotPackage, pilotScene } from '@/test/fixtures/course-geometry/pilot';
import { parseTerrainMesh, terrainHeight } from '../terrain';
import { boundaryDistance } from '../display-outline';
import {
  assertVisualArtifact, compileVisualArtifact, createVisualSurfaceSampler, MERIDIAN_CODES, MERIDIAN_VISUAL_COMPILER_VERSION, offlinePackManifest,
  parseVisualArtifact, serializeVisualArtifact, SURFACE_CLASS_IDS, visualArtifactCachePath,
} from '../visual-artifact';
import { MERIDIAN_STYLE, MERIDIAN_STYLE_HASH, MERIDIAN_STYLE_VERSION, styleHash } from '../visual-style';

const mesh = parseTerrainMesh(source, pilotPackage);
const scene = pilotScene('cacapon-07', false);

describe('Meridian visual artifact (§6, §96–102, §106.1)', () => {
  it('compiles deterministically from the canonical package, terrain and style', () => {
    const before = [...mesh.vertices];
    const a = compileVisualArtifact(scene, mesh), b = compileVisualArtifact(scene, mesh);
    expect(a.contentHash).toBe(b.contentHash);
    expect(serializeVisualArtifact(a)).toBe(serializeVisualArtifact(b));
    expect(a).toMatchObject({ schemaVersion: 1, kind: 'meridian_visual_artifact', basis: 'visual_only',
      compilerVersion: MERIDIAN_VISUAL_COMPILER_VERSION, canonicalPackageHash: scene.packageHash, terrainHash: mesh.contentHash,
      physicalHoleKey: 'cacapon-07', styleVersion: MERIDIAN_STYLE_VERSION, styleHash: MERIDIAN_STYLE_HASH, vertexCount: mesh.vertices.length / 3 });
    expect(a.layers.mowing).toEqual({ basis: 'illustrative_style', bandWidthM: MERIDIAN_STYLE.mowing.bandWidthM, frame: 'route_local' });
    expect(a.layers.bunkerBowl.basis).toBe('visual_only');
    // Compilation reads canonical truth and never writes it.
    expect(mesh.vertices).toEqual(before);
  });

  it('refuses an artifact whose keys disagree with the scene in front of it', () => {
    const artifact = compileVisualArtifact(scene, mesh);
    expect(() => assertVisualArtifact(artifact, scene, mesh)).not.toThrow();
    expect(() => assertVisualArtifact({ ...artifact, canonicalPackageHash: 'f'.repeat(64) }, scene, mesh)).toThrow(MERIDIAN_CODES.mismatch);
    expect(() => assertVisualArtifact({ ...artifact, terrainHash: 'e'.repeat(64) }, scene, mesh)).toThrow(/MERIDIAN_ARTIFACT_MISMATCH: terrain/);
    expect(() => assertVisualArtifact({ ...artifact, styleHash: 'meridian-v5-00000000' }, scene, mesh)).toThrow(/style/);
    expect(() => assertVisualArtifact({ ...artifact, vertexCount: artifact.vertexCount - 3 }, scene, mesh)).toThrow(/vertices/);
    expect(() => assertVisualArtifact(artifact, { ...scene, physicalHoleKey: 'cacapon-08' }, mesh)).toThrow(/hole/);
    // A different style value is a different artifact key.
    const restyled = { ...MERIDIAN_STYLE, mowing: { ...MERIDIAN_STYLE.mowing, bandWidthM: 7 } };
    expect(styleHash(restyled)).not.toBe(MERIDIAN_STYLE_HASH);
    expect(() => assertVisualArtifact(artifact, scene, mesh, restyled)).toThrow(/style/);
    expect(() => compileVisualArtifact({ ...scene, packageHash: 'a'.repeat(64) }, mesh)).toThrow(MERIDIAN_CODES.mismatch);
  });

  it('round-trips through the cache encoding and rejects tampered payloads', () => {
    const artifact = compileVisualArtifact(scene, mesh);
    const text = serializeVisualArtifact(artifact), parsed = parseVisualArtifact(text);
    expect(parsed.contentHash).toBe(artifact.contentHash);
    for (const key of Object.keys(artifact.attributes) as (keyof typeof artifact.attributes)[]) {
      expect(Array.from(parsed.attributes[key])).toEqual(Array.from(artifact.attributes[key]));
    }
    expect(() => assertVisualArtifact(parsed, scene, mesh)).not.toThrow();
    const tampered = JSON.parse(text) as { attributes: Record<string, string> };
    tampered.attributes.mowingWeight = btoa(String.fromCharCode(...new Uint8Array(artifact.vertexCount)));
    expect(() => parseVisualArtifact(JSON.stringify(tampered))).toThrow(/MERIDIAN_ARTIFACT_MISMATCH: content/);
    expect(visualArtifactCachePath('cacapon', scene.packageHash, MERIDIAN_STYLE_HASH, 'cacapon-07'))
      .toBe(`geometry/cacapon/${scene.packageHash}/visual/${MERIDIAN_STYLE_HASH}/cacapon-07.visual.json`);
    const pack = offlinePackManifest('cacapon', scene.packageHash, [{ physicalHoleKey: 'cacapon-07', terrainHash: mesh.contentHash, visualContentHash: artifact.contentHash }]);
    expect(pack.entries.map(entry => entry.role)).toEqual(['terrain', 'visual']);
    expect(pack.entries[1]!.hash).toBe(artifact.contentHash);
  });

  it('lowers bunkers into render-only bowls: zero at the rim, class depth inside, never in the canonical mesh (§27–33)', () => {
    const before = [...mesh.vertices];
    const artifact = compileVisualArtifact(scene, mesh), a = artifact.attributes, bowl = artifact.layers.bunkerBowl;
    expect(bowl).toMatchObject({ basis: 'visual_only', version: 'smoothstep-bowl-v1', depthBasis: 'visual_class' });
    expect(bowl.profiles.length).toBeGreaterThan(0);
    const all = [...scene.features, ...(scene.contextFeatures ?? [])];
    for (const profile of bowl.profiles) {
      const [low, high] = MERIDIAN_STYLE.bunker.depthM[profile.sizeClass];
      const scale = profile.contextOnly ? MERIDIAN_STYLE.bunker.contextDepthScale : 1;
      expect(profile.depthM).toBeGreaterThanOrEqual(low * scale - 1e-3); expect(profile.depthM).toBeLessThanOrEqual(high * scale + 1e-3);
      expect(profile.depthBasis).toBe('visual_class');
      const feature = all.find(f => f.id === profile.featureId)!, rings = feature.parts.flat();
      const featureIndex = mesh.featureIds.indexOf(profile.featureId);
      let deepest = 0;
      for (let t = 0; t < mesh.triangleFeatures.length; t++) {
        if (mesh.triangleFeatures[t] !== featureIndex) continue;
        for (let corner = 0; corner < 3; corner++) {
          const vertex = t * 3 + corner, x = mesh.vertices[vertex * 3]!, y = mesh.vertices[vertex * 3 + 1]!;
          const distance = rings.reduce((minimum, ring) => Math.min(minimum, boundaryDistance([x, y], ring)), Infinity);
          const depth = a.bunkerDepthMm[vertex]! / 1000;
          if (distance < .01) expect(depth).toBe(0);
          expect(depth).toBeLessThanOrEqual(profile.depthM + 1e-3);
          const u = Math.min(1, distance / profile.bowlRadiusM);
          expect(depth).toBeCloseTo(profile.depthM * u * u * u * (u * (u * 6 - 15) + 10), 2);
          deepest = Math.max(deepest, depth);
          expect(SURFACE_CLASS_IDS[a.surfaceClass[vertex]!]).toBe('bunker');
        }
      }
      expect(deepest).toBeCloseTo(profile.effectiveDepthM, 3);
      if (!profile.contextOnly) expect(deepest).toBeGreaterThan(0);
    }
    // Non-bunker vertices carry no depth or slope.
    for (let t = 0; t < mesh.triangleFeatures.length; t++) {
      if (mesh.featureKinds[mesh.triangleFeatures[t]!] === 'bunker') continue;
      for (let corner = 0; corner < 3; corner++) { const v = t * 3 + corner; expect(a.bunkerDepthMm[v]).toBe(0); expect(a.bunkerSlope[v * 2]).toBe(0); }
    }
    expect(mesh.vertices).toEqual(before);
    // The display sampler lowers a point inside a bowl and leaves everything else canonical.
    const sample = createVisualSurfaceSampler(mesh, artifact);
    const profile = bowl.profiles.find(p => !p.contextOnly) ?? bowl.profiles[0]!;
    const featureIndex = mesh.featureIds.indexOf(profile.featureId);
    let deepestVertex = -1;
    for (let v = 0; v < artifact.vertexCount; v++) if (mesh.triangleFeatures[Math.floor(v / 3)] === featureIndex && (deepestVertex < 0 || a.bunkerDepthMm[v]! > a.bunkerDepthMm[deepestVertex]!)) deepestVertex = v;
    const inside: [number, number] = [mesh.vertices[deepestVertex * 3]!, mesh.vertices[deepestVertex * 3 + 1]!];
    expect(sample(inside)).toBeCloseTo(terrainHeight(mesh, inside)! - a.bunkerDepthMm[deepestVertex]! / 1000, 3);
    const fairway = scene.features.find(f => f.kind === 'fairway')!.parts[0]![0]!;
    const centroid: [number, number] = [fairway.reduce((sum, p) => sum + p[0], 0) / fairway.length, fairway.reduce((sum, p) => sum + p[1], 0) / fairway.length];
    if (terrainHeight(mesh, centroid) != null) expect(sample(centroid)).toBe(terrainHeight(mesh, centroid));
  });

  it('keeps mowing inside the played fairway, fading before its edge, in route-local metres', () => {
    const artifact = compileVisualArtifact(scene, mesh), a = artifact.attributes;
    const fairway = scene.features.find(feature => feature.kind === 'fairway')!;
    const rings = fairway.parts.flat();
    const route = scene.features.find(feature => feature.id === scene.hole.routeFeatureId)!.parts[0]![0]!;
    const routeLength = route.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - route[i]![0], point[1] - route[i]![1]), 0);
    let mown = 0, faded = 0, deep = 0;
    for (let t = 0; t < mesh.triangleFeatures.length; t++) {
      const featureIndex = mesh.triangleFeatures[t]!, kind = mesh.featureKinds[featureIndex]!, id = mesh.featureIds[featureIndex]!;
      for (let corner = 0; corner < 3; corner++) {
        const vertex = t * 3 + corner, x = mesh.vertices[vertex * 3]!, y = mesh.vertices[vertex * 3 + 1]!;
        const weight = a.mowingWeight[vertex]!;
        if (a.contextWeight[vertex]) expect(weight).toBe(0);
        if (kind !== 'fairway' || mesh.triangleMaterials[t] !== 0 || id !== fairway.id) { if (kind !== 'fairway') expect(weight).toBe(0); continue; }
        mown++;
        const distance = rings.reduce((minimum, ring) => Math.min(minimum, boundaryDistance([x, y], ring)), Infinity);
        expect(a.boundaryDistanceCm[vertex]! / 100).toBeCloseTo(Math.min(distance, 655), 1);
        // The compiler's edge ribbons (materials 1/2) own the last metre, so
        // the mown field starts inside them; its weight still ramps from there.
        expect(Math.abs(weight - Math.round(Math.min(1, distance / MERIDIAN_STYLE.mowing.edgeFadeM) * 255))).toBeLessThanOrEqual(2);
        if (weight < 255) faded++;
        if (distance > MERIDIAN_STYLE.mowing.edgeFadeM) { deep++; expect(weight).toBe(255); }
        const s = a.routeST[vertex * 2]!;
        expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(routeLength + 1e-6);
        expect(SURFACE_CLASS_IDS[a.surfaceClass[vertex]!]).toBe('fairway');
        expect(a.roughness[vertex]! / 255).toBeCloseTo(MERIDIAN_STYLE.surface.roughness.fairway, 1);
      }
    }
    expect(mown).toBeGreaterThan(100); expect(faded).toBeGreaterThan(0); expect(deep).toBeGreaterThan(0);
  });
});
