'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  IconX,
  IconMail,
  IconAlertCircle,
  IconCheckCircle2,
  IconLoader,
  IconCheck,
  IconSend,
  IconExternalLink,
  IconCopy,
  IconEye,
  IconChevronDown,
  IconSparkles,
} from '@/components/icons';
import type { Coach } from '../crm-config';
import { TemplatePicker } from './TemplatePicker';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { isSuppressedEmailStatus } from '@/app/golf/admin/crm/page-contracts';
import { getSuppressions } from '@/app/golf/actions/crm-foundations';

type PrefilledRecipient = {
  email: string;
  name?: string | null;
  coach_id?: string | null;
};

interface BulkEmailModalProps {
  coaches: Coach[];
  onClose: () => void;
  onSuccess: () => void;
  prefilledRecipients?: PrefilledRecipient[];
}

type SendMode = 'gmail' | 'helm';

interface HelmSendResult {
  sent: number;
  skipped: number;
  failed: number;
  details?: Array<{ name: string; email: string; status: 'sent' | 'skipped' | 'failed'; reason?: string }>;
}

const MERGE_TAGS = [
  { label: '{name}', value: '{name}' },
  { label: '{first_name}', value: '{first_name}' },
  { label: '{last_name}', value: '{last_name}' },
  { label: '{email}', value: '{email}' },
  { label: '{school}', value: '{school}' },
  { label: '{conference}', value: '{conference}' },
  { label: '{title}', value: '{title}' },
  { label: '{division}', value: '{division}' },
] as const;

export function BulkEmailModal({ coaches, onClose, onSuccess, prefilledRecipients }: BulkEmailModalProps) {
  const [mode, setMode] = useState<SendMode>('helm');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  // Body format: 'plain' (wrapped in greeting/signature shell), 'html' (full
  // HTML document, replaces the entire email), or 'text' (true text/plain — no
  // shell, no logo; body is self-contained). Set by template selection; defaults
  // back to 'plain' on Clear.
  const [bodyFormat, setBodyFormat] = useState<'plain' | 'html' | 'text'>('plain');
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number } | null>(null);
  const [helmResult, setHelmResult] = useState<HelmSendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'bcc' | 'body' | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showResultDetails, setShowResultDetails] = useState(false);
  // Mobile-only preview disclosure. On md+ the preview pane is always shown
  // (this flag is ignored by the always-visible md:block rule), so toggling it
  // only affects the < md single-column layout.
  const [previewOpenMobile, setPreviewOpenMobile] = useState(false);
  // Primary-only gate: when true (default), only coaches marked is_primary_contact are
  // included in the recipient list. Skipped entirely when prefilledRecipients are
  // provided (targeted follow-ups must keep their explicit recipient list).
  const [primaryOnly, setPrimaryOnly] = useState(true);

  // Suppression-list gate (crm_email_suppressions) — email_status ('bounced',
  // 'complained', 'unsubscribed', checked via isSuppressedEmailStatus below)
  // already covers most do-not-contact addresses, but a row can be suppressed
  // without that sync landing on crm_coaches (an unlinked webhook event, an
  // Audiences-level unsubscribe, an email shared across multiple coach rows —
  // see the identical comment in /api/admin/crm/send-email/route.ts). The Helm
  // send path is already server-gated against both checks; the Gmail-BCC path
  // below is NOT (opening a mailto/compose URL is a pure client action with no
  // server round-trip to enforce it), so this list is fetched here specifically
  // to keep a suppressed address out of that BCC list before it's ever built.
  // Defaults to "loading" (fail-safe): the send/compose buttons stay disabled
  // until the list has been fetched at least once for the current recipients.
  const [suppressedEmails, setSuppressedEmails] = useState<Set<string>>(new Set());
  const [suppressionsLoading, setSuppressionsLoading] = useState(true);

  // AI Personalization state
  const [personalizing, setPersonalizing] = useState(false);
  const [personalizedDrafts, setPersonalizedDrafts] = useState<Map<string, { subject: string; body: string }>>(new Map());
  const [showOriginal, setShowOriginal] = useState(false);
  const [originalBody, setOriginalBody] = useState('');
  const [, setOriginalSubject] = useState('');

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const cursorPosRef = useRef<number>(0);

  // Merge prefilledRecipients into the effective coach list.
  // Match strategy: coach_id first, else case-insensitive email. Unmatched
  // prefills become ad-hoc recipients (synthesized minimal Coach objects) so
  // they flow through the existing send path exactly like manual selections.
  const effectiveCoaches = useMemo<Coach[]>(() => {
    if (!prefilledRecipients || prefilledRecipients.length === 0) {
      return coaches;
    }

    const byId = new Map<string, Coach>();
    const byEmail = new Map<string, Coach>();
    for (const c of coaches) {
      byId.set(c.id, c);
      if (c.email) byEmail.set(c.email.toLowerCase(), c);
    }

    const seenIds = new Set<string>();
    const matched: Coach[] = [];
    const adHoc: Coach[] = [];

    for (const r of prefilledRecipients) {
      let hit: Coach | undefined;
      if (r.coach_id) hit = byId.get(r.coach_id);
      if (!hit && r.email) hit = byEmail.get(r.email.toLowerCase());

      if (hit) {
        if (!seenIds.has(hit.id)) {
          seenIds.add(hit.id);
          matched.push(hit);
        }
      } else if (r.email) {
        adHoc.push({
          id: `adhoc:${r.email.toLowerCase()}`,
          name: r.name || r.email,
          title: null,
          email: r.email,
          phone: null,
          school: '',
          conference: '',
          division: 'D2',
          program: 'mens',
          status: 'contacted',
          priority: 0,
          highlight_color: null,
          is_starred: false,
          notes: null,
          internal_comments: null,
          tags: null,
          team_size: null,
          current_software: null,
          budget_range: null,
          decision_timeline: null,
          pain_points: null,
          best_contact_method: null,
          best_contact_time: null,
          timezone: null,
          last_contacted_at: null,
          next_follow_up_at: null,
          email_status: 'unknown',
          source: null,
          is_archived: false,
          archived_at: null,
          archived_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          athletics_url: null,
          role_level: null,
          is_primary_contact: false,
        });
      }
    }

    // If caller passed prefills, those ARE the selection — replace the
    // coaches list entirely rather than merging with unrelated selections.
    return [...matched, ...adHoc];
  }, [coaches, prefilledRecipients]);

  // Fetch the do-not-contact list for the current recipient set. Runs once per
  // (effectively) distinct set of coaches — re-fires (and re-blocks sends via
  // suppressionsLoading) if the modal's coach/prefill props change underneath it.
  useEffect(() => {
    let cancelled = false;
    const emails = Array.from(
      new Set(effectiveCoaches.filter(c => c.email).map(c => c.email!.toLowerCase()))
    );
    if (emails.length === 0) {
      setSuppressedEmails(new Set());
      setSuppressionsLoading(false);
      return;
    }
    setSuppressionsLoading(true);
    getSuppressions(emails)
      .then(rows => {
        if (cancelled) return;
        setSuppressedEmails(new Set(rows.map(r => r.email.toLowerCase())));
      })
      .catch(err => {
        // Fail-open on the LIST check only — email_status (checked separately,
        // synchronously, below) still gates every known-bad address. A transient
        // fetch failure here must not wedge the modal shut.
        console.error('Failed to load suppression list:', err);
      })
      .finally(() => {
        if (!cancelled) setSuppressionsLoading(false);
      });
    return () => { cancelled = true; };
  }, [effectiveCoaches]);

  const isEmailSuppressed = useCallback(
    (c: Coach) =>
      isSuppressedEmailStatus(c.email_status) ||
      (!!c.email && suppressedEmails.has(c.email.toLowerCase())),
    [suppressedEmails]
  );

  // When prefilledRecipients are provided (targeted follow-up path), skip primaryOnly
  // filtering so explicit recipients are never silently dropped. Suppressed addresses
  // (bounced/complained/unsubscribed email_status OR on the crm_email_suppressions
  // do-not-contact list) are excluded from BOTH send paths, not just Helm's
  // already-server-gated one — CAN-SPAM applies to the Gmail-BCC path too.
  const isPrefilled = !!prefilledRecipients && prefilledRecipients.length > 0;
  const passesSelectionScope = useCallback(
    (c: Coach) => !!c.email && (!primaryOnly || isPrefilled || c.is_primary_contact),
    [primaryOnly, isPrefilled]
  );
  const coachesWithEmail = effectiveCoaches.filter(c => passesSelectionScope(c) && !isEmailSuppressed(c));
  const coachesWithoutEmail = effectiveCoaches.filter(c => !c.email);
  const excludedSuppressed = effectiveCoaches.filter(c => passesSelectionScope(c) && isEmailSuppressed(c));
  const bccList = coachesWithEmail.map(c => c.email!).join(',');

  // Use first coach's data for merge tag preview
  const firstCoach = coachesWithEmail[0];

  // Track cursor position on the textarea
  const handleBodyChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value);
    cursorPosRef.current = e.target.selectionStart;
  }, []);

  const handleBodySelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    cursorPosRef.current = (e.target as HTMLTextAreaElement).selectionStart;
  }, []);

  // Insert merge tag at cursor position
  const insertMergeTag = useCallback((tag: string) => {
    const textarea = bodyRef.current;
    if (!textarea) return;

    const pos = cursorPosRef.current;
    const before = body.slice(0, pos);
    const after = body.slice(pos);
    const newBody = before + tag + after;
    setBody(newBody);

    // Restore focus and set cursor after the inserted tag
    const newPos = pos + tag.length;
    cursorPosRef.current = newPos;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }, [body]);

  // Replace merge tags with actual data for preview
  const replaceMergeTags = useCallback((text: string): string => {
    if (!firstCoach) return text;
    const nameParts = firstCoach.name.split(' ');
    return text
      .replace(/\{name\}/g, firstCoach.name || 'Coach')
      .replace(/\{first_name\}/g, nameParts[0] || '')
      .replace(/\{last_name\}/g, nameParts.slice(1).join(' ') || '')
      .replace(/\{email\}/g, firstCoach.email || '')
      .replace(/\{school\}/g, firstCoach.school || 'University')
      .replace(/\{conference\}/g, firstCoach.conference || 'Conference')
      .replace(/\{title\}/g, firstCoach.title || '')
      .replace(/\{division\}/g, firstCoach.division || '')
      .replace(/\{program\}/g, firstCoach.program || '')
      .replace(/\{team_size\}/g, String(firstCoach.team_size || ''))
      .replace(/\{current_software\}/g, firstCoach.current_software || '');
  }, [firstCoach]);

  // ── AI Personalization ──
  const handlePersonalize = async () => {
    if (!body.trim() || !firstCoach) return;
    setPersonalizing(true);
    setOriginalBody(body);
    setOriginalSubject(subject);
    try {
      const { personalizeEmail } = await import('@/lib/crm/personalize');
      const result = await personalizeEmail(body, subject, {
        name: firstCoach.name,
        school: firstCoach.school,
        conference: firstCoach.conference,
        division: firstCoach.division || undefined,
        program: firstCoach.program || undefined,
        team_size: firstCoach.team_size || undefined,
        current_software: firstCoach.current_software || undefined,
        pain_points: firstCoach.pain_points || undefined,
        notes: firstCoach.notes || undefined,
        tags: firstCoach.tags || undefined,
        decision_timeline: firstCoach.decision_timeline || undefined,
      });
      setSubject(result.subject);
      setBody(result.body);
    } catch (err) {
      console.error('Personalization failed:', err);
      setError('AI personalization failed. You can still edit and send manually.');
    } finally {
      setPersonalizing(false);
    }
  };

  const handlePersonalizeBulk = async () => {
    if (!body.trim() || coachesWithEmail.length === 0) return;
    setPersonalizing(true);
    setOriginalBody(body);
    setOriginalSubject(subject);
    const drafts = new Map<string, { subject: string; body: string }>();

    try {
      const { personalizeEmail } = await import('@/lib/crm/personalize');
      for (let i = 0; i < coachesWithEmail.length; i++) {
        const coach = coachesWithEmail[i]!;
        try {
          const result = await personalizeEmail(body, subject, {
            name: coach.name,
            school: coach.school,
            conference: coach.conference,
            division: coach.division || undefined,
            program: coach.program || undefined,
            team_size: coach.team_size || undefined,
            current_software: coach.current_software || undefined,
            pain_points: coach.pain_points || undefined,
            notes: coach.notes || undefined,
            tags: coach.tags || undefined,
            decision_timeline: coach.decision_timeline || undefined,
          });
          drafts.set(coach.id, result);
        } catch {
          drafts.set(coach.id, { subject, body });
        }
        setSendProgress({ current: i + 1, total: coachesWithEmail.length });
        if (i < coachesWithEmail.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      setPersonalizedDrafts(drafts);
    } catch (err) {
      console.error('Bulk personalization failed:', err);
      setError('AI personalization failed for some coaches. Standard merge tags will be used as fallback.');
    } finally {
      setPersonalizing(false);
      setSendProgress(null);
    }
  };

  // ── Open in Gmail with BCC ──
  const openInGmail = () => {
    const params = new URLSearchParams();
    params.set('view', 'cm');
    params.set('fs', '1');
    params.set('bcc', bccList);
    if (subject.trim()) params.set('su', subject.trim());
    if (body.trim()) params.set('body', body.trim());

    window.open(`https://mail.google.com/mail/?${params.toString()}`, '_blank');
    logBulkContact();
  };

  // ── Copy to clipboard ──
  const copyToClipboard = async (text: string, type: 'bcc' | 'body') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  // ── Log bulk contact (fire-and-forget for Gmail mode) ──
  const logBulkContact = async () => {
    try {
      await fetch('/api/admin/crm/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: coachesWithEmail.map(c => ({
            id: c.id,
            email: c.email!,
            name: c.name,
          })),
          subject: subject.trim() || '(Sent via Gmail)',
          logOnly: true,
        }),
      });
      onSuccess();
    } catch {
      // Silent — don't block the Gmail open
    }
  };

  // ── Send via Helm (Resend — individual branded emails) ──
  const handleSendViaHelm = async () => {
    // Validate required fields — show explicit error instead of silently returning
    if (coachesWithEmail.length === 0) {
      setError('No recipients with email addresses selected.');
      return;
    }
    if (!subject.trim()) {
      setError('Subject line is required.');
      return;
    }
    if (!body.trim()) {
      setError('Message body is required.');
      return;
    }

    setSending(true);
    setError(null);
    setHelmResult(null);
    setSendProgress({ current: 0, total: coachesWithEmail.length });

    try {
      // If we have AI-personalized drafts, send individually
      if (personalizedDrafts.size > 0) {
        let sentCount = 0;
        let failedCount = 0;

        for (let i = 0; i < coachesWithEmail.length; i++) {
          const coach = coachesWithEmail[i]!;
          const draft = personalizedDrafts.get(coach.id);
          const nameParts = coach.name.split(' ');

          try {
            const res = await fetch('/api/admin/crm/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipients: [{
                  id: coach.id,
                  email: coach.email!,
                  name: coach.name,
                  first_name: nameParts[0],
                  last_name: nameParts.slice(1).join(' '),
                  school: coach.school,
                  conference: coach.conference,
                }],
                subject: draft?.subject || subject.trim(),
                body: draft?.body || body.trim(),
                templateId: selectedTemplateId,
                format: bodyFormat,
              }),
            });

            if (res.ok) {
              sentCount++;
            } else {
              failedCount++;
            }
          } catch {
            failedCount++;
          }

          setSendProgress({ current: i + 1, total: coachesWithEmail.length });
          if (i < coachesWithEmail.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }

        setHelmResult({ sent: sentCount, skipped: 0, failed: failedCount });
        setSendProgress({ current: coachesWithEmail.length, total: coachesWithEmail.length });
        if (sentCount > 0) {
          setTimeout(() => { onSuccess(); onClose(); }, 3000);
        }
        setSending(false);
        return; // Skip the normal send path
      }

      const recipientsPayload = coachesWithEmail.map(c => {
        const nameParts = c.name.split(' ');
        return {
          id: c.id,
          email: c.email!,
          name: c.name,
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(' '),
          title: c.title || undefined,
          school: c.school,
          conference: c.conference,
          division: c.division || undefined,
          program: c.program || undefined,
          team_size: c.team_size || undefined,
          current_software: c.current_software || undefined,
        };
      });

      // The route caps at 100 recipients per POST. Chunk so a large selection
      // (e.g. all 303 prospects) sends across sequential requests instead of
      // failing the whole batch with a single HTTP 400 (which sent ZERO before).
      const BATCH_SIZE = 100;
      let aggSent = 0;
      let aggSkipped = 0;
      let aggFailed = 0;
      const aggDetails: NonNullable<HelmSendResult['details']> = [];
      let stopMessage: string | null = null;

      for (let start = 0; start < recipientsPayload.length; start += BATCH_SIZE) {
        const batch = recipientsPayload.slice(start, start + BATCH_SIZE);
        try {
          const res = await fetch('/api/admin/crm/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipients: batch,
              subject: subject.trim(),
              body: body.trim(),
              templateId: selectedTemplateId,
              format: bodyFormat,
            }),
          });

          if (!res.ok) {
            let errorMessage = `Failed to send emails (${res.status})`;
            let hardStop = false;
            try {
              const data = await res.json();
              if (res.status === 401 || res.status === 403) {
                errorMessage = 'Your session has expired. Please log in again to send emails.';
                hardStop = true;
              } else if (res.status === 429) {
                errorMessage = data.error || 'Daily email limit reached (500/day). The remaining recipients were not sent — resume tomorrow.';
                hardStop = true;
              } else {
                errorMessage = data.error || errorMessage;
              }
            } catch {
              errorMessage = `Server error: ${res.status} ${res.statusText}`;
            }
            stopMessage = stopMessage ?? errorMessage;
            if (hardStop) break; // session/limit — remaining batches would also fail
            aggFailed += batch.length; // transient batch error — keep going
          } else {
            const data = await res.json();
            aggSent += data.sent ?? 0;
            aggSkipped += data.skipped ?? 0;
            aggFailed += data.failed ?? 0;
            if (Array.isArray(data.details)) aggDetails.push(...data.details);
          }
        } catch (batchErr) {
          aggFailed += batch.length;
          stopMessage = stopMessage ?? (batchErr instanceof Error ? `Network error: ${batchErr.message}` : 'Network error. Please try again.');
        }

        setSendProgress({
          current: Math.min(start + batch.length, recipientsPayload.length),
          total: recipientsPayload.length,
        });
        // brief gap between batches to stay friendly to Resend rate limits
        if (start + BATCH_SIZE < recipientsPayload.length) {
          await new Promise(resolve => setTimeout(resolve, 400));
        }
      }

      if (aggSent === 0) {
        setError(stopMessage ?? 'No emails were sent.');
        return;
      }

      setHelmResult({
        sent: aggSent,
        skipped: aggSkipped,
        failed: aggFailed,
        details: aggDetails.length ? aggDetails : undefined,
      });
      setSendProgress({ current: recipientsPayload.length, total: recipientsPayload.length });

      if (stopMessage) {
        // Partial send (e.g. hit the daily cap mid-run). Keep the modal open so
        // the operator sees how many went out and why the rest didn't.
        setError(stopMessage);
        onSuccess();
      } else {
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 3000);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `Network error: ${err.message}`
          : 'Network error. Please try again.'
      );
    } finally {
      setSending(false);
    }
  };

  // ── Handle template selection ──
  const handleTemplateSelect = (template: { subject: string; body: string; id: string; format: 'plain' | 'html' | 'text' }) => {
    setSubject(template.subject);
    setBody(template.body);
    setSelectedTemplateId(template.id);
    setBodyFormat(template.format);
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, sending]);

  const coachData = firstCoach
    ? {
        name: firstCoach.name,
        first_name: firstCoach.name.split(' ')[0],
        last_name: firstCoach.name.split(' ').slice(1).join(' '),
        email: firstCoach.email ?? undefined,
        school: firstCoach.school,
        conference: firstCoach.conference,
        title: firstCoach.title || undefined,
        division: firstCoach.division || undefined,
        program: firstCoach.program || undefined,
        team_size: String(firstCoach.team_size || ''),
        current_software: firstCoach.current_software || undefined,
      }
    : undefined;

  return (
    <>
      {/* Backdrop */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- modal backdrop dismisses on click; Escape is handled by the dialog */}
      <div className="fixed inset-0 z-50 bg-nav-bg/40" onClick={sending ? undefined : onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-stretch justify-center md:items-center md:p-4">
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only wrapper prevents backdrop click from closing while interacting with modal content */}
        <div
          className="bg-elevated shadow-raise w-full h-[100dvh] flex flex-col overflow-hidden md:h-auto md:rounded-card md:max-w-[1024px] md:max-h-[90vh]"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b border-border-subtle border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-fw-md bg-accent-50 flex items-center justify-center shrink-0">
                <IconMail size={18} className="text-accent-700" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-text-primary">Email Coaches</h2>
                <p className="text-xs text-text-tertiary">
                  {coachesWithEmail.length} recipient{coachesWithEmail.length !== 1 ? 's' : ''} selected
                  {coachesWithoutEmail.length > 0 && (
                    <span className="text-fw-warning ml-1.5">
                      ({coachesWithoutEmail.length} skipped — no email)
                    </span>
                  )}
                  {excludedSuppressed.length > 0 && (
                    <span className="text-fw-warning ml-1.5">
                      ({excludedSuppressed.length} excluded — unsubscribed/bounced)
                    </span>
                  )}
                </p>
                {!isPrefilled && (
                  <label className="mt-1 flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={primaryOnly}
                      onChange={e => setPrimaryOnly(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-border-strong text-accent-700 focus:ring-border-focus/20 cursor-pointer"
                    />
                    <span className="text-xs text-text-secondary font-medium">
                      Primary contacts only <span className="text-text-tertiary font-normal">(skip assistants)</span>
                    </span>
                  </label>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {mode === 'helm' && (
                <Button variant="ghost"
                  type="button"
                  onClick={() => { setMode('gmail'); setError(null); setHelmResult(null); }}
                  className="shrink-0 text-xs text-text-tertiary hover:text-text-secondary font-medium transition-colors underline"
                >
                  <span className="sm:hidden">Gmail BCC</span>
                  <span className="hidden sm:inline">Use Gmail BCC instead</span>
                </Button>
              )}
              {mode === 'gmail' && (
                <Button variant="ghost"
                  type="button"
                  onClick={() => { setMode('helm'); setError(null); setHelmResult(null); }}
                  className="shrink-0 text-xs text-accent-600 hover:text-fw-success-ink font-medium transition-colors underline"
                >
                  <span className="sm:hidden">Back to Helm</span>
                  <span className="hidden sm:inline">Back to Send from Helm</span>
                </Button>
              )}
              <IconButton variant="default"
                onClick={onClose}
                disabled={sending}
                aria-label="Close"
                className="p-2 rounded-fw-md hover:bg-surface-sunken text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
              >
                <IconX size={18} />
              </IconButton>
            </div>
          </div>

          {/* Main Content: Split Pane */}
          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
            {/* Left Pane — Compose (60%) */}
            <div className="flex-1 lg:w-[60%] lg:flex-none overflow-y-auto px-4 py-4 sm:px-6 space-y-4">
              {/* Recipient summary */}
              <div>
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1.5 block">
                  {mode === 'gmail' ? 'BCC Recipients' : 'Recipients'}
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                  {coachesWithEmail.slice(0, 20).map(c => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent-50 text-accent-700 rounded-full text-xs font-medium border border-accent-100"
                    >
                      {c.name}
                      <span className="text-accent-500 ml-0.5 text-eyebrow">{c.email}</span>
                    </span>
                  ))}
                  {coachesWithEmail.length > 20 && (
                    <span className="inline-flex items-center px-2 py-0.5 bg-surface-sunken text-text-secondary rounded-full text-xs font-medium">
                      +{coachesWithEmail.length - 20} more
                    </span>
                  )}
                </div>
                {coachesWithoutEmail.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-fw-warning-ink">
                    <IconAlertCircle size={12} />
                    <span>
                      {coachesWithoutEmail.length} coach{coachesWithoutEmail.length !== 1 ? 'es' : ''}{' '}
                      skipped (no email): {coachesWithoutEmail.map(c => c.name).join(', ')}
                    </span>
                  </div>
                )}
                {excludedSuppressed.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-fw-warning-ink">
                    <IconAlertCircle size={12} />
                    <span>
                      {excludedSuppressed.length} coach{excludedSuppressed.length !== 1 ? 'es' : ''}{' '}
                      excluded (unsubscribed/bounced): {excludedSuppressed.map(c => c.name).join(', ')}
                    </span>
                  </div>
                )}
              </div>

              {/* Gmail info banner */}
              {mode === 'gmail' && (
                <div className="px-4 py-3 rounded-fw-md bg-surface-sunken/60 border border-border-subtle">
                  <p className="text-sm text-text-primary">
                    Opens Gmail with all {coachesWithEmail.length} email{coachesWithEmail.length !== 1 ? 's' : ''} in{' '}
                    <strong>BCC</strong>. Make sure you&apos;re signed into <strong>admin@helmsportslabs.com</strong>.
                  </p>
                </div>
              )}

              {/* Template Picker (Helm only) */}
              {mode === 'helm' && (
                <div className="flex items-center gap-3">
                  <TemplatePicker onSelect={handleTemplateSelect} coachData={coachData} />
                  {selectedTemplateId && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-accent-50 text-accent-700 rounded-fw-sm text-xs font-medium border border-accent-200/50">
                      <IconCheck size={12} />
                      Template applied
                      <IconButton variant="default" aria-label="Remove template"
                        onClick={() => {
                          setSelectedTemplateId(null);
                          setSubject('');
                          setBody('');
                          setBodyFormat('plain');
                        }}
                        className="ml-1 text-accent-500 hover:text-accent-700"
                      >
                        <IconX size={12} />
                      </IconButton>
                    </span>
                  )}
                </div>
              )}

              {/* AI Personalize */}
              {mode === 'helm' && body.trim() && (
                <div className="flex items-center gap-2">
                  <Button variant="ghost"
                    type="button"
                    onClick={coachesWithEmail.length === 1 ? handlePersonalize : handlePersonalizeBulk}
                    disabled={personalizing || !body.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-fw-md text-sm font-semibold bg-accent-650 text-text-on-accent hover:bg-accent-750 disabled:opacity-50 transition-all shadow-flat"
                  >
                    {personalizing ? (
                      <>
                        <IconLoader size={14} className="animate-spin" />
                        Personalizing...
                      </>
                    ) : (
                      <>
                        <IconSparkles size={14} />
                        {coachesWithEmail.length === 1 ? 'Personalize with AI' : `Personalize All (${coachesWithEmail.length})`}
                      </>
                    )}
                  </Button>
                  {originalBody && !personalizing && (
                    <Button variant="ghost"
                      type="button"
                      onClick={() => {
                        if (showOriginal) {
                          // Already showing original, do nothing special
                        } else {
                          setShowOriginal(!showOriginal);
                        }
                      }}
                      className="text-xs text-text-tertiary hover:text-text-secondary font-medium underline"
                    >
                      {showOriginal ? 'Showing original' : 'View original'}
                    </Button>
                  )}
                </div>
              )}

              {/* Subject */}
              <div>
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1.5 block">
                  Subject {mode === 'helm' && <span className="text-fw-danger/80">*</span>}
                  {mode === 'gmail' && <span className="text-text-tertiary normal-case font-normal">(optional)</span>}
                </label>
                {/* eslint-disable-next-line jsx-a11y/no-autofocus -- intentional default focus in dialog */}
                <Input autoFocus
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder={mode === 'gmail' ? 'Pre-fill subject line...' : 'Email subject line...'}
                  className="px-4 py-2.5 text-base sm:text-sm"
                />
              </div>

              {/* Merge Tag Toolbar */}
              {mode === 'helm' && (
                <div>
                  <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1.5 block">
                    Insert Merge Tag
                  </p>
                  {/* Mobile: horizontal scrolling chip rail (bleeds to the screen
                      edges so chips don't crowd). md+: wrapping grid as before. */}
                  <div className="flex flex-nowrap overflow-x-auto gap-1.5 -mx-4 px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible md:mx-0 md:px-0 md:pb-0">
                    {MERGE_TAGS.map(tag => (
                      <Button variant="ghost"
                        key={tag.value}
                        type="button"
                        onClick={() => insertMergeTag(tag.value)}
                        className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-accent-50 text-fw-success-ink border border-accent-200 hover:bg-accent-100 cursor-pointer transition-colors"
                      >
                        {tag.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Body */}
              <div>
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1.5 block">
                  Message {mode === 'helm' && <span className="text-fw-danger/80">*</span>}
                  {mode === 'gmail' && <span className="text-text-tertiary normal-case font-normal">(optional)</span>}
                </label>
                <Textarea
                  ref={bodyRef}
                  value={body}
                  onChange={handleBodyChange}
                  onSelect={handleBodySelect}
                  onClick={handleBodySelect}
                  onKeyUp={handleBodySelect}
                  placeholder={
                    mode === 'helm'
                      ? 'Hi {name},\n\nWrite your email message here...\n\nBest,\nHelm Sports Labs'
                      : 'Pre-fill message body (you can edit everything in Gmail)...'
                  }
                  className="px-4 py-2.5 text-base sm:text-sm font-mono min-h-[40vh] sm:min-h-[200px] leading-relaxed"
                />
              </div>

              {/* Gmail Copy Buttons */}
              {mode === 'gmail' && (
                <div className="flex gap-2">
                  <Button variant="ghost"
                    onClick={() => copyToClipboard(bccList, 'bcc')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-fw-sm text-xs font-medium bg-surface-sunken hover:bg-surface-sunken text-text-secondary transition-colors border border-border-subtle"
                  >
                    {copied === 'bcc' ? (
                      <><IconCheck size={12} className="text-accent-700" /><span className="text-accent-700">Copied!</span></>
                    ) : (
                      <><IconCopy size={12} />Copy BCC List</>
                    )}
                  </Button>
                  {body.trim() && (
                    <Button variant="ghost"
                      onClick={() => copyToClipboard(body.trim(), 'body')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-fw-sm text-xs font-medium bg-surface-sunken hover:bg-surface-sunken text-text-secondary transition-colors border border-border-subtle"
                    >
                      {copied === 'body' ? (
                        <><IconCheck size={12} className="text-accent-700" /><span className="text-accent-700">Copied!</span></>
                      ) : (
                        <><IconCopy size={12} />Copy Body</>
                      )}
                    </Button>
                  )}
                </div>
              )}

              {/* Send Progress (Helm) */}
              {mode === 'helm' && sending && sendProgress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary font-medium">
                      Sending {sendProgress.current} of {sendProgress.total}...
                    </span>
                    <span className="text-text-tertiary text-xs">
                      {Math.round((sendProgress.current / sendProgress.total) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-surface-sunken rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-accent-500 rounded-full transition-all duration-500"
                      style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Personalizing Progress */}
              {personalizing && sendProgress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-fw-success-ink font-medium">
                      Personalizing {sendProgress.current} of {sendProgress.total}...
                    </span>
                    <span className="text-text-tertiary text-xs">
                      {Math.round((sendProgress.current / sendProgress.total) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-accent-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-accent-500 rounded-full transition-all duration-500"
                      style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Helm Result Card */}
              {mode === 'helm' && helmResult && (
                <div className="rounded-fw-md border border-border-subtle overflow-hidden">
                  <div className="px-4 py-3 border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] flex items-center gap-4">
                    {helmResult.sent > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-accent-500" />
                        <span className="text-sm font-medium text-accent-700">{helmResult.sent} sent</span>
                      </div>
                    )}
                    {helmResult.skipped > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-fw-warning" />
                        <span className="text-sm font-medium text-fw-warning-ink">{helmResult.skipped} skipped</span>
                      </div>
                    )}
                    {helmResult.failed > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-fw-danger" />
                        <span className="text-sm font-medium text-fw-danger-ink">{helmResult.failed} failed</span>
                      </div>
                    )}
                    {helmResult.details && helmResult.details.length > 0 && (
                      <Button variant="ghost"
                        onClick={() => setShowResultDetails(!showResultDetails)}
                        className="ml-auto text-xs text-text-tertiary hover:text-text-secondary font-medium transition-colors"
                      >
                        {showResultDetails ? 'Hide details' : 'Show details'}
                      </Button>
                    )}
                  </div>
                  {showResultDetails && helmResult.details && (
                    <div className="border-t border-border-subtle max-h-40 overflow-y-auto">
                      {helmResult.details.map((d, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between px-4 py-2 text-xs border-b border-border-subtle last:border-b-0"
                        >
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              'w-1.5 h-1.5 rounded-full',
                              d.status === 'sent' && 'bg-accent-500',
                              d.status === 'skipped' && 'bg-fw-warning',
                              d.status === 'failed' && 'bg-fw-danger',
                            )} />
                            <span className="text-text-secondary font-medium">{d.name}</span>
                            <span className="text-text-tertiary">{d.email}</span>
                          </div>
                          <span className={cn(
                            'font-medium',
                            d.status === 'sent' && 'text-accent-700',
                            d.status === 'skipped' && 'text-fw-warning-ink',
                            d.status === 'failed' && 'text-fw-danger-ink',
                          )}>
                            {d.status}{d.reason ? ` — ${d.reason}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Right Pane — Live Preview (40%) */}
            <div className="shrink-0 lg:shrink lg:w-[40%] lg:flex-none border-t lg:border-t-0 lg:border-l border-border-subtle bg-surface-sunken/60 overflow-y-auto">
              {/* Mobile-only disclosure toggle — keeps the preview from eating the
                  screen on a phone. Hidden on md+ where the preview is always shown. */}
              <Button variant="ghost"
                type="button"
                onClick={() => setPreviewOpenMobile(o => !o)}
                aria-expanded={previewOpenMobile}
                className="md:hidden w-full min-h-[44px] flex items-center gap-2 px-5 py-3 text-left justify-start"
              >
                <IconEye size={16} className="text-text-tertiary shrink-0" />
                <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Preview</span>
                {firstCoach && (
                  <span className="text-eyebrow text-text-tertiary truncate">· {firstCoach.name}</span>
                )}
                <IconChevronDown
                  size={16}
                  className={cn('ml-auto shrink-0 text-text-tertiary transition-transform', previewOpenMobile && 'rotate-180')}
                />
              </Button>
              <div className={cn('px-5 py-4 md:block', !previewOpenMobile && 'hidden')}>
                {/* Preview Header — hidden below md (the mobile disclosure toggle
                    above already carries this label); unchanged on md+. */}
                <div className="hidden md:flex items-center gap-2 mb-4">
                  <IconEye size={16} className="text-text-tertiary" />
                  <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Preview</span>
                  {firstCoach && (
                    <span className="text-eyebrow text-text-tertiary ml-auto">
                      Showing data for {firstCoach.name}
                    </span>
                  )}
                </div>

                {/* Email Preview Card — clean style */}
                {bodyFormat === 'html' ? (
                  /* HTML mode: render the body verbatim in a sandboxed iframe.
                     No greeting + signature wrapper — the template IS the email. */
                  <div className="bg-surface-sunken rounded-fw-md border border-border-subtle overflow-hidden p-3">
                    <div className="flex items-center justify-between px-1 pb-2">
                      <span className="text-eyebrow uppercase tracking-wider font-semibold text-text-tertiary">
                        HTML Mockup
                      </span>
                      <span className="text-eyebrow text-text-tertiary">
                        Full HTML — sent as-is
                      </span>
                    </div>
                    {body.trim() ? (
                      <iframe
                        title="HTML email preview"
                        // Sandbox without allow-scripts: scripts in the template
                        // are inert in preview, but layout/CSS/images render.
                        sandbox=""
                        srcDoc={mode === 'helm' ? replaceMergeTags(body) : body}
                        className="w-full bg-surface rounded-fw-sm shadow-flat border-0"
                        style={{ minHeight: 720, height: '70vh' }}
                      />
                    ) : (
                      <div className="bg-surface rounded-fw-sm py-12 text-center">
                        <p className="text-sm text-text-tertiary italic">
                          Paste HTML or pick an HTML template to preview...
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-surface-sunken rounded-fw-md border border-border-subtle overflow-hidden p-3">
                    <div className="bg-surface rounded-fw-sm overflow-hidden shadow-flat" style={{ maxWidth: 600 }}>
                      {/* Greeting */}
                      <div className="px-5 pt-5">
                        {firstCoach ? (
                          <p className="text-sm font-semibold text-text-primary">
                            Coach {firstCoach.name.split(' ').length > 1 ? firstCoach.name.split(' ').slice(-1)[0] : firstCoach.name},
                          </p>
                        ) : (
                          <p className="text-sm text-text-tertiary italic">
                            Coach &#123;last_name&#125;,
                          </p>
                        )}
                      </div>

                      {/* Body */}
                      <div className="px-5 pt-3 pb-5">
                        {body.trim() ? (
                          <div className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                            {mode === 'helm' ? replaceMergeTags(body) : body}
                          </div>
                        ) : (
                          <div className="py-8 text-center">
                            <p className="text-sm text-text-tertiary italic">
                              Start typing to see a preview...
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Signature */}
                      <div className="px-5 pb-5">
                        <div className="border-t border-border-subtle pt-4">
                          <div className="flex items-start gap-3">
                            <img src="https://helmsportslabs.com/helm-golf-logo-transparent.png" alt="GolfHelm" className="w-10 h-10 object-contain flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm text-text-secondary">Best,</p>
                              <p className="text-sm font-semibold text-text-primary mt-1">Leah Potter & Nick Rini</p>
                              <p className="text-xs text-text-tertiary">Co-Founders, Helm Sports Labs</p>
                              <div className="flex items-center gap-3 mt-1">
                                <a href="https://helmsportslabs.com" className="text-xs font-medium text-accent-700 no-underline hover:underline">
                                  helmsportslabs.com
                                </a>
                                <span className="text-text-tertiary">|</span>
                                <a href="mailto:admin@helmsportslabs.com" className="text-xs text-text-tertiary no-underline hover:underline">
                                  admin@helmsportslabs.com
                                </a>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Preview info */}
                {!firstCoach && (
                  <div className="mt-3 px-3 py-2 rounded-fw-sm bg-fw-warning-bg border border-fw-warning-ring/60">
                    <p className="text-xs text-fw-warning-ink">
                      No recipients with email addresses selected. Add recipients to see a personalized preview.
                    </p>
                  </div>
                )}

                {mode === 'gmail' && firstCoach && (
                  <p className="mt-3 text-eyebrow text-text-tertiary text-center">
                    This preview shows what will be pre-filled in Gmail.
                    {'\n'}You can edit everything before sending.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Footer — sticky bottom of the flex column. On mobile it holds the
              primary Send button above the keyboard/home-indicator via safe-area
              inset padding. */}
          <div className="shrink-0 border-t border-border-subtle border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] pb-[env(safe-area-inset-bottom)]">
            {/* Error banner — always visible in footer */}
            {error && (
              <div className="flex items-center gap-2 px-4 sm:px-6 py-2.5 text-sm font-medium bg-fw-danger-bg text-fw-danger-ink border-b border-fw-danger/25">
                <IconAlertCircle size={16} className="shrink-0" />
                <span className="flex-1">{error}</span>
                <IconButton variant="default" aria-label="Dismiss error"
                  type="button"
                  onClick={() => setError(null)}
                  className="shrink-0 p-0.5 rounded hover:bg-fw-danger-bg/70 transition-colors"
                >
                  <IconX size={14} />
                </IconButton>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4">
            <Button variant="ghost"
              type="button"
              onClick={onClose}
              disabled={sending}
              className="min-h-[44px] px-4 py-2 text-sm text-text-secondary hover:text-text-primary font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </Button>

            {mode === 'gmail' ? (
              <Button variant="ghost"
                type="button"
                onClick={openInGmail}
                disabled={suppressionsLoading || coachesWithEmail.length === 0}
                className={cn(
                  'flex items-center justify-center gap-2 min-h-[44px] px-6 py-2.5 rounded-fw-md text-sm font-semibold transition-all shadow-flat',
                  'bg-accent-650 text-text-on-accent hover:bg-accent-750',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {suppressionsLoading ? (
                  <>
                    <IconLoader size={16} className="animate-spin" />
                    Checking suppressions...
                  </>
                ) : (
                  <>
                    <IconExternalLink size={16} />
                    Open in Gmail ({coachesWithEmail.length} BCC)
                  </>
                )}
              </Button>
            ) : (
              <Button variant="primary"
                type="button"
                onClick={handleSendViaHelm}
                disabled={sending || suppressionsLoading || coachesWithEmail.length === 0 || !!helmResult}
                className={cn(
                  'flex items-center justify-center gap-2 min-h-[44px] px-6 py-2.5 rounded-fw-md text-sm font-semibold transition-all shadow-flat',
                  'bg-accent-650 text-text-on-accent hover:bg-accent-750',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {sending ? (
                  <>
                    <IconLoader size={16} className="animate-spin" />
                    Sending...
                  </>
                ) : suppressionsLoading ? (
                  <>
                    <IconLoader size={16} className="animate-spin" />
                    Checking suppressions...
                  </>
                ) : helmResult ? (
                  <>
                    <IconCheckCircle2 size={16} />
                    Sent
                  </>
                ) : (
                  <>
                    <IconSend size={16} />
                    Send to {coachesWithEmail.length} Coach{coachesWithEmail.length !== 1 ? 'es' : ''}
                  </>
                )}
              </Button>
            )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
