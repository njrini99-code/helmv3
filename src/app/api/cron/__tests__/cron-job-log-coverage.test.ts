import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CRON_REGISTRY } from '@/lib/admin/cron-registry';

describe('cron job-log coverage', () => {
  it('every registered cron route calls recordJobRun', () => {
    const missing = CRON_REGISTRY.map((e) => e.path)
      .map((p) => join(process.cwd(), 'src/app', p, 'route.ts'))
      .filter((file) => !readFileSync(file, 'utf8').includes('recordJobRun('));
    expect(missing).toEqual([]);
  });
});
