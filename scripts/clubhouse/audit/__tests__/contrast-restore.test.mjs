// The contrast probes hide the page's text (or icons) for one screenshot and put it back. Putting it back must not run the
// page's own colour transitions: on 13 Nov they faded every button from transparent to its colour after the probe, and axe,
// run next, failed CoachHelm's buttons mid-fade (F-0008, the map's stations). The hide is lifted with transitions off.
import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { measureContrast, measureNonText } from '../contrast.mjs';

/** A 1x1 RGBA PNG, what the probes decode from a screenshot. */
function png() {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0, 255, 255, 255, 255]))), chunk('IEND', Buffer.alloc(0))]);
}

/** A page that records which style tags are live at each removal. */
function fakePage() {
  const live = new Set();
  const removals = [];
  return {
    removals,
    live,
    evaluate: async (fn) => { const src = String(fn); if (src.includes('devicePixelRatio')) return 1; return []; },
    screenshot: async () => png(),
    addStyleTag: async ({ content }) => {
      const tag = { content };
      live.add(tag);
      return { evaluate: async () => { removals.push({ removed: content, liveAtRemoval: [...live].filter((t) => t !== tag).map((t) => t.content) }); live.delete(tag); } };
    },
  };
}

const hides = (r) => /transparent/.test(r.removed) && !/transition/.test(r.removed);

describe('the probes put the page back without running its transitions', () => {
  for (const [name, probe] of [['measureContrast', measureContrast], ['measureNonText', measureNonText]]) {
    it(`${name}: the hide is lifted while transitions are off, and every tag is gone after`, async () => {
      const page = fakePage();
      await probe(page, { label: 't' });
      const lift = page.removals.find(hides);
      expect(lift).toBeTruthy();
      expect(lift.liveAtRemoval.some((c) => /transition\s*:\s*none\s*!important/.test(c))).toBe(true);
      expect(page.live.size).toBe(0);
    });
  }
});
