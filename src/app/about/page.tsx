'use client';

import { useCallback, useState } from 'react';
import Image from 'next/image';
import { HelmHeader } from '@/components/landing/helm/sections/HelmHeader';
import { HelmFinalCta } from '@/components/landing/helm/sections/HelmFinalCta';
import { HelmDemoModal } from '@/components/landing/helm/DemoModal';
import { SmoothScroll } from '@/components/landing/SmoothScroll';
import { fwHaptic } from '@/lib/fairway/haptics';
import styles from '@/components/landing/helm/helm-landing.module.css';

/**
 * About — rebuilt in the Helm linen / Fairway system so it reads as one product
 * with the landing: the same token module (helm-landing.module.css), the same
 * HelmHeader, the same dark final-CTA + footer, and the same demo modal. Green
 * comes from the shared --accent (the dashboard's accent-600).
 *
 * Content is static-visible by design — the only motion is the hero's CSS
 * mount-fade (styles.heroUp, which is reduced-motion-safe). No scroll-reveal
 * that could leave a below-fold section stuck at opacity:0.
 */

const pillars = [
  {
    title: 'Roster & communication',
    body: 'Roster, messaging, announcements, and documents in one hub the whole team can reach — no more scattered group chats.',
  },
  {
    title: 'Scheduling & travel',
    body: 'Practices, tournaments, travel itineraries, and attendance in a single calendar instead of five apps that never agree.',
  },
  {
    title: 'Stats & development',
    body: 'Every round tracked, every trend visible, and individual development plans built on real data — not a coach’s memory.',
  },
  {
    title: 'CoachHelm intelligence',
    body: 'The AI layer surfaces patterns, flags at-risk players, and turns a season of rounds into the next clear decision.',
  },
];

const values = [
  {
    title: 'Clarity over noise',
    body: 'We cut the clutter so a coach sees what actually moves a program — and nothing that doesn’t.',
  },
  {
    title: 'Built for the day-to-day',
    body: 'Every feature exists because a coach or player needed it, not because it looked good on a feature list.',
  },
  {
    title: 'Premium by default',
    body: 'College programs deserve software that matches their standard. No compromise on craft or feel.',
  },
];

const eyebrow: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: '12px',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--accent700)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '10px',
};
const card: React.CSSProperties = {
  height: '100%',
  background: 'var(--surface)',
  borderRadius: '20px',
  boxShadow: 'var(--soft)',
  padding: 'clamp(24px,3vw,30px)',
};
const container: React.CSSProperties = {
  maxWidth: '1180px',
  margin: '0 auto',
  padding: '0 clamp(20px,4vw,64px)',
};
const sectionHead: React.CSSProperties = {
  margin: '18px 0 0',
  fontSize: 'clamp(1.9rem,3.6vw,2.9rem)',
  lineHeight: 1.06,
  letterSpacing: '-0.022em',
  fontWeight: 600,
  color: 'var(--ink)',
  textWrap: 'balance',
};
const cardTitle: React.CSSProperties = { margin: '16px 0 0', fontSize: '17px', fontWeight: 600, color: 'var(--ink)' };
const cardBody: React.CSSProperties = { margin: '9px 0 0', fontSize: '14.5px', lineHeight: 1.55, color: 'var(--ink2)' };

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span style={eyebrow}>
      <span style={{ width: '22px', height: '1px', background: 'var(--accent)', display: 'inline-block' }} />
      {children}
    </span>
  );
}

export default function AboutPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const openModal = useCallback(() => {
    fwHaptic('light');
    setModalOpen(true);
  }, []);
  const closeModal = useCallback(() => setModalOpen(false), []);

  return (
    <main className={styles.root} style={{ minHeight: '100dvh', overflowX: 'clip' }}>
      <SmoothScroll anchors />
      <HelmHeader onRequestDemo={openModal} />

      {/* Hero */}
      <section id="top" style={{ position: 'relative', overflow: 'clip', scrollMarginTop: '90px' }}>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-18%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '60vw',
            height: '60vw',
            maxWidth: '820px',
            maxHeight: '820px',
            borderRadius: '50%',
            background: 'radial-gradient(circle at 50% 50%,oklch(0.9 0.07 150/0.22),transparent 62%)',
            filter: 'blur(12px)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            ...container,
            position: 'relative',
            paddingTop: 'clamp(56px,8vw,120px)',
            paddingBottom: 'clamp(40px,6vw,72px)',
            textAlign: 'center',
          }}
        >
          <div className={styles.heroUp} style={{ animationDelay: '0.05s' }}>
            <Eyebrow>Our story</Eyebrow>
          </div>
          <h1
            className={styles.heroUp}
            style={{
              animationDelay: '0.14s',
              margin: '22px auto 0',
              maxWidth: '16em',
              fontSize: 'clamp(2.6rem,6vw,4.8rem)',
              lineHeight: 1.0,
              letterSpacing: '-0.028em',
              fontWeight: 640,
              color: 'var(--ink)',
              textWrap: 'balance',
            }}
          >
            There had to be a better way.
          </h1>
          <p
            className={styles.heroUp}
            style={{
              animationDelay: '0.26s',
              margin: '26px auto 0',
              maxWidth: '34em',
              fontSize: 'clamp(1.06rem,1.5vw,1.3rem)',
              lineHeight: 1.5,
              color: 'var(--ink2)',
              textWrap: 'pretty',
            }}
          >
            Helm Sports Labs was built by two former college athletes who were done running programs out of
            spreadsheets and group chats — and decided the tools should finally match the standard.
          </p>
        </div>
      </section>

      {/* The problem */}
      <section style={{ padding: 'clamp(48px,7vw,96px) 0' }}>
        <div style={container}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',
              gap: 'clamp(32px,5vw,64px)',
              alignItems: 'center',
            }}
          >
            <div>
              <Eyebrow>The problem</Eyebrow>
              <h2 style={sectionHead}>Running a college team shouldn’t feel like a second job.</h2>
              <p style={{ margin: '20px 0 0', fontSize: 'clamp(1rem,1.35vw,1.14rem)', lineHeight: 1.6, color: 'var(--ink2)' }}>
                Coaches juggle spreadsheets for stats, group chats for communication, one app for scheduling, and a
                notebook for development. Players never know where to look. The important detail is always the one
                that got buried.
              </p>
              <p style={{ margin: '16px 0 0', fontSize: 'clamp(1rem,1.35vw,1.14rem)', lineHeight: 1.6, color: 'var(--ink2)' }}>
                Helm unifies all of it into one operating view — so coaches can coach and players can improve.
              </p>
            </div>

            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <Image
                  src="/Helm-Logo-New-Main.png"
                  alt=""
                  width={44}
                  height={44}
                  style={{ width: '44px', height: '44px', objectFit: 'contain' }}
                />
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '10.5px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink3)' }}>
                    Our belief
                  </div>
                  <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--ink)', marginTop: '3px' }}>
                    Coaches deserve better tools
                  </div>
                </div>
              </div>
              <p style={{ margin: '18px 0 0', fontSize: '15px', lineHeight: 1.6, color: 'var(--ink2)' }}>
                Every decision a coach makes shapes a player’s growth. Those decisions shouldn’t be slowed by
                disconnected tools and lost information. Helm gives you the clarity to lead with confidence.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What Helm unifies */}
      <section style={{ padding: 'clamp(48px,7vw,96px) 0', background: 'linear-gradient(180deg,var(--canvas),var(--tint))' }}>
        <div style={container}>
          <div style={{ textAlign: 'center', maxWidth: '38em', margin: '0 auto' }}>
            <Eyebrow>What we’re building</Eyebrow>
            <h2 style={sectionHead}>One platform, everything unified.</h2>
            <p style={{ margin: '16px 0 0', fontSize: 'clamp(1rem,1.35vw,1.14rem)', lineHeight: 1.55, color: 'var(--ink2)' }}>
              Helm replaces the patchwork of tools that slow a program down.
            </p>
          </div>

          <div
            style={{
              marginTop: 'clamp(36px,5vw,56px)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
              gap: 'clamp(16px,2vw,22px)',
            }}
          >
            {pillars.map((item, i) => (
              <div key={item.title} style={card}>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    background: 'var(--accent50)',
                    color: 'var(--accent700)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--mono)',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  {i + 1}
                </div>
                <h3 style={cardTitle}>{item.title}</h3>
                <p style={cardBody}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Principles */}
      <section style={{ padding: 'clamp(48px,7vw,96px) 0' }}>
        <div style={container}>
          <div style={{ textAlign: 'center', maxWidth: '38em', margin: '0 auto' }}>
            <Eyebrow>How we work</Eyebrow>
            <h2 style={sectionHead}>The principles behind every release.</h2>
          </div>

          <div
            style={{
              marginTop: 'clamp(36px,5vw,56px)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
              gap: 'clamp(16px,2vw,22px)',
            }}
          >
            {values.map((item) => (
              <div key={item.title} style={card}>
                <div style={{ width: '4px', height: '30px', borderRadius: '9999px', background: 'var(--accent)' }} />
                <h3 style={cardTitle}>{item.title}</h3>
                <p style={cardBody}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <HelmFinalCta onRequestDemo={openModal} />
      <HelmDemoModal open={modalOpen} onClose={closeModal} />
    </main>
  );
}
