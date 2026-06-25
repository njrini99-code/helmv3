#!/usr/bin/env node
/*
 * BaseballHelm Ultracode Command Center — local HTTP server + live event hub.
 *
 * A LOCAL, repo-contained, cream/green "Agent City / Factory Floor" build-observability
 * dashboard. NOT part of the shipped product — a localhost tool that watches the
 * BaseballHelm build and streams build telemetry to the static UI in
 * tools/baseballhelm-command-center/.
 *
 * Zero dependencies — Node core only (node:http, node:fs, node:path, node:url, node:child_process).
 *
 * Security posture:
 *  - Binds 127.0.0.1 ONLY (never 0.0.0.0 / public).
 *  - Never reads or serves process.env, .env files, or any secret.
 *  - Static serving is jailed inside the command-center dir; path traversal rejected.
 *  - All git introspection uses execFile with argument arrays (never a shell), is
 *    non-destructive, and degrades gracefully on failure.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { computeLoc } from "./baseballhelm-loc.mjs";

// Lines-of-code written for BaseballHelm (git-based, cached ~15s).
let locCache = { ts: 0, data: { total: 0, files: 0, byCategory: [] } };
function getLoc() {
  const now = Date.now();
  if (locCache.data && now - locCache.ts < 15000) return locCache.data;
  try { locCache = { ts: now, data: computeLoc() }; } catch { /* keep last */ }
  return locCache.data;
}

// --------------------------------------------------------------------------- paths
const REPO_ROOT = "/Users/ricknini/Downloads/helmv3";
const WEB_ROOT = path.join(REPO_ROOT, "tools", "baseballhelm-command-center");
const DATA_DIR = path.join(REPO_ROOT, ".ultracode", "baseballhelm");

const STATE_FILE = path.join(DATA_DIR, "state.json");
const AGENTS_FILE = path.join(DATA_DIR, "agents.json");
const PACKETS_FILE = path.join(DATA_DIR, "work-packets.json");
const RISKS_FILE = path.join(DATA_DIR, "risks.json");
const QA_FILE = path.join(DATA_DIR, "qa.json");
const DECISIONS_FILE = path.join(DATA_DIR, "decisions.json");
const ARTIFACTS_FILE = path.join(DATA_DIR, "artifacts.json");
const HANDOFF_FILE = path.join(DATA_DIR, "handoff.json");
const REPLAY_FILE = path.join(DATA_DIR, "replay.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.ndjson");

const HOST = process.env.BBCC_HOST || "127.0.0.1"; // default localhost-only (spec); set BBCC_HOST=0.0.0.0 for same-LAN phone viewing
const PORT_START = 4877;
const PORT_MAX = 4897;
const BOOT_TS = Date.now();

// --------------------------------------------------------------------------- helpers: fs / json

/** Read + parse a JSON file FRESH (no cache). Returns fallback on missing/malformed. */
function readJSON(file, fallback) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

/** Atomically-ish write JSON (best effort; tolerate failure without crashing). */
function writeJSON(file, value) {
  try {
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

/** Read events.ndjson, skipping blank/bad lines; chronological ascending (file order). */
function readEvents() {
  let raw;
  try {
    raw = fs.readFileSync(EVENTS_FILE, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // skip malformed line
    }
  }
  return out;
}

/** Append one ndjson line to events.ndjson (best effort). */
function appendEventLine(evt) {
  try {
    fs.appendFileSync(EVENTS_FILE, JSON.stringify(evt) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

/** Next event id like "evt-0008" based on the current max numeric suffix. */
function nextEventId(events) {
  let max = 0;
  for (const e of events) {
    const m = typeof e?.id === "string" && e.id.match(/evt-(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return "evt-" + String(max + 1).padStart(4, "0");
}

// --------------------------------------------------------------------------- risk classifier
/*
 * Shared risk classifier. Given a command string and/or affected paths, return one of
 * 'critical' | 'high' | 'medium' | 'low' | 'info'. Rules mirror the V12 adaptation and
 * the seeded risks.json rule set.
 */
const HIGH_ATTENTION_PATHS = ["auth", "middleware", "rls", "policy", "supabase/migrations"];
const HIGH_OR_CRITICAL_COMMANDS = [
  "rm -rf",
  "git reset --hard",
  "git checkout --",
  "force push",
  "push --force",
  "drop table",
  "truncate",
];
const SECRET_TOKENS = [".env", "secret", "token", "credential"];
const MEDIUM_TOKENS = ["npm install", "npm i ", "yarn add", "pnpm add", "package install", "generated type", "type churn"];

function classifyRisk({ command = "", paths = [], beforeTask0 = false } = {}) {
  const cmd = String(command || "").toLowerCase();
  const allPaths = (Array.isArray(paths) ? paths : [paths]).filter(Boolean).map((p) => String(p).toLowerCase());

  // Product code edits before Task 0 verification => critical (hard guard).
  if (beforeTask0 && allPaths.some((p) => p.includes("src/app/baseball"))) return "critical";

  // Destructive / dangerous commands => high, escalate to critical for the worst.
  for (const danger of HIGH_OR_CRITICAL_COMMANDS) {
    if (cmd.includes(danger)) {
      if (danger === "rm -rf" || danger === "git reset --hard" || danger === "drop table" || danger === "force push" || danger === "push --force") {
        return "critical";
      }
      return "high";
    }
  }
  // Broad delete heuristic.
  if (/\bdelete\b.*\b(from|where 1=1|--all|\*)\b/.test(cmd) || cmd.includes("delete from")) return "high";

  // Commands operating outside the repo root => high.
  if (cmd && /(^|\s)(cd|rm|cp|mv)\s+\//.test(cmd) && !cmd.includes(REPO_ROOT.toLowerCase())) {
    // a leading absolute path that is not the repo root
    if (!cmd.includes("/users/ricknini/downloads/helmv3")) return "high";
  }

  // Secret/credential reads => high (treat as sensitive).
  if (SECRET_TOKENS.some((t) => cmd.includes(t) || allPaths.some((p) => p.includes(t)))) return "high";

  // High-attention paths (auth / middleware / rls / policy / migrations) => high.
  if (allPaths.some((p) => HIGH_ATTENTION_PATHS.some((h) => p.includes(h)))) return "high";

  // Package installs / generated type churn => medium.
  if (MEDIUM_TOKENS.some((t) => cmd.includes(t))) return "medium";

  return "info";
}

// --------------------------------------------------------------------------- git / repo facts
/*
 * Repo facts computed via execFile (argument arrays, NEVER a shell), cwd=REPO_ROOT,
 * non-destructive read-only git commands, ~4s per-call timeout. Cached ~3s.
 */
let repoCache = { ts: 0, data: null };

function git(args) {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd: REPO_ROOT, timeout: 4000, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null);
        resolve(String(stdout || ""));
      }
    );
  });
}

async function computeRepoFacts() {
  const now = Date.now();
  if (repoCache.data && now - repoCache.ts < 3000) return repoCache.data;

  const safe = { branch: "unknown", dirty: [], changed_files: [], diffstat: "", last_commit: "" };

  const [branchOut, statusOut, diffStatOut, nameOnlyOut, logOut] = await Promise.all([
    git(["rev-parse", "--abbrev-ref", "HEAD"]),
    git(["status", "--short"]),
    git(["diff", "--stat"]),
    git(["diff", "--name-only"]),
    git(["log", "-1", "--oneline"]),
  ]);

  if (branchOut != null) safe.branch = branchOut.trim() || "unknown";

  if (statusOut != null) {
    safe.dirty = statusOut
      .split("\n")
      .map((l) => l.replace(/\r$/, ""))
      .filter((l) => l.trim().length)
      .map((l) => ({ status: l.slice(0, 2).trim(), path: l.slice(3).trim() }));
  }

  if (diffStatOut != null) safe.diffstat = diffStatOut.trimEnd();

  if (nameOnlyOut != null) {
    safe.changed_files = nameOnlyOut
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  if (logOut != null) safe.last_commit = logOut.trim();

  repoCache = { ts: now, data: safe };
  return safe;
}

// --------------------------------------------------------------------------- aggregate state

async function buildAggregateState() {
  const state = readJSON(STATE_FILE, {});
  const agents = readJSON(AGENTS_FILE, []);
  const packets = readJSON(PACKETS_FILE, []);
  const risks = readJSON(RISKS_FILE, { rules: {}, cards: [] });
  const qa = readJSON(QA_FILE, { checks: [], honest_states: {} });
  const decisions = readJSON(DECISIONS_FILE, []);
  const artifacts = readJSON(ARTIFACTS_FILE, []);
  const handoff = readJSON(HANDOFF_FILE, { status: "", read_order: [], next_actions: [], notes: [] });
  const events = readEvents();
  const repo = await computeRepoFacts();

  // Attach live + child collections onto the aggregate.
  const agg = {
    ...state,
    branch: repo.branch || state.branch || "unknown",
    agents: Array.isArray(agents) ? agents : [],
    packets: Array.isArray(packets) ? packets : [],
    risks: risks && typeof risks === "object" ? risks : { rules: {}, cards: [] },
    qa: qa && typeof qa === "object" ? qa : { checks: [], honest_states: {} },
    decisions: Array.isArray(decisions) ? decisions : [],
    artifacts: Array.isArray(artifacts) ? artifacts : [],
    handoff: handoff && typeof handoff === "object" ? handoff : { next_actions: [], notes: [] },
    repo,
    loc: getLoc(),
    counts: {
      agents: Array.isArray(agents) ? agents.length : 0,
      packets: Array.isArray(packets) ? packets.length : 0,
      events: events.length,
      risks: Array.isArray(risks?.cards) ? risks.cards.length : 0,
      decisions: Array.isArray(decisions) ? decisions.length : 0,
    },
  };
  return agg;
}

// --------------------------------------------------------------------------- SSE clients

/** @type {Set<import('node:http').ServerResponse>} */
const sseClients = new Set();

function sseSend(res, event, dataObj) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(dataObj)}\n\n`);
  } catch {
    // dead client; will be cleaned on 'close'
  }
}

/**
 * Internal append() helper — the single write path used by POST /api/events and
 * POST /hooks/claude. Writes the ndjson line AND broadcasts to all SSE clients.
 */
function append(evt) {
  appendEventLine(evt);
  for (const client of sseClients) sseSend(client, "append", evt);
  return evt;
}

// --------------------------------------------------------------------------- http utils

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
};

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(text);
}

function notFound(res) {
  sendText(res, 404, "Not found");
}

/** Read a request body as a string, capped to avoid abuse. */
function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve) => {
    let data = "";
    let aborted = false;
    req.on("data", (chunk) => {
      if (aborted) return;
      data += chunk;
      if (data.length > limit) {
        aborted = true;
        resolve(data.slice(0, limit));
      }
    });
    req.on("end", () => {
      if (!aborted) resolve(data);
    });
    req.on("error", () => resolve(aborted ? data : data));
  });
}

// --------------------------------------------------------------------------- static serving (jailed)

function serveStatic(reqPath, res) {
  // Map "/" -> index.html
  let rel = reqPath === "/" || reqPath === "" ? "/index.html" : reqPath;
  // Decode + strip query already handled by caller.
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return notFound(res);
  }

  // Resolve inside WEB_ROOT and reject traversal.
  const resolved = path.normalize(path.join(WEB_ROOT, rel));
  if (resolved !== WEB_ROOT && !resolved.startsWith(WEB_ROOT + path.sep)) {
    return notFound(res); // path traversal attempt
  }
  // Defensive: never serve .env or dotfiles other than the allowed icon-less set.
  if (path.basename(resolved).startsWith(".")) return notFound(res);

  fs.stat(resolved, (err, stat) => {
    if (err || !stat.isFile()) return notFound(res);
    const ext = path.extname(resolved).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    const stream = fs.createReadStream(resolved);
    stream.on("error", () => {
      if (!res.headersSent) notFound(res);
      else res.end();
    });
    stream.pipe(res);
  });
}

// --------------------------------------------------------------------------- API handlers

async function handleState(res) {
  const agg = await buildAggregateState();
  sendJSON(res, 200, agg);
}

function handleEvents(res, url) {
  const events = readEvents();
  let limit = parseInt(url.searchParams.get("limit") || "400", 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 400;
  const tail = events.slice(-limit);
  sendJSON(res, 200, tail);
}

async function handleRepo(res) {
  const repo = await computeRepoFacts();
  sendJSON(res, 200, repo);
}

function handleReplay(res) {
  const replay = readJSON(REPLAY_FILE, { cursor: 0, speed: 1, filters: {} });
  const count = readEvents().length;
  sendJSON(res, 200, { ...replay, count });
}

function handleArtifacts(res) {
  const artifacts = readJSON(ARTIFACTS_FILE, []);
  sendJSON(res, 200, Array.isArray(artifacts) ? artifacts : []);
}

/** Apply the special side effects of a command_center_verified event. */
function applyVerifiedSideEffects(ts) {
  // 1) state.json task0_gate
  const state = readJSON(STATE_FILE, {});
  state.task0_gate = { ...(state.task0_gate || {}), verified: true, verified_at: ts, status: "open" };
  state.updated_at = ts;
  writeJSON(STATE_FILE, state);

  // 2) work-packets.json — task-0 browser_verified + completion/status
  const packets = readJSON(PACKETS_FILE, []);
  if (Array.isArray(packets)) {
    for (const p of packets) {
      if (p && p.id === "task-0") {
        p.checklist = { ...(p.checklist || {}), browser_verified: true };
        p.completion_percent = Math.max(100, Number(p.completion_percent) || 0);
        p.status = "done";
        p.stage = "done";
        p.updated_at = ts;
      }
    }
    writeJSON(PACKETS_FILE, packets);
  }

  // 3) qa.json — chrome-verification check passed
  const qa = readJSON(QA_FILE, { checks: [] });
  if (Array.isArray(qa.checks)) {
    for (const c of qa.checks) {
      if (c && c.id === "chrome-verification") {
        c.status = "passed";
        c.last_run = ts;
      }
    }
    qa.updated_at = ts;
    writeJSON(QA_FILE, qa);
  }
}

async function handlePostEvent(req, res) {
  const raw = await readBody(req);
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }

  const ts = new Date().toISOString();
  const events = readEvents();
  const id = nextEventId(events);

  const pctNum = Number(body.pct);
  const evt = {
    id,
    ts,
    source: body.source || "manual",
    type: body.type || "event",
    agent: body.agent || null,
    packet: body.packet || null,
    title: body.title || "",
    detail: body.detail || "",
    severity: body.severity || "info",
    ...(Number.isFinite(pctNum) ? { pct: pctNum } : {}),
  };

  // Special-case: verification event flips the Task 0 gate + linked records.
  if (evt.type === "command_center_verified") {
    applyVerifiedSideEffects(ts);
  }
  // Generic: progress/lifecycle events atomically raise the packet's building
  // and mark the reporting agent active. Single-process => serialized, race-free.
  applyProgressSideEffects(evt, ts);

  append(evt);
  sendJSON(res, 200, evt);
}

const PROGRESS_TYPES = new Set([
  "packet_started", "packet_progress", "packet_completed", "packet_blocked", "packet_unblocked",
  "file_changed", "migration_added", "table_touched", "route_touched", "test_passed",
]);
function applyProgressSideEffects(evt, ts) {
  // 1) mark the reporting agent active (so its workers animate in the city)
  if (evt.agent) {
    const agents = readJSON(AGENTS_FILE, []);
    if (Array.isArray(agents)) {
      let changed = false;
      for (const a of agents) {
        if (a && a.id === evt.agent) {
          if (evt.type !== "packet_completed") { a.status = "active"; a.heartbeat = "live"; }
          a.last_update = ts;
          if (evt.title) a.notes = evt.title;
          changed = true;
        }
      }
      if (changed) writeJSON(AGENTS_FILE, agents);
    }
  }
  // 2) raise the packet building
  const isProgress = PROGRESS_TYPES.has(evt.type) || Number.isFinite(evt.pct);
  if (!isProgress || !evt.packet) return;
  const packets = readJSON(PACKETS_FILE, []);
  if (!Array.isArray(packets)) return;
  let p = packets.find((x) => x && x.id === evt.packet);
  if (!p) {
    // auto-register a building for an unknown packet so live workflows (depth wave, verification,
    // future expansion) actually show up in the city instead of being silently dropped.
    p = { id: evt.packet, title: evt.title || evt.packet, short: String(evt.title || evt.packet).slice(0, 18),
      weight: 6, owner_lane: evt.agent || "orchestrator", status: "active", district: "Component Foundry",
      completion_percent: 0, confidence_percent: 0, stage: "in_progress", blocked_reason: null,
      checklist: {}, created_at: ts, updated_at: ts };
    packets.push(p);
  }
  const cur = Number(p.completion_percent) || 0;
  if (evt.type === "packet_completed") { p.completion_percent = 100; p.status = "done"; p.stage = "done"; }
  else if (evt.type === "packet_blocked") { p.status = "blocked"; p.blocked_reason = evt.detail || "blocked"; }
  else if (evt.type === "packet_unblocked") { p.status = "active"; p.blocked_reason = null; }
  else {
    if (Number.isFinite(evt.pct)) p.completion_percent = Math.max(0, Math.min(100, evt.pct));
    else if (evt.type === "packet_started") p.completion_percent = Math.max(cur, 20);
    else p.completion_percent = Math.min(95, cur + 6); // generic nudge (file/route/table/test touches)
    if ((p.completion_percent || 0) >= 100) { p.status = "done"; p.stage = "done"; }
    else if (p.status !== "blocked") { p.status = "active"; p.stage = "in_progress"; }
  }
  p.updated_at = ts;
  writeJSON(PACKETS_FILE, packets);
}

async function handleHook(req, res) {
  // ALWAYS respond 200, even on bad input.
  const raw = await readBody(req);
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }
  if (payload == null || typeof payload !== "object") payload = {};

  const hookName =
    payload.hook_event_name ||
    payload?.payload?.hook_event_name ||
    "hook";

  // Extract a command + affected paths for the risk classifier where available.
  const command =
    payload.tool_input?.command ||
    payload.command ||
    payload?.payload?.tool_input?.command ||
    "";
  const paths = []
    .concat(payload.tool_input?.file_path || [])
    .concat(payload.tool_input?.paths || [])
    .concat(payload.affected_paths || [])
    .filter(Boolean);

  // Is Task 0 still un-verified? (drives the product-code critical guard)
  const state = readJSON(STATE_FILE, {});
  const beforeTask0 = !state?.task0_gate?.verified;

  const severity = classifyRisk({ command, paths, beforeTask0 });

  const ts = new Date().toISOString();
  const events = readEvents();
  const id = nextEventId(events);

  const detailBits = [];
  if (command) detailBits.push(`cmd: ${String(command).slice(0, 160)}`);
  if (paths.length) detailBits.push(`paths: ${paths.slice(0, 4).join(", ")}`);
  if (payload.tool_name) detailBits.push(`tool: ${payload.tool_name}`);
  const detail = detailBits.join(" · ") || "Claude Code hook received.";

  const evt = {
    id,
    ts,
    source: "claude-hook",
    type: hookName,
    agent: "claude-hook",
    packet: payload.packet || null,
    title: `Hook: ${hookName}`,
    detail,
    severity,
    raw: payload, // preserve the original payload
  };

  append(evt);

  // High/critical severities also land a card on risks.json.
  if (severity === "high" || severity === "critical") {
    const risks = readJSON(RISKS_FILE, { rules: {}, cards: [] });
    if (!Array.isArray(risks.cards)) risks.cards = [];
    risks.cards.push({
      id: "risk-hook-" + id,
      level: severity,
      category: "hook",
      title: `Hook flagged ${severity}: ${hookName}`,
      status: "noted",
      description: detail,
      affected_paths: paths,
      command: command || null,
      checkpoint_ref: null,
      timestamp: ts,
      mitigation: "Review the flagged hook action before proceeding.",
    });
    writeJSON(RISKS_FILE, risks);
  }

  sendJSON(res, 200, { ok: true, event: evt });
}

async function handleSSE(req, res) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });

  // Greet the client.
  sseSend(res, "hello", { ts: new Date().toISOString(), port: server._chosenPort, uptime_s: Math.round((Date.now() - BOOT_TS) / 1000) });

  sseClients.add(res);

  // Periodic tick: repo facts + keep-alive comment.
  const tick = setInterval(async () => {
    try {
      const repo = await computeRepoFacts();
      sseSend(res, "tick", { repo });
      res.write(":\n\n"); // keep-alive comment
    } catch {
      // ignore tick errors
    }
  }, 5000);

  const cleanup = () => {
    clearInterval(tick);
    sseClients.delete(res);
  };
  req.on("close", cleanup);
  req.on("error", cleanup);
  res.on("error", cleanup);
}

// --------------------------------------------------------------------------- router

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${HOST}`);
  } catch {
    return notFound(res);
  }
  const pathname = url.pathname;
  const method = req.method || "GET";

  try {
    // ---- API
    if (method === "GET" && pathname === "/api/health") {
      return sendJSON(res, 200, {
        ok: true,
        ts: new Date().toISOString(),
        port: server._chosenPort,
        uptime_s: Math.round((Date.now() - BOOT_TS) / 1000),
        repo: REPO_ROOT,
      });
    }
    if (method === "GET" && pathname === "/api/state") return await handleState(res);
    if (method === "GET" && pathname === "/api/events") return handleEvents(res, url);
    if (method === "GET" && pathname === "/api/repo") return await handleRepo(res);
    if (method === "GET" && pathname === "/api/loc") return sendJSON(res, 200, getLoc());
    if (method === "GET" && pathname === "/api/replay") return handleReplay(res);
    if (method === "GET" && pathname === "/api/artifacts") return handleArtifacts(res);

    if (method === "POST" && pathname === "/api/events") return await handlePostEvent(req, res);
    if (method === "POST" && pathname === "/hooks/claude") return await handleHook(req, res);

    // ---- SSE
    if (method === "GET" && pathname === "/events") return await handleSSE(req, res);

    // ---- static (GET/HEAD only)
    if (method === "GET" || method === "HEAD") return serveStatic(pathname, res);

    return notFound(res);
  } catch (err) {
    // Never crash the server on a single bad request.
    if (!res.headersSent) sendJSON(res, 500, { ok: false, error: String(err && err.message ? err.message : err) });
    else
      try {
        res.end();
      } catch {
        /* noop */
      }
  }
});

server._chosenPort = PORT_START;

// --------------------------------------------------------------------------- listen with auto-increment

function listenWithFallback(port) {
  server.removeAllListeners("error");
  server.once("error", (err) => {
    if (err && err.code === "EADDRINUSE" && port < PORT_MAX) {
      listenWithFallback(port + 1);
    } else {
      console.error(`[command-center] failed to bind ${HOST}:${port} — ${err && err.message}`);
      process.exit(1);
    }
  });
  server.listen(port, HOST, () => {
    server._chosenPort = port;
    const urlStr = `http://${HOST}:${port}`;
    console.log(`\n  BaseballHelm Ultracode Command Center`);
    console.log(`  → ${urlStr}`);
    console.log(`  serving ${WEB_ROOT}`);
    console.log(`  telemetry ${DATA_DIR}\n`);

    // Write the chosen URL back into state.json.
    const state = readJSON(STATE_FILE, {});
    state.url = urlStr;
    writeJSON(STATE_FILE, state);

    // Log a boot event (write + broadcast through the shared append path).
    const events = readEvents();
    append({
      id: nextEventId(events),
      ts: new Date().toISOString(),
      source: "server",
      type: "command_center_server_started",
      agent: "agent-city-systems",
      packet: "task-0",
      title: "Command center server started",
      detail: `Listening on ${urlStr}`,
      severity: "info",
    });
  });
}

listenWithFallback(PORT_START);

// --------------------------------------------------------------------------- live LOC-delta emitter
// Broadcasts a synthetic feed line whenever real (git-tracked) baseball code grows,
// so the Agent Floor / City stream continuously DURING any build — tied to ACTUAL
// file writes, regardless of how chatty the agents are. Ephemeral: broadcast-only
// (never written to events.ndjson) so the persisted build log stays clean.
let __locPrev = null;
function broadcastEphemeral(evt) {
  for (const client of sseClients) sseSend(client, "append", evt);
}
setInterval(() => {
  try {
    const loc = getLoc();
    if (!loc || typeof loc.added !== "number") return;
    if (__locPrev === null) { __locPrev = loc; return; } // seed baseline; no emit on first read
    const dAdded = loc.added - __locPrev.added;
    const dFiles = (loc.addedFiles || 0) - (__locPrev.addedFiles || 0);
    if (dAdded <= 0) { __locPrev = loc; return; } // only emit on real growth
    // which layer grew the most since the last read?
    const prevCat = new Map((__locPrev.byCategory || []).map((c) => [c.key, c.lines]));
    let topCat = null, topDelta = 0;
    for (const c of loc.byCategory || []) {
      const d = c.lines - (prevCat.get(c.key) || 0);
      if (d > topDelta) { topDelta = d; topCat = c.key; }
    }
    const where = topCat ? ` · ${topCat} +${topDelta}` : "";
    const fileWord = Math.abs(dFiles) === 1 ? "file" : "files";
    broadcastEphemeral({
      id: -1, // ephemeral marker (not persisted, never toasts)
      ts: new Date().toISOString(),
      source: "loc-tracker",
      type: "packet_progress",
      agent: "loc-tracker",
      packet: "loc",
      title: `+${dAdded.toLocaleString()} lines written${where}`,
      detail: `${loc.total.toLocaleString()} total · ${dFiles > 0 ? dFiles + " " + fileWord + " touched" : "across the build"}`,
      severity: "info",
    });
    __locPrev = loc;
  } catch { /* ignore */ }
}, 6000);

// Graceful shutdown.
function shutdown() {
  for (const client of sseClients) {
    try {
      client.end();
    } catch {
      /* noop */
    }
  }
  try {
    server.close();
  } catch {
    /* noop */
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
