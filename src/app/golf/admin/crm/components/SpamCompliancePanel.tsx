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
    pillClass: 'bg-primary-50 border-primary-200 text-primary-700',
    Icon: IconCheckCircle2,
    iconClass: 'text-primary-600',
  },
  warn: {
    label: 'Warnings',
    pillClass: 'bg-amber-50 border-amber-200 text-amber-700',
    Icon: IconWarning,
    iconClass: 'text-amber-500',
  },
  fail: {
    label: 'Not compliant',
    pillClass: 'bg-red-50 border-red-200 text-red-700',
    Icon: IconXCircle,
    iconClass: 'text-red-500',
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
    <div className="rounded-2xl border border-warm-200/60 glass-standard overflow-clip">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-warm-200/60 bg-warm-50/40">
        <IconShieldCheck size={14} className="text-primary-500" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wider text-warm-600">
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
        <p className="px-4 py-3 text-xs text-warm-500">
          All checks pass — opt-out, postal address, honest subject, and healthy content.
        </p>
      ) : (
        <ul className="divide-y divide-warm-100/80">
          {visible.map((c) => {
            const meta = LEVEL_META[c.level];
            const CheckIcon = meta.Icon;
            return (
              <li key={c.id} className="flex items-start gap-2.5 px-4 py-2.5">
                <CheckIcon size={14} className={cn('mt-0.5 flex-shrink-0', meta.iconClass)} aria-hidden />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-warm-800">{c.label}</p>
                  <p className="text-xs text-warm-600 leading-relaxed">{c.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="px-4 py-2 border-t border-warm-100/80">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setExpanded((v) => !v)}
          className="h-auto p-0 text-eyebrow text-warm-500 hover:text-warm-700 flex items-center gap-1"
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
