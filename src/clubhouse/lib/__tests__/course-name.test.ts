import { describe, expect, it } from 'vitest';
import { tidyCourseName } from '../course-name';

describe('tidyCourseName', () => {
  it('reads one way however it was typed', () => {
    expect(tidyCourseName('pine lakes')).toBe('Pine Lakes');
    expect(tidyCourseName('Pine lakes')).toBe('Pine Lakes');
    expect(tidyCourseName('  Pine   Lakes ')).toBe('Pine Lakes');
    expect(tidyCourseName('PINE LAKES CC')).toBe('Pine Lakes CC');
  });

  it('leaves what was written on purpose', () => {
    expect(tidyCourseName('Jekyll Island GC - Pine Lakes')).toBe('Jekyll Island GC - Pine Lakes');
    expect(tidyCourseName('Pinehurst No. 8')).toBe('Pinehurst No. 8');
    expect(tidyCourseName('McCabe Field')).toBe('McCabe Field');
    expect(tidyCourseName('country club of the south')).toBe('Country Club of the South');
    expect(tidyCourseName('dell-wood')).toBe('Dell-Wood');
  });

  it('is empty for nothing', () => {
    expect(tidyCourseName(null)).toBe('');
    expect(tidyCourseName('   ')).toBe('');
  });
});
