import { describe, expect, it } from 'vitest';
import { ringOf } from '../board-image';

describe('the board picture', () => {
  it('reads a hairline ring from a computed box-shadow', () => {
    expect(ringOf('rgba(28, 27, 24, 0.14) 0px 0px 0px 0.5px')).toEqual({ color: 'rgba(28, 27, 24, 0.14)', width: 0.5 });
    expect(ringOf('rgba(28, 27, 24, 0.14) 0px 0px 0px 0.5px inset')).toEqual({ color: 'rgba(28, 27, 24, 0.14)', width: 0.5 });
  });
  it('draws no ring for none or for a soft shadow', () => {
    expect(ringOf('none')).toBeNull();
    expect(ringOf('rgba(0, 0, 0, 0.1) 0px 8px 24px 0px')).toBeNull();
  });
});
