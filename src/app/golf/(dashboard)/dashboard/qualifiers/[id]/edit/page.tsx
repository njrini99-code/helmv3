import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayEditQualifier } from '@/components/fairway/pages/qualifiers/FairwayEditQualifier';
import { getQualifierRoundCourses } from '@/app/golf/actions/golf';

export const metadata: Metadata = {
  title: 'Edit Qualifier | Helm Sports',
  description: 'Edit an existing team qualifier',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditQualifierPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  // Coach-only surface — a player landing here (direct link) is sent back to
  // the read-only detail page rather than an error.
  if (session.role !== 'coach') redirect(`/golf/dashboard/qualifiers/${id}`);

  const supabase = await createClient();

  const { data: qualifier } = await supabase
    .from('golf_qualifiers')
    .select(
      'id, name, description, course_name, rules, start_date, end_date, entry_deadline, spots_available, num_rounds'
    )
    .eq('id', id)
    .maybeSingle();

  if (!qualifier) {
    notFound();
  }

  const roundCourses = await getQualifierRoundCourses(id);

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayEditQualifier
        qualifierId={id}
        initial={{
          name: qualifier.name,
          description: qualifier.description ?? null,
          courseName: qualifier.course_name ?? null,
          rules: qualifier.rules ?? null,
          startDate: qualifier.start_date,
          endDate: qualifier.end_date ?? null,
          entryDeadline: qualifier.entry_deadline ?? null,
          spotsAvailable: qualifier.spots_available ?? null,
          numRounds: qualifier.num_rounds ?? 1,
        }}
        roundCourses={roundCourses}
      />
    </div>
  );
}
