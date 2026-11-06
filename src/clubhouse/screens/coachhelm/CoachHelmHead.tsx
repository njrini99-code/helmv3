'use client';

import type { ReactNode } from 'react';
import { useChPhone } from '../../lib/use-phone';
import { DeskTop } from '../../shell/phone-chrome';
import { LargeTitle, LargeTitleContext } from '../../ui/LargeTitle';

/**
 * The one head of a CoachHelm view (SYS-5), so Team, Brief and Ask can't drift apart. On a phone: the large title, its scope line, then
 * the view switch. On a desk: the switch and scope in the glass top bar, beside the section's name, as the design draws them, and the
 * page opens straight on its content; the title stays for assistive tech (FID-TEAM-3).
 */
export function CoachHelmHead({ title, context, scope, tabs }: { title: ReactNode; context?: ReactNode; scope?: ReactNode; tabs?: ReactNode }) {
  const phone = useChPhone();
  if (!phone)
    return (
      <>
        <h1 className="ch-sr-only">{title}</h1>
        <DeskTop>
          {tabs}
          {(scope ?? context) && <span className="ch-chd__scope">{scope ?? context}</span>}
        </DeskTop>
      </>
    );
  return (
    <header className="ch-chd is-phone">
      <div className="ch-chd__t">
        <LargeTitle>{title}</LargeTitle>
        {context && <LargeTitleContext>{context}</LargeTitleContext>}
      </div>
      {tabs && <div className="ch-chd__sw">{tabs}</div>}
    </header>
  );
}
