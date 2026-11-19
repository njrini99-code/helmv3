// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextPrecedence, stylesToWarm, warmOneStyle } from '../use-warm-styles';

function link(attrs: Record<string, string>): HTMLLinkElement {
  const el = document.createElement('link');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.head.appendChild(el);
  return el;
}

afterEach(() => {
  document.head.innerHTML = '';
});

describe('use-warm-styles (F-26)', () => {
  it('lists the style hints whose stylesheet is not in the document yet, once each, in order', () => {
    link({ rel: 'stylesheet', href: '/_next/static/chunks/shell.css', 'data-precedence': 'next' });
    link({ rel: 'preload', as: 'style', href: '/_next/static/chunks/shell.css' });
    link({ rel: 'preload', as: 'style', href: '/_next/static/chunks/rounds.css' });
    link({ rel: 'preload', as: 'style', href: '/_next/static/chunks/hub.css', crossorigin: 'anonymous' });
    link({ rel: 'preload', as: 'style', href: '/_next/static/chunks/rounds.css' });
    expect(stylesToWarm(document)).toEqual([{ href: '/_next/static/chunks/rounds.css' }, { href: '/_next/static/chunks/hub.css', crossOrigin: 'anonymous' }]);
  });

  it('warms only Next build stylesheets, never a font, a script or another site', () => {
    link({ rel: 'preload', as: 'font', href: '/_next/static/media/a.woff2' });
    link({ rel: 'preload', as: 'script', href: '/_next/static/chunks/a.js' });
    link({ rel: 'preload', as: 'style', href: 'https://fonts.example.com/a.css' });
    link({ rel: 'preload', as: 'style', href: '/other/a.css' });
    expect(stylesToWarm(document)).toEqual([]);
  });

  it('puts each sheet in place through React with the precedence Next uses, one per call and never twice', () => {
    link({ rel: 'stylesheet', href: '/_next/static/chunks/shell.css', 'data-precedence': 'next' });
    link({ rel: 'preload', as: 'style', href: '/_next/static/chunks/rounds.css' });
    link({ rel: 'preload', as: 'style', href: '/_next/static/chunks/hub.css' });
    const insert = vi.fn();
    const tried = new Set<string>();
    expect(warmOneStyle(document, tried, insert)).toBe(true);
    expect(insert).toHaveBeenLastCalledWith('/_next/static/chunks/rounds.css', { as: 'style', precedence: 'next' });
    // React has not inserted it (a mocked insert): it is not asked for again.
    expect(warmOneStyle(document, tried, insert)).toBe(true);
    expect(insert).toHaveBeenLastCalledWith('/_next/static/chunks/hub.css', { as: 'style', precedence: 'next' });
    expect(warmOneStyle(document, tried, insert)).toBe(false);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("reads Next's precedence from a sheet already in place, and falls back to Next's production name", () => {
    expect(nextPrecedence(document)).toBe('next');
    link({ rel: 'stylesheet', href: '/a.css', 'data-precedence': 'app' });
    link({ rel: 'stylesheet', href: '/b.css', 'data-precedence': 'next_static/chunks' });
    expect(nextPrecedence(document)).toBe('next_static/chunks');
  });
});
