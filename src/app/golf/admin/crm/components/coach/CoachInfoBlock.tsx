'use client';

import { cn } from '@/lib/utils';
import {
  IconMail,
  IconPhone,
  IconUsers,
  IconClock,
  IconClipboardList,
  IconFileText,
  IconHash,
  IconEye as Monitor,
  IconNote as StickyNote,
  IconCalendar,
} from '@/components/icons';
import type { Coach } from '../../crm-config';

// ============================================================================
// CoachInfoBlock — left-column information panel for the per-coach page.
// Read-only summary of the same fields that CoachDetailPanel exposes inline:
// contact, internal comments, tags, key qualifying answers, follow-up.
// ============================================================================

interface CoachInfoBlockProps {
  coach: Coach;
}

function formatShort(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function CoachInfoBlock({ coach }: CoachInfoBlockProps) {
  const lastContacted = formatShort(coach.last_contacted_at);
  const nextFollowUp = formatShort(coach.next_follow_up_at);
  const isOverdue =
    coach.next_follow_up_at && new Date(coach.next_follow_up_at) < new Date();

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass overflow-hidden">
      <div className="px-5 py-4 border-b border-warm-100/60">
        <h2 className="text-sm font-semibold text-warm-900">Coach Info</h2>
      </div>

      {/* ── Contact ── */}
      <Section title="Contact">
        <Row icon={<IconMail size={12} />} label="Email">
          {coach.email ? (
            <a
              href={`mailto:${coach.email}`}
              className="text-blue-600 hover:text-blue-700 break-all"
            >
              {coach.email}
            </a>
          ) : (
            <Empty>None on file</Empty>
          )}
        </Row>
        <Row icon={<IconPhone size={12} />} label="Phone">
          {coach.phone ? (
            <a
              href={`tel:${coach.phone}`}
              className="text-primary-700 hover:text-primary-800"
            >
              {coach.phone}
            </a>
          ) : (
            <Empty>None on file</Empty>
          )}
        </Row>
        <Row icon={<IconClock size={12} />} label="Best time">
          {coach.best_contact_time ? coach.best_contact_time : <Empty>—</Empty>}
        </Row>
        <Row icon={<IconUsers size={12} />} label="Best method">
          {coach.best_contact_method ? coach.best_contact_method : <Empty>—</Empty>}
        </Row>
        {coach.timezone && (
          <Row icon={<IconClock size={12} />} label="Timezone">{coach.timezone}</Row>
        )}
      </Section>

      {/* ── Notes ── */}
      <Section title="Notes">
        {coach.notes ? (
          <p className="text-sm text-warm-700 whitespace-pre-wrap leading-relaxed">
            {coach.notes}
          </p>
        ) : (
          <Empty>No notes yet</Empty>
        )}
      </Section>

      {/* ── Internal comments ── */}
      <Section title="Internal Comments">
        {coach.internal_comments ? (
          <p className="text-sm text-warm-700 whitespace-pre-wrap leading-relaxed">
            {coach.internal_comments}
          </p>
        ) : (
          <Empty>None</Empty>
        )}
      </Section>

      {/* ── Tags ── */}
      <Section title="Tags">
        {coach.tags && coach.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {coach.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-700 rounded-md text-[11px] font-medium"
              >
                <IconHash size={10} />
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <Empty>No tags</Empty>
        )}
      </Section>

      {/* ── Pain points ── */}
      <Section title="Pain Points">
        {coach.pain_points && coach.pain_points.length > 0 ? (
          <ul className="space-y-1.5 text-sm text-warm-700">
            {coach.pain_points.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <span className="text-warm-300 mt-1">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>None recorded</Empty>
        )}
      </Section>

      {/* ── Qualifying ── */}
      <Section title="Qualifying">
        <Row icon={<IconUsers size={12} />} label="Team size">
          {coach.team_size ? (
            <span className="tabular-nums">{coach.team_size}</span>
          ) : (
            <Empty>—</Empty>
          )}
        </Row>
        <Row icon={<Monitor size={12} />} label="Software">
          {coach.current_software || <Empty>Unknown</Empty>}
        </Row>
        <Row icon={<IconClock size={12} />} label="Timeline">
          {coach.decision_timeline || <Empty>—</Empty>}
        </Row>
        <Row icon={<IconClipboardList size={12} />} label="Budget">
          {coach.budget_range || <Empty>—</Empty>}
        </Row>
      </Section>

      {/* ── Activity ── */}
      <Section title="Activity">
        <Row icon={<IconFileText size={12} />} label="Last contact">
          {lastContacted || <Empty>Never</Empty>}
        </Row>
        <Row icon={<IconCalendar size={12} />} label="Follow-up">
          {nextFollowUp ? (
            <span
              className={cn(
                'font-medium',
                isOverdue ? 'text-red-600' : 'text-warm-700',
              )}
            >
              {nextFollowUp}
              {isOverdue && ' (overdue)'}
            </span>
          ) : (
            <Empty>Not scheduled</Empty>
          )}
        </Row>
        <Row icon={<StickyNote size={12} />} label="Source">
          {coach.source || <Empty>Unknown</Empty>}
        </Row>
      </Section>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Subcomponents
// ----------------------------------------------------------------------------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-warm-100/40 last:border-b-0">
      <h3 className="text-[11px] font-semibold text-warm-500 uppercase tracking-wider mb-2">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="flex items-center gap-1.5 text-xs text-warm-400 w-24 flex-shrink-0 pt-0.5">
        {icon}
        <span>{label}</span>
      </span>
      <div className="flex-1 min-w-0 text-warm-700">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <span className="text-warm-400 italic">{children}</span>;
}
