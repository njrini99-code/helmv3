/* Agent City — a real PixiJS isometric build city. Buildings are work packets
   that RISE as completion grows; agent workers walk to the building they're
   constructing; cranes on active sites, flags on shipped, smoke on blocked.
   The Pixi scene lives in city-engine.js (persistent singleton). This mode
   builds its DOM ONCE and updates the scene + side panels IN PLACE so live data
   ticks never remount the canvas (no flicker). */
import { archetypeFor } from "../city-districts.js";

export const meta = { label: "Agent City", district: "all" };

let MODE = null; // cached mount: { node, fill }

// ----------------------------------------------------------------------------
// LIVE AGENT VIEW drawer — a right-side slide-in window into the crew working a
// building. Opened by the `cc:building-selected` seam, fed ONLY by live ctx
// telemetry (packets / agents / events). Re-reads ctx every render so the feed
// ticks live and stays pinned to the newest line. Honest empty states only.
// ----------------------------------------------------------------------------
let DRAWER = null;          // singleton overlay { backdrop, panel } in document.body
let DRAWER_PACKET = null;   // id of the packet currently shown (null = closed)
let DRAWER_CTX = null;      // latest ctx for live re-render
let DRAWER_ESC = null;      // bound ESC handler (for cleanup)

const STAGE_GLYPHS = {
  // small honest glyphs for the 12-step checklist (keys are matched leniently)
  scope: "◇", plan: "✎", schema: "▤", migration: "⇡", backend: "⚙",
  action: "⚡", ui: "▦", wire: "🔗", test: "✔", a11y: "♿", review: "👁", ship: "⚑",
};
const SEV_TONE = { ok: "ok", info: "info", warn: "warn", risk: "risk", critical: "risk", error: "risk" };

function ensureDrawerStyles(h) {
  if (document.getElementById("st-agent-city")) return;
  const css = `
.cc-lav-backdrop{position:fixed;inset:0;z-index:90;background:rgba(14,42,29,0.28);
  opacity:0;transition:opacity .22s ease;backdrop-filter:saturate(1.05) blur(1.5px);}
.cc-lav-backdrop.in{opacity:1;}
.cc-lav{position:fixed;top:0;right:0;height:100%;width:418px;max-width:92vw;z-index:91;
  display:flex;flex-direction:column;background:linear-gradient(180deg,#fffdf6 0%,#fcf8ec 100%);
  border-left:1px solid rgba(31,91,61,0.22);box-shadow:-18px 0 48px rgba(14,42,29,0.20);
  transform:translateX(102%);transition:transform .26s cubic-bezier(.22,.61,.36,1);
  font-family:system-ui,-apple-system,sans-serif;color:#122018;}
.cc-lav.in{transform:translateX(0);}
.cc-lav-hd{padding:16px 18px 14px;border-bottom:1px solid rgba(31,91,61,0.14);
  background:linear-gradient(180deg,rgba(220,239,227,0.55),rgba(252,248,236,0));}
.cc-lav-hd-top{display:flex;align-items:center;gap:8px;}
.cc-lav-dist{display:inline-flex;align-items:center;gap:5px;font:700 10.5px ui-monospace,monospace;
  color:#1f5b3d;text-transform:uppercase;letter-spacing:.06em;}
.cc-lav-title{font:800 17px system-ui,sans-serif;color:#0e2a1d;margin:6px 0 2px;line-height:1.2;}
.cc-lav-x{margin-left:auto;width:30px;height:30px;border-radius:9px;border:1px solid rgba(31,91,61,0.24);
  background:rgba(255,253,246,0.9);color:#1f5b3d;font:800 16px ui-monospace,monospace;cursor:pointer;
  display:flex;align-items:center;justify-content:center;line-height:1;transition:background .12s ease;}
.cc-lav-x:hover{background:rgba(220,239,227,0.95);}
.cc-lav-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
.cc-lav-chip{font:700 11px system-ui,sans-serif;padding:3px 9px;border-radius:999px;
  background:rgba(255,255,255,0.7);border:1px solid rgba(31,91,61,0.18);color:#1f5b3d;}
.cc-lav-chip b{color:#0e2a1d;}
.cc-lav-chip.ok{background:rgba(60,147,97,0.14);border-color:rgba(44,118,80,0.35);color:#1f5b3d;}
.cc-lav-chip.warn{background:rgba(184,137,22,0.14);border-color:rgba(184,137,22,0.4);color:#8a6510;}
.cc-lav-chip.risk{background:rgba(184,106,61,0.16);border-color:rgba(184,106,61,0.4);color:#8f4a26;}
.cc-lav-chip.idle{background:rgba(107,122,111,0.12);border-color:rgba(107,122,111,0.3);color:#5b6a60;}
.cc-lav-body{flex:1;min-height:0;overflow-y:auto;padding:14px 16px 22px;display:flex;flex-direction:column;gap:16px;}
.cc-lav-sec{display:flex;flex-direction:column;gap:8px;}
.cc-lav-sec-h{display:flex;align-items:center;gap:7px;font:800 11px system-ui,sans-serif;
  text-transform:uppercase;letter-spacing:.07em;color:#3f5247;}
.cc-lav-sec-h .g{font-size:13px;}
.cc-lav-sec-h .ct{margin-left:auto;font:700 10.5px ui-monospace,monospace;color:#6b7a6f;text-transform:none;letter-spacing:0;}
.cc-lav-crew{display:flex;flex-direction:column;gap:2px;}
.cc-lav-worker{display:flex;align-items:flex-start;gap:10px;padding:8px 9px;border-radius:11px;
  background:rgba(255,255,255,0.55);border:1px solid rgba(31,91,61,0.1);}
.cc-lav-av{width:11px;height:11px;border-radius:50%;margin-top:3px;flex:0 0 auto;
  box-shadow:0 0 0 3px rgba(255,255,255,0.65);}
.cc-lav-av.on{animation:ccLavPulse 1.8s ease-in-out infinite;}
@keyframes ccLavPulse{0%,100%{box-shadow:0 0 0 3px rgba(255,255,255,0.65);}50%{box-shadow:0 0 0 5px rgba(60,147,97,0.22);}}
.cc-lav-wmeta{min-width:0;flex:1;}
.cc-lav-wname{font:700 12.5px system-ui,sans-serif;color:#0e2a1d;}
.cc-lav-wrole{font:600 10.5px system-ui,sans-serif;color:#6b7a6f;text-transform:uppercase;letter-spacing:.04em;}
.cc-lav-wact{font:600 11.5px system-ui,sans-serif;color:#1f5b3d;margin-top:3px;line-height:1.35;}
.cc-lav-wact.blocked{color:#8f4a26;}
.cc-lav-wact .mono{font-family:ui-monospace,monospace;color:#0e2a1d;}
.cc-lav-feed{display:flex;flex-direction:column;gap:5px;max-height:260px;overflow-y:auto;
  padding:9px 10px;border-radius:12px;background:rgba(18,32,24,0.04);
  border:1px solid rgba(31,91,61,0.12);}
.cc-lav-line{display:grid;grid-template-columns:46px 1fr;gap:8px;align-items:baseline;
  font:600 11px system-ui,sans-serif;padding-bottom:4px;border-bottom:1px dashed rgba(31,91,61,0.08);}
.cc-lav-line:last-child{border-bottom:0;padding-bottom:0;}
.cc-lav-ts{font:700 9.5px ui-monospace,monospace;color:#8a988e;white-space:nowrap;}
.cc-lav-line .who{font-weight:800;color:#1f5b3d;}
.cc-lav-line .ti{color:#0e2a1d;}
.cc-lav-line .de{color:#6b7a6f;display:block;margin-top:1px;}
.cc-lav-line.sev-ok .who{color:#2c7650;}
.cc-lav-line.sev-warn .who{color:#8a6510;}
.cc-lav-line.sev-risk .who{color:#8f4a26;}
.cc-lav-bullet{display:inline-block;width:6px;height:6px;border-radius:50%;background:#6b7a6f;margin-right:5px;vertical-align:middle;}
.cc-lav-bullet.ok{background:#2c7650;}.cc-lav-bullet.warn{background:#b88916;}.cc-lav-bullet.risk{background:#b86a3d;}.cc-lav-bullet.info{background:#3f7775;}
.cc-lav-checks{display:flex;flex-wrap:wrap;gap:5px;}
.cc-lav-tick{display:inline-flex;align-items:center;gap:4px;font:700 10px system-ui,sans-serif;
  padding:3px 7px;border-radius:8px;border:1px solid rgba(31,91,61,0.14);
  background:rgba(255,255,255,0.6);color:#6b7a6f;}
.cc-lav-tick.done{background:rgba(60,147,97,0.16);border-color:rgba(44,118,80,0.34);color:#1f5b3d;}
.cc-lav-tick .tg{font-size:10px;}
.cc-lav-prog{height:8px;border-radius:999px;background:rgba(31,91,61,0.12);overflow:hidden;}
.cc-lav-prog > i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#3c9361,#1f5b3d);transition:width .4s ease;}
.cc-lav-files{display:flex;flex-direction:column;gap:3px;}
.cc-lav-file{font:600 11px ui-monospace,monospace;color:#3f5247;display:flex;align-items:center;gap:6px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cc-lav-empty{font:600 11.5px system-ui,sans-serif;color:#8a988e;padding:10px 4px;text-align:center;}
.cc-lav-block{font:700 11.5px system-ui,sans-serif;color:#8f4a26;padding:8px 10px;border-radius:10px;
  background:rgba(184,106,61,0.1);border:1px solid rgba(184,106,61,0.28);}
@media (max-width:820px){
  .cc-lav{width:100%;max-width:100%;border-left:0;transform:translateY(102%);
    box-shadow:0 -18px 48px rgba(14,42,29,0.24);border-top:1px solid rgba(31,91,61,0.22);
    border-radius:18px 18px 0 0;top:auto;bottom:0;height:88%;}
  .cc-lav.in{transform:translateY(0);}
}`;
  document.head.append(h("style", { id: "st-agent-city" }, css));
}

function roleColor(idx) {
  const ROLE = ["#3c9361", "#3f7775", "#c8a24a", "#b86a3d", "#b88916", "#2c7650", "#7aa37f", "#c98f5a", "#5a9d8f", "#1f5b3d", "#9c7bb0", "#b0894a", "#6f9ec9"];
  return ROLE[((idx % ROLE.length) + ROLE.length) % ROLE.length];
}
function baseName(p) {
  if (!p) return "";
  const parts = String(p).split(/[\\/]/);
  return parts[parts.length - 1] || String(p);
}
// latest event for a given agent (and, if known, this packet) — pure read of ctx.events
function latestAgentEvent(events, agentId, packetId) {
  let hit = null;
  for (const e of events) {
    if (e.agent !== agentId) continue;
    if (packetId && e.packet && e.packet !== packetId) continue;
    hit = e; // events are chronological asc → last match wins
  }
  return hit;
}

function closeDrawer() {
  DRAWER_PACKET = null;
  if (DRAWER) {
    DRAWER.backdrop.classList.remove("in");
    DRAWER.panel.classList.remove("in");
    const node = DRAWER.root;
    setTimeout(() => { if (node && node.parentNode && !DRAWER_PACKET) node.remove(); }, 280);
  }
  if (DRAWER_ESC) { window.removeEventListener("keydown", DRAWER_ESC); DRAWER_ESC = null; }
}

function openDrawer(packetId) {
  const ctx = DRAWER_CTX;
  if (!ctx || !packetId) return;
  DRAWER_PACKET = packetId;
  ensureDrawerStyles(ctx.h);
  // (re)build overlay shell once, reuse on subsequent opens
  if (!DRAWER || !DRAWER.root.parentNode) {
    const { h } = ctx;
    const backdrop = h("div", { class: "cc-lav-backdrop", onClick: () => closeDrawer() });
    const panel = h("div", { class: "cc-lav", role: "dialog", "aria-label": "Live agent view" });
    const root = h("div", {}, backdrop, panel);
    document.body.append(root);
    DRAWER = { root, backdrop, panel };
  }
  if (!DRAWER_ESC) {
    DRAWER_ESC = (e) => { if (e.key === "Escape") closeDrawer(); };
    window.addEventListener("keydown", DRAWER_ESC);
  }
  renderDrawer();
  // next frame → slide in
  requestAnimationFrame(() => {
    if (!DRAWER || DRAWER_PACKET !== packetId) return;
    DRAWER.backdrop.classList.add("in");
    DRAWER.panel.classList.add("in");
  });
}

// Re-renders the drawer body from LIVE ctx. Called on open AND on every mode
// refresh while the drawer is open, so the transcript ticks and stays pinned.
function renderDrawer() {
  if (!DRAWER || !DRAWER_PACKET) return;
  const ctx = DRAWER_CTX;
  if (!ctx) return;
  const { h, fmt } = ctx;
  const s = ctx.state || {};
  const packets = s.packets || [];
  const agents = s.agents || [];
  const events = ctx.events || [];
  const p = packets.find((x) => x.id === DRAWER_PACKET);

  if (!p) {
    DRAWER.panel.replaceChildren(
      h("div", { class: "cc-lav-hd" },
        h("div", { class: "cc-lav-hd-top" },
          h("span", { class: "cc-lav-dist" }, "live agent view"),
          h("button", { class: "cc-lav-x", title: "Close", onClick: () => closeDrawer() }, "×"))),
      h("div", { class: "cc-lav-body" },
        h("div", { class: "cc-lav-empty" }, "This building is no longer in the live telemetry.")));
    return;
  }

  const arch = archetypeFor(p.district || "");
  const distGlyph = arch.glyph || "▦";
  const st = p.status || "planned";
  const stTone = st === "done" ? "ok" : st === "blocked" ? "risk" : st === "active" ? "warn" : "idle";
  const stTxt = st === "done" ? "shipped" : st === "active" ? "under construction" : st === "blocked" ? "blocked" : st;
  const owner = agents.find((a) => a.id === p.owner_lane);

  // ---- crew: owner-lane agents + same-district agents (de-duped, stable order)
  const crewSet = new Map();
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    const match = a.id === p.owner_lane || a.owner_lane === p.owner_lane ||
      (p.district && a.district && a.district === p.district);
    if (match) crewSet.set(a.id, { agent: a, idx: i, isOwner: a.id === p.owner_lane });
  }
  const crew = Array.from(crewSet.values()).sort((a, b) => (b.isOwner - a.isOwner) || (a.idx - b.idx));

  // ---- live feed: events stamped to this packet, else fall back to owner's events
  let feed = events.filter((e) => e.packet === DRAWER_PACKET);
  let feedNote = "events on this building";
  if (!feed.length && p.owner_lane) {
    feed = events.filter((e) => e.agent === p.owner_lane);
    feedNote = "events from this building's crew";
  }

  // ---- checklist (12-step)
  const checklist = p.checklist || {};
  const steps = Object.keys(checklist);
  const doneSteps = steps.filter((k) => checklist[k]).length;

  const header = h("div", { class: "cc-lav-hd" },
    h("div", { class: "cc-lav-hd-top" },
      h("span", { class: "cc-lav-dist" }, h("span", {}, distGlyph), h("span", {}, p.district || "Unzoned")),
      h("button", { class: "cc-lav-x", title: "Close", onClick: () => closeDrawer() }, "×")),
    h("div", { class: "cc-lav-title" }, p.short || p.title || p.id),
    h("div", { class: "cc-lav-badges" },
      h("span", { class: `cc-lav-chip ${stTone}` }, stTxt),
      h("span", { class: "cc-lav-chip" }, "build ", h("b", {}, fmt.pct(p.completion_percent || 0))),
      h("span", { class: "cc-lav-chip" }, "confidence ", h("b", {}, fmt.pct(p.confidence_percent || 0))),
      p.stage ? h("span", { class: "cc-lav-chip" }, "stage: ", h("b", {}, p.stage)) : null));

  // ---- THE CREW section
  const crewSec = h("div", { class: "cc-lav-sec" },
    h("div", { class: "cc-lav-sec-h" }, h("span", { class: "g" }, "👷"), h("span", {}, "The crew"),
      h("span", { class: "ct" }, crew.length ? `${crew.length} on this build` : "")),
    crew.length
      ? h("div", { class: "cc-lav-crew" }, crew.map(({ agent, idx }) => {
          const ev = latestAgentEvent(events, agent.id, p.id);
          const isActive = agent.status === "active";
          // derive LIVE ACTION honestly
          let actNode, actClass = "cc-lav-wact";
          if (agent.status === "blocked" || (p.status === "blocked" && agent.id === p.owner_lane)) {
            actClass += " blocked";
            const reason = p.blocked_reason || (ev && ev.severity === "risk" ? ev.detail : "") || "awaiting unblock";
            actNode = h("span", {}, "blocked: ", h("span", {}, reason));
          } else if (ev && ev.type === "file_changed") {
            const fileBase = baseName(ev.detail || ev.title || "");
            actNode = h("span", {}, "writing ", h("span", { class: "mono" }, fileBase || "—"));
          } else if (isActive && ev) {
            actNode = h("span", {}, ev.title || "working");
          } else if (isActive) {
            actNode = h("span", {}, "working");
          } else {
            actNode = h("span", {}, "idle");
          }
          return h("div", { class: "cc-lav-worker" },
            h("span", { class: `cc-lav-av${isActive ? " on" : ""}`, style: { background: roleColor(idx) } }),
            h("div", { class: "cc-lav-wmeta" },
              h("div", { class: "cc-lav-wname" }, agent.name || agent.id),
              h("div", { class: "cc-lav-wrole" }, agent.role || agent.district || "crew"),
              h("div", { class: actClass }, actNode)));
        }))
      : h("div", { class: "cc-lav-empty" }, "No crew assigned to this building yet."));

  // ---- LIVE FEED (transcript)
  const feedEl = feed.length
    ? h("div", { class: "cc-lav-feed" }, feed.map((e) => {
        const sev = SEV_TONE[e.severity] || "info";
        return h("div", { class: `cc-lav-line sev-${sev}` },
          h("span", { class: "cc-lav-ts" }, fmt.time(e.ts)),
          h("div", {},
            h("span", { class: "who" }, (e.agent || "system") + " "),
            h("span", { class: "ti" }, e.title || e.type || ""),
            e.detail ? h("span", { class: "de" }, e.detail) : null));
      }))
    : h("div", { class: "cc-lav-empty" }, "No activity yet on this building.");
  const feedSec = h("div", { class: "cc-lav-sec" },
    h("div", { class: "cc-lav-sec-h" }, h("span", { class: "g" }, "📡"), h("span", {}, "Live feed"),
      h("span", { class: "ct" }, feed.length ? `${feed.length} · ${feedNote}` : "")),
    feedEl);

  // ---- PACKET DEEP-DIVE
  const checks = steps.length
    ? h("div", { class: "cc-lav-checks" }, steps.map((k) => {
        const glyph = STAGE_GLYPHS[k] || (checklist[k] ? "✔" : "○");
        return h("span", { class: `cc-lav-tick${checklist[k] ? " done" : ""}`, title: k },
          h("span", { class: "tg" }, glyph), h("span", {}, k));
      }))
    : h("div", { class: "cc-lav-empty" }, "No checklist on this packet.");

  const fileList = (label, glyph, arr) => {
    const list = Array.isArray(arr) ? arr : [];
    if (!list.length) return null;
    return h("div", { class: "cc-lav-sec", style: { gap: "5px" } },
      h("div", { class: "cc-lav-sec-h" }, h("span", { class: "g" }, glyph), h("span", {}, label),
        h("span", { class: "ct" }, String(list.length))),
      h("div", { class: "cc-lav-files" }, list.slice(0, 24).map((f) =>
        h("div", { class: "cc-lav-file", title: String(f) }, h("span", { class: "cc-lav-bullet info" }), baseName(f)))));
  };

  const deepSec = h("div", { class: "cc-lav-sec" },
    h("div", { class: "cc-lav-sec-h" }, h("span", { class: "g" }, "🧱"), h("span", {}, "Packet deep-dive"),
      h("span", { class: "ct" }, steps.length ? `${doneSteps}/${steps.length} steps` : "")),
    steps.length ? h("div", { class: "cc-lav-prog" }, h("i", { style: { width: (steps.length ? Math.round((doneSteps / steps.length) * 100) : 0) + "%" } })) : null,
    checks,
    p.status === "blocked" && p.blocked_reason ? h("div", { class: "cc-lav-block" }, "⚑ ", p.blocked_reason) : null,
    fileList("Files touched", "📄", owner && owner.files_touched),
    fileList("Tables touched", "🗄", owner && owner.tables_touched),
    fileList("Routes touched", "🛣", owner && owner.routes_touched));

  DRAWER.panel.replaceChildren(header, h("div", { class: "cc-lav-body" }, crewSec, feedSec, deepSec));

  // pin transcript to newest
  const feedScroll = DRAWER.panel.querySelector(".cc-lav-feed");
  if (feedScroll) feedScroll.scrollTop = feedScroll.scrollHeight;
}

// Listener management — installed per mode-render, removed before re-install so
// repeated renders never stack leaked listeners.
let SEAM_HANDLER = null;
function wireSeam(ctx) {
  DRAWER_CTX = ctx;
  if (SEAM_HANDLER) window.removeEventListener("cc:building-selected", SEAM_HANDLER);
  SEAM_HANDLER = (e) => openDrawer(e && e.detail && e.detail.packetId);
  window.addEventListener("cc:building-selected", SEAM_HANDLER);
  // if a drawer is already open, refresh it live against the new ctx
  if (DRAWER_PACKET) renderDrawer();
}

export async function render(ctx) {
  if (MODE) { await pumpEngine(ctx); MODE.fill(ctx); wireSeam(ctx); return MODE.node; }

  const { h, ui } = ctx;
  let stage;
  try {
    const { cityView } = await import("../city-engine.js?v=" + (window.__CC_VER || 0));
    stage = await cityView(ctx);
  } catch (err) {
    stage = ui.error("Could not start the isometric renderer", String(err && err.message || err));
    console.error("[agent-city] engine failed", err);
  }

  // --- top-right LIVE lines-of-code ticker (counts up as the build writes code)
  const tickerNum = h("div", { class: "v" }, "0");
  const tickerFiles = h("div", { class: "s" }, "0 files");
  const tickerPctNum = h("span", { class: "pn" }, "0%");
  const tickerPctFill = h("span", { class: "pf" });
  const tickerPct = h("div", { class: "loc-pct", title: "Estimated TOTAL BaseballHelm completion — weighted across the WHOLE product: existing shipped features (roster, messaging, calendar, recruiting, profiles, stats...) + surfaces under active build (live from telemetry) + the pending zip-mandated depth subsystems. An honest estimate; climbs as the build progresses." },
    h("div", { class: "pl" }, h("span", { class: "pk" }, "BaseballHelm complete"), tickerPctNum),
    h("div", { class: "pbar" }, tickerPctFill));
  const tickerEl = h("div", { class: "loc-ticker", title: "Lines of code written for BaseballHelm" },
    h("div", { class: "k" }, "Lines of code"), tickerNum, tickerFiles, tickerPct);
  const stageWrap = h("div", { class: "city-stagewrap" }, stage, tickerEl);
  let locDisplayed = 0;
  let pctDisplayed = 0;
  function setTicker(total, files, added) {
    const target = Math.max(0, Math.round(total || 0));
    const f = Math.max(0, Math.round(files || 0));
    const a = Math.max(0, Math.round(added || 0));
    const grew = target > locDisplayed && locDisplayed > 0;
    tickerFiles.replaceChildren(document.createTextNode(`${f.toLocaleString()} files`),
      a > 0 ? h("span", { class: "up" }, `  ▲ +${a.toLocaleString()} this build`) : document.createTextNode(""));
    if (grew) { tickerEl.classList.remove("bump"); void tickerEl.offsetWidth; tickerEl.classList.add("bump"); }
    if (target === locDisplayed) { tickerNum.textContent = target.toLocaleString(); return; }
    const from = locDisplayed, start = performance.now(), dur = 750;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      tickerNum.textContent = Math.round(from + (target - from) * ease(t)).toLocaleString();
      if (t < 1) requestAnimationFrame(step);
      else { locDisplayed = target; tickerNum.textContent = target.toLocaleString(); }
    }
    requestAnimationFrame(step);
  }
  function setPct(prog) {
    const target = Math.max(0, Math.min(100, Math.round(prog || 0)));
    tickerPctFill.style.width = target + "%";
    if (target === pctDisplayed) { tickerPctNum.textContent = target + "%"; return; }
    const from = pctDisplayed, start = performance.now(), dur = 650;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      tickerPctNum.textContent = Math.round(from + (target - from) * ease(t)) + "%";
      if (t < 1) requestAnimationFrame(step);
      else { pctDisplayed = target; tickerPctNum.textContent = target + "%"; }
    }
    requestAnimationFrame(step);
  }

  const headActions = h("div", { class: "actions" });
  const bandHost = h("div");
  const railNow = h("div", { class: "scroll-y maxh-280" });
  const railCrew = h("div", { class: "scroll-y maxh-280" });
  const nowPanelSub = h("span", { class: "panel-sub", style: { marginLeft: "6px" } });
  const crewPanelSub = h("span", { class: "panel-sub", style: { marginLeft: "6px" } });

  const legend = h("div", { class: "iso-legend mt3" },
    h("span", { class: "li" }, h("span", { class: "sw", style: { background: "var(--city-gold)" } }), "Crane = under construction"),
    h("span", { class: "li" }, h("span", { class: "sw", style: { background: "var(--city-turf)" } }), "Flag = shipped"),
    h("span", { class: "li" }, h("span", { class: "sw", style: { background: "var(--city-clay)" } }), "Smoke = blocked"),
    h("span", { class: "li" }, h("span", { class: "sw", style: { background: "var(--city-green-700)" } }), "Workers = agents"));

  const node = h("div", { class: "stack" },
    ui.modeHead({ glyph: "▦", title: "Agent City", sub: "Each building is a BaseballHelm subsystem. It rises as its agent builds it — cranes mean construction, flags mean shipped.", actions: headActions }),
    bandHost,
    ui.panel({ glyph: "🏙", title: "The build city", sub: "live · buildings rise per agent", lift: true, body: h("div", { class: "stack" }, stageWrap, legend) }),
    ui.grid("c2", [
      panelWithSub(h, "🏗", "Now building", nowPanelSub, railNow),
      panelWithSub(h, "👷", "Crews", crewPanelSub, railCrew),
    ]),
  );

  function fill(c) {
    const { h, ui, fmt } = c;
    const s = c.state || {};
    const packets = s.packets || [];
    const agents = s.agents || [];
    const risks = (s.risks?.cards || []).filter((r) => r.status !== "resolved");
    const qa = s.qa?.checks || [];
    const prog = c.weightedProgress(packets);
    const built = packets.filter((p) => p.status === "done").length;
    const activeAgents = agents.filter((a) => a.status === "active");
    const activePackets = packets.filter((p) => p.status === "active");
    const crit = risks.some((r) => r.level === "critical");
    const weather = crit || qa.some((q) => q.status === "failed") ? "storm" : risks.length ? "watch" : "sunny";

    setTicker(s.loc?.total || 0, s.loc?.files || 0, s.loc?.added || 0);
    // TOTAL BaseballHelm completion — weighted across the WHOLE product (existing shipped
    // features + live build + pending zip depth), computed server-side in baseballhelm-loc.mjs.
    setPct(s.loc?.completion || 0);

    bandHost.replaceChildren(ui.grid("c4", [
      ui.stat({ label: "Skyline built", value: fmt.pct(prog), sub: `${built}/${packets.length} topped out`, tone: "ok" }),
      ui.stat({ label: "Crews on site", value: `${activeAgents.length}/${agents.length}`, sub: "agents constructing", tone: "info" }),
      ui.stat({ label: "Rising now", value: activePackets.length, sub: "buildings under construction", tone: activePackets.length ? "warn" : "info" }),
      ui.stat({ label: "Open risks", value: risks.length, sub: weather === "storm" ? "storm over the city" : "skies tracked", tone: risks.length ? "risk" : "ok" }),
    ]));

    headActions.replaceChildren(
      h("span", { class: `weather-chip ${weather}` }, weather === "sunny" ? "☀ Sunny — healthy build" : weather === "watch" ? "⛅ Watch — open risks" : "⛈ Storm — critical risk / failing checks"),
      h("button", { class: "btn sm", onClick: () => c.go("factory-floor") }, "Factory Floor →"));

    nowPanelSub.textContent = `${activePackets.length} active`;
    railNow.replaceChildren(activePackets.length
      ? ui.rows(activePackets.map((p) => {
          const crew = agents.find((a) => a.id === p.owner_lane);
          return h("div", { class: "list-row" },
            ui.dot(p.status === "blocked" ? "risk" : "warn"),
            h("div", { class: "grow" }, h("div", { style: { fontWeight: "600", fontSize: "12.5px" } }, p.short || p.title), h("div", { class: "muted", style: { fontSize: "11px" } }, crew ? `crew: ${crew.name}` : "unassigned")),
            h("div", { style: { width: "84px" } }, ui.progress(p.completion_percent || 0, { tone: "gold", right: fmt.pct(p.completion_percent) })));
        }))
      : ui.empty({ glyph: "🏗", title: "No buildings rising yet", hint: "When an agent starts a packet, its building breaks ground here and rises as it works." }));

    crewPanelSub.textContent = `${activeAgents.length}/${agents.length} on site`;
    railCrew.replaceChildren(ui.rows(agents.slice().sort((a, b) => (b.status === "active") - (a.status === "active")).map((a) => {
      const job = packets.find((p) => p.owner_lane === a.id && p.status === "active");
      return h("div", { class: "list-row" },
        h("span", { class: `dot-state ${a.status === "active" ? "ok" : "idle"}` }),
        h("div", { class: "grow truncate" }, h("b", { style: { fontSize: "12.5px" } }, a.name), h("span", { class: "muted", style: { fontSize: "11px" } }, ` · ${a.status}`)),
        h("span", { class: "muted truncate", style: { fontSize: "11px", maxWidth: "130px" } }, job ? `building ${job.short || job.title}` : a.district));
    })));
  }

  MODE = { node, fill };
  fill(ctx);
  ensureDrawerStyles(h);
  wireSeam(ctx);
  return node;
}

async function pumpEngine(ctx) {
  try { const { cityView } = await import("../city-engine.js?v=" + (window.__CC_VER || 0)); await cityView(ctx); } catch {}
}
function panelWithSub(h, glyph, title, subEl, body) {
  return h("div", { class: "panel" },
    h("div", { class: "panel-head" }, h("div", { class: "h" }, h("span", { class: "glyph" }, glyph), h("span", {}, title), subEl)),
    body);
}
