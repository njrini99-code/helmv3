/**
 * Shared argument guard for scripts that hold credentials.
 *
 * WHY THIS EXISTS
 * ---------------
 * `scripts/README.md` used to tell people to "read a script's header comment
 * first" because several scripts acted the moment they were launched: a bare
 * `node scripts/send-coach-batch.mjs` posted live email through Resend. That
 * is the wrong default for a file that holds a service-role key. This module
 * gives every credentialed script the same three behaviours:
 *
 *   --help / -h   print what the script does and exit 0 BEFORE the script
 *                 reads env files, builds a client or awaits anything
 *   dry run       the default for a script that writes: it reports what it
 *                 would write and writes nothing
 *   --apply       the only way to make a writing script write
 *
 * Call it as the FIRST executable statement after the imports. ES imports are
 * hoisted, so imports of `dotenv` or a Supabase client still load, but nothing
 * in this repo's scripts reads credentials or opens a connection at import
 * time. Keep it that way.
 *
 * Scripts that already carry their own guard (`--confirm`, `--allow-prod`,
 * `--dry-run` with a target check) keep it unchanged and use
 * `helpOnly()` for the `--help` text alone: their write semantics are not
 * this module's business, and CI (`seed:baseball:ci`) depends on them.
 */

/**
 * @typedef {object} CliSpec
 * @property {string} name        script path as run, e.g. "scripts/run-sql.mjs"
 * @property {string} summary     one or two sentences: what it does and to what
 * @property {string} [usage]     argument synopsis after the script name
 * @property {Array<[string, string]>} [options]  [flag, description] pairs
 * @property {boolean} [writes]   true when the script writes anywhere shared
 * @property {string} [secrets]   env vars it reads, for the help text
 * @property {string} [guard]     for a script with its OWN write guard: how it is gated
 */

/**
 * Parse argv against a spec. Pure: no process access, so it is unit-testable.
 *
 * @param {string[]} argv  arguments after the script name
 * @param {CliSpec} spec
 * @returns {{ help: boolean, apply: boolean, dryRun: boolean, positional: string[], error: string | null }}
 */
export function parseCli(argv, spec) {
  const writes = spec.writes !== false;
  const help = argv.includes('--help') || argv.includes('-h');
  const wantsApply = argv.includes('--apply');
  const wantsDry = argv.includes('--dry-run');
  const positional = argv.filter((a) => !a.startsWith('-'));
  let error = null;
  if (writes && wantsApply && wantsDry) {
    error = '--apply and --dry-run contradict each other; pass one.';
  }
  const apply = writes && wantsApply && !wantsDry;
  return { help, apply, dryRun: writes && !apply, positional, error };
}

/**
 * The help text. Pure so the wording is testable.
 *
 * @param {CliSpec} spec
 * @returns {string}
 */
export function formatHelp(spec) {
  const writes = spec.writes !== false;
  const lines = [`${spec.name}`, '', spec.summary.trim(), '', `Usage: ${spec.name}${spec.usage ? ` ${spec.usage}` : ''}${writes ? ' [--apply]' : ''}`];
  if (writes) {
    lines.push(
      '',
      'Default is a DRY RUN: it prints what it would write and writes nothing.',
      'Pass --apply to perform the write.',
    );
  } else if (spec.guard) {
    lines.push('', `Writes are gated by: ${spec.guard}`);
  } else {
    lines.push('', 'Read-only: it never writes to a database, mailbox or payment account.');
  }
  if (spec.options?.length) {
    lines.push('', 'Options:');
    const width = Math.max(...spec.options.map(([flag]) => flag.length));
    for (const [flag, description] of spec.options) lines.push(`  ${flag.padEnd(width)}  ${description}`);
  }
  lines.push('', `  ${'--help, -h'.padEnd(Math.max(9, ...(spec.options ?? []).map(([f]) => f.length)))}  Show this text and exit.`);
  if (spec.secrets) lines.push('', `Reads credentials from: ${spec.secrets}`);
  return lines.join('\n');
}

/**
 * Guard a script. Exits 0 on --help and 2 on contradictory flags; otherwise
 * returns the parsed mode.
 *
 * @param {CliSpec} spec
 * @param {{ argv?: string[], out?: (s: string) => void, err?: (s: string) => void, exit?: (code: number) => never }} [io]
 */
export function cliGuard(spec, io = {}) {
  const argv = io.argv ?? process.argv.slice(2);
  const out = io.out ?? ((s) => console.log(s));
  const err = io.err ?? ((s) => console.error(s));
  const exit = io.exit ?? ((code) => process.exit(code));
  const parsed = parseCli(argv, spec);
  if (parsed.help) {
    out(formatHelp(spec));
    exit(0);
  }
  if (parsed.error) {
    err(`${spec.name}: ${parsed.error}`);
    exit(2);
  }
  return parsed;
}

/** `--help` only, for a script that is read-only or keeps its own write guard. */
export function helpOnly(spec, io) {
  return cliGuard({ ...spec, writes: false }, io);
}

/**
 * Print the standard dry-run line. Call it where the script would have written.
 *
 * @param {{ apply: boolean }} cli
 * @param {string} what  e.g. "send 10 emails" or "execute 42 SQL statements"
 * @param {(s: string) => void} [log]
 * @returns {boolean} true when the caller must NOT write
 */
export function skipWrite(cli, what, log = (s) => console.log(s)) {
  if (cli.apply) return false;
  log(`[dry-run] would ${what}. Re-run with --apply to do it.`);
  return true;
}

// ---------------------------------------------------------------------------
// Dry-run Supabase client
// ---------------------------------------------------------------------------

const WRITE_VERBS = new Set(['insert', 'update', 'upsert', 'delete']);
const AUTH_ADMIN_WRITES = new Set(['createUser', 'deleteUser', 'updateUserById', 'inviteUserByEmail', 'generateLink']);
const STORAGE_READS = new Set(['getPublicUrl', 'download', 'list', 'createSignedUrl', 'createSignedUrls', 'exists', 'info']);

/** A chainable, awaitable stand-in for a write that did not happen. */
function fakeWrite(verb, table, payload, log) {
  const rows = Array.isArray(payload) ? payload : payload && typeof payload === 'object' ? [payload] : [];
  const label = `${verb} ${rows.length ? `${rows.length} row(s) ` : ''}${verb === 'insert' || verb === 'upsert' ? 'into' : verb === 'delete' ? 'from' : 'in'} ${table}`;
  log(`  [dry-run] would ${label}`);
  let single = false;
  const result = () => {
    const synthetic = rows.map((row, i) => ({ id: `dry-run-${table}-${i + 1}`, ...row }));
    return { data: single ? (synthetic[0] ?? { id: `dry-run-${table}-1` }) : synthetic, error: null, count: rows.length, status: 200, statusText: 'dry-run' };
  };
  const chain = new Proxy(function chained() {}, {
    get(_t, prop) {
      if (prop === 'then') return (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
      if (prop === 'single' || prop === 'maybeSingle') {
        return () => {
          single = true;
          return chain;
        };
      }
      return () => chain; // .select() .eq() .in() .match() ... all no-ops
    },
  });
  return chain;
}

/**
 * Wrap a supabase-js client so a dry run can execute a script's whole read
 * path and print every write it WOULD make, without sending any. Reads pass
 * through untouched. Inserts, updates, upserts, deletes, rpc calls, auth admin
 * mutations and storage writes resolve to a synthetic success.
 *
 * Returns the client unchanged when `cli.apply` is true.
 *
 * @template T
 * @param {T} client
 * @param {{ apply: boolean }} cli
 * @param {(s: string) => void} [log]
 * @returns {T}
 */
export function dryRunClient(client, cli, log = (s) => console.log(s)) {
  if (cli.apply) return client;
  const guardAuth = (auth) =>
    new Proxy(auth, {
      get(target, prop) {
        if (prop === 'admin') {
          return new Proxy(target.admin, {
            get(admin, name) {
              if (AUTH_ADMIN_WRITES.has(String(name))) {
                return async (arg) => {
                  log(`  [dry-run] would call auth.admin.${String(name)}${arg?.email ? ` for ${arg.email}` : ''}`);
                  return { data: { user: { id: 'dry-run-user', email: arg?.email ?? null } }, error: null };
                };
              }
              return Reflect.get(admin, name);
            },
          });
        }
        return Reflect.get(target, prop);
      },
    });
  const guardStorage = (storage) =>
    new Proxy(storage, {
      get(target, prop) {
        if (prop !== 'from') return Reflect.get(target, prop);
        return (bucket) =>
          new Proxy(target.from(bucket), {
            get(b, name) {
              if (STORAGE_READS.has(String(name))) return Reflect.get(b, name).bind(b);
              return async (path) => {
                log(`  [dry-run] would storage ${String(name)} ${bucket}/${typeof path === 'string' ? path : ''}`);
                return { data: { path: typeof path === 'string' ? path : null }, error: null };
              };
            },
          });
      },
    });
  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'from') {
        return (table) =>
          new Proxy(target.from(table), {
            get(builder, verb) {
              if (WRITE_VERBS.has(String(verb))) return (payload) => fakeWrite(String(verb), table, payload, log);
              const value = Reflect.get(builder, verb);
              return typeof value === 'function' ? value.bind(builder) : value;
            },
          });
      }
      if (prop === 'rpc') {
        return (name) => {
          log(`  [dry-run] would call rpc ${name}`);
          return fakeWrite('rpc', name, null, () => {}); // silent: already logged
        };
      }
      if (prop === 'auth') return guardAuth(target.auth);
      if (prop === 'storage') return guardStorage(target.storage);
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
