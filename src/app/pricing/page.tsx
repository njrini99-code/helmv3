import type { Metadata } from 'next';
import Link from 'next/link';
import { Navigation } from '@/components/landing/Navigation';
import { Footer } from '@/components/landing/Footer';
import { SmoothScroll } from '@/components/landing/SmoothScroll';

export const metadata: Metadata = {
  title: 'Pricing — Helm Sports Labs',
  description:
    'GolfHelm and BaseballHelm are priced per program and scale with your roster. Every plan starts with a walkthrough of your season.',
};

type Plan = {
  name: string;
  tagline: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  featured?: boolean;
};

const plans: Plan[] = [
  {
    name: 'GolfHelm',
    tagline: 'College golf intelligence — rounds, shots, stats, and the CoachHelm layer.',
    features: [
      'Unlimited players & rounds',
      'Live shot tracking + 87 stats a round',
      'CoachHelm root-cause insights',
      'Qualifying, travel & roster tools',
    ],
    ctaLabel: 'Start with GolfHelm',
    ctaHref: '/golf/signup',
    featured: true,
  },
  {
    name: 'BaseballHelm',
    tagline: 'Recruiting and team management for college and travel-ball programs.',
    features: [
      'Roster, pipeline & watchlists',
      'Video, performance & Lift Lab',
      'Recruiting HQ prospect tracking',
      'Team calendar & messaging',
    ],
    ctaLabel: 'Start with BaseballHelm',
    ctaHref: '/baseball/signup',
  },
  {
    name: 'Athletic Department',
    tagline: 'Both products across multiple programs, under one operating view.',
    features: [
      'GolfHelm + BaseballHelm',
      'Multi-program administration',
      'Priority onboarding & support',
      'Tailored to your department',
    ],
    ctaLabel: 'Talk to us',
    ctaHref: '/products',
  },
];

const included = [
  'Unlimited players',
  'Built-in CoachHelm AI',
  'iOS & web apps',
  'Onboarding & support',
];

export default function PricingPage() {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-background text-warm-900">
      <SmoothScroll />
      <a
        href="#pricing-plans"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent-600 focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
      >
        Skip to plans
      </a>
      <div className="relative z-modal">
        <Navigation />
      </div>

      {/* Hero */}
      <section
        className="relative overflow-hidden border-b border-warm-200"
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 50% 0%, rgba(21,128,61,0.10), transparent 60%), linear-gradient(180deg, #F8F5EF 0%, #F2ECE2 100%)',
        }}
      >
        <div className="mx-auto max-w-4xl px-6 py-20 text-center md:py-28">
          <div className="inline-flex items-center gap-2.5 text-xs font-medium uppercase tracking-[0.2em] text-primary-700">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-600" />
            Pricing
          </div>
          <h1 className="mx-auto mt-5 max-w-2xl text-[clamp(2.4rem,5vw,3.8rem)] font-semibold leading-[1.02] tracking-tight text-warm-900 text-balance">
            Built around your program, not a seat count.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-warm-600 text-pretty">
            GolfHelm and BaseballHelm are priced per program and scale with your roster. Every plan
            starts with a walkthrough of your season — no per-athlete surprises.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section id="pricing-plans" className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col rounded-2xl border bg-surface p-7 shadow-soft ${
                plan.featured ? 'border-primary-200 ring-1 ring-primary-200' : 'border-warm-200'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight text-warm-900">{plan.name}</h2>
                {plan.featured ? (
                  <span className="rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary-700">
                    Most popular
                  </span>
                ) : null}
              </div>
              <p className="mt-2 min-h-[3.5rem] text-sm leading-relaxed text-warm-600">{plan.tagline}</p>

              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tracking-tight text-warm-900">Custom</span>
                <span className="text-sm text-warm-500">/ per program</span>
              </div>

              <ul className="mt-6 flex flex-1 flex-col gap-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-warm-700">
                    <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full bg-primary-50 text-primary-700">
                      <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.ctaHref}
                className={`mt-7 inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-semibold transition-colors ${
                  plan.featured
                    ? 'bg-primary-700 text-white hover:bg-primary-800'
                    : 'border border-warm-300 text-warm-800 hover:border-warm-400 hover:bg-warm-100'
                }`}
              >
                {plan.ctaLabel}
              </Link>
            </div>
          ))}
        </div>

        {/* Included strip */}
        <div className="mt-10 rounded-2xl border border-warm-200 bg-surface px-6 py-5">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-500">
              Every plan includes
            </span>
            {included.map((item) => (
              <span key={item} className="inline-flex items-center gap-2 text-sm text-warm-700">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-600" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-warm-200 bg-[#0C0A09] text-white">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center md:py-24">
          <h2 className="mx-auto max-w-xl text-[clamp(1.8rem,4vw,2.8rem)] font-semibold leading-tight tracking-tight text-balance">
            See the platform with your program in mind.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-white/70 text-pretty">
            Bring your roster and a season of rounds — we&apos;ll build the plan around what your program
            actually needs.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/products"
              className="inline-flex h-12 items-center justify-center rounded-full bg-accent-600 px-7 text-sm font-semibold text-white transition-colors hover:bg-accent-700"
            >
              Explore the platform
            </Link>
            <Link
              href="/golf/signup"
              className="inline-flex h-12 items-center justify-center rounded-full px-5 text-sm font-medium text-white/80 transition-colors hover:text-white"
            >
              Get started →
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
