/* city-crew.js — the rigged construction-worker character for Agent City.
   Imported ONLY by city-engine.js. Pure Pixi (Container/Graphics/Text via the
   vendored pixi.mjs) + a tiny skeleton animator; no DOM, no network.

   A worker is a little construction character: ground contact shadow, two
   striding legs, a role-colored hi-vis vest torso with a contrasting safety
   stripe + shoulder rim light, TWO arms (front arm works the tool), a head with
   a role-tinted hard hat (dome + brim + numbered band), and a counter-scaled
   floating name tag. The STATIC silhouette is built once; only the moving limbs
   are redrawn each frame so it stays cheap (a handful of Graphics per worker).

   Animation is keyed to the worker's real state (set by the engine each update):
     walking  — alternating stride + opposite-arm swing + bob, faces heading
     hammer   — front arm raises + strikes on a beat (engine emits sparks)
     carry    — both arms forward holding a plank, slower gait
     inspect  — stands, looks up, occasional point (tall/active sites)
     blocked  — idle-frustrated: hands on hips / scratch head near the smoke
     done     — celebrate: arms up + little jump for a beat
     idle     — subtle sway + occasional brow-wipe, slightly faded

   INTENSITY (0..1, from queue_depth + files_touched + heartbeat freshness)
   scales stride speed + strike rate so a hard-working crew visibly moves faster.
   Cream/green palette only — NO BLACK. */

// palette echo (kept local so the rig has no engine import cycle)
const K = {
  cream0: 0xfffdf6, cream100: 0xf4ecd8, cream200: 0xe7dcc2, tan: 0xd6c393,
  ink: 0x122018, g950: 0x18261d, g900: 0x123522, g800: 0x17432d, g700: 0x1f5b3d,
  g600: 0x2c7650, turf: 0x3c9361, gold: 0xc8a24a, amber: 0xb88916, clay: 0xb86a3d,
  wood: 0x8a6a44, woodDk: 0x6b4a2e, skin: 0xf0d9c0, steel: 0x9fb0a6, glassW: 0xfdf6e0,
};

// shade a hex color toward black/white by factor f (>0 lighten, <0 darken)
function shade(hex, f) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const m = (c) => f >= 0 ? Math.round(c + (255 - c) * f) : Math.round(c * (1 + f));
  return (Math.max(0, Math.min(255, m(r))) << 16) | (Math.max(0, Math.min(255, m(g))) << 8) | Math.max(0, Math.min(255, m(b)));
}

/* Build a worker character. `deps` carries:
   { Container, Graphics, Text, role:hexColor, hatNo, name, role_label,
     onTap:fn, onOver:fn, onOut:fn, lblFont:number }
   Returns a rig object the engine stores + drives. */
export function makeWorkerRig(deps) {
  const { Container, Graphics, Text, role, hatNo, name, role_label, onTap, onOver, onOut, lblFont } = deps;
  const col = role;
  const vestDk = shade(col, -0.32), vestLt = shade(col, 0.28);

  const g = new Container();
  const shadow = new Graphics();
  const legL = new Graphics(), legR = new Graphics();
  const armBack = new Graphics();
  const torso = new Graphics();
  const armFront = new Graphics();
  const head = new Graphics();
  const fxTool = new Graphics();   // tool/cargo that changes with state
  const tag = new Container();

  // ---- static torso: a shaded hi-vis vest with a contrasting stripe + rim
  torso.roundRect(-3.0, -10.4, 6.0, 8.4, 2.0).fill(col);                       // vest body
  torso.poly([0, -10.4, 3, -10.4, 3, -2, 0, -2]).fill({ color: vestDk, alpha: 0.55 }); // shaded right half
  torso.rect(-3.0, -7.6, 6.0, 1.7).fill({ color: K.cream0, alpha: 0.95 });     // safety stripe
  torso.rect(-3.0, -4.4, 6.0, 1.1).fill({ color: K.cream0, alpha: 0.55 });     // lower stripe
  torso.rect(-3.0, -10.4, 6.0, 1.3).fill({ color: vestLt, alpha: 0.7 });       // shoulder rim light
  torso.circle(-1.0, -6.6, 0.55).fill({ color: K.cream0, alpha: 0.8 });        // hi-vis button
  torso.circle(1.0, -6.6, 0.55).fill({ color: K.cream0, alpha: 0.8 });

  // ---- static head + hard hat (dome + brim + numbered role band)
  head.circle(0, -13.2, 2.7).fill(K.skin).stroke({ width: 0.8, color: shade(K.skin, -0.3), alpha: 0.5 });
  head.poly([-3.4, -14.4, 3.4, -14.4, 1.9, -16.6, -1.9, -16.6]).fill(K.gold);   // dome
  head.poly([0, -16.6, 1.9, -16.6, 1.0, -14.4, 0, -14.4]).fill({ color: shade(K.gold, -0.18) }); // dome shade
  head.rect(-3.8, -14.4, 7.6, 1.1).fill(K.amber);                              // brim
  head.rect(-3.4, -15.2, 6.8, 1.0).fill({ color: col, alpha: 0.92 });          // role-colored band

  // ---- contact shadow (soft ellipse pooled on the ground)
  shadow.ellipse(0, 1.4, 5.4, 1.9).fill({ color: K.g900, alpha: 0.22 });

  // ---- floating name tag (counter-scaled by the engine each frame)
  const nameT = new Text({ text: `#${hatNo} ${name}`, style: { fontFamily: "system-ui, sans-serif", fontSize: lblFont || 11, fontWeight: "700", fill: K.cream0 } });
  nameT.anchor.set(0.5, 0.5);
  const roleT = new Text({ text: role_label ? String(role_label).toUpperCase() : "", style: { fontFamily: "ui-monospace, monospace", fontSize: (lblFont || 11) - 2.5, fontWeight: "700", fill: K.cream0 } });
  roleT.anchor.set(0.5, 0.5); roleT.alpha = 0.78; roleT.y = 8.5;
  const tw = Math.max(nameT.width, roleT.width) + 14;
  const th = role_label ? 25 : 15;
  const tagBg = new Graphics();
  tagBg.roundRect(-tw / 2, -8, tw, th, 6).fill({ color: K.g800, alpha: 0.97 }).stroke({ width: 1, color: col, alpha: 0.55 });
  tagBg.poly([-3, th - 8, 3, th - 8, 0, th - 4]).fill({ color: K.g800, alpha: 0.97 }); // little pointer
  tag.y = -20;
  tag.addChild(tagBg); tag.addChild(nameT); if (role_label) tag.addChild(roleT);
  tag.visible = false;

  g.addChild(shadow);
  g.addChild(legL); g.addChild(legR);
  g.addChild(armBack); g.addChild(torso); g.addChild(armFront); g.addChild(fxTool); g.addChild(head);
  g.addChild(tag);

  g.eventMode = "static"; g.cursor = "pointer";
  if (onOver) g.on("pointerover", () => { tag.visible = true; onOver(); });
  if (onOut) g.on("pointerout", () => { tag.visible = false; onOut(); });
  else { g.on("pointerover", () => { tag.visible = true; }); g.on("pointerout", () => { tag.visible = false; }); }
  if (onTap) g.on("pointertap", onTap);

  return {
    g, col, vestDk, vestLt, shadow, legL, legR, torso, armBack, armFront, head, fxTool, tag,
    // animation state (engine sets these every update)
    mode: "idle", facing: 1, intensity: 0.5, alive: true, strikeT: -1, _jump: 0,
  };
}

/* Drive the rig's limbs for one frame.
   t = seconds; rig.mode in {walk,hammer,carry,inspect,blocked,done,idle};
   rig.facing in {-1,1} flips the character; rig.intensity scales speed.
   Returns a small signal object the engine uses for FX (e.g. {strike:true} on a
   hammer beat so the engine can emit a spark exactly on impact). */
export function animateRig(rig, t, dt) {
  const col = rig.col, mode = rig.mode, inten = rig.intensity;
  const spd = 5 + inten * 6;            // stride / work tempo
  const sig = { strike: false, footY: 0 };
  rig.g.scale.x = rig.facing < 0 ? -1 : 1; // flip to face heading; tag stays readable via counter-scale

  // reset transient transforms
  rig.armFront.rotation = 0; rig.armBack.rotation = 0; rig.fxTool.clear(); rig.fxTool.rotation = 0;
  rig.legL.clear(); rig.legR.clear(); rig.armBack.clear(); rig.armFront.clear();
  let bodyY = 0, headTilt = 0;

  if (mode === "walk" || mode === "carry") {
    const carry = mode === "carry";
    const ph = t * (carry ? spd * 0.78 : spd) + rig.phase;
    const sw = Math.sin(ph) * (carry ? 1.8 : 2.6);
    // legs stride (front leg forward, back leg back)
    rig.legL.rect(-2.4, -2, 1.9, 4.4).fill(col); rig.legL.x = -sw * 0.5; rig.legL.rotation = -sw * 0.05;
    rig.legR.rect(0.5, -2, 1.9, 4.4).fill(shade(col, -0.18)); rig.legR.x = sw * 0.5; rig.legR.rotation = sw * 0.05;
    bodyY = -Math.abs(Math.sin(ph)) * (carry ? 1.0 : 1.5);  // bob
    if (carry) {
      // both arms forward holding a plank/crate
      rig.armBack.rect(-4.0, -9.2, 1.5, 5).fill(col); rig.armBack.rotation = 0.5;
      rig.armFront.rect(2.5, -9.2, 1.5, 5).fill(shade(col, 0.12)); rig.armFront.rotation = -0.5;
      rig.fxTool.roundRect(-1, -10.2, 8.5, 2.4, 0.6).fill(K.wood).stroke({ width: 0.5, color: K.woodDk, alpha: 0.5 });
      rig.fxTool.rect(-1, -10.2, 8.5, 0.8).fill({ color: shade(K.wood, 0.25), alpha: 0.6 });
    } else {
      // opposite-arm swing
      rig.armBack.rect(-4.0, -9.2, 1.5, 5).fill(col); rig.armBack.rotation = sw * 0.06;
      rig.armFront.rect(2.5, -9.2, 1.5, 5).fill(shade(col, 0.12)); rig.armFront.rotation = -sw * 0.06;
    }
  } else if (mode === "hammer") {
    // standing, front arm rocks up and strikes down on a beat
    standLegs(rig, col);
    const beat = t * (spd * 0.9) + rig.phase;
    const cycle = (Math.sin(beat));               // -1..1
    const raise = cycle * 0.9 - 0.35;             // arm angle
    rig.armBack.rect(-4.0, -9.2, 1.5, 5).fill(col); rig.armBack.rotation = 0.15;
    rig.armFront.x = 0; rig.armFront.y = 0;
    rig.armFront.rect(2.4, -9.2, 1.5, 5.4).fill(shade(col, 0.12));
    rig.armFront.rotation = raise;
    // hammer at the wrist
    const hx = 3.0, hy = -9.0 + 5.4;
    rig.fxTool.rotation = raise;
    rig.fxTool.rect(hx - 0.5, -3.6, 1.1, 4.4).fill(K.woodDk);                 // handle
    rig.fxTool.roundRect(hx - 2.0, -4.6, 4.0, 1.8, 0.4).fill(K.steel).stroke({ width: 0.5, color: K.g800, alpha: 0.5 }); // head
    rig.fxTool.x = 0; rig.fxTool.y = -9.0;
    // detect the downstroke impact (cycle passes through its min) → emit a strike
    const prev = rig._lastCycle == null ? cycle : rig._lastCycle;
    if (prev > -0.85 && cycle <= -0.85) sig.strike = true;
    rig._lastCycle = cycle;
    bodyY = (raise + 0.35) * -0.6;                // lean into the swing
  } else if (mode === "inspect") {
    standLegs(rig, col);
    headTilt = -0.18;                              // look up
    const pt = Math.sin(t * 1.3 + rig.phase);
    rig.armBack.rect(-4.0, -9.2, 1.5, 5).fill(col); rig.armBack.rotation = 0.1;
    rig.armFront.rect(2.5, -9.6, 1.5, 5).fill(shade(col, 0.12));
    rig.armFront.rotation = pt > 0.4 ? -1.0 - pt * 0.3 : -0.2;  // occasional point up
    bodyY = -Math.sin(t * 0.9 + rig.phase) * 0.3;
  } else if (mode === "blocked") {
    standLegs(rig, col);
    const scratch = Math.sin(t * 1.1 + rig.phase);
    if (scratch > 0.3) {
      // scratch head
      rig.armFront.rect(2.0, -10.5, 1.5, 5).fill(shade(col, 0.12)); rig.armFront.rotation = -1.5;
      rig.armBack.rect(-4.0, -9.2, 1.5, 5).fill(col); rig.armBack.rotation = -0.9; // hand on hip
    } else {
      // both hands on hips
      rig.armFront.rect(2.6, -8.6, 1.5, 4.4).fill(shade(col, 0.12)); rig.armFront.rotation = -0.9;
      rig.armBack.rect(-4.1, -8.6, 1.5, 4.4).fill(col); rig.armBack.rotation = 0.9;
    }
    headTilt = Math.sin(t * 0.7 + rig.phase) * 0.12;
    bodyY = -Math.sin(t * 0.8 + rig.phase) * 0.25;
  } else if (mode === "done") {
    // celebrate: arms up + little jump
    rig._jump = Math.min(1, (rig._jump || 0) + dt * 0.12);
    const hop = Math.abs(Math.sin(t * 7 + rig.phase));
    standLegs(rig, col, -hop * 1.4);
    rig.armBack.rect(-4.2, -10.4, 1.5, 5).fill(col); rig.armBack.rotation = 2.4;
    rig.armFront.rect(2.7, -10.4, 1.5, 5).fill(shade(col, 0.12)); rig.armFront.rotation = -2.4;
    bodyY = -hop * 2.6;
    headTilt = -0.1;
  } else { // idle
    standLegs(rig, col);
    const sway = Math.sin(t * 1.0 + rig.phase);
    rig.armBack.rect(-3.8, -9.2, 1.5, 5).fill(col); rig.armBack.rotation = sway * 0.08;
    // occasional brow-wipe
    const wipe = Math.sin(t * 0.5 + rig.phase * 1.7);
    if (wipe > 0.85) { rig.armFront.rect(2.2, -10.4, 1.5, 5).fill(shade(col, 0.12)); rig.armFront.rotation = -1.4; }
    else { rig.armFront.rect(2.5, -9.2, 1.5, 5).fill(shade(col, 0.12)); rig.armFront.rotation = -sway * 0.06; }
    bodyY = -Math.abs(sway) * 0.35;
  }

  // apply body bob + head tilt
  rig.torso.y = bodyY; rig.armBack.y = bodyY; rig.armFront.y = bodyY; rig.fxTool.y += bodyY;
  rig.head.y = bodyY; rig.head.rotation = headTilt;
  sig.footY = bodyY;
  return sig;
}

function standLegs(rig, col, lift) {
  const ly = lift || 0;
  rig.legL.rect(-2.4, -2 + ly, 1.9, 4.4).fill(col); rig.legL.x = -0.6; rig.legL.rotation = 0;
  rig.legR.rect(0.5, -2 + ly, 1.9, 4.4).fill(shade(col, -0.18)); rig.legR.x = 0.6; rig.legR.rotation = 0;
}

export { shade as shadeColor };
