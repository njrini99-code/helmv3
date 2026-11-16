import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * GAP-R-14: a write revalidates the Clubhouse page that shows it, never an old Fairway address that only redirects
 * (a config redirect in next.config.mjs, or a layout that sends each role on with redirectToClubhouse). Revalidating a
 * redirect refreshes nothing, so the page that does show the data stayed stale until the next navigation.
 */
// A computed specifier, so check:cycles (madge) does not walk from this test into next.config.mjs's build-only imports.
const NEXT_CONFIG_URL = pathToFileURL(join(process.cwd(), 'next.config.mjs')).href;
const ACTIONS = join(process.cwd(), 'src/app/golf/actions');
const DASHBOARD = join(process.cwd(), 'src/app/golf/(dashboard)/dashboard');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Every literal revalidatePath target under the golf actions, with a `${x}` or `[x]` segment as `:param`. */
function targets(): Array<{ at: string; path: string }> {
  return files(ACTIONS).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, i) => [...line.matchAll(/revalidatePath\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => ({ at: `${relative(process.cwd(), file)}:${i + 1}`, path: m[1]!.replace(/\$\{[^}]+\}|\[[^\]]+\]/g, ':param') }))),
  );
}

/** Addresses whose layout only sends each role on (redirectToClubhouse): /intelligence, /team. */
function aliasLayouts(): string[] {
  return readdirSync(DASHBOARD)
    .filter((name) => {
      try {
        return readFileSync(join(DASHBOARD, name, 'layout.tsx'), 'utf8').includes('redirectToClubhouse(');
      } catch {
        return false;
      }
    })
    .map((name) => `/golf/dashboard/${name}`);
}

describe('golf writes revalidate Clubhouse addresses (GAP-R-14)', () => {
  it('no action revalidates an address that only redirects', async () => {
    const { default: config } = (await import(NEXT_CONFIG_URL)) as { default: { redirects: () => Promise<Array<{ source: string; has?: unknown }>> } };
    const redirected = new Set([...(await config.redirects()).filter((r) => !r.has).map((r) => r.source.replace(/:\w+/g, ':param')), ...aliasLayouts()]);
    expect(redirected.has('/golf/dashboard/documents')).toBe(true);
    expect(redirected.has('/golf/dashboard/intelligence')).toBe(true);
    const stale = targets().filter((t) => redirected.has(t.path));
    expect(stale).toEqual([]);
  });
});
