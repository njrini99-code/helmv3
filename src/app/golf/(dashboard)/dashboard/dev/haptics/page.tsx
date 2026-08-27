'use client';

/**
 * ============================================================================
 * Haptic feel lab — the §72 physical-device harness (iOS premium plan, 2.1)
 * ----------------------------------------------------------------------------
 * Absent from every GENERATED nav surface (rail, bottom nav, sub-nav,
 * CommandPalette) and from every breadcrumb. It has exactly ONE entry point:
 * the "Feel lab" row in Settings > Haptics (`HapticsPanel`, added 2026-08-27),
 * which inherits that panel's `if (!native) return null` and so exists only in
 * the installed app. That row was added because "reachable only by URL" is
 * reachable NOT AT ALL inside a Capacitor WebView, which has no address bar —
 * the lab was unusable on the exact device it exists to measure.
 *
 * Note the row carries no role check: any signed-in user of the installed
 * build sees it, players included. That is acceptable while distribution is
 * TestFlight-only and the page is read-only tuning UI; gate it on coach/owner
 * before any public App Store release. Auth still applies (it lives inside the
 * dashboard shell); it renders a plain notice off-native since browsers have
 * no Taptic Engine.
 *
 * Every row fires exactly one semantic through the SAME production paths the
 * app uses (triggerHaptic / fwHaptic / playHelmSignature) — the lab must
 * never grow its own haptic plumbing, or it stops measuring reality.
 * ========================================================================== */

import { useEffect, useState } from 'react';
import { fairwayScope } from '@/lib/redesign/flag';
import { Surface } from '@/components/fairway/surfaces';
import { Button } from '@/components/ui/button';
import { isNativeApp, triggerHaptic } from '@/lib/utils/capacitor';
import { fwHaptic, fwHapticSequence, type FwHapticSequence } from '@/lib/fairway/haptics';
import { getNativeAppInfo, hasNativeCapability, type NativeAppInfo } from '@/lib/native/capabilities';
import { playHelmSignature, type HelmSignaturePattern } from '@/lib/native/helm-haptics';

const STOCK: Array<'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'> = [
  'light', 'medium', 'heavy', 'success', 'warning', 'error',
];
const SEQUENCES: Array<FwHapticSequence | 'selection'> = [
  'selection', 'commit', 'reject', 'threshold', 'celebrate',
];
const SIGNATURES: HelmSignaturePattern[] = ['helmCommit', 'helmReject', 'helmMilestone'];

const EVALUATION = [
  'Is the cause obvious?',
  'Does it match the visual weight?',
  'Is the timing right?',
  'Too strong?',
  'Would it annoy after 50 uses?',
  'Distinct from its neighbors?',
];

export default function HapticFeelLabPage() {
  const [info, setInfo] = useState<NativeAppInfo | null>(null);
  const [coreHaptics, setCoreHaptics] = useState<boolean>(false);
  const [lastPlayed, setLastPlayed] = useState<string>('—');

  useEffect(() => {
    void getNativeAppInfo().then(setInfo);
    void hasNativeCapability('coreHapticsV1').then(setCoreHaptics);
  }, []);

  const native = isNativeApp();

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-24 pt-[max(1.5rem,calc(env(safe-area-inset-top,0px)+0.75rem))]">
        <div>
          <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.18em] text-accent-700">
            Dev · Feel lab
          </p>
          <h1 className="mt-1 font-fw-display text-h2 font-semibold text-text-primary">Haptics</h1>
          <p className="mt-1 font-fw-sans text-body-sm text-text-secondary">
            Fires the exact production paths. Judge each pattern against:{' '}
            {EVALUATION.join(' · ')}
          </p>
        </div>

        <Surface padding="md" className="flex flex-col gap-1">
          <p className="font-fw-sans text-caption text-text-tertiary">
            {native
              ? `Native ${info?.platform ?? '…'} · v${info?.appVersion ?? '…'} (build ${info?.build ?? '…'}) · Core Haptics ${coreHaptics ? 'available' : 'unavailable on this build'}`
              : 'Browser — no Taptic Engine here; open this URL inside the iOS app.'}
          </p>
          <p className="font-fw-sans text-caption text-text-tertiary">Last played: {lastPlayed}</p>
        </Surface>

        <Surface padding="md" className="flex flex-col gap-2">
          <h2 className="font-fw-sans text-body-sm font-semibold text-text-primary">
            Stock impacts &amp; notifications (triggerHaptic)
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {STOCK.map((style) => (
              <Button
                key={style}
                variant="secondary"
                size="sm"
                haptic="none"
                onClick={() => {
                  setLastPlayed(style);
                  void triggerHaptic(style);
                }}
              >
                {style}
              </Button>
            ))}
          </div>
        </Surface>

        <Surface padding="md" className="flex flex-col gap-2">
          <h2 className="font-fw-sans text-body-sm font-semibold text-text-primary">
            Semantic grammar (fwHaptic)
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {SEQUENCES.map((kind) => (
              <Button
                key={kind}
                variant="secondary"
                size="sm"
                haptic="none"
                onClick={() => {
                  setLastPlayed(kind);
                  if (kind === 'selection') fwHaptic('selection');
                  else fwHapticSequence(kind);
                }}
              >
                {kind}
              </Button>
            ))}
          </div>
        </Surface>

        <Surface padding="md" className="flex flex-col gap-2">
          <h2 className="font-fw-sans text-body-sm font-semibold text-text-primary">
            Helm signatures (Core Haptics{coreHaptics ? '' : ' — falls back to stock'})
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {SIGNATURES.map((pattern) => (
              <Button
                key={pattern}
                variant="primary"
                size="sm"
                haptic="none"
                onClick={() => {
                  void playHelmSignature(pattern).then((played) => {
                    setLastPlayed(`${pattern} (${played ? 'Core Haptics' : 'fallback'})`);
                  });
                }}
              >
                {pattern.replace('helm', '')}
              </Button>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  );
}
