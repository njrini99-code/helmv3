import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LedgerList, LedgerRow } from '../Ledger';
import { accessibleName, expectLabelInName, faceText } from '../../__tests__/label-in-name';

afterEach(cleanup);

/**
 * F-0011 (WCAG 2.5.3 Label in Name, axe label-content-name-mismatch): the Rounds month list and the Tournaments rows were
 * links named by an aria-label that put the words in another order than the row shows them.
 */
describe('a Ledger row that opens something is named by what it shows', () => {
  it('reads its lead, title, line and trail in order, apart, with no aria-label to disagree with them', () => {
    render(
      <LedgerList label="September 2026, 14 rounds">
        <LedgerRow lead="Sat 26 Sept" title="Dylan Brooks" meta="Home course" trail="74" href="/golf/dashboard/rounds/r1" />
      </LedgerList>,
    );
    const link = screen.getByRole('link');
    expect(link).not.toHaveAttribute('aria-label');
    expect(faceText(link)).toBe('Sat 26 Sept Dylan Brooks Home course 74');
    expect(accessibleName(link)).toBe('Sat 26 Sept Dylan Brooks Home course 74');
    expectLabelInName(link, 'Sat 26 Sept Dylan Brooks');
  });

  it('a button row the same way', () => {
    render(
      <LedgerList>
        <LedgerRow title="Practice" meta="Range, 40 balls" onClick={() => {}} />
      </LedgerList>,
    );
    expect(accessibleName(screen.getByRole('button'))).toBe('Practice Range, 40 balls');
  });

  it('a plain row keeps its name on the list item, since a plain box can’t carry one', () => {
    render(
      <LedgerList>
        <LedgerRow title="Qualifier" meta="Round 1" label="Qualifier, round 1" />
      </LedgerList>,
    );
    expect(screen.getByRole('listitem')).toHaveAttribute('aria-label', 'Qualifier, round 1');
  });
});
