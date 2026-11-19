/**
 * @vitest-environment jsdom
 *
 * F-23 (audit 2026-11-19, verify after merge): a page change writes nothing on <html> or <body> when the phone edges
 * keep their colours, because each write restyles the whole document inside the section switch. The first write keeps
 * what was there before, and the unmount puts it back.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { writePhoneEdges } from '../phone-edges';

const html = () => document.documentElement;
const meta = () => document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

afterEach(() => {
  html().removeAttribute('style');
  html().removeAttribute('data-status-bar');
  document.body.removeAttribute('style');
  meta()?.remove();
});

/** Records every attribute write on <html>, <body> and the theme-color tag. */
function watchWrites(): { stop: () => MutationRecord[] } {
  const seen: MutationRecord[] = [];
  const mo = new MutationObserver((r) => seen.push(...r));
  mo.observe(html(), { attributes: true });
  mo.observe(document.body, { attributes: true });
  const tag = meta();
  if (tag) mo.observe(tag, { attributes: true });
  return { stop: () => [...seen, ...mo.takeRecords()].filter(Boolean) };
}

describe('writePhoneEdges', () => {
  it('writes the edges once, and keeps what was there for the unmount', () => {
    html().style.backgroundColor = 'rgb(1, 2, 3)';
    const edges = writePhoneEdges(null, 'rgb(232, 227, 213)', '#1f3d2b');
    expect(html().style.backgroundColor).toBe('rgb(232, 227, 213)');
    expect(document.body.style.backgroundColor).toBe('rgb(232, 227, 213)');
    expect(meta()?.content).toBe('#1f3d2b');
    expect(html().dataset.statusBar).toBe('light');
    edges.restore();
    expect(html().style.backgroundColor).toBe('rgb(1, 2, 3)');
    expect(document.body.style.backgroundColor).toBe('');
    expect(html().dataset.statusBar).toBeUndefined();
    expect(meta()).toBeNull();
  });

  it('writes nothing on a page change that keeps the colours', () => {
    const first = writePhoneEdges(null, 'rgb(232, 227, 213)', '#1f3d2b');
    const watch = watchWrites();
    const next = writePhoneEdges(first, 'rgb(232, 227, 213)', '#1f3d2b');
    expect(watch.stop()).toHaveLength(0);
    // The restore is still the first write's.
    expect(next.restore).toBe(first.restore);
  });

  it('rewrites only the page colour when a route sits on another canvas, and still restores the original', () => {
    const first = writePhoneEdges(null, 'rgb(232, 227, 213)', '#1f3d2b');
    const watch = watchWrites();
    const next = writePhoneEdges(first, 'rgb(255, 255, 255)', '#1f3d2b');
    const writes = watch.stop();
    expect(writes.every((r) => r.attributeName === 'style')).toBe(true);
    expect(html().style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(meta()?.content).toBe('#1f3d2b');
    next.restore();
    expect(html().style.backgroundColor).toBe('');
    expect(html().dataset.statusBar).toBeUndefined();
  });

  it('puts the green back when something else rewrote theme-color (a theme change)', () => {
    const first = writePhoneEdges(null, 'rgb(232, 227, 213)', '#1f3d2b');
    meta()!.content = '#ffffff';
    writePhoneEdges(first, 'rgb(232, 227, 213)', '#1f3d2b');
    expect(meta()?.content).toBe('#1f3d2b');
  });
});
