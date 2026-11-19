'use client';

import { useSyncExternalStore } from 'react';

/**
 * What a row already shows about the page it opens, carried into that page's route skeleton (E-1, audit 2026-11-19), so
 * the push lands on real content (the player, the day, the course, the score) and only the parts the row never knew
 * wait on the server. A row sets it as it is tapped (`carryTo`); the skeleton reads it for the address now showing
 * (`useCarried`). Only what the row displays is carried, never more, and each address keeps only its last carry.
 *
 * The server never has a carry: a deep link renders the plain skeleton, and the client's first render matches it
 * (the server snapshot is null), so nothing here can cause a hydration mismatch.
 */
export interface ChCarriedRound {
  kind: 'round';
  /** The hero's kicker as the review writes it: player · day · kind of round. */
  kicker: string;
  course: string;
  score: string;
  toPar: string;
  under: boolean;
  /** The tee line, when the row showed one. */
  tee?: string | null;
  teeColor?: string | null;
  nine: boolean;
}

export type ChCarried = ChCarriedRound;

/** How many addresses are remembered: a few taps back is all a skeleton can ever need. */
const KEPT = 8;
const carried = new Map<string, ChCarried>();
const listeners = new Set<() => void>();

/** The address a carry is filed under: its path, without the query or the hash. */
export function carryKey(href: string): string {
  const path = (href.split('#')[0] ?? '').split('?')[0] ?? '';
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

/** A row being opened leaves what it shows for the page it opens. */
export function carryTo(href: string, data: ChCarried): void {
  const key = carryKey(href);
  carried.delete(key);
  carried.set(key, data);
  while (carried.size > KEPT) carried.delete(carried.keys().next().value as string);
  for (const l of listeners) l();
}

/** What was carried to `href`, if anything. */
export function carriedFor(href: string): ChCarried | null {
  return carried.get(carryKey(href)) ?? null;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The carry for the page showing at `path`, of one kind, or null (always null on the server and in the first render after it). */
export function useCarried<K extends ChCarried['kind']>(path: string | null, kind: K): Extract<ChCarried, { kind: K }> | null {
  const data = useSyncExternalStore(
    subscribe,
    () => (path ? carriedFor(path) : null),
    () => null,
  );
  return data && data.kind === kind ? (data as Extract<ChCarried, { kind: K }>) : null;
}

/** Tests only. */
export function resetCarryForTests(): void {
  carried.clear();
}
