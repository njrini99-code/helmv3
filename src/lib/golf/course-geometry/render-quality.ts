import type { MeridianStyleOverrides } from './visual-style';

/** Meridian §64–67: capability-based rendering profiles. One renderer, three
 * budgets; nothing here touches canonical geometry or evidence. */
export type MeridianRenderQuality = 'low' | 'standard' | 'high';

export interface RenderQualityProfile {
  tier: MeridianRenderQuality;
  /** Device-pixel-ratio cap and the total pixel budget the ratio may not exceed. */
  dprCap: number;
  pixelBudget: number;
  shadowMapSize: 1024 | 2048 | 4096;
  /** Whether near crown geometry may be swapped in around the focus. */
  nearCrowns: boolean;
  /** Build-time multipliers for the crown and forest-mass budgets. */
  crownScale: number;
  massScale: number;
  /** Water term scale (1 = full static material, < 1 = simpler Fresnel). */
  waterScale: number;
  contactShade: boolean;
  /** Canopy tiles per instanced batch per axis (§68.2 draw-call budget). */
  /** Interaction target for the frame-time budget (§68.1). */
  targetFrameMs: number;
}

export const RENDER_QUALITY_PROFILES: Readonly<Record<MeridianRenderQuality, RenderQualityProfile>> = Object.freeze({
  // §65: older / thermally constrained phones. Mass-dominant forest, no near
  // crowns, simple Fresnel water, no contact shade, 30 fps target.
  low: Object.freeze({ tier: 'low', dprCap: 1.5, pixelBudget: 2_400_000, shadowMapSize: 1024, nearCrowns: false, crownScale: .7, massScale: 1.25, waterScale: .6, contactShade: false, targetFrameMs: 33 }),
  // §66: modern phone default. Adaptive 4 MP budget, 2048 shadows, near crowns
  // inside the focus radius, full bowl and water, contact AO, 60 fps target.
  standard: Object.freeze({ tier: 'standard', dprCap: 2, pixelBudget: 4_000_000, shadowMapSize: 2048, nearCrowns: true, crownScale: 1, massScale: 1, waterScale: 1, contactShade: true, targetFrameMs: 16.7 }),
  // §67: desktop / powerful tablet. Higher DPR inside a memory cap, more tree
  // detail and a larger shadow map; GTAO stays off until it is measured.
  high: Object.freeze({ tier: 'high', dprCap: 2.5, pixelBudget: 8_000_000, shadowMapSize: 4096, nearCrowns: true, crownScale: 1.25, massScale: 1, waterScale: 1, contactShade: true, targetFrameMs: 16.7 }),
});

export interface RenderCapabilities {
  devicePixelRatio: number;
  deviceMemoryGb?: number;
  hardwareConcurrency?: number;
  coarsePointer: boolean;
  maxTextureSize?: number;
  saveData?: boolean;
  screenPixels: number;
}

/** Reads what the browser will say about itself; every field is optional and
 * missing fields never push a device down a tier on their own. */
export function readRenderCapabilities(win: Window | null | undefined): RenderCapabilities {
  if (!win) return { devicePixelRatio: 1, coarsePointer: false, screenPixels: 0 };
  const nav = win.navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return {
    devicePixelRatio: win.devicePixelRatio || 1,
    deviceMemoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    hardwareConcurrency: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined,
    coarsePointer: typeof win.matchMedia === 'function' ? win.matchMedia('(pointer: coarse)').matches : false,
    saveData: nav.connection?.saveData === true,
    screenPixels: (win.screen?.width ?? 0) * (win.screen?.height ?? 0),
  };
}

/** §64: capability-based tier. Low when the device says it is small (memory,
 * cores on a touch device, texture limit, data saver); high only for a fine
 * pointer with plenty of cores and memory and a large screen; else standard. */
export function detectRenderQuality(caps: RenderCapabilities): MeridianRenderQuality {
  if (caps.saveData) return 'low';
  if (caps.maxTextureSize != null && caps.maxTextureSize < 4096) return 'low';
  if (caps.deviceMemoryGb != null && caps.deviceMemoryGb <= 2) return 'low';
  if (caps.coarsePointer && caps.hardwareConcurrency != null && caps.hardwareConcurrency <= 4) return 'low';
  if (!caps.coarsePointer && (caps.hardwareConcurrency ?? 0) >= 8 && (caps.deviceMemoryGb == null || caps.deviceMemoryGb >= 8) && caps.screenPixels >= 1_500_000) return 'high';
  return 'standard';
}

/** The device pixel ratio a profile allows for a CSS viewport. */
export function profilePixelRatio(profile: RenderQualityProfile, devicePixelRatio: number, width: number, height: number): number {
  return Math.max(1, Math.min(devicePixelRatio || 1, profile.dprCap, Math.sqrt(profile.pixelBudget / Math.max(1, width * height))));
}

/** Folds a profile into the landscape's build/material multipliers. Lab
 * overrides still apply on top; production passes none. */
export function qualityOverrides(profile: RenderQualityProfile, base: MeridianStyleOverrides = {}): MeridianStyleOverrides {
  return { ...base,
    crowns: (base.crowns ?? 1) * profile.crownScale, mass: (base.mass ?? 1) * profile.massScale,
    water: (base.water ?? 1) * profile.waterScale, shade: profile.contactShade ? base.shade ?? 1 : 0 };
}

/** §68: budgets tracked beside draw calls. Initial targets until measured;
 * hole 9 is the canary. */
export const RENDER_BUDGETS = Object.freeze({
  drawCalls: Object.freeze({ top: 140, terrain: 180, side: 160 }),
  frameP95Ms: Object.freeze({ interactive: 16.7, fallback: 33 }),
  canaryHole: 9,
});

export type BudgetView = keyof typeof RENDER_BUDGETS.drawCalls;

/** Which draw-call budget a camera pitch falls under. */
export function budgetViewFor(pitchDegrees: number): BudgetView {
  return pitchDegrees >= 85 ? 'top' : pitchDegrees <= 38 ? 'side' : 'terrain';
}

export function percentile(values: readonly number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}
