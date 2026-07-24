import Image from 'next/image';
import styles from '../products-landing.module.css';

const grid2: React.CSSProperties = {
  display: 'grid',
  // `min(100%, 300px)` keeps the track from exceeding the viewport on phones.
  gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))',
  gap: 'clamp(32px,5vw,72px)',
  alignItems: 'center',
};
const rowWrap: React.CSSProperties = { maxWidth: 1180, margin: '0 auto' };
const eyebrow: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--accent700)',
};
const rowH3: React.CSSProperties = {
  margin: '12px 0 0',
  fontSize: 'clamp(1.5rem,2.6vw,2.1rem)',
  lineHeight: 1.1,
  letterSpacing: '-0.02em',
  fontWeight: 640,
  color: 'var(--ink)',
};
const rowP: React.CSSProperties = { margin: '14px 0 0', fontSize: 15, lineHeight: 1.6, color: 'var(--ink2)', maxWidth: '32em' };

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, fontSize: 14, color: 'var(--ink)' }}>
      <span style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--accent50)', color: 'var(--accent700)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', marginTop: 1 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
          <path d="M5 13l4 4L19 7" />
        </svg>
      </span>
      {children}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 11 }}>
      {items.map((t) => (
        <Bullet key={t}>{t}</Bullet>
      ))}
    </div>
  );
}

/** CoachHelm — diagnosis, development plan, and coach triage in three beats. */
export function CoachHelm() {
  return (
    <section id="coachhelm" style={{ scrollMarginTop: 80, background: 'var(--canvas)' }}>
      {/* Intro */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(60px,8vw,112px) clamp(20px,4vw,64px) clamp(16px,3vw,32px)' }}>
        <div style={{ maxWidth: 680 }} data-reveal>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <Image
              src="/helm-coach-icon-mid.png"
              alt="CoachHelm"
              width={300}
              height={300}
              style={{ width: 'clamp(52px,5.6vw,68px)', height: 'auto', aspectRatio: '1 / 1', objectFit: 'contain', flex: 'none' }}
            />
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 'clamp(13px,1.5vw,16px)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--accent700)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
              CoachHelm
            </div>
          </div>
          <h2 style={{ margin: '16px 0 0', fontSize: 'clamp(2rem,4.4vw,3.4rem)', lineHeight: 1.03, letterSpacing: '-0.022em', fontWeight: 600, color: 'var(--ink)', textWrap: 'balance' }}>
            It doesn&apos;t just flag the miss. It finds the root.
          </h2>
          <p style={{ margin: '16px 0 0', fontSize: 'clamp(1rem,1.3vw,1.15rem)', lineHeight: 1.55, color: 'var(--ink2)', textWrap: 'pretty' }}>
            Stats tell you <em>what</em> happened. CoachHelm reads the shot sequence, isolates <em>why</em> —
            then turns it into a plan you can actually track.
          </p>
        </div>
      </div>

      {/* Row A — Diagnosis */}
      <div style={{ ...rowWrap, padding: 'clamp(24px,4vw,44px) clamp(20px,4vw,64px)' }}>
        <div style={grid2}>
          <div data-reveal>
            <div style={eyebrow}>Step 1 · Diagnosis</div>
            <h3 style={rowH3}>CoachHelm finds the root.</h3>
            <p style={rowP}>
              Every insight carries a structured chain — symptom, measured root cause, the drivers that prove
              it, and the one thing to practice. It never dresses a hunch up as a fact: measured sequences read
              as <b style={{ color: 'var(--ink)' }}>Measured</b>, inferred ones as <b style={{ color: 'var(--ink)' }}>Hypothesis</b>.
            </p>
            <BulletList
              items={['Symptom → root cause → drivers → Rx', 'Every driver shows its sample size', 'Confidence & strokes-at-stake, stated']}
            />
          </div>

          <div data-reveal data-reveal-delay="90" style={{ position: 'relative' }}>
            <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', background: 'linear-gradient(165deg,#12110f,var(--dark))', color: '#fff', boxShadow: 'var(--raise)', border: '1px solid oklch(1 0 0/0.08)' }}>
              <div className={styles.scan} aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, width: '60%', background: 'linear-gradient(90deg,transparent,oklch(0.648 0.149 149.6/0.07),transparent)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', padding: 'clamp(22px,3vw,30px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'oklch(0.62 0.008 85)' }}>Root cause · Putting</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: 'oklch(0.82 0.11 150)', background: 'oklch(0.648 0.149 149.6/0.14)', padding: '4px 10px', borderRadius: 9999 }}>
                    <span style={{ fontSize: 9 }}>■</span>Measured
                  </span>
                </div>
                <h4 style={{ margin: '16px 0 0', fontSize: 'clamp(1.2rem,2vw,1.5rem)', lineHeight: 1.2, fontWeight: 640, letterSpacing: '-0.015em' }}>
                  3.2 three-putts per round — up from 1.4 in the fall.
                </h4>
                <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.6, color: 'oklch(0.78 0.008 85)' }}>
                  <span style={{ color: 'oklch(0.6 0.008 85)', fontWeight: 500 }}>Caused by — </span>lag speed control
                  breaks down beyond 30 ft; the first putt is finishing 6+ ft short, leaving knee-knockers for par.
                </p>
                <div style={{ marginTop: 18, borderRadius: 14, background: 'oklch(1 0 0/0.04)', border: '1px solid oklch(1 0 0/0.06)', padding: '14px 16px' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'oklch(0.6 0.008 85)', marginBottom: 10 }}>The evidence</div>
                  <div data-fx="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {[
                      { label: '3-putt avoidance', value: '61%', n: 'n 214', vc: '#fff' },
                      { label: 'Lag prox > 30 ft', value: '7.8 ft', n: 'n 88', vc: '#fff' },
                      { label: 'SG: Putting', value: '−2.0', n: 'n 14', vc: 'oklch(0.75 0.14 25)' },
                    ].map((e) => (
                      <div key={e.label} data-si style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ fontSize: 13.5, color: 'oklch(0.8 0.008 85)' }}>{e.label}</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 13.5, color: e.vc }}>
                          {e.value}
                          <span style={{ marginLeft: 9, fontSize: 10.5, color: 'oklch(0.55 0.008 85)' }}>{e.n}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'flex-start', borderLeft: '2px solid var(--accent)', padding: '2px 0 2px 14px' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'oklch(0.82 0.11 150)', marginBottom: 4 }}>Practice focus</div>
                    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'oklch(0.86 0.008 85)' }}>
                      Ladder drill from 30 / 40 / 50 ft, three sessions a week. Finish every lag inside 4 ft.
                    </p>
                  </div>
                </div>
                <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'oklch(0.62 0.008 85)' }}>82% confidence</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: 'oklch(0.82 0.11 150)', background: 'oklch(0.648 0.149 149.6/0.14)', padding: '3px 9px', borderRadius: 9999 }}>Proven</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'oklch(0.78 0.008 85)' }}>~2.0 str/rd at stake</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row B — Development */}
      <div style={{ ...rowWrap, padding: 'clamp(24px,4vw,44px) clamp(20px,4vw,64px) clamp(48px,6vw,80px)' }}>
        <div style={grid2}>
          <div data-reveal style={{ order: 2 }}>
            <div style={{ borderRadius: 20, background: 'var(--surface)', boxShadow: 'var(--soft)', border: '1px solid var(--line)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: 14, fontWeight: 640, color: 'var(--ink)' }}>Focus areas</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--accent700)', background: 'var(--accent50)', border: '1px solid var(--accent100)', padding: '3px 9px', borderRadius: 9999 }}>2 active</span>
              </div>
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Focus 1 */}
                <div style={{ border: '1px solid var(--line)', borderRadius: 16, padding: 15, background: 'var(--canvas)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--accent)', color: '#fff', fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>1</span>
                    <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent50)', color: 'var(--accent700)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="9" />
                        <circle cx="12" cy="12" r="4" />
                        <circle cx="12" cy="12" r="0.6" fill="currentColor" />
                      </svg>
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Own your lag speed</h4>
                      <p style={{ margin: '5px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--ink2)' }}>Speed control beyond 30 ft — leave every first putt inside the make zone.</p>
                      <div style={{ marginTop: 11, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: 'var(--accent700)', background: 'var(--accent50)', border: '1px solid var(--accent100)', padding: '4px 10px', borderRadius: 9999 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <circle cx="12" cy="12" r="9" />
                          <circle cx="12" cy="12" r="1" fill="currentColor" />
                        </svg>
                        3-putts &lt; 1.5 / rd
                      </div>
                      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink3)' }}>Progress</span>
                        <svg viewBox="0 0 120 28" preserveAspectRatio="none" style={{ height: 26, flex: 1, overflow: 'visible' }}>
                          <polyline data-fx="spark" points="2,24 22,23 42,20 62,17 82,12 102,9 118,5" fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="118" cy="5" r="3" fill="var(--accent)" />
                        </svg>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: 'var(--accent700)' }}>1.4</span>
                      </div>
                      <p style={{ margin: '9px 0 0', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink3)' }}>3 recommended drills</p>
                    </div>
                  </div>
                </div>
                {/* Focus 2 */}
                <div style={{ border: '1px solid var(--line)', borderRadius: 16, padding: 15, background: 'var(--canvas)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--tint)', border: '1px solid var(--line)', color: 'var(--ink2)', fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>2</span>
                    <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent50)', color: 'var(--accent700)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                        <circle cx="12" cy="12" r="6" />
                      </svg>
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Sharpen wedge distances</h4>
                      <p style={{ margin: '5px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--ink2)' }}>Tighten dispersion on approaches inside 120 yards.</p>
                      <div style={{ marginTop: 11, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: 'var(--accent700)', background: 'var(--accent50)', border: '1px solid var(--accent100)', padding: '4px 10px', borderRadius: 9999 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <circle cx="12" cy="12" r="9" />
                          <circle cx="12" cy="12" r="1" fill="currentColor" />
                        </svg>
                        Prox &lt; 18 ft
                      </div>
                      <p style={{ margin: '11px 0 0', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink3)' }}>2 recommended drills</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div data-reveal data-reveal-delay="90">
            <div style={eyebrow}>Step 2 · Development plan</div>
            <h3 style={rowH3}>Development plans track your improvement.</h3>
            <p style={rowP}>
              Promote any root cause into a focus area with a real target. Every logged session updates the
              trend line, so the coach and player watch the leak close round over round — not guess whether
              it&apos;s working.
            </p>
            <BulletList
              items={['Prioritized targets tied to a metric', 'Progress trend updates every session', 'Prescribed drills attached to each']}
            />
          </div>
        </div>
      </div>

      {/* Row C — Coach triage */}
      <div style={{ ...rowWrap, padding: 'clamp(24px,4vw,44px) clamp(20px,4vw,64px) clamp(56px,7vw,96px)' }}>
        <div style={grid2}>
          <div data-reveal>
            <div style={eyebrow}>Step 3 · Coach triage</div>
            <h3 style={rowH3}>The whole roster, triaged in one queue.</h3>
            <p style={rowP}>
              Scan the team and CoachHelm surfaces a daily brief — every open signal grouped by player, ranked
              by strokes at stake. Acknowledge, validate, address, or resolve; each stays scoped to the teams
              you actually coach, and your coaching philosophy tunes what rises to the top.
            </p>
            <BulletList
              items={['Signals grouped by player, ranked by impact', 'New → acknowledged → addressed → resolved', 'Effectiveness measured as leaks close']}
            />
          </div>

          <div data-reveal data-reveal-delay="90">
            <div style={{ borderRadius: 22, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: 'var(--raise)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink3)' }}>Intelligence · Triage Desk</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--onacc)', background: 'var(--accent)', padding: '6px 12px', borderRadius: 9999, boxShadow: '0 2px 6px oklch(.35 .08 150/.28)' }}>
                  <span className={styles.pulse} style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                  Scan team
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: '1px solid var(--line)' }}>
                {[
                  { to: '6', label: 'New signals', color: 'var(--ink)', border: true },
                  { to: '4', label: 'Players flagged', color: 'var(--ink)', border: true },
                  { to: '11', label: 'Resolved · 7d', color: 'var(--accent700)', border: false },
                ].map((s) => (
                  <div key={s.label} style={{ padding: '16px 18px', borderRight: s.border ? '1px solid var(--line)' : undefined }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 'clamp(1.7rem,3vw,2.2rem)', fontWeight: 600, lineHeight: 1, color: s.color }}>
                      <span data-fx="count" data-to={s.to}>0</span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--ink3)' }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div data-fx="stagger" style={{ padding: 8, display: 'flex', flexDirection: 'column' }}>
                {/* Signal 1 */}
                <div data-si style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 13, padding: '13px 12px', borderRadius: 12 }}>
                  <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: 'oklch(0.62 0.2 25)', boxShadow: '0 0 0 4px oklch(0.62 0.2 25/0.14)', flex: 'none' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>M. Alvarez</div>
                    <div style={{ marginTop: 2, fontSize: 12.5, color: 'var(--ink2)' }}>3-putts spiking beyond 30 ft</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--onacc)', background: 'var(--accent)', padding: '3px 8px', borderRadius: 6 }}>New</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink3)' }}>~2.0 str</span>
                  </div>
                </div>
                {/* Signal 2 */}
                <div data-si style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 13, padding: '13px 12px', borderRadius: 12 }}>
                  <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--amber)', boxShadow: '0 0 0 4px oklch(0.62 0.13 55/0.14)', flex: 'none' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>D. Park</div>
                    <div style={{ marginTop: 2, fontSize: 12.5, color: 'var(--ink2)' }}>Wedge dispersion widening inside 120 yds</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink2)', background: 'var(--tint)', border: '1px solid var(--line)', padding: '3px 8px', borderRadius: 6 }}>Ack&apos;d</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink3)' }}>~1.1 str</span>
                  </div>
                </div>
                {/* Signal 3 */}
                <div data-si style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 13, padding: '13px 12px', borderRadius: 12, opacity: 0.72 }}>
                  <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', flex: 'none' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>J. Okafor</div>
                    <div style={{ marginTop: 2, fontSize: 12.5, color: 'var(--ink2)' }}>Tee-ball miss bias trending right</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--accent700)', background: 'var(--accent50)', border: '1px solid var(--accent100)', padding: '3px 8px', borderRadius: 6 }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5}>
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                      Resolved
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink3)' }}>~0.7 str</span>
                  </div>
                </div>
              </div>
              <div style={{ padding: '15px 20px', borderTop: '1px solid var(--line)', background: 'var(--sunken)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink3)' }}>Insights resolved · month</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, fontWeight: 600, color: 'var(--accent700)' }}>68%</span>
                </div>
                <div style={{ marginTop: 9, height: 6, borderRadius: 9999, background: 'var(--tint)', overflow: 'hidden' }}>
                  <div data-fx="bar" data-w="68%" style={{ height: '100%', width: 0, borderRadius: 9999, background: 'linear-gradient(90deg,var(--accent),var(--accent700))' }} />
                </div>
                <div style={{ marginTop: 9, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink3)' }}>+1.8 team SG since adopting focus areas</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
