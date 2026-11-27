import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FoldRest } from '../FoldRest';

const rows = Array.from({ length: 7 }, (_, i) => `row-${i}`);
const html = (shown: number) =>
  renderToStaticMarkup(
    <ul>
      <FoldRest items={rows} shown={shown} noun="more rows">
        {(r) => <li key={r}>{r}</li>}
      </FoldRest>
    </ul>,
  );

describe('FoldRest', () => {
  it('shows the first rows in place and folds the rest, in order, behind one control', () => {
    const out = html(3);
    const [head, folded] = out.split('<details');
    expect(head).toContain('row-2');
    expect(head).not.toContain('row-3');
    expect(folded).toContain('Show 4 more rows');
    expect(folded!.indexOf('row-3')).toBeLessThan(folded!.indexOf('row-6'));
  });
  it('folds nothing when everything fits', () => {
    expect(html(7)).not.toContain('<details');
    expect(html(10)).not.toContain('<details');
  });
});
