import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Surface, StatusPill, type FwStatusTone } from '@/components/fairway';
import type { TriageSeverity } from '@/lib/admin/data/triage';
import { INCIDENT_CLASS_LABEL } from '@/lib/admin/incident-classification';
import { featureLabelFor } from '@/lib/admin/incident-report';
import type { FingerprintForensics } from '@/lib/admin/data/errors';
import { FieldCopy } from './FieldCopy';

/**
 * Structured forensics grid — every field the raw event already carries but
 * this page never surfaced: severity, classification, PG error code + hint,
 * resolved source file, request id, runtime, handled/unhandled, sport/
 * feature/source/action, and (when present) a flight-trace deep link. Every
 * value gets its own FieldCopy so an operator can grab exactly the one thing
 * they need without selecting text by hand.
 *
 * Absent fields render as FieldCopy's own explicit em-dash — never invented,
 * never silently omitted, so the grid always shows the full shape of what
 * is/isn't known for this incident (same contract buildIncidentReport keeps
 * for the copied markdown version of this same data).
 *
 * Plain function component (no 'use client') — every interactive bit lives
 * inside FieldCopy, so this renders directly from the page's Server
 * Component tree without paying for a client boundary on the grid itself.
 * Mobile: a single-column grid below `sm` — a stack of labelled rows,
 * exactly the shape Mobile Doctrine wants for a field list (as opposed to a
 * horizontal KPI rail, which is the wrong shape for label:value pairs).
 */

const SEVERITY_TONE: Record<TriageSeverity, FwStatusTone> = {
  critical: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
};

function severityTone(severity: string): FwStatusTone {
  return SEVERITY_TONE[severity as TriageSeverity] ?? 'neutral';
}

function Field({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-fw-md bg-surface-sunken px-3 py-2">
      <p className="text-caption uppercase tracking-widest text-warm-500">{label}</p>
      <FieldCopy label={label} value={value} mono={mono} className="mt-0.5" />
    </div>
  );
}

export function ForensicsHeader({ forensics }: { forensics: FingerprintForensics }) {
  const tracerHref = forensics.helmTraceId
    ? `/admin/golf/tracer?trace=${encodeURIComponent(forensics.helmTraceId)}`
    : null;
  const featureLabel = featureLabelFor(forensics.feature);

  // Partition once: the grid renders what has a value, the footnote names
  // what does not. `mono` stays undefined where Field's own default applies.
  const fields: Array<{ label: string; value: string | null; mono?: boolean }> = [
    { label: 'Error code', value: forensics.errorCode },
    { label: 'Error hint', value: forensics.errorHint, mono: false },
    { label: 'Source file', value: forensics.sourceFilePath },
    { label: 'Request id', value: forensics.requestId },
    { label: 'Trace id', value: forensics.helmTraceId },
    { label: 'Runtime', value: forensics.runtime },
    {
      label: 'Handled',
      value: forensics.handled === null ? null : forensics.handled ? 'yes' : 'no — unhandled',
      mono: false,
    },
    { label: 'Sport', value: forensics.sport, mono: false },
    {
      label: 'Feature',
      value: forensics.feature ? `${featureLabel ?? forensics.feature} (${forensics.feature})` : null,
      mono: false,
    },
    { label: 'Source', value: forensics.source, mono: false },
    { label: 'Action', value: forensics.actionName },
  ];
  const present = fields.filter((f) => f.value !== null && f.value !== '');
  const notCaptured = fields
    .filter((f) => f.value === null || f.value === '')
    .map((f) => f.label.toLowerCase());

  return (
    <Surface padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warm-200 pb-2">
        <h2 className="text-eyebrow uppercase text-warm-500">Forensics</h2>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={severityTone(forensics.severity)} dot size="sm">
            {forensics.severity}
          </StatusPill>
          <span
            className="rounded bg-warm-100 px-1.5 py-0.5 text-eyebrow uppercase text-warm-600"
            title={forensics.classification.reason}
          >
            {INCIDENT_CLASS_LABEL[forensics.classification.klass]}
          </span>
        </div>
      </div>

      {/* PRESENT FIELDS ONLY.
          All eleven used to render unconditionally, each as its own bordered
          box with an em-dash when absent. On a phone the grid is one column,
          so a client-origin incident — which populates almost none of them;
          measured 2026-08-27, errorCode sits on 2.9% of error-severity rows
          and errorHint on 2.6% — produced a screen of eight identical empty
          boxes before any real content.

          The honesty contract that put an explicit em-dash there rather than
          hiding a field is RIGHT and is kept: absence is still stated, once,
          on the `notCaptured` line below. What changed is that saying it
          eight times in eight boxes buries the two or three fields that DO
          carry a value, which is the opposite of what the panel is for. */}
      {present.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
          {present.map((f) => (
            <Field key={f.label} label={f.label} value={f.value} mono={f.mono} />
          ))}
        </div>
      ) : null}

      {notCaptured.length > 0 ? (
        <p className="mt-3 text-caption leading-5 text-warm-500">
          <span className="uppercase tracking-widest">Not captured</span>{' '}
          <span className="font-fw-mono">{notCaptured.join(' · ')}</span>
          {' — '}
          absent on this incident, not hidden. A field is populated only when the call site passes it.
        </p>
      ) : null}

      {tracerHref ? (
        <Link
          href={tracerHref}
          className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm text-accent-700 underline"
        >
          Open flight trace <ArrowUpRight size={14} aria-hidden />
        </Link>
      ) : null}
    </Surface>
  );
}
