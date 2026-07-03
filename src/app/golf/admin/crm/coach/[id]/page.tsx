import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCoachEngagement } from '@/app/golf/actions/crm-engagement';
import type { Coach } from '../../crm-config';
import { CoachPageHeader } from '../../components/coach/CoachPageHeader';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { CoachInfoBlock } from '../../components/coach/CoachInfoBlock';
import { CoachAttachmentsBlock } from '../../components/coach/CoachAttachmentsBlock';
import { CoachTimeline } from '../../components/timeline/CoachTimeline';

// ============================================================================
// /golf/admin/crm/coach/[id]
// ----------------------------------------------------------------------------
// Full-page server-rendered detail view for one coach. Mirrors the data the
// CoachDetailPanel side-sheet hydrates lazily, but laid out for a primary
// surface (header + 2-column body + timeline).
//
// Admin auth is enforced by the parent CRM layout
// (src/app/golf/admin/crm/layout.tsx). This page only needs to load coach
// data and render.
// ============================================================================

export const metadata: Metadata = {
  title: 'Coach · CRM',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CoachDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();

  const supabase = await createClient();
  // Pull every column we ever surface in the detail panel — list-view
  // narrowing is not worth it on a single-row read.
  const { data: row, error } = await supabase
    .from('crm_coaches')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !row) {
    notFound();
  }

  // The DB row uses Postgres types directly; cast to the shared Coach shape.
  // Default missing nullables defensively so downstream components don't blow
  // up on partial rows from older inserts.
  const coach: Coach = {
    id: row.id,
    name: row.name ?? '',
    title: row.title ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    school: row.school ?? '',
    conference: row.conference ?? '',
    division: (row.division ?? 'D3') as Coach['division'],
    program: (row.program ?? 'mens') as Coach['program'],
    status: (row.status ?? 'new_lead') as Coach['status'],
    priority: row.priority ?? 0,
    highlight_color: row.highlight_color ?? null,
    is_starred: row.is_starred ?? false,
    notes: row.notes ?? null,
    internal_comments: row.internal_comments ?? null,
    tags: row.tags ?? null,
    team_size: row.team_size ?? null,
    current_software: row.current_software ?? null,
    budget_range: row.budget_range ?? null,
    decision_timeline: row.decision_timeline ?? null,
    pain_points: row.pain_points ?? null,
    best_contact_method: row.best_contact_method ?? null,
    best_contact_time: row.best_contact_time ?? null,
    timezone: row.timezone ?? null,
    last_contacted_at: row.last_contacted_at ?? null,
    next_follow_up_at: row.next_follow_up_at ?? null,
    email_status: (row.email_status ?? 'unknown') as Coach['email_status'],
    source: row.source ?? null,
    is_archived: row.is_archived ?? false,
    archived_at: row.archived_at ?? null,
    archived_by: row.archived_by ?? null,
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
    athletics_url: row.athletics_url ?? null,
    role_level: row.role_level ?? null,
    is_primary_contact: row.is_primary_contact ?? false,
  };

  // Engagement is best-effort: if the materialized view hasn't been
  // refreshed yet (e.g. just-imported coach) the badge falls back to "—".
  let engagement = undefined;
  try {
    const map = await getCoachEngagement([coach.id]);
    engagement = map[coach.id];
  } catch {
    // Non-fatal — see comment above.
  }

  return (
    <main className="min-h-dvh bg-cream-100">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <Breadcrumb
          items={[
            { label: 'CRM', href: '/golf/admin/crm' },
            { label: 'Coach', href: '/golf/admin/crm' },
            { label: coach.name },
          ]}
        />
        <CoachPageHeader coach={coach} engagement={engagement} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ── Left column: info + attachments ── */}
          <div className="lg:col-span-1 space-y-5">
            <CoachInfoBlock coach={coach} />
            <CoachAttachmentsBlock coachId={coach.id} />
          </div>

          {/* ── Right column: timeline ── */}
          <div className="lg:col-span-2">
            <div className="glass-standard rounded-2xl shadow-glass overflow-hidden">
              <div className="px-5 py-4 border-b border-warm-100/60">
                <h2 className="text-sm font-semibold text-warm-900">Timeline</h2>
                <p className="text-xs text-warm-500 mt-0.5">
                  Combined activity from outreach, email events, notes, tasks,
                  and scheduled events.
                </p>
              </div>
              <div className="px-5 py-5">
                <CoachTimeline coachId={coach.id} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
