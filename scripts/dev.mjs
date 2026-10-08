#!/usr/bin/env node
/**
 * `npm run dev`: next dev on a port that belongs to this checkout.
 *
 *   npm run dev                   port derived from the worktree name (3001..3099);
 *                                 the canonical checkout keeps 3000
 *   PORT=3217 npm run dev         an explicit PORT wins
 *   npm run dev -- -p 3100        so does an explicit -p / --port
 *   npm run dev -- -H 0.0.0.0     other next flags pass straight through
 *
 * The chosen port is logged on the first line. If it is already taken (hash
 * collision with another worktree, or something else on the machine) the next
 * free port in range is used instead of failing, and the log says so.
 * Playwright pins PORT=3000 itself, and `npm run ios:dev` reads the same
 * function (scripts/lib/dev-port.mjs).
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devPort, nextPort, PORT_MIN } from './lib/dev-port.mjs';

const args = process.argv.slice(2);
const explicit = args.some((a) => a === '-p' || a === '--port' || a.startsWith('--port='));

function free(port) {
  return new Promise((resolveFree) => {
    const server = createServer();
    server.once('error', () => resolveFree(false));
    server.once('listening', () => server.close(() => resolveFree(true)));
    server.listen(port, '0.0.0.0');
  });
}

async function choose() {
  const first = devPort();
  if (process.env.PORT) return { port: first, note: 'from PORT' };
  if (await free(first)) return { port: first, note: first === 3000 ? 'canonical checkout' : 'from the worktree name' };
  let candidate = first;
  for (let i = 0; i < 100; i += 1) {
    candidate = candidate >= 3000 && candidate < 3100 ? nextPort(candidate) : PORT_MIN;
    if (await free(candidate)) return { port: candidate, note: `${first} was busy` };
  }
  return { port: first, note: `${first} is busy and no free port was found in range; next will pick its own` };
}

const nextArgs = ['dev', '--webpack'];
let note = 'from your -p flag';
if (!explicit) {
  const chosen = await choose();
  note = chosen.note;
  nextArgs.push('-p', String(chosen.port));
  console.error(`[dev] http://localhost:${chosen.port}  (${note})`);
} else {
  console.error(`[dev] using the port in your arguments (${note})`);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn(resolve(ROOT, 'node_modules/.bin/next'), [...nextArgs, ...args], { cwd: ROOT, stdio: 'inherit', env: process.env });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('error', (e) => {
  console.error(`[dev] could not start next: ${e.message}`);
  process.exit(127);
});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
