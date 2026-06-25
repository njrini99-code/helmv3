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
// it as csvContent into the flat path. Cream/green tokens, GolfHelm primitives.
// =============================================================================

import { useMemo, useState } from 'react';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconFile, IconChevronRight } from '@/components/icons';

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
  const prefersReducedMotion = useReducedMotion();
  const [header, setHeader] = useState(DEFAULT_HEADER);
  // Seed the body with the recovered text so the coach edits down, not up from blank.
  const [body, setBody] = useState(preservedText.trim());
  const [delimiter, setDelimiter] = useState<'comma' | 'tab' | 'whitespace'>('whitespace');

  const fade = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const },
      };

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
    <LazyMotion features={domAnimation}>
      <m.div {...fade}>
        <Card variant="overlay" hover={false} padding="lg">
          <CardContent className="space-y-5 p-0">
            {/* Editorial split header: machined source chip + intent copy. */}
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
                <IconFile size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-eyebrow font-semibold uppercase tracking-wide text-warm-500">
                  Manual mapping
                </p>
                <h3 className="text-lg font-semibold text-warm-900">
                  Map the lines from {fileName || 'this PDF'}
                </h3>
                <p className="mt-0.5 text-sm text-warm-600">
                  We never auto-commit numbers guessed from a PDF. Tidy the recovered lines below
                  into one row per player, then they go through the same validation, matching and
                  rollback as any spreadsheet import.
                </p>
              </div>
            </div>

            {/* Delimiter chooser — how the pasted lines separate columns. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-eyebrow font-semibold uppercase tracking-wide text-warm-500">
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
                className="mb-1.5 block text-sm font-medium text-warm-700"
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
              <p className="mt-1 text-xs text-warm-500">
                The first column should be the player name; the rest are stat columns.
              </p>
            </div>

            {/* Body editor: the recovered/hand-entered lines. */}
            <div>
              <label
                htmlFor="manualmap-body"
                className="mb-1.5 block text-sm font-medium text-warm-700"
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
                className="w-full rounded-xl border border-warm-200 bg-cream-50 px-3 py-2.5 font-mono text-xs leading-relaxed text-warm-800 outline-none transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                placeholder={'Smith J  4 2 1 1 0 1 0\nDoe A    3 1 0 0 1 1 0'}
              />
              <p className="mt-1 text-xs text-warm-500">
                {rowCount > 0
                  ? `${rowCount} row${rowCount === 1 ? '' : 's'} ready to map.`
                  : 'Paste or edit the recovered lines above.'}
              </p>
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button variant="ghost" onClick={onCancel}>
                Back
              </Button>
              <Button
                onClick={() => onConfirm(csvBlock)}
                disabled={!canConfirm}
                isLoading={busy}
                className="group"
              >
                Map these lines
                <IconChevronRight
                  size={16}
                  className="ml-1 transition-transform group-hover:translate-x-0.5"
                />
              </Button>
            </div>
          </CardContent>
        </Card>
      </m.div>
    </LazyMotion>
  );
}
