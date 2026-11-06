'use client';

import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { PracticePlanSheet } from './sheet/PracticePlanSheet';
import type { PlanSheetModel } from './sheet/plan-sheet-model';

/** Browser print of the one sheet: a portal root, its paper size, two frames and the fonts, then `window.print()`; all gone on `afterprint`. */
export async function printPlan(plan: PlanSheetModel): Promise<void> {
  // A second Print replaces the first; iOS often never fires afterprint in the home-screen app.
  document.querySelectorAll('.ch-cp-print-root').forEach((el) => el.remove());
  const host = document.createElement('div');
  host.className = 'ch-cp-print-root';
  document.body.appendChild(host);
  const paper = document.createElement('style');
  paper.textContent = '@page { margin: 16mm; }';
  document.head.appendChild(paper);
  const root = createRoot(host);
  flushSync(() => root.render(<PracticePlanSheet plan={plan} density="print" />));
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const done = () => {
    window.removeEventListener('afterprint', done);
    window.removeEventListener('focus', done);
    root.unmount();
    host.remove();
    paper.remove();
  };
  window.addEventListener('afterprint', done);
  window.addEventListener('focus', done);
  window.print();
}
