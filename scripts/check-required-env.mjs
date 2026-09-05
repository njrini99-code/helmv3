const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

export function checkRequiredEnv(env = process.env) {
  const vercelEnv = env['VERCEL_ENV'];
  if (vercelEnv !== 'production' && vercelEnv !== 'preview') return;

  for (const key of REQUIRED) {
    if (!env[key] || !env[key].trim()) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }

  if (/placeholder\.supabase\.co/i.test(env['NEXT_PUBLIC_SUPABASE_URL'])) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL contains placeholder.supabase.co — set a real Supabase URL'
    );
  }

  // F127 (2026-09-05): setting INNGEST_EVENT_KEY puts the Inngest SDK into
  // "cloud mode" (src/lib/inngest/client.ts), and cloud mode without a
  // signing key fails every /api/inngest request — "In cloud mode but no
  // signing key found" — with no build-time signal until now. Sentry issue
  // JAVASCRIPT-NEXTJS-QC recorded five such events on 2026-09-02/03. Only
  // checked when an event key is actually present: an app that isn't using
  // Inngest at all
  // (both unset) is a legitimate, unrelated state. Production has both set
  // (vercel env ls, 2026-09-05), so this gate blocks nothing today; it exists
  // so the absent-key case can never ship again. It cannot see a WRONG value
  // (that is scripts/inngest-health-check.mjs at runtime). See
  // src/lib/inngest/credentials.ts for the full runtime-side handling and
  // supabase/migrations/HELD.md's O8 for the one-time production fix.
  if (env['INNGEST_EVENT_KEY'] && env['INNGEST_EVENT_KEY'].trim()) {
    if (!env['INNGEST_SIGNING_KEY'] || !env['INNGEST_SIGNING_KEY'].trim()) {
      throw new Error(
        'INNGEST_EVENT_KEY is set but INNGEST_SIGNING_KEY is missing — Inngest runs in ' +
          'cloud mode whenever an event key is present, and cloud mode without a signing ' +
          'key fails every /api/inngest request ("In cloud mode but no signing key found"). ' +
          'Set INNGEST_SIGNING_KEY from app.inngest.com.'
      );
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    checkRequiredEnv();
    process.stdout.write('[check-required-env] OK\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(err.message + '\n');
    process.exit(1);
  }
}
