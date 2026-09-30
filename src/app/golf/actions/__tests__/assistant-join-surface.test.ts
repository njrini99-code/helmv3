import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * The assistant-coach join must stay OFF the server-action surface.
 *
 * It writes with the service role for whatever user id it is handed. While it
 * was exported from actions/teams.ts ('use server') it was callable without a
 * session. It now lives in src/lib/golf/assistant-join.ts behind `server-only`
 * and signup passes it the id auth.signUp returned. These checks are static
 * on purpose: any export from a 'use server' file is an endpoint, whether or
 * not anything in the app calls it.
 */

const ROOT = path.resolve(__dirname, '../../../../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const EXPORTS_JOIN = /export\s+(?:async\s+)?(?:function|const|let|var)\s+joinTeamAsAssistantCoach\b|export\s*\{[^}]*\bjoinTeamAsAssistantCoach\b[^}]*\}/;

function listUseServerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === '__tests__' || name === 'node_modules') continue;
    if (statSync(full).isDirectory()) {
      out.push(...listUseServerFiles(full));
    } else if (/\.(ts|tsx)$/.test(name)) {
      const src = readFileSync(full, 'utf8');
      if (/^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use server['"]/.test(src)) out.push(full);
    }
  }
  return out;
}

describe('assistant join is not a callable server action', () => {
  it('actions/teams.ts does not export joinTeamAsAssistantCoach', () => {
    const src = read('src/app/golf/actions/teams.ts');
    expect(src.startsWith("'use server'")).toBe(true);
    expect(src).not.toMatch(EXPORTS_JOIN);
  });

  it("no 'use server' file under src/app exports it", () => {
    const offenders = listUseServerFiles(path.join(ROOT, 'src/app')).filter((file) =>
      EXPORTS_JOIN.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('the implementation is server-only and not itself a server action', () => {
    const src = read('src/lib/golf/assistant-join.ts');
    expect(src.startsWith("import 'server-only';")).toBe(true);
    expect(src).not.toMatch(/^\s*['"]use server['"]/m);
  });

  it('signup passes the id from its own auth.signUp result', () => {
    const src = read('src/app/golf/actions/auth.ts');
    expect(src).toMatch(/from '@\/lib\/golf\/assistant-join'/);
    expect(src).toMatch(/joinTeamAsAssistantCoach\(\s*data\.user\.id,/);
  });
});
