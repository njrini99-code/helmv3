/**
 * The UI dev tools check behind `npm run doctor -- --ui`: every tool an agent or Nick needs to look at, measure and test
 * screens, with what it is for (its tier, `.claude/rules/browsers.md`), whether it works on this machine right now, and the
 * one fix. Read-only: it runs version commands and reads file names, never changes a setting, and prints no secret.
 *
 * Status words: AVAILABLE (works now), NOT CONNECTED (installed but not signed in or not attached), MISSING (not
 * installed; the fix installs it), NEEDS NICK (only Nick can do it: a cable, a Safari setting, a sign-in, a decision).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const run = (cmd, args, timeout = 20_000) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout }).trim();
const tryRun = (cmd, args, timeout) => { try { return run(cmd, args, timeout); } catch { return null; } };
const pkgVersion = (repo, name) => { try { return JSON.parse(readFileSync(join(repo, 'node_modules', name, 'package.json'), 'utf8')).version; } catch { return null; } };

/** Pure: the browser revisions Playwright wants against the folders installed. */
export function browserStatus(wanted, installedDirs) {
  return wanted.map(({ name, revision, browserVersion }) => {
    const dir = `${name.replace(/-/g, '_')}-${revision}`;
    const ok = installedDirs.includes(dir);
    return { name, revision, browserVersion, ok };
  });
}

/** Pure: `claude mcp list` lines → { name: 'connected' | 'needs-auth' | 'failed' }. */
export function parseMcpList(text) {
  const out = {};
  for (const line of String(text).split('\n')) {
    const m = /^(.+?):\s.*?-\s*(✓|✔|!|✗|×)\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const state = m[2] === '✓' || m[2] === '✔' ? 'connected' : m[2] === '!' ? 'needs-auth' : 'failed';
    out[m[1].trim()] = state;
  }
  return out;
}

/** Pure: free disk space in GB → a status. Sweeps, builds and WebKit swap need room; under 10 GB runs fail mid-way. */
export function diskStatus(freeGb) {
  if (freeGb < 10) return { status: 'NEEDS NICK', detail: `${freeGb.toFixed(1)} GB free: a dev server plus WebKit filled the disk twice on 15 Nov`, fix: 'npm run worktrees:park (parks idle worktrees, about 4 GB each), then empty the Trash' };
  if (freeGb < 25) return { status: 'AVAILABLE', detail: `${freeGb.toFixed(1)} GB free: enough for one sweep at a time`, fix: '' };
  return { status: 'AVAILABLE', detail: `${freeGb.toFixed(1)} GB free`, fix: '' };
}

/** Pure: which Supabase project an env file's URL names, as a word (never the URL or a key). */
export function envTarget(text) {
  const m = /^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^"'\s]+)/m.exec(String(text));
  if (!m) return 'unset';
  if (/qmnssrrolpinvwjjnufo/.test(m[1])) return 'production';
  if (/ybmwektreyrwjscxlogv/.test(m[1])) return 'staging';
  if (/127\.0\.0\.1|localhost/.test(m[1])) return 'local';
  return 'other';
}

export function checkUiTools(repo) {
  const rows = [];
  const add = (tool, use, status, detail, fix = '') => rows.push({ tool, use, status, detail, fix });
  const mac = platform() === 'darwin';

  // Browsers Playwright drives (tiers W and C).
  try {
    const { browsers } = JSON.parse(readFileSync(join(repo, 'node_modules/playwright-core/browsers.json'), 'utf8'));
    const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || (mac ? join(homedir(), 'Library/Caches/ms-playwright') : join(homedir(), '.cache/ms-playwright'));
    const dirs = existsSync(cache) ? readdirSync(cache) : [];
    for (const b of browserStatus(browsers.filter((x) => ['webkit', 'chromium'].includes(x.name)), dirs)) {
      const tier = b.name === 'webkit' ? 'W: every phone screen' : 'C: desk, traces, Lighthouse';
      if (b.ok) add(`Playwright ${b.name} ${b.browserVersion}`, tier, 'AVAILABLE', `revision ${b.revision}, Playwright ${pkgVersion(repo, 'playwright') ?? '?'}`);
      else add(`Playwright ${b.name}`, tier, 'MISSING', `revision ${b.revision} not in ${cache}`, `npx playwright install ${b.name}`);
    }
  } catch {
    add('Playwright', 'W and C', 'MISSING', 'node_modules has no playwright-core', 'npm ci');
  }
  const axe = pkgVersion(repo, '@axe-core/playwright');
  add('axe (accessibility rules)', 'W and C', axe ? 'AVAILABLE' : 'MISSING', axe ? `@axe-core/playwright ${axe}` : 'not installed', 'npm ci');
  const ibm = pkgVersion(repo, 'accessibility-checker-engine');
  add('IBM Equal Access (second rule engine)', 'W', ibm ? 'AVAILABLE' : 'MISSING', ibm ? `accessibility-checker-engine ${ibm}` : 'optional; found 2 of 5 a11y issues axe missed on 13 Nov', 'npm i -D accessibility-checker-engine@4.0.35 (free, no browser download)');
  const lh = pkgVersion(repo, 'lighthouse');
  add('Lighthouse', 'C only, public pages', lh ? 'AVAILABLE' : 'MISSING', lh ? `lighthouse ${lh}; never lhci autorun (uploads to public storage)` : 'not installed', 'npm ci');

  if (mac) {
    // Real Safari (tier S).
    const sd = tryRun('/usr/bin/safaridriver', ['--version']);
    add('Safari + safaridriver (Safari MCP)', 'S: real Safari, INP and LCP', sd ? 'AVAILABLE' : 'MISSING', sd ?? 'safaridriver not found', 'update macOS / Safari');
    const remote = tryRun('defaults', ['read', 'com.apple.Safari', 'AllowRemoteAutomation']);
    if (remote !== '1') add('Safari remote automation', 'S', 'NEEDS NICK', remote == null ? 'cannot read the setting from here' : 'off', 'Safari > Settings > Advanced > Show features for web developers; then Developer > Allow remote automation and external agents');
    // Simulator (tier S) and the real iPhone (tier D).
    const xc = tryRun('xcodebuild', ['-version']);
    add('Xcode', 'S and D', xc ? 'AVAILABLE' : 'MISSING', xc ? xc.split('\n')[0] : 'not installed', 'install Xcode from the App Store');
    const sims = tryRun('xcrun', ['simctl', 'list', 'devices', 'available', '-j']);
    if (sims) {
      const devs = Object.values(JSON.parse(sims).devices).flat();
      const phones = devs.filter((d) => /iPhone/.test(d.name));
      add('iOS Simulator', 'S: safe areas, keyboard, Text Size, 60 fps video', phones.length ? 'AVAILABLE' : 'MISSING', `${phones.length} iPhone simulators, ${devs.filter((d) => d.state === 'Booted').length} booted`, 'Xcode > Settings > Platforms > iOS');
    }
    const dev = tryRun('xcrun', ['devicectl', 'list', 'devices'], 30_000);
    const phone = dev && dev.split('\n').some((l) => /iPhone/.test(l) && /connected|available/i.test(l) && !/unavailable/i.test(l));
    add('Real iPhone (cabled)', 'D: the only proof of smoothness and feel', phone ? 'AVAILABLE' : 'NEEDS NICK', phone ? 'connected' : 'no iPhone attached', 'cable and unlock the iPhone; trust this Mac; then scripts/phone/wda-start.sh');
    const appium = tryRun('appium', ['--version']);
    const drivers = appium ? tryRun('appium', ['driver', 'list', '--installed', '--json'], 30_000) : null;
    const xcuitest = drivers ? /xcuitest/.test(drivers) : false;
    add('Appium + XCUITest', 'S and D: Simulator Safari, real taps', appium && xcuitest ? 'AVAILABLE' : 'MISSING', appium ? `appium ${appium}${xcuitest ? ', xcuitest installed' : ', no xcuitest driver'}` : 'not installed', 'npm i -g appium && appium driver install xcuitest');
    const maestro = tryRun('maestro', ['--version']);
    add('Maestro', 'S and D: scripted app flows', maestro ? 'AVAILABLE' : 'MISSING', maestro ?? 'optional', 'brew install maestro');
  }

  // MCP servers agents use, and their sign-in.
  const mcp = tryRun('claude', ['mcp', 'list'], 90_000);
  if (mcp) {
    const st = parseMcpList(mcp);
    const want = [
      ['playwright-webkit', 'W for agents'],
      ['playwright', 'C for agents'],
      ['chrome-devtools', 'C traces for agents'],
      ['safari-native', 'S for agents'],
      ['supabase-staging-ro', 'staging numbers for audits'],
    ];
    for (const [name, use] of want) {
      const s = st[name];
      if (!s) add(`MCP ${name}`, use, 'MISSING', 'not configured in this checkout', 'see .mcp.json');
      else if (s === 'connected') add(`MCP ${name}`, use, 'AVAILABLE', 'connected');
      else if (s === 'needs-auth') add(`MCP ${name}`, use, 'NEEDS NICK', 'needs sign-in', 'in Claude: /mcp, pick it, Authenticate');
      else add(`MCP ${name}`, use, 'NOT CONNECTED', 'failed to start', 'claude mcp get ' + name);
    }
    const sentry = Object.entries(st).find(([n]) => /sentry/i.test(n));
    if (sentry) add('Sentry connector', 'real users: errors, replays, rage and dead clicks', sentry[1] === 'connected' ? 'AVAILABLE' : 'NEEDS NICK', sentry[1], 'in Claude: /mcp, claude.ai Sentry, Authenticate (project-scoped)');
  } else {
    add('MCP servers', 'agents', 'NOT CONNECTED', '`claude mcp list` did not answer', 'run it in a terminal to see why');
  }
  try {
    const user = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8')).mcpServers ?? {};
    if (user['playwright-webkit']) add('User-scope playwright-webkit', 'none: shadowed by the project entry', 'NEEDS NICK', 'a second, older entry in ~/.claude.json wants browser builds that are not installed', 'claude mcp remove -s user playwright-webkit');
  } catch { /* no user config */ }

  // Signing in without a password, and where local servers point.
  const staged = existsSync(join(repo, '.auth')) ? readdirSync(join(repo, '.auth')).filter((f) => /^staging-.*\.json$/.test(f)) : [];
  add('Staging demo sessions', 'signed-in W and C on staging', staged.length ? 'AVAILABLE' : 'NOT CONNECTED', staged.length ? staged.join(', ') : 'none minted', 'npx supabase login, then node scripts/clubhouse/audit/session.mjs --role coach --base <staging preview>');
  for (const f of ['.env.local', '.env.development.local']) {
    const p = join(repo, f);
    if (!existsSync(p)) continue;
    const t = envTarget(readFileSync(p, 'utf8'));
    if (t === 'production') add(`${f} database`, 'local dev servers', 'NEEDS NICK', 'points at production, so a local signed-in check would write real data', 'decision: point it at staging (AGENTS.md "Database")');
    else add(`${f} database`, 'local dev servers', 'AVAILABLE', t);
  }

  // Room to work.
  try {
    const kb = Number(run('df', ['-k', repo]).split('\n')[1].split(/\s+/)[3]);
    const d = diskStatus(kb / 1024 / 1024);
    add('Disk space', 'builds, sweeps, WebKit', d.status, d.detail, d.fix);
  } catch { /* df unavailable */ }
  return rows;
}

export function printUiTools(rows, log = console.log) {
  log('\nUI dev tools (npm run doctor -- --ui)');
  const width = Math.max(...rows.map((r) => r.tool.length));
  for (const r of rows) {
    log(`  ${r.status.padEnd(13)} ${r.tool.padEnd(width)}  ${r.detail}`);
    log(`  ${''.padEnd(13)} ${''.padEnd(width)}  for: ${r.use}${r.fix && r.status !== 'AVAILABLE' ? `\n  ${''.padEnd(13)} ${''.padEnd(width)}  fix: ${r.fix}` : ''}`);
  }
  const by = (s) => rows.filter((r) => r.status === s).length;
  log(`  ${by('AVAILABLE')} available, ${by('MISSING')} missing, ${by('NOT CONNECTED')} not connected, ${by('NEEDS NICK')} need Nick.`);
}

