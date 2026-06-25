/* city-engine.js — PixiJS v8 isometric "Agent City" for the BaseballHelm build.
   Buildings = work packets, ZONED into their real districts as clustered
   neighborhoods. Each district has a distinct architecture (foundry sheds,
   observatory domes, harbor gantries, control tower, server racks, QA flasks…)
   and a floating nameplate. Buildings RISE as completion grows; windows warm up
   with %, glow aura scales with confidence, footprint with weight. Cranes on
   active sites, gold flags on shipped, smoke on blocked, bare lots when planned.
   13 detailed striding worker characters live in their home district and walk to
   the active building their lane owns. A road network links districts; little
   delivery trucks spawn from recent file_changed events; clouds drift; a live HUD
   + hover tooltips + click-to-navigate (the meaning legend lives in the mode DOM,
   not on-canvas, so it never competes with building labels).
   DRAG to pan, SCROLL or +/− to zoom (clamped), ⤢ to fit — the city is NOT
   force-shrunk to one viewport; it fits to width and overflows with pan so it
   reads as a spacious town, not a cluster. Every label (building name + %,
   district nameplate, home-zone, hover worker tag) is COUNTER-SCALED each frame
   to a constant on-screen size with a hard font floor, so names stay readable at
   any zoom. Plot spacing is derived from the largest footprint so buildings,
   glows, shadows and scaffold never collide.
   Fed ONLY by live telemetry off ctx.state — never hardcoded. Cream/green, no black. */
import { Application, Container, Graphics, Text } from "./vendor/pixi.mjs";
import { zonePackets, zoneHomes, planTown, plotInBlock, archetypeFor } from "./city-districts.js";
import { makeWorkerRig, animateRig, shadeColor } from "./city-crew.js";

const C = {
  cream0: 0xfffdf6, cream50: 0xfcf8ec, cream100: 0xf4ecd8, cream200: 0xe7dcc2, tan: 0xd6c393,
  ink: 0x122018, inkMut: 0x6b7a6f, g950: 0x18261d, g900: 0x123522, g800: 0x17432d, g700: 0x1f5b3d,
  g600: 0x2c7650, turf: 0x3c9361, mint: 0xdcefe3, gold: 0xc8a24a, clay: 0xb86a3d, amber: 0xb88916,
  red: 0xb84035, teal: 0x3f7775, sky1: 0xeaf4e2, sky2: 0xdfe8cf, road: 0xcdbf99, roadEdge: 0xb7a87f,
  water: 0x7fb3c4, glass: 0xbfe0ea,
  grass1: 0xd7e8c4, grass2: 0xcfe2b9, path: 0xe3d8b8, curb: 0xc3b487,
  wood: 0x8a6a44, woodDk: 0x6b4a2e, steel: 0x9fb0a6, skin: 0xf0d9c0,
};
// per-agent hi-vis vest palette — index by agent slot so each crew reads distinct
const ROLE = [0x3c9361, 0x3f7775, 0xc8a24a, 0xb86a3d, 0xb88916, 0x2c7650, 0x7aa37f, 0xc98f5a, 0x5a9d8f, 0x1f5b3d, 0x9c7bb0, 0xb0894a, 0x6f9ec9];
// subtle ground-tint tokens per district key
const TINT = { g600: 0x2c7650, g700: 0x1f5b3d, g800: 0x17432d, teal: 0x3f7775, tan: 0xd6c393, mint: 0xdcefe3 };

// ---- DISTINCT DISTRICT COLOR FAMILIES (owner flag #7). A curated cream/green-
// harmonious palette: each district gets its own family {roof,left,right,accent,
// ground} so neighborhoods pop at a glance. NO black, no neon. Keyed by archetype
// so any live district name resolves to a tasteful family; index fallback cycles.
const FAMILIES = {
  foundry:     { roof: 0x2f7e57, left: 0x1f5b3d, right: 0x163f2c, accent: 0xc8a24a, ground: 0x1f5b3d }, // helm green
  machineshop: { roof: 0x3a8f8a, left: 0x2a6a66, right: 0x1d4d4a, accent: 0xd6c393, ground: 0x3f7775 }, // teal
  observatory: { roof: 0x5a7fb0, left: 0x3f5d88, right: 0x2c4263, accent: 0xc8a24a, ground: 0x5a7fb0 }, // slate-blue
  harbor:      { roof: 0x3f8f9e, left: 0x2c6b78, right: 0x1f4c56, accent: 0xc8a24a, ground: 0x3f7775 }, // harbor teal
  dock:        { roof: 0x4f93a0, left: 0x356f7b, right: 0x254f58, accent: 0xb88916, ground: 0x3f7775 },
  tower:       { roof: 0xb88c4e, left: 0x8f6a34, right: 0x6b4e24, accent: 0xfdf6e0, ground: 0xb0894a }, // warm gold/amber
  data:        { roof: 0x6f8a72, left: 0x4f6553, right: 0x39493c, accent: 0x9fb0a6, ground: 0x556b58 }, // sage
  quarry:      { roof: 0xc08a5a, left: 0x9c6a3e, right: 0x744d2c, accent: 0xe7dcc2, ground: 0xb86a3d }, // terracotta/clay
  qalab:       { roof: 0x8f7bb0, left: 0x6a5888, right: 0x4c3f63, accent: 0xcde0a8, ground: 0x9c7bb0 }, // muted plum
  generic:     { roof: 0x3c9361, left: 0x2c7650, right: 0x1f5b3d, accent: 0xc8a24a, ground: 0x2c7650 },
};
const FAMILY_CYCLE = ["foundry", "machineshop", "observatory", "tower", "data", "quarry", "qalab", "harbor"];
function familyFor(arch, idx) {
  return FAMILIES[arch] || FAMILIES[FAMILY_CYCLE[idx % FAMILY_CYCLE.length]] || FAMILIES.generic;
}
const HW = 30, HH = 15;            // iso tile half-width / half-height
const MAXBH = 54;                  // tallest building — kept building-like (not skyscraper towers)
// LOD: building NAME labels only render on hover / selection / when zoomed past
// this on-screen scale; below it only a tiny %/status chip shows (owner flag #10).
const LOD_NAME_SCALE = 1.05;       // world.scale at which full name labels appear
const LOD_CHIP_SCALE = 0.95;       // below this, NO per-building chip (only nameplates + worked site) — declutter
const LOD_DETAIL_SCALE = 1.35;     // signage text / interiors / fine props appear
// On-screen legibility floors — labels are counter-scaled each frame so these
// are the SCREEN px sizes regardless of zoom. Owner flag #1: labels must read.
const LBL_BUILDING = 13;           // building name + % screen font
const LBL_NAMEPLATE = 14;          // district nameplate screen font
const LBL_ZONE = 13;               // home-zone label screen font
const LBL_WORKER = 11;             // hover worker tag screen font
const FONT_FLOOR = 11;             // hard minimum effective on-screen font
// pan/zoom limits (multiplied onto the base fit-to-width scale)
const ZOOM_MIN = 0.55, ZOOM_MAX = 3.0;
const iso = (gx, gy) => ({ x: (gx - gy) * HW, y: (gx + gy) * HH });
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// largest building footprint multiplier we will ever draw (matches sizeF cap)
const SIZEF_MAX = 0.85 + 0.6;      // 1.45 — see b.sizeF below; spacing must clear this
const STATE_OF = (p) => p.status === "blocked" ? "blocked" : p.status === "done" ? "done" : p.status === "active" ? "active" : "planned";
// CONSTRUCTION STAGE read from real completion% (owner flag #12): a building
// visibly builds lot → foundation → frame → walls+scaffold → roof+facade → finished.
function stageFromPct(st, pct) {
  if (st === "planned") return "lot";
  if (st === "done") return "finished";
  if (pct < 8) return "foundation";
  if (pct < 30) return "frame";
  if (pct < 62) return "walls";
  if (pct < 92) return "roof";
  return "finished";
}

let S = null; // singleton

export async function cityView(ctx) {
  if (S) { S.update(ctx); return S.wrap; }
  S = await build(ctx);
  S.update(ctx);
  return S.wrap;
}

async function build() {
  const wrap = document.createElement("div");
  wrap.className = "pixi-stage";
  wrap.style.position = "relative";

  const app = new Application();
  await app.init({ background: C.sky1, antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true, width: 980, height: 620 });
  app.canvas.style.width = "100%"; app.canvas.style.height = "auto"; app.canvas.style.display = "block";
  app.canvas.style.touchAction = "none";  // let us own drag-to-pan gestures
  app.canvas.style.cursor = "grab";
  wrap.appendChild(app.canvas);

  // ---- DOM overlays (tooltip + HUD + legend) live above the canvas, inside wrap
  const tip = document.createElement("div");
  Object.assign(tip.style, {
    position: "absolute", pointerEvents: "none", zIndex: "8", maxWidth: "230px",
    padding: "9px 11px", borderRadius: "12px", font: "600 11.5px system-ui,sans-serif",
    color: "#122018", background: "rgba(255,253,246,0.96)", border: "1px solid rgba(31,91,61,0.28)",
    boxShadow: "0 10px 30px rgba(14,42,29,0.22)", opacity: "0", transition: "opacity .12s ease",
    transform: "translate(-50%,-115%)", lineHeight: "1.4", left: "0", top: "0", whiteSpace: "normal",
  });
  wrap.appendChild(tip);

  const hud = document.createElement("div");
  Object.assign(hud.style, {
    position: "absolute", left: "14px", bottom: "12px", zIndex: "7", pointerEvents: "none",
    display: "flex", gap: "8px", flexWrap: "wrap", font: "700 10.5px ui-monospace,monospace",
  });
  wrap.appendChild(hud);

  // ---- zoom / pan controls (crisp DOM buttons; the mode owns the meaning legend)
  const ctrls = document.createElement("div");
  Object.assign(ctrls.style, {
    position: "absolute", right: "12px", top: "12px", zIndex: "8",
    display: "flex", flexDirection: "column", gap: "5px", alignItems: "stretch",
  });
  const mkBtn = (label, title) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.title = title;
    Object.assign(b.style, {
      width: "30px", height: "30px", cursor: "pointer", lineHeight: "1",
      font: "800 15px ui-monospace,monospace", color: "#1f5b3d",
      background: "rgba(255,253,246,0.94)", border: "1px solid rgba(31,91,61,0.28)",
      borderRadius: "9px", boxShadow: "0 4px 12px rgba(14,42,29,0.14)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "0",
      transition: "background .12s ease, transform .08s ease",
    });
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    b.addEventListener("mouseenter", () => { b.style.background = "rgba(220,239,227,0.98)"; });
    b.addEventListener("mouseleave", () => { b.style.background = "rgba(255,253,246,0.94)"; });
    b.addEventListener("mousedown", () => { b.style.transform = "scale(0.92)"; });
    b.addEventListener("mouseup", () => { b.style.transform = "scale(1)"; });
    return b;
  };
  const btnIn = mkBtn("+", "Zoom in");
  const btnOut = mkBtn("−", "Zoom out");
  const btnFit = mkBtn("⤢", "Fit the whole city");
  ctrls.appendChild(btnIn); ctrls.appendChild(btnOut); ctrls.appendChild(btnFit);
  wrap.appendChild(ctrls);

  // ---- pan/zoom hint (auto-fades on first interaction)
  const hint = document.createElement("div");
  Object.assign(hint.style, {
    position: "absolute", left: "50%", top: "10px", transform: "translateX(-50%)", zIndex: "7",
    pointerEvents: "none", font: "700 10.5px system-ui,sans-serif", color: "#3f5247",
    background: "rgba(255,253,246,0.9)", border: "1px solid rgba(31,91,61,0.18)",
    padding: "3px 10px", borderRadius: "10px", opacity: "1", transition: "opacity .4s ease",
    boxShadow: "0 3px 10px rgba(14,42,29,0.12)",
  });
  hint.textContent = "drag to pan · scroll or +/− to zoom";
  wrap.appendChild(hint);

  // ---- honest empty-state overlay (shown only when telemetry has zero packets)
  const emptyEl = document.createElement("div");
  Object.assign(emptyEl.style, {
    position: "absolute", inset: "0", zIndex: "6", display: "none",
    flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: "6px", pointerEvents: "none", textAlign: "center",
  });
  emptyEl.innerHTML =
    `<div style="font-size:30px">🏙️</div>` +
    `<div style="font:800 15px system-ui,sans-serif;color:#1f5b3d">No buildings yet</div>` +
    `<div style="font:600 11.5px system-ui,sans-serif;color:#6b7a6f;max-width:280px">When an agent breaks ground on a work packet, its building rises here — live from telemetry. Nothing has started yet.</div>`;
  wrap.appendChild(emptyEl);

  // ---- scene graph
  const sky = new Graphics(); app.stage.addChild(sky);
  const clouds = new Container(); app.stage.addChild(clouds);
  const world = new Container(); world.sortableChildren = true; app.stage.addChild(world);
  const ground = new Graphics(); ground.zIndex = -100000; world.addChild(ground);
  const waterG = new Graphics(); waterG.zIndex = -99500; world.addChild(waterG); // animated pond sheen/ripple
  const nameplates = new Container(); nameplates.sortableChildren = true; world.addChild(nameplates);
  const props = new Container(); props.sortableChildren = true; world.addChild(props);
  const vehicleLayer = new Container(); vehicleLayer.sortableChildren = true; world.addChild(vehicleLayer);
  const fxLayer = new Container(); fxLayer.sortableChildren = true; world.addChild(fxLayer);
  const cloudShadows = new Container(); cloudShadows.zIndex = -99000; world.addChild(cloudShadows);
  const birds = new Container(); birds.zIndex = 99000; world.addChild(birds);

  const buildings = new Map();     // packetId -> bobj
  const workers = new Map();       // agentId  -> wobj
  const vehicles = [];             // active delivery trucks
  const fxParticles = [];          // live spark/dust particles
  const fxPool = [];               // recycled Graphics for particles
  const cloudG = [];
  const cloudShadowG = [];         // soft moving ground shadows under clouds
  const birdG = [];                // occasional birds crossing
  let blocks = [];                 // current town plan blocks
  let homeZones = [];              // agent-home plazas
  let plan = { planW: 8, planH: 6, plotGap: 1, blockGap: 2.4 };
  let plotByPacket = new Map();    // packetId -> {gx,gy}
  let blockOfPacket = new Map();   // packetId -> block
  let depot = iso(-3, 3);
  let pondCenter = null;           // park pond center (iso px) for ticker water anim
  let roadSegs = [];               // [{a:{x,y}, b:{x,y}}] in iso px for vehicles to drive
  let cssW = 980, cssH = 620;
  let worldBoundsCache = null;     // last computed world bounds (for cloud shadows/birds)
  let fitScale = 1;                // the scale that fits plan WIDTH into the panel
  let userZoom = 1;                // user multiplier on top of fitScale (pan/zoom)
  let worldScale = 1;              // = fitScale * userZoom (the live world.scale)
  let userPanned = false;          // once the user drags/zooms we stop auto-recentring
  const nameplateLabels = [];      // Containers to counter-scale each frame (district + zone)
  let lastSig = "";                // layout signature so we only re-plan on real change
  let lastEventId = null;
  let plotGapPx = HW;              // current in-block plot spacing in grid units (collision-safe)

  // ---------------------------------------------------------------- layout
  // analytic world bounds (iso px) covering the whole plan + depot + tallest
  // building + nameplate banners + home-zone plazas hanging below the plan.
  function worldBounds() {
    const margin = 2.6;
    const corners = [
      iso(-margin, -margin), iso(plan.planW + margin, -margin),
      iso(plan.planW + margin, plan.planH + margin), iso(-margin, plan.planH + margin),
      depot,
    ];
    // include home-zone plazas (they sit ~2.6 grid rows below the plan)
    for (const hz of homeZones) if (hz._center) corners.push(hz._center);
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const p of corners) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    minX -= HW * 1.4; maxX += HW * 1.4; minY -= MAXBH + 56; maxY += HH + 64;
    worldBoundsCache = { minX, maxX, minY, maxY, cw: maxX - minX, ch: maxY - minY };
    return worldBoundsCache;
  }

  // Apply world.scale + position from fitScale*userZoom. Keeps the city centered
  // when the user hasn't grabbed it; once they pan/zoom we respect their offset.
  function applyTransform(keepCenter) {
    worldScale = fitScale * userZoom;
    const before = keepCenter ? screenCenterWorld() : null;
    world.scale.set(worldScale);
    if (!userPanned) {
      const b = worldBounds();
      world.x = cssW / 2 - ((b.minX + b.maxX) / 2) * worldScale;
      // top-align tall plans so the skyline isn't pushed off-canvas; pan reveals more
      const contentTop = b.minY * worldScale;
      world.y = (b.ch * worldScale <= cssH) ? (cssH / 2 - ((b.minY + b.maxY) / 2) * worldScale) : (24 - contentTop);
    } else if (before) {
      // zoom around the current screen center so it doesn't jump
      world.x = cssW / 2 - before.x * worldScale;
      world.y = cssH / 2 - before.y * worldScale;
    }
  }
  function screenCenterWorld() {
    return { x: (cssW / 2 - world.x) / worldScale, y: (cssH / 2 - world.y) / worldScale };
  }

  function computeFit() {
    const b = worldBounds();
    // Fit to WIDTH (spacious) — let height overflow and be reachable via pan.
    // Cap so a tiny plan doesn't balloon to absurd scale.
    fitScale = Math.min(1.35, (cssW * 0.94) / b.cw);
  }

  function layout() {
    const w = Math.max(360, wrap.clientWidth || 980);
    cssW = w;
    // taller canvas so multi-band skylines breathe; min height keeps it usable
    cssH = Math.max(440, Math.round(w * 0.66));
    app.renderer.resize(cssW, cssH);
    drawSky();
    drawGround();           // (re)build ground so homeZone centers exist for bounds
    computeFit();
    applyTransform(false);
  }

  // re-fit the whole city into view and reset pan
  function fitAll() {
    userPanned = false; userZoom = 1;
    computeFit();
    applyTransform(false);
    dismissHint();
  }
  function dismissHint() { hint.style.opacity = "0"; }

  // smoothly FLY the camera so world point (wx,wy) sits at the canvas center, at
  // an optional target user-zoom (#5). Driven by a tween consumed in the ticker.
  let camTween = null;
  function flyTo(wx, wy, targetUserZoom) {
    userPanned = true; dismissHint();
    const tz = clamp(targetUserZoom != null ? targetUserZoom : userZoom, ZOOM_MIN, ZOOM_MAX);
    const toScale = fitScale * tz;
    const toX = cssW / 2 - wx * toScale;
    const toY = cssH / 2 - wy * toScale;
    camTween = { fromX: world.x, fromY: world.y, fromZoom: userZoom, toX, toY, toZoom: tz, t: 0, dur: 0.6 };
  }
  function stepCamTween(dms) {
    if (!camTween) return;
    camTween.t = Math.min(1, camTween.t + dms / camTween.dur);
    const e = 1 - Math.pow(1 - camTween.t, 3);  // easeOutCubic
    userZoom = lerp(camTween.fromZoom, camTween.toZoom, e);
    worldScale = fitScale * userZoom;
    world.scale.set(worldScale);
    world.x = lerp(camTween.fromX, camTween.toX, e);
    world.y = lerp(camTween.fromY, camTween.toY, e);
    if (camTween.t >= 1) camTween = null;
  }

  // ---- interactive pan + zoom ----------------------------------------------
  let dragging = false, dragLastX = 0, dragLastY = 0, dragMoved = 0;
  app.canvas.addEventListener("pointerdown", (e) => {
    dragging = true; dragMoved = 0; dragLastX = e.clientX; dragLastY = e.clientY;
    camTween = null;   // user grabbed — cancel any in-flight fly-to
    app.canvas.style.cursor = "grabbing";
    try { app.canvas.setPointerCapture(e.pointerId); } catch {}
  });
  app.canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragLastX, dy = e.clientY - dragLastY;
    dragLastX = e.clientX; dragLastY = e.clientY;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    if (dragMoved > 4) { userPanned = true; dismissHint(); }
    world.x += dx; world.y += dy;
  });
  const endDrag = (e) => { dragging = false; app.canvas.style.cursor = "grab"; try { if (e) app.canvas.releasePointerCapture(e.pointerId); } catch {} };
  app.canvas.addEventListener("pointerup", endDrag);
  app.canvas.addEventListener("pointercancel", endDrag);
  app.canvas.addEventListener("pointerleave", () => { if (dragging) { dragging = false; app.canvas.style.cursor = "grab"; } });

  // zoom around the cursor
  function zoomAt(clientX, clientY, factor) {
    camTween = null;   // user zoomed — cancel any in-flight fly-to
    const r = app.canvas.getBoundingClientRect();
    const px = (clientX - r.left) * (cssW / r.width);
    const py = (clientY - r.top) * (cssH / r.height);
    const wx = (px - world.x) / worldScale, wy = (py - world.y) / worldScale;
    userZoom = clamp(userZoom * factor, ZOOM_MIN, ZOOM_MAX);
    userPanned = true; dismissHint();
    worldScale = fitScale * userZoom;
    world.scale.set(worldScale);
    world.x = px - wx * worldScale; world.y = py - wy * worldScale;
  }
  app.canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });
  // button zoom centers on the canvas middle
  const centerZoom = (factor) => { const r = app.canvas.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor); };
  btnIn.addEventListener("click", () => centerZoom(1.25));
  btnOut.addEventListener("click", () => centerZoom(1 / 1.25));
  btnFit.addEventListener("click", fitAll);

  function drawSky() {
    sky.clear();
    sky.rect(0, 0, cssW, cssH).fill(C.sky1);
    sky.rect(0, 0, cssW, cssH * 0.55).fill({ color: C.mint, alpha: 0.4 });
    sky.rect(0, 0, cssW, cssH * 0.28).fill({ color: C.sky2, alpha: 0.3 });
    sky.circle(cssW * 0.86, cssH * 0.15, 22).fill({ color: C.gold, alpha: 0.92 });
    sky.circle(cssW * 0.86, cssH * 0.15, 38).fill({ color: C.gold, alpha: 0.12 });
    sky.circle(cssW * 0.86, cssH * 0.15, 56).fill({ color: C.gold, alpha: 0.05 });
    // ensure cloud pool exists (+ matching ground-shadow + bird pools)
    if (!cloudG.length) {
      const b = worldBoundsCache;
      for (let i = 0; i < 4; i++) {
        const g = new Graphics();
        g._spd = 6 + i * 3; g._y = cssH * (0.08 + i * 0.06); g._x = (i * 320) % (cssW + 240) - 120; g._s = 0.7 + (i % 2) * 0.5;
        clouds.addChild(g); cloudG.push(g);
        const sh = new Graphics();
        sh._spd = g._spd; sh._s = g._s;
        sh._x = b ? b.minX + (i * (b.cw / 4)) : i * 260;
        sh._y = b ? b.minY + b.ch * (0.45 + i * 0.06) : 200;
        cloudShadows.addChild(sh); cloudShadowG.push(sh);
      }
      for (let i = 0; i < 3; i++) {
        const bd = new Graphics();
        bd._spd = 18 + i * 8; bd._ph = i * 2.1;
        bd._x = b ? b.minX + i * (b.cw / 3) : i * 300;
        bd._y = b ? b.minY + 50 + i * 30 : 60 + i * 30;
        birds.addChild(bd); birdG.push(bd);
      }
    }
  }

  function paveLine(p1, p2, w, alpha) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * w / 2, ny = dx / len * w / 2;
    ground.poly([p1.x + nx, p1.y + ny, p2.x + nx, p2.y + ny, p2.x - nx, p2.y - ny, p1.x - nx, p1.y - ny]).fill({ color: C.road, alpha: alpha != null ? alpha : 0.7 });
    // dashed center line
    const segs = Math.max(2, Math.floor(len / 16));
    for (let k = 0; k < segs; k += 2) {
      const u0 = k / segs, u1 = (k + 1) / segs;
      ground.moveTo(lerp(p1.x, p2.x, u0), lerp(p1.y, p2.y, u0)).lineTo(lerp(p1.x, p2.x, u1), lerp(p1.y, p2.y, u1)).stroke({ width: 1, color: C.cream50, alpha: 0.5 });
    }
  }
  // sidewalk/curb strips flanking a road (cream path with a curb seam) (#11)
  function sidewalk(p1, p2, roadW) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy) || 1;
    const off = roadW / 2 + 2.2, sw = 2.2;
    for (const sgn of [-1, 1]) {
      const nx = -dy / len * (off + sw / 2) * sgn, ny = dx / len * (off + sw / 2) * sgn;
      const wx = -dy / len * sw / 2, wy = dx / len * sw / 2;
      ground.poly([
        p1.x + nx + wx, p1.y + ny + wy, p2.x + nx + wx, p2.y + ny + wy,
        p2.x + nx - wx, p2.y + ny - wy, p1.x + nx - wx, p1.y + ny - wy,
      ]).fill({ color: C.path, alpha: 0.8 }).stroke({ width: 1, color: C.curb, alpha: 0.6 });
    }
  }

  function diamond(g, p, hw, hh, col, alpha, line, lalpha) {
    g.poly([p.x, p.y - hh, p.x + hw, p.y, p.x, p.y + hh, p.x - hw, p.y]).fill({ color: col, alpha });
    if (line != null) g.poly([p.x, p.y - hh, p.x + hw, p.y, p.x, p.y + hh, p.x - hw, p.y]).stroke({ width: 1, color: line, alpha: lalpha });
  }

  function tree(p, scale) {
    const g = new Container(); g.x = p.x; g.y = p.y; g.zIndex = p.y; const s = scale || 1;
    const t = new Graphics();
    t.ellipse(0, 2 * s, 5 * s, 2 * s).fill({ color: 0x123522, alpha: 0.18 });
    t.rect(-1.2 * s, -10 * s, 2.4 * s, 10 * s).fill(0x6b4a2e);
    t.circle(0, -14 * s, 6 * s).fill(0x3c9361); t.circle(-3 * s, -10 * s, 5 * s).fill(0x357f59); t.circle(3 * s, -11 * s, 5 * s).fill(0x2f7e57);
    g.addChild(t); return g;
  }

  function bench(p) {
    const g = new Container(); g.x = p.x; g.y = p.y; g.zIndex = p.y;
    const b = new Graphics();
    b.ellipse(0, 2, 5, 1.6).fill({ color: 0x123522, alpha: 0.14 });
    b.rect(-5, -3, 10, 1.6).fill(C.tan); b.rect(-5, -5, 10, 1.4).fill(C.clay);
    b.rect(-4.5, -3, 1, 3).fill(0x6b4a2e); b.rect(3.5, -3, 1, 3).fill(0x6b4a2e);
    g.addChild(b); return g;
  }

  function lamp(p, lit) {
    const g = new Container(); g.x = p.x; g.y = p.y; g.zIndex = p.y; g._lamp = true; g._lit = lit;
    const l = new Graphics(); g._g = l;
    l.ellipse(0, 1, 2.4, 1).fill({ color: C.g900, alpha: 0.15 });
    l.rect(-0.9, -17, 1.8, 17).fill(C.g700);
    l.rect(-0.9, -17, 0.7, 17).fill({ color: shadeColor(C.g700, 0.25), alpha: 0.5 }); // rim light
    l.poly([-2.4, -17, 2.4, -17, 1.4, -19.5, -1.4, -19.5]).fill(C.g800);          // fixture hood
    l.circle(0, -18, 2.0).fill({ color: lit ? C.amber : C.cream200 });
    if (lit) { l.circle(0, -18, 5).fill({ color: C.amber, alpha: 0.22 }); l.circle(0, -18, 8).fill({ color: C.amber, alpha: 0.08 }); }
    g.addChild(l); return g;
  }

  // landscape props (planter, hedge, fence run, flowerbed, fountain, cones, crates)
  function planter(p, col) {
    const g = new Container(); g.x = p.x; g.y = p.y; g.zIndex = p.y;
    const d = new Graphics();
    d.ellipse(0, 1.2, 4, 1.4).fill({ color: C.g900, alpha: 0.12 });
    d.rect(-3.5, -2.5, 7, 3.5).fill(C.tan); d.rect(-3.5, -2.5, 7, 1).fill({ color: shadeColor(C.tan, 0.2) });
    d.circle(-1.5, -3.5, 2).fill(C.turf); d.circle(1.5, -3.8, 2.2).fill(0x2f7e57); d.circle(0, -4.2, 2).fill(C.g600);
    d.circle(-1.5, -4.4, 0.7).fill({ color: col || C.gold, alpha: 0.9 });   // little blossom
    g.addChild(d); return g;
  }
  function hedge(p, len) {
    const g = new Container(); g.x = p.x; g.y = p.y; g.zIndex = p.y;
    const d = new Graphics(); const L = len || 12;
    d.ellipse(0, 1, L * 0.55, 1.4).fill({ color: C.g900, alpha: 0.12 });
    d.roundRect(-L / 2, -4, L, 4.5, 2).fill(0x2f7e57);
    d.roundRect(-L / 2, -4, L, 1.6, 2).fill({ color: C.turf, alpha: 0.8 });
    g.addChild(d); return g;
  }
  function flowerbed(p) {
    const g = new Container(); g.x = p.x; g.y = p.y; g.zIndex = p.y;
    const d = new Graphics();
    diamond(d, { x: 0, y: 0 }, 9, 4.5, 0x2f7e57, 0.85, C.g700, 0.4);
    const cols = [C.gold, C.clay, 0x9c7bb0, C.amber];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      d.circle(Math.cos(a) * 5, Math.sin(a) * 2.4, 1).fill({ color: cols[k % cols.length], alpha: 0.9 });
    }
    g.addChild(d); return g;
  }
  function fenceRun(p1, p2) {
    const g = new Graphics(); g.zIndex = (p1.y + p2.y) / 2;
    const n = 6;
    for (let k = 0; k <= n; k++) {
      const x = lerp(p1.x, p2.x, k / n), y = lerp(p1.y, p2.y, k / n);
      g.rect(x - 0.5, y - 5, 1, 5).fill({ color: C.cream100, alpha: 0.9 });
    }
    g.moveTo(p1.x, p1.y - 4).lineTo(p2.x, p2.y - 4).stroke({ width: 1, color: C.cream100, alpha: 0.85 });
    g.moveTo(p1.x, p1.y - 1.5).lineTo(p2.x, p2.y - 1.5).stroke({ width: 1, color: C.cream100, alpha: 0.7 });
    return g;
  }
  function fountain(p) {
    const g = new Container(); g.x = p.x; g.y = p.y; g.zIndex = p.y; g._fountain = true;
    const d = new Graphics(); g._g = d;
    diamond(d, { x: 0, y: 0 }, 13, 6.5, C.cream100, 0.95, C.curb, 0.6);
    d.ellipse(0, 0, 9, 4.5).fill({ color: C.water, alpha: 0.7 });
    d.ellipse(-2, -1, 4, 2).fill({ color: C.glass, alpha: 0.4 });
    d.rect(-1.2, -6, 2.4, 6).fill(C.cream200);                 // central spout
    d.ellipse(0, -6, 3, 1.4).fill({ color: C.glass, alpha: 0.6 });
    g.addChild(d); return g;
  }

  function drawGround() {
    ground.clear();
    props.removeChildren();
    nameplates.removeChildren();
    nameplateLabels.length = 0;   // rebuilt below; counter-scaled each frame
    roadSegs = [];

    // grass plane spanning the whole plan
    const m = 2.6;
    const a = iso(-m, -m), b = iso(plan.planW + m, -m), c = iso(plan.planW + m, plan.planH + m), d = iso(-m, plan.planH + m);
    ground.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]).fill(C.grass1);
    ground.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]).fill({ color: C.mint, alpha: 0.18 });
    // tile-textured ground: faint iso grid seams + checker tint so it reads as
    // grass/plaza tiles, not one flat poly (owner flag #11)
    for (let gx = Math.ceil(-m); gx <= plan.planW + m; gx += 2) {
      const p1 = iso(gx, -m), p2 = iso(gx, plan.planH + m);
      ground.moveTo(p1.x, p1.y).lineTo(p2.x, p2.y).stroke({ width: 1, color: C.grass2, alpha: 0.35 });
    }
    for (let gy = Math.ceil(-m); gy <= plan.planH + m; gy += 2) {
      const p1 = iso(-m, gy), p2 = iso(plan.planW + m, gy);
      ground.moveTo(p1.x, p1.y).lineTo(p2.x, p2.y).stroke({ width: 1, color: C.grass2, alpha: 0.3 });
    }

    // central main avenue (horizontal) + cross streets along block band gaps
    const midY = plan.planH / 2;
    const ave1 = iso(-m, midY), ave2 = iso(plan.planW + m, midY);
    paveLine(ave1, ave2, HW * 0.62, 0.82);
    sidewalk(ave1, ave2, HW * 0.62);           // curbs/sidewalks flanking the avenue (#11)
    roadSegs.push({ a: ave1, b: ave2 });

    // per-block ground tint (matches the district's building family) + roads + nameplate
    for (const blk of blocks) {
      const di = blocks.indexOf(blk);
      const fam = familyFor(blk.arch, di);
      const tintCol = fam.ground;
      const pad = plan.plotGap * 0.62 + 0.3;
      const tl = iso(blk.ox - pad, blk.oy - pad), tr = iso(blk.ox + blk.w + pad, blk.oy - pad);
      const br = iso(blk.ox + blk.w + pad, blk.oy + blk.h + pad), bl = iso(blk.ox - pad, blk.oy + blk.h + pad);
      // tinted plaza floor (paved tiles) + curb seam
      ground.poly([tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]).fill({ color: C.path, alpha: 0.5 });
      ground.poly([tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]).fill({ color: tintCol, alpha: 0.12 });
      ground.poly([tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]).stroke({ width: 1.4, color: C.curb, alpha: 0.45 });
      ground.poly([tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]).stroke({ width: 1, color: tintCol, alpha: 0.3 });
      // a road skirting the block, joined to the avenue, with sidewalks
      const skirtY = blk.oy + blk.h + pad + 0.7;
      const s1 = iso(blk.ox - pad, skirtY), s2 = iso(blk.ox + blk.w + pad, skirtY);
      paveLine(s1, s2, HW * 0.42, 0.65);
      sidewalk(s1, s2, HW * 0.42);
      roadSegs.push({ a: s1, b: s2 });
      // connector from block skirt up to the avenue
      const connX = blk.ox + blk.w / 2;
      const cTop = iso(connX, midY), cBot = iso(connX, skirtY);
      paveLine(cTop, cBot, HW * 0.34, 0.6);
      roadSegs.push({ a: cTop, b: cBot });
      // street lamps at block corners (lit if district has an active build)
      const anyActive = blk.packets.some((p) => p.status === "active");
      props.addChild(lamp(iso(blk.ox - pad, blk.oy - pad), anyActive));
      props.addChild(lamp(iso(blk.ox + blk.w + pad, blk.oy + blk.h + pad), anyActive));
      props.addChild(lamp(iso(blk.ox + blk.w + pad, blk.oy - pad), anyActive));
      // landscaped border: hedges along the top edge, planters at corners,
      // a small flowerbed accent — fills the gaps the spread-out plan opened (#11)
      props.addChild(hedge(iso(blk.ox + blk.w / 2, blk.oy - pad), HW * (blk.w + pad) * 0.5 + 6));
      props.addChild(planter(iso(blk.ox - pad, blk.oy + blk.h + pad), fam.accent));
      props.addChild(planter(iso(blk.ox + blk.w + pad, blk.oy - pad), fam.accent));
      if (blk.w >= 1) props.addChild(flowerbed(iso(blk.ox + blk.w / 2, blk.oy + blk.h + pad + 0.1)));
      // a tree at each lower corner for shade
      props.addChild(tree(iso(blk.ox - pad - 0.3, blk.oy + blk.h + pad), 0.85));
      // floating district nameplate banner above the block center
      nameplates.addChild(makeNameplate(blk, tintCol));
    }

    // home-zone plazas (Prompt Plaza / Broadcast Center / Memory Library): drawn
    // off to the side below the plan as labelled green tiles where idle agents sit
    homeZones.forEach((hz, i) => {
      const zx = (i * 3.4) - (homeZones.length - 1) * 1.7;
      const zy = plan.planH + 2.6;
      hz._center = iso(zx + 0.5, zy + 0.4);
      const tintCol = TINT[hz.tint] || C.g600;
      diamond(ground, hz._center, HW * 1.5, HH * 1.5, tintCol, 0.12, tintCol, 0.3);
      // portico hint for the library
      if (hz.arch === "library") {
        const pg = new Graphics(); pg.x = hz._center.x; pg.y = hz._center.y; pg.zIndex = pg.y;
        for (let c2 = -2; c2 <= 2; c2++) pg.rect(c2 * 4 - 0.8, -16, 1.6, 16).fill(C.cream100);
        pg.poly([-12, -16, 12, -16, 9, -22, -9, -22]).fill(C.tan);
        props.addChild(pg);
      }
      nameplates.addChild(makeZoneLabel(hz, tintCol));
    });

    // central PARK with a pond (shimmering, ripples in the ticker) near the
    // avenue mid-left + a fountain centerpiece (animated jets) (#11,#12)
    const pondC = iso(plan.planW * 0.5 - 1.4, midY - 1.4);
    pondCenter = pondC;
    ground.ellipse(pondC.x, pondC.y, HW * 1.0, HH * 1.0).fill(C.grass2);          // grassy park ring
    ground.ellipse(pondC.x, pondC.y, HW * 0.8, HH * 0.8).fill({ color: C.water, alpha: 0.7 });
    ground.ellipse(pondC.x, pondC.y, HW * 0.8, HH * 0.8).stroke({ width: 1.6, color: C.teal, alpha: 0.45 });
    // (the moving sheen/ripple is the `waterG` overlay, animated in the ticker)
    waterG.clear();

    const founC = iso(plan.planW * 0.5 + 0.4, midY + 0.6);
    props.addChild(fountain(founC));

    // depot pad (idle agents) bottom-left, fenced
    depot = iso(-1.8, plan.planH + 1.8);
    diamond(ground, depot, HW * 1.2, HH * 1.2, C.path, 0.7, C.curb, 0.5);
    diamond(ground, depot, HW * 1.2, HH * 1.2, C.tan, 0.3, C.g700, 0.3);

    // scattered greenery + benches + planters + fences around perimeter & park (#11)
    props.addChild(tree(iso(-1.6, -1.6), 1));
    props.addChild(tree(iso(plan.planW + 1.6, -1.6), 1.1));
    props.addChild(tree(iso(plan.planW + 1.6, plan.planH + 1.6), 0.95));
    props.addChild(tree(iso(-1.6, plan.planH + 1.6), 0.9));
    props.addChild(tree(iso(pondC.x / HW + 1.6, midY - 1.6), 0.85));
    props.addChild(bench(iso(pondC.x / HW + 1.3, midY - 0.4)));
    props.addChild(bench(iso(founC.x / HW + 1.0, midY + 1.4)));
    props.addChild(planter(iso(founC.x / HW - 1.4, midY + 1.4), C.gold));
    props.addChild(flowerbed(iso(pondC.x / HW - 1.5, midY - 0.2)));
    // a low fence run along the front of the central park
    props.addChild(fenceRun(iso(plan.planW * 0.5 - 2.4, midY + 1.8), iso(plan.planW * 0.5 + 2.4, midY + 1.8)));
  }

  function makeNameplate(blk, tintCol) {
    const center = iso(blk.ox + blk.w / 2, blk.oy - 0.05);
    // `g` carries the world position; an inner `lbl` is counter-scaled each frame
    // so the banner holds a constant SCREEN size at any zoom (owner flag #1).
    const g = new Container(); g.x = center.x; g.y = center.y - 26; g.zIndex = 90000 + center.y;
    const lbl = new Container(); g.addChild(lbl);
    const txt = `${blk.glyph}  ${blk.name}`;
    const t = new Text({ text: txt, style: { fontFamily: "system-ui, sans-serif", fontSize: LBL_NAMEPLATE, fontWeight: "800", fill: C.cream0, letterSpacing: 0.3 } });
    t.anchor.set(0.5, 0.5);
    const padX = 11, w = t.width + padX * 2, hh = 22;
    const banner = new Graphics();
    banner.roundRect(-w / 2, -hh / 2, w, hh, 9).fill({ color: tintCol, alpha: 0.96 }).stroke({ width: 1.2, color: C.cream0, alpha: 0.4 });
    // count chip
    const cnt = new Text({ text: String(blk.packets.length), style: { fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: "800", fill: tintCol } });
    cnt.anchor.set(0.5, 0.5);
    const chip = new Graphics(); chip.circle(w / 2 - 2, 0, 9.5).fill(C.cream0);
    cnt.x = w / 2 - 2;
    lbl.addChild(banner); lbl.addChild(t); lbl.addChild(chip); lbl.addChild(cnt);
    // little flag pole drawn on `g` (NOT counter-scaled) so it grows/shrinks with the world
    const pole = new Graphics();
    pole.rect(-0.8, 0, 1.6, 18).fill({ color: tintCol, alpha: 0.65 });
    g.addChild(pole);
    g._lbl = lbl; g._poleTop = -hh / 2; g._npW = w; g._npH = hh; g._priority = (blk.packets ? blk.packets.length : 1) + 10; nameplateLabels.push(g);
    // clicking a district nameplate smoothly FLIES the camera to center it (#5).
    // the lbl is the visible banner; make it the hit target so panning the empty
    // map still works elsewhere. Target = the block center on the ground.
    const blockCenter = iso(blk.ox + blk.w / 2, blk.oy + blk.h / 2);
    lbl.eventMode = "static"; lbl.cursor = "pointer";
    lbl.on("pointertap", (e) => { e.stopPropagation?.(); flyTo(blockCenter.x, blockCenter.y, 1.55); });
    lbl.on("pointerover", () => { lbl.scale.set(lbl.scale.x * 1.0); banner.alpha = 1; });
    return g;
  }

  function makeZoneLabel(hz, tintCol) {
    const g = new Container(); g.x = hz._center.x; g.y = hz._center.y - 34; g.zIndex = 90000 + hz._center.y;
    const lbl = new Container(); g.addChild(lbl);
    const t = new Text({ text: `${hz.glyph} ${hz.name}`, style: { fontFamily: "system-ui, sans-serif", fontSize: LBL_ZONE, fontWeight: "800", fill: C.cream0 } });
    t.anchor.set(0.5, 0.5);
    const w = t.width + 18, hh = 20;
    const banner = new Graphics();
    banner.roundRect(-w / 2, -hh / 2, w, hh, 8).fill({ color: tintCol, alpha: 0.92 }).stroke({ width: 1, color: C.cream0, alpha: 0.32 });
    lbl.addChild(banner); lbl.addChild(t);
    g._lbl = lbl; g._npW = w; g._npH = hh; g._priority = 1; nameplateLabels.push(g);
    return g;
  }

  // ---------------------------------------------------------------- building
  function makeBuilding(packet, idx) {
    const g = new Container();
    const selRing = new Graphics();        // animated dashed selection ring (under building)
    const plotG = new Graphics(), boxG = new Graphics(), fxG = new Graphics();
    const crane = new Container(), beacon = new Graphics(), smoke = new Container(), glow = new Graphics();
    const flag = new Graphics(), sparkle = new Container();
    g.addChild(glow); g.addChild(selRing); g.addChild(plotG); g.addChild(boxG); g.addChild(fxG);
    g.addChild(crane); g.addChild(beacon); g.addChild(flag); g.addChild(smoke); g.addChild(sparkle);
    for (let i = 0; i < 3; i++) smoke.addChild(new Graphics());
    for (let i = 0; i < 6; i++) { const s = new Graphics(); s._life = 0; sparkle.addChild(s); }
    sparkle.visible = false;
    const mast = new Graphics(), jib = new Container(), jibBar = new Graphics(), hook = new Graphics();
    crane.addChild(mast); crane.addChild(jib); jib.addChild(jibBar); jib.addChild(hook);
    // building name label — counter-scaled, shown only on hover/select/zoom (#10).
    const labelHolder = new Container();
    const labelBg = new Graphics();
    const label = new Text({ text: "", style: { fontFamily: "system-ui, sans-serif", fontSize: LBL_BUILDING, fontWeight: "700", fill: C.ink, align: "center" } });
    label.anchor.set(0.5, 0);
    labelHolder.addChild(labelBg); labelHolder.addChild(label);
    labelHolder.visible = false;
    g.addChild(labelHolder);
    // tiny always-on signage chip: district glyph + live % (de-collided via the
    // hide-on-zoom-out scheme; chip is the only label shown when zoomed out) (#12)
    const chipHolder = new Container();
    const chipBg = new Graphics();
    const chip = new Text({ text: "", style: { fontFamily: "ui-monospace, monospace", fontSize: 10, fontWeight: "800", fill: C.ink } });
    chip.anchor.set(0.5, 0.5);
    chipHolder.addChild(chipBg); chipHolder.addChild(chip);
    g.addChild(chipHolder);
    const bobj = {
      g, selRing, plotG, boxG, fxG, crane, mast, jib, jibBar, hook, beacon, smoke, glow, flag, sparkle,
      label, labelHolder, labelBg, chip, chipHolder, chipBg, curH: 0, targetH: 0, packet: null,
      drawn: -1, sizeF: 1, arch: "generic", fam: null, stage: "lot", heightVar: 1, widthVar: 1,
      wasDone: false, doneBurst: 0, labelKey: "", chipKey: "", hovered: false, selected: false, lift: 0,
    };
    // interactivity — hover tooltip + name reveal + click SELECT (the seam)
    g.eventMode = "static"; g.cursor = "pointer";
    g.on("pointerover", () => { bobj.hovered = true; showTip(bobj); });
    g.on("pointermove", (e) => positionTip(e));
    g.on("pointerout", () => { bobj.hovered = false; hideTip(); });
    g.on("pointertap", () => clickBuilding(bobj));
    world.addChild(g);
    return bobj;
  }

  // archetype-specific rooftop/facade detailing, drawn into fxG after the core box
  function archDetail(b, bw, bh, H, roof) {
    const fx = b.fxG, a = b.arch, st = b.packet._state;
    if (a === "foundry" || a === "machineshop") {
      // smokestack(s) on the roof
      fx.rect(-bw * 0.45, -H - 18, 3.4, 18).fill(C.g950);
      fx.rect(-bw * 0.45 - 0.5, -H - 19, 4.4, 2).fill(C.g800);
      if (a === "machineshop") {
        // sawtooth roof glazing ridge
        for (let k = -2; k <= 2; k++) fx.poly([k * 4, -H - 3, k * 4 + 3, -H - 7, k * 4 + 3, -H - 3]).fill({ color: C.glass, alpha: 0.7 });
      } else {
        // ribbed shed siding accent
        for (let k = 1; k < 4; k++) fx.rect(-bw + k * (bw * 0.5), -H * 0.6, 0.8, H * 0.55).fill({ color: C.g950, alpha: 0.3 });
      }
    } else if (a === "observatory") {
      // domed roof cap
      fx.circle(0, -H - 2, bw * 0.62).fill({ color: roof, alpha: 0.95 });
      fx.circle(0, -H - 2, bw * 0.62).stroke({ width: 1, color: C.cream50, alpha: 0.5 });
      fx.rect(-1.4, -H - bw * 0.62, 2.8, bw * 0.4).fill({ color: C.g950, alpha: 0.85 }); // dome slit
      fx.circle(0, -H - bw * 0.62, 1.6).fill({ color: C.amber, alpha: 0.9 });
    } else if (a === "tower") {
      // aircraft warning light handled in ticker; add slender antenna
      fx.rect(-0.6, -H - 22, 1.2, 22).fill(C.g950);
    } else if (a === "data") {
      // server-rack ribbed facade — vertical louvers
      for (let k = 0; k < 5; k++) {
        const u = k / 5;
        fx.rect(-bw + u * bw * 2, -H * 0.85, 1.2, H * 0.8).fill({ color: C.g950, alpha: 0.28 });
      }
      // status LEDs
      for (let k = 0; k < 3; k++) fx.circle(bw * 0.4, -H + 8 + k * 6, 1).fill({ color: st === "done" ? C.turf : C.amber, alpha: 0.9 });
    } else if (a === "harbor" || a === "dock") {
      // shipping containers stacked at the base
      const cols2 = [C.teal, C.clay, C.gold, C.g600];
      for (let k = 0; k < 3; k++) fx.rect(-bw - 6 + k * 0, bh - 6 - k * 4, 10, 3.4).fill({ color: cols2[k % cols2.length], alpha: 0.9 });
      // gantry crane arm over the roof
      fx.rect(-bw, -H - 14, 1.6, 14).fill(C.g700);
      fx.rect(-bw, -H - 14, bw * 1.6, 1.6).fill(C.g700);
      fx.rect(-bw + bw * 1.3, -H - 14, 1, 8).fill(C.g800);
    } else if (a === "quarry") {
      // terraced stone setbacks (steps drawn as lighter bands)
      for (let k = 1; k <= 3; k++) fx.poly([0, -H * (k / 4) - bh, bw * 0.7, -H * (k / 4), 0, -H * (k / 4) + bh, -bw * 0.7, -H * (k / 4)]).stroke({ width: 1, color: C.tan, alpha: 0.5 });
    } else if (a === "qalab") {
      // flask/beaker silhouette atop the roof
      fx.poly([-3, -H - 4, 3, -H - 4, 5, -H - 12, -5, -H - 12]).fill({ color: C.glass, alpha: 0.8 }).stroke({ width: 1, color: C.teal, alpha: 0.6 });
      fx.rect(-1.4, -H - 14, 2.8, 3).fill(C.teal);
      fx.circle(0, -H - 6, 1.4).fill({ color: C.turf, alpha: 0.9 }); // reagent bubble
    }
  }

  function paintBox(b) {
    const H = b.curH, p = b.packet, st = p._state, stage = b.stage || "lot";
    const bw = HW * 0.5 * b.sizeF, bh = HH * 0.5 * b.sizeF;
    const g = b.boxG; g.clear(); const fx = b.fxG; fx.clear();
    const fam = b.fam || familyFor(b.arch, 0);
    const pct = clamp(p.completion_percent || 0, 0, 100);
    b.plotG.clear();
    // soft contact / ambient-occlusion shadow pooled on the ground
    b.plotG.ellipse(bw * 0.18, bh * 1.15, bw * 1.35, bh * 1.05).fill({ color: C.g900, alpha: 0.14 });
    // tile-textured pad with a curb seam (district-tinted)
    diamond(b.plotG, { x: 0, y: 0 }, HW * 0.72 * b.sizeF, HH * 0.72 * b.sizeF, st === "planned" ? C.cream200 : C.cream100, 0.95, fam.ground, 0.3);
    diamond(b.plotG, { x: 0, y: 0 }, HW * 0.62 * b.sizeF, HH * 0.62 * b.sizeF, st === "planned" ? C.cream200 : C.cream0, 0.5, C.curb, 0.4);

    // ---- STAGE: bare staked LOT (planned) ----------------------------------
    if (stage === "lot") {
      diamond(g, { x: 0, y: 0 }, bw, bh, C.cream200, 0.85, fam.ground, 0.4);
      // corner stakes + survey string
      const pts = [[-bw, 0], [bw, 0], [0, -bh], [0, bh]];
      for (const [px, py] of pts) { g.rect(px - 0.6, py - 4, 1.2, 4).fill(C.woodDk || 0x6b4a2e); g.circle(px, py - 4, 1).fill(C.clay); }
      g.poly([-bw, 0, 0, -bh, bw, 0, 0, bh, -bw, 0]).stroke({ width: 0.7, color: C.tan, alpha: 0.7 });
      return;
    }

    // base district family colors with status overrides (district color still shows)
    let roof = fam.roof, left = fam.left, right = fam.right, accent = fam.accent;
    if (st === "blocked") { roof = shadeColor(C.clay, 0.05); left = 0x9c5630; right = 0x7d3b22; accent = C.cream100; } // clay/desat
    else if (st === "done") { roof = shadeColor(fam.roof, 0.16); accent = C.gold; }
    else if (st === "active") { roof = shadeColor(fam.roof, 0.1); }

    // ---- STAGE: FOUNDATION (low slab) --------------------------------------
    if (stage === "foundation") {
      const fh = Math.min(H, 6);
      g.poly([-bw, 0, 0, bh, bw, 0, 0, -bh]).fill({ color: shadeColor(C.cream200, -0.1), alpha: 0.95 });
      g.poly([-bw, 0, 0, bh, 0, bh - fh, -bw, -fh]).fill(shadeColor(left, -0.1));
      g.poly([0, bh, bw, 0, bw, -fh, 0, bh - fh]).fill(shadeColor(right, -0.1));
      // rebar stubs
      for (let k = -1; k <= 1; k++) g.rect(k * bw * 0.5 - 0.4, -fh - 4, 0.8, 4).fill(C.steel || 0x9fb0a6);
      siteDress(b, bw, bh, "foundation");
      return;
    }

    // gradient-shaded plinth
    g.poly([-bw, 0, 0, bh, bw, 0, 0, -bh]).fill({ color: shadeColor(left, -0.35), alpha: 0.95 });

    // ---- STAGE: steel FRAME / girders --------------------------------------
    if (stage === "frame") {
      // translucent volume + visible girders going up
      g.poly([-bw, 0, 0, bh, 0, bh - H, -bw, -H]).fill({ color: left, alpha: 0.35 });
      g.poly([0, bh, bw, 0, bw, -H, 0, bh - H]).fill({ color: right, alpha: 0.35 });
      const cols = Math.max(2, Math.round(bw / 6));
      for (let k = 0; k <= cols; k++) {
        const u = k / cols;
        g.rect(-bw + u * bw - 0.5, -H + u * bh, 1, H).fill({ color: C.steel || 0x9fb0a6, alpha: 0.9 });   // left posts
        g.rect(u * bw - 0.5, -H + (bh - u * bh), 1, H).fill({ color: shadeColor(C.steel || 0x9fb0a6, -0.15), alpha: 0.9 }); // right posts
      }
      // horizontal beams
      const flr = Math.max(1, Math.round(H / 12));
      for (let f = 1; f <= flr; f++) {
        const y = -H * (f / flr);
        g.poly([-bw, y, 0, y + bh, bw, y, 0, y - bh]).stroke({ width: 1, color: C.steel || 0x9fb0a6, alpha: 0.7 });
      }
      drawScaffold(fx, bw, bh, H, flr);
      siteDress(b, bw, bh, "frame");
      return;
    }

    // ---- STAGE: walls / roof / finished — solid faces with gradient shade ----
    g.poly([-bw, 0, 0, bh, 0, bh - H, -bw, -H]).fill(left);
    g.poly([-bw, 0, 0, bh, 0, bh - H, -bw, -H]).fill({ color: shadeColor(left, -0.18), alpha: 0.35 }); // AO toward base
    g.poly([0, bh, bw, 0, bw, -H, 0, bh - H]).fill(right);
    g.poly([0, bh, bw, 0, bw, -H, 0, bh - H]).fill({ color: shadeColor(right, -0.22), alpha: 0.4 });
    // lit roof (single light source) only once roof stage reached
    if (stage === "roof" || stage === "finished") {
      g.poly([0, -bh - H, bw, -H, 0, bh - H, -bw, -H]).fill(roof);
      g.poly([0, -bh - H, bw, -H, 0, bh - H, -bw, -H]).fill({ color: shadeColor(roof, 0.22), alpha: 0.3 }); // rim light
      g.poly([0, -bh - H, bw, -H, 0, bh - H, -bw, -H]).stroke({ width: 1.2, color: st === "done" ? C.gold : C.cream50, alpha: 0.45 });
    } else {
      // walls up but roof open — show floor decking
      g.poly([0, -bh - H, bw, -H, 0, bh - H, -bw, -H]).fill({ color: shadeColor(C.tan, -0.1), alpha: 0.85 });
    }
    // edge highlight on the lit (left) vertical seam
    g.moveTo(-bw, 0).lineTo(-bw, -H).stroke({ width: 1, color: shadeColor(left, 0.3), alpha: 0.5 });

    // windows + interiors — count + glow driven by completion% (#12 interiors)
    const floors = Math.max(1, Math.min(8, Math.round(H / 11)));
    const cols = bw > HW * 0.45 ? 3 : 2;
    const totalWins = floors * cols * 2;
    const litCount = st === "blocked" ? Math.round(totalWins * 0.1) : Math.round(totalWins * (pct / 100));
    const glowStrength = clamp(pct / 100, 0, 1);
    let wi = 0;
    for (let f = 0; f < floors; f++) {
      const vy = (f + 0.55) / floors;
      for (let c2 = 0; c2 < cols; c2++) {
        const u = (c2 + 0.5) / cols;
        const lx = -bw + u * bw, ly = (u * bh) - H * vy;
        winDot(fx, lx, ly, wi++ < litCount, st, glowStrength);
        const rx = u * bw, ry = (bh - u * bh) - H * vy;
        winDot(fx, rx, ry, wi++ < litCount, st, glowStrength);
      }
    }
    // entrance with awning
    fx.rect(bw * 0.30, bh * 0.24 - 7, 4, 7).fill({ color: shadeColor(left, -0.4), alpha: 0.9 });
    fx.poly([bw * 0.28, bh * 0.24 - 7, bw * 0.5, bh * 0.24 - 7, bw * 0.5, bh * 0.24 - 5, bw * 0.28, bh * 0.24 - 5]).fill({ color: accent, alpha: 0.85 });
    // accent banner stripe near the roofline
    fx.poly([0, -bh - H + 5, bw, -H + 5, bw, -H + 8.5, 0, -bh - H + 8.5]).fill({ color: accent, alpha: 0.6 });

    // archetype-specific rooftop silhouette + extra rooftop dressing (#9)
    archDetail(b, bw, bh, H, roof);
    roofDress(b, bw, bh, H, accent, st);

    // scaffold wrap while still walling up
    if (stage === "walls" || (st === "active" && b.targetH > b.curH + 0.5)) {
      drawScaffold(fx, bw, bh, H, floors);
    }
    if (st === "active") siteDress(b, bw, bh, stage);
  }

  // window with a hint of warm interior room behind the glass; glow grows w/ %
  function winDot(fx, x, y, lit, st, glow) {
    if (lit) {
      const warm = st === "done" ? C.gold : 0xfdf6e0;
      fx.rect(x - 1.7, y - 2.4, 3.4, 3.1).fill({ color: shadeColor(warm, -0.25), alpha: 0.9 }); // interior depth
      fx.rect(x - 1.4, y - 2.1, 2.8, 2.5).fill({ color: warm, alpha: 0.55 + 0.4 * glow });       // lit pane
      fx.rect(x - 1.4, y - 2.1, 2.8, 1).fill({ color: C.cream0, alpha: 0.5 * glow });             // top sheen
    } else {
      fx.rect(x - 1.4, y - 2, 2.8, 2.6).fill({ color: 0x2a3a30, alpha: 0.45 });
    }
  }

  // construction scaffold poles + planks (cream/tan)
  function drawScaffold(fx, bw, bh, H, rungs) {
    fx.rect(-bw - 2.5, -H, 1.8, H).fill({ color: C.tan, alpha: 0.88 });
    fx.rect(bw + 0.7, -H, 1.8, H).fill({ color: C.tan, alpha: 0.88 });
    for (let yy = 0; yy <= rungs; yy++) {
      fx.rect(-bw - 2.5, -H * (yy / rungs), bw * 2 + 5, 1).fill({ color: shadeColor(C.tan, -0.05), alpha: 0.6 });
    }
    // a couple diagonal braces
    fx.moveTo(-bw - 2.5, 0).lineTo(-bw - 0.7, -H).stroke({ width: 0.8, color: C.tan, alpha: 0.6 });
    fx.moveTo(bw + 2.5, 0).lineTo(bw + 0.7, -H).stroke({ width: 0.8, color: C.tan, alpha: 0.6 });
  }

  // rooftop units / vents / water-tank / signage chip (varies the skyline #9)
  function roofDress(b, bw, bh, H, accent, st) {
    const fx = b.fxG, seed = (b.packet.id || "").length;
    const top = -H;
    if (seed % 3 === 0) { // HVAC box
      fx.rect(-bw * 0.4, top - 4, bw * 0.5, 4).fill({ color: C.steel || 0x9fb0a6, alpha: 0.85 });
      fx.rect(-bw * 0.4, top - 4, bw * 0.5, 1).fill({ color: shadeColor(C.steel || 0x9fb0a6, 0.3), alpha: 0.7 });
    } else if (seed % 3 === 1) { // water tank
      fx.rect(bw * 0.1, top - 7, 3.4, 5).fill({ color: C.tan, alpha: 0.9 });
      fx.ellipse(bw * 0.1 + 1.7, top - 7, 1.8, 0.9).fill({ color: shadeColor(C.tan, 0.2) });
      fx.rect(bw * 0.1, top - 2, 0.8, 2).fill(C.woodDk || 0x6b4a2e);
      fx.rect(bw * 0.1 + 2.6, top - 2, 0.8, 2).fill(C.woodDk || 0x6b4a2e);
    } else { // roof vents
      for (let k = -1; k <= 1; k++) fx.rect(k * 3 - 0.7, top - 3, 1.4, 3).fill({ color: shadeColor(C.steel || 0x9fb0a6, -0.1), alpha: 0.8 });
    }
  }

  // job-site dressing at active sites (#12): materials, cones, debris, mixer
  function siteDress(b, bw, bh, stage) {
    const fx = b.fxG;
    // stacked lumber/rebar to the side
    for (let k = 0; k < 3; k++) fx.rect(bw + 3, bh - 1 - k * 1.6, 7, 1.3).fill({ color: shadeColor(C.tan, -0.04 * k), alpha: 0.92 });
    fx.rect(bw + 3, bh + 1, 7, 0.6).fill({ color: C.woodDk || 0x6b4a2e, alpha: 0.5 });
    // traffic cones at the lot edge
    for (const cx of [-bw - 1, bw + 1]) {
      fx.poly([cx - 1.4, bh + 1, cx + 1.4, bh + 1, cx, bh - 4]).fill({ color: C.clay });
      fx.rect(cx - 1, bh - 1.6, 2, 0.8).fill({ color: C.cream0, alpha: 0.85 });
    }
    // a debris/dirt pile
    fx.ellipse(-bw - 4, bh, 4, 1.6).fill({ color: shadeColor(C.tan, -0.2), alpha: 0.8 });
    // cement mixer drum near foundation/frame
    if (stage === "foundation" || stage === "frame") {
      fx.circle(-bw - 4, bh - 3, 2.4).fill({ color: C.steel || 0x9fb0a6, alpha: 0.9 }).stroke({ width: 0.6, color: C.g800, alpha: 0.5 });
      fx.rect(-bw - 5, bh - 1, 2, 1).fill(C.g700);
    }
  }

  // ---------------------------------------------------------------- worker
  // Rigged construction character built in city-crew.js; the engine just places
  // it, sets its animation MODE from real state, and drives it via animateRig.
  function makeWorker(agent, i) {
    const col = ROLE[i % ROLE.length];
    const hatNo = i + 1;
    const rig = makeWorkerRig({
      Container, Graphics, Text, role: col, hatNo, name: agent.name || agent.id,
      role_label: agent.role || agent.district || "", lblFont: LBL_WORKER,
      onTap: () => { if (S && S._ctx) S._ctx.go("agent-cockpit", { agent: agent.id }); },
    });
    rig.phase = i * 0.7;
    const g = rig.g;
    const d = depot;
    g.x = d.x + (i % 5) * 8 - 16; g.y = d.y - Math.floor(i / 5) * 7; g.zIndex = g.y + 50000;
    const wref = {
      rig, g, col, hatNo, agent, phase: i * 0.7,
      tx: g.x, ty: g.y, active: false, building: null, intensity: 0.5,
      atSite: false, mode: "idle", facing: 1, carrying: false,
    };
    rig.phase = wref.phase;
    world.addChild(g);
    return wref;
  }

  // pick the rig animation MODE from the worker's real situation each frame
  function workerMode(w) {
    const moving = Math.abs(w.g.x - w.tx) > 1.2 || Math.abs(w.g.y - w.ty) > 1.2;
    if (moving) return w.carrying ? "carry" : "walk";
    if (w._celebrate > 0) return "done";
    if (!w.atSite || !w.active) return "idle";
    const b = w.building;
    if (b && b.packet) {
      const st = b.packet._state;
      if (st === "blocked") return "blocked";
      if (st === "done") return "done";
      // tall / nearly-finished active site → inspect; otherwise hammer
      if (b.curH > MAXBH * 0.62 && (b.packet.completion_percent || 0) > 70) return "inspect";
      return "hammer";
    }
    return "idle";
  }

  // emit a hammer spark/chip particle at a worker's tool on a strike beat
  function emitSpark(x, y, col) {
    if (fxParticles.length > 60) return;
    const p = fxPool.pop() || new Graphics();
    p.x = x; p.y = y; p.zIndex = y + 60000;
    fxLayer.addChild(p);
    fxParticles.push({ g: p, vx: (Math.random() - 0.5) * 22, vy: -18 - Math.random() * 14, life: 0.5, col: col || C.gold });
  }

  // ---------------------------------------------------------------- vehicles
  // delivery vehicles with variety (flatbed / van / forklift) spawned from live
  // file_changed / packet_started events; they drive roads, stop to load (#12).
  function spawnVehicle(fromBlock) {
    if (!roadSegs.length || vehicles.length > 7) return;
    const seg = roadSegs[Math.floor(Math.random() * roadSegs.length)];
    const g = new Container();
    const body = new Graphics();
    const cargo = new Graphics();
    const kind = ["flatbed", "van", "forklift"][Math.floor(Math.random() * 3)];
    const col = [C.g600, C.teal, C.clay, C.amber, C.g700][vehicles.length % 5];
    if (kind === "flatbed") {
      body.roundRect(-6, -4, 12, 4, 1).fill(col);                       // long bed
      body.roundRect(-6, -7.5, 4, 3.8, 1).fill(shadeColor(col, -0.2));  // cab
      body.rect(-5.2, -6.5, 2.6, 2).fill({ color: C.glass, alpha: 0.75 });
      body.circle(-3.5, 0, 1.4).fill(C.g950); body.circle(3.5, 0, 1.4).fill(C.g950);
      cargo.roundRect(-1.5, -2, 6, 2.4, 0.5).fill(C.tan).stroke({ width: 0.5, color: C.woodDk, alpha: 0.5 }); // lumber load
    } else if (kind === "van") {
      body.roundRect(-5, -7.5, 10, 7.5, 1.4).fill(col);                 // boxy van
      body.rect(-4.6, -6.8, 3, 2.2).fill({ color: C.glass, alpha: 0.75 });
      body.rect(-5, -4, 10, 0.8).fill({ color: shadeColor(col, -0.25), alpha: 0.6 });
      body.circle(-3, 0, 1.4).fill(C.g950); body.circle(3, 0, 1.4).fill(C.g950);
      cargo.roundRect(-2, -2.2, 4, 2.4, 0.4).fill(C.cream100);          // package
    } else { // forklift
      body.roundRect(-3.5, -5, 7, 5, 1).fill(col);                      // compact body
      body.rect(-1, -8, 1.4, 4).fill(shadeColor(col, -0.2));           // mast
      body.rect(-1, -4.5, 4, 0.8).fill(shadeColor(col, -0.3));         // fork
      body.circle(-2.2, 0, 1.5).fill(C.g950); body.circle(2.2, 0, 1.1).fill(C.g950);
      cargo.rect(2, -5, 2.6, 2.6).fill(C.tan);                          // pallet on the fork
    }
    cargo.y = -8;
    g.addChild(body); g.addChild(cargo);
    vehicleLayer.addChild(g);
    vehicles.push({ g, cargo, seg, t: 0, dir: Math.random() < 0.5 ? 1 : -1, spd: 0.18 + Math.random() * 0.12, pause: 0, stopped: false });
  }

  // ---------------------------------------------------------------- tooltip
  let tipBuilding = null;
  function showTip(b) { tipBuilding = b; renderTip(); tip.style.opacity = "1"; }
  function hideTip() { tipBuilding = null; tip.style.opacity = "0"; }
  function positionTip(e) {
    const r = app.canvas.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    // event.global is in renderer px; canvas is scaled to css width → map to css px
    const sx = r.width / app.renderer.width, sy = r.height / app.renderer.height;
    const gx = (e.global ? e.global.x : 0) * sx + (r.left - wr.left);
    const gy = (e.global ? e.global.y : 0) * sy + (r.top - wr.top);
    tip.style.left = gx + "px"; tip.style.top = (gy - 10) + "px";
  }
  function renderTip() {
    if (!tipBuilding || !tipBuilding.packet) return;
    const p = tipBuilding.packet, st = p._state;
    const owner = S && S._ownerName ? S._ownerName(p.owner_lane) : (p.owner_lane || "—");
    const stTxt = st === "done" ? "shipped ✓" : st === "active" ? "under construction" : st === "blocked" ? "blocked ⚑" : "planned";
    const stCol = st === "done" ? "#2c7650" : st === "active" ? "#b88916" : st === "blocked" ? "#b86a3d" : "#6b7a6f";
    tip.innerHTML =
      `<div style="font-weight:800;font-size:12.5px;margin-bottom:2px">${esc(p.short || p.title || p.id)}</div>` +
      `<div style="color:#6b7a6f;font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">${esc(p.district || "")}</div>` +
      `<div style="color:${stCol};font-weight:700">${stTxt}</div>` +
      `<div style="margin-top:4px">completion <b>${Math.round(p.completion_percent || 0)}%</b> · confidence <b>${Math.round(p.confidence_percent || 0)}%</b></div>` +
      (p.stage ? `<div style="color:#6b7a6f;margin-top:2px">stage: ${esc(p.stage)}</div>` : "") +
      (st === "blocked" && p.blocked_reason ? `<div style="color:#b86a3d;margin-top:3px">⚑ ${esc(p.blocked_reason)}</div>` : "") +
      `<div style="color:#1f5b3d;margin-top:4px">crew: ${esc(owner)}</div>` +
      `<div style="color:#6b7a6f;font-size:9.5px;margin-top:4px">click → open this packet</div>`;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // SELECTION (the integration seam): clicking a building highlights it AND
  // dispatches a window CustomEvent so agent-city.js can open its live drawer.
  let selectedId = null;
  function selectBuilding(b) {
    selectedId = b && b.packet ? b.packet.id : null;
    for (const ob of buildings.values()) ob.selected = (ob === b);
  }
  function clickBuilding(b) {
    if (!b.packet) return;
    selectBuilding(b);
    try {
      window.dispatchEvent(new CustomEvent("cc:building-selected", { detail: { packetId: b.packet.id } }));
    } catch {}
  }

  // ---------------------------------------------------------------- HUD
  function renderHUD(packets) {
    const total = packets.length;
    const done = packets.filter((p) => p.status === "done").length;
    const active = packets.filter((p) => p.status === "active").length;
    const blocked = packets.filter((p) => p.status === "blocked").length;
    const planned = packets.filter((p) => p.status === "planned").length;
    let wsum = 0, wpct = 0;
    for (const p of packets) { const w = p.weight || 1; wsum += w; wpct += w * clamp(p.completion_percent || 0, 0, 100); }
    const overall = wsum ? Math.round(wpct / wsum) : 0;
    const chip = (label, val, col) =>
      `<span style="background:rgba(255,253,246,0.92);padding:3px 8px;border-radius:8px;border:1px solid rgba(31,91,61,0.16);color:${col}">${label} <b>${val}</b></span>`;
    hud.innerHTML =
      chip("CITY", total, "#1f5b3d") +
      chip("✓", done, "#2c7650") +
      chip("🏗", active, "#b88916") +
      chip("⚑", blocked, "#b86a3d") +
      chip("◻", planned, "#6b7a6f") +
      chip("BUILT", overall + "%", "#1f5b3d");
  }

  // ---------------------------------------------------------------- update
  function update(ctx) {
    S._ctx = ctx;
    S._ownerName = (id) => { const a = (ctx.state?.agents || []).find((x) => x.id === id); return a ? a.name : (id || "—"); };
    const s = ctx.state || {};
    const packets = s.packets || [];
    const agents = s.agents || [];

    // honest empty plot
    if (!packets.length) {
      for (const b of buildings.values()) { world.removeChild(b.g); }
      buildings.clear();
      blocks = []; homeZones = []; plotByPacket.clear(); blockOfPacket.clear();
      plan = { planW: 6, planH: 4, plotGap: 1, blockGap: 2.4 };
      renderHUD([]);
      emptyEl.style.display = "flex";
      const sig = "empty";
      if (sig !== lastSig) { lastSig = sig; layout(); }
      return;
    }
    emptyEl.style.display = "none";

    // re-plan town only when the district roster / counts change (cheap signature)
    const zones = zonePackets(packets);
    const buildingNames = zones.map((z) => z.name);
    homeZones = zoneHomes(agents, buildingNames);
    const sig = zones.map((z) => z.name + ":" + z.count).join("|") + "::" + homeZones.map((h) => h.name).join(",");
    if (sig !== lastSig) {
      lastSig = sig;
      // Collision-safe spacing: the biggest plot diamond is HW*0.72*SIZEF_MAX wide,
      // i.e. 0.72*SIZEF_MAX grid units half-width. Adjacent plot centers must clear
      // 2× that plus a green margin so pads/shadows/scaffold/glow never touch.
      // Owner flag #8: SPREAD IT OUT. Generous gaps between plots AND districts so
      // nothing touches; rely on camera pan/zoom for navigation instead of cramming.
      const plotGap = 2 * (0.72 * SIZEF_MAX) + 2.6;    // ≈ 4.7 grid units — wide streets between buildings
      const blockGap = 7.5;                            // real road + green belt between neighborhoods
      plotGapPx = plotGap;
      const town = planTown(zones, { plotGap, blockGap, bandUnits: 26, maxCols: 4 });
      blocks = town.blocks; plan = town;
      plotByPacket = new Map(); blockOfPacket = new Map();
      for (const blk of blocks) {
        blk.packets.forEach((p, i) => {
          plotByPacket.set(p.id, plotInBlock(blk, i, town.plotGap));
          blockOfPacket.set(p.id, blk);
        });
      }
      // drop buildings whose packet no longer exists
      const live = new Set(packets.map((p) => p.id));
      for (const [id, b] of buildings) { if (!live.has(id)) { world.removeChild(b.g); buildings.delete(id); } }
      layout();
    }

    // upsert buildings
    packets.forEach((p, idx) => {
      let b = buildings.get(p.id);
      if (!b) { b = makeBuilding(p, idx); buildings.set(p.id, b); }
      const pct = clamp(p.completion_percent || 0, 0, 100);
      const st = STATE_OF(p);
      b.packet = { ...p, _state: st };
      b.arch = (blockOfPacket.get(p.id) || {}).arch || archetypeFor(p.district || "").arch || "generic";
      // distinct district color family + subtle per-building variation so each
      // building is individually distinguishable within its neighborhood (#7,#9)
      const blk = blockOfPacket.get(p.id);
      const districtIdx = blk ? blocks.indexOf(blk) : idx;
      const fam = familyFor(b.arch, districtIdx);
      const v = ((idx * 37) % 7) / 7 * 0.12 - 0.04;  // ±tint variation per building
      b.fam = {
        roof: shadeColor(fam.roof, v + 0.04), left: shadeColor(fam.left, v),
        right: shadeColor(fam.right, v - 0.04), accent: fam.accent, ground: fam.ground,
      };
      b.heightVar = 0.34 + (((idx * 53) % 11) / 11) * 0.66;  // STABLE per-building height (short..tall) — main skyline variety
      b.widthVar = 0.92 + (((idx * 29) % 5) / 5) * 0.3;      // vary widths
      b.sizeF = (0.85 + Math.min(0.6, (p.weight || 5) / 18)) * b.widthVar; // footprint by weight + variation
      b.stage = stageFromPct(st, pct);                        // construction stage (#12)
      // height = stable per-building variety (drives the skyline) modulated by % done,
      // so a uniform 95%% no longer makes every building an identical tall tower.
      b.targetH = st === "planned" ? 0 : (10 + b.heightVar * (MAXBH - 10)) * (0.6 + 0.4 * (pct / 100));
      const pos = plotByPacket.get(p.id) ? iso(plotByPacket.get(p.id).gx, plotByPacket.get(p.id).gy) : iso(idx, 0);
      b.g.x = pos.x; b.g.y = pos.y; b.g.zIndex = pos.y;
      const short = p.short || (p.title || p.id).replace(/^Task 0[AB]? . /, "").replace(/ and .*/i, "").slice(0, 18);
      const stTag = st === "blocked" ? "blocked" : st === "done" ? "shipped" : st === "active" ? Math.round(pct) + "%" : "planned";
      const glyph = (blk && blk.glyph) || archetypeFor(p.district || "").glyph || "▦";
      const labelTxt = `${short}  ·  ${stTag}`;
      const key = labelTxt + "|" + st;
      if (key !== b.labelKey) {
        b.labelKey = key;
        b.label.text = labelTxt;
        b.label.style.fill = st === "blocked" ? C.clay : st === "done" ? C.g700 : st === "active" ? C.amber : C.inkMut;
        // cream pill behind the text so it stays readable over turf/buildings
        const lw = b.label.width + 12, lh = b.label.height + 5;
        b.label.x = 0; b.label.y = 4;
        b.labelBg.clear();
        b.labelBg.roundRect(-lw / 2, 1, lw, lh, 7).fill({ color: C.cream0, alpha: 0.92 }).stroke({ width: 1, color: st === "done" ? C.g600 : st === "blocked" ? C.clay : C.cream200, alpha: 0.7 });
      }
      // tiny always-on signage chip (glyph + %) — the only label when zoomed out (#10,#12)
      const chipTxt = st === "blocked" ? `${glyph} ⚑` : st === "done" ? `${glyph} ✓` : st === "planned" ? `${glyph}` : `${glyph} ${Math.round(pct)}%`;
      if (chipTxt !== b.chipKey) {
        b.chipKey = chipTxt;
        b.chip.text = chipTxt;
        b.chip.style.fill = st === "blocked" ? C.clay : st === "done" ? C.g700 : C.ink;
        const cw = b.chip.width + 10, ch = b.chip.height + 4;
        b.chip.x = 0; b.chip.y = 0;
        const famCol = (b.fam && b.fam.accent) || C.gold;
        b.chipBg.clear();
        b.chipBg.roundRect(-cw / 2, -ch / 2, cw, ch, ch / 2).fill({ color: C.cream0, alpha: 0.95 }).stroke({ width: 1.2, color: st === "done" ? C.gold : st === "blocked" ? C.clay : famCol, alpha: 0.85 });
      }
    });

    // upsert + assign workers
    const nowMs = Date.now();
    // ACCURACY: an agent is "working" ONLY if it has real recent telemetry activity.
    // Build last-activity-time per agent from the live event stream (heartbeats are
    // often empty, so events are the reliable signal). Stale agents go wait in the yard.
    const WORK_WINDOW_MIN = 20; // counts as "working" only with activity in the last 20 min
    const lastActAt = new Map();
    for (const e of (ctx.events || [])) {
      if (!e || !e.agent || !e.ts) continue;
      const t = new Date(e.ts).getTime();
      if (!lastActAt.has(e.agent) || t > lastActAt.get(e.agent)) lastActAt.set(e.agent, t);
    }
    let depotN = 0;                                   // local slot counter so idle workers don't smoosh
    buildings.forEach((b) => { b._activeWork = false; }); // cleared each refresh; only truly-worked sites re-light
    agents.forEach((a, i) => {
      let w = workers.get(a.id); if (!w) { w = makeWorker(a, i); workers.set(a.id, w); }
      w.agent = a;
      // REAL recent activity for this agent (events first, heartbeat fallback).
      const hb = a.heartbeat || a.last_update;
      const lastAct = lastActAt.has(a.id) ? lastActAt.get(a.id) : (hb ? new Date(hb).getTime() : 0);
      const actAgeMin = lastAct > 0 ? (nowMs - lastAct) / 60000 : Infinity;
      const recentlyActive = actAgeMin < WORK_WINDOW_MIN;
      // INTENSITY + freshness from REAL recency (how hard the rig strides/swings).
      const q = a.queue_depth || 0, ft = (a.files_touched || []).length;
      const fresh = clamp(1 - actAgeMin / WORK_WINDOW_MIN, 0, 1);
      w.intensity = clamp(0.3 + q * 0.1 + ft * 0.035 + fresh * 0.25, 0.3, 1);
      // A worker only goes to a building when ACTUALLY working: a genuinely
      // active/blocked owned building AND recent activity. No fallback to idle sites.
      const owned = packets.find((p) => p.owner_lane === a.id && (p.status === "active" || p.status === "blocked"));
      const reallyWorking = !!owned && recentlyActive;
      w.active = reallyWorking;
      const tb = reallyWorking ? buildings.get(owned.id) : null;
      if (tb) {
        tb._activeWork = true;                          // single source of truth: lit + crane + worker here
        w.tx = tb.g.x + (i % 2 ? 16 : -16); w.ty = tb.g.y + 11; w.building = tb; w.atSite = true;
        // carry materials toward an early-stage active site (visible delivery)
        const stg = tb.stage;
        w.carrying = (stg === "foundation" || stg === "frame" || stg === "walls");
        // brief celebration when the owned building just crossed to done
        if (tb.packet && tb.packet._state === "done" && !w._wasDone) { w._celebrate = 2.2; }
        w._wasDone = tb.packet && tb.packet._state === "done";
      } else {
        // NOT working -> walk back to the home plaza / depot yard and wait, in a
        // tidy grid slot so idle workers never smoosh together.
        const hz = homeZones.find((z) => z.agents.some((x) => x.id === a.id));
        if (hz && hz._center) {
          const k = Math.max(0, hz.agents.findIndex((x) => x.id === a.id));
          const col = k % 3, row = Math.floor(k / 3);
          w.tx = hz._center.x + (col - 1) * 19; w.ty = hz._center.y + row * 16 - 4;
        } else {
          const k = depotN++; const col = k % 4, row = Math.floor(k / 4);
          w.tx = depot.x + (col - 1.5) * 19; w.ty = depot.y + row * 16 - 4;
        }
        w.building = null; w.atSite = false; w.carrying = false; w._wasDone = false;
      }
    });

    renderHUD(packets);

    // spawn delivery vehicles from recent file_changed / packet_started events
    const events = ctx.events || [];
    if (events.length) {
      const newest = events[events.length - 1];
      if (newest && newest.id !== lastEventId) {
        lastEventId = newest.id;
        const recent = events.slice(-6).filter((e) => e.type === "file_changed" || e.type === "packet_started");
        if (recent.length) spawnVehicle(null);
      }
    }
    if (tipBuilding) renderTip();
  }

  // ---------------------------------------------------------------- ticker
  let t = 0;
  app.ticker.add((tk) => {
    const dt = tk.deltaTime, dms = tk.deltaMS / 1000; t += dms;
    stepCamTween(dms);   // smooth camera fly-to (#5)

    // ---- COUNTER-SCALE all text so labels hold a constant SCREEN size at any
    // zoom (owner flag #1). A FONT_FLOOR guarantees an effective on-screen
    // minimum even when the world is zoomed way out. inv = 1/worldScale gives
    // a label its design px; we bump inv up if the design size would fall below
    // the floor on screen.
    const inv = worldScale > 0 ? 1 / worldScale : 1;
    const floorBoost = (designPx) => {
      const onScreen = designPx * worldScale; // px the design font would occupy
      return onScreen < FONT_FLOOR ? (FONT_FLOOR / designPx) * inv : inv;
    };
    const bInv = floorBoost(LBL_BUILDING);
    const npInv = floorBoost(LBL_NAMEPLATE);
    const wkInv = floorBoost(LBL_WORKER);
    const cInv = floorBoost(10);
    // district NAMEPLATES: counter-scale, then a real SCREEN-SPACE de-collision —
    // place by priority (bigger districts first) and HIDE any whose screen box would
    // overlap an already-placed one, so labels NEVER overlap at any zoom. Zooming in
    // spreads them apart so more reappear (dynamic LOD). (owner: kill the overlap)
    {
      const placed = [];
      const ss = npInv * worldScale;                       // actual on-screen scale factor
      const npSorted = nameplateLabels.slice().sort((a, b) => (b._priority || 0) - (a._priority || 0));
      for (const g of npSorted) {
        if (!g._lbl) continue;
        g._lbl.scale.set(npInv);
        const w = (g._npW || 100) * ss, h = (g._npH || 22) * ss;
        const sx = world.x + g.x * worldScale;
        const sy = world.y + (g.y + (g._poleTop || 0)) * worldScale;
        const PADX = 7, PADY = 6;
        const r = { x: sx - w / 2 - PADX, y: sy - h / 2 - PADY, w: w + PADX * 2, h: h + PADY * 2 };
        const hit = placed.some((p) => !(r.x + r.w < p.x || r.x > p.x + p.w || r.y + r.h < p.y || r.y > p.y + p.h));
        g.visible = !hit;
        if (!hit) placed.push(r);
      }
    }
    // BUILDING labels: full name pill only on hover/select/zoomed-in (#10); a
    // tiny glyph+% chip otherwise. Counter-scaled so they read at any zoom (#3).
    const showNames = worldScale >= LOD_NAME_SCALE;
    for (const b of buildings.values()) {
      if (!b.labelHolder) continue;
      const wantName = b.hovered || b.selected || showNames;
      // declutter: a chip shows ONLY when zoomed in a bit, or the building is being
      // actively worked, or it's selected — never a chip on every building at fit-zoom.
      const wantChip = !wantName && (b._activeWork || worldScale >= LOD_CHIP_SCALE);
      b.labelHolder.visible = wantName;
      b.chipHolder.visible = wantChip;
      if (wantName) {
        b.labelHolder.scale.set(bInv);
        b.labelHolder.y = HH * 0.72 * b.sizeF + 5;
      } else {
        b.chipHolder.scale.set(cInv);
        b.chipHolder.y = HH * 0.72 * b.sizeF + 9;
      }
    }
    for (const w of workers.values()) { if (w.rig.tag && w.rig.tag.visible) w.rig.tag.scale.set(wkInv); }

    // clouds drift (screen-space) + cast soft moving ground shadows (world-space #12)
    for (let i = 0; i < cloudG.length; i++) {
      const g = cloudG[i];
      g._x += g._spd * dms;
      if (g._x > cssW + 140) g._x = -140;
      g.clear();
      g.x = g._x; g.y = g._y;
      const s = g._s;
      g.ellipse(0, 0, 26 * s, 11 * s).fill({ color: C.cream0, alpha: 0.55 });
      g.ellipse(18 * s, 3 * s, 18 * s, 9 * s).fill({ color: C.cream0, alpha: 0.5 });
      g.ellipse(-16 * s, 4 * s, 16 * s, 8 * s).fill({ color: C.cream0, alpha: 0.45 });
      // matching ground shadow drifts across the world below the cloud
      const sh = cloudShadowG[i];
      if (sh) {
        sh._x += g._spd * dms * 0.9;
        if (sh._x > (worldBoundsCache ? worldBoundsCache.maxX + 200 : cssW + 200)) sh._x = (worldBoundsCache ? worldBoundsCache.minX - 200 : -200);
        sh.clear();
        sh.x = sh._x; sh.y = sh._y;
        sh.ellipse(0, 0, 60 * s, 26 * s).fill({ color: C.g900, alpha: 0.05 });
      }
    }

    // occasional birds cross the sky (world-space, above buildings)
    for (const bd of birdG) {
      bd._x += bd._spd * dms;
      if (bd._x > (worldBoundsCache ? worldBoundsCache.maxX + 120 : cssW + 120)) {
        bd._x = (worldBoundsCache ? worldBoundsCache.minX - 120 : -120);
        bd._y = (worldBoundsCache ? worldBoundsCache.minY + 40 : 40) + Math.random() * 80;
        bd._spd = 18 + Math.random() * 16;
      }
      bd.x = bd._x; bd.y = bd._y;
      const flap = Math.sin(t * 9 + bd._ph) * 2;
      bd.clear();
      bd.moveTo(-3, 0).lineTo(0, -flap).lineTo(3, 0).stroke({ width: 0.9, color: C.inkMut, alpha: 0.5 });
    }

    // pond — shimmering sheen + expanding ripple rings (#12)
    if (pondCenter) {
      waterG.clear();
      const rw = HW * 0.8, rh = HH * 0.8;
      // drifting highlight band
      const sx = Math.sin(t * 0.6) * 6;
      waterG.ellipse(pondCenter.x - 4 + sx, pondCenter.y - 2, rw * 0.5, rh * 0.4).fill({ color: C.glass, alpha: 0.3 });
      waterG.ellipse(pondCenter.x + 6 + sx * 0.5, pondCenter.y + 1, rw * 0.3, rh * 0.25).fill({ color: C.cream0, alpha: 0.18 });
      // two ripple rings
      for (let k = 0; k < 2; k++) {
        const ph = (t * 0.4 + k * 0.5) % 1;
        waterG.ellipse(pondCenter.x, pondCenter.y, rw * (0.3 + ph * 0.6), rh * (0.3 + ph * 0.6)).stroke({ width: 1, color: C.glass, alpha: (1 - ph) * 0.35 });
      }
    }
    // fountain jets + lamp flicker at dusk (props that flagged themselves)
    for (const pr of props.children) {
      if (pr._fountain && pr._g) {
        const d = pr._g;
        d.clear();
        diamond(d, { x: 0, y: 0 }, 13, 6.5, C.cream100, 0.95, C.curb, 0.6);
        d.ellipse(0, 0, 9, 4.5).fill({ color: C.water, alpha: 0.7 });
        const sx = Math.sin(t * 0.7) * 2;
        d.ellipse(-2 + sx, -1, 4, 2).fill({ color: C.glass, alpha: 0.4 });
        d.rect(-1.2, -6, 2.4, 6).fill(C.cream200);
        // pulsing water jet
        const jh = 5 + Math.abs(Math.sin(t * 3)) * 4;
        d.poly([-1, -6, 1, -6, 2, -6 - jh, -2, -6 - jh]).fill({ color: C.glass, alpha: 0.6 });
        d.circle(0, -6 - jh, 1.4).fill({ color: C.cream0, alpha: 0.7 });
      } else if (pr._lamp && pr._g && pr._lit) {
        // subtle dusk flicker on lit lamps
        const fl = 0.85 + Math.sin(t * 6 + pr.x) * 0.1;
        pr._g.alpha = fl;
      }
    }

    // buildings
    const dashPhase = (t * 26) % 12;        // marching-ants offset for selection ring
    for (const b of buildings.values()) {
      if (!b.packet) continue;
      b.curH = lerp(b.curH, b.targetH, Math.min(1, dt * 0.05));
      if (Math.abs(b.curH - b.drawn) > 0.5) { paintBox(b); b.drawn = b.curH; }
      const st = b.packet._state;

      // SELECTION/HOVER polish (#6,#12): gentle lift + animated dashed ring
      const wantLift = b.selected ? 1 : b.hovered ? 0.5 : 0;
      b.lift = lerp(b.lift, wantLift, Math.min(1, dt * 0.2));
      b.boxG.y = -b.lift * 6; b.fxG.y = -b.lift * 6;
      b.selRing.clear();
      if (b.selected || b.hovered) {
        const rw = HW * 0.85 * b.sizeF, rh = HH * 0.85 * b.sizeF;
        const ringCol = b.selected ? C.gold : C.turf;
        const a = b.selected ? 0.95 : 0.6;
        // dashed iso diamond ring (marching ants when selected)
        const seg = 10, n = 24;
        for (let k = 0; k < n; k++) {
          if (b.selected && ((k + Math.floor(dashPhase)) % 2 === 0)) continue;
          const u0 = k / n, u1 = (k + 0.55) / n;
          const pt = (u) => {
            const a4 = u * Math.PI * 2;
            return [Math.cos(a4) * rw, Math.sin(a4) * rh + rh * 0.25];
          };
          const [x0, y0] = pt(u0), [x1, y1] = pt(u1);
          b.selRing.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 2, color: ringCol, alpha: a });
        }
      }

      // confidence aura — soft glow under/around the building, strength by confidence%
      b.glow.clear();
      if (st !== "planned") {
        const conf = clamp(b.packet.confidence_percent || 0, 0, 100) / 100;
        if (conf > 0.05) {
          const aura = st === "blocked" ? C.clay : st === "done" ? C.gold : C.turf;
          const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + b.g.x);
          b.glow.ellipse(0, HH * 0.3, HW * (0.7 + conf * 0.5), HH * (0.7 + conf * 0.5)).fill({ color: aura, alpha: 0.06 + conf * 0.1 * pulse });
        }
      }
      // ACTIVE-WORK "lit up" — the building being worked on RIGHT NOW stands out:
      // a warm pulsing work-light pool on the ground + a soft body glow.
      if (b._activeWork) {
        const wp = 0.55 + 0.45 * Math.sin(t * 3 + b.g.x);
        b.glow.ellipse(0, HH * 0.32, HW * 1.3, HH * 1.25).fill({ color: C.amber, alpha: 0.12 + 0.12 * wp });
        b.glow.ellipse(0, -b.curH * 0.45, HW * 0.95, HH * 1.6).fill({ color: C.gold, alpha: 0.05 + 0.06 * wp });
      }

      // crane ONLY where an agent is actually working right now (not every active packet)
      const craneOn = b._activeWork;
      b.crane.visible = craneOn;
      if (craneOn) {
        const top = -b.curH - 26;
        b.mast.clear();
        b.mast.rect(-1.6, top, 3.2, 26).fill(C.g700);
        for (let yy = 1; yy < 4; yy++) b.mast.rect(-1.6, top + yy * 6, 3.2, 1).fill({ color: C.g950, alpha: 0.4 });
        b.jib.y = top; b.jib.rotation = Math.sin(t * 0.5 + b.g.x) * 0.5;
        b.jibBar.clear();
        b.jibBar.rect(-10, -1.2, 32, 2.4).fill(C.gold);
        b.jibBar.rect(-10, -2, 5, 4).fill(C.g800);
        b.hook.clear();
        const drop = 8 + Math.sin(t * 2) * 3;
        b.hook.rect(20, 0, 1, drop).fill(C.g800);
        b.hook.rect(18, drop, 4, 2.4).fill(C.tan);
      }

      // tower aircraft warning light (Permission Control Tower archetype)
      // (drawn into beacon layer below so it pulses)
      b.beacon.clear();
      if (st === "done") {
        // gold beacon
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + b.g.x);
        b.beacon.rect(-0.7, -b.curH - 16, 1.4, 16).fill(C.g800);
        b.beacon.circle(0, -b.curH - 18, 2.4 + pulse * 2).fill({ color: C.gold, alpha: 0.5 - pulse * 0.28 });
      } else if (b.arch === "tower" && b._activeWork) {
        const blink = (Math.sin(t * 3 + b.g.x) > 0) ? 0.95 : 0.25;
        b.beacon.circle(0, -b.curH - 24, 1.8).fill({ color: C.red, alpha: blink });
      }

      // planted FLAG on shipped buildings
      b.flag.clear();
      if (st === "done") {
        const fy = -b.curH - 6, wav = Math.sin(t * 3 + b.g.x) * 1.6;
        b.flag.rect(-0.6, fy - 14, 1.2, 14).fill(C.g950);                          // pole
        b.flag.poly([0.6, fy - 14, 11 + wav, fy - 11, 0.6, fy - 8]).fill(C.gold);  // banner
        b.flag.poly([0.6, fy - 14, 11 + wav, fy - 11, 0.6, fy - 8]).stroke({ width: 0.6, color: C.amber, alpha: 0.7 });
      }

      // smoke plume on blocked
      const blocked = st === "blocked"; b.smoke.visible = blocked;
      if (blocked) b.smoke.children.forEach((sg, k) => {
        const ph = (t * 0.5 + k * 0.6) % 1; sg.clear();
        sg.circle(0, 0, 2.5 + ph * 4).fill({ color: 0x8a6a52, alpha: (1 - ph) * 0.5 });
        sg.x = (k - 1) * 3; sg.y = -b.curH - 5 - ph * 22;
      });

      // sparkle burst when a building crosses into done
      if (st === "done" && !b.wasDone) { b.doneBurst = 1; b.sparkle.visible = true; }
      b.wasDone = st === "done";
      if (b.doneBurst > 0) {
        b.doneBurst = Math.max(0, b.doneBurst - dms * 0.7);
        b.sparkle.children.forEach((sp, k) => {
          const ang = (k / 6) * Math.PI * 2;
          const r = (1 - b.doneBurst) * 16;
          sp.clear();
          sp.x = Math.cos(ang) * r; sp.y = -b.curH - 10 - Math.sin(ang) * r;
          sp.circle(0, 0, 1.6 * b.doneBurst).fill({ color: C.gold, alpha: b.doneBurst });
        });
        if (b.doneBurst === 0) { b.sparkle.children.forEach((sp) => sp.clear()); b.sparkle.visible = false; }
      }
    }

    // workers — move + animate the rig per real state
    for (const w of workers.values()) {
      const prevX = w.g.x;
      w.g.x = lerp(w.g.x, w.tx, Math.min(1, dt * 0.045));
      w.g.y = lerp(w.g.y, w.ty, Math.min(1, dt * 0.045));
      w.g.zIndex = w.g.y + 50000;
      if (w._celebrate > 0) w._celebrate = Math.max(0, w._celebrate - dms);
      // face direction of travel (4 iso headings collapse to left/right flip)
      if (Math.abs(w.tx - prevX) > 0.05) w.facing = (w.tx > prevX) ? 1 : -1;
      const rig = w.rig;
      rig.mode = workerMode(w);
      rig.intensity = w.intensity;
      rig.facing = w.facing;
      rig.alpha = w.active ? 1 : 0.6;
      rig.g.alpha = w.active ? 1 : 0.62;
      const sig = animateRig(rig, t, dms);
      // emit a hammer spark/chip exactly on the strike beat (#2,#4)
      if (sig.strike && w.building) {
        const sx = w.g.x + (w.facing >= 0 ? 4 : -4);
        const sy = w.g.y - 8 - (w.building.lift || 0) * 6;
        emitSpark(sx, sy, C.gold);
        emitSpark(sx, sy, C.amber);
      }
    }

    // FX particles — sparks/dust fly + fade, then recycle (pooled, cheap #4)
    for (let i = fxParticles.length - 1; i >= 0; i--) {
      const p = fxParticles[i];
      p.life -= dms;
      p.vy += 40 * dms;                       // gravity
      p.g.x += p.vx * dms; p.g.y += p.vy * dms;
      p.g.clear();
      if (p.life <= 0) {
        fxLayer.removeChild(p.g); fxPool.push(p.g); fxParticles.splice(i, 1);
      } else {
        p.g.circle(0, 0, 0.8 + p.life * 2).fill({ color: p.col, alpha: clamp(p.life * 1.6, 0, 0.9) });
      }
    }

    // vehicles drive along road segments, pause to load/unload at active sites, despawn
    for (let i = vehicles.length - 1; i >= 0; i--) {
      const v = vehicles[i];
      if (v.pause > 0) {
        // loading animation: cargo bobs up/down at a stop
        v.pause -= dms;
        v.cargo.y = -8 - Math.abs(Math.sin(t * 5)) * 2;
        if (v.pause <= 0) v.cargo.y = -8;
        continue;
      }
      const prev = v.t;
      v.t += v.spd * dms;
      const seg = v.seg;
      const u = v.dir > 0 ? v.t : 1 - v.t;
      v.g.x = lerp(seg.a.x, seg.b.x, u);
      v.g.y = lerp(seg.a.y, seg.b.y, u);
      v.g.zIndex = v.g.y + 40000;
      v.g.scale.x = (seg.b.x - seg.a.x) * v.dir >= 0 ? 1 : -1;
      // one mid-route delivery pause to "unload"
      if (!v.stopped && prev < 0.5 && v.t >= 0.5) { v.stopped = true; v.pause = 0.8; }
      if (v.t >= 1) { vehicleLayer.removeChild(v.g); vehicles.splice(i, 1); }
    }
  });

  // re-fit on resize but PRESERVE the user's zoom/pan once they've interacted
  const ro = new ResizeObserver(() => {
    const w = Math.max(360, wrap.clientWidth || 980);
    cssW = w; cssH = Math.max(440, Math.round(w * 0.66));
    app.renderer.resize(cssW, cssH);
    drawSky(); drawGround(); computeFit(); applyTransform(false);
  });
  ro.observe(wrap);
  requestAnimationFrame(() => layout());
  setTimeout(dismissHint, 6000);
  return { app, wrap, update, buildings, workers, _ctx: null, _ownerName: () => "—" };
}
