'use client';

import Link from 'next/link';
import Image from 'next/image';
import { m, LazyMotion, domAnimation } from 'framer-motion';
import { Navigation } from '@/components/landing/Navigation';
import { Footer } from '@/components/landing/Footer';

const pillars = [
  {
    title: 'Roster & Communication',
    description: 'Centralize your roster, messaging, announcements, and documents in a single hub your whole team can access.',
  },
  {
    title: 'Scheduling & Travel',
    description: 'Manage practices, tournaments, travel itineraries, and attendance without juggling calendars and group chats.',
  },
  {
    title: 'Stats & Development',
    description: 'Track every round, monitor performance trends, and build individualized development plans backed by real data.',
  },
  {
    title: 'AI-Powered Coaching',
    description: 'CoachHelm surfaces patterns, flags at-risk players, and delivers insights so nothing falls through the cracks.',
  },
];

const values = [
  {
    title: 'Clarity over noise',
    description: 'We cut through the clutter so coaches can focus on what actually moves the needle.',
  },
  {
    title: 'Built for the day-to-day',
    description: 'Every feature exists because a coach or player needed it — not because it looked good on a feature list.',
  },
  {
    title: 'Premium by default',
    description: 'College programs deserve software that matches their standards. No compromises on quality or experience.',
  },
];

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const }
  }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 }
  }
};

export default function AboutPage() {
  return (
    <LazyMotion features={domAnimation}>
    <main className="min-h-screen bg-background overflow-x-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-lg focus:shadow-lg">
        Skip to main content
      </a>
      {/* Navigation */}
      <div className="relative z-10">
        <Navigation />
      </div>

      {/* Hero */}
      <section
        id="main-content"
        className="relative pt-24 md:pt-32 pb-16 md:pb-24"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 50% 40%, rgba(21, 128, 61, 0.12), transparent),
            linear-gradient(180deg, #F7F5F2 0%, #EDE8DD 100%)
          `
        }}
      >
        <m.div
          className="relative max-w-3xl mx-auto px-5 sm:px-6 text-center"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          <m.p
            variants={fadeInUp}
            className="text-sm font-medium text-primary-600 tracking-[0.2em] uppercase mb-5"
          >
            Our Story
          </m.p>

          <m.h1
            variants={fadeInUp}
            className="text-4xl sm:text-5xl md:text-[3.5rem] font-bold text-warm-900 tracking-tight leading-[1.1] mb-7"
          >
            There has to be a better way
          </m.h1>

          <m.p
            variants={fadeInUp}
            className="text-lg md:text-xl text-warm-600 leading-relaxed max-w-2xl mx-auto"
          >
            Helm Sports Labs was created by two former collegiate athletes who were tired of
            spreadsheets and group chats and thought &ldquo;there has to be a better way.&rdquo;
          </m.p>
        </m.div>
      </section>

      {/* Origin Story */}
      <section
        className="relative py-16 md:py-24 px-5 sm:px-6"
        style={{
          background: `
            radial-gradient(ellipse 60% 50% at 20% 50%, rgba(21, 128, 61, 0.06), transparent),
            linear-gradient(180deg, #EDE8DD 0%, #F7F5F2 100%)
          `
        }}
      >
        <m.div
          className="max-w-5xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
        >
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            <m.div variants={fadeInUp}>
              <p className="text-sm font-medium text-warm-500 uppercase tracking-[0.15em] mb-3">
                The Problem
              </p>
              <h2 className="text-3xl md:text-4xl font-bold text-warm-900 mb-6 tracking-tight">
                Managing a college team shouldn&apos;t feel like a second job
              </h2>
              <p className="text-base md:text-lg text-warm-600 leading-relaxed mb-5">
                Coaches juggle spreadsheets for stats, group chats for communication, separate
                apps for scheduling, and notebooks for player development. Players never know
                where to look for what they need. Important details get buried.
              </p>
              <p className="text-base md:text-lg text-warm-600 leading-relaxed">
                We built Helm to unify everything into one premium platform — so coaches
                can focus on coaching and players can focus on improving.
              </p>
            </m.div>

            <m.div variants={fadeInUp}>
              <div
                className="rounded-2xl p-7 md:p-8 border border-white/60"
                style={{
                  background: 'radial-gradient(ellipse 80% 70% at 50% 60%, rgba(21,128,61,0.05), transparent), rgba(255,253,245,0.92)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.5)',
                }}
              >
                <div className="flex items-center gap-4 mb-5">
                  <Image
                    src="/Helm-Logo-New-Main.png"
                    alt="Helm Sports Labs"
                    width={44}
                    height={44}
                    className="w-11 h-11 object-contain"
                  />
                  <div>
                    <p className="text-xs font-medium text-warm-500 uppercase tracking-[0.15em]">Our Belief</p>
                    <p className="text-lg font-semibold text-warm-900">Coaches deserve better tools</p>
                  </div>
                </div>
                <p className="text-warm-600 leading-relaxed">
                  Every decision a coach makes impacts their players&apos; growth. Those decisions
                  shouldn&apos;t be slowed down by disconnected tools and lost information. Helm
                  gives you the clarity to lead with confidence.
                </p>
              </div>
            </m.div>
          </div>
        </m.div>
      </section>

      {/* What Helm Unifies */}
      <section
        className="relative py-16 md:py-24 px-5 sm:px-6"
        style={{
          background: `
            radial-gradient(ellipse 70% 50% at 80% 40%, rgba(21, 128, 61, 0.08), transparent),
            linear-gradient(180deg, #F7F5F2 0%, #ECE5D6 100%)
          `
        }}
      >
        <m.div
          className="max-w-5xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
        >
          <m.div variants={fadeInUp} className="text-center mb-12 md:mb-14">
            <p className="text-sm font-medium text-warm-500 uppercase tracking-[0.15em] mb-3">
              What We&apos;re Building
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-warm-900 mb-4 tracking-tight">
              One platform, everything unified
            </h2>
            <p className="text-lg text-warm-600 max-w-xl mx-auto leading-relaxed">
              Helm replaces the patchwork of tools that slow your program down.
            </p>
          </m.div>

          <div className="grid sm:grid-cols-2 gap-4 md:gap-5">
            {pillars.map((item, index) => (
              <m.div
                key={item.title}
                variants={fadeInUp}
              >
                <div
                  className="h-full rounded-2xl p-6 md:p-7 border border-white/60 transition-all duration-200 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]"
                  style={{
                    background: 'radial-gradient(ellipse 80% 70% at 50% 60%, rgba(21,128,61,0.04), transparent), rgba(255,253,245,0.92)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.03), 0 0 0 1px rgba(0,0,0,0.02), inset 0 1px 0 rgba(255,255,255,0.5)',
                  }}
                >
                  <div className="w-8 h-8 rounded-full bg-primary-50 text-primary-600
                                flex items-center justify-center text-sm font-semibold mb-4">
                    {index + 1}
                  </div>
                  <h3 className="font-semibold text-warm-900 text-lg mb-2">
                    {item.title}
                  </h3>
                  <p className="text-warm-600 text-sm leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </m.div>
            ))}
          </div>
        </m.div>
      </section>

      {/* Values */}
      <section
        className="relative py-16 md:py-24 px-5 sm:px-6"
        style={{
          background: `
            radial-gradient(ellipse 60% 50% at 50% 60%, rgba(21, 128, 61, 0.1), transparent),
            linear-gradient(180deg, #ECE5D6 0%, #EDE8DD 100%)
          `
        }}
      >
        <m.div
          className="max-w-5xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
        >
          <m.div variants={fadeInUp} className="text-center mb-12 md:mb-14">
            <p className="text-sm font-medium text-warm-500 uppercase tracking-[0.15em] mb-3">
              How We Work
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-warm-900 mb-4 tracking-tight">
              Our principles
            </h2>
            <p className="text-lg text-warm-600 max-w-xl mx-auto leading-relaxed">
              Values that shape every feature we ship.
            </p>
          </m.div>

          <div className="grid md:grid-cols-3 gap-4 md:gap-5">
            {values.map((item) => (
              <m.div
                key={item.title}
                variants={fadeInUp}
              >
                <div
                  className="h-full rounded-2xl p-6 md:p-7 border border-white/60 transition-all duration-200 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]"
                  style={{
                    background: 'radial-gradient(ellipse 80% 70% at 50% 60%, rgba(21,128,61,0.03), transparent), rgba(255,253,245,0.92)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.03), 0 0 0 1px rgba(0,0,0,0.02), inset 0 1px 0 rgba(255,255,255,0.5)',
                  }}
                >
                  <div className="w-1 h-8 bg-primary-500 rounded-full mb-4" />
                  <h3 className="font-semibold text-warm-900 text-lg mb-2">
                    {item.title}
                  </h3>
                  <p className="text-warm-600 text-sm leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </m.div>
            ))}
          </div>
        </m.div>
      </section>

      {/* CTA */}
      <section
        className="relative py-16 md:py-24 px-5 sm:px-6"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 50% 50%, rgba(21, 128, 61, 0.08), transparent),
            linear-gradient(180deg, #EDE8DD 0%, #F7F5F2 100%)
          `
        }}
      >
        <m.div
          className="max-w-3xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fadeInUp}
        >
          <div
            className="rounded-2xl p-8 md:p-12 text-center"
            style={{
              background: 'linear-gradient(135deg, #1c1917 0%, #292524 100%)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.1)',
            }}
          >
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 tracking-tight">
              Ready to streamline your program?
            </h2>
            <p className="text-warm-400 text-lg mb-8 max-w-lg mx-auto leading-relaxed">
              Join coaches who are replacing spreadsheets and group chats with one unified platform.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/golf/signup">
                <button
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5
                           bg-white text-warm-900 font-semibold rounded-xl
                           hover:bg-warm-50 active:scale-[0.98] transition-all text-sm
                           shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                >
                  Create Free Account
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </Link>
              <Link href="/products">
                <button
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5
                           text-white font-medium rounded-xl border border-white/20
                           hover:bg-white/10 active:scale-[0.98] transition-all text-sm"
                >
                  View Products
                </button>
              </Link>
            </div>
          </div>
        </m.div>
      </section>

      <Footer />
    </main>
    </LazyMotion>
  );
}
