import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GOLF_QUICK_REACTIONS } from '@/lib/golf/message-reactions';

describe('golf message reaction server boundary', () => {
  it('keeps UI constants out of the use-server action module', () => {
    const actionSource = readFileSync(
      resolve(process.cwd(), 'src/app/golf/actions/message-reactions.ts'),
      'utf8',
    );

    expect(actionSource).not.toMatch(/^export const GOLF_QUICK_REACTIONS/m);
    expect(GOLF_QUICK_REACTIONS).toEqual(['👍', '❤️', '😂', '👀', '✅']);
  });
});
