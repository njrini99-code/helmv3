'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { MarketingShell } from './MarketingShell';
import { Reveal, useSequence } from './motion';

/**
 * About — the origin story, on the same visual system as / and /products.
 *
 * WHAT THIS PAGE WAS, AND WHY IT READ AS A TEMPLATE. Every section was the
 * identical centred stack — mono eyebrow, centred heading, centred subhead,
 * grid of cards — three times in a row, and the last two of those grids were
 * the SAME component twice: a numbered accent chip, an h3, two lines of body,
 * on a cream card with a four-layer drop shadow. Seven near-identical tiles and
 * no tonal break anywhere, on a page whose neighbours (/ and /products) both
 * run alternating light/dark bands and change form section to section.
 *
 * The copy is unchanged. What changed is form and rhythm:
 *
 *   hero      centred stack        ->  asymmetric, headline and lead sharing a
 *                                      baseline, left-aligned, real <h1>
 *   problem   cream + glass card   ->  the DARK band (bg-stone-950, the same
 *                                      field the final CTA and footer use), so
 *                                      the page has a tonal low point where the
 *                                      argument has one. The floating shadowed
 *                                      card becomes an inset statement under a
 *                                      hairline, and "Coaches deserve better
 *                                      tools" is promoted from a bold label to
 *                                      the band's focal line.
 *   pillars   shadowed tiles       ->  hairline-bordered surfaces with a large
 *                                      ghosted figure, hover lift. Still a grid,
 *                                      because four parallel product areas ARE
 *                                      a grid.
 *   values    the same tiles again ->  a ruled editorial list. Principles are
 *                                      statements, not tiles, and this is the
 *                                      house list form (see the products intro
 *                                      rows). It also guarantees the two
 *                                      sections can never read as one repeated
 *                                      component again.
 *
 * Section order and tone now alternate: light hero, dark problem, light grid,
 * light ruled list, dark CTA.
 */

const PILLARS = [
  {
    title: 'Shot Logging & Real Stats',
    description:
      'Every shot logged live. 85 measured stats per round. Miss patterns, GIR trends, strokes gained — so you see exactly what happened and why.',
  },
  {
    title: 'Root Cause via CoachHelm',
    description:
      'Puts the leak in front of you. Not a number — a diagnosis with a practice block ready. Development plans your players actually follow.',
  },
  {
    title: 'Team in One Place',
    description:
      'Roster, travel, qualifying, communication, documents — everything your program needs without juggling spreadsheets and group chats.',
  },
  {
    title: 'Recruiting Intel',
    description:
      'See your team\'s actual strength. Real stats tell the story of what you built. Better conversations with recruits who fit your system.',
  },
];

const VALUES = [
  {
    title: 'Real data, real answers',
    description: 'Every stat is benchmarked. Every insight traces back to the rounds that drove it. No black boxes, no guesses.',
  },
  {
    title: 'Built by coaches who got tired of spreadsheets',
    description:
      'Every feature exists because a coach or player actually needed it. The team management, the stats, the AI — it all came from real coaching problems.',
  },
  {
    title: 'Premium, not bloated',
    description:
      'College programs deserve software that gets out of the way. Fast, intentional, muted — built for the work, not the feature list.',
  },
];

/** Mono eyebrow with ONE leading rule. The symmetric rule-label-rule version is
 *  the centred-template tell; a single leading rule anchors a left-aligned
 *  section instead. */
function Eyebrow({ children, tone = 'accent' }: { children: React.ReactNode; tone?: 'accent' | 'onDark' }) {
  const dark = tone === 'onDark';
  return (
    <div
      className={`flex items-center gap-3 font-fw-mono text-[0.719rem] uppercase tracking-[0.18em] ${
        dark ? 'text-[oklch(0.74_0.008_85)]' : 'text-accent-700'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-px w-[26px] ${dark ? 'bg-[oklch(1_0_0/0.28)]' : 'bg-accent-500'}`}
      />
      {children}
    </div>
  );
}

/**
 * The principles list. Its own component because it owns a ref: the section is
 * choreographed by `useSequence` (the house on-enter sequencer) rather than by
 * three independent <Reveal>s, so the rules DRAW left-to-right and the copy
 * stages in behind them, in order, as one movement. Three separate reveals
 * firing on their own thresholds is what made this section read as a list of
 * cards rather than a statement.
 */
function Principles() {
  const ref = useRef<HTMLDivElement | null>(null);
  useSequence(ref);

  return (
    <div ref={ref} className="mt-[clamp(34px,4.5vw,58px)]">
      <ul className="list-none">
        {VALUES.map((value, i) => (
          <li
            key={value.title}
            className="relative border-b border-[oklch(0.4_0.02_60/0.12)] first:border-t first:border-t-[oklch(0.4_0.02_60/0.12)]"
          >
            {/* The accent hairline that draws in over the resting border.
                `data-bar` is the house sequencer's own mechanism (the landing's
                stat bars use it); absolutely positioned and 1px tall, so the
                width it animates cannot reflow anything around it. Default
                width is the FINAL width, which is what reduced motion and
                no-JS both fall back to. */}
            <span
              aria-hidden="true"
              data-bar
              data-w="100%"
              className="absolute bottom-[-1px] left-0 h-px w-full bg-accent-500/70"
            />
            <div className="grid items-baseline gap-x-[clamp(16px,3vw,48px)] gap-y-2 py-[clamp(22px,3vw,34px)] md:grid-cols-[auto_minmax(0,0.85fr)_minmax(0,1.4fr)]">
              <span
                aria-hidden="true"
                data-anim
                className="font-fw-mono text-[0.75rem] uppercase tracking-[0.16em] text-accent-700"
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3
                data-anim
                className="text-[clamp(1.22rem,2.1vw,1.7rem)] leading-[1.14] tracking-[-0.018em] text-text-primary"
                style={{ fontWeight: 600 }}
              >
                {value.title}
              </h3>
              <p data-anim className="text-body leading-relaxed text-text-secondary [text-wrap:pretty]">
                {value.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AboutView() {
  return (
    <MarketingShell showCta>
      {/* ── Hero ─────────────────────────────────────────────────────────────
          Asymmetric: the statement and the lead paragraph share a baseline
          rather than stacking down the centre line. */}
      <section className="relative overflow-clip">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-[18%] -right-[6%] h-[48vw] max-h-[720px] w-[48vw] max-w-[720px] rounded-full blur-[10px]"
          style={{ background: 'radial-gradient(circle at 50% 50%, oklch(0.9 0.07 120 / 0.26), transparent 62%)' }}
        />
        <div className="relative mx-auto max-w-[1320px] px-[clamp(20px,4vw,64px)] pt-[clamp(58px,9vw,124px)] pb-[clamp(52px,8vw,104px)]">
          <Reveal>
            <Eyebrow>Our Story</Eyebrow>
          </Reveal>
          <div className="mt-[clamp(20px,3vw,36px)] grid gap-[clamp(22px,4vw,72px)] lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-end">
            <Reveal
              as="h1"
              delay={60}
              className="text-[clamp(2.45rem,6vw,5rem)] leading-[0.99] tracking-[-0.03em] text-text-primary [text-wrap:balance]"
              style={{ fontWeight: 640 }}
            >
              There has to be a better way.
            </Reveal>
            <Reveal
              as="p"
              delay={140}
              className="max-w-[34em] text-[clamp(1.02rem,1.4vw,1.2rem)] leading-relaxed text-text-secondary [text-wrap:pretty] lg:pb-[0.55em]"
            >
              Helm Sports Labs was created by two former collegiate athletes who were tired of spreadsheets and group
              chats and thought &ldquo;there has to be a better way.&rdquo;
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── The problem — the page's dark band ───────────────────────────────
          Same warm-dark field as the final CTA and footer, so this is the
          system's existing tone rather than a new one. */}
      <section className="bg-stone-950 text-text-on-accent">
        <div className="mx-auto max-w-[1320px] px-[clamp(20px,4vw,64px)] py-[clamp(68px,10vw,138px)]">
          <div className="grid gap-[clamp(36px,5vw,88px)] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Reveal>
              <Eyebrow tone="onDark">The Problem</Eyebrow>
              <h2
                className="mt-5 text-[clamp(1.85rem,3.6vw,2.85rem)] leading-[1.05] tracking-[-0.022em] [text-wrap:balance]"
                style={{ fontWeight: 600 }}
              >
                Good coaches aren&apos;t buried in spreadsheets.
              </h2>
              <p className="mt-6 max-w-[38em] text-[clamp(1rem,1.3vw,1.12rem)] leading-relaxed text-[oklch(0.82_0.008_85)] [text-wrap:pretty]">
                Right now your data lives everywhere: spreadsheets for stats, group chats for updates, calendars for travel, notebooks for notes. You can&apos;t see the story. Your team can&apos;t find what they need. And making a coaching call takes three apps.
              </p>
              <p className="mt-4 max-w-[38em] text-[clamp(1rem,1.3vw,1.12rem)] leading-relaxed text-[oklch(0.82_0.008_85)] [text-wrap:pretty]">
                GolfHelm puts every round, every shot, every stat, and every development plan in one place — so coaches coach and players improve.
              </p>
            </Reveal>

            {/* Belief. Was a floating glass card with a four-layer shadow; on
                the dark field it becomes an inset statement under a hairline —
                no card, no elevation, and the sentence carries itself. */}
            <Reveal delay={120} className="lg:pt-[clamp(6px,2vw,40px)]">
              <div className="border-t border-[oklch(1_0_0/0.16)] pt-7">
                <div className="flex items-center gap-3.5">
                  <Image
                    src="/Helm-Logo-New-Main.png"
                    alt=""
                    width={36}
                    height={36}
                    className="h-9 w-9 object-contain"
                  />
                  <div className="font-fw-mono text-[0.6875rem] uppercase tracking-[0.15em] text-[oklch(0.74_0.008_85)]">
                    Our Belief
                  </div>
                </div>
                <p
                  className="mt-6 text-[clamp(1.35rem,2.3vw,1.85rem)] leading-[1.2] tracking-[-0.02em] [text-wrap:balance]"
                  style={{ fontWeight: 600 }}
                >
                  Data becomes decisions.
                </p>
                <p className="mt-4 max-w-[34em] text-body leading-relaxed text-[oklch(0.79_0.008_85)] [text-wrap:pretty]">
                  Every coaching decision changes a player&apos;s development. Those decisions shouldn&apos;t come from hunches or lost notes. GolfHelm shows you exactly where the leak is, what the fix looks like, and which players need what — so you move faster and recruit smarter.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── What Helm unifies ───────────────────────────────────────────────
          Still a grid (four parallel product areas genuinely are one), but
          hairline-bordered rather than floating on a drop shadow. */}
      <section
        className="py-[clamp(62px,9vw,124px)]"
        style={{ background: 'linear-gradient(180deg, var(--fw-color-canvas), var(--fw-color-surface-tint))' }}
      >
        <div className="mx-auto max-w-[1320px] px-[clamp(20px,4vw,64px)]">
          <Reveal className="max-w-[660px]">
            <Eyebrow>GolfHelm Solves</Eyebrow>
            <h2
              className="mt-5 text-[clamp(1.85rem,3.4vw,2.75rem)] leading-[1.06] tracking-[-0.02em] text-text-primary [text-wrap:balance]"
              style={{ fontWeight: 600 }}
            >
              Shot data that drives coaching.
            </h2>
            <p className="mt-4 max-w-[32em] text-[clamp(1rem,1.3vw,1.15rem)] leading-relaxed text-text-secondary">
              Every round logged. Every leak surfaced. Every player focused. One place to lead from.
            </p>
          </Reveal>
          <div className="mt-[clamp(34px,4.5vw,60px)] grid gap-[clamp(12px,1.5vw,18px)] sm:grid-cols-2">
            {PILLARS.map((pillar, i) => (
              <Reveal key={pillar.title} delay={i * 70}>
                <article className="group relative h-full overflow-clip rounded-2xl border border-[oklch(0.4_0.02_60/0.11)] bg-surface p-[clamp(22px,2.4vw,32px)] transition-[transform,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-[oklch(0.55_0.12_150/0.34)] hover:shadow-[0_1px_2px_oklch(0.18_0.01_60/0.05),0_16px_38px_oklch(0.18_0.01_60/0.11)]">
                  {/* The figure is scale, not a chip: it reads as composition
                      rather than as a badge, and it is the one thing that makes
                      four tiles feel like a numbered sequence. */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-1 right-3 font-fw-mono text-[clamp(3.2rem,6vw,4.75rem)] leading-none tracking-[-0.045em] text-[oklch(0.4_0.02_60/0.06)] transition-colors duration-300 group-hover:text-[oklch(0.55_0.12_150/0.11)]"
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="relative text-h3 text-text-primary">{pillar.title}</h3>
                  <p className="relative mt-3 max-w-[34em] text-body-sm leading-relaxed text-text-secondary">
                    {pillar.description}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Our principles — a ruled list, not a third card grid ─────────── */}
      <section
        className="py-[clamp(62px,9vw,124px)]"
        style={{ background: 'linear-gradient(180deg, var(--fw-color-surface-tint), var(--fw-color-canvas))' }}
      >
        <div className="mx-auto max-w-[1320px] px-[clamp(20px,4vw,64px)]">
          <Reveal className="max-w-[640px]">
            <Eyebrow>How We Work</Eyebrow>
            <h2
              className="mt-5 text-[clamp(1.85rem,3.4vw,2.75rem)] leading-[1.06] tracking-[-0.02em] text-text-primary [text-wrap:balance]"
              style={{ fontWeight: 600 }}
            >
              Our principles.
            </h2>
            <p className="mt-4 max-w-[28em] text-[clamp(1rem,1.3vw,1.15rem)] leading-relaxed text-text-secondary">
              Values that shape every feature we ship.
            </p>
          </Reveal>
          <Principles />
        </div>
      </section>
    </MarketingShell>
  );
}
