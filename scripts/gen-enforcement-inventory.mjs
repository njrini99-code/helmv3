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

/**
 * A deny rule that refuses one of the Vercel MCP's production-mutating tools,
 * under either spelling of the server segment (`mcp__claude_ai_Vercel__…` or
 * `mcp__<uuid>__…`). The whole alternation is anchored: a rule naming
 * `deploy_to_vercel_preview` or `pause_project_status` is a DIFFERENT tool and
 * must not be counted as cover for the one this claim is about. An earlier
 * spelling anchored only the last alternative, so every other one matched as
 * a substring (CodeQL js/regex/missing-regexp-anchor).
 *
 * `update_project_deployment_protection` joined the set 2026-09-02: the
 * connector file had recorded it as present under the Vercel prefix while no
 * deny rule named it. Its read twin `get_project_deployment_protection` must
 * NOT match, which the anchoring guarantees.
 *
 * Supabase also exposes `pause_project`; callers exclude that server through
 * `vercelMutatingDenyHits`, which takes the Supabase prefixes from the
 * connector file rather than carrying an id of its own.
 */
export const VERCEL_MUTATING_TOOL_RE =
  /^mcp__.+__(?:deploy_to_vercel|buy_(?:domain|pro|credits|addon)|pause_project|update_project_deployment_protection)$/;

const START = '<!-- AUTOGEN:enforcement:start -->';
const END = '<!-- AUTOGEN:enforcement:end -->';

/** Hooks that can REFUSE a tool call. Everything else records or reports. */
const BLOCKING_EVENTS = new Set(['PreToolUse']);

/**
 * A Stop hook cannot refuse a TOOL CALL, but it can refuse the END OF A TURN
 * by emitting `{"decision":"block"}`. Until 2026-09-01 this generator rendered
 * every non-PreToolUse hook as "records/reports only", which described
 * stop-verify.sh as an observer while it was pushing back on unverified work
 * once per tree state. Read the script rather than assume: a Stop hook that
 * never emits a block decision really is an observer.
 */
function stopRefusalOf(rel) {
  if (!rel) return null;
  try {
    const src = readFileSync(resolve(ROOT, rel), 'utf-8');
    return /decision"?\s*:\s*"?block/.test(src) ? 'not a tool call — refuses turn-end once per tree state (`{"decision":"block"}`)' : null;
  } catch {
    return null;
  }
}

/** Connector ids the session actually exposes, from the one file that holds them. */
function loadConnectorIds() {
  const p = resolve(ROOT, 'config/mcp-connector-ids.json');
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, 'utf-8')).connectors ?? [];
  } catch {
    return [];
  }
}

/** Every rule prefix a connector's tools can appear under: `mcp__<uuid>__` and the display name. */
function connectorPrefixes(service, connectorIds) {
  return (connectorIds ?? [])
    .filter((c) => c.service === service)
    .flatMap((c) => [typeof c.id === 'string' && c.id ? `mcp__${c.id}__` : null, c.display_name_prefix || null])
    .filter(Boolean);
}

/**
 * Deny rules that count as cover for the Vercel claim, split by spelling.
 *
 * Supabase also exposes `pause_project`, so a rule naming it under a Supabase
 * prefix is not Vercel cover. Both Supabase prefixes — the UUID the session
 * exposes and the display name — come from `connectorIds`, i.e. from
 * config/mcp-connector-ids.json, the one place the ids live. Until 2026-09-02
 * the exclusion was the literal `/Supabase|e139bbde/`: the Supabase id written
 * into this generator by hand, beside a parameter that already carried it.
 * Had that connector been re-installed and its id rotated — the connector
 * file says its stability is UNVERIFIED — the new Supabase `pause_project`
 * rule would have been counted as Vercel cover.
 */
export function vercelMutatingDenyHits(denyRules, connectorIds = loadConnectorIds()) {
  const excluded = connectorPrefixes('Supabase', connectorIds);
  const vercelIds = (connectorIds ?? [])
    .filter((c) => c.service === 'Vercel' && typeof c.id === 'string' && c.id)
    .map((c) => c.id);
  const hits = (denyRules ?? []).filter(
    (r) => VERCEL_MUTATING_TOOL_RE.test(r) && !excluded.some((p) => r.startsWith(p)),
  );
  const uuidHits = hits.filter((r) => vercelIds.some((id) => r.startsWith(`mcp__${id}__`)));
  return { hits, uuidHits };
}

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
        const blocking = BLOCKING_EVENTS.has(event);
        rows.push({
          event,
          matcher: entry.matcher ?? '(all tools)',
          script: rel,
          exists: rel ? existsSync(resolve(ROOT, rel)) : null,
          blocking,
          refusal: blocking
            ? 'yes'
            : (event === 'Stop' && stopRefusalOf(rel)) || 'no — records/reports only',
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
function resolveClaims(hooks, denies, connectorIds = loadConnectorIds()) {
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
      claim: 'Account-wide Supabase MCP mutation is refused (display-name spelling `mcp__claude_ai_Supabase__*`)',
      resolve: () => {
        const hits = denies.mcp.filter((r) => r.startsWith('mcp__claude_ai_Supabase__'));
        return hits.length
          ? {
              mechanism: `${hits.length} deny rules`,
              where: '.claude/settings.json → permissions.deny',
              observed: 'EXERCISED 2026-08-29 — the denied tools left the session tool set; list_tables still loaded. Measured 2026-09-01: no mcp__claude_ai_* name exists in the session inventory, so these rules match nothing the session can call today; kept because the spelling may return',
            }
          : { mechanism: 'NONE', where: '—', observed: 'UNENFORCED' };
      },
    },
    {
      // The spelling the session ACTUALLY exposes. Measured 2026-09-01: the
      // account connectors appear as mcp__<uuid>__<tool>, not under any
      // mcp__claude_ai_* name, so the row above covers a name that is not in
      // the inventory. The ids come from config/mcp-connector-ids.json — the
      // one place they live — and their stability across sessions is an
      // acknowledged gap, not a verified property.
      claim: 'Account-wide Supabase MCP mutation is refused (UUID spelling the session exposes)',
      resolve: () => {
        const ids = connectorIds.filter((c) => c.service === 'Supabase').map((c) => c.id);
        if (!ids.length) {
          return { mechanism: 'NONE', where: '—', observed: 'UNKNOWN — no Supabase connector id recorded in config/mcp-connector-ids.json' };
        }
        const hits = denies.mcp.filter((r) => ids.some((id) => r.startsWith(`mcp__${id}__`)));
        return hits.length
          ? {
              mechanism: `${hits.length} deny rules`,
              where: '.claude/settings.json → permissions.deny (ids: config/mcp-connector-ids.json)',
              observed: 'CONFIGURED 2026-09-01 — written against the prefix observed in that session; NOT yet observed to remove the tools; id stability across sessions UNVERIFIED (gap MCP_DENY_RULES_KEYED_ON_ROTATABLE_CONNECTOR_IDS)',
            }
          : { mechanism: 'NONE', where: '—', observed: 'UNENFORCED — the connector id is recorded but no deny rule names it' };
      },
    },
    {
      claim: 'A production deploy, purchase, pause or deployment-protection change through the Vercel MCP is refused',
      resolve: () => {
        const { hits, uuidHits } = vercelMutatingDenyHits(denies.mcp, connectorIds);
        return hits.length
          ? {
              mechanism: `${hits.length} deny rules (${uuidHits.length} under the UUID spelling)`,
              where: '.claude/settings.json → permissions.deny',
              observed: uuidHits.length
                ? 'CONFIGURED — display-name and UUID spellings; NOT probed (the only probe is a real production deploy, a purchase, or a protection change); id stability UNVERIFIED'
                : 'CONFIGURED — display-name spelling only, which measured 2026-09-01 is not in the session inventory',
            }
          : { mechanism: 'NONE', where: '—', observed: 'UNENFORCED' };
      },
    },
    {
      // Desktop Commander writes files and spawns processes from outside every
      // hook (no PreToolUse matcher reaches mcp__) and outside the Bash sandbox
      // (it is not Bash). Denied at project scope 2026-09-01. This is a NEW
      // restriction the owner can drop by deleting the rules.
      claim: 'A file write or process spawn through the Desktop Commander MCP is refused',
      resolve: () => {
        const hits = denies.mcp.filter((r) => /Desktop_Commander__|desktop-commander__/.test(r));
        return hits.length
          ? {
              mechanism: `${hits.length} deny rules`,
              where: '.claude/settings.json → permissions.deny',
              observed: 'CONFIGURED 2026-09-01 — both the account connector and plugin spellings; NOT probed. Read tools stay allowed',
            }
          : { mechanism: 'NONE', where: '—', observed: 'UNENFORCED — Desktop Commander bypasses guard-canonical-write.mjs and the Bash sandbox' };
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
      // and the two verbs, not the word "vercel". `vercel env ls` and
      // `vercel inspect` are allow rules in the same file and must not be
      // counted as a production-deploy mechanism.
      //
      // This row and the next used to be ONE row matching `alias set` as well,
      // which reported "3 deny rules — CONFIGURED" for a production deploy
      // after e5ec5e7b8 (2026-09-01) had GRANTED the deploy and kept only the
      // alias rules. A mechanism for a different claim was standing in for the
      // one that had been removed. Split so each claim resolves on its own.
      claim: 'A production deploy typed as a vercel command (`deploy --prod`, `promote`, `rollback`) is refused',
      resolve: () => {
        const hits = denyMatch((r) => /vercel.*(--prod|promote|rollback)/.test(r));
        return hits.length
          ? {
              mechanism: `${hits.length} deny rules`,
              where: '.claude/settings.json → permissions.deny',
              observed: 'CONFIGURED — fires under bypassPermissions',
            }
          : {
              mechanism: 'NONE',
              where: '—',
              observed: 'UNENFORCED, BY OWNER GRANT — e5ec5e7b8 (2026-09-01) removed these rules so scripts/deploy-prod.sh is the one sanctioned promote path; AGENTS.md still forbids a production action the user did not ask for',
            };
      },
    },
    {
      claim: 'Re-pointing the production alias (`vercel alias set`) is refused',
      resolve: () => {
        const hits = denyMatch((r) => /vercel alias set/.test(r));
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
      } | ${esc(h.refusal)} |`,
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
\`~/.claude/settings.json\` can add capability that this file cannot see. Its
\`autoMode\` prose once repeated a stale hook claim sourced from this repo;
whether that claim is present NOW is measured by
\`npm run control-plane:verify\` (\`user-global/no-stale-hook-claim\`), never
asserted here — see \`.claude/rules/database.md\`.

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

// Only the CLI entry point generates or checks; an `import` of this module (the
// unit test over VERCEL_MUTATING_TOOL_RE) must not touch the doc. Same guard as
// gen-tool-authority.mjs.
if (import.meta.url === `file://${process.argv[1]}`) {
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
}
