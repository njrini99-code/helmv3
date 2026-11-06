'use client';

import type { ReactNode } from 'react';
import { useChPhone } from '../../lib/use-phone';
import { LargeTitle, LargeTitleContext } from '../../ui/LargeTitle';

/**
 * The one head of a CoachHelm view (SYS-5): the large title and its scope line, with the view switch always in the same place. Under
 * the title on a phone; level with the scope on a desk, at the head's right. Team, Brief and Ask draw this, so their titles and
 * switches can't drift apart again.
 */
export function CoachHelmHead({ title, context, tabs }: { title: ReactNode; context?: ReactNode; tabs?: ReactNode }) {
  const phone = useChPhone();
  return (
    <header className={'ch-chd' + (phone ? ' is-phone' : ' is-desk')}>
      <div className="ch-chd__t">
        <LargeTitle>{title}</LargeTitle>
        {context && <LargeTitleContext>{context}</LargeTitleContext>}
      </div>
      {tabs && <div className="ch-chd__sw">{tabs}</div>}
    </header>
  );
}
