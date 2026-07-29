'use client';

import {
  IconArrowLeft,
  IconMail,
  IconPhone,
  IconCalendar,
  IconFileText,
  IconStar,
  IconExternalLink,
  IconClock,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import type { Coach } from '../../crm-config';
import { STATUS_CONFIG, STATUS_COLORS } from '../../crm-config';
import type { CoachEngagement } from '../../types/foundations';
import { EngagementBadge } from '../badges/EngagementBadge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';

// ============================================================================
// CoachPageHeader — top section of the per-coach detail page.
// Mirrors the header block of CoachDetailPanel (status pill + identity) but
// expanded for a full-page layout with action buttons (email / call / schedule
// / log contact). Read-only here; mutations are handled inline within the
// info / attachments blocks.
//
// Wave W2E: the visual chrome (glass plinth surface, back link, status row,
// identity block, action rail) is now the canonical `<PageHeader variant="plinth">`
// primitive. This component remains the domain-aware wrapper that maps a
// `Coach` record onto that primitive — every prop, action, branch, and visual
// is preserved.
// ============================================================================

interface CoachPageHeaderProps {
  coach: Coach;
  engagement?: CoachEngagement;
  /** Optional: override the back link (defaults to /golf/admin/crm). */
  backHref?: string;
  /**
   * Action handlers. Each defaults to a sensible "open in another surface"
   * behavior so the page is functional even if the parent doesn't wire them.
   */
  onLogContact?: () => void;
  onSchedule?: () => void;
}

function formatShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function CoachPageHeader({
  coach,
  engagement,
  backHref = '/golf/admin/crm',
  onLogContact,
  onSchedule,
}: CoachPageHeaderProps) {
  const statusCfg = STATUS_CONFIG[coach.status];
  const statusColors = STATUS_COLORS[coach.status];
  const isOverdue =
    coach.next_follow_up_at && new Date(coach.next_follow_up_at) < new Date();

  return (
    <PageHeader
      variant="plinth"
      backHref={backHref}
      backLabel="Back to CRM"
      backIcon={<IconArrowLeft size={14} />}
      status={
        <>
          {engagement && (
            <EngagementBadge coachId={coach.id} engagement={engagement} size="md" />
          )}
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
              statusColors?.bg,
              statusColors?.text,
              statusColors?.border,
            )}
          >
            {statusCfg?.iconLabel}
            {statusCfg?.label ?? coach.status}
          </span>
        </>
      }
      titleIcon={
        coach.is_starred ? (
          <IconStar
            size={18}
            className="fill-fw-warning text-fw-warning flex-shrink-0"
          />
        ) : undefined
      }
      title={coach.name}
      titleMeta={coach.title ? <>· {coach.title}</> : undefined}
      meta={
        <>
          <span className="font-medium">{coach.school}</span>
          {coach.conference && (
            <>
              <span className="text-text-tertiary">·</span>
              <span>{coach.conference}</span>
            </>
          )}
          {coach.division && (
            <>
              <span className="text-text-tertiary">·</span>
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded text-eyebrow font-bold',
                  coach.division === 'D2'
                    ? 'bg-surface-sunken text-text-secondary'
                    : 'bg-accent-100 text-accent-700',
                )}
              >
                {coach.division}
              </span>
            </>
          )}
          {coach.program && (
            <>
              <span className="text-text-tertiary">·</span>
              <span className="capitalize">
                {coach.program === 'mens'
                  ? "Men's"
                  : coach.program === 'womens'
                    ? "Women's"
                    : 'Both programs'}
              </span>
            </>
          )}
        </>
      }
      callout={
        isOverdue && coach.next_follow_up_at ? (
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-fw-sm bg-fw-danger-bg/80 border border-fw-danger/25/40">
            <IconClock size={12} className="text-fw-danger" />
            <span className="text-eyebrow font-medium text-fw-danger-ink">
              Overdue follow-up · {formatShort(coach.next_follow_up_at)}
            </span>
          </div>
        ) : undefined
      }
      actions={
        <>
          {coach.email ? (
            <a
              href={`mailto:${coach.email}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-fw-md bg-accent-650 text-text-on-accent hover:bg-accent-700 transition-colors shadow-flat"
            >
              <IconMail size={14} /> Email
            </a>
          ) : (
            <Button variant="ghost"
              type="button"
              disabled
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-fw-md bg-surface-sunken text-text-tertiary cursor-not-allowed"
              title="No email on file"
            >
              <IconMail size={14} /> Email
            </Button>
          )}
          {coach.phone ? (
            <a
              href={`tel:${coach.phone}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-fw-md bg-surface border border-border-subtle text-text-secondary hover:bg-surface-sunken transition-colors"
            >
              <IconPhone size={14} /> Call
            </a>
          ) : (
            <Button variant="ghost"
              type="button"
              disabled
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-fw-md bg-surface-sunken text-text-tertiary cursor-not-allowed"
              title="No phone on file"
            >
              <IconPhone size={14} /> Call
            </Button>
          )}
          {onSchedule && (
            <Button variant="ghost"
              type="button"
              onClick={onSchedule}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-fw-md bg-surface border border-border-subtle text-text-secondary hover:bg-surface-sunken transition-colors"
            >
              <IconCalendar size={14} /> Schedule
            </Button>
          )}
          {onLogContact && (
            <Button variant="ghost"
              type="button"
              onClick={onLogContact}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-fw-md bg-surface border border-border-subtle text-text-secondary hover:bg-surface-sunken transition-colors"
            >
              <IconFileText size={14} /> Log Contact
            </Button>
          )}
          {coach.athletics_url && (
            <a
              href={coach.athletics_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-fw-md bg-surface border border-border-subtle text-text-secondary hover:bg-surface-sunken transition-colors"
            >
              <IconExternalLink size={14} /> Staff Page
            </a>
          )}
        </>
      }
    />
  );
}
