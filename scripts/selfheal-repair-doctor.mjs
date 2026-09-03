#!/usr/bin/env node
/**
 * npm run selfheal:repair:doctor — is the Repair stage actually going to fire
 * tomorrow at 06:40, and did it actually fire today?
 *
 * Checks, each printed with a clear fix on failure:
 *   (a) the installed plist is byte-identical to the repo's tracked copy
 *   (b) the launchd job is loaded (`launchctl print` exits 0)
 *   (c) ~/.config/helm/selfheal.env exists and carries both variable NAMES
 *       this runner needs — never reads or prints a value
 *   (d) the claude binary the plist invokes resolves on disk
 *   (e) the SKILL.md the plist's prompt embeds exists
 *   (f) the plist's `-p` argument does not start with `-` or `$(` — the exact
 *       shape of the 2026-09-02 "unknown option '---'" failure, where the
 *       prompt was raw SKILL.md text (YAML frontmatter) with no leading
 *       sentence
 *   (g) the newest `selfheal-repair` heartbeat in production is fresh and not
 *       a runner-level failure
 *
 * Read-only. Never mutates the plist, launchd state, or the database.
 */
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = 'com.helm.bridge-rca-repair';
const REPO_PLIST = join(REPO_ROOT, 'config', 'launchd', `${LABEL}.plist`);
const INSTALLED_PLIST = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const SELFHEAL_ENV = join(homedir(), '.config', 'helm', 'selfheal.env');

// The Repair stage runs daily; its registry cadence is 24h and the Bridge's
// own overdue threshold is cadenceMinutes * 1.5 = 36h (src/lib/admin/selfheal-registry.ts).
// This doctor's 26h is intentionally TIGHTER than that 36h board threshold:
// this is a same-day operator check ("did last night's fire actually work"),
// not the board's more forgiving "is the loop still alive at all" question.
const FRESHNESS_HOURS = 26;

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  failures += 1;
  console.log(`  ✗ ${msg}`);
};

function expandHome(p) {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

/** Undo XML entity escaping, in the order that matters: `&amp;` LAST, so an
 * already-escaped `&lt;` never becomes a literal `<` via a second pass. */
function unescapeXml(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

console.log('selfheal repair doctor\n');

// (a) installed plist byte-identical to the repo's tracked copy
console.log('Plist installed and tracked');
if (!existsSync(REPO_PLIST)) {
  bad(`repo plist missing: ${REPO_PLIST}`);
} else if (!existsSync(INSTALLED_PLIST)) {
  bad(`not installed at ${INSTALLED_PLIST} — fix: npm run selfheal:repair:install`);
} else {
  const repoBytes = readFileSync(REPO_PLIST);
  const installedBytes = readFileSync(INSTALLED_PLIST);
  if (Buffer.compare(repoBytes, installedBytes) === 0) {
    ok('installed plist is byte-identical to config/launchd/**');
  } else {
    bad(
      `installed plist DIFFERS from the repo copy — someone edited one without the other. fix: npm run selfheal:repair:install (to make live match the repo) or commit the live copy's changes into config/launchd/`,
    );
  }
}

// (b) launchd job loaded
console.log('\nLaunchd job loaded');
const label = `gui/${process.getuid ? process.getuid() : '?'}/${LABEL}`;
try {
  execFileSync('launchctl', ['print', label], { stdio: ['ignore', 'pipe', 'pipe'] });
  ok(`${label} is loaded (launchctl print exit 0)`);
} catch (err) {
  bad(`launchctl print ${label} failed: ${err.message} — fix: npm run selfheal:repair:install`);
}

// (c) selfheal.env present with both variable names — NEVER read/print values
console.log('\nselfheal.env variable names');
if (!existsSync(SELFHEAL_ENV)) {
  bad(`${SELFHEAL_ENV} does not exist`);
} else {
  const text = readFileSync(SELFHEAL_ENV, 'utf8');
  const names = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = names.filter((n) => !new RegExp(`^${n}=`, 'm').test(text));
  if (missing.length === 0) {
    ok(`${SELFHEAL_ENV} carries both required variable names`);
  } else {
    bad(`${SELFHEAL_ENV} is missing: ${missing.join(', ')}`);
  }
}

// Parse the plist's ProgramArguments command string once — (d), (e), (f) all
// read out of it. Plain-text regex on purpose: this is a known, small,
// hand-authored plist, not arbitrary XML.
console.log('\nParsing plist command');
let commandString = null;
if (existsSync(REPO_PLIST)) {
  const xml = readFileSync(REPO_PLIST, 'utf8');
  const match = xml.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (match) {
    const strings = [...match[1].matchAll(/<string>([\s\S]*?)<\/string>/g)].map((m) => m[1]);
    // The command is the argument to `-lc` (zsh), i.e. the last <string>.
    commandString = strings.length > 0 ? unescapeXml(strings[strings.length - 1]) : null;
  }
}
if (!commandString) {
  bad('could not find a ProgramArguments command string in the repo plist to check');
} else {
  ok('parsed the ProgramArguments command string');

  // (d) claude binary resolves
  console.log('\nclaude binary resolves');
  const claudeMatch = commandString.match(/(\S*\/bin\/claude)\b/) || commandString.match(/-- (\S+claude)\b/);
  const claudePath = claudeMatch ? expandHome(claudeMatch[1]) : null;
  if (claudePath && existsSync(claudePath)) {
    ok(`${claudePath} exists`);
  } else {
    try {
      const which = execFileSync('which', ['claude'], { stdio: ['ignore', 'pipe', 'pipe'] })
        .toString()
        .trim();
      if (which) {
        ok(`claude resolves via PATH: ${which}`);
      } else {
        bad('claude binary not found on disk and `which claude` returned nothing');
      }
    } catch {
      bad(`claude binary not found: tried ${claudePath ?? '(no path parsed)'} and \`which claude\``);
    }
  }

  // (e) SKILL.md exists
  console.log('\nSKILL.md exists');
  const skillMatch = commandString.match(/cat (~?\S*SKILL\.md)/);
  const skillPath = skillMatch ? expandHome(skillMatch[1]) : null;
  if (skillPath && existsSync(skillPath)) {
    ok(`${skillPath} exists`);
  } else {
    bad(`could not find the SKILL.md path in the plist, or it does not exist (looked for ${skillPath ?? '(none parsed)'})`);
  }

  // (f) the -p argument must not start with '-' or '$(' — the exact shape of
  // the "unknown option '---'" failure (raw SKILL.md text, starting with YAML
  // frontmatter, passed with no leading sentence).
  console.log('\n-p argument does not start with the frontmatter trap');
  const pMatch = commandString.match(/-p "([\s\S]*?)" --permission-mode/);
  const pValue = pMatch ? pMatch[1] : null;
  if (pValue === null) {
    bad('could not find a `-p "..." --permission-mode` argument in the plist command');
  } else {
    const firstChar = pValue.trimStart()[0];
    if (firstChar && /[A-Za-z]/.test(firstChar)) {
      ok(`-p argument starts with a letter ('${firstChar}')`);
    } else {
      bad(
        `-p argument starts with '${firstChar}' — this is the exact "unknown option '---'" trap (SKILL.md's YAML frontmatter, or a literal command substitution, parsed as a CLI flag). The prompt must start with a plain sentence before any $(cat ...).`,
      );
    }
  }
}

// (g) newest production heartbeat is fresh and not a runner failure
console.log('\nProduction heartbeat freshness');
if (!existsSync(SELFHEAL_ENV)) {
  bad('cannot check production heartbeat — selfheal.env missing (see above)');
} else {
  const inline = `
const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.log(JSON.stringify({ error: 'missing env' })); process.exit(0); }
const c = createClient(url, key, { auth: { persistSession: false } });
(async () => {
  const { data, error } = await c
    .from('background_job_logs')
    .select('completed_at, metadata')
    .eq('job_type', 'selfheal-repair')
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) { console.log(JSON.stringify({ error: error.message })); process.exit(0); }
  console.log(JSON.stringify({ row: (data && data[0]) || null }));
})();
`;
  try {
    const out = execFileSync(
      'node',
      [`--env-file=${SELFHEAL_ENV}`, '-e', inline],
      { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    ).toString();
    const parsed = JSON.parse(out.trim().split('\n').pop());
    if (parsed.error) {
      bad(`production read failed: ${parsed.error}`);
    } else if (!parsed.row) {
      bad('no selfheal-repair heartbeat found in production at all');
    } else {
      const { completed_at: completedAt, metadata } = parsed.row;
      const ageHours = completedAt ? (Date.now() - new Date(completedAt).getTime()) / 3_600_000 : Infinity;
      const isRunnerFailure = !!(metadata && metadata.runner_failure === true);
      if (ageHours >= FRESHNESS_HOURS) {
        bad(`newest heartbeat is ${ageHours.toFixed(1)}h old (>= ${FRESHNESS_HOURS}h threshold), completed_at=${completedAt}`);
      } else if (isRunnerFailure) {
        bad(`newest heartbeat (completed_at=${completedAt}) is a runner_failure — the child exited without writing its own final heartbeat`);
      } else {
        ok(`newest heartbeat is ${ageHours.toFixed(1)}h old and not a runner failure (completed_at=${completedAt})`);
      }
    }
  } catch (err) {
    bad(`could not run the production heartbeat check: ${err.message}`);
  }
}

console.log(failures === 0 ? '\nAll clear.' : `\n${failures} issue(s) — fixes above.`);
process.exit(failures === 0 ? 0 : 1);
