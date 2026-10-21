import { describe, expect, it } from 'vitest';
import { countFile, regressions } from '../any-ratchet.mjs';

describe('any-ratchet', () => {
  it('counts explicit any in annotations, assertions, arrays and generics', () => {
    const text = [
      'const a: any = 1;',
      'const b = x as any;',
      'const c: any[] = [];',
      'const d: Map<string, any> = new Map();',
      'function f(p: any): any { return p; }',
    ].join('\n');
    expect(countFile('x.ts', text).explicitAny).toBe(6);
  });

  it('does not count the word any in strings, comments or identifiers', () => {
    const text = ["// any value", "const s = 'any';", 'const anything = 1;'].join('\n');
    expect(countFile('x.ts', text).explicitAny).toBe(0);
  });

  it('detects fromUntyped imports, including multi-line and aliased ones', () => {
    expect(countFile('x.ts', "import { fromUntyped } from '@/lib/supabase/untyped';").fromUntyped).toBe(1);
    expect(countFile('x.ts', "import {\n  fromUntyped as fu,\n} from '@/lib/supabase/untyped';").fromUntyped).toBe(1);
    expect(countFile('x.ts', "import { other } from '@/lib/supabase/untyped';").fromUntyped).toBe(0);
  });

  it('reports only the counts that grew past the baseline', () => {
    const baseline = { $comment: 'x', fromUntyped: 10, explicitAny: 20 };
    expect(regressions({ fromUntyped: 10, explicitAny: 20 }, baseline)).toEqual([]);
    expect(regressions({ fromUntyped: 9, explicitAny: 5 }, baseline)).toEqual([]);
    expect(regressions({ fromUntyped: 11, explicitAny: 20 }, baseline)).toEqual(['fromUntyped: 11 > baseline 10']);
  });
});
