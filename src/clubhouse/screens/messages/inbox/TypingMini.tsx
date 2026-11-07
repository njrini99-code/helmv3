'use client';

import type { ChMessagesApi } from '../api/types';
import { firstName } from '../model';
import { personOf } from '../person-of';

/**
 * The three dots a row or pin swaps its preview line for (MOT-LIST-5). A picture to VoiceOver, with the sentence as its
 * label: "Maya is typing", "Maya and Owen are typing", "Several people are typing" (Q-12: dots only, drawn the same for
 * any number of typers). The loop and its Reduce Motion hold are in messages-inbox.css.
 */
export function TypingMini({ label = 'Typing' }: { label?: string }) {
  return (
    <span className="ch-ms-typing-mini" role="img" aria-label={label}>
      <i />
      <i />
      <i />
    </span>
  );
}

/** Who is typing, by first name: one, two ("A and B"), or three or more as "Several people". */
export function typingLabel(api: ChMessagesApi, typers: readonly string[]): string {
  if (typers.length > 2) return 'Several people are typing';
  const names = typers.map((id) => firstName(personOf(api, id)?.name ?? 'Someone'));
  return names.length === 1 ? `${names[0]} is typing` : `${names.join(' and ')} are typing`;
}
