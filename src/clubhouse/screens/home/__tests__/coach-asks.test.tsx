import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CoachAsks } from '../CoachAsks';

// F-0074: a wrap never leaves a line ending in the separator dot: each dot travels with the part after it.
describe('From your coach', () => {
  it('puts each separator inside the part it leads, with only a plain space between parts', () => {
    const { container } = render(<CoachAsks asks={{ rsvps: 2, acks: 1, tasksDue: 4 } as never} />);
    const v = container.querySelector('.ch-ph-asks__v')!;
    const parts = [...v.querySelectorAll('.ch-ph-asks__p')].map((p) => p.textContent);
    expect(parts).toEqual(['2 replies', '· 1 to acknowledge', '· 4 tasks due']);
    const loose = [...v.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent);
    expect(loose.every((t) => !t!.includes('·'))).toBe(true);
  });
});
