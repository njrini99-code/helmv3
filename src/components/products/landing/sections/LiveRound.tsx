'use client';

import { useRef } from 'react';
import { useScene } from '@/lib/motion/gsap/useScene';
import { captureLoopScene } from '../scenes/captureLoopScene';

type ScorecardCell = {
  l: string;
  v: string;
  vc?: string;
  lc?: string;
  bg?: string;
  border: boolean;
  active?: boolean;
};

const SCORECARD_CELLS: ScorecardCell[] = [
  { l: 'H4·P4', v: '4', border: true },
  { l: 'H5·P3', v: '2', vc: 'oklch(0.72 0.132 150)', border: true },
  { l: 'H6·P5', v: '5', border: true },
  { l: 'H7·P4', v: '–', bg: 'var(--accent700)', border: false, active: true },
  { l: 'OUT', v: '–', vc: 'var(--amber)', lc: 'var(--amber)', bg: 'oklch(1 0 0/0.06)', border: false },
];

function Check() {
  return (
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: 7,
        background: 'var(--accent50)',
        color: 'var(--accent700)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
        <path d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
}

/** Inside GolfHelm — the live shot-tracking phone, captured mid-round. */
export function LiveRound() {
  const rootRef = useRef<HTMLElement>(null);
  // P3 · the capture loop. The phone performs the four taps that log one shot
  // instead of showing a screenshot of a shot already logged.
  useScene(rootRef, captureLoopScene);

  return (
    <section ref={rootRef} id="golf-track" style={{ scrollMarginTop: 80, background: 'var(--canvas)' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(56px,7vw,104px) clamp(20px,4vw,64px) clamp(16px,3vw,32px)' }}>
        <div style={{ maxWidth: 660 }} data-reveal>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--accent700)' }}>
            Inside GolfHelm
          </div>
          <h2 style={{ margin: '16px 0 0', fontSize: 'clamp(2rem,4.2vw,3.2rem)', lineHeight: 1.04, letterSpacing: '-0.022em', fontWeight: 600, color: 'var(--ink)', textWrap: 'balance' }}>
            Track every shot. Develop every player.
          </h2>
          <p style={{ margin: '16px 0 0', fontSize: 'clamp(1rem,1.3vw,1.15rem)', lineHeight: 1.55, color: 'var(--ink2)', textWrap: 'pretty' }}>
            The real screens your players tap through every round — live from the phone, straight into the
            intelligence that follows.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(20px,4vw,64px) clamp(48px,6vw,88px)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 'clamp(32px,5vw,72px)', alignItems: 'center' }}>
          {/* Phone */}
          <div data-reveal style={{ display: 'flex', justifyContent: 'center' }}>
            <div data-lr="phone" style={{ position: 'relative', width: 'min(300px,100%)', background: 'var(--dark)', borderRadius: 34, padding: 11, boxShadow: 'var(--raise)' }}>
              <div style={{ background: 'var(--canvas)', borderRadius: 26, overflow: 'hidden' }}>
                {/* Scorecard header */}
                <div style={{ background: 'var(--dark)', color: 'var(--onacc)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid oklch(1 0 0/0.08)', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    <span style={{ color: 'oklch(0.72 0.008 85)' }}>← Prev</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'oklch(0.72 0.132 150)', fontWeight: 600 }}>
                      <span style={{ display: 'inline-flex', gap: 2 }}>
                        <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor' }} />
                        <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor' }} />
                        <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor' }} />
                      </span>
                      Hole 7 of 18
                    </span>
                    <span style={{ color: 'oklch(0.72 0.008 85)' }}>Next →</span>
                  </div>
                  <div style={{ display: 'flex' }}>
                    {SCORECARD_CELLS.map((c, i) => (
                      <div key={i} style={{ flex: 1, textAlign: 'center', padding: '7px 2px', borderRight: c.border ? '1px solid oklch(1 0 0/0.08)' : undefined, background: c.bg }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: c.lc ?? (c.active ? 'oklch(0.92 0.04 150)' : 'oklch(0.75 0.008 85)') }}>{c.l}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, color: c.vc }}>{c.v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Shot chips */}
                <div style={{ padding: '10px 12px', background: 'var(--surface)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink3)' }}>Shot</span>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {/* Shots one and two carry a fill layer the scene reveals in
                        order; three and four are still ahead of the player, so
                        they have none. The digit sits ABOVE the fill and never
                        changes colour — see the scene's note on selection. */}
                    {[
                      { n: '1', logged: true, bg: 'var(--accent50)', color: 'var(--accent700)', border: '1px solid var(--accent100)' },
                      { n: '2', logged: true, bg: 'var(--accent700)', color: '#fff', border: undefined },
                      { n: '3', logged: false, bg: 'var(--tint)', color: 'var(--ink3)', border: '1px solid var(--line)' },
                      { n: '4', logged: false, bg: 'var(--tint)', color: 'var(--ink3)', border: '1px solid var(--line)' },
                    ].map((s) => (
                      <span
                        key={s.n}
                        style={{
                          position: 'relative',
                          minWidth: 26,
                          height: 24,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'var(--mono)',
                          fontSize: 11,
                          fontWeight: 600,
                          borderRadius: 7,
                          background: s.logged ? 'var(--tint)' : s.bg,
                          color: s.logged ? s.color : s.color,
                          border: s.logged ? undefined : s.border,
                          overflow: 'hidden',
                        }}
                      >
                        {s.logged ? (
                          <span
                            data-lr="shot-fill"
                            aria-hidden
                            style={{ position: 'absolute', inset: 0, borderRadius: 7, background: s.bg, border: s.border }}
                          />
                        ) : null}
                        <span style={{ position: 'relative' }}>{s.n}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Approach card */}
                <div style={{ margin: 12, borderRadius: 16, padding: 14, background: 'linear-gradient(150deg,var(--accent700),oklch(0.40 0.10 150))', color: '#fff', boxShadow: '0 8px 18px oklch(0.35 0.08 150/0.3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 17, fontWeight: 700 }}>Hole 7</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'oklch(1 0 0/0.2)', padding: '2px 6px', borderRadius: 5 }}>Par 4</span>
                      </div>
                      <div style={{ fontSize: 10, color: 'oklch(0.92 0.04 150)', marginTop: 5 }}>
                        Shot 2 · Approach · <b style={{ color: '#fff' }}>Fairway</b>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'oklch(0.9 0.04 150)' }}>Distance</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 600, lineHeight: 1, marginTop: 3 }}>156<span style={{ fontSize: 11 }}> YDS</span></div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, background: 'oklch(1 0 0/0.14)', borderRadius: 10, padding: '9px 11px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'oklch(0.92 0.04 150)' }}>
                      <span>Progress</span>
                      <span>60%</span>
                    </div>
                    <div style={{ height: 5, background: 'oklch(1 0 0/0.25)', borderRadius: 9999, marginTop: 6, overflow: 'hidden' }}>
                      <div data-lr="progress" style={{ height: '100%', width: '100%', background: '#fff', borderRadius: 9999 }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 8, color: 'oklch(0.92 0.04 150)', marginTop: 6 }}>
                      <span>Tee</span>
                      <span style={{ fontWeight: 700, color: '#fff' }}>156 yds left</span>
                      <span>Hole</span>
                    </div>
                  </div>
                </div>

                {/* Shot result */}
                <div style={{ margin: '0 12px', borderRadius: 14, padding: 12, background: 'var(--sunken)', border: '1px solid var(--line)' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 8 }}>Shot result</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                    {[
                      { t: 'Fairway', on: false },
                      { t: 'Rough', on: false },
                      { t: 'Sand', on: false },
                      { t: 'Green', on: true },
                      { t: 'Hole', on: false },
                      { t: 'Other', on: false },
                    ].map((r) => (
                      <span
                        key={r.t}
                        style={{
                          position: 'relative',
                          textAlign: 'center',
                          padding: '7px 0',
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: r.on ? 700 : 600,
                          background: 'var(--tint)',
                          color: r.on ? '#fff' : 'var(--ink2)',
                        }}
                      >
                        {r.on ? (
                          <span
                            data-lr="lie-fill"
                            aria-hidden
                            style={{
                              position: 'absolute',
                              inset: 0,
                              borderRadius: 8,
                              background: 'var(--accent700)',
                              boxShadow: '0 2px 6px oklch(0.35 0.08 150/0.3)',
                            }}
                          />
                        ) : null}
                        <span style={{ position: 'relative' }}>{r.t}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Distance to hole */}
                <div style={{ margin: '10px 12px 0', borderRadius: 14, padding: 12, background: 'linear-gradient(160deg,var(--accent50),var(--surface))', border: '1.5px solid var(--accent100)' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink3)', textAlign: 'center' }}>Distance to hole</div>
                  <div style={{ textAlign: 'center', marginTop: 4 }}>
                    <span data-lr="distance" style={{ fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums', fontSize: 26, fontWeight: 600, color: 'var(--ink)' }}>12</span>{' '}
                    <span style={{ fontSize: 12, color: 'var(--ink3)' }}>feet</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                    {[
                      { t: '5ft', on: false },
                      { t: '10ft', on: true },
                      { t: '15ft', on: false },
                      { t: '20ft', on: false },
                    ].map((d) => (
                      <span key={d.t} style={{ position: 'relative', flex: 1, textAlign: 'center', padding: '5px 0', borderRadius: 7, fontFamily: 'var(--mono)', fontSize: 10, background: 'var(--tint)', color: d.on ? 'var(--accent700)' : 'var(--ink3)' }}>
                        {d.on ? (
                          <span data-lr="preset-fill" aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 7, background: 'var(--accent50)', border: '1px solid var(--accent100)' }} />
                        ) : null}
                        <span style={{ position: 'relative' }}>{d.t}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ margin: '10px 12px 14px' }}>
                  <div data-lr="next" style={{ textAlign: 'center', padding: '11px 0', borderRadius: 12, background: 'var(--accent700)', color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: '0 3px 8px oklch(0.35 0.08 150/0.28)' }}>Next Shot →</div>
                  <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
                    <span style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 9, fontSize: 10.5, fontWeight: 600, background: 'oklch(0.95 0.03 25)', color: 'oklch(0.48 0.16 25)', border: '1px solid oklch(0.86 0.06 25)' }}>+ Penalty</span>
                    <span style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 9, fontSize: 10.5, fontWeight: 600, background: 'var(--tint)', color: 'var(--ink2)', border: '1px solid var(--line)' }}>Undo Last</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 9 }}>
                  <div style={{ width: 96, height: 4, borderRadius: 9999, background: 'var(--line)' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Copy */}
          <div data-reveal data-reveal-delay="90">
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent700)' }}>Live tracking</div>
            <h3 style={{ margin: '12px 0 0', fontSize: 'clamp(1.5rem,2.6vw,2.1rem)', lineHeight: 1.1, letterSpacing: '-0.02em', fontWeight: 640, color: 'var(--ink)' }}>
              Every shot, captured in real time
            </h3>
            <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.6, color: 'var(--ink2)', maxWidth: '32em' }}>
              Players log shots from their phones during the round. Coaches see live hole-by-hole scores, club
              selection, and result as it happens — no scorecards to chase down after.
            </p>
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 11 }}>
              {['Shot-by-shot tracking', 'Club selection & distances', 'GIR, putts & penalties', 'Works offline on the course'].map((t) => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 14, color: 'var(--ink)' }}>
                  <Check />
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
