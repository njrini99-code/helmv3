'use client';

import { useRef } from 'react';
import { STAT_FAMILIES, ROUND_HOLES } from '../productsData';
import { useScene } from '@/lib/motion/gsap/useScene';
import { derivationScene } from '../scenes/derivationScene';

const pillBase: React.CSSProperties = {
  display: 'inline-block',
  fontFamily: 'var(--mono)',
  fontSize: 12,
  lineHeight: 1.3,
  background: 'var(--canvas)',
  border: '1px solid var(--line)',
  padding: '6px 11px',
  borderRadius: 9999,
  color: 'var(--ink2)',
  whiteSpace: 'nowrap',
};

/**
 * "Every round, quantified" — the derivation of 85.
 *
 * Replaces two infinite counter-scrolling marquees of stat names. A marquee is
 * motion that never resolves, and it was making the section's central claim
 * WEAKER: an endless loop of labels is not a count of anything. The number is
 * now assembled on screen from the round that produces it.
 */
export function StatsTicker() {
  const rootRef = useRef<HTMLElement>(null);
  useScene(rootRef, derivationScene);

  const grand = STAT_FAMILIES.reduce((sum, f) => sum + f.total, 0);

  return (
    <section
      id="stats"
      ref={rootRef}
      style={{
        scrollMarginTop: 80,
        position: 'relative',
        overflow: 'clip',
        background: 'var(--surface)',
        borderTop: '1px solid var(--line)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div
        style={{
          position: 'relative',
          maxWidth: 1180,
          margin: '0 auto',
          padding: 'clamp(60px,8vw,112px) clamp(20px,4vw,64px) clamp(52px,7vw,88px)',
        }}
      >
        {/* ── The input: one round ─────────────────────────────────────── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 'clamp(20px,4vw,56px)' }}>
          <div>
            <div
              data-reveal
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 9,
                fontFamily: 'var(--mono)',
                fontSize: 11.5,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--accent700)',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
              Every round, quantified
            </div>
            {/* Eighteen ticks — the unit of input this whole section is about. */}
            <div aria-hidden style={{ display: 'flex', alignItems: 'flex-end', gap: 4, margin: '20px 0 0', height: 34 }}>
              {ROUND_HOLES.map((par, i) => (
                <span
                  key={i}
                  data-dv="hole"
                  style={{
                    width: 6,
                    height: par === 3 ? 16 : par === 4 ? 24 : 32,
                    borderRadius: 2,
                    background: 'var(--accent)',
                    opacity: 0.9,
                  }}
                />
              ))}
            </div>
            <p style={{ margin: '10px 0 0', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink3)', letterSpacing: '0.06em' }}>
              18 holes · <span data-dv="shots">—</span> shots logged
            </p>
          </div>

          {/* ── The output: the running total ──────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginLeft: 'auto' }}>
            <span
              data-dv="total"
              style={{
                fontFamily: 'var(--mono)',
                fontVariantNumeric: 'tabular-nums',
                fontSize: 'clamp(4.2rem,12vw,9rem)',
                fontWeight: 600,
                lineHeight: 0.86,
                letterSpacing: '-0.03em',
                color: 'var(--accent700)',
              }}
            >
              {grand}
            </span>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 'clamp(0.85rem,1.1vw,1rem)',
                color: 'var(--ink3)',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                writingMode: 'vertical-rl',
                lineHeight: 1,
              }}
            >
              stats
            </span>
          </div>
        </div>

        <h2
          data-reveal
          data-reveal-delay="60"
          style={{
            margin: 'clamp(28px,4vw,44px) 0 0',
            maxWidth: '22em',
            fontSize: 'clamp(1.5rem,3vw,2.4rem)',
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            fontWeight: 600,
            color: 'var(--ink)',
            textWrap: 'balance',
          }}
        >
          Every shot a player logs becomes a measured, benchmarked number the moment the round closes.
        </h2>
        <p
          data-reveal
          data-reveal-delay="90"
          style={{ margin: '16px 0 0', maxWidth: '38em', fontSize: 'clamp(1rem,1.3vw,1.15rem)', lineHeight: 1.6, color: 'var(--ink2)', textWrap: 'pretty' }}
        >
          No spreadsheets, no manual entry — and no single number doing all the work. Here is where the{' '}
          {grand} come from.
        </p>

        {/* ── The derivation: six families, summing to the headline ────── */}
        <div
          style={{
            margin: 'clamp(30px,4vw,48px) 0 0',
            display: 'grid',
            gap: 'clamp(18px,2.4vw,30px)',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))',
          }}
        >
          {STAT_FAMILIES.map((family) => (
            <div key={family.name} data-dv="family" data-dv-total={family.total}>
              <div
                data-dv="rule"
                aria-hidden
                style={{ height: 2, borderRadius: 2, background: 'var(--accent)', opacity: 0.85 }}
              />
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, margin: '12px 0 0' }}>
                <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 620, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
                  {family.name}
                </h3>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--accent700)',
                  }}
                >
                  <span data-dv="count">{family.total}</span>
                </span>
              </div>
              <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {family.examples.map((s) => (
                  <li key={s} data-dv="pill" style={pillBase}>
                    {s}
                  </li>
                ))}
                {family.total > family.examples.length ? (
                  <li data-dv="pill" style={{ ...pillBase, background: 'transparent', color: 'var(--ink3)', borderStyle: 'dashed' }}>
                    +{family.total - family.examples.length} more
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
