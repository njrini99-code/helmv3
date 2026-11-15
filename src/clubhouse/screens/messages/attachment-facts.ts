'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ChMsg } from './model';

/**
 * What a message's attachment is, ahead of signing it (MSG-220/221, Q-41): the kind, and a photo's size or a clip's length, so the
 * bubble's frame is held at its size before the file arrives. The message row carries none of it: `golf_messages.payload` holds a
 * poll's keys and nothing else, and `has_attachments` is a flag. The facts are the columns of `golf_message_attachments`
 * (`file_type` 'image' | 'video' | 'document' | 'audio'; `width`, `height`, `duration_seconds`, null where the upload did not
 * measure them), which a participant may read (RLS "view attachments in their conversations").
 */
export type AttachmentFacts = Pick<ChMsg, 'attachmentKind' | 'attachmentWidth' | 'attachmentHeight' | 'durationSeconds'>;

/** The bubble kinds: a photo draws as a picture, a video keeps its own kind (for its length), anything else is a file. */
export function attachmentKindOf(fileType: string | null | undefined): NonNullable<ChMsg['attachmentKind']> {
  return fileType === 'image' ? 'photo' : fileType === 'video' ? 'video' : 'file';
}

const positive = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

/** One message's facts from its first attachment row (rows arrive oldest first). Pure, so the mapping is tested. */
export function factsOf(row: { file_type?: string | null; width?: number | null; height?: number | null; duration_seconds?: number | null }): AttachmentFacts {
  const width = positive(row.width);
  const height = positive(row.height);
  const durationSeconds = positive(row.duration_seconds);
  return {
    attachmentKind: attachmentKindOf(row.file_type),
    ...(width && height ? { attachmentWidth: width, attachmentHeight: height } : {}),
    ...(durationSeconds ? { durationSeconds } : {}),
  };
}

/** `.in()` rides in the URL; a long thread is read in runs of this many messages. */
const CHUNK = 60;

/**
 * The facts of the open thread's attachment messages, read once per message (a message already asked about is not asked again, found
 * or not). Empty until a read lands, and on a failed one: the bubble then draws without a held frame, as before. `enabled` false
 * reads nothing.
 */
export function useAttachmentFacts(messageIds: readonly string[], enabled = true): ReadonlyMap<string, AttachmentFacts> {
  const [facts, setFacts] = useState<ReadonlyMap<string, AttachmentFacts>>(new Map());
  const asked = useRef(new Set<string>());
  // A read outlives the render that asked for it (the thread gains a message while it is out), so only an unmount drops it.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const key = useMemo(() => messageIds.join('\u0000'), [messageIds]);
  useEffect(() => {
    if (!enabled || !key) return;
    const fresh = key.split('\u0000').filter((id) => !asked.current.has(id));
    if (!fresh.length) return;
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }
    for (const id of fresh) asked.current.add(id);
    for (let i = 0; i < fresh.length; i += CHUNK) {
      void Promise.resolve(
        supabase
          .from('golf_message_attachments')
          .select('message_id, file_type, width, height, duration_seconds')
          .in('message_id', fresh.slice(i, i + CHUNK))
          .order('created_at', { ascending: true }),
      )
        .then(({ data, error }) => {
          if (!mounted.current || error || !data?.length) return;
          setFacts((prev) => {
            const next = new Map(prev);
            for (const row of data) if (!next.has(row.message_id)) next.set(row.message_id, factsOf(row));
            return next;
          });
        })
        .catch(() => undefined);
    }
  }, [key, enabled]);
  return facts;
}
