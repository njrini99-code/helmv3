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
