'use client';

import Image from 'next/image';
import { GLASS_CARD } from './glass';
import { MarketingShell } from './MarketingShell';
import { Reveal } from './motion';

/**
 * About — the origin story on the Fairway system: linen canvas, mono
 * eyebrows, editorial headings, cream cards that lift off the deep
 * champagne base. Copy carried over from the previous page.
 */

const PILLARS = [
  {
    title: 'Roster & Communication',
    description:
      'Centralize your roster, messaging, announcements, and documents in a single hub your whole team can access.',
  },
  {
    title: 'Scheduling & Travel',
    description:
      'Manage practices, tournaments, travel itineraries, and attendance without juggling calendars and group chats.',
  },
  {
    title: 'Stats & Development',
    description:
      'Track every round, monitor performance trends, and build individualized development plans backed by real data.',
  },
  {
    title: 'AI-Powered Coaching',
    description:
      'CoachHelm surfaces patterns, flags at-risk players, and delivers insights so nothing falls through the cracks.',
  },
];

const VALUES = [
  {
    title: 'Clarity over noise',
    description: 'We cut through the clutter so coaches can focus on what actually moves the needle.',
  },
  {
    title: 'Built for the day-to-day',
    description:
      'Every feature exists because a coach or player needed it — not because it looked good on a feature list.',
  },
  {
    title: 'Premium by default',
    description:
      'College programs deserve software that matches their standards. No compromises on quality or experience.',
  },
];

const CARD_SHADOW =
  'shadow-[inset_0_1px_0_oklch(1_0_0/0.6),0_1px_2px_oklch(0.18_0.01_60/0.06),0_8px_20px_oklch(0.18_0.01_60/0.1),0_22px_48px_oklch(0.18_0.01_60/0.11)]';

export function AboutView() {
  return (
    <MarketingShell showCta>
      {/* Hero */}
      <section className="relative overflow-clip">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-[16%] left-1/2 h-[50vw] max-h-[760px] w-[50vw] max-w-[760px] -translate-x-1/2 rounded-full blur-[10px]"
          style={{ background: 'radial-gradient(circle at 50% 50%, oklch(0.9 0.07 120 / 0.28), transparent 62%)' }}
        />
        <div className="relative mx-auto max-w-[820px] px-[clamp(20px,4vw,64px)] pt-[clamp(56px,9vw,120px)] pb-[clamp(48px,7vw,90px)] text-center">
          <Reveal className="flex items-center justify-center gap-2.5 font-fw-mono text-[0.75rem] uppercase tracking-[0.2em] text-accent-700">
            <span className="inline-block h-px w-[22px] bg-accent-500" />
            Our Story
            <span className="inline-block h-px w-[22px] bg-accent-500" />
          </Reveal>
          <Reveal
            as="p"
            delay={60}
            className="mt-6 text-[clamp(2.4rem,5.4vw,4.4rem)] leading-[1.02] tracking-[-0.026em] text-text-primary [text-wrap:balance]"
            style={{ fontWeight: 640 }}
          >
            There has to be a better way.
          </Reveal>
          <Reveal
            as="p"
            delay={120}
            className="mx-auto mt-7 max-w-[36em] text-[clamp(1.05rem,1.5vw,1.3rem)] leading-relaxed text-text-secondary [text-wrap:pretty]"
          >
            Helm Sports Labs was created by two former collegiate athletes who were tired of spreadsheets and group
            chats and thought &ldquo;there has to be a better way.&rdquo;
          </Reveal>
        </div>
      </section>

      {/* The problem + belief card */}
      <section className="mx-auto max-w-[1320px] px-[clamp(20px,4vw,64px)] py-[clamp(56px,8vw,110px)]">
        <div className="grid items-center gap-[clamp(32px,5vw,72px)]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}>
          <Reveal className="max-w-[520px]">
            <div className="font-fw-mono text-[0.719rem] uppercase tracking-[0.18em] text-text-tertiary">The Problem</div>
            <h2
              className="mt-4 text-[clamp(1.9rem,3.4vw,2.75rem)] leading-[1.06] tracking-[-0.02em] text-text-primary [text-wrap:balance]"
              style={{ fontWeight: 600 }}
            >
              Managing a college team shouldn&apos;t feel like a second job.
            </h2>
            <p className="mt-5 text-[clamp(1rem,1.3vw,1.12rem)] leading-relaxed text-text-secondary [text-wrap:pretty]">
              Coaches juggle spreadsheets for stats, group chats for communication, separate apps for scheduling, and
              notebooks for player development. Players never know where to look for what they need. Important details
              get buried.
            </p>
            <p className="mt-4 text-[clamp(1rem,1.3vw,1.12rem)] leading-relaxed text-text-secondary [text-wrap:pretty]">
              We built Helm to unify everything into one premium platform — so coaches can focus on coaching and
              players can focus on improving.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="rounded-3xl p-7 md:p-8" style={GLASS_CARD}>
              <div className="flex items-center gap-4">
                <Image src="/Helm-Logo-New-Main.png" alt="" width={44} height={44} className="h-11 w-11 object-contain" />
                <div>
                  <div className="font-fw-mono text-[0.656rem] uppercase tracking-[0.15em] text-text-tertiary">Our Belief</div>
                  <div className="text-body-lg font-semibold text-text-primary">Coaches deserve better tools</div>
                </div>
              </div>
              <p className="mt-5 text-body leading-relaxed text-text-secondary">
                Every decision a coach makes impacts their players&apos; growth. Those decisions shouldn&apos;t be
                slowed down by disconnected tools and lost information. Helm gives you the clarity to lead with
                confidence.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* What Helm unifies */}
      <section
        className="py-[clamp(56px,8vw,110px)]"
        style={{ background: 'linear-gradient(180deg, var(--fw-color-canvas), var(--fw-color-surface-tint))' }}
      >
        <div className="mx-auto max-w-[1320px] px-[clamp(20px,4vw,64px)]">
          <Reveal className="mx-auto max-w-[620px] text-center">
            <div className="font-fw-mono text-[0.719rem] uppercase tracking-[0.18em] text-accent-700">
              What We&apos;re Building
            </div>
            <h2
              className="mt-4 text-[clamp(1.9rem,3.4vw,2.75rem)] leading-[1.06] tracking-[-0.02em] text-text-primary [text-wrap:balance]"
              style={{ fontWeight: 600 }}
            >
              One platform, everything unified.
            </h2>
            <p className="mx-auto mt-4 max-w-[30em] text-[clamp(1rem,1.3vw,1.15rem)] leading-relaxed text-text-secondary">
              Helm replaces the patchwork of tools that slow your program down.
            </p>
          </Reveal>
          <div className="mt-[clamp(34px,4vw,56px)] grid gap-4 sm:grid-cols-2">
            {PILLARS.map((pillar, i) => (
              <Reveal key={pillar.title} delay={i * 60}>
                <div className={`h-full rounded-2xl bg-surface p-6 md:p-7 ${CARD_SHADOW}`}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-50 font-fw-mono text-body-sm font-semibold text-accent-700">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <h3 className="mt-4 text-h3 text-text-primary">{pillar.title}</h3>
                  <p className="mt-2 text-body-sm leading-relaxed text-text-secondary">{pillar.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section
        className="py-[clamp(56px,8vw,110px)]"
        style={{ background: 'linear-gradient(180deg, var(--fw-color-surface-tint), var(--fw-color-canvas))' }}
      >
        <div className="mx-auto max-w-[1320px] px-[clamp(20px,4vw,64px)]">
          <Reveal className="mx-auto max-w-[620px] text-center">
            <div className="font-fw-mono text-[0.719rem] uppercase tracking-[0.18em] text-accent-700">How We Work</div>
            <h2
              className="mt-4 text-[clamp(1.9rem,3.4vw,2.75rem)] leading-[1.06] tracking-[-0.02em] text-text-primary [text-wrap:balance]"
              style={{ fontWeight: 600 }}
            >
              Our principles.
            </h2>
            <p className="mx-auto mt-4 max-w-[28em] text-[clamp(1rem,1.3vw,1.15rem)] leading-relaxed text-text-secondary">
              Values that shape every feature we ship.
            </p>
          </Reveal>
          <div className="mt-[clamp(34px,4vw,56px)] grid gap-4 md:grid-cols-3">
            {VALUES.map((value, i) => (
              <Reveal key={value.title} delay={i * 60}>
                <div className={`h-full rounded-2xl bg-surface p-6 md:p-7 ${CARD_SHADOW}`}>
                  <div className="h-8 w-1 rounded-full bg-accent-500" />
                  <h3 className="mt-4 text-h3 text-text-primary">{value.title}</h3>
                  <p className="mt-2 text-body-sm leading-relaxed text-text-secondary">{value.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
