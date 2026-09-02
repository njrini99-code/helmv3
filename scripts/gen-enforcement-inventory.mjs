#!/usr/bin/env node
/**
 * Generate docs/CONTROL_PLANE_ENFORCEMENT.md from the live configuration.
 *
 * WHY THIS EXISTS
 *
 * On 2026-08-29 three separate rule files claimed protections that did not
 * exist, all in the confident direction, all about operations that cannot be
 * undone:
 *
 *   .claude/rules/database.md   DROP TABLE / TRUNCATE / unqualified DELETE
 *                               "blocked by a PreToolUse hook on both the
 *                               file-write and MCP paths"     -> no such hook
 *   CLAUDE.md                   "a governed edit is BLOCKED until the session
 *                               has loaded the mapped context" -> the Stop gate
 *                               reports it afterward; nothing prevents it
 *   .claude/rules/shipping.md   "the hook is the only thing left" for recursive
 *                               rm; "rm -rf .next is blocked" -> no rm hook
 *                               exists and no deny rule covers it
 *
 * Each was written when it was true, or nearly true, and none was updated when
 * the mechanism was deleted. Prose cannot notice that. So the fix is not better
 * prose: it is to stop asserting enforcement in prose at all, and point every
 * such claim at a block regenerated from the configuration itself.
 *
 * The generated table deliberately separates:
 *
 *   CLAIM  ->  ENFORCEMENT MECHANISM  ->  CONFIG LOCATION  ->  HOW OBSERVED
 *
 * "How observed" is the column that keeps this honest. A hook being WIRED is
 * not the same as a hook that has been seen to fire, and a deny rule being
 * PRESENT is not the same as one that has been exercised. Where this generator
 * can only read configuration, it says so.
 *
 * Usage:  node scripts/gen-enforcement-inventory.mjs [--check]
 *   --check  exit 1 if the file on disk differs from what would be generated
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SETTINGS = resolve(ROOT, '.claude/settings.json');
const OUT = resolve(ROOT, 'docs/CONTROL_PLANE_ENFORCEMENT.md');

const START = '<!-- AUTOGEN:enforcement:start -->';
const END = '<!-- AUTOGEN:enforcement:end -->';

/** Hooks that can REFUSE a tool call. Everything else records or reports. */
const BLOCKING_EVENTS = new Set(['PreToolUse']);

function loadSettings() {
  return JSON.parse(readFileSync(SETTINGS, 'utf-8'));
}

/** Resolve a hook command to the script path it runs, if it names one. */
function scriptFromCommand(command) {
  const m = String(command).match(/[^\s"']*\.claude\/hooks\/[A-Za-z0-9._/-]+/);
  if (!m) return null;
  return m[0]
    .replace(/^"?\$\{?CLAUDE_PROJECT_DIR\}?"?/, '')
    .replace(/^"|"$/g, '')
    .replace(/^\/+/, '');
}

export function collectHooks(settings) {
  const rows = [];
  for (const [event, entries] of Object.entries(settings.hooks ?? {})) {
    for (const entry of entries ?? []) {
      for (const hook of entry.hooks ?? []) {
        const rel = scriptFromCommand(hook.command);
        rows.push({
          event,
          matcher: entry.matcher ?? '(all tools)',
          script: rel,
          exists: rel ? existsSync(resolve(ROOT, rel)) : null,
          blocking: BLOCKING_EVENTS.has(event),
        });
      }
    }
  }
  return rows;
}

export function collectDenies(settings) {
  const deny = settings.permissions?.deny ?? [];
  return {
    all: deny,
    mcp: deny.filter((r) => r.startsWith('mcp__')),
    bash: deny.filter((r) => r.startsWith('Bash(')),
    other: deny.filter((r) => !r.startsWith('mcp__') && !r.startsWith('Bash(')),
  };
}

/**
 * Claims this repo's prose has historically made about irreversible actions,
 * each resolved against live configuration rather than restated.
 *
 * Adding a row here is how you make a safety claim: it must name the mechanism
 * that would be searched for, and the generator decides whether it is real.
 */
function resolveClaims(hooks, denies) {
  const blockingHooks = hooks.filter((h) => h.blocking);
  const matcherCovers = (re) => blockingHooks.filter((h) => re.test(h.matcher));

  const denyMatch = (pred) => denies.all.filter(pred);

  return [
    {
      claim: 'A write into the canonical checkout via Write/Edit/MultiEdit is refused',
      resolve: () => {
        const hits = matcherCovers(/Write|Edit|MultiEdit/);
        return hits.length
          ? {
              mechanism: hits.map((h) => `${h.event} hook \`${basename(h.script ?? '?')}\``).join(', '),
              where: '.claude/settings.json → hooks.PreToolUse',
              observed: 'WIRED — matcher covers the tool names; exercised in src/test/hooks/',
            }
          : { mechanism: 'NONE', where: '—', observed: 'UNENFORCED' };
      },
    },
    {
      claim: 'A write into the canonical checkout via Bash is refused',
      resolve: () => {
        const hits = matcherCovers(/Bash/);
        return hits.length
          ? {
              mechanism: hits.map((h) => `${h.event} hook \`${basename(h.script ?? '?')}\``).join(', '),
              where: '.claude/settings.json → hooks.PreToolUse',
              observed: 'WIRED',
            }
          : {
              mechanism: 'NONE',
              where: '—',
              observed: 'UNENFORCED — no PreToolUse matcher includes Bash',
            };
      },
    },
    {
      claim: 'Destructive SQL (DROP TABLE / TRUNCATE / unqualified DELETE) is refused before it runs',
      resolve: () => {
        // Deliberately narrow. An earlier draft used /drop|truncate|delete/i and
        // matched `mcp__claude_ai_Supabase__delete_branch`, reporting CONFIGURED
        // for a claim that is UNENFORCED. A substring is not a mechanism: the
        // rule must actually name a destructive SQL verb as a SQL operation.
        const hookHits = blockingHooks.filter((h) => /sql/i.test(h.script ?? ''));
        const denyHits = denyMatch((r) => /\b(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/i.test(r));
        if (!hookHits.length && !denyHits.length) {
          return {
            mechanism: 'NONE',
            where: '—',
            observed: 'UNENFORCED — guard-sql.sh was deleted 2026-08-27',
          };
        }
        return {
          mechanism: [...hookHits.map((h) => `hook ${basename(h.script ?? '?')}`), ...denyHits].join(', '),
          where: '.claude/settings.json',
          observed: 'CONFIGURED',
        };
      },
    },
    {
      claim: 'An MCP tool call can be refused by a hook',
      resolve: () => {
        const hits = blockingHooks.filter((h) => /mcp__/.test(h.matcher));
        return hits.length
          ? { mechanism: hits.map((h) => basename(h.script ?? '?')).join(', '), where: '.claude/settings.json', observed: 'WIRED' }
          : {
              mechanism: 'NONE',
              where: '—',
              observed: 'UNENFORCED — no hook matcher mentions mcp__; permission rules are the only MCP control',
            };
      },
    },
    {
      claim: 'A recursive rm outside the project is refused',
      resolve: () => {
        const denyHits = denyMatch((r) => /\brm\b/.test(r));
        const hookHits = blockingHooks.filter((h) => /Bash/.test(h.matcher));
        if (!denyHits.length && !hookHits.length) {
          return { mechanism: 'NONE', where: '—', observed: 'UNENFORCED' };
        }
        return { mechanism: [...denyHits, ...hookHits.map((h) => basename(h.script ?? '?'))].join(', '), where: '.claude/settings.json', observed: 'CONFIGURED' };
      },
    },
    {
      claim: '`rm -rf .next` is refused',
      resolve: () => {
        const denyHits = denyMatch((r) => /\.next/.test(r));
        return denyHits.length
          ? { mechanism: denyHits.join(', '), where: '.claude/settings.json → permissions.deny', observed: 'CONFIGURED' }
          : { mechanism: 'NONE', where: '—', observed: 'UNENFORCED — advisory only (it wedges Turbopack)' };
      },
    },
    {
      claim: 'A governed edit without loaded feature context is prevented',
      resolve: () => {
        const pre = blockingHooks.filter((h) => /context|feature|governed/i.test(h.script ?? ''));
        return pre.length
          ? { mechanism: pre.map((h) => basename(h.script ?? '?')).join(', '), where: '.claude/settings.json → hooks.PreToolUse', observed: 'WIRED' }
          : {
              mechanism: 'NONE (detection only)',
              where: '.claude/settings.json → hooks.Stop',
              observed: 'POST-HOC — the Stop gate reports it after the edit; nothing prevents it',
            };
      },
    },
    {
      claim: 'The Supabase CLI migration path is refused',
      resolve: () => {
        const hits = denyMatch((r) => /supabase.*(db push|migration up|db reset|config push)/.test(r));
        return hits.length
          ? { mechanism: `${hits.length} deny rules`, where: '.claude/settings.json → permissions.deny', observed: 'CONFIGURED — fires under bypassPermissions' }
          : { mechanism: 'NONE', where: '—', observed: 'UNENFORCED' };
      },
    },
    {
      claim: 'Account-wide Supabase MCP mutation is refused',
      resolve: () => {
        const hits = denies.mcp.filter((r) => r.startsWith('mcp__claude_ai_Supabase__'));
        return hits.length
          ? {
              mechanism: `${hits.length} deny rules`,
              where: '.claude/settings.json → permissions.deny',
              observed: 'EXERCISED 2026-08-29 — the denied tools left the session tool set; list_tables still loaded',
            }
          : { mechanism: 'NONE', where: '—', observed: 'UNENFORCED' };
      },
    },
    {
      claim: 'The uninstalled Supabase plugin namespace cannot activate on install',
      resolve: () => {
        const hits = denies.mcp.filter((r) => r.startsWith('mcp__plugin_supabase_supabase'));
        return hits.length
          ? { mechanism: hits.join(', '), where: '.claude/settings.json → permissions.deny', observed: 'CONFIGURED — server-level deny' }
          : { mechanism: 'NONE', where: '—', observed: 'UNENFORCED' };
      },
    },
    {
      claim: 'Arbitrary SQL against production through MCP is refused',
      resolve: () => {
        const hits = denies.mcp.filter((r) => /execute_sql/.test(r));
        return hits.length
          ? { mechanism: hits.join(', '), where: '.claude/settings.json → permissions.deny', observed: 'CONFIGURED' }
          : {
              mechanism: 'NONE',
              where: '—',
              observed: 'UNENFORCED, KNOWINGLY — the only working query path; no read_only enforcement on it',
            };
      },
    },
    {
      claim: 'Direct psql / service-role writes to production are refused',
      resolve: () => ({
        mechanism: 'NONE',
        where: '—',
        observed: 'UNENFORCED — guard-sql.sh deleted 2026-08-27; SUPABASE_SERVICE_ROLE_KEY carries write capability',
      }),
    },
    {
      // Narrow on purpose, like the destructive-SQL matcher above: `--prod`
      // and the three verbs, not the word "vercel". `vercel env ls` and
      // `vercel inspect` are allow rules in the same file and must not be
      // counted as a production-deploy mechanism.
      claim: 'A production deploy typed as a vercel command is refused',
      resolve: () => {
        const hits = denyMatch((r) => /vercel.*(--prod|promote|rollback|alias set)/.test(r));
        return hits.length
          ? {
              mechanism: `${hits.length} deny rules`,
              where: '.claude/settings.json → permissions.deny',
              observed: 'CONFIGURED — bare, ./node_modules/.bin and npx spellings; fires under bypassPermissions',
            }
          : { mechanism: 'NONE', where: '—', observed: 'UNENFORCED' };
      },
    },
    {
      // The row this file exists for. Everything above resolves a claim by
      // finding a mechanism; this one resolves it by finding that the
      // mechanism cannot see the call. `permissions.deny` prefix-matches the
      // command the agent SUBMITS, and the wrapper submits as itself — the
      // `vercel deploy --prod --yes` it runs is a child process no rule
      // inspects. Same shape as the canonical-write row: a matcher that reads
      // what was typed rather than what will happen.
      claim: 'A production deploy run through scripts/deploy-prod.sh is refused',
      resolve: () => {
        const wrapper = 'scripts/deploy-prod.sh';
        const covered = denyMatch((r) => r.includes('deploy-prod'));
        if (covered.length) {
          return {
            mechanism: covered.join(', '),
            where: '.claude/settings.json → permissions.deny',
            observed: 'CONFIGURED — the wrapper itself is denied',
          };
        }
        // Only report the gap if the wrapper actually still runs a production
        // deploy. If someone rewrites it, this row must stop asserting.
        let runsProdDeploy = false;
        try {
          runsProdDeploy = /vercel\s+deploy\s+--prod/.test(
            readFileSync(resolve(ROOT, wrapper), 'utf8'),
          );
        } catch {
          return {
            mechanism: 'NONE',
            where: '—',
            observed: `UNKNOWN — ${wrapper} could not be read`,
          };
        }
        return runsProdDeploy
          ? {
              mechanism: 'NONE',
              where: '—',
              observed: `UNENFORCED — ${wrapper} runs \`vercel deploy --prod\` in a child process; deny rules match the submitted command, which is the script. NOT probed: the only probe is a real production deploy`,
            }
          : {
              mechanism: 'N/A',
              where: '—',
              observed: `N/A — ${wrapper} no longer runs a production deploy`,
            };
      },
    },
  ].map((c) => ({ claim: c.claim, ...c.resolve() }));
}

/**
 * Escape a value for a markdown table cell.
 *
 * Backslashes FIRST, then the delimiter. Escaping only `|` is incomplete: a
 * value containing a literal backslash before a pipe becomes `\\|` — an
 * escaped backslash followed by an UNescaped pipe — which silently ends the
 * cell and shifts every column after it. Flagged by CodeQL
 * (js/incomplete-sanitization) on the first run of this file. The input here is
 * repo-controlled config rather than user data, so the practical risk is a
 * mangled table, not an injection; it is still wrong, and a table that lies
 * about its own columns is exactly what this file exists not to produce.
 */
export function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

export function renderBlock() {
  const settings = loadSettings();
  const hooks = collectHooks(settings);
  const denies = collectDenies(settings);
  const claims = resolveClaims(hooks, denies);

  const L = [];
  L.push('');
  L.push('## Hooks, as wired');
  L.push('');
  L.push('| Event | Matcher | Script | On disk | Can refuse a call |');
  L.push('| --- | --- | --- | --- | --- |');
  for (const h of hooks) {
    L.push(
      `| ${esc(h.event)} | \`${esc(h.matcher)}\` | \`${esc(h.script ?? '(inline)')}\` | ${
        h.exists === null ? 'n/a' : h.exists ? 'yes' : '**MISSING**'
      } | ${h.blocking ? 'yes' : 'no — records/reports only'} |`,
    );
  }
  const blocking = hooks.filter((h) => h.blocking);
  L.push('');
  L.push(
    blocking.length === 1
      ? `Exactly one hook can refuse a tool call: \`${basename(blocking[0].script ?? '?')}\` under matcher \`${blocking[0].matcher}\`. Every other wired hook observes.`
      : `${blocking.length} hooks can refuse a tool call.`,
  );
  L.push('');
  L.push('## Permission rules');
  L.push('');
  L.push(`| Kind | Count |`);
  L.push(`| --- | --- |`);
  L.push(`| \`permissions.deny\` total | ${denies.all.length} |`);
  L.push(`| …covering \`mcp__\` | ${denies.mcp.length} |`);
  L.push(`| …covering \`Bash(\` | ${denies.bash.length} |`);
  L.push(`| …other | ${denies.other.length} |`);
  L.push('');
  L.push('Deny rules fire even under `bypassPermissions`, and a project-scope');
  L.push('deny overrides a user-scope allow (probed 2026-08-29).');
  L.push('');
  L.push('## Claims, resolved against the configuration above');
  L.push('');
  L.push('| Claim | Mechanism | Config location | How observed |');
  L.push('| --- | --- | --- | --- |');
  for (const c of claims) {
    L.push(`| ${esc(c.claim)} | ${esc(c.mechanism)} | ${esc(c.where)} | ${esc(c.observed)} |`);
  }
  L.push('');
  return L.join('\n');
}

function render() {
  const header = `<!-- markdownlint-disable MD013 -->

# Control-plane enforcement inventory

**Generated. Do not hand-edit between the AUTOGEN markers** —
\`node scripts/gen-enforcement-inventory.mjs\` rewrites them from
\`.claude/settings.json\` and the hook scripts on disk.

This file exists because prose could not notice a mechanism being deleted. On
2026-08-29 three rule files claimed protections that no longer existed, all
about irreversible operations. The rules now point here instead of asserting
enforcement themselves.

Read the last column carefully. These are **not** synonyms:

| | meaning |
| --- | --- |
| CONFIGURED | a rule or hook is declared |
| WIRED | it is attached to an event whose matcher can reach the tool |
| EXERCISED | it has actually been observed to fire |
| UNENFORCED | nothing in this repo's configuration stops it |

A generator can establish the first two. It cannot establish the third, so
EXERCISED is only claimed where a specific observation is named.

**Scope:** this reads PROJECT configuration only. User-global
\`~/.claude/settings.json\` can add capability that this file cannot see, and
its \`autoMode\` prose currently repeats a stale claim sourced from this repo —
see \`.claude/rules/database.md\`.

${START}${'\n'}
${END}
`;
  return header;
}

function build() {
  const existing = existsSync(OUT) ? readFileSync(OUT, 'utf-8') : render();
  const s = existing.indexOf(START);
  const e = existing.indexOf(END);
  if (s === -1 || e === -1) return render().replace(`${START}\n\n${END}`, `${START}\n${renderBlock()}\n${END}`);
  return `${existing.slice(0, s + START.length)}\n${renderBlock()}\n${existing.slice(e)}`;
}

const next = build();
if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf-8') : '';
  if (current !== next) {
    console.error('❌ docs/CONTROL_PLANE_ENFORCEMENT.md is stale.');
    console.error('   Run: node scripts/gen-enforcement-inventory.mjs && commit the result.');
    process.exit(1);
  }
  console.log('✅ enforcement inventory matches live configuration');
} else {
  writeFileSync(OUT, next);
  console.log(`wrote ${OUT.replace(`${ROOT}/`, '')}`);
}
