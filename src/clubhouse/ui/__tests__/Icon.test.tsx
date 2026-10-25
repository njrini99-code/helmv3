import { cleanup, render } from '@testing-library/react';
import { Check } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { code, walk } from '../../__tests__/_scan';
import { Icon, iconStroke } from '../Icon';

afterEach(cleanup);

/** The drawn weight in pixels: Lucide draws in a 24-unit box scaled to `size`. */
const drawn = (size: number) => {
  const { container } = render(<Icon icon={Check} size={size} />);
  const svg = container.querySelector('svg')!;
  return (Number(svg.getAttribute('stroke-width')) * size) / Number(svg.getAttribute('viewBox')!.split(' ')[2]);
};

/** B12: an icon's line is an absolute weight on three rungs, whatever its size. */
describe('Icon stroke (B12)', () => {
  it('draws 1.5px at 15, whatever the viewBox', () => {
    expect(drawn(15)).toBeCloseTo(1.5, 5);
  });
  it('steps 1.5 to 17, 1.75 to 22, 2 above', () => {
    expect([12, 17, 20, 22, 26].map((s) => drawn(s))).toEqual([12, 17, 20, 22, 26].map((s) => iconStroke(s)).map((w) => expect.closeTo(w, 5)));
    expect([iconStroke(13), iconStroke(17), iconStroke(18), iconStroke(22), iconStroke(24)]).toEqual([1.5, 1.5, 1.75, 1.75, 2]);
  });
  it('no Clubhouse source draws a Lucide glyph outside ui/Icon', () => {
    // A file may import glyphs to hand to <Icon icon={…}>; none may render one itself.
    const raw: string[] = [];
    for (const f of walk(undefined, /\.tsx$/).filter((x) => !x.endsWith('/ui/Icon.tsx'))) {
      const src = code(f);
      const names = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g)].flatMap((m) =>
        m[1]!.split(',').map((x) => x.trim().split(/\s+as\s+/).pop()!).filter((x) => x && !x.startsWith('type ')),
      );
      for (const n of names) if (new RegExp(`<${n}[\\s/>]`).test(src)) raw.push(`${f.split('/src/clubhouse/')[1]}: <${n}>`);
    }
    expect(raw).toEqual([]);
  });
});
