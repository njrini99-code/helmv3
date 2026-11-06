'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** The part of the browser's speech API dictation uses: not in TypeScript's DOM types, and absent in the iOS app's web view. */
interface SpeechLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechCtor = new () => SpeechLike;

const ctor = (): SpeechCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const noSubscribe = () => () => {};

/**
 * The composer's mic (06 S-PANEL.composer, "dictate"): words land in the field, and the coach still sends. Where the browser has no speech API the mic isn't drawn, so it is
 * never a control that does nothing. `available` is false on the server and for the first paint, so hydration matches.
 */
export function useDictation(onWords: (words: string) => void) {
  const available = useSyncExternalStore(noSubscribe, () => !!ctor(), () => false);
  const [on, setOn] = useState(false);
  const rec = useRef<SpeechLike | null>(null);
  const latest = useRef(onWords);
  latest.current = onWords;
  const stop = useCallback(() => {
    rec.current?.stop();
    rec.current = null;
    setOn(false);
  }, []);
  const toggle = useCallback(() => {
    if (rec.current) return stop();
    const Ctor = ctor();
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = false;
    r.interimResults = false;
    r.lang = navigator.language || 'en-US';
    r.onresult = (e) => {
      const words = Array.from(e.results).map((x) => x[0]?.transcript ?? '').join(' ').trim();
      if (words) latest.current(words);
    };
    r.onend = () => {
      rec.current = null;
      setOn(false);
    };
    r.onerror = () => {
      rec.current = null;
      setOn(false);
    };
    rec.current = r;
    setOn(true);
    r.start();
  }, [stop]);
  useEffect(() => stop, [stop]);
  return { available, on, toggle, stop };
}
