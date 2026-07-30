/**
 * seed-target-guard.ts — "did you mean to write HERE?" for the baseball seeds.
 *
 * `--confirm` answers "did you mean to write?". It does NOT answer "did you
 * mean to write HERE" — and that second question is the dangerous one. Seed
 * scripts read their target from NEXT_PUBLIC_SUPABASE_URL, so a stale
 * .env.local, a copied shell, or a `vercel env pull` from the wrong project
 * silently redirects a full seed (auth users, a fake org, password
 * force-resets, scoped DELETEs) into someone else's database.
 *
 * ⚠️ THE PRODUCTION REF IS A DENY, NOT AN ALLOW. An earlier version of this
 * guard treated `qmnssrrolpinvwjjnufo` as the expected demo project and let it
 * through on `--confirm` alone. That ref is PRODUCTION — the same one
 * `.env.local` points at, and the same one scripts/seed-baseball-stats.mjs:85
 * and scripts/seed-baseball-box-scores.mjs:36 both REFUSE by name. A guard that
 * allowlists the one target it exists to protect is worse than no guard,
 * because it reads as protection.
 *
 * The rules, in order:
 *   - A local stack (127.0.0.1 / localhost / the explicit loopback set) ->
 *     allowed. Nothing outside the machine can be hurt.
 *   - PRODUCTION -> refused unless `--allow-prod` is given. Same escape hatch,
 *     same name, as the sibling seed scripts.
 *   - ANY other project -> refused unless the operator types that project's own
 *     ref back via `--allow-project=<ref>` (or
 *     BASEBALL_DEMO_SEED_ALLOW_PROJECT_REF). Naming it is the point: you cannot
 *     hit a foreign project by accident, only on purpose.
 *
 * WHY THIS IS A MODULE AND NOT A COPY IN EACH SCRIPT: it started as ~130 lines
 * inline in scripts/seed-baseball-demo.ts, which meant
 * scripts/seed-baseball-e2e.ts — a script CI ran against production on every
 * push — had no guard at all. A safety rule that only one of its callers
 * enforces is not a safety rule. Extracting it also makes it executable in the
 * unit suite: the two typo-squat classes below are now asserted by behaviour
 * (scripts/lib/__tests__/seed-target-guard.test.ts) rather than by grepping the
 * source for the string "HELM_PROD_PROJECT_REF".
 *
 * The ref below is NOT a credential. It is the public sub-domain of
 * NEXT_PUBLIC_SUPABASE_URL, a value every browser that loads the app already
 * has, committed for the same reason the sibling scripts commit it: a guard that
 * lives in an env var is absent exactly when the env is wrong.
 */

export const HELM_PROD_PROJECT_REF = 'qmnssrrolpinvwjjnufo';

/**
 * Hostnames that are unambiguously this machine.
 *
 * `.local` is NOT accepted as a suffix. `https://totally-not-ours.local` is a
 * routable mDNS name on the operator's LAN, not loopback — trusting the suffix
 * meant any host on the network could be seeded silently.
 */
const LOCAL_SUPABASE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
  '::1',
  'host.docker.internal',
  'kong',
  'localhost.local',
]);

/** Domains under which the first hostname label really is a Supabase project ref. */
const SUPABASE_DOMAINS = ['.supabase.co', '.supabase.in', '.supabase.net'];

export interface SeedTarget {
  host: string;
  /** Supabase project ref (first label), '' when the host is local or unrecognised. */
  ref: string;
  isLocal: boolean;
}

export function describeSeedTarget(rawUrl: string): SeedTarget {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    // An unparseable URL cannot be proven safe, so it is treated as foreign.
    return { host: rawUrl, ref: '', isLocal: false };
  }
  if (LOCAL_SUPABASE_HOSTS.has(host)) {
    return { host, ref: '', isLocal: true };
  }
  // The first label is only a project ref if the host is actually a Supabase
  // domain. Without this check `https://<prodref>.example.invalid` resolved to
  // the production ref and was waved through — a typo-squat or an internal
  // proxy sharing the first label was trusted on the strength of a substring.
  const domain = SUPABASE_DOMAINS.find((d) => host.endsWith(d));
  if (!domain) {
    return { host, ref: '', isLocal: false };
  }
  return { host, ref: host.slice(0, host.length - domain.length), isLocal: false };
}

/** What the caller is allowed to do, and what it should tell the operator. */
export type SeedTargetDecision =
  | { allowed: true; warning?: string }
  | { allowed: false; message: string };

export interface SeedTargetPermission {
  /** True when the caller passed `--allow-prod`. */
  allowProd: boolean;
  /** The project ref the caller named back, from `--allow-project=<ref>` or env. */
  allowProjectRef?: string;
  /** One line naming the destructive things this seed does, for the refusal text. */
  destructiveWarning: string;
  /** Script path used in the copy-pasteable remediation commands. */
  scriptPath: string;
}

/**
 * Pure decision function — no process.exit, no console. Returns whether this
 * run may WRITE to `target`, and the text to print either way.
 *
 * Separated from `assertWriteTargetAllowed` so the rules can be tested by
 * calling them, which is the whole reason the two typo-squat regressions below
 * are now covered:
 *   - `https://<prodref>.example.invalid` must NOT resolve to the prod ref
 *   - `https://totally-not-ours.local` must NOT count as loopback
 */
export function decideSeedTarget(
  target: SeedTarget,
  permission: SeedTargetPermission,
): SeedTargetDecision {
  if (target.isLocal) return { allowed: true };

  if (target.ref === HELM_PROD_PROJECT_REF) {
    if (permission.allowProd) {
      return {
        allowed: true,
        warning: `  ⚠ SEEDING PRODUCTION (${target.ref}) — allowed only because --allow-prod was passed.`,
      };
    }
    return {
      allowed: false,
      message: [
        '',
        'REFUSING TO SEED — the target Supabase project is PRODUCTION.',
        '',
        `  NEXT_PUBLIC_SUPABASE_URL host : ${target.host}`,
        `  resolved project ref          : ${target.ref}`,
        '',
        permission.destructiveWarning,
        '',
        'Seed a local stack instead (supabase start), or, if you genuinely mean',
        'production, say so explicitly:',
        `  ... ${permission.scriptPath} --confirm --allow-prod`,
        '',
      ].join('\n'),
    };
  }

  const acknowledged = (permission.allowProjectRef ?? '').trim();
  if (target.ref && acknowledged && acknowledged === target.ref) {
    return {
      allowed: true,
      warning: `  ⚠ writing to Supabase project "${target.ref}" — allowed only because you named it explicitly.`,
    };
  }

  return {
    allowed: false,
    message: [
      '',
      'REFUSING TO SEED — the target is neither a local stack nor a project you named.',
      '',
      `  NEXT_PUBLIC_SUPABASE_URL host : ${target.host}`,
      `  resolved project ref          : ${target.ref || '(not a recognised Supabase host)'}`,
      '',
      permission.destructiveWarning,
      '',
      target.ref
        ? [
            'If this really is the project you want, name it back to the script:',
            `  ... ${permission.scriptPath} --confirm --allow-project=${target.ref}`,
          ].join('\n')
        : [
            'The host is not a *.supabase.co project, so no ref could be resolved and',
            'nothing can be verified about it. Point NEXT_PUBLIC_SUPABASE_URL at a local',
            'stack or a real Supabase project.',
          ].join('\n'),
      '',
    ].join('\n'),
  };
}

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

function readFlagValue(argv: readonly string[], flag: string): string {
  const prefix = `${flag}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : '';
}

export interface AssertWriteTargetOptions {
  /** Raw NEXT_PUBLIC_SUPABASE_URL. */
  url: string;
  /** One line naming the destructive things this seed does. */
  destructiveWarning: string;
  /** Script path used in the copy-pasteable remediation commands. */
  scriptPath: string;
  /** Defaults to process.argv. */
  argv?: readonly string[];
  /** Defaults to BASEBALL_DEMO_SEED_ALLOW_PROJECT_REF. */
  allowProjectRefFromEnv?: string;
}

/** Exits non-zero unless this run is allowed to WRITE to `url`'s project. */
export function assertWriteTargetAllowed(options: AssertWriteTargetOptions): SeedTarget {
  const argv = options.argv ?? process.argv;
  const target = describeSeedTarget(options.url);
  const decision = decideSeedTarget(target, {
    allowProd: hasFlag(argv, '--allow-prod'),
    allowProjectRef:
      readFlagValue(argv, '--allow-project') ||
      options.allowProjectRefFromEnv ||
      (process.env.BASEBALL_DEMO_SEED_ALLOW_PROJECT_REF ?? ''),
    destructiveWarning: options.destructiveWarning,
    scriptPath: options.scriptPath,
  });

  if (!decision.allowed) {
    console.error(decision.message);
    process.exit(1);
  }
  if (decision.warning) console.warn(decision.warning);
  return target;
}
