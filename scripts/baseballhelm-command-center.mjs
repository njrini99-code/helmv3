#!/usr/bin/env node
/**
 * BaseballHelm Command Center — live server + SSE event broadcast
 *
 * Serves the command-center UI from tools/baseballhelm-command-center/ and
 * exposes HTTP APIs for build events, state aggregate, and Claude hooks.
 * Broadcasts events to connected SSE clients + persists to events.ndjson.
 */

import { createServer } from "node:http";
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, extname } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CC_DIR = resolve(ROOT, "tools/baseballhelm-command-center");
const ULTRA_DIR = resolve(ROOT, ".ultracode", "baseballhelm");
const STATE_PATH = resolve(ULTRA_DIR, "state.json");
const EVENTS_PATH = resolve(ULTRA_DIR, "events.ndjson");

// Auto-discover free port (4877–4897)
const PORT_START = 4877;
const PORT_MAX = 4897;

let sseClients = [];

/* ================================================================ HTTP Server */

async function startServer() {
  // Ensure .ultracode/baseballhelm exists
  await mkdir(ULTRA_DIR, { recursive: true });

  const server = createServer(async (req, res) => {
    const { pathname, searchParams } = new URL(req.url || "/", "http://localhost");

    // CORS
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    /* ============================================================= /api/state */
    if (pathname === "/api/state" && req.method === "GET") {
      try {
        const raw = await readFile(STATE_PATH, "utf8").catch(() => "{}");
        res.setHeader("content-type", "application/json");
        res.writeHead(200);
        res.end(raw);
      } catch (e) {
        res.writeHead(500);
        res.end("{}");
      }
      return;
    }

    /* ================================================================ /api/events */
    if (pathname === "/api/events") {
      if (req.method === "GET") {
        // SSE client connection
        res.setHeader("content-type", "text/event-stream");
        res.setHeader("cache-control", "no-cache");
        res.setHeader("connection", "keep-alive");
        res.writeHead(200);

        // Send all prior events
        try {
          const raw = await readFile(EVENTS_PATH, "utf8").catch(() => "");
          const lines = raw
            .split("\n")
            .filter((l) => l.trim())
            .map((l) => {
              try {
                return JSON.parse(l);
              } catch {
                return null;
              }
            })
            .filter(Boolean);
          for (const evt of lines) {
            res.write(`data: ${JSON.stringify(evt)}\n\n`);
          }
        } catch {
          /* skip */
        }

        sseClients.push(res);
        const idx = sseClients.length - 1;
        req.on("close", () => {
          sseClients[idx] = null;
        });
        return;
      }

      if (req.method === "POST") {
        // Append event + broadcast
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", async () => {
          try {
            const evt = JSON.parse(body);
            // Persist
            await appendFile(EVENTS_PATH, JSON.stringify(evt) + "\n", "utf8");
            // Broadcast to all SSE clients
            for (let i = 0; i < sseClients.length; i++) {
              const c = sseClients[i];
              if (c && !c.destroyed) {
                c.write(`data: ${JSON.stringify(evt)}\n\n`);
              }
            }
            res.setHeader("content-type", "application/json");
            res.writeHead(200);
            res.end(JSON.stringify(evt));
          } catch (e) {
            res.writeHead(400);
            res.end("{}");
          }
        });
        return;
      }
    }

    /* ========================================================== /hooks/claude */
    if (pathname === "/hooks/claude" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body);
          // Wrap as event and persist
          const evt = {
            id: `evt-${Date.now().toString(36)}-${Math.random()
              .toString(36)
              .slice(2, 8)}`,
            ts: new Date().toISOString(),
            source: "hook",
            type: "hook",
            agent: "claude-code",
            packet: "",
            title: "Claude hook",
            detail: "",
            severity: "info",
            raw: payload,
          };
          await appendFile(EVENTS_PATH, JSON.stringify(evt) + "\n", "utf8");
          // Broadcast
          for (const c of sseClients) {
            if (c && !c.destroyed) c.write(`data: ${JSON.stringify(evt)}\n\n`);
          }
          res.setHeader("content-type", "application/json");
          res.writeHead(200);
          res.end(JSON.stringify(evt));
        } catch {
          res.writeHead(400);
          res.end("{}");
        }
      });
      return;
    }

    /* ============================================================= Static files */
    let filePath = pathname === "/" ? "/index.html" : pathname;
    filePath = resolve(CC_DIR, filePath.slice(1)); // Remove leading /

    // Security: don't serve outside CC_DIR
    if (!filePath.startsWith(CC_DIR)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    try {
      if (filePath.endsWith("/")) filePath += "index.html";
      const data = await readFile(filePath, "utf8");
      const ext = extname(filePath);
      const ct = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
      }[ext] || "text/plain";
      res.setHeader("content-type", ct);
      res.setHeader("cache-control", "no-store");
      res.writeHead(200);
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  // Find free port
  for (let p = PORT_START; p <= PORT_MAX; p++) {
    try {
      await new Promise((resolve, reject) => {
        const s = server.listen(p, "127.0.0.1", () => {
          const url = `http://127.0.0.1:${p}`;
          console.log(`✓ Command center running on ${url}`);
          console.log(`  Public: http://192.168.1.20:${p}`);
          console.log(`  Agent Floor: ${url}/#agent-floor`);

          // Write state
          writeFile(
            STATE_PATH,
            JSON.stringify(
              {
                product: "BaseballHelm",
                url,
                started_at: new Date().toISOString(),
                port: p,
              },
              null,
              2
            )
          ).catch(() => {});

          s.close();
          resolve();
        });
        s.on("error", reject);
        setTimeout(() => {
          s.close();
          reject(new Error("timeout"));
        }, 500);
      });
      // Port was free; use it for real
      return new Promise((resolve) => {
        server.listen(p, "127.0.0.1", () => {
          const url = `http://127.0.0.1:${p}`;
          console.log(`✓ Command center running on ${url}`);
          console.log(`  Agent Floor: ${url}/#agent-floor`);
          writeFile(
            STATE_PATH,
            JSON.stringify(
              {
                product: "BaseballHelm",
                url,
                started_at: new Date().toISOString(),
                port: p,
              },
              null,
              2
            )
          ).catch(() => {});
          resolve();
        });
      });
    } catch {
      /* try next port */
    }
  }

  throw new Error("No free ports in range 4877–4897");
}

startServer().catch((e) => {
  console.error("Server failed to start:", e.message);
  process.exitCode = 1;
});
