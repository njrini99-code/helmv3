'use client';

import { useEffect, useRef, useState } from 'react';
import { generateRoundRecap } from '@/app/golf/actions/round-recap';

/**
 * The round's recap, written after the review opens when none is stored yet: the same lifecycle step as the Fairway
 * round page (`recapPending`, then `generateRoundRecap` once from the browser of a viewer who opened the round). Until
 * 2026-10-17 Clubhouse only read `golf_rounds.ai_recap`, so a round posted and reviewed in Clubhouse never got one.
 *
 * The server action is idempotent (a stored recap comes back as it is, and a single-flight lock stops two viewers both
 * writing one), so the ref only keeps one mounted screen from asking twice (React StrictMode's second effect). It is
 * keyed on the round and never reset, as Fairway's is. A failure is quiet: the recap is additive, the action logs its
 * own failures, and the next visit asks again because nothing was stored.
 */
export function useRoundRecap(roundId: string, stored: string | null, pending: boolean): string | null {
  const [written, setWritten] = useState<{ id: string; text: string } | null>(null);
  const askedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!pending || stored) return undefined;
    if (askedFor.current === roundId) return undefined;
    askedFor.current = roundId;
    // No cleanup flag: StrictMode's second pass returns early above, so a flag cleared by the first pass's cleanup would
    // drop the only answer. An answer for a round no longer shown is ignored by the id check below.
    generateRoundRecap(roundId)
      .then((result) => {
        const text = result.recap?.trim();
        if (text) setWritten({ id: roundId, text });
      })
      .catch(() => {});
    return undefined;
  }, [roundId, stored, pending]);

  return stored ?? (written?.id === roundId ? written.text : null);
}
