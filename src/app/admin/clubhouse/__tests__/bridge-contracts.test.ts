/**
 * The Bridge numbers itself (plan §6, owner decision D4): every BR- code in br-codes.ts is listed in
 * config/bridge/contracts.json with its screen, label and what it does, and nothing else is; and every BR- code the
 * Bridge's source draws (`data-br={BR.x.y}`, a `code={BR.x.y}` prop, or a literal `data-br="BR-####"`) resolves to a
 * listed one. docs/bridge/generated/BRIDGE_UI_MAP.md is generated from the same file (clubhouse:check holds it).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BR } from '@/lib/admin/clubhouse/br-codes';

interface ContractRow {
  code: string;
  screen: string;
  key: string;
  label: string;
  does: string;
}

const root = process.cwd();
const contracts = JSON.parse(readFileSync(join(root, 'config/bridge/contracts.json'), 'utf8')) as { codes: ContractRow[] };
const listed = new Map(contracts.codes.map((r) => [r.code, r]));

const fromBr = new Map<string, string>();
for (const [group, codes] of Object.entries(BR)) {
  for (const [key, code] of Object.entries(codes as Record<string, string>)) fromBr.set(`${group}.${key}`, code);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === '__tests__' ? [] : walk(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe('config/bridge/contracts.json', () => {
  it('lists exactly the codes br-codes.ts defines, each under its own key', () => {
    const defined = new Set(fromBr.values());
    expect([...listed.keys()].filter((c) => !defined.has(c)), 'listed but not in br-codes.ts').toEqual([]);
    expect([...defined].filter((c) => !listed.has(c)), 'in br-codes.ts but not listed').toEqual([]);
    for (const [key, code] of fromBr) expect(listed.get(code)?.key, code).toBe(key);
  });

  it('every BR- code drawn under src/app/admin is listed', () => {
    const files = walk(join(root, 'src/app/admin'));
    expect(files.length).toBeGreaterThan(20);
    const missing: string[] = [];
    let seen = 0;
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\bBR\.(\w+)\.(\w+)\b/g)) {
        seen += 1;
        const code = fromBr.get(`${m[1]}.${m[2]}`);
        if (!code || !listed.has(code)) missing.push(`${relative(root, file)}: BR.${m[1]}.${m[2]}`);
      }
      for (const m of text.matchAll(/data-br=["'](BR-\d{4})["']/g)) {
        seen += 1;
        if (!listed.has(m[1]!)) missing.push(`${relative(root, file)}: ${m[1]}`);
      }
    }
    expect(seen).toBeGreaterThan(50);
    expect(missing).toEqual([]);
  });

  it('B11 and B13 carry the plan’s §8 codes', () => {
    for (const code of ['BR-1101', 'BR-1102', 'BR-1103', 'BR-1104', 'BR-1301', 'BR-1302', 'BR-1303', 'BR-1304', 'BR-1305', 'BR-1306']) {
      expect(listed.has(code), code).toBe(true);
    }
  });
});
