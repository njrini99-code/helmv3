'use client';

/** Fairway · Recruiting · FairwayRecruitCard — read-only prospect card. */

import { GraduationCap, Mail, Phone, MapPin } from 'lucide-react';

import { Surface } from '@/components/fairway/surfaces/surface';
import { Avatar } from '@/components/fairway/controls/avatar';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import type { Recruit } from '@/app/golf/actions/recruiting';
import { recruitStatusMeta } from './recruit-status';

function formatLocation(hometown: string | null, state: string | null): string | null {
  if (hometown && state) return `${hometown}, ${state}`;
  return hometown || state || null;
}

export function FairwayRecruitCard({
  recruit,
  onClick,
}: {
  recruit: Recruit;
  onClick: () => void;
}) {
  const fullName = `${recruit.first_name}${recruit.last_name ? ` ${recruit.last_name}` : ''}`.trim();
  const location = formatLocation(recruit.hometown, recruit.state);
  const status = recruitStatusMeta(recruit.status);
  const hasContact = Boolean(recruit.email || recruit.phone || recruit.notes);

  return (
    <Surface elevation="border" padding="none" className="overflow-hidden">
      {/* Intentional raw <button>: the whole card is the click target wrapping
          warm Fairway chrome (Surface/Avatar/StatusPill). Routing through
          <Button> would impose pill-CTA padding/typography. Same exception the
          sibling FairwayIntentControl / InlineNotice take. */}
      {/* eslint-disable-next-line helm/no-raw-button */}
      <button
        type="button"
        onClick={onClick}
        aria-label={`Edit ${fullName || 'prospect'}`}
        className="block w-full p-5 text-left transition-colors hover:bg-surface-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        <div className="flex items-start gap-4">
          <Avatar name={fullName || '?'} size="lg" square />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate font-fw-display text-body-lg font-semibold tracking-[-0.01em] text-text-primary">
                  {fullName || 'Unnamed prospect'}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-fw-sans text-caption text-text-tertiary">
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <GraduationCap className="h-3.5 w-3.5" />
                    {recruit.hs_class ? `Class of ${recruit.hs_class}` : '—'}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{location ?? '—'}</span>
                  </span>
                </div>
              </div>
              <StatusPill tone={status.tone} className="shrink-0">
                {status.label}
              </StatusPill>
            </div>
          </div>
        </div>

        {hasContact ? (
          <div className="mt-4 space-y-2 border-t border-border-subtle pt-4">
            {recruit.email ? (
              <p className="flex items-center gap-2 truncate font-fw-sans text-body-sm text-text-secondary">
                <Mail className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                <span className="truncate">{recruit.email}</span>
              </p>
            ) : null}
            {recruit.phone ? (
              <p className="flex items-center gap-2 font-fw-sans text-body-sm tabular-nums text-text-secondary">
                <Phone className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                {recruit.phone}
              </p>
            ) : null}
            {recruit.notes ? (
              <p className="line-clamp-2 font-fw-sans text-body-sm leading-relaxed text-text-tertiary">
                {recruit.notes}
              </p>
            ) : null}
          </div>
        ) : null}
      </button>
    </Surface>
  );
}

export default FairwayRecruitCard;
