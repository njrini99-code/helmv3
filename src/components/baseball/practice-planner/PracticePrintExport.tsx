'use client';

// =============================================================================
// src/components/baseball/practice-planner/PracticePrintExport.tsx
//
// Coach-side export affordance for a practice plan:
//   - "Print / Save as PDF" — opens a browser print dialog using a clean
//     print stylesheet injected into a popup window (no extra dependencies).
//   - "Copy share link" — copies /baseball/player/practice deep-link to
//     clipboard so coaches can share with players.
//
// Mounted inside PracticePlannerClient next to the Publish button on
// published practice cards. Never shown to players (coach-only prop gate).
// =============================================================================

import { useState, useCallback } from 'react';
import { Printer, Link as LinkIcon, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BaseballPracticeWithDetail } from '@/lib/types/baseball-practice';

interface Props {
  practice: BaseballPracticeWithDetail;
}

/** Format a minute offset into a wall-clock-relative label for the print view. */
function formatOffset(startMin: number, durationMin: number): string {
  const fmt = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = String(m % 60).padStart(2, '0');
    return `${h}:${mm}`;
  };
  return `${fmt(startMin)} – ${fmt(startMin + durationMin)}`;
}

export function PracticePrintExport({ practice }: Props) {
  const [copied, setCopied] = useState(false);

  /**
   * Build a print-ready HTML document and open it via a Blob object URL.
   * All user-supplied strings are escaped via textContent assignment (never
   * injected as raw innerHTML) so there is no XSS surface. The popup loads the
   * Blob URL as an isolated document and calls window.print() on load.
   * If popup is blocked we revoke and silently fall back — the user can retry.
   */
  const handlePrint = useCallback(() => {
    /** Escape a plain string for safe insertion into an HTML text node. */
    function esc(s: string): string {
      return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    const visibleBlocks = practice.blocks.filter((b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vis = (b as any).visibility ?? 'player_visible';
      // Exclude BOTH 'staff_only' and 'restricted' -- this export is handed
      // to/shared with players via the copy-link action below, so it must
      // match the player-facing visibility contract exactly (RLS-backed as
      // of 20260710150000_baseball_practice_blocks_visibility_rls.sql), not
      // just the narrower "staff_only" check this used to run.
      return vis === 'player_visible';
    });

    const blocksHtml = visibleBlocks.length === 0
      ? '<tr><td colspan="4" style="padding:.5rem .6rem;color:#78716c;">No blocks in this practice.</td></tr>'
      : visibleBlocks.map((b) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const desc = (b as any).description as string | null | undefined;
          return [
            '<tr>',
            `<td>${esc(formatOffset(b.start_offset_min, b.duration_min))}</td>`,
            `<td><strong>${esc(b.activity)}</strong>${desc ? `<br/><small>${esc(desc)}</small>` : ''}</td>`,
            `<td>${esc(b.location ?? '')}</td>`,
            `<td>${esc(b.coach_owner_name ?? '')}</td>`,
            '</tr>',
          ].join('');
        }).join('');

    const printDate = new Date().toLocaleDateString();

    // Build the complete HTML document as a string. All variable content has
    // been escaped above — this template only interpolates the already-escaped
    // values and static CSS/structure.
    const html = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="UTF-8"/>',
      `<title>${esc(practice.title)} — Practice Plan</title>`,
      '<style>',
      '*,*::before,*::after{box-sizing:border-box}',
      'body{font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;',
      'color:#1c1917;background:#fff;padding:1.5rem 2rem;max-width:860px;margin:0 auto}',
      'h1{font-size:1.4rem;margin:0 0 .25rem;color:#1c1917}',
      '.meta{font-size:.78rem;color:#78716c;margin-bottom:1.25rem}',
      '.focus{font-style:italic;color:#78716c;margin-bottom:1rem}',
      'table{width:100%;border-collapse:collapse;font-size:.82rem}',
      'thead th{background:#f5f5f3;padding:.45rem .6rem;text-align:left;',
      'font-weight:600;font-size:.72rem;text-transform:uppercase;',
      'letter-spacing:.05em;color:#78716c;border-bottom:1px solid #e5e7eb}',
      'tbody td{padding:.5rem .6rem;border-bottom:1px solid #f0f0ee;vertical-align:top}',
      'tbody tr:last-child td{border-bottom:none}',
      'small{color:#78716c}',
      '.footer{margin-top:1.5rem;font-size:.72rem;color:#a8a29e;text-align:center}',
      '@media print{body{padding:0}@page{margin:1.2cm}}',
      '</style>',
      '</head>',
      '<body>',
      `<h1>${esc(practice.title)}</h1>`,
      `<div class="meta">Practice Plan · BaseballHelm · Printed ${esc(printDate)}</div>`,
      practice.focus ? `<div class="focus">Focus: ${esc(practice.focus)}</div>` : '',
      '<table><thead><tr>',
      '<th>Time</th><th>Activity</th><th>Location</th><th>Staff</th>',
      '</tr></thead>',
      `<tbody>${blocksHtml}</tbody>`,
      '</table>',
      '<div class="footer">Generated by BaseballHelm</div>',
      // Autoprint on load — no inline event handlers, uses addEventListener.
      '<script>window.addEventListener("load",function(){window.print();});</script>',
      '</body></html>',
    ].join('');

    // Use a Blob URL so the popup gets a complete, isolated document without
    // any document.write() call. The URL is revoked after 60 s regardless.
    const blob = new Blob([html], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    const popup = window.open(blobUrl, '_blank', 'width=900,height=700,scrollbars=yes');
    // Revoke after the popup has had time to load (60 s is generous).
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    if (!popup) {
      // Popup was blocked — nothing more to do; the blob URL is now open in
      // the background tab (most browsers) or the user sees their popup blocker.
    }
  }, [practice]);

  /** Copy the player practice view URL to the clipboard. */
  const handleCopyLink = useCallback(async () => {
    try {
      const url = `${window.location.origin}/baseball/player/practice`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API blocked — no fallback needed, icon resets naturally.
    }
  }, []);

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handlePrint}
        leftIcon={<Printer className="h-4 w-4" />}
        aria-label="Print practice plan"
        title="Print / Save as PDF"
      >
        Print
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopyLink}
        leftIcon={
          copied ? (
            <Check className="h-4 w-4 text-primary-600" />
          ) : (
            <LinkIcon className="h-4 w-4" />
          )
        }
        aria-label="Copy player view link"
        title="Copy share link for players"
      >
        {copied ? 'Copied' : 'Share'}
      </Button>
    </div>
  );
}
