/**
 * Seeded randomness and stable ids for the demo generator.
 *
 * Everything the generator makes is a pure function of (seed, key): the same
 * seed and key give the same number, the same draw and the same uuid on every
 * run, on every machine. Each entity derives its own stream from its own key,
 * so adding a round on one day never shifts the numbers of any other round.
 *
 * Pure: no I/O. `node:crypto` is used only for SHA-1, which is deterministic.
 */
import { createHash } from 'node:crypto';

/** A namespace for every demo id, so a demo id can never equal an id minted elsewhere by the same scheme. */
const ID_NAMESPACE = 'helm.golf.demo-generator';

/** A version-5-shaped uuid from a key: SHA-1 of namespace and key, with the version and variant bits set. */
export function stableUuid(seed: string, key: string): string {
  const h = createHash('sha1').update(`${ID_NAMESPACE}\u0000${seed}\u0000${key}`).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x50;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 32-bit hash of a string (FNV-1a), the seed for a stream. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A small seeded stream (mulberry32) with the draws the generator needs. */
export class Rng {
  private state: number;

  constructor(seed: string, key: string) {
    this.state = hash32(`${seed}|${key}`) || 0x9e3779b9;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Integer in [lo, hi], both ends included. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /** Normal draw (Box-Muller). */
  normal(mean = 0, sd = 1): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** One element of a non-empty list. */
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** One element by weight; weights need not sum to 1. */
  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [item, w] of items) {
      r -= w;
      if (r < 0) return item;
    }
    return items[items.length - 1]![0];
  }
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
