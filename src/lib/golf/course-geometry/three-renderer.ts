import {
  ACESFilmicToneMapping, Box3, Color, DirectionalLight, HemisphereLight,
  OrthographicCamera, PCFShadowMap, Raycaster, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { installTerrainDebugView, type TerrainDebugView } from '@/components/golf/course-geometry/terrain-debug';
import { buildThreeLandscape, DEFAULT_THREE_LANDSCAPE_PALETTE } from '@/components/golf/course-geometry/three-landscape';
import { applyTerrainCamera, pickTerrainPoint } from './three-camera';
import { createShotOverlayController } from './shot-overlay-controller';
import { TERRAIN_LIGHT_DIRECTION, type Point3M, type TerrainCamera, type TerrainMesh } from './terrain';
import { fitShadowBounds } from './shadow-bounds';
import type { TerrainRuntimeController } from './runtime-controller';
import type { HoleScene } from './types';

export interface ThreeTerrainRuntime extends TerrainRuntimeController {
  ready: Promise<void>;
  setEvidence(scene: HoleScene, selectedShotNumber?: number): void;
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
}

/** Lazy, scene-owned Three backend. It renders on camera/evidence changes only;
 * there is no animation loop, React render, provider request, or source edit. */
export function createThreeTerrainRuntime(options: RuntimeOptions): ThreeTerrainRuntime {
  const { canvas, overlay, mesh } = options;
  const renderer = new WebGLRenderer({ canvas, alpha: false, antialias: true, depth: true, powerPreference: 'default' });
  const world = new Scene(), view = new OrthographicCamera(), raycaster = new Raycaster();
  let landscape: ReturnType<typeof buildThreeLandscape> | null = null;
  let evidence: ReturnType<typeof createShotOverlayController> | null = null;
  let sun: DirectionalLight | null = null;
  let disposed = false, failed = false, ready = false, shaderFailed = false;
  let currentCamera = options.camera, width = options.width, height = options.height;
  let currentScene = options.scene, currentSelected = options.selectedShotNumber;
  let previousWidth = 0, previousHeight = 0, previousRatio = 0;
  let previousExaggeration = NaN, previousReference = NaN, renderCount = 0;
  let viewDistance = 1_000;
  let releaseDebug: (() => void) | undefined;
  let crownDetail: 'near' | 'distant' = 'distant';

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
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('webglcontextlost', lost);
    releaseDebug?.(); evidence?.dispose(); landscape?.dispose(); sun?.shadow.dispose();
    world.clear(); renderer.dispose();
    // React may replace the runtime while retaining the canvas (new geometry,
    // review eligibility or Strict Mode). Dispose GPU resources every time,
    // but force loss only after final DOM removal so replacements can reuse it.
    if (!canvas.isConnected) renderer.forceContextLoss();
  }
  function fail() {
    if (failed || disposed) return;
    failed = true;
    canvas.dataset.terrainState = 'unavailable';
    options.onUnavailable();
    dispose();
  }
  function lost(event: Event) { event.preventDefault(); fail(); }
  canvas.addEventListener('webglcontextlost', lost);

  function setCamera(camera: TerrainCamera, w: number, h: number) {
    currentCamera = camera; width = w; height = h;
    if (disposed || failed || !ready || !landscape || !evidence) return;
    try {
      const ratio = Math.min(canvas.ownerDocument.defaultView?.devicePixelRatio || 1, 2,
        Math.sqrt(4_000_000 / Math.max(1, width * height)));
      if (width !== previousWidth || height !== previousHeight || ratio !== previousRatio) {
        renderer.setPixelRatio(ratio); renderer.setSize(width, height, false);
        previousWidth = width; previousHeight = height; previousRatio = ratio;
      }
      if (previousExaggeration !== camera.exaggeration || previousReference !== camera.referenceElevationM) {
        landscape.setExaggeration(camera.exaggeration, camera.referenceElevationM);
        fitSun();
        renderer.shadowMap.needsUpdate = true;
        previousExaggeration = camera.exaggeration; previousReference = camera.referenceElevationM;
      }
      const nextDetail = camera.scale > 4.5 ? 'near' : camera.scale < 3.7 ? 'distant' : crownDetail;
      if (nextDetail !== crownDetail && landscape.setDetail(nextDetail)) {
        crownDetail = nextDetail; fitSun(); renderer.shadowMap.needsUpdate = true;
      }
      applyTerrainCamera(view, camera, width, height, viewDistance);
      renderer.render(world, view);
      if (shaderFailed || renderer.getContext().isContextLost()) { fail(); return; }
      // All world overlays update in the same synchronous paint as the GPU.
      // They intentionally remain readable through crowns (estimated evidence
      // is an annotation, not an opaque physical object in the landscape).
      evidence.setCamera(camera, width, height);
      Object.assign(canvas.dataset, {
        terrainRenderer: 'three-webgl2', terrainState: 'ready', terrainHash: mesh.contentHash,
        terrainPitch: String(camera.pitch), terrainYaw: String(camera.yawOffset),
        terrainExaggeration: String(camera.exaggeration), terrainScale: String(camera.scale),
        terrainFocus: camera.focusM.join(','), terrainTriangles: String(landscape.counts.terrainTriangles),
        terrainTrees: String(landscape.counts.trees), renderCount: String(++renderCount),
        cssWidth: String(width), cssHeight: String(height), bufferWidth: String(canvas.width), bufferHeight: String(canvas.height), pixelRatio: String(ratio),
        debugView: options.debugView ?? 'final',
        crownDetail,
        drawCalls: String(renderer.info.render.calls), renderTriangles: String(renderer.info.render.triangles),
      });
    } catch { fail(); }
  }

  try {
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.debug.checkShaderErrors = true;
    renderer.debug.onShaderError = () => { shaderFailed = true; };
    world.background = new Color(DEFAULT_THREE_LANDSCAPE_PALETTE.ground);
    landscape = buildThreeLandscape(options.scene, mesh);
    world.add(landscape.group);
    // Fixed lighting uses the whole physical package, not the moving camera
    // target. Yaw therefore reveals the same lit sides and real cast shadows.
    const bounds = new Box3().setFromObject(landscape.group);
    const centre = bounds.getCenter(new Vector3()), size = bounds.getSize(new Vector3());
    const radius = Math.max(40, size.length() / 2 + 32);
    viewDistance = radius * 4;
    const sunlight = new Vector3(...TERRAIN_LIGHT_DIRECTION).normalize();
    sun = new DirectionalLight('#FFFFFF', 2.0);
    sun.position.copy(centre).addScaledVector(sunlight, radius * 3);
    sun.target.position.copy(centre);
    sun.castShadow = true;
    const shadowCamera = sun.shadow.camera;
    shadowCamera.left = -radius; shadowCamera.right = radius;
    shadowCamera.top = radius; shadowCamera.bottom = -radius;
    shadowCamera.near = .1; shadowCamera.far = radius * 6;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -.00008; sun.shadow.normalBias = .18;
    sun.shadow.radius = 2;
    sun.shadow.camera.updateProjectionMatrix();
    world.add(sun, sun.target);
    const sky = new HemisphereLight('#DDEBFF', '#5C7050', 1.2);
    sky.position.set(0, 0, 1); world.add(sky);
    evidence = createShotOverlayController(overlay, options.overlayId, mesh, options.scene, options.selectedShotNumber);
    releaseDebug = installTerrainDebugView(world, landscape, mesh, options.debugView ?? 'final', renderer);
    if (options.debugView && options.debugView !== 'final') overlay.style.display = 'none';
    applyTerrainCamera(view, currentCamera, width, height, viewDistance);
  } catch (error) { dispose(); throw error; }

  const compiled = Promise.resolve().then(() => disposed ? undefined : renderer.compileAsync(world, view)).then(() => {
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
      // Evidence changes redraw only the retained SVG. The immutable landscape
      // and stationary camera do not need another GPU frame.
      evidence?.setEvidence(scene, selectedShotNumber);
    },
    pick(x, y) {
      return ready && !disposed && !failed && landscape
        ? pickTerrainPoint(landscape.terrain, view, mesh, x, y, width, height, raycaster) : null;
    },
    dispose,
  };
}
