import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RULES_DIR = join(__dirname, '..', 'rules');

describe('composite rules', () => {
  it('never ship a hardcoded numeric sample_n in evidence', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(RULES_DIR).filter((f) => f.endsWith('.ts'))) {
      const src = readFileSync(join(RULES_DIR, file), 'utf8');
      src.split('\n').forEach((line, i) => {
        // `sample_n: 10,` is a fabricated confidence input. `sample_n: sampleN`
        // or `sample_n: Number(...)` derives it from real source evidence.
        if (/^\s*sample_n:\s*\d+\s*,?\s*$/.test(line)) {
          offenders.push(`${file}:${i + 1} → ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
