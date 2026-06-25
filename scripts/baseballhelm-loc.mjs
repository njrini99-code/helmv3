#!/usr/bin/env node
/* baseballhelm-loc.mjs — counts lines of CODE written for BaseballHelm.
   "Written" = every NEW (untracked) file in the baseball footprint counted in
   full, PLUS added lines in any tracked baseball file we modified (git numstat).
   Excludes the vendored PixiJS (not ours), node_modules, .next, and non-code
   files (docs/json/data). Exports computeLoc() for the command-center server;
   also runs standalone to print a summary. Read-only; never touches a DB. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO = "/Users/ricknini/Downloads/helmv3";
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".css", ".scss", ".html", ".sql"]);

function category(rel) {
  if (rel.startsWith("tools/baseballhelm-command-center")) return "Command Center";
  if (rel.startsWith("scripts/baseballhelm-")) return "Build scripts";
  if (rel.startsWith("supabase/migrations")) return "Migrations";
  if (rel.startsWith("supabase/tests")) return "RLS tests";
  if (rel.startsWith("src/app/baseball")) return "App routes";
  if (rel.startsWith("src/components/baseball")) return "Components";
  if (rel.startsWith("src/lib/baseball") || rel === "src/lib/types/baseball-extended.ts") return "Libraries";
  if (rel.startsWith("src/hooks")) return "Hooks";
  return "Other";
}
function isBaseballCode(rel) {
  if (!rel || rel.includes("/vendor/") || rel.includes("node_modules") || rel.includes("/.next/")) return false;
  if (!CODE_EXT.has(path.extname(rel))) return false;
  if (rel.startsWith("tools/baseballhelm-command-center")) return true;
  if (rel.startsWith("scripts/baseballhelm-")) return true;
  if (rel.startsWith("src/app/baseball")) return true;
  if (rel.startsWith("src/components/baseball")) return true;
  if (rel.startsWith("src/lib/baseball")) return true;
  if (rel === "src/lib/types/baseball-extended.ts") return true;
  if (rel.startsWith("src/hooks") && /baseball/i.test(rel)) return true;
  if (rel.startsWith("supabase/migrations") && /baseball/i.test(rel)) return true;
  if (rel.startsWith("supabase/tests") && /baseball/i.test(rel)) return true;
  return false;
}
function git(args) {
  try { return execFileSync("git", args, { cwd: REPO, maxBuffer: 1e8 }).toString(); } catch { return ""; }
}
function fileLineCount(rel) {
  try { const t = readFileSync(path.join(REPO, rel), "utf8"); if (!t) return 0; return t.split("\n").length - (t.endsWith("\n") ? 1 : 0); } catch { return 0; }
}

// The BaseballHelm PRODUCT (app/components/lib/migrations/types) — excludes the
// command-center build tooling + build scripts, which are the dashboard, not the app.
function isBaseballProduct(rel) {
  if (!isBaseballCode(rel)) return false;
  if (rel.startsWith("tools/baseballhelm-command-center")) return false;
  if (rel.startsWith("scripts/baseballhelm-")) return false;
  return true;
}

// --- TOTAL PRODUCT COMPLETION estimate ---------------------------------------
// Weighted across the WHOLE BaseballHelm subsystem inventory, not just the build
// phases: existing shipped features (already work) + surfaces under active build
// (live % from telemetry packets) + zip-mandated depth not started yet. Weights are
// rough size/importance (1-10). An honest estimate, transparent + telemetry-driven.
const SUBSYSTEMS = [
  // shipped: already in the repo and working (existing BaseballHelm product)
  { key: "Auth & onboarding", w: 8, shipped: 90 },
  { key: "Roster & membership", w: 5, shipped: 92 },
  { key: "Team management", w: 5, shipped: 90 },
  { key: "Messaging", w: 4, shipped: 90 },
  { key: "Calendar & events", w: 6, shipped: 88 },
  { key: "Announcements", w: 2, shipped: 95 },
  { key: "Tasks", w: 2, shipped: 95 },
  { key: "Documents", w: 2, shipped: 95 },
  { key: "Travel", w: 2, shipped: 90 },
  { key: "Recruiting suite", w: 8, shipped: 90 },
  { key: "Player profiles & public", w: 5, shipped: 88 },
  { key: "Box scores & games", w: 4, shipped: 85 },
  { key: "Basic stats", w: 4, shipped: 80 },
  { key: "Development plans", w: 3, shipped: 85 },
  { key: "Academics", w: 2, shipped: 80 },
  // in build: live completion from the telemetry packets
  { key: "Coach Command Center", w: 7, packet: "coach-command" },
  { key: "Player Today", w: 5, packet: "player-today" },
  { key: "Player timeline", w: 4, packet: "roster-timeline" },
  { key: "Import Center", w: 7, packet: "source-registry" },
  { key: "Stats Center", w: 6, packet: "stats-center" },
  { key: "Practice Planner", w: 6, packet: "practice-planner" },
  { key: "Performance / Lifting", w: 8, packet: "performance-os" },
  { key: "Staff roles & invites", w: 6, packet: "staff-roles" },
  { key: "Staff Decision Room", w: 5, packet: "decision-room" },
  { key: "CoachHelm engine", w: 9, packet: "coachhelm-intel" },
  { key: "Demo seed + QA", w: 4, packet: "qa-screens" },
  // pending: zip-mandated depth subsystems (go live when the depth wave posts them)
  { key: "Signal Inbox + actions", w: 6, packet: "signal-inbox" },
  { key: "Source Trust UI", w: 4, packet: "source-trust" },
  { key: "Postgame Action Review", w: 5, packet: "postgame-review" },
  { key: "Practice Intelligence", w: 4, packet: "practice-intel" },
  { key: "Practice Effectiveness", w: 4, packet: "practice-effectiveness" },
  { key: "Elite stats + visuals", w: 8, packet: "elite-stats" },
  { key: "Settings OS + variants", w: 4, packet: "settings-os" },
  { key: "Video & classes", w: 4, packet: "video-classes" },
  { key: "Player Passport", w: 4, packet: "player-passport" },
  { key: "Premium lifting (V11)", w: 6, packet: "premium-lifting" },
];
function readPackets() {
  try { return JSON.parse(readFileSync(path.join(REPO, ".ultracode/baseballhelm/work-packets.json"), "utf8")); } catch { return []; }
}
export function computeCompletion() {
  const byId = new Map(readPackets().map((p) => [p.id, p]));
  const groups = { shipped: { w: 0, c: 0 }, build: { w: 0, c: 0 }, pending: { w: 0, c: 0 } };
  let wsum = 0, csum = 0;
  for (const s of SUBSYSTEMS) {
    let comp, grp;
    if (typeof s.shipped === "number") { comp = s.shipped; grp = "shipped"; }
    else if (s.packet && byId.has(s.packet)) { comp = byId.get(s.packet).completion_percent || 0; grp = "build"; }
    else { comp = 0; grp = "pending"; }
    wsum += s.w; csum += s.w * comp;
    groups[grp].w += s.w; groups[grp].c += s.w * comp;
  }
  const g = (k) => groups[k].w ? Math.round(groups[k].c / groups[k].w) : 0;
  return { pct: wsum ? Math.round(csum / wsum) : 0, shipped_pct: g("shipped"), build_pct: g("build"), pending_pct: g("pending"), subsystems: SUBSYSTEMS.length };
}

export function computeLoc() {
  // --- TOTAL: every BaseballHelm product file (tracked + untracked), counted in full.
  //     This is the real size of the product (~tens of thousands), not just this session.
  const allFiles = new Set();
  for (const rel of git(["ls-files"]).split("\n").filter(Boolean)) if (isBaseballProduct(rel)) allFiles.add(rel);
  for (const rel of git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean)) if (isBaseballProduct(rel)) allFiles.add(rel);
  const cats = {};
  let total = 0;
  for (const rel of allFiles) {
    const n = fileLineCount(rel);
    if (n <= 0) continue;
    const c = category(rel);
    if (!cats[c]) cats[c] = { files: 0, lines: 0 };
    cats[c].files += 1; cats[c].lines += n; total += n;
  }
  // --- ADDED THIS BUILD: new (untracked) product files in full + added lines in modified ones.
  let added = 0; const addedFiles = new Set();
  for (const rel of git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean)) {
    if (isBaseballProduct(rel)) { const n = fileLineCount(rel); if (n > 0) { added += n; addedFiles.add(rel); } }
  }
  for (const line of git(["diff", "--numstat", "HEAD"]).split("\n").filter(Boolean)) {
    const [a, , rel] = line.split("\t");
    if (rel && a !== "-" && isBaseballProduct(rel)) { const n = parseInt(a, 10) || 0; if (n > 0) { added += n; addedFiles.add(rel); } }
  }
  const byCategory = Object.entries(cats).map(([key, v]) => ({ key, files: v.files, lines: v.lines })).sort((a, b) => b.lines - a.lines);
  const c = computeCompletion();
  return { total, files: allFiles.size, added, addedFiles: addedFiles.size, byCategory, completion: c.pct, completionBreakdown: c, generated_at: new Date().toISOString() };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const loc = computeLoc();
  const pad = (s, n) => String(s).padEnd(n);
  console.log("\n  BaseballHelm — lines of code written");
  console.log("  ────────────────────────────────────");
  for (const c of loc.byCategory) console.log(`  ${pad(c.key, 18)} ${pad(c.files + " files", 11)} ${c.lines.toLocaleString()} lines`);
  console.log("  ────────────────────────────────────");
  console.log(`  ${pad("TOTAL (product)", 18)} ${pad(loc.files + " files", 11)} ${loc.total.toLocaleString()} lines`);
  console.log(`  ${pad("+ this build", 18)} ${pad(loc.addedFiles + " files", 11)} ${loc.added.toLocaleString()} lines added\n`);
}
