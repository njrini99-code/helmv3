'use client';

import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { PracticePlanSheet } from './sheet/PracticePlanSheet';
import type { PlanSheetModel } from './sheet/plan-sheet-model';

/** Browser print of the one sheet: a portal root, two frames and the fonts, then `window.print()`; gone on `afterprint`. */
export async function printPlan(plan: PlanSheetModel): Promise<void> {
  const host = document.createElement('div');
  host.className = 'ch-cp-print-root';
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(<PracticePlanSheet plan={plan} density="print" />));
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const done = () => {
    window.removeEventListener('afterprint', done);
    root.unmount();
    host.remove();
  };
  window.addEventListener('afterprint', done);
  window.print();
}
