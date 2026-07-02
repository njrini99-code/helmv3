'use client';

// =============================================================================
// src/components/baseball/import-center/ManualMapPanel.tsx
//
// Packet: qa-screens (Import Dossier + adapters — GAP 6: PDF manual-mapping bridge)
//
// The PDF source is preserve-only: parsePdfExtract recovers text but emits ZERO
// committable rows by design (the registry forbids low-confidence PDF extraction).
// Before this, the recovered text dead-ended in a read-only panel. This bridge lets
// a coach EDIT the recovered lines into a clean delimited block (or hand-enter rows)
// and routes them through the EXISTING FLAT previewImport/commitImport pipeline —
// so a hand-mapped PDF box score inherits matching, validation, dedupe, trust
// stamping, the timeline, review-hold AND rollback, exactly like any CSV.
//
// It does NOT commit here — it hands the edited text up to the parent, which feeds
// it as csvContent into the flat path. LIVING ANNUAL PRESENTATION — PaperCard,
// fairway Button, Reveal for the mount transition (the kit's Stage-0 interaction
// layer replaces the bespoke framer-motion fade this file used to hand-roll).
// =============================================================================

import { useMemo, useState } from 'react';

import { Button } from '@/components/fairway';
import { Input } from '@/components/ui/input';
import { IconFile, IconChevronRight } from '@/components/icons';
import { PaperCard, Eyebrow, InkBadge, Reveal } from '@/components/baseball/living-annual';

interface Props {
  /** The recovered PDF text, pre-loaded into the editor as a starting point. */
  preservedText: string;
  /** The original file name, surfaced so the coach knows the source ("from X.pdf"). */
  fileName: string;
  /** Confirm handler — receives the edited CSV/TSV block + a header line. */
  onConfirm: (csvBlock: string) => void;
  onCancel: () => void;
  busy?: boolean;
}

/**
 * A minimal header guess: most college box-score lines start with a player name
 * then numbers. We seed a sensible default header the coach can edit.
 */
const DEFAULT_HEADER = 'player,ab,h,r,rbi,bb,k,hr';

export function ManualMapPanel({
  preservedText,
  fileName,
  onConfirm,
  onCancel,
  busy,
}: Props) {
  const [header, setHeader] = useState(DEFAULT_HEADER);
  // Seed the body with the recovered text so the coach edits down, not up from blank.
  const [body, setBody] = useState(preservedText.trim());
  const [delimiter, setDelimiter] = useState<'comma' | 'tab' | 'whitespace'>('whitespace');

  // Normalize the edited body into a clean CSV block the flat parser reads. A
  // whitespace/tab block is collapsed to single commas so the generic CSV path
  // tokenizes it identically to a real spreadsheet export.
  const csvBlock = useMemo(() => {
    const lines = body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const toCsv = (line: string): string => {
      if (delimiter === 'comma') return line;
      if (delimiter === 'tab') return line.split('\t').map((c) => c.trim()).join(',');
      // whitespace: collapse runs of spaces/tabs.
      return line.split(/\s+/).map((c) => c.trim()).join(',');
    };
    const dataRows = lines.map(toCsv);
    return [header.trim(), ...dataRows].join('\n');
  }, [body, header, delimiter]);

  const rowCount = useMemo(
    () => csvBlock.split('\n').filter((l) => l.trim()).length - 1,
    [csvBlock],
  );
  const canConfirm = rowCount > 0 && header.trim().length > 0;

  return (
    <Reveal>
      <PaperCard className="space-y-5 px-6 py-6 sm:px-8 sm:py-8">
        {/* Editorial split header: machined source chip + intent copy. */}
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-fw-md border border-grade-plus/30 bg-grade-plus/[0.08] text-grade-plus">
            <IconFile size={18} />
          </span>
          <div className="min-w-0">
            <Eyebrow ink="team">Manual mapping</Eyebrow>
            <h3 className="mt-1 font-annual text-h3 font-semibold text-text-primary">
              Map the lines from {fileName || 'this PDF'}
            </h3>
            <p className="mt-1 text-body-sm leading-relaxed text-text-secondary">
              We never auto-commit numbers guessed from a PDF. Tidy the recovered lines below
              into one row per player, then they go through the same validation, matching and
              rollback as any spreadsheet import.
            </p>
          </div>
        </div>

        {/* Delimiter chooser — how the pasted lines separate columns. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
            Columns split by
          </span>
          {(
            [
              ['whitespace', 'Spaces'],
              ['tab', 'Tabs'],
              ['comma', 'Commas'],
            ] as const
          ).map(([val, label]) => (
            <Button
              key={val}
              type="button"
              size="sm"
              variant={delimiter === val ? 'primary' : 'ghost'}
              onClick={() => setDelimiter(val)}
              aria-pressed={delimiter === val}
            >
              {label}
            </Button>
          ))}
        </div>

        {/* Header row editor. */}
        <div>
          <label
            htmlFor="manualmap-header"
            className="mb-1.5 block text-body-sm font-medium text-text-primary"
          >
            Column headers (comma-separated)
          </label>
          <Input
            id="manualmap-header"
            value={header}
            onChange={(e) => setHeader(e.target.value)}
            placeholder={DEFAULT_HEADER}
            className="font-mono text-sm"
          />
          <p className="mt-1 text-caption text-text-tertiary">
            The first column should be the player name; the rest are stat columns.
          </p>
        </div>

        {/* Body editor: the recovered/hand-entered lines. */}
        <div>
          <label
            htmlFor="manualmap-body"
            className="mb-1.5 block text-body-sm font-medium text-text-primary"
          >
            One player per line
          </label>
          {/* eslint-disable-next-line helm/no-raw-input */}
          <textarea
            id="manualmap-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            spellCheck={false}
            className="w-full rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-3 py-2.5 font-mono text-xs leading-relaxed text-text-primary outline-none transition-colors focus:border-grade-plus focus-visible:ring-2 focus-visible:ring-grade-plus"
            placeholder={'Smith J  4 2 1 1 0 1 0\nDoe A    3 1 0 0 1 1 0'}
          />
          <p className="mt-1 text-caption text-text-tertiary">
            {rowCount > 0 ? (
              <InkBadge label={`${rowCount} row${rowCount === 1 ? '' : 's'} ready`} tone="team" />
            ) : (
              'Paste or edit the recovered lines above.'
            )}
          </p>
        </div>

        <div className="flex items-center justify-between pt-1">
          <Button variant="ghost" onClick={onCancel}>
            Back
          </Button>
          <Button
            onClick={() => onConfirm(csvBlock)}
            disabled={!canConfirm}
            busy={busy}
            rightIcon={<IconChevronRight size={16} />}
          >
            Map these lines
          </Button>
        </div>
      </PaperCard>
    </Reveal>
  );
}
