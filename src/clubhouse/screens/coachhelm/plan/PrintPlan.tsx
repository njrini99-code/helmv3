'use client';

import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { clubhouseFontVariables } from '../../../lib/fonts';
import { PracticePlanSheet } from './sheet/PracticePlanSheet';
import type { PlanSheetModel } from './sheet/plan-sheet-model';

/** Browser print of the one sheet: a portal root, its paper size, two frames and the fonts, then `window.print()`; all gone on `afterprint`. */
export async function printPlan(plan: PlanSheetModel): Promise<void> {
  return printNode(<PracticePlanSheet plan={plan} density="print" />);
}

/** Any printed pages (the print studio's pick) through the same root and paper. */
export async function printNode(node: ReactNode): Promise<void> {
  // A second Print replaces the first; iOS often never fires afterprint in the home-screen app.
  document.querySelectorAll('.ch-cp-print-root').forEach((el) => el.remove());
  const host = document.createElement('div');
  // The font variables live on the Clubhouse root, which this host is outside of. Without them `--ch-font-sans` is invalid, every `font: var(--ch-type-*)`
  // falls back to the browser's default, and the sheet prints in one size of system type (seen in WebKit's print render, 10 Nov 2026).
  host.className = `ch-cp-print-root ${clubhouseFontVariables}`;
  // The print root sits outside the app's tree, and the type and space tokens live on this attribute.
  host.setAttribute('data-ui', 'clubhouse');
  document.body.appendChild(host);
  const paper = document.createElement('style');
  paper.textContent = '@page { margin: 16mm; }';
  document.head.appendChild(paper);
  const root = createRoot(host);
  flushSync(() => root.render(node));
  // iOS only honours print inside the tap, so it doesn't wait when the fonts are already in.
  if (document.fonts.status !== 'loaded') {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
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

/**
 * A real file: the sheet drawn to letter pages, offered to the system share sheet where it takes files and saved
 * everywhere else (FID-PRAC-6). `false` means nothing came of it, so the caller can say so and offer Print.
 */
export async function sharePlanPdf(plan: PlanSheetModel): Promise<boolean> {
  const host = document.createElement('div');
  host.className = `ch-cp-print-root ch-cp-pdf-root ${clubhouseFontVariables}`;
  host.setAttribute('data-ui', 'clubhouse');
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<PracticePlanSheet plan={plan} density="print" />));
    await document.fonts.ready;
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
    const canvas = await html2canvas(host, { scale: 2, backgroundColor: '#ffffff', windowWidth: 816 });
    const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 36;
    const w = pageW - margin * 2;
    const scale = w / canvas.width;
    const slice = Math.floor((pageH - margin * 2) / scale);
    for (let top = 0, page = 0; top < canvas.height; top += slice, page++) {
      const part = document.createElement('canvas');
      part.width = canvas.width;
      part.height = Math.min(slice, canvas.height - top);
      part.getContext('2d')?.drawImage(canvas, 0, -top);
      if (page) pdf.addPage();
      pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, w, part.height * scale);
    }
    const name = `${plan.title.replace(/[^\w ]+/g, '').trim() || 'Practice plan'}.pdf`;
    const file = new File([pdf.output('blob')], name, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: plan.title });
      } catch (e) {
        // Closing the share sheet isn't a failure.
        if ((e as Error).name !== 'AbortError') throw e;
      }
      return true;
    }
    pdf.save(name);
    return true;
  } catch {
    return false;
  } finally {
    root.unmount();
    host.remove();
  }
}
