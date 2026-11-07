'use client';

import type { ChMessagesApi } from '../api/types';
import { firstName } from '../model';
import { personOf } from '../person-of';

/** The three dots a row or pin swaps its preview line for (M-MSG-30). Hidden from VoiceOver as a picture; the sentence is on the wrapper. */
export function TypingMini() {
  return (
    <span className="ch-ms-typing-mini" role="img" aria-label="Typing">
      <i />
      <i />
      <i />
    </span>
  );
}

/** Two typers by name, three or more as "Several" (05's default). */
export function typersLine(api: ChMessagesApi, typers: readonly string[]): string {
  if (typers.length > 2) return "Several people are typing";
  return `${typers.map((id) => firstName(personOf(api, id)?.name ?? "Member")).join(" and ")} are typing`;
}
