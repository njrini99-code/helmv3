import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Row } from '../parts';

// G8 (preview grade): on a desk "Current email" and its address sat at opposite ends of a wide row. The row now reads
// as the New email field under it does: the label, then the value under it.
afterEach(cleanup);
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/settings.css'), 'utf8');
const account = readFileSync(join(process.cwd(), 'src/clubhouse/screens/settings/Account.tsx'), 'utf8');

describe('G8 the current email reads under its label', () => {
  it('a stacked row marks itself, and the usual row does not', () => {
    const { container } = render(
      <>
        <Row label="Current email" stack>
          <span className="ch-set-value">coach@school.edu</span>
        </Row>
        <Row label="Version">
          <span className="ch-set-value">1.0</span>
        </Row>
      </>,
    );
    const rows = container.querySelectorAll('.ch-set-row');
    expect(rows[0]!.classList.contains('is-stack')).toBe(true);
    expect(rows[1]!.classList.contains('is-stack')).toBe(false);
  });

  it('stacks in a column from the left', () => {
    const rule = css.match(/\.ch-set-row\.is-stack \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('flex-direction: column');
    expect(rule).toContain('align-items: flex-start');
  });

  it('Account uses it for the current email', () => {
    expect(account).toContain('<Row label="Current email" stack>');
  });
});
