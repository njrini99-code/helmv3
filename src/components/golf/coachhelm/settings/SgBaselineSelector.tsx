'use client';

/**
 * SG Baseline selector (Coaching Intelligence settings).
 *
 * Lets a coach choose which baseline their team's Strokes Gained is measured
 * against. Self-contained: loads the team's current baseline + persists changes
 * via the team-sg-baseline server actions. Because SG is stored (not computed on
 * read), changing the baseline recomputes the team's stored SG, so every SG
 * surface updates — the action runs that recompute before returning.
 */

import { useEffect, useState, useTransition } from 'react';
import { Select } from '@/components/ui/select';
import { IconCheck } from '@/components/icons';
import {
  SG_BASELINE_OPTIONS,
  type SgBaselineKey,
} from '@/lib/golf/sg-benchmarks';
import {
  getTeamSgBaseline,
  setTeamSgBaseline,
} from '@/app/golf/actions/team-sg-baseline';

const OPTIONS = SG_BASELINE_OPTIONS.map((o) => ({ value: o.key, label: o.label }));

export function SgBaselineSelector() {
  const [baseline, setBaseline] = useState<SgBaselineKey | null>(null);
  const [gender, setGender] = useState<'mens' | 'womens'>('mens');
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getTeamSgBaseline().then((r) => {
      if (!active) return;
      if (r.success) {
        setBaseline(r.data.baseline);
        setGender(r.data.gender);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleChange = (value: string) => {
    const key = value as SgBaselineKey;
    setBaseline(key);
    setStatus('saving');
    setErrorMsg(null);
    startTransition(async () => {
      const r = await setTeamSgBaseline(key);
      if (r.success) {
        setStatus('saved');
      } else {
        setStatus('error');
        setErrorMsg(r.error ?? 'Failed to save');
      }
    });
  };

  const selected = SG_BASELINE_OPTIONS.find((o) => o.key === baseline);

  // Chrome-agnostic: heading/text inherit the surrounding section's color so this
  // reads correctly inside both the legacy and Fairway settings forks. Each fork
  // wraps it in its own card.
  return (
    <div>
      <p className="mt-1 text-sm opacity-70">
        The reference your team&apos;s Strokes Gained is measured against. Changing it
        recomputes this team&apos;s SG everywhere it appears.
        {gender === 'womens'
          ? ' Women’s teams default to the Women’s baseline.'
          : ' Men’s teams default to PGA Tour.'}
      </p>

      <div className="mt-4 max-w-sm">
        {loading ? (
          <div className="h-11 w-full animate-pulse rounded-xl bg-warm-100" />
        ) : (
          <Select
            options={OPTIONS}
            value={baseline ?? undefined}
            onChange={handleChange}
            disabled={pending}
            hint={selected?.description}
          />
        )}
      </div>

      <div className="mt-3 min-h-[1.25rem] text-sm" aria-live="polite">
        {status === 'saving' && (
          <span className="text-warm-500">Recomputing team SG…</span>
        )}
        {status === 'saved' && (
          <span className="inline-flex items-center gap-1.5 text-primary-600">
            <IconCheck size={16} /> Saved — SG recomputed for this baseline.
          </span>
        )}
        {status === 'error' && (
          <span className="text-red-600">{errorMsg}</span>
        )}
      </div>
    </div>
  );
}
