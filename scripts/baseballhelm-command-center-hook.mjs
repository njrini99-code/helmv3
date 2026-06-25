#!/usr/bin/env node
/**
 * baseballhelm-command-center-hook.mjs — Claude Code hook bridge.
 *
 * Reads the Claude hook JSON from stdin, forwards it to the running command
 * center (POST /hooks/claude). If the receiver is offline/errors, falls back to
 * appending a single JSONL line to events.ndjson (type "hook",
 * source "hook-fallback") preserving the raw payload.
 *
 * Contract: NEVER crash Claude, never block — swallow every error, always
 * exit 0 quickly. Wire this as a Claude Code hook command.
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

/* ---------------------------------------------------------------------- stdin */
function readStdin() {
  return new Promise((res) => {
    let data = "";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      res(data);
    };
    try {
      if (process.stdin.isTTY) return finish(); // no piped input
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        data += chunk;
      });
      process.stdin.on("end", finish);
      process.stdin.on("error", finish);
      // Safety: never hang on a stalled pipe.
      setTimeout(finish, 2500).unref?.();
    } catch {
      finish();
    }
  });
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
    /* fall through */
  }
  return FALLBACK_PORT;
}

/* ----------------------------------------------------------------- parse hook */
function parsePayload(raw) {
  const text = (raw || "").trim();
  if (!text) return { parse_error: true, raw: "" };
  try {
    return JSON.parse(text);
  } catch {
    return { parse_error: true, raw: text };
  }
}

/* ----------------------------------------------------------------- forwarding */
async function tryReceiver(port, payload) {
  const url = `http://127.0.0.1:${port}/hooks/claude`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------- fallback */
function makeId() {
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function appendFallback(payload) {
  const event = {
    id: makeId(),
    ts: new Date().toISOString(),
    source: "hook-fallback",
    type: "hook",
    agent: "claude-code",
    packet: "",
    title: "Claude hook (offline)",
    detail: "Command center receiver unreachable; raw hook payload preserved.",
    severity: "info",
    raw: payload,
  };
  try {
    await appendFile(EVENTS_PATH, JSON.stringify(event) + "\n", "utf8");
  } catch {
    /* swallow — must never crash Claude */
  }
}

/* ----------------------------------------------------------------------- main */
async function main() {
  let payload;
  try {
    payload = parsePayload(await readStdin());
  } catch {
    payload = { parse_error: true, raw: "" };
  }

  let port = FALLBACK_PORT;
  try {
    port = await discoverPort();
  } catch {
    /* keep default */
  }

  const delivered = await tryReceiver(port, payload);
  if (!delivered) await appendFallback(payload);
}

main()
  .catch(() => {
    /* absolute last-resort: never throw */
  })
  .finally(() => {
    process.exitCode = 0;
  });
