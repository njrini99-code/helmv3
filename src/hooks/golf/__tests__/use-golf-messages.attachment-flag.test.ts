/**
 * An attachment-bearing message must arrive from the DATABASE carrying the
 * flag that triggers attachment signing.
 *
 * Reported in the team chat: "Can't see pics."
 *
 * `MessageThreadPane` only calls `getGolfMessageAttachments` for messages
 * whose `has_attachments` is truthy. The thread fetch in `use-golf-messages`
 * did not select that column, so every message loaded from the database had
 * `has_attachments === undefined`, the filter dropped it, the signing request
 * never fired, and `MessageAttachments` returned null — an empty bubble where
 * a photo should be.
 *
 * It presented as intermittent rather than broken because the realtime INSERT
 * handler takes `payload.new`, which is the full row and DOES carry the flag.
 * So the image was visible to whoever had the thread open at the moment it
 * arrived, and gone for everyone who opened the conversation afterwards —
 * including the sender, which is why it read as "the app lost my picture"
 * rather than "the app never asked for it".
 *
 * Asserted structurally, on the source, for the same reason the sibling
 * single-load test is: the bug IS the select string. A behavioural test would
 * need a full Supabase + storage-signing harness and would still be pinning
 * this exact shape.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HOOK = 'src/hooks/golf/use-golf-messages.ts';
const PANE = 'src/components/fairway/pages/messages/MessageThreadPane.tsx';

const hookSource = readFileSync(join(process.cwd(), HOOK), 'utf-8');
const paneSource = readFileSync(join(process.cwd(), PANE), 'utf-8');

/** The thread fetch: the `golf_messages` select bounded to 200 rows. */
function threadSelect(): string {
  const from = hookSource.indexOf(".from('golf_messages')");
  expect(from).toBeGreaterThan(-1);
  const select = hookSource.indexOf('.select(', from);
  expect(select).toBeGreaterThan(-1);
  const end = hookSource.indexOf(')', select);
  return hookSource.slice(select, end);
}

describe('useGolfMessages — the thread fetch carries has_attachments', () => {
  it('selects has_attachments on the thread query', () => {
    expect(threadSelect()).toContain('has_attachments');
  });

  it('still selects the columns the thread already depended on', () => {
    // Guards against a future "tidy the select" edit quietly dropping one of
    // these the way has_attachments was dropped.
    const select = threadSelect();
    for (const column of [
      'id',
      'conversation_id',
      'sender_id',
      'content',
      'created_at',
      'is_deleted',
      'edited_at',
    ]) {
      expect(select).toContain(column);
    }
  });
});

describe('MessageThreadPane — the flag is what gates attachment signing', () => {
  it('gates the attachment fetch on has_attachments', () => {
    // This is the consumer that makes the column load-bearing. If this filter
    // is ever rewritten to not depend on the flag, the select assertion above
    // stops protecting anything and should be revisited rather than kept as
    // decoration.
    expect(paneSource).toContain('has_attachments');
    expect(paneSource).toContain('getGolfMessageAttachments');
  });
});
