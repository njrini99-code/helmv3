import {
  ACESFilmicToneMapping, BackSide, Box3, Color, DirectionalLight, Fog, HemisphereLight, Mesh,
  OrthographicCamera, PCFShadowMap, PerspectiveCamera, Raycaster, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { installTerrainDebugView, type TerrainDebugView } from '@/components/golf/course-geometry/terrain-debug';
import { buildThreeLandscape, DEFAULT_THREE_LANDSCAPE_PALETTE } from '@/components/golf/course-geometry/three-landscape';
import { createVisualSurfaceSampler, MERIDIAN_CODES, type MeridianVisualArtifact } from './visual-artifact';
import { MERIDIAN_STYLE, MERIDIAN_STYLE_HASH, type MeridianStyleOverrides } from './visual-style';
import { applyTerrainCamera, pickTerrainPoint, type TerrainThreeCamera } from './three-camera';
import { buildThreeFlightPaths, type ThreeFlightPaths } from './three-flight-path';
import { createShotOverlayController, type OverlayReservedRect } from './shot-overlay-controller';
import { createSceneMarkerOverlayController, type SceneMarkerOverlayController, type SceneMarkers } from './scene-markers';
import { TERRAIN_LIGHT_DIRECTION, type Point3M, type TerrainCamera, type TerrainMesh } from './terrain';
import { fitShadowBounds } from './shadow-bounds';
import { budgetViewFor, detectRenderQuality, percentile, profilePixelRatio, qualityOverrides, readRenderCapabilities, RENDER_BUDGETS, RENDER_QUALITY_PROFILES, type MeridianRenderQuality } from './render-quality';
import type { TerrainRuntimeController } from './runtime-controller';
import type { HoleScene } from './types';

export interface ThreeTerrainRuntime extends TerrainRuntimeController {
  ready: Promise<void>;
  setEvidence(scene: HoleScene, selectedShotNumber?: number): void;
  /** Player-marked positions (One-Tap), painted with the evidence overlay in the same frame. */
  setMarkers(markers: SceneMarkers | null): void;
  /** Host chrome drawn over the course (stage HUD); evidence labels keep clear of it. */
  setReservedRects(rects: readonly OverlayReservedRect[]): void;
  dispose(): void;
}

interface RuntimeOptions {
  canvas: HTMLCanvasElement;
  overlay: SVGSVGElement;
  overlayId: string;
  scene: HoleScene;
  mesh: TerrainMesh;
  camera: TerrainCamera;
  width: number;
  height: number;
  selectedShotNumber?: number;
  onUnavailable: () => void;
  debugView?: TerrainDebugView;
  /** Meridian V2 world (master plan R7): `v2` draws the V2 ground, patches
   * and objects in place of the V1 terrain and canopy, with the shot overlay
   * and markers intact; `v1` (default) is the shipped V1 world. A V2 compile
   * failure falls back to V1 in place (`installTerrainDebugView`). */
  world?: 'v1' | 'v2';
  /** Cached visual world for this hole (§6). Absent → compiled at runtime and
   * reported as MERIDIAN_ARTIFACT_MISSING; mismatched → refused, recompiled at
   * runtime and reported as MERIDIAN_ARTIFACT_MISMATCH (§105). */
  visualArtifact?: MeridianVisualArtifact;
  styleOverrides?: MeridianStyleOverrides;
  /** §64: rendering tier. `auto` (default) detects from device capability. */
  quality?: MeridianRenderQuality | 'auto';
}

/** A view that cannot answer the query is never treated as asking for motion. */
function prefersReducedMotion(view: Window | null): boolean {
  try { return typeof view?.matchMedia === 'function' && view.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** §68.4 / §70: bytes held by every distinct geometry in the world. */
function estimateGeometryBytes(world: Scene): number {
  const seen = new Set<object>();
  let bytes = 0;
  world.traverse(object => {
    const geometry = (object as Mesh).geometry;
    if (!geometry || seen.has(geometry)) return;
    seen.add(geometry);
    for (const attribute of Object.values(geometry.attributes)) bytes += (attribute as { array: ArrayLike<number> & { byteLength?: number } }).array.byteLength ?? 0;
    if (geometry.index) bytes += geometry.index.array.byteLength;
  });
  return bytes;
}

/** Lazy, scene-owned Three backend. It renders on camera/evidence changes only;
 * there is no animation loop, React render, provider request, or source edit. */
export function createThreeTerrainRuntime(options: RuntimeOptions): ThreeTerrainRuntime {
  const { canvas, overlay, mesh } = options;
  const renderer = new WebGLRenderer({ canvas, alpha: false, antialias: true, depth: true, powerPreference: 'default' });
  const world = new Scene(), raycaster = new Raycaster();
  // One real camera per projection. Programs do not depend on the camera
  // type, so a preset transition between them costs no recompilation.
  const orthographicView = new OrthographicCamera(), perspectiveView = new PerspectiveCamera();
  let view: TerrainThreeCamera = orthographicView;
  let landscape: ReturnType<typeof buildThreeLandscape> | null = null;
  // §33–34: drawn markers sit on the drawn surface (bunker bowls); the
  // canonical `terrainHeight` still answers every pick and every metric.
  let surface: ((point: readonly [number, number]) => number | null) | undefined;
  let flightPaths: ThreeFlightPaths | null = null;
  let evidence: ReturnType<typeof createShotOverlayController> | null = null;
  let markersOverlay: SceneMarkerOverlayController | null = null;
  let sun: DirectionalLight | null = null;
  // §51–52 atmosphere: distance haze and a sky/horizon dome exist only behind
  // the perspective presets; Top keeps the map-like ground background.
  let haze: Fog | null = null, hazeMix = 0, skyDome: Mesh<SphereGeometry, ShaderMaterial> | null = null;
  const groundBackground = new Color(DEFAULT_THREE_LANDSCAPE_PALETTE.ground), hazeBackground = new Color(MERIDIAN_STYLE.haze.color);
  function applyAtmosphere(projection: TerrainCamera['projection']) {
    const perspective = projection === 'perspective';
    world.fog = perspective ? haze : null;
    if (skyDome) skyDome.visible = perspective;
    world.background = perspective ? hazeBackground : groundBackground;
  }
  let disposed = false, failed = false, ready = false, shaderFailed = false;
  let currentCamera = options.camera, width = options.width, height = options.height;
  let currentScene = options.scene, currentSelected = options.selectedShotNumber;
  let previousWidth = 0, previousHeight = 0, previousRatio = 0;
  let previousExaggeration = NaN, previousReference = NaN, renderCount = 0;
  // §72: bakes since ready, not renders — one per relevant change, however
  // many of setCamera's checks asked for one. §20: first-paint precompile time.
  let shadowUpdates = 0, shaderCompileMs = 0, landscapeBuildMs = 0;
  let viewDistance = 1_000;
  let releaseDebug: (() => void) | undefined;
  let crownDetail: 'near' | 'distant' = 'distant';
  let detailSignature = '';
  // §64: one tier per runtime; chosen once so the scene never flickers
  // between budgets mid-session. Lab and tests may override it.
  const capabilities = readRenderCapabilities(canvas.ownerDocument.defaultView);
  capabilities.maxTextureSize = renderer.capabilities.maxTextureSize;
  const qualityBasis = options.quality && options.quality !== 'auto' ? 'override' : 'detected';
  const quality = RENDER_QUALITY_PROFILES[qualityBasis === 'override' ? options.quality as MeridianRenderQuality : detectRenderQuality(capabilities)];
  const frameTimes: number[] = [];
  // §68.1: GPU time per frame through EXT_disjoint_timer_query_webgl2 when the
  // context offers it (Chrome/ANGLE; absent on most WebViews). CPU submit time
  // alone hides fill-bound frames on phones, so both are reported.
  const gpuTimes: number[] = [];
  const pendingQueries: WebGLQuery[] = [];
  let timerExt: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null;
  let timerBasis: 'ext_disjoint_timer_query' | 'unavailable' = 'unavailable';
  const pollGpuTimers = (gl: WebGL2RenderingContext) => {
    if (!timerExt) return;
    while (pendingQueries.length) {
      const query = pendingQueries[0]!;
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
      pendingQueries.shift();
      if (!gl.getParameter(timerExt.GPU_DISJOINT_EXT)) {
        gpuTimes.push(Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 1e6);
        if (gpuTimes.length > 30) gpuTimes.shift();
      }
      gl.deleteQuery(query);
    }
  };
  let geometryBytes = 0;

  function fitSun() {
    if (!landscape || !sun) return;
    const tactical = mesh.renderProfile?.tacticalBoundsM ?? options.scene.features
      .filter(f => f.kind !== 'woods' && f.kind !== 'rough').reduce<[number, number, number, number]>((box, f) => {
        for (const part of f.parts) for (const ring of part) for (const [x, y] of ring) {
          box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
        }
        return box;
      }, [Infinity, Infinity, -Infinity, -Infinity]);
    if (!tactical.every(Number.isFinite)) return;
    const positions = landscape.terrain.geometry.getAttribute('position');
    let low = Infinity, high = -Infinity;
    for (let i = 0; i < positions.count; i++) { const z = positions.getZ(i); low = Math.min(low, z); high = Math.max(high, z); }
    // Conservative reach includes the displayed source relief, maximum style
    // crown height and crown radius. Downhill receivers need more than h/tan(a).
    const margin = (high - low + 15) * Math.hypot(TERRAIN_LIGHT_DIRECTION[0], TERRAIN_LIGHT_DIRECTION[1]) / TERRAIN_LIGHT_DIRECTION[2] + 6;
    const receiver = new Box3(new Vector3(tactical[0] - margin, tactical[1] - margin, -Infinity), new Vector3(tactical[2] + margin, tactical[3] + margin, Infinity));
    const points: Point3M[] = [];
    const p = new Vector3();
    for (let i = 0; i < positions.count; i++) {
      p.fromBufferAttribute(positions, i);
      if (receiver.containsPoint(p)) points.push([p.x, p.y, p.z]);
    }
    for (const child of landscape.group.children) {
      if (child === landscape.terrain) continue;
      const box = new Box3().setFromObject(child);
      if (!receiver.intersectsBox(box)) continue;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) points.push([x, y, z]);
    }
    if (!points.length) return;
    const fit = fitShadowBounds(points, TERRAIN_LIGHT_DIRECTION);
    const distance = fit.depth + 100;
    sun.target.position.set(...fit.center);
    sun.position.set(...fit.center).addScaledVector(new Vector3(...fit.axis), distance);
    const shadow = sun.shadow.camera;
    shadow.up.set(...fit.up);
    shadow.left = -fit.width / 2; shadow.right = fit.width / 2;
    shadow.top = fit.height / 2; shadow.bottom = -fit.height / 2;
    shadow.near = Math.max(.1, distance - fit.depth / 2 - 10); shadow.far = distance + fit.depth / 2 + 10;
    shadow.updateProjectionMatrix();
    canvas.dataset.shadowSpanM = `${fit.width.toFixed(1)},${fit.height.toFixed(1)}`;
  }

  function dispose() {
    if (renderer && pendingQueries.length) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      for (const query of pendingQueries.splice(0)) gl.deleteQuery(query);
    }
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('webglcontextlost', lost);
    releaseDebug?.(); evidence?.dispose(); markersOverlay?.dispose(); flightPaths?.dispose(); landscape?.dispose(); sun?.shadow.dispose();
    skyDome?.geometry.dispose(); skyDome?.material.dispose();
    world.clear(); renderer.dispose();
    // React may replace the runtime while retaining the canvas (new geometry,
    // review eligibility or Strict Mode). Dispose GPU resources every time,
    // but force loss only after final DOM removal so replacements can reuse it.
    if (!canvas.isConnected) renderer.forceContextLoss();
  }
  function fail(code?: string) {
    if (failed || disposed) return;
    failed = true;
    canvas.dataset.terrainState = 'unavailable';
    if (code) canvas.dataset.meridianCode = code;
    options.onUnavailable();
    dispose();
  }
  function lost(event: Event) { event.preventDefault(); fail(); }
  canvas.addEventListener('webglcontextlost', lost);

  function replaceFlightPaths(scene: HoleScene, camera: TerrainCamera) {
    flightPaths?.dispose();
    flightPaths = buildThreeFlightPaths(scene, mesh, camera, currentSelected, surface);
    flightPaths.setResolution(width, height);
    world.add(flightPaths.group);
  }

  function setCamera(camera: TerrainCamera, w: number, h: number) {
    currentCamera = camera; width = w; height = h;
    if (disposed || failed || !ready || !landscape || !evidence) return;
    try {
      // §72: set once below, however many checks in this function ask for a
      // bake — three.js consumes both `needsUpdate` flags on the next render.
      let dirtyShadow = false;
      const ratio = profilePixelRatio(quality, canvas.ownerDocument.defaultView?.devicePixelRatio || 1, width, height);
      if (width !== previousWidth || height !== previousHeight || ratio !== previousRatio) {
        renderer.setPixelRatio(ratio); renderer.setSize(width, height, false);
        previousWidth = width; previousHeight = height; previousRatio = ratio;
        flightPaths?.setResolution(width, height);
      }
      if (previousExaggeration !== camera.exaggeration || previousReference !== camera.referenceElevationM) {
        landscape.setExaggeration(camera.exaggeration, camera.referenceElevationM);
        replaceFlightPaths(currentScene, camera);
        fitSun();
        dirtyShadow = true;
        previousExaggeration = camera.exaggeration; previousReference = camera.referenceElevationM;
      }
      // A perspective view always grants the near band: the per-tree distance
      // from the eye bounds how many crowns take it. An orthographic view has
      // one scale for every tree, so the scale decides with hysteresis.
      const nextDetail = !quality.nearCrowns ? 'distant' : camera.projection === 'perspective' ? 'near' : camera.scale > 4.5 ? 'near' : camera.scale < 3.7 ? 'distant' : crownDetail;
      // Crown LOD (§37/§68): a perspective view hands the landscape its lens so
      // every crown is judged by projected size (a side view stands the eye
      // among the foreground trees, which keep their full crowns while the far
      // end of the hole drops to the silhouette); an orthographic view keeps
      // the focus-distance bands. A 12 m eye/focus move or a 4 % focal change
      // re-evaluates every tree in every mode.
      const perspectiveLod = camera.projection === 'perspective' && camera.eyeM && camera.focalPx ? { eye: camera.eyeM, focalPx: camera.focalPx } : undefined;
      const lodSignature = perspectiveLod
        ? `p:${Math.round(perspectiveLod.eye[0] / 12)},${Math.round(perspectiveLod.eye[1] / 12)},${Math.round(perspectiveLod.eye[2] / 12)},${Math.round(perspectiveLod.focalPx / 25)}`
        : `o:${Math.round(camera.focusM[0] / 12)},${Math.round(camera.focusM[1] / 12)}`;
      if (nextDetail !== crownDetail || lodSignature !== detailSignature) {
        crownDetail = nextDetail; detailSignature = lodSignature;
        if (landscape.setDetail(nextDetail, [camera.focusM[0], camera.focusM[1]], perspectiveLod)) { fitSun(); dirtyShadow = true; geometryBytes = estimateGeometryBytes(world); }
      }
      view = camera.projection === 'perspective' ? perspectiveView : orthographicView;
      applyAtmosphere(camera.projection);
      applyTerrainCamera(view, camera, width, height, viewDistance);
      // §72: renderer- and light-level gates are independent (three.js
      // WebGLShadowMap.render() early-returns on the first, `continue`s past
      // a light on the second) — a bake sets both `needsUpdate`s together.
      // One counted bake per call, however many checks above asked for one.
      if (dirtyShadow && sun) { renderer.shadowMap.needsUpdate = true; sun.shadow.needsUpdate = true; shadowUpdates++; }
      const gl = renderer.getContext() as WebGL2RenderingContext;
      pollGpuTimers(gl);
      const query = timerExt && pendingQueries.length < 4 ? gl.createQuery() : null;
      if (query && timerExt) gl.beginQuery(timerExt.TIME_ELAPSED_EXT, query);
      const began = performance.now();
      renderer.render(world, view);
      const frameMs = performance.now() - began;
      if (query && timerExt) { gl.endQuery(timerExt.TIME_ELAPSED_EXT); pendingQueries.push(query); }
      frameTimes.push(frameMs); if (frameTimes.length > 30) frameTimes.shift();
      if (shaderFailed) { fail(MERIDIAN_CODES.shaderFailed); return; }
      if (renderer.getContext().isContextLost()) { fail(MERIDIAN_CODES.contextLost); return; }
      // All world overlays update in the same synchronous paint as the GPU.
      // They intentionally remain readable through crowns (estimated evidence
      // is an annotation, not an opaque physical object in the landscape).
      evidence.setCamera(camera, width, height);
      markersOverlay?.setCamera(camera, width, height);
      Object.assign(canvas.dataset, {
        terrainRenderer: 'three-webgl2', terrainState: 'ready', terrainHash: mesh.contentHash,
        terrainProjection: camera.projection ?? 'orthographic',
        // Design FOV spans the HUD-safe fit height; the frame FOV is what the
        // full canvas actually sees through the shift lens.
        terrainFov: camera.projection === 'perspective' ? String(camera.fovDegrees ?? '') : '',
        terrainFovFrame: camera.projection === 'perspective' && camera.focalPx ? (2 * Math.atan(height / 2 / camera.focalPx) * 180 / Math.PI).toFixed(2) : '',
        terrainEyeDistanceM: camera.projection === 'perspective' && camera.eyeM ? Math.hypot(camera.eyeM[0] - camera.focusM[0], camera.eyeM[1] - camera.focusM[1]).toFixed(1) : '',
        visualStyleVersion: String(landscape.group.userData.styleVersion ?? ''),
        visualStyleHash: MERIDIAN_STYLE_HASH, visualArtifactHash: landscape.artifact.contentHash, visualArtifactSource: landscape.artifactSource,
        visualBunkers: String(landscape.artifact.layers.bunkerBowl.profiles.length),
        visualHaze: world.fog ? hazeMix.toFixed(2) : '0', visualSky: skyDome?.visible ? 'gradient' : 'ground',
        contextZones: String(landscape.counts.contextZones), contextMassLobes: String(landscape.counts.contextMassLobes), understory: String(landscape.counts.understory), contextRibbons: String(landscape.counts.contextRibbons), contextStructures: String(landscape.counts.contextStructures), contextLayerHash: currentScene.contextLayerHash ?? '',
        qualityTier: quality.tier, qualityBasis,
        // §72: bakes since ready (renderer + sun.shadow needsUpdate set
        // together, never on their own) — captures can compare against
        // renderCount to see the updates the discipline saved.
        shadowMapSize: `${sun?.shadow.mapSize.x ?? 0}`, shadowMapType: 'pcf', shadowUpdates: String(shadowUpdates),
        // §68 budgets: frame P95 over the last 30 renders, draw calls against
        // the view's target, triangles by category, and a memory estimate.
        frameP95Ms: percentile(frameTimes, 95).toFixed(2), frameBudgetMs: String(quality.targetFrameMs),
        gpuFrameP95Ms: gpuTimes.length ? percentile(gpuTimes, 95).toFixed(2) : '', gpuTimerBasis: timerBasis,
        // §20: first-paint shader precompile time, covering every material in
        // `world` at ready-time — including whichever debug view (v2-lod0/1/2,
        // v2-hero, v2-world) installed its own materials before this resolved.
        shaderCompileMs: shaderCompileMs.toFixed(2),
        drawCallBudget: String(RENDER_BUDGETS.drawCalls[budgetViewFor(camera.pitch)]),
        drawCallStatus: renderer.info.render.calls <= RENDER_BUDGETS.drawCalls[budgetViewFor(camera.pitch)] ? 'within' : 'over',
        triangleBreakdown: `terrain:${landscape.counts.terrainTriangles} crownNear:${landscape.counts.crownNearTriangles} crownDistant:${landscape.counts.crownDistantTriangles} crownFar:${landscape.counts.crownFarTriangles} trunks:${landscape.counts.trunkTriangles} mass:${landscape.counts.massTriangles} flight:${flightPaths?.count ?? 0}`,
        treeLod: `near:${landscape.counts.lodTrees.near} distant:${landscape.counts.lodTrees.distant} far:${landscape.counts.lodTrees.far} hiddenTrunks:${landscape.counts.lodTrees.hidden}`,
        crownLodBasis: landscape.counts.crownLodBasis,
        multiDrawBasis: renderer.extensions.has('WEBGL_multi_draw') ? 'webgl_multi_draw' : 'per_instance_fallback',
        geometryMemoryMb: (geometryBytes / 1_048_576).toFixed(1),
        shadowMemoryMb: (((sun?.shadow.mapSize.x ?? 0) ** 2 * 4) / 1_048_576).toFixed(1),
        renderTargetMb: ((canvas.width * canvas.height * 8) / 1_048_576).toFixed(1),
        lightDirection: TERRAIN_LIGHT_DIRECTION.map(v => v.toFixed(3)).join(','),
        frameMs: frameMs.toFixed(2),
        terrainPitch: String(camera.pitch), terrainYaw: String(camera.yawOffset),
        terrainExaggeration: String(camera.exaggeration), terrainScale: String(camera.scale),
        terrainFocus: camera.focusM.join(','), terrainTriangles: String(landscape.counts.terrainTriangles),
        terrainTrees: String(landscape.counts.trees), terrainMassLobes: String(landscape.counts.massLobes), terrainTrunks: String(landscape.counts.trunksVisible),
        treeFamilies: Object.entries(landscape.counts.families).sort().map(([id, count]) => `${id}:${count}`).join(' '),
        renderCount: String(++renderCount),
        flightPaths: String(flightPaths?.count ?? 0),
        puttingTracks: String(flightPaths?.puttingCount ?? 0),
        cssWidth: String(width), cssHeight: String(height), bufferWidth: String(canvas.width), bufferHeight: String(canvas.height), pixelRatio: String(ratio),
        debugView: options.debugView ?? 'final',
        renderWorld: options.world ?? 'v1',
        // Task 20: the V2 world's synchronous compile time at mount ('' on V1),
        // and the V1 landscape build every mount pays first (artifact compile
        // when no cache is supplied, terrain geometry, crowns).
        v2BuildMs: String((landscape.terrain.userData.debugV2 as { buildMs?: number } | undefined)?.buildMs ?? ''),
        landscapeBuildMs: landscapeBuildMs.toFixed(0),
        crownDetail,
        drawCalls: String(renderer.info.render.calls), renderTriangles: String(renderer.info.render.triangles),
      });
    } catch { fail(); }
  }

  try {
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = MERIDIAN_STYLE.light.exposure;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
    timerExt = (renderer.getContext().getExtension('EXT_disjoint_timer_query_webgl2') as typeof timerExt) ?? null;
    timerBasis = timerExt ? 'ext_disjoint_timer_query' : 'unavailable';
    // §72: paired with `sun.shadow.autoUpdate` below (also false) — three.js
    // gates a bake on both, and `setCamera`'s single `dirtyShadow` bake sets
    // both `needsUpdate`s together, or the sun would never re-shadow.
    renderer.shadowMap.autoUpdate = false;
    renderer.debug.checkShaderErrors = true;
    renderer.debug.onShaderError = () => { shaderFailed = true; };
    world.background = new Color(DEFAULT_THREE_LANDSCAPE_PALETTE.ground);
    const landscapeBegan = performance.now();
    const debugView = options.debugView ?? (options.world === 'v2' ? 'v2-world' : 'final'), underV2 = debugView === 'v2-world';
    landscape = buildThreeLandscape(options.scene, mesh, DEFAULT_THREE_LANDSCAPE_PALETTE, { artifact: options.visualArtifact, overrides: qualityOverrides(quality, options.styleOverrides), underV2 });
    landscapeBuildMs = performance.now() - landscapeBegan;
    // A cached artifact from another package or style is refused (§6). The
    // hole still draws its canonical terrain visual from a runtime compile
    // (§105); the refusal is reported here rather than as a schematic fallback.
    if (landscape.artifactSource === 'runtime') canvas.dataset.meridianCode = MERIDIAN_CODES.missing;
    else if (landscape.artifactSource === 'recompiled') canvas.dataset.meridianCode = MERIDIAN_CODES.mismatch;
    surface = createVisualSurfaceSampler(mesh, landscape.artifact);
    world.add(landscape.group);
    replaceFlightPaths(options.scene, options.camera);
    // Fixed lighting uses the whole physical package, not the moving camera
    // target. Yaw therefore reveals the same lit sides and real cast shadows.
    const bounds = new Box3().setFromObject(landscape.group);
    const centre = bounds.getCenter(new Vector3()), size = bounds.getSize(new Vector3());
    const radius = Math.max(40, size.length() / 2 + 32);
    viewDistance = radius * 4;
    // §51 haze: a linear ramp from startM that reaches maxMix at endM; the
    // package never extends far enough for the ramp to hide anything.
    hazeMix = MERIDIAN_STYLE.haze.maxMix * (options.styleOverrides?.haze ?? 1);
    haze = hazeMix > 0 ? new Fog(hazeBackground, MERIDIAN_STYLE.haze.startM, MERIDIAN_STYLE.haze.startM + (MERIDIAN_STYLE.haze.endM - MERIDIAN_STYLE.haze.startM) / hazeMix) : null;
    skyDome = buildSkyDome(viewDistance * .9);
    skyDome.position.copy(centre);
    world.add(skyDome);
    const sunlight = new Vector3(...TERRAIN_LIGHT_DIRECTION).normalize();
    sun = new DirectionalLight(MERIDIAN_STYLE.light.sunColor, MERIDIAN_STYLE.light.sunIntensity);
    sun.position.copy(centre).addScaledVector(sunlight, radius * 3);
    sun.target.position.copy(centre);
    sun.castShadow = true;
    const shadowCamera = sun.shadow.camera;
    shadowCamera.left = -radius; shadowCamera.right = radius;
    shadowCamera.top = radius; shadowCamera.bottom = -radius;
    shadowCamera.near = .1; shadowCamera.far = radius * 6;
    sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    sun.shadow.bias = MERIDIAN_STYLE.shadow.bias; sun.shadow.normalBias = MERIDIAN_STYLE.shadow.normalBias;
    sun.shadow.radius = MERIDIAN_STYLE.shadow.radius;
    sun.shadow.autoUpdate = false;
    sun.shadow.camera.updateProjectionMatrix();
    world.add(sun, sun.target);
    const sky = new HemisphereLight(MERIDIAN_STYLE.light.skyColor, MERIDIAN_STYLE.light.groundColor, MERIDIAN_STYLE.light.hemisphereIntensity);
    sky.position.set(0, 0, 1); world.add(sky);
    evidence = createShotOverlayController(overlay, options.overlayId, mesh, options.scene, options.selectedShotNumber, false, surface);
    // §64 Reduced Motion, read from the window this canvas actually lives in
    // (the lab and the capture harness set it per page, not per global): no
    // ripple, no settle or crossfade, and no shot draws itself on — the
    // finished state is painted immediately instead.
    markersOverlay = createSceneMarkerOverlayController(overlay, mesh, surface, prefersReducedMotion(canvas.ownerDocument.defaultView));
    // R7: the V2 world is the same installer as the `v2-world` lab view, but as
    // a render mode the overlay stays — only an explicit debug view hides it.
    releaseDebug = installTerrainDebugView(world, landscape, mesh, debugView, renderer, options.scene);
    if (underV2 && !landscape.terrain.userData.debugV2) {
      // R7 fallback: the V2 compile declined (no metric grid, or a compiler
      // threw) and the V1 terrain is what the player sees — but the build
      // above skipped its shading texture and vegetation for the world that
      // never came. Rebuild it whole from the same artifact, so the fallback
      // is the real V1 hole and not a flat, treeless one.
      const rebuildBegan = performance.now(), previous = landscape;
      releaseDebug(); releaseDebug = () => {};
      world.remove(previous.group);
      landscape = buildThreeLandscape(options.scene, mesh, DEFAULT_THREE_LANDSCAPE_PALETTE, { artifact: previous.artifact, overrides: qualityOverrides(quality, options.styleOverrides) });
      previous.dispose();
      world.add(landscape.group);
      landscapeBuildMs += performance.now() - rebuildBegan;
    }
    if (options.debugView && options.debugView !== 'final') overlay.style.display = 'none';
    view = currentCamera.projection === 'perspective' ? perspectiveView : orthographicView;
    applyAtmosphere(currentCamera.projection);
    applyTerrainCamera(view, currentCamera, width, height, viewDistance);
    geometryBytes = estimateGeometryBytes(world);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(MERIDIAN_CODES.mismatch)) canvas.dataset.meridianCode = MERIDIAN_CODES.mismatch;
    dispose(); throw error;
  }

  // §20: first-paint precompile. `world` already carries whichever debug view
  // (v2-lod0/1/2, v2-hero, the forthcoming v2-world) installed its materials
  // above — installTerrainDebugView ran before this promise was built, and
  // WebGLRenderer.compile() gathers materials via a plain `traverse` (not
  // `traverseVisible`), so the initially-hidden sky dome compiles here too.
  // The elapsed time lands in the dataset via the first setCamera below.
  const compiled = Promise.resolve().then(() => {
    if (disposed) return undefined;
    const began = performance.now();
    return renderer.compileAsync(world, view).then(() => { shaderCompileMs = performance.now() - began; });
  }).then(() => {
    if (disposed) return;
    if (shaderFailed) { fail(); return; }
    ready = true;
    setCamera(currentCamera, width, height);
  }).catch(() => { fail(); });

  return {
    ready: compiled,
    setCamera,
    setEvidence(scene, selectedShotNumber) {
      if (disposed || failed || scene === currentScene && selectedShotNumber === currentSelected) return;
      currentScene = scene; currentSelected = selectedShotNumber;
      replaceFlightPaths(scene, currentCamera);
      evidence?.setEvidence(scene, selectedShotNumber);
      setCamera(currentCamera, width, height);
    },
    setMarkers(markers) {
      if (disposed || failed) return;
      markersOverlay?.setMarkers(markers);
    },
    setReservedRects(rects) {
      if (disposed || failed) return;
      evidence?.setReservedRects(rects);
    },
    pick(x, y) {
      return ready && !disposed && !failed && landscape
        ? pickTerrainPoint(landscape.terrain, view, mesh, x, y, width, height, raycaster) : null;
    },
    dispose,
  };
}

/** §52: a sky/horizon gradient dome behind perspective presets. It is drawn
 * first without depth, ignores fog and shadows, and carries no course data. */
function buildSkyDome(radius: number): Mesh<SphereGeometry, ShaderMaterial> {
  const material = new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false,
    uniforms: { zenith: { value: new Color(MERIDIAN_STYLE.sky.zenith) }, horizon: { value: new Color(MERIDIAN_STYLE.sky.horizon) }, below: { value: new Color(MERIDIAN_STYLE.sky.below) }, curve: { value: MERIDIAN_STYLE.sky.curve }, belowSpan: { value: MERIDIAN_STYLE.sky.belowSpan } },
    vertexShader: `varying vec3 vDir;
void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 below; uniform float curve; uniform float belowSpan; varying vec3 vDir;
void main() {
  // Above the horizon: horizon → zenith by sin(elevation)^curve. Below it
  // (where the package ends before the horizon): horizon → distant-land haze.
  vec3 sky = mix(horizon, zenith, pow(clamp(vDir.z, 0.0, 1.0), curve));
  vec3 land = mix(horizon, below, smoothstep(0.0, belowSpan, -vDir.z));
  gl_FragColor = vec4(vDir.z >= 0.0 ? sky : land, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  material.name = 'meridian-sky';
  const dome = new Mesh(new SphereGeometry(radius, 32, 12), material);
  dome.name = 'meridian-sky-dome';
  dome.renderOrder = -1; dome.frustumCulled = false; dome.visible = false;
  dome.userData = { basis: 'visual_only', layer: 'sky' };
  return dome;
}
