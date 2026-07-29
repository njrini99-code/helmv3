'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  IconCheckCircle2,
  IconWarning,
  IconXCircle,
  IconChevronDown,
  IconShieldCheck,
} from '@/components/icons';
import {
  lintTemplate,
  type ComplianceLevel,
  type ComplianceReport,
} from '@/lib/crm/spam-compliance';

// ============================================================================
// SpamCompliancePanel — live CAN-SPAM + deliverability lint for the template
// editor. Pure client-side (lintTemplate is sync/deterministic); re-lints on
// every edit. Sits under the Live Preview in TemplateManager's right column.
// ============================================================================

const LEVEL_META: Record<
  ComplianceLevel,
  { label: string; pillClass: string; Icon: typeof IconCheckCircle2; iconClass: string }
> = {
  pass: {
    label: 'Compliant',
    pillClass: 'bg-accent-50 border-accent-200 text-accent-700',
    Icon: IconCheckCircle2,
    iconClass: 'text-accent-700',
  },
  warn: {
    label: 'Warnings',
    pillClass: 'bg-fw-warning-bg border-fw-warning-ring text-fw-warning-ink',
    Icon: IconWarning,
    iconClass: 'text-fw-warning',
  },
  fail: {
    label: 'Not compliant',
    pillClass: 'bg-fw-danger-bg border-fw-danger/25 text-fw-danger-ink',
    Icon: IconXCircle,
    iconClass: 'text-fw-danger',
  },
};

export function SpamCompliancePanel({
  subject,
  body,
  format,
}: {
  subject: string;
  body: string;
  format: 'plain' | 'html' | 'text';
}) {
  const [expanded, setExpanded] = useState(false);

  const report: ComplianceReport = useMemo(
    () => lintTemplate({ subject, body, format }),
    [subject, body, format],
  );

  const verdictMeta = LEVEL_META[report.verdict];
  const VerdictIcon = verdictMeta.Icon;
  const problems = report.checks.filter((c) => c.level !== 'pass');
  // Collapsed view shows problems only; expanded shows the full checklist.
  const visible = expanded ? report.checks : problems;

  return (
    <div className="rounded-card border border-border-subtle border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] overflow-clip">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle bg-surface-sunken/60">
        <IconShieldCheck size={14} className="text-accent-600" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Spam compliance
        </span>
        <span
          className={cn(
            'ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-eyebrow font-semibold',
            verdictMeta.pillClass,
          )}
        >
          <VerdictIcon size={11} aria-hidden />
          {verdictMeta.label} · {report.score}
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-3 text-xs text-text-tertiary">
          All checks pass — opt-out, postal address, honest subject, and healthy content.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle/80">
          {visible.map((c) => {
            const meta = LEVEL_META[c.level];
            const CheckIcon = meta.Icon;
            return (
              <li key={c.id} className="flex items-start gap-2.5 px-4 py-2.5">
                <CheckIcon size={14} className={cn('mt-0.5 flex-shrink-0', meta.iconClass)} aria-hidden />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text-primary">{c.label}</p>
                  <p className="text-xs text-text-secondary leading-relaxed">{c.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="px-4 py-2 border-t border-border-subtle">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setExpanded((v) => !v)}
          className="h-auto p-0 text-eyebrow text-text-tertiary hover:text-text-secondary flex items-center gap-1"
        >
          <IconChevronDown
            size={12}
            className={cn('transition-transform', expanded && 'rotate-180')}
            aria-hidden
          />
          {expanded ? 'Show problems only' : `Show all ${report.checks.length} checks`}
        </Button>
      </div>
    </div>
  );
}
