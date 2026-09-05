import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'src/components/fairway/pages/messages/ConversationDetailsSheet.tsx'),
  'utf8',
);

describe('ConversationDetailsSheet flat presentation', () => {
  it('uses flat divided list sections without card actions or shadows', () => {
    expect(source).toContain("from '@/components/fairway/controls/press-target'");
    expect(source).toContain('<PressTarget');
    expect(source).not.toContain('<Button');
    expect(source).not.toContain('shadow-');
    expect(source).not.toContain('rounded-card');
  });
});
