/* factory-engine.js — PixiJS assembly line for the BaseballHelm build.
   Six machine stations over a running conveyor (Backlog→Ready→Build→Test→Review→Ship).
   Crates = real work packets; they ride to the station matching their stage. A robotic
   arm works QA, sparks fly at Build, smoke rises on blocked, a truck loads at Ship.
   Persistent singleton fed by live telemetry.  Cream/green, no black. */
import { Application, Container, Graphics, Text } from "./vendor/pixi.mjs";

const C = {
  cream0: 0xfffdf6, cream50: 0xfcf8ec, cream100: 0xf4ecd8, cream200: 0xe7dcc2, tan: 0xd6c393,
  ink: 0x122018, inkMut: 0x6b7a6f, g950: 0x0e2a1d, g900: 0x123522, g800: 0x17432d, g700: 0x1f5b3d,
  g600: 0x2c7650, turf: 0x3c9361, mint: 0xdcefe3, gold: 0xc8a24a, clay: 0xb86a3d, amber: 0xb88916, red: 0xb84035,
};
const STATIONS = [
  { id: "backlog", name: "Backlog", icon: "▦" }, { id: "ready", name: "Ready", icon: "▥" },
  { id: "build", name: "Build", icon: "⚒" }, { id: "test", name: "Test", icon: "⚗" },
  { id: "review", name: "Review", icon: "◎" }, { id: "ship", name: "Ship", icon: "⇪" },
];
const lerp = (a, b, t) => a + (b - a) * t;

export function stageOf(p) {
  if (p.status === "done") return 5;
  const ck = p.checklist || {}, pct = p.completion_percent || 0;
  if (p.status === "planned" && pct < 5) return 0;
  if (ck.browser_verified || pct >= 95) return 4;
  if (ck.tests_run || pct >= 78) return 3;
  if (ck.ui_ready || ck.server_actions_ready || ck.schema_ready || pct >= 45) return 2;
  if (ck.designed_contract || ck.read_plan || pct >= 10) return 1;
  return 0;
}

let S = null;
export async function factoryView(ctx) {
  if (S) { S.update(ctx); return S.wrap; }
  S = await build(); S.update(ctx); return S.wrap;
}

async function build() {
  const wrap = document.createElement("div");
  wrap.className = "pixi-stage";
  const app = new Application();
  await app.init({ background: C.cream100, antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true, width: 980, height: 460 });
  app.canvas.style.width = "100%"; app.canvas.style.height = "auto"; app.canvas.style.display = "block";
  wrap.appendChild(app.canvas);

  const bg = new Graphics(); app.stage.addChild(bg);
  const beltG = new Graphics(); app.stage.addChild(beltG);
  const tread = new Graphics(); app.stage.addChild(tread);
  const stationsC = new Container(); app.stage.addChild(stationsC);
  const cratesC = new Container(); app.stage.addChild(cratesC);
  const fxC = new Container(); app.stage.addChild(fxC);
  const truck = new Container(); app.stage.addChild(truck);

  let cssW = 980, cssH = 460, beltY = 300;
  const stationX = (i) => cssW * (0.085 + i * 0.158);
  const gantries = [];
  const crates = new Map();   // packetId -> cobj

  function layout() {
    const w = Math.max(360, wrap.clientWidth || 980);
    cssW = w; cssH = Math.round(Math.min(520, Math.max(360, w * 0.46)));
    app.renderer.resize(cssW, cssH);
    beltY = cssH * 0.66;
    drawBg(); drawBelt(); buildGantries(); drawTruck();
  }
  function drawBg() {
    bg.clear();
    bg.rect(0, 0, cssW, cssH).fill(C.cream100);
    bg.rect(0, 0, cssW, beltY - 40).fill({ color: C.mint, alpha: 0.25 });          // back wall
    bg.rect(0, beltY + 26, cssW, cssH - beltY - 26).fill({ color: 0xe3d8bb, alpha: 0.7 }); // floor
    // floor seams
    for (let x = 0; x < cssW; x += 60) bg.moveTo(x, beltY + 26).lineTo(x - 30, cssH).stroke({ width: 1, color: C.g700, alpha: 0.06 });
  }
  function drawBelt() {
    beltG.clear();
    beltG.roundRect(20, beltY, cssW - 40, 26, 6).fill(C.g800);
    beltG.roundRect(20, beltY, cssW - 40, 8, 4).fill({ color: 0x24332a, alpha: 0.6 });
    // rollers
    for (let i = 0; i <= 6; i++) beltG.circle(stationX(i), beltY + 13, 6).fill(C.g700).stroke({ width: 1, color: C.tan, alpha: 0.4 });
  }
  function buildGantries() {
    stationsC.removeChildren(); gantries.length = 0;
    STATIONS.forEach((st, i) => {
      const x = stationX(i), g = new Container(); g.x = x; g.y = beltY;
      const frame = new Graphics();
      // gantry legs + beam
      frame.rect(-30, -70, 4, 70).fill(C.g700); frame.rect(26, -70, 4, 70).fill(C.g700);
      frame.rect(-32, -74, 64, 8).fill(C.g800);
      // machine head
      frame.roundRect(-26, -64, 52, 26, 5).fill(i === 5 ? C.turf : C.g700);
      frame.roundRect(-26, -64, 52, 7, 3).fill({ color: C.cream50, alpha: 0.15 });
      g.addChild(frame);
      const gear = new Graphics(); gear.y = -51; gear.x = 16; drawGear(gear, 7, C.gold); g.addChild(gear);
      const gear2 = new Graphics(); gear2.y = -51; gear2.x = -16; drawGear(gear2, 5, C.tan); g.addChild(gear2);
      const title = new Text({ text: `${st.icon} ${st.name}`, style: { fontFamily: "system-ui,sans-serif", fontSize: 12, fontWeight: "800", fill: C.cream50 } });
      title.anchor.set(0.5); title.y = -51; g.addChild(title);
      const cnt = new Text({ text: "", style: { fontFamily: "ui-monospace,monospace", fontSize: 10, fill: C.inkMut } });
      cnt.anchor.set(0.5, 0); cnt.y = 30; g.addChild(cnt);
      // robotic arm at Test (i===3)
      let arm = null;
      if (i === 3) { arm = new Container(); arm.y = -38; drawArm(arm); g.addChild(arm); }
      stationsC.addChild(g);
      gantries.push({ g, gear, gear2, arm, cnt, x });
    });
  }
  function drawGear(g, r, col) { g.clear(); g.circle(0, 0, r).fill(col); g.circle(0, 0, r * 0.4).fill(C.g950); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.rect(-1, -r - 2, 2, 3).fill(col); g.rotation; } }
  function drawArm(c) {
    const base = new Graphics(); base.rect(-4, 0, 8, 10).fill(C.g800); c.addChild(base);
    const a1 = new Container(); const s1 = new Graphics(); s1.roundRect(-2, -22, 4, 22, 2).fill(C.g700); a1.addChild(s1);
    const a2 = new Container(); a2.y = -22; const s2 = new Graphics(); s2.roundRect(-2, -16, 4, 16, 2).fill(C.g600); a2.addChild(s2);
    const claw = new Graphics(); claw.y = -16; claw.poly([-3, 0, 3, 0, 1, 6, -1, 6]).fill(C.gold); a2.addChild(claw);
    a1.addChild(a2); c.addChild(a1); c.a1 = a1; c.a2 = a2;
  }
  function drawTruck() {
    truck.removeChildren(); truck.x = cssW - 36; truck.y = beltY + 8;
    const t = new Graphics();
    t.ellipse(0, 18, 30, 4).fill({ color: 0x123522, alpha: 0.15 });
    t.roundRect(-34, -26, 30, 30, 3).fill(C.g700);            // cargo
    t.roundRect(-34, -26, 30, 8, 3).fill({ color: C.cream50, alpha: 0.15 });
    t.roundRect(-6, -16, 16, 20, 3).fill(C.g600);             // cab
    t.rect(-2, -13, 9, 8).fill({ color: C.mint, alpha: 0.7 }); // window
    t.circle(-24, 6, 6).fill(C.g950); t.circle(2, 6, 6).fill(C.g950);
    t.circle(-24, 6, 2.5).fill(C.tan); t.circle(2, 6, 2.5).fill(C.tan);
    truck.addChild(t);
  }

  function makeCrate(p) {
    const g = new Container();
    const box = new Graphics(); g.addChild(box);
    const label = new Text({ text: "", style: { fontFamily: "system-ui,sans-serif", fontSize: 9, fontWeight: "700", fill: C.ink } });
    label.anchor.set(0.5, 0.5); label.y = -10; g.addChild(label);
    cratesC.addChild(g);
    return { g, box, label, tx: stationX(0), ty: beltY - 14, state: "", drawn: "" };
  }
  function paintCrate(c, state) {
    const g = c.box; g.clear();
    let main = C.gold, edge = C.clay;
    if (state === "done") { main = C.turf; edge = C.g700; }
    else if (state === "blocked") { main = C.clay; edge = 0x7d3b22; }
    else if (state === "planned") { main = C.tan; edge = 0xb7a87f; }
    // small iso-ish crate
    g.roundRect(-13, -20, 26, 20, 3).fill(main).stroke({ width: 1.5, color: edge });
    g.moveTo(-13, -13).lineTo(13, -13).stroke({ width: 1, color: edge, alpha: 0.6 });
    g.rect(-13, -20, 26, 4).fill({ color: C.cream50, alpha: 0.25 });
  }

  function update(ctx) {
    const packets = (ctx.state?.packets) || [];
    const byStage = [[], [], [], [], [], []];
    packets.forEach((p) => { const st = p.status === "blocked" ? stageOf(p) : stageOf(p); byStage[st].push(p); });
    // counts on gantries
    gantries.forEach((gn, i) => { if (gn.cnt) gn.cnt.text = `${byStage[i].length}`; });
    // place crates (show up to 5 per station, queued back along the belt)
    packets.forEach((p) => { if (!crates.get(p.id)) crates.set(p.id, makeCrate(p)); });
    byStage.forEach((list, sIdx) => {
      const baseX = stationX(sIdx);
      list.slice(0, 5).forEach((p, qi) => {
        const c = crates.get(p.id);
        c.tx = baseX - qi * 20; c.ty = beltY - 14 - (qi % 2) * 2;
        c.state = p.status === "blocked" ? "blocked" : p.status === "done" ? "done" : p.status === "active" ? "active" : "planned";
        const short = p.short || (p.title || p.id).replace(/^Task 0[AB]? . /, "").replace(/ and .*/i, "").slice(0, 11);
        c.label.text = short;
        c.visible = true; c.g.visible = true; c.hidden = false;
      });
      list.slice(5).forEach((p) => { const c = crates.get(p.id); c.g.visible = false; c.hidden = true; });
    });
    // remove crates for packets no longer present
    for (const [id, c] of crates) if (!packets.find((p) => p.id === id)) { c.g.destroy(); crates.delete(id); }
  }

  let t = 0;
  app.ticker.add((tk) => {
    const dt = tk.deltaTime, dms = tk.deltaMS / 1000; t += dms;
    // belt tread
    tread.clear();
    const off = (t * 40) % 24;
    for (let x = 24 - off; x < cssW - 24; x += 24) tread.poly([x, beltY + 4, x + 8, beltY + 4, x + 2, beltY + 22, x - 6, beltY + 22]).fill({ color: 0x2c3a30, alpha: 0.5 });
    // gears + arm
    gantries.forEach((gn) => {
      gn.gear.rotation += dt * 0.04; gn.gear2.rotation -= dt * 0.05;
      if (gn.arm) { gn.arm.a1.rotation = Math.sin(t * 1.4) * 0.4; gn.arm.a2.rotation = Math.cos(t * 1.4) * 0.5; }
    });
    // crates ride to target + bob; effects
    fxC.removeChildren();
    for (const c of crates.values()) {
      if (c.hidden) continue;
      c.g.x = lerp(c.g.x, c.tx, Math.min(1, dt * 0.06));
      c.g.y = lerp(c.g.y, c.ty + Math.sin(t * 3 + c.tx) * 1.2, Math.min(1, dt * 0.2));
      if (c.state !== c.drawn) { paintCrate(c, c.state); c.drawn = c.state; }
      // sparks for active crates near build/test
      if (c.state === "active") sparks(c.g.x, c.g.y - 18);
      if (c.state === "blocked") smoke(c.g.x, c.g.y - 20);
    }
    function sparks(x, y) { for (let k = 0; k < 3; k++) { const ph = (t * 3 + k) % 1, s = new Graphics(); s.circle(x + Math.cos(k * 2 + t * 6) * ph * 8, y - ph * 10, 1.4).fill({ color: C.gold, alpha: 1 - ph }); fxC.addChild(s); } }
    function smoke(x, y) { for (let k = 0; k < 3; k++) { const ph = (t * 0.6 + k * 0.5) % 1, s = new Graphics(); s.circle(x + (k - 1) * 3, y - ph * 22, 3 + ph * 4).fill({ color: 0x8a6a52, alpha: (1 - ph) * 0.45 }); fxC.addChild(s); } }
  });

  const ro = new ResizeObserver(() => layout()); ro.observe(wrap);
  requestAnimationFrame(() => layout());
  return { app, wrap, update, crates };
}
