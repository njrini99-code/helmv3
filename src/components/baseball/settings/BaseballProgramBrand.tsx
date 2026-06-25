'use client';

// =============================================================================
// src/components/baseball/settings/BaseballProgramBrand.tsx
//
// Wave 4 / packet: settings-os (program-identity completeness follow-up)
//
// CONSUMES the program's brand_accent / appearance_theme (+ team primary_color
// fallback) so program branding actually RENDERS — closing the audit gap where
// brand_accent/appearance_theme were stored but had no consumer anywhere.
//
// It is a thin, render-null effect component mounted ONCE in the dashboard shell.
// On mount it fetches the active team's brand (getProgramBrand) and:
//   * sets a scoped `--brand-accent` CSS variable on the shell root, derived
//     from a READABILITY-CLAMPED version of the stored accent (spec guardrail:
//     no oversaturated chaos, keep status colors consistent — we only override a
//     single accent variable, never the cream/green base or status colors).
//   * applies the theme preference as a data attribute (light/dark/system) so a
//     later theme implementation can hang off it without another migration.
//
// Palette guardrail: we DO NOT repaint the product. The accent variable is the
// only thing branding can touch; everything else stays cream/green. If no brand
// is set (or it fails readability), we leave the helm-green default in place.
// =============================================================================

import { useEffect } from 'react';
import { getProgramBrand } from '@/app/baseball/actions/program-settings';
import { isValidBrandHex } from '@/lib/types/baseball-program-identity';

/** Parse #rrggbb → {r,g,b} (0-255). Assumes a validated hex. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Relative luminance (WCAG) of an rgb color, 0..1. */
function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * Readability guardrail (spec §Appearance And Brand): reject accents that are
 * too light to read as a button background against white text, or so dark they
 * read as near-black (status-color confusion). Returns the hex if it passes,
 * else null so we keep the product default.
 */
function clampForReadability(hex: string): string | null {
  if (!isValidBrandHex(hex)) return null;
  const lum = luminance(hexToRgb(hex));
  // Accent is used as a filled control bg with white text → needs to be dark
  // enough for contrast, but not pure black. 0.02..0.55 is a sane band.
  if (lum < 0.02 || lum > 0.55) return null;
  return hex;
}

export function BaseballProgramBrand() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let brand;
      try {
        brand = await getProgramBrand();
      } catch {
        return; // brand is cosmetic — never block the shell on a read failure
      }
      if (cancelled || !brand) return;

      const root = document.documentElement;

      // Resolve the single accent: explicit brand_accent wins, then team
      // primary_color, then nothing (keep helm-green default).
      const candidate = brand.brand_accent ?? brand.primary_color ?? null;
      const accent = candidate ? clampForReadability(candidate) : null;

      if (accent) {
        root.style.setProperty('--baseball-brand-accent', accent);
        root.setAttribute('data-baseball-branded', 'true');
      } else {
        root.style.removeProperty('--baseball-brand-accent');
        root.removeAttribute('data-baseball-branded');
      }

      // Theme preference surfaced as a data attribute for a later theme layer.
      root.setAttribute('data-baseball-theme', brand.appearance_theme);
    })();

    return () => {
      cancelled = true;
      // Clean up so a non-baseball surface never inherits the accent.
      const root = document.documentElement;
      root.style.removeProperty('--baseball-brand-accent');
      root.removeAttribute('data-baseball-branded');
      root.removeAttribute('data-baseball-theme');
    };
  }, []);

  return null;
}
