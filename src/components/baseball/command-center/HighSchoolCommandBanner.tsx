// =============================================================================
// src/components/baseball/command-center/HighSchoolCommandBanner.tsx
//
// Parity gap closure (v2 spec §Screen Acceptance: "help staff decide what
// matters today" applies to ALL coach types, not just college/JUCO).
//
// HS / Showcase / Org coaches cannot access the full recruiting-oriented Command
// Center (no pipeline, no recruit analytics) but DO need a daily-management
// surface. This server component renders a scoped, honest view that surfaces
// the core management cards (Roster, Calendar, Tasks, Practice, Signals) with
// clear labeling of what is and is not available at their coach type — no blank
// dashboard, no unexplained redirect.
//
// Design: cream #FFFEFA bg + green #16A34A accents, glass cards, skeleton-free
// (it is used as a direct return from the server page, no Suspense wrapping).
// =============================================================================

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  IconUsers,
  IconCalendar,
  IconList,
  IconClipboardList,
  IconShieldAlert,
  IconChartBar,
  IconInfo,
  IconChevronRight,
} from '@/components/icons';

interface HighSchoolCommandBannerProps {
  coachType: string;
}

type QuickLink = {
  href: string;
  label: string;
  description: string;
  icon: ReactNode;
  iconBg: string;
};

function labelFor(coachType: string): string {
  if (coachType === 'showcase') return 'Showcase / Travel Ball';
  if (coachType === 'high_school') return 'High School';
  return 'Coaching';
}

export function HighSchoolCommandBanner({ coachType }: HighSchoolCommandBannerProps) {
  const typeLabel = labelFor(coachType);

  const links: QuickLink[] = [
    {
      href: '/baseball/dashboard/roster',
      label: 'Roster',
      description: 'Manage your players and team membership',
      icon: <IconUsers size={18} className="text-primary-600" />,
      iconBg: 'bg-primary-600/10',
    },
    {
      href: '/baseball/dashboard/calendar',
      label: 'Calendar',
      description: 'Schedule practices, games, and events',
      icon: <IconCalendar size={18} className="text-primary-600" />,
      iconBg: 'bg-primary-600/10',
    },
    {
      href: '/baseball/dashboard/tasks',
      label: 'Tasks',
      description: 'Open assignments and pending actions',
      icon: <IconList size={18} className="text-amber-600" />,
      iconBg: 'bg-amber-500/10',
    },
    {
      href: '/baseball/dashboard/practice',
      label: 'Practice Planner',
      description: 'Build, publish, and track daily practice',
      icon: <IconClipboardList size={18} className="text-primary-600" />,
      iconBg: 'bg-primary-600/10',
    },
    {
      href: '/baseball/dashboard/signals',
      label: 'Signals',
      description: 'Staff-facing risk flags and player alerts',
      icon: <IconShieldAlert size={18} className="text-red-500" />,
      iconBg: 'bg-red-500/10',
    },
    {
      href: '/baseball/dashboard/stats',
      label: 'Team Stats',
      description: 'Session results, batting averages, and trends',
      icon: <IconChartBar size={18} className="text-warm-600" />,
      iconBg: 'bg-warm-200/80',
    },
  ];

  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-warm-900">Command Center</h1>
          <p className="text-warm-500 mt-1 text-sm">{typeLabel} staff view</p>
        </div>

        {/* ── Scope banner (honest, no blank dashboard) ───────────────────── */}
        <div className="flex items-start gap-3 bg-primary-50 border border-primary-200/70 rounded-2xl p-4 mb-8">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600/10 flex-shrink-0 mt-0.5">
            <IconInfo size={16} className="text-primary-600" />
          </span>
          <div>
            <p className="text-sm font-semibold text-primary-900">
              {typeLabel} Command Center
            </p>
            <p className="text-xs text-primary-700 mt-0.5 leading-relaxed">
              The full recruiting pipeline and analytics surfaces are available to
              college and JUCO coaching staff. Your management surfaces — Roster,
              Calendar, Practice, Tasks, and Signals — are all linked below.
            </p>
          </div>
        </div>

        {/* ── Quick-link grid (the real day-to-day surfaces) ──────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex items-center gap-4 bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-5
                         hover:bg-white/90 hover:shadow-md active:scale-[0.99] transition-all duration-150"
            >
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl flex-shrink-0 ${link.iconBg}`}>
                {link.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-warm-900 text-sm">{link.label}</p>
                <p className="text-xs text-warm-500 mt-0.5 truncate">{link.description}</p>
              </div>
              <IconChevronRight size={16} className="text-warm-300 group-hover:text-warm-500 transition-colors flex-shrink-0" />
            </Link>
          ))}
        </div>

        {/* ── Footer note ─────────────────────────────────────────────────── */}
        <p className="text-xs text-warm-400 text-center mt-10">
          Need the full Command Center?{' '}
          <Link href="/baseball/dashboard/settings/program" className="text-primary-600 hover:text-primary-700 font-medium transition-colors">
            Check program settings
          </Link>
          {' '}to review your coach type.
        </p>
      </div>
    </div>
  );
}
