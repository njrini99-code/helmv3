#!/usr/bin/env node
/**
 * baseballhelm-build-event.mjs — tiny CLI to log a BaseballHelm build event.
 *
 * Tries the running command-center server first (POST /api/events, which appends
 * + broadcasts). If the server is unreachable, falls back to appending the event
 * directly to .ultracode/baseballhelm/events.ndjson using the same shape the
 * server uses. Never throws on network errors; always exits 0.
 *
 * Flags (all strings; --type required):
 *   --type --agent --packet --title --detail --severity --source
 *
 * Example:
 *   node scripts/baseballhelm-build-event.mjs --type packet_started \
 *     --agent orchestrator --packet repo-audit --title "Repo intake" \
 *     --detail "Mapping baseball routes"
 */

import { appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ULTRA_DIR = resolve(ROOT, ".ultracode", "baseballhelm");
const STATE_PATH = resolve(ULTRA_DIR, "state.json");
const EVENTS_PATH = resolve(ULTRA_DIR, "events.ndjson");
const FALLBACK_PORT = 4877;

/* --------------------------------------------------------------- flag parsing */
function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a && a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "";
      }
    }
  }
  return out;
}

/* ----------------------------------------------------------------- port lookup */
async function discoverPort() {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    const url = JSON.parse(raw)?.url;
    if (typeof url === "string") {
      const m = url.match(/:(\d{2,5})(?:\/|$)/);
      if (m) {
        const p = Number(m[1]);
        if (Number.isInteger(p) && p > 0 && p < 65536) return p;
      }
    }
  } catch {
    /* fall through to default */
  }
  return FALLBACK_PORT;
}

/* ----------------------------------------------------------------- event shape */
function makeId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `evt-${ts}-${rand}`;
}

function buildEvent(flags, source) {
  return {
    id: makeId(),
    ts: new Date().toISOString(),
    source,
    type: flags.type || "",
    agent: flags.agent || "",
    packet: flags.packet || "",
    title: flags.title || "",
    detail: flags.detail || "",
    severity: flags.severity || "info",
    ...(flags.pct != null && flags.pct !== "" && Number.isFinite(Number(flags.pct)) ? { pct: Number(flags.pct) } : {}),
  };
}

/* ----------------------------------------------------------------------- server */
async function tryServer(port, payload) {
  const url = `http://127.0.0.1:${port}/api/events`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    // The server appends + broadcasts and may echo back the stored event.
    let stored = null;
    try {
      stored = await res.json();
    } catch {
      /* server returned non-JSON OK — accept anyway */
    }
    return stored && typeof stored === "object" ? stored : true;
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------------- fallback */
async function appendLocal(event) {
  await appendFile(EVENTS_PATH, JSON.stringify(event) + "\n", "utf8");
}

/* --------------------------------------------------------------------------- main */
async function main() {
  const flags = parseFlags(process.argv.slice(2));

  if (!flags.type) {
    console.error("error: --type is required");
    process.exitCode = 0; // honor "never throw / exit 0" contract
    return;
  }

  const port = await discoverPort();

  // 1) Try the server. If it accepts, do NOT also append locally (avoid dupes).
  const clientSource = flags.source || "cli";
  const serverPayload = buildEvent(flags, clientSource);
  const serverResult = await tryServer(port, serverPayload);

  if (serverResult) {
    const id =
      (serverResult && typeof serverResult === "object" && serverResult.id) ||
      serverPayload.id;
    console.log(`logged event ${id} -> server (http://127.0.0.1:${port}/api/events)`);
    return;
  }

  // 2) Fallback: append directly, marking source as cli fallback.
  const fallbackEvent = buildEvent(flags, flags.source || "cli");
  try {
    await appendLocal(fallbackEvent);
    console.log(`logged event ${fallbackEvent.id} -> fallback (${EVENTS_PATH})`);
  } catch (err) {
    console.error(`could not log event (server offline + fallback failed): ${err && err.message ? err.message : err}`);
  }
}

main()
  .catch((err) => {
    // Last-resort guard — never throw out of the process.
    console.error(`unexpected: ${err && err.message ? err.message : err}`);
  })
  .finally(() => {
    process.exitCode = process.exitCode || 0;
  });
