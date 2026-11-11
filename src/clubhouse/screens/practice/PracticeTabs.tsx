'use client';

import { useRouter } from 'next/navigation';
import { useChPhone } from '../../lib/use-phone';
import { Segmented } from '../../ui/Segmented';

export type PracticeTab = 'plans' | 'drills' | 'groups' | 'templates';
const HREF: Record<PracticeTab, string> = { plans: '/golf/dashboard/practice', drills: '/golf/dashboard/practice/drills', groups: '/golf/dashboard/practice/groups', templates: '/golf/dashboard/practice/templates' };

/** Plans · Drills · Groups · Templates (N-00 4.1): each is a real address, so a tab survives a reload and Back. It fills a phone's width; on a Mac it hugs its labels at the page's left edge. */
export function PracticeTabs({ active }: { active: PracticeTab }) {
  const router = useRouter();
  const phone = useChPhone();
  return (
    <div className="ch-prc-tabs">
      <Segmented<PracticeTab>
        label="Practice"
        block={phone}
        value={active}
        redraws
        options={[
          { value: 'plans', label: 'Plans' },
          { value: 'drills', label: 'Drills' },
          { value: 'groups', label: 'Groups' },
          { value: 'templates', label: 'Templates' },
        ]}
        onChange={(v) => router.push(HREF[v])}
      />
    </div>
  );
}
