'use client';

// =============================================================================
// src/components/baseball/passport/ScoutPacketView.tsx
//
// V5 Scout Packet — the PUBLIC, college-coach-facing web packet (viewerRole
// 'other'). Spec §Scout Packet: player card · verified metrics · video links ·
// contact rules · source labels · notes if visible.
//
// This is what an UNAUTHENTICATED scout opens via a share link. It is composed
// deliberately for the scout's one job — evaluate the prospect fast and trust
// the numbers:
//   1. HERO          — who: name, class, positions, program, "as of" date.
//   2. MEASURABLES    — the proof grid; each carries its source/verification.
//   3. PERFORMANCE    — official season line (verified metrics).
//   4. VIDEO          — outbound, staff-approved clips.
//   5. NOTES          — only the moments the player chose to make visible.
//   6. CONTACT RULES  — how to (and how not to) reach out; always present.
// Plus a one-tap CSV download (V5 "CSV summary").
//
// Client component: the model is assembled server-side and passed as props.
// Client-side rendering lets us use framer-motion for cinematic section entrances
// (useReducedMotion respected). Cream/green GolfHelm look + primitives.
// No golf labels. Honest empty states; nothing fabricated.
// =============================================================================

import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';

import {
  IconShieldCheck,
  IconChartBar,
  IconVideo,
  IconExternalLink,
  IconCalendar,
  IconAlertCircle,
  IconClock,
} from '@/components/icons';
import { SourceTrustBadge } from '@/components/baseball/source-trust';
import type { ScoutPacketModel } from '@/lib/baseball/scout-packet-shared';
import { ScoutPacketCsvButton } from './ScoutPacketCsvButton';

function fmtRate(n: number | null): string {
  if (n === null) return '—';
  return n.toFixed(3).replace(/^0\./, '.');
}

// -----------------------------------------------------------------------------
// Unavailable state (expired / revoked / not exposed / not found)
// -----------------------------------------------------------------------------

const REASON_COPY: Record<string, { title: string; body: string }> = {
  not_found: {
    title: 'This scout packet link isn’t valid',
    body: 'The link may be mistyped or no longer exists. Ask the program for an updated link.',
  },
  expired: {
    title: 'This scout packet link has expired',
    body: 'Reach out to the program for a fresh link to view this player’s packet.',
  },
  revoked: {
    title: 'This scout packet link was turned off',
    body: 'The program revoked this link. Contact them directly to request access.',
  },
  not_exposed: {
    title: 'This packet isn’t shared right now',
    body: 'The player’s passport isn’t set to a public/scout state. Contact the program for access.',
  },
  error: {
    title: 'We couldn’t load this packet',
    body: 'Something went wrong on our end. Please try again in a moment.',
  },
};

function PacketUnavailable({ reason }: { reason: string }) {
  const copy = REASON_COPY[reason] ?? REASON_COPY.error!;
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-warm-100 text-warm-400">
        <IconShieldCheck size={28} />
      </span>
      <h1 className="text-xl font-semibold text-warm-900">{copy.title}</h1>
      <p className="mt-2 text-sm text-warm-500">{copy.body}</p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Section primitives
// -----------------------------------------------------------------------------

function SectionTitle({ icon, title, meta }: { icon: React.ReactNode; title: string; meta?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
          {icon}
        </span>
        <h2 className="text-sm font-semibold text-warm-800">{title}</h2>
      </div>
      {meta && <span className="text-eyebrow text-warm-400">{meta}</span>}
    </div>
  );
}

function SeasonStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-cream-50 px-3 py-2 text-center">
      <p className="text-eyebrow uppercase tracking-wide text-warm-400">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-warm-900">{value}</p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

export function ScoutPacketView({
  model,
  token = null,
}: {
  model: ScoutPacketModel;
  /** When set (public route), the CSV download is served via the tokenized route. */
  token?: string | null;
}) {
  const reduceMotion = useReducedMotion();

  if (!model.ok) return <PacketUnavailable reason={model.reason ?? 'error'} />;

  const generated = new Date(model.generatedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const season = model.season;

  const sectionVariants = {
    hidden: reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: reduceMotion ? 0 : i * 0.07, duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
    }),
  };

  return (
    <LazyMotion features={domAnimation} strict>
    <div className="min-h-dvh bg-cream-100">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:py-12">
        {/* ---- 1. HERO ---- */}
        <m.header
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          custom={0}
          className="rounded-3xl border border-warm-200 bg-cream-50 px-6 py-7 shadow-card sm:px-8"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-eyebrow font-semibold uppercase tracking-wide text-primary-600">
                <IconShieldCheck size={12} />
                Scout Packet
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-warm-900">
                {model.playerName ?? 'Player'}
              </h1>
              {model.headline && (
                <p className="mt-1.5 text-sm text-warm-500">{model.headline}</p>
              )}
            </div>
            {model.programName && (
              <div className="text-right">
                <p className="text-eyebrow uppercase tracking-wide text-warm-400">Program</p>
                <p className="text-sm font-medium text-warm-800">{model.programName}</p>
              </div>
            )}
          </div>

          {/* Identity chips */}
          {model.identity.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {model.identity.map((f) => (
                <span
                  key={f.key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-warm-200 bg-cream-50 px-3 py-1 text-sm text-warm-700"
                >
                  <span className="text-eyebrow uppercase tracking-wide text-warm-400">
                    {f.label}
                  </span>
                  <span className="font-medium text-warm-900">{f.value}</span>
                </span>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-warm-100 pt-4">
            <p className="flex items-center gap-1.5 text-eyebrow text-warm-400">
              <IconCalendar size={11} />
              As of {generated}
              {model.recipientLabel ? ` · Shared with ${model.recipientLabel}` : ''}
            </p>
            <ScoutPacketCsvButton token={token} model={model} />
          </div>
        </m.header>

        {/* ---- 2. MEASURABLES (the proof) ---- */}
        <m.section
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          custom={1}
          className="mt-6 rounded-2xl border border-warm-200 bg-cream-50 p-5 shadow-card sm:p-6"
        >
          <SectionTitle
            icon={<IconShieldCheck size={14} />}
            title="Verified Measurables"
            meta={model.measurables.length > 0 ? `${model.measurables.length}` : undefined}
          />
          {model.measurables.length === 0 ? (
            <p className="rounded-xl border border-dashed border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-500">
              No measurables shared on this packet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {model.measurables.map((msr) => (
                <div
                  key={msr.key}
                  className="rounded-xl border border-warm-200 bg-cream-50 px-4 py-3.5"
                >
                  <p className="text-eyebrow uppercase tracking-wide text-warm-400">{msr.label}</p>
                  <p className="mt-1 flex items-baseline gap-1 text-2xl font-semibold tabular-nums text-warm-900">
                    {msr.value}
                    <span className="text-sm font-medium text-warm-400">{msr.unit}</span>
                  </p>
                  <div className="mt-2 space-y-1.5">
                    <SourceTrustBadge trust={msr.trust} size="sm" />
                    <p className="flex items-center gap-1 text-eyebrow text-warm-400">
                      <IconCalendar size={10} />
                      {msr.eventDate ? `Captured ${msr.eventDate}` : 'No event on file'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </m.section>

        {/* ---- 3. PERFORMANCE ---- */}
        {season && !season.noData && (
          <m.section
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            custom={2}
            className="mt-6 rounded-2xl border border-warm-200 bg-cream-50 p-5 shadow-card sm:p-6"
          >
            <SectionTitle
              icon={<IconChartBar size={14} />}
              title="Performance"
              meta={`${season.seasonYear} · official only`}
            />
            {season.batting && (
              <div className="mb-4">
                <p className="mb-1.5 text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
                  Batting · {season.batting.g} G
                </p>
                <div className="grid grid-cols-4 gap-2">
                  <SeasonStat label="AVG" value={fmtRate(season.batting.avg)} />
                  <SeasonStat label="OBP" value={fmtRate(season.batting.obp)} />
                  <SeasonStat label="SLG" value={fmtRate(season.batting.slg)} />
                  <SeasonStat label="OPS" value={fmtRate(season.batting.ops)} />
                  <SeasonStat label="H" value={String(season.batting.h)} />
                  <SeasonStat label="HR" value={String(season.batting.hr)} />
                  <SeasonStat label="RBI" value={String(season.batting.rbi)} />
                  <SeasonStat label="K" value={String(season.batting.k)} />
                </div>
              </div>
            )}
            {season.pitching && (
              <div>
                <p className="mb-1.5 text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
                  Pitching · {season.pitching.g} G
                </p>
                <div className="grid grid-cols-4 gap-2">
                  <SeasonStat
                    label="ERA"
                    value={season.pitching.era != null ? season.pitching.era.toFixed(2) : '—'}
                  />
                  <SeasonStat
                    label="WHIP"
                    value={season.pitching.whip != null ? season.pitching.whip.toFixed(2) : '—'}
                  />
                  <SeasonStat label="IP" value={season.pitching.ip.toFixed(1)} />
                  <SeasonStat label="K" value={String(season.pitching.k)} />
                </div>
              </div>
            )}
            <p className="mt-3 text-eyebrow text-warm-400">
              Source: team box scores. Official games only; scrimmages excluded.
            </p>
          </m.section>
        )}

        {/* ---- 4. VIDEO ---- */}
        {model.videos.length > 0 && (
          <m.section
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            custom={3}
            className="mt-6 rounded-2xl border border-warm-200 bg-cream-50 p-5 shadow-card sm:p-6"
          >
            <SectionTitle
              icon={<IconVideo size={14} />}
              title="Video"
              meta={`${model.videos.length}`}
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {model.videos.map((v) => (
                <a
                  key={v.id}
                  href={v.url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex h-full flex-col overflow-hidden rounded-xl border border-warm-200 bg-cream-50 transition-all hover:border-primary-200 hover:shadow-card-hover"
                >
                  <div
                    className="relative flex aspect-video items-center justify-center bg-warm-100 bg-cover bg-center"
                    style={
                      v.thumbnailUrl
                        ? { backgroundImage: `url(${JSON.stringify(v.thumbnailUrl)})` }
                        : undefined
                    }
                  >
                    {!v.thumbnailUrl && <IconVideo size={22} className="text-warm-300" />}
                    <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-cream-50/90 text-primary-600 shadow-sm">
                      <IconExternalLink size={12} />
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-3">
                    <p className="line-clamp-2 text-sm font-medium text-warm-900">{v.title}</p>
                    <div className="mt-auto">
                      <SourceTrustBadge trust={v.trust} size="sm" />
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </m.section>
        )}

        {/* ---- 5. NOTES (if visible) ---- */}
        {model.visibleNotes.length > 0 && (
          <m.section
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            custom={4}
            className="mt-6 rounded-2xl border border-warm-200 bg-cream-50 p-5 shadow-card sm:p-6"
          >
            <SectionTitle icon={<IconClock size={14} />} title="Notes" />
            <ol className="space-y-3">
              {model.visibleNotes.map((n) => (
                <li key={n.id} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-400" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <p className="text-sm font-medium text-warm-900">{n.title}</p>
                      <span className="text-eyebrow text-warm-400">
                        {new Date(n.occurredAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="mt-1">
                      <SourceTrustBadge trust={n.trust} size="sm" />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </m.section>
        )}

        {/* ---- 6. CONTACT RULES (always present) ---- */}
        {model.contactRules && (
          <m.section
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            custom={5}
            className="mt-6 rounded-2xl border border-primary-100 bg-primary-50/50 p-5 sm:p-6"
          >
            <div className="flex items-start gap-2.5">
              <IconAlertCircle size={16} className="mt-0.5 shrink-0 text-primary-600" />
              <div>
                <h2 className="text-sm font-semibold text-warm-800">Contact</h2>
                <p className="mt-1 text-sm text-warm-600">{model.contactRules.note}</p>
                {model.contactRules.earlyProspect && (
                  <p className="mt-2 text-eyebrow font-medium text-amber-700">
                    Early prospect — confirm the applicable NCAA recruiting window before any
                    outreach.
                  </p>
                )}
              </div>
            </div>
          </m.section>
        )}

        <m.footer
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          custom={6}
          className="mt-8 text-center"
        >
          <p className="text-eyebrow text-warm-400">
            Source-backed packet · BaseballHelm. Every value carries its provenance.
          </p>
        </m.footer>
      </div>
    </div>
    </LazyMotion>
  );
}
