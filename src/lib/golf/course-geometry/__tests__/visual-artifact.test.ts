import { describe, expect, it } from 'vitest';
import source from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';
import { pilotPackage, pilotScene } from '@/test/fixtures/course-geometry/pilot';
import { parseTerrainMesh, terrainHeight, TERRAIN_LIGHT_DIRECTION } from '../terrain';
import { inRing } from '../spatial';
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
      const scale = (profile.contextOnly ? MERIDIAN_STYLE.bunker.contextDepthScale : 1) * MERIDIAN_STYLE.bunker.familyDepthScale[profile.family];
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

describe('Rough hierarchy and ground zones (outside world §10–16, §21)', () => {
  const style = MERIDIAN_STYLE, bands = style.roughHierarchy;
  it('banks rough by distance from the nearest playing surface and blends the tones', () => {
    const artifact = compileVisualArtifact(scene, mesh), a = artifact.attributes;
    const playing = scene.features.filter(f => f.kind === 'fairway' || f.kind === 'tee' || f.kind === 'green').flatMap(f => f.parts.flat());
    let primary = 0, secondary = 0, outer = 0;
    for (let t = 0; t < mesh.triangleFeatures.length; t++) {
      const kind = mesh.featureKinds[mesh.triangleFeatures[t]!];
      for (let corner = 0; corner < 3; corner++) {
        const vertex = t * 3 + corner, cls = SURFACE_CLASS_IDS[a.surfaceClass[vertex]!], d = a.surroundDistanceCm[vertex]! / 100;
        if (cls === 'apron') continue; // the green complex claims the neck after banding (tested below)
        if (kind !== 'rough' && kind !== 'ground' || cls === 'surround' || cls === 'fringe') { expect(d).toBe(0); expect(['rough_secondary', 'rough_outer']).not.toContain(cls); continue; }
        const x = mesh.vertices[vertex * 3]!, y = mesh.vertices[vertex * 3 + 1]!;
        const truth = Math.min(60, playing.reduce((min, ring) => Math.min(min, boundaryDistance([x, y], ring)), Infinity));
        expect(d).toBeCloseTo(truth, 1);
        if (d >= bands.outerM) { outer++; expect(cls).toBe('rough_outer'); expect(a.roughness[vertex]! / 255).toBeCloseTo(style.surface.roughness.rough_outer, 1); }
        else if (d >= bands.secondaryM) { secondary++; expect(cls).toBe('rough_secondary'); }
        else { primary++; expect(cls).toBe(kind); }
      }
    }
    expect(primary).toBeGreaterThan(0); expect(secondary).toBeGreaterThan(0); expect(outer).toBeGreaterThan(0);
    expect(artifact.layers.roughHierarchy).toMatchObject({ basis: 'visual_only', secondaryM: bands.secondaryM, outerM: bands.outerM, secondaryVertices: secondary, outerVertices: outer });
    expect(artifact.layers.groundZones).toMatchObject({ basis: 'visual_only', painted: 0, classes: {}, skippedUncertain: 0 });
    expect(artifact.contextLayerHash).toBeNull();
  });
  it('paints classified ground zones from the context layer, skips uncertain ones, and gates on the layer hash', () => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < mesh.vertices.length; i += 3) { minX = Math.min(minX, mesh.vertices[i]!); maxX = Math.max(maxX, mesh.vertices[i]!); minY = Math.min(minY, mesh.vertices[i + 1]!); maxY = Math.max(maxY, mesh.vertices[i + 1]!); }
    const box = (x0: number, y0: number, x1: number, y1: number) => [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]] as [number, number][][][];
    const zone = (id: string, cls: string, basis: 'source' | 'uncertain', parts: [number, number][][][]) => ({
      id, class: cls, type: 'Polygon' as const, parts, basis, reviewed: false, fidelity: 'medium' as const, render: 'ground' as const, attributes: {},
    });
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
    const contextZones = [
      zone('z-parking', 'parking', 'source', box(minX, minY, midX, midY)),
      zone('z-field', 'open_field', 'source', box(midX, minY, maxX, midY)),
      zone('z-unsure', 'ski_slope', 'uncertain', box(minX, midY, maxX, maxY)),
    ];
    const withZones = { ...scene, contextZones: contextZones as never, contextLayerHash: 'a'.repeat(64) };
    const artifact = compileVisualArtifact(withZones, mesh), a = artifact.attributes, plain = compileVisualArtifact(scene, mesh);
    expect(artifact.contextLayerHash).toBe('a'.repeat(64));
    expect(artifact.contentHash).not.toBe(plain.contentHash);
    expect(artifact.layers.groundZones.skippedUncertain).toBe(1);
    expect(artifact.layers.groundZones.painted).toBeGreaterThan(0);
    expect(Object.keys(artifact.layers.groundZones.classes).sort()).toEqual(['open_field', 'parking']);
    const parking = new Set<number>(), field = new Set<number>();
    for (let t = 0; t < mesh.triangleFeatures.length; t++) {
      const kind = mesh.featureKinds[mesh.triangleFeatures[t]!];
      for (let corner = 0; corner < 3; corner++) {
        const vertex = t * 3 + corner, cls = SURFACE_CLASS_IDS[a.surfaceClass[vertex]!];
        const x = mesh.vertices[vertex * 3]!, y = mesh.vertices[vertex * 3 + 1]!;
        if (cls === 'parking') { parking.add(vertex); expect(kind === 'rough' || kind === 'ground').toBe(true); expect(x <= midX && y <= midY).toBe(true); expect(a.turfWeight[vertex]).toBe(0); }
        if (cls === 'open_field') { field.add(vertex); expect(x >= midX && y <= midY).toBe(true); expect(a.turfWeight[vertex]).toBe(255); }
        // The uncertain zone painted nothing: its vertices keep the distance bands.
        if ((kind === 'rough' || kind === 'ground') && y > midY + 1) expect(['rough', 'ground', 'rough_secondary', 'rough_outer', 'surround', 'fringe', 'apron']).toContain(cls);
        expect(cls).not.toBe('ski_slope');
      }
    }
    expect(parking.size + field.size).toBe(artifact.layers.groundZones.painted);
    // Hash gate: an artifact compiled without the context layer must not serve a scene that carries one, and vice versa.
    expect(() => assertVisualArtifact(plain, withZones, mesh)).toThrow(/context/);
    expect(() => assertVisualArtifact(artifact, scene, mesh)).toThrow(/context/);
    assertVisualArtifact(artifact, withZones, mesh);
    const parsed = parseVisualArtifact(serializeVisualArtifact(artifact));
    expect(parsed.contentHash).toBe(artifact.contentHash);
    expect(Array.from(parsed.attributes.surroundDistanceCm)).toEqual(Array.from(a.surroundDistanceCm));
  });
});

describe('Green complex, fairway edges and bunker lips (fidelity §10, §13–21, §26–28)', () => {
  const style = MERIDIAN_STYLE;
  it('derives an apron neck between the hole\'s own fairway and green, lips the green edge, and shades the pad setting', () => {
    const artifact = compileVisualArtifact(scene, mesh), a = artifact.attributes, complex = artifact.layers.greenComplex;
    expect(complex).toMatchObject({ basis: 'visual_only', version: 'green-complex-v1', apronBasis: 'derived_neck' });
    expect(complex.apronVertices).toBeGreaterThan(0); expect(complex.edgeVertices).toBeGreaterThan(0);
    const greens = scene.features.filter(f => f.kind === 'green').flatMap(f => f.parts.flat());
    const fairways = scene.features.filter(f => f.kind === 'fairway').flatMap(f => f.parts.flat());
    const near = (x: number, y: number, rings: readonly (readonly (readonly [number, number])[])[]) => rings.reduce((min, ring) => Math.min(min, boundaryDistance([x, y], ring)), Infinity);
    let aprons = 0;
    for (let t = 0; t < mesh.triangleFeatures.length; t++) {
      const kind = mesh.featureKinds[mesh.triangleFeatures[t]!];
      for (let corner = 0; corner < 3; corner++) {
        const vertex = t * 3 + corner, cls = SURFACE_CLASS_IDS[a.surfaceClass[vertex]!];
        if (cls !== 'apron') continue;
        aprons++;
        const x = mesh.vertices[vertex * 3]!, y = mesh.vertices[vertex * 3 + 1]!;
        // Apron lives only in rough/ground, within reach of both its own green and its own fairway.
        expect(kind === 'rough' || kind === 'ground').toBe(true);
        expect(near(x, y, greens)).toBeLessThanOrEqual(style.greenComplex.apronGreenM + .05);
        expect(near(x, y, fairways)).toBeLessThanOrEqual(style.greenComplex.apronFairwayM + .05);
        expect(a.roughness[vertex]! / 255).toBeCloseTo(style.surface.roughness.apron, 1);
        expect(a.turfWeight[vertex]).toBe(255); expect(a.mowingWeight[vertex]).toBe(0);
      }
    }
    expect(aprons).toBeGreaterThan(0); expect(aprons).toBeLessThanOrEqual(complex.apronVertices);
    // Nothing moved: the green ring vertices are canonical, only albedo changed.
    const plainStyle = { ...style, greenComplex: { ...style.greenComplex, greenEdgeShade: 0, fringeEdgeShade: 0, settingShade: 0 } };
    const plain = compileVisualArtifact(scene, mesh, plainStyle);
    let darker = 0, same = 0;
    for (let v = 0; v < artifact.vertexCount; v++) {
      const cls = SURFACE_CLASS_IDS[a.surfaceClass[v]!];
      if (cls !== 'green') continue;
      const sum = a.albedo[v * 3]! + a.albedo[v * 3 + 1]! + a.albedo[v * 3 + 2]!, base = plain.attributes.albedo[v * 3]! + plain.attributes.albedo[v * 3 + 1]! + plain.attributes.albedo[v * 3 + 2]!;
      if (a.boundaryDistanceCm[v]! / 100 < style.greenComplex.edgeFieldM) { expect(sum).toBeLessThanOrEqual(base); if (sum < base) darker++; }
      else { expect(sum).toBe(base); same++; }
    }
    expect(darker).toBeGreaterThan(0); expect(same).toBeGreaterThan(0);
  });
  it('types fairway edges by neighbour (crisp near bunkers and greens, soft elsewhere) without moving the outline', () => {
    const artifact = compileVisualArtifact(scene, mesh), a = artifact.attributes, edges = artifact.layers.fairwayEdges;
    expect(edges).toMatchObject({ basis: 'visual_only', version: 'edge-types-v1' });
    expect(edges.crispVertices + edges.softVertices).toBeGreaterThan(0);
    const neighbours = [...scene.features, ...(scene.contextFeatures ?? [])].filter(f => f.kind === 'bunker' || f.kind === 'green').flatMap(f => f.parts.flat());
    const plain = compileVisualArtifact(scene, mesh, { ...MERIDIAN_STYLE, fairwayEdge: { ...MERIDIAN_STYLE.fairwayEdge, crispShade: 0, softShade: 0 } });
    let crisp = 0, soft = 0, untouched = 0;
    for (let v = 0; v < artifact.vertexCount; v++) {
      if (SURFACE_CLASS_IDS[a.surfaceClass[v]!] !== 'fairway') continue;
      const d = a.boundaryDistanceCm[v]! / 100, x = mesh.vertices[v * 3]!, y = mesh.vertices[v * 3 + 1]!;
      const sum = a.albedo[v * 3]! + a.albedo[v * 3 + 1]! + a.albedo[v * 3 + 2]!, base = plain.attributes.albedo[v * 3]! + plain.attributes.albedo[v * 3 + 1]! + plain.attributes.albedo[v * 3 + 2]!;
      if (d >= MERIDIAN_STYLE.fairwayEdge.fieldM) { expect(sum).toBe(base); untouched++; continue; }
      expect(sum).toBeLessThanOrEqual(base);
      const nearMaintained = neighbours.reduce((min, ring) => Math.min(min, boundaryDistance([x, y], ring)), Infinity) <= MERIDIAN_STYLE.fairwayEdge.crispNearM;
      if (nearMaintained) crisp++; else soft++;
    }
    expect(untouched).toBeGreaterThan(0); expect(crisp + soft).toBe(edges.crispVertices + edges.softVertices);
    expect(crisp).toBe(edges.crispVertices); expect(soft).toBe(edges.softVertices);
  });
  it('raises a seeded grass lip around each bunker rim that is zero on the rim and varies per bunker', () => {
    const artifact = compileVisualArtifact(scene, mesh), a = artifact.attributes, bowl = artifact.layers.bunkerBowl;
    const [lipLow, lipHigh] = MERIDIAN_STYLE.bunker.lipM;
    for (const profile of bowl.profiles) {
      const scale = (profile.contextOnly ? MERIDIAN_STYLE.bunker.contextDepthScale : 1) * MERIDIAN_STYLE.bunker.familyLipScale[profile.family];
      expect(profile.lipM).toBeGreaterThanOrEqual(lipLow * scale - 1e-3); expect(profile.lipM).toBeLessThanOrEqual(lipHigh * scale + 1e-3);
      expect(profile.edgeBandM).toBeGreaterThan(0); expect(profile.edgeShade).toBeGreaterThan(0);
    }
    expect(new Set(bowl.profiles.map(p => p.lipM)).size).toBeGreaterThan(1);
    const all = [...scene.features, ...(scene.contextFeatures ?? [])];
    const rings = bowl.profiles.map(profile => ({ profile, rings: all.find(f => f.id === profile.featureId)!.parts.flat() }));
    let lifted = 0, maxLift = 0;
    for (let t = 0; t < mesh.triangleFeatures.length; t++) {
      const bunker = mesh.featureKinds[mesh.triangleFeatures[t]!] === 'bunker';
      for (let corner = 0; corner < 3; corner++) {
        const vertex = t * 3 + corner, lift = a.lipLiftMm[vertex]! / 1000;
        if (bunker) { expect(lift).toBe(0); continue; }
        const x = mesh.vertices[vertex * 3]!, y = mesh.vertices[vertex * 3 + 1]!;
        let nearest = Infinity, lipM = 0;
        for (const { profile, rings: r } of rings) { const d = r.reduce((min, ring) => Math.min(min, boundaryDistance([x, y], ring)), Infinity); if (d < nearest) { nearest = d; lipM = profile.lipM; } }
        if (nearest >= MERIDIAN_STYLE.bunker.lipBandM) { expect(lift).toBe(0); continue; }
        // Zero on the shared rim vertex (no crack), a rounded ridge inside the band.
        if (nearest < 1e-3) expect(lift).toBe(0);
        expect(lift).toBeCloseTo(lipM * Math.sin(Math.PI * nearest / MERIDIAN_STYLE.bunker.lipBandM), 2);
        if (lift > 0) { lifted++; maxLift = Math.max(maxLift, lift); }
      }
    }
    expect(lifted).toBeGreaterThan(0); expect(maxLift).toBeLessThanOrEqual(lipHigh * Math.max(...Object.values(MERIDIAN_STYLE.bunker.familyLipScale)) + 1e-3);
    // The display sampler adds the lip and the round trip keeps it.
    const parsed = parseVisualArtifact(serializeVisualArtifact(artifact));
    expect(Array.from(parsed.attributes.lipLiftMm)).toEqual(Array.from(a.lipLiftMm));
  });
});

describe('Bunker families, overhang shade and context contact (renderer redesign §9, §16)', () => {
  it('classifies each bunker as pot, greenside or fairway and scales depth and lip per family', () => {
    const artifact = compileVisualArtifact(scene, mesh);
    const all = [...scene.features, ...(scene.contextFeatures ?? [])];
    const greens = all.filter(f => f.kind === 'green').flatMap(f => f.parts.map(p => p[0]!));
    for (const profile of artifact.layers.bunkerBowl.profiles) {
      expect(['pot', 'greenside', 'fairway']).toContain(profile.family);
      const ring = all.find(f => f.id === profile.featureId)!.parts[0]![0]!;
      const centroid: [number, number] = [ring.reduce((s, q) => s + q[0], 0) / ring.length, ring.reduce((s, q) => s + q[1], 0) / ring.length];
      const greenDistance = Math.min(...greens.map(g => boundaryDistance(centroid, g)));
      const expected = profile.areaM2 < MERIDIAN_STYLE.bunker.potAreaM2 ? 'pot' : greenDistance < MERIDIAN_STYLE.bunker.greensideReachM ? 'greenside' : 'fairway';
      expect(profile.family).toBe(expected);
    }
  });
  it('darkens the sand just inside the sun-facing rim more than the rim facing away (overhang shadow)', () => {
    const artifact = compileVisualArtifact(scene, mesh), a = artifact.attributes;
    const all = [...scene.features, ...(scene.contextFeatures ?? [])];
    const [sx, sy] = [TERRAIN_LIGHT_DIRECTION[0], TERRAIN_LIGHT_DIRECTION[1]], n = Math.hypot(sx, sy);
    const sunSide: number[] = [], shadeSide: number[] = [];
    for (let t = 0; t < mesh.triangleFeatures.length; t++) {
      const featureIndex = mesh.triangleFeatures[t]!;
      if (mesh.featureKinds[featureIndex] !== 'bunker') continue;
      const rings = all.find(f => f.id === mesh.featureIds[featureIndex])!.parts.flat();
      for (let corner = 0; corner < 3; corner++) {
        const vertex = t * 3 + corner, x = mesh.vertices[vertex * 3]!, y = mesh.vertices[vertex * 3 + 1]!;
        let best = Infinity, bx = 0, by = 0;
        for (const ring of rings) for (let i = 0; i < ring.length; i++) {
          const [px, py] = ring[i]!, d = Math.hypot(px - x, py - y);
          if (d < best) { best = d; bx = px; by = py; }
        }
        if (best <= 0.05 || best >= MERIDIAN_STYLE.bunker.overhangBandM * .6) continue;
        const facing = ((bx - x) * sx + (by - y) * sy) / (best * n);
        const lum = a.albedo[vertex * 3]! + a.albedo[vertex * 3 + 1]! + a.albedo[vertex * 3 + 2]!;
        if (facing > .8) sunSide.push(lum); else if (facing < -.8) shadeSide.push(lum);
      }
    }
    expect(sunSide.length).toBeGreaterThan(0); expect(shadeSide.length).toBeGreaterThan(0);
    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
    expect(mean(sunSide)).toBeLessThan(mean(shadeSide));
  });
  it('shades the ground beside context structures and along path shoulders, never sand or water, never uncertain zones', () => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < mesh.vertices.length; i += 3) { minX = Math.min(minX, mesh.vertices[i]!); maxX = Math.max(maxX, mesh.vertices[i]!); minY = Math.min(minY, mesh.vertices[i + 1]!); maxY = Math.max(maxY, mesh.vertices[i + 1]!); }
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
    const box = [[[[midX - 6, midY - 6], [midX + 6, midY - 6], [midX + 6, midY + 6], [midX - 6, midY + 6], [midX - 6, midY - 6]]]] as [number, number][][][];
    const line = [[[[minX + 5, midY + 20], [maxX - 5, midY + 20]]]] as [number, number][][][];
    const zones = [
      { id: 'z-house', class: 'building', type: 'Polygon', parts: box, basis: 'source', reviewed: false, fidelity: 'medium', render: 'extrude', attributes: { heightM: 5 } },
      { id: 'z-path', class: 'cart_path', type: 'LineString', parts: line, basis: 'source', reviewed: false, fidelity: 'medium', render: 'ribbon', attributes: { widthM: 2.5 } },
      { id: 'z-unsure', class: 'building', type: 'Polygon', parts: [[[[minX + 2, minY + 2], [minX + 14, minY + 2], [minX + 14, minY + 14], [minX + 2, minY + 14], [minX + 2, minY + 2]]]], basis: 'uncertain', reviewed: false, fidelity: 'low', render: 'extrude', attributes: {} },
    ];
    const withZones = { ...scene, contextZones: zones as never, contextLayerHash: 'b'.repeat(64) };
    const plain = compileVisualArtifact(scene, mesh), artifact = compileVisualArtifact(withZones, mesh);
    expect(artifact.layers.contextContact).toMatchObject({ basis: 'visual_only', version: 'context-contact-v1', structures: 1, ribbons: 1 });
    expect(artifact.layers.contextContact.vertices).toBeGreaterThan(0);
    expect(plain.layers.contextContact.vertices).toBe(0);
    const { structureBandM, pathShoulderM } = MERIDIAN_STYLE.contextContact;
    const ring = box[0]![0]!;
    for (let t = 0; t < mesh.triangleFeatures.length; t++) {
      const kind = mesh.featureKinds[mesh.triangleFeatures[t]!];
      for (let corner = 0; corner < 3; corner++) {
        const vertex = t * 3 + corner, x = mesh.vertices[vertex * 3]!, y = mesh.vertices[vertex * 3 + 1]!;
        const before = plain.attributes.albedo[vertex * 3]!, after = artifact.attributes.albedo[vertex * 3]!;
        const houseD = inRing([x, y], ring) ? -1 : boundaryDistance([x, y], ring);
        const pathD = Math.abs(y - (midY + 20)) <= 0 && x >= minX + 5 && x <= maxX - 5 ? 0 : Math.hypot(Math.max(0, minX + 5 - x, x - (maxX - 5)), y - (midY + 20));
        const nearHouse = houseD >= 0 && houseD < structureBandM, nearPath = pathD < 1.25 + pathShoulderM;
        const nearUnsure = x < minX + 16 && y < minY + 16;
        if (kind === 'bunker' || kind === 'water') { expect(after).toBe(before); continue; }
        if (nearUnsure && !nearHouse && !nearPath) { expect(after).toBe(before); continue; }
        if (!nearHouse && !nearPath) expect(after).toBe(before);
        else if (before > 8) expect(after).toBeLessThanOrEqual(before);
      }
    }
  });
});

describe('Water bank berm (renderer redesign §13)', () => {
  it('raises a render-only berm beside a shoreline that is zero on the shoreline vertex and never on water', () => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < mesh.vertices.length; i += 3) { minX = Math.min(minX, mesh.vertices[i]!); maxX = Math.max(maxX, mesh.vertices[i]!); minY = Math.min(minY, mesh.vertices[i + 1]!); maxY = Math.max(maxY, mesh.vertices[i + 1]!); }
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
    const ring: [number, number][] = [[midX - 8, midY - 8], [midX + 8, midY - 8], [midX + 8, midY + 8], [midX - 8, midY + 8], [midX - 8, midY - 8]];
    const pond = { id: 'test-pond', kind: 'water', type: 'Polygon', parts: [[ring]], reviewed: true };
    const withPond = { ...scene, features: [...scene.features, pond as never] };
    const artifact = compileVisualArtifact(withPond, mesh), a = artifact.attributes, plain = compileVisualArtifact(scene, mesh);
    const { bankLipM, bankLipBandM } = MERIDIAN_STYLE.water;
    let lifted = 0, maxLift = 0;
    for (let t = 0; t < mesh.triangleFeatures.length; t++) {
      const kind = mesh.featureKinds[mesh.triangleFeatures[t]!];
      for (let corner = 0; corner < 3; corner++) {
        const vertex = t * 3 + corner, x = mesh.vertices[vertex * 3]!, y = mesh.vertices[vertex * 3 + 1]!;
        const lift = a.lipLiftMm[vertex]! / 1000, before = plain.attributes.lipLiftMm[vertex]! / 1000;
        const d = boundaryDistance([x, y], ring);
        if (kind === 'water') { expect(lift).toBe(0); continue; }
        if (d >= bankLipBandM) { expect(lift).toBe(before); continue; }
        if (d < 1e-3) { expect(lift).toBe(before); continue; }
        expect(lift).toBeGreaterThanOrEqual(Math.max(before, bankLipM * Math.sin(Math.PI * d / bankLipBandM)) - 2e-3);
        if (lift > before) { lifted++; maxLift = Math.max(maxLift, lift); }
      }
    }
    expect(lifted).toBeGreaterThan(0);
    expect(maxLift).toBeLessThanOrEqual(Math.max(bankLipM, MERIDIAN_STYLE.bunker.lipM[1] * 1.2) + 1e-3);
  });
});
