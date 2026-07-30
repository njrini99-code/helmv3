// =============================================================================
// src/app/baseball/(dashboard)/dashboard/practice-effectiveness/page.tsx
//
// Packet: practice-effectiveness (BaseballHelm CoachHelm Engine)
//
// Server entry for the Practice Effectiveness surface. The nav-registry
// 'practice-effectiveness' entry points here; without this page.tsx that link
// 404s.
//
// Auth + active-team + capability are resolved server-side inside
// getPracticeEffectivenessData (it runs getActiveBaseballContext + a
// can_manage_practice capability check and returns an honest authorized:false
// envelope for anyone who is not staff with that capability). This route is for
// COACHES; the read model is the in-process gate and RLS is the backstop.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getPracticeEffectivenessData } from '@/lib/baseball/read-models/practice-effectiveness';
import { PracticeEffectivenessClient } from '@/components/baseball/practice-effectiveness/PracticeEffectivenessClient';
import { EditorsLetter } from '@/components/baseball/living-annual';
import { fairwayScope } from '@/lib/redesign/flag';

export const metadata = {
  title: 'Practice Effectiveness | Helm Baseball',
  description: 'Did what you practiced transfer to performance? Honest, source-backed measurement.',
};

export default async function PracticeEffectivenessPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/baseball/login?returnTo=/baseball/dashboard/practice-effectiveness');
  }

  const data = await getPracticeEffectivenessData();

  if (!data.authorized) {
    // Honest, non-leaking gate: a non-staff viewer sees a clear message, not a
    // crash and not someone else's coaching intelligence. Composed through
    // <EditorsLetter> per the empty-state doctrine — never a bare "access
    // denied" box.
    return (
      <div className={fairwayScope('min-h-full')}>
        <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
          <EditorsLetter
            title="Coaches only"
            body="Practice effectiveness is staff coaching intelligence. Ask a head coach for practice-management access to view it."
          />
        </div>
      </div>
    );
  }

  if (data.readFailed) {
    // The reviews query failed. Rendering the client here would paint an
    // all-zeros summary — 0 improved, 0 worse, 0 stable — which on THIS screen
    // reads as "none of your practice plan moved anything". That verdict is the
    // whole product of this page, so it must never be synthesised from a failed
    // read. Same EditorsLetter treatment as the gate above, different cause.
    return (
      <div className={fairwayScope('min-h-full')}>
        <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
          <EditorsLetter
            title="Measurements couldn't be loaded"
            body="Your practice-effectiveness reviews didn't come back this time. Nothing has changed and nothing has been lost — reload in a moment. (An empty page here would have read as 'nothing worked', which is not what happened.)"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={fairwayScope('min-h-full')}>
      <PracticeEffectivenessClient
        reviews={data.reviews}
        focusRollup={data.focusRollup}
        summary={data.summary}
      />
    </div>
  );
}
