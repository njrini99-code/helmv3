import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// W6: the change line is one style in every part, and only a real change takes a colour. The quiet ink must never cover the
// gain or loss tone (on the phone it did: "Better" and "Worse" drew in the same grey as "No clear change").
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/home.css'), 'utf8');

describe('The team’s game change line (W6)', () => {
  it.each(['ch-h-main', 'ch-hm'])('in .%s the quiet ink skips a gain or a loss', (scope) => {
    const rules = [...css.matchAll(new RegExp(`\\.${scope}\\[data-ch-crh='on'\\] \\.ch-hm-legs__c([^{]*)\\{([^}]*)\\}`, 'g'))];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, sel, body] of rules) {
      if (/\bcolor:/.test(body!)) expect(sel).toContain(':not(.is-gain, .is-loss)');
    }
  });
});
