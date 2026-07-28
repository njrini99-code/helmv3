import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(process.cwd(), 'src/app/golf/actions/admin-data.ts'),
  'utf8',
);

describe('admin platform-health RPC auth context (#893)', () => {
  it('invokes the auth.uid-gated RPC with the authenticated server client', () => {
    const block = source.match(
      /get_platform_health_stats is `RETURNS TABLE[\s\S]*?get_shot_data_quality/,
    )?.[0];

    expect(block).toBeDefined();
    expect(block).toMatch(/supabase\.rpc\.bind\(supabase\)/);
    expect(block).not.toMatch(/createAdminClient\(\)/);
    expect(block).toMatch(/if \(res\.error\)/);
  });
});
