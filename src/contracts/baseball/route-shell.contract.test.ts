import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BASEBALL_NAV_REGISTRY } from '@/lib/baseball/nav-registry';

const repo = process.cwd();
const read = (path: string) => readFileSync(join(repo, path), 'utf8');

describe('Baseball route/shell contracts (#374)', () => {
  it('nav registry ids are unique and hrefs stay under dashboard', () => {
    const ids = BASEBALL_NAV_REGISTRY.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of BASEBALL_NAV_REGISTRY) {
      expect(item.href.startsWith('/baseball/')).toBe(true);
    }
  });

  it('shell layout revalidates persisted auth before protected routes (#416)', () => {
    const src = read('src/app/baseball/(dashboard)/layout.tsx');
    expect(src).toContain('useBaseballAuth');
    expect(src).toContain('authorized');
  });

  it('legacy pages use ReadModelStateNotice for explicit load failures (#413)', () => {
    for (const path of [
      'src/app/baseball/(dashboard)/dashboard/announcements/page.tsx',
      'src/app/baseball/(dashboard)/dashboard/travel/page.tsx',
      'src/app/baseball/(dashboard)/dashboard/camps/page.tsx',
    ]) {
      const src = read(path);
      expect(src).toContain('ReadModelStateNotice');
    }
  });
});

describe('Baseball business-trust contracts (#377)', () => {
  it('stats center read model exposes trust envelopes', () => {
    const src = read('src/lib/baseball/read-models/stats-center.ts');
    expect(src).toContain('authorized');
    expect(src).toContain('error');
  });

  it('import preview/commit paths enforce disabled-source guard (#407)', () => {
    const imports = read('src/app/baseball/actions/imports.ts');
    const eventImports = read('src/app/baseball/actions/stat-event-imports.ts');
    expect(imports).toContain('assertImportSourceAllowed');
    expect(eventImports).toContain('assertImportSourceAllowed');
  });
});
