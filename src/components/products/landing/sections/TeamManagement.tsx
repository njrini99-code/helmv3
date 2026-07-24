import styles from '../products-landing.module.css';

const chipStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 40,
  height: 40,
  borderRadius: 12,
  background: 'var(--accent50)',
  color: 'var(--accent700)',
  flex: 'none',
};

const svgProps = {
  width: 21,
  height: 21,
  viewBox: '0 0 24 24',
  fill: 'none',
  style: { stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as React.CSSProperties,
};

const tileTitle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.12rem',
  lineHeight: 1.15,
  letterSpacing: '-0.015em',
  fontWeight: 620,
  color: 'var(--ink)',
};
const tileDesc: React.CSSProperties = {
  margin: '7px 0 0',
  fontSize: 13.5,
  lineHeight: 1.5,
  color: 'var(--ink2)',
};

function FeatureTile({
  gridColumn,
  direction,
  delay,
  icon,
  title,
  desc,
}: {
  gridColumn: string;
  direction: 'row' | 'column';
  delay: number;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  const isRow = direction === 'row';
  return (
    <a
      data-reveal
      data-reveal-delay={delay}
      href="#getdemo"
      className={styles.card}
      style={{
        gridColumn,
        display: 'flex',
        flexDirection: direction,
        alignItems: isRow ? 'center' : undefined,
        gap: isRow ? 16 : 12,
        background: 'var(--surface)',
        borderRadius: 22,
        padding: 'clamp(20px,2.2vw,26px)',
        color: 'inherit',
      }}
    >
      <span style={chipStyle}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <h3 style={tileTitle}>{title}</h3>
        <p style={tileDesc}>{desc}</p>
      </div>
    </a>
  );
}

function StandingRow({
  rank,
  name,
  score,
  pick,
  dim,
}: {
  rank: number;
  name: string;
  score: string;
  pick?: boolean;
  dim?: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '22px 1fr auto auto',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        borderBottom: dim ? undefined : '1px solid var(--line)',
        background: dim ? undefined : 'var(--accent-wash)',
        opacity: dim ? 0.6 : undefined,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 13,
          fontWeight: 600,
          color: dim ? 'var(--ink3)' : 'var(--accent700)',
        }}
      >
        {rank}
      </span>
      <span
        style={{
          fontSize: 13.5,
          fontWeight: 560,
          color: dim ? 'var(--ink2)' : 'var(--ink)',
          display: pick ? 'flex' : undefined,
          alignItems: pick ? 'center' : undefined,
          gap: pick ? 7 : undefined,
        }}
      >
        {name}
        {pick ? (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--onacc)',
              background: 'var(--accent)',
              padding: '2px 6px',
              borderRadius: 5,
            }}
          >
            Coach&apos;s pick
          </span>
        ) : null}
      </span>
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 12.5,
          fontWeight: 600,
          color: dim ? 'var(--ink3)' : 'var(--accent700)',
        }}
      >
        {score}
      </span>
      {dim ? (
        <span />
      ) : (
        <span style={{ width: 16, height: 16, color: 'var(--accent)' }}>
          <svg viewBox="0 0 24 24" fill="none" style={{ stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
      )}
    </div>
  );
}

/** Team Management — flagship qualifying tile + the feature bento. */
export function TeamManagement() {
  return (
    <section
      id="team"
      style={{
        scrollMarginTop: 80,
        position: 'relative',
        overflow: 'clip',
        background: 'linear-gradient(180deg,var(--linen) 0%,var(--linen-deep) 100%)',
        borderTop: '1px solid var(--line)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -320,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 1100,
          height: 620,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center,oklch(0.7 0.19 148/0.12),transparent 68%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'relative',
          maxWidth: 1200,
          margin: '0 auto',
          padding: 'clamp(60px,8vw,116px) clamp(20px,4vw,64px)',
        }}
      >
        <div style={{ maxWidth: 760 }} data-reveal>
          <div
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
            Team Management
          </div>
          <h2
            style={{
              margin: '18px 0 0',
              fontSize: 'clamp(2rem,4.4vw,3.4rem)',
              lineHeight: 1.03,
              letterSpacing: '-0.024em',
              fontWeight: 600,
              color: 'var(--ink)',
              textWrap: 'balance',
            }}
          >
            Run the whole program from one place.
          </h2>
          <p
            style={{
              margin: '18px 0 0',
              fontSize: 'clamp(1.05rem,1.4vw,1.28rem)',
              lineHeight: 1.55,
              color: 'var(--ink2)',
              textWrap: 'pretty',
            }}
          >
            Rosters, scheduling, travel, qualifying, messaging, documents — the workflows coaches used to
            stitch together across spreadsheets, group texts, and email threads, unified into one system
            built for the way a program actually runs.
          </p>
        </div>

        <div className={styles.teamGrid}>
          {/* Flagship tile — Qualifying & Travel Selection */}
          <div
            data-reveal
            data-reveal-delay="90"
            style={{
              gridColumn: 'span 7',
              gridRow: 'span 2',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 22,
              boxShadow: 'var(--soft)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: 'clamp(24px,2.6vw,34px) clamp(24px,2.6vw,34px) clamp(16px,2vw,22px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: 'var(--accent)',
                    color: 'var(--onacc)',
                    flex: 'none',
                  }}
                >
                  <svg {...svgProps} style={{ ...svgProps.style, strokeWidth: 1.8 }}>
                    <path d="M4 22V4a1 1 0 0 1 1-1h11l-1.5 4L16 11H5" />
                    <path d="M4 22h4" />
                  </svg>
                </span>
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 10.5,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--accent700)',
                    }}
                  >
                    The flagship workflow
                  </div>
                  <h3
                    style={{
                      margin: '2px 0 0',
                      fontSize: 'clamp(1.25rem,1.8vw,1.55rem)',
                      lineHeight: 1.1,
                      letterSpacing: '-0.018em',
                      fontWeight: 640,
                      color: 'var(--ink)',
                    }}
                  >
                    Qualifying &amp; Travel Selection
                  </h3>
                </div>
              </div>
              <p style={{ margin: '14px 0 0', fontSize: 14.5, lineHeight: 1.55, color: 'var(--ink2)', maxWidth: '40em' }}>
                Run five-day qualifying, auto-lock your top scorers, log the coach&apos;s pick with the
                reasoning behind it, and ship the travel roster — the most painful spreadsheet in college
                golf, finally a real workspace.
              </p>
            </div>
            <div style={{ marginTop: 'auto', padding: '0 clamp(24px,2.6vw,34px) clamp(24px,2.6vw,34px)' }}>
              <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', background: 'var(--canvas)' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '11px 16px',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink3)' }}>
                    Fall Qualifier · Standings
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--accent700)' }}>
                    <span className={styles.pulse} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                    Top 4 travel
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <StandingRow rank={1} name="M. Alvarez" score="−6" />
                  <StandingRow rank={2} name="J. Okafor" score="−3" />
                  <StandingRow rank={3} name="T. Bennett" score="E" />
                  <StandingRow rank={4} name="D. Park" score="+2" pick />
                  <StandingRow rank={5} name="R. Costa" score="+4" dim />
                </div>
              </div>
            </div>
          </div>

          <FeatureTile
            gridColumn="span 5"
            direction="column"
            delay={130}
            title="Roster"
            desc="Every player's profile, academics, eligibility, and status in one living directory."
            icon={
              <svg {...svgProps}>
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <circle cx="9" cy="7" r="4" />
                <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
              </svg>
            }
          />
          <FeatureTile
            gridColumn="span 3"
            direction="column"
            delay={170}
            title="Calendar"
            desc="Practices, events, and RSVPs — the team's whole schedule, synced."
            icon={
              <svg {...svgProps}>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            }
          />
          <FeatureTile
            gridColumn="span 2"
            direction="column"
            delay={200}
            title="Travel"
            desc="Trip logistics and travel squads, planned in-app."
            icon={
              <svg {...svgProps}>
                <path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a1 1 0 0 0-.9 1.7l4.6 3-1.9 3.4-2.1-.4a.8.8 0 0 0-.8 1.2L6 21l1.9-3.5 3.4-1.9 3 4.6a1 1 0 0 0 1.7-.9Z" />
              </svg>
            }
          />
          <FeatureTile
            gridColumn="span 4"
            direction="column"
            delay={230}
            title="Messages"
            desc="Team and 1:1 chat, without another group text to manage."
            icon={
              <svg {...svgProps}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            }
          />
          <FeatureTile
            gridColumn="span 4"
            direction="column"
            delay={260}
            title="Announcements"
            desc="Broadcast to the whole roster with read receipts."
            icon={
              <svg {...svgProps}>
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            }
          />
          <FeatureTile
            gridColumn="span 4"
            direction="column"
            delay={290}
            title="Tasks"
            desc="Assign follow-ups and track what's actually done."
            icon={
              <svg {...svgProps}>
                <rect x="8" y="3" width="8" height="4" rx="1" />
                <path d="M9 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3" />
                <path d="m9 14 2 2 4-4" />
              </svg>
            }
          />
          <FeatureTile
            gridColumn="span 6"
            direction="row"
            delay={320}
            title="Documents"
            desc="Forms, waivers, and files — shared and organized."
            icon={
              <svg {...svgProps}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M9 13h6M9 17h6" />
              </svg>
            }
          />
          <FeatureTile
            gridColumn="span 6"
            direction="row"
            delay={350}
            title="Recruiting HQ"
            desc="Track prospects from first look to commit."
            icon={
              <svg {...svgProps}>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M19 8v6M22 11h-6" />
              </svg>
            }
          />
        </div>
      </div>
    </section>
  );
}
