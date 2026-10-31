import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * C4 (Phase 3, row 92): WebKit has no `prefers-reduced-transparency`, so the iOS app mirrors Reduce Transparency onto
 * the page as `html[data-reduce-transparency]`, at every page load and live when the setting changes. Clubhouse's
 * tokens turn the glass solid under that attribute. This pins the two halves to the same name.
 */
const swift = readFileSync(join(process.cwd(), 'ios/App/App/GolfBridgeViewController.swift'), 'utf8');
const tokens = readFileSync(join(process.cwd(), 'src/clubhouse/styles/tokens.css'), 'utf8');

describe('the Reduce Transparency bridge (C4)', () => {
  it('the app reads the setting, at load and when it changes', () => {
    expect(swift).toContain('UIAccessibility.isReduceTransparencyEnabled');
    expect(swift).toContain('UIAccessibility.reduceTransparencyStatusDidChangeNotification');
    // A document-start script, so the first paint already knows.
    expect(swift).toMatch(/replaceUserScript\(marker: Self\.reduceTransparencyMarker/);
  });

  it('sets and clears the attribute the tokens read', () => {
    expect(swift).toContain("setAttribute('data-reduce-transparency', '')");
    expect(swift).toContain("removeAttribute('data-reduce-transparency')");
    expect(tokens).toMatch(/:root\[data-reduce-transparency\]/);
  });

  it('replacing one flag script keeps the other', () => {
    // Each flag replaces only the script that starts with its own marker.
    expect(swift).toMatch(/controller\.userScripts\.filter \{ !\$0\.source\.hasPrefix\(marker\) \}/);
    expect(swift).toContain('replaceUserScript(marker: Self.swipeFlagMarker');
  });
});
