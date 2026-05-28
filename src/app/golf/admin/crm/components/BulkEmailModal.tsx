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
} from '@/components/icons';
import type { Coach } from '../crm-config';
import { TemplatePicker } from './TemplatePicker';
import { Button, IconButton } from '@/components/ui/button';

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
  { label: '{school}', value: '{school}' },
  { label: '{conference}', value: '{conference}' },
  { label: '{title}', value: '{title}' },
  { label: '{division}', value: '{division}' },
] as const;

export function BulkEmailModal({ coaches, onClose, onSuccess, prefilledRecipients }: BulkEmailModalProps) {
  const [mode, setMode] = useState<SendMode>('helm');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  // Body format: 'plain' (default — wrapped in greeting/signature shell) or
  // 'html' (full HTML document, replaces the entire email). Set by template
  // selection; defaults back to 'plain' on Clear.
  const [bodyFormat, setBodyFormat] = useState<'plain' | 'html'>('plain');
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number } | null>(null);
  const [helmResult, setHelmResult] = useState<HelmSendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'bcc' | 'body' | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showResultDetails, setShowResultDetails] = useState(false);

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
        });
      }
    }

    // If caller passed prefills, those ARE the selection — replace the
    // coaches list entirely rather than merging with unrelated selections.
    return [...matched, ...adHoc];
  }, [coaches, prefilledRecipients]);

  const coachesWithEmail = effectiveCoaches.filter(c => c.email);
  const coachesWithoutEmail = effectiveCoaches.filter(c => !c.email);
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

      const res = await fetch('/api/admin/crm/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: coachesWithEmail.map(c => {
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
          }),
          subject: subject.trim(),
          body: body.trim(),
          templateId: selectedTemplateId,
          format: bodyFormat,
        }),
      });

      if (!res.ok) {
        // Try to parse JSON error body; fall back to status text if response isn't JSON
        let errorMessage = `Failed to send emails (${res.status})`;
        try {
          const data = await res.json();
          if (res.status === 401 || res.status === 403) {
            errorMessage = 'Your session has expired. Please log in again to send emails.';
          } else {
            errorMessage = data.error || errorMessage;
          }
        } catch {
          // Response wasn't JSON (e.g. HTML error page)
          errorMessage = `Server error: ${res.status} ${res.statusText}`;
        }
        setError(errorMessage);
        return;
      }

      const data = await res.json();

      setHelmResult({
        sent: data.sent ?? 0,
        skipped: data.skipped ?? 0,
        failed: data.failed ?? 0,
        details: data.details,
      });
      setSendProgress({ current: coachesWithEmail.length, total: coachesWithEmail.length });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 3000);
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
  const handleTemplateSelect = (template: { subject: string; body: string; id: string; format: 'plain' | 'html' }) => {
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
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={sending ? undefined : onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/20 max-w-[1024px] w-full max-h-[90vh] overflow-hidden flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100 bg-white/80 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center">
                <IconMail size={18} className="text-primary-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-warm-900">Email Coaches</h2>
                <p className="text-xs text-warm-500">
                  {coachesWithEmail.length} recipient{coachesWithEmail.length !== 1 ? 's' : ''} selected
                  {coachesWithoutEmail.length > 0 && (
                    <span className="text-amber-500 ml-1.5">
                      ({coachesWithoutEmail.length} skipped — no email)
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {mode === 'helm' && (
                <Button variant="ghost"
                  type="button"
                  onClick={() => { setMode('gmail'); setError(null); setHelmResult(null); }}
                  className="text-xs text-warm-400 hover:text-warm-600 font-medium transition-colors underline"
                >
                  Use Gmail BCC instead
                </Button>
              )}
              {mode === 'gmail' && (
                <Button variant="ghost"
                  type="button"
                  onClick={() => { setMode('helm'); setError(null); setHelmResult(null); }}
                  className="text-xs text-primary-500 hover:text-primary-700 font-medium transition-colors underline"
                >
                  Back to Send from Helm
                </Button>
              )}
              <IconButton variant="default"
                onClick={onClose}
                disabled={sending}
                aria-label="Close"
                className="p-2 rounded-xl hover:bg-warm-50 text-warm-400 hover:text-warm-600 transition-colors disabled:opacity-50"
              >
                <IconX size={18} />
              </IconButton>
            </div>
          </div>

          {/* Main Content: Split Pane */}
          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
            {/* Left Pane — Compose (60%) */}
            <div className="flex-1 lg:w-[60%] lg:flex-none overflow-y-auto px-6 py-4 space-y-4">
              {/* Recipient summary */}
              <div>
                <label className="text-xs font-medium text-warm-600 uppercase tracking-wider mb-1.5 block">
                  {mode === 'gmail' ? 'BCC Recipients' : 'Recipients'}
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                  {coachesWithEmail.slice(0, 20).map(c => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full text-xs font-medium border border-primary-100"
                    >
                      {c.name}
                      <span className="text-primary-400 ml-0.5 text-eyebrow">{c.email}</span>
                    </span>
                  ))}
                  {coachesWithEmail.length > 20 && (
                    <span className="inline-flex items-center px-2 py-0.5 bg-warm-100 text-warm-600 rounded-full text-xs font-medium">
                      +{coachesWithEmail.length - 20} more
                    </span>
                  )}
                </div>
                {coachesWithoutEmail.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600">
                    <IconAlertCircle size={12} />
                    <span>
                      {coachesWithoutEmail.length} coach{coachesWithoutEmail.length !== 1 ? 'es' : ''}{' '}
                      skipped (no email): {coachesWithoutEmail.map(c => c.name).join(', ')}
                    </span>
                  </div>
                )}
              </div>

              {/* Gmail info banner */}
              {mode === 'gmail' && (
                <div className="px-4 py-3 rounded-xl bg-blue-50/50 border border-blue-100">
                  <p className="text-sm text-blue-800">
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
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 text-primary-700 rounded-lg text-xs font-medium border border-primary-200/50">
                      <IconCheck size={12} />
                      Template applied
                      <IconButton variant="default" aria-label="Close"
                        onClick={() => {
                          setSelectedTemplateId(null);
                          setSubject('');
                          setBody('');
                          setBodyFormat('plain');
                        }}
                        className="ml-1 text-primary-400 hover:text-primary-600"
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
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-all shadow-sm"
                  >
                    {personalizing ? (
                      <>
                        <IconLoader size={14} className="animate-spin" />
                        Personalizing...
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                        </svg>
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
                      className="text-xs text-warm-500 hover:text-warm-700 font-medium underline"
                    >
                      {showOriginal ? 'Showing original' : 'View original'}
                    </Button>
                  )}
                </div>
              )}

              {/* Subject */}
              <div>
                <label className="text-xs font-medium text-warm-600 uppercase tracking-wider mb-1.5 block">
                  Subject {mode === 'helm' && <span className="text-red-400">*</span>}
                  {mode === 'gmail' && <span className="text-warm-400 normal-case font-normal">(optional)</span>}
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder={mode === 'gmail' ? 'Pre-fill subject line...' : 'Email subject line...'}
                  className="w-full bg-white/60 border border-warm-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
                  autoFocus
                />
              </div>

              {/* Merge Tag Toolbar */}
              {mode === 'helm' && (
                <div>
                  <label className="text-xs font-medium text-warm-600 uppercase tracking-wider mb-1.5 block">
                    Insert Merge Tag
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {MERGE_TAGS.map(tag => (
                      <Button variant="ghost"
                        key={tag.value}
                        type="button"
                        onClick={() => insertMergeTag(tag.value)}
                        className="px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 cursor-pointer transition-colors"
                      >
                        {tag.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Body */}
              <div>
                <label className="text-xs font-medium text-warm-600 uppercase tracking-wider mb-1.5 block">
                  Message {mode === 'helm' && <span className="text-red-400">*</span>}
                  {mode === 'gmail' && <span className="text-warm-400 normal-case font-normal">(optional)</span>}
                </label>
                <textarea
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
                  className="w-full bg-white/60 border border-warm-200 rounded-xl px-4 py-2.5 text-sm font-mono min-h-[200px] resize-none outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all leading-relaxed"
                />
              </div>

              {/* Gmail Copy Buttons */}
              {mode === 'gmail' && (
                <div className="flex gap-2">
                  <Button variant="ghost"
                    onClick={() => copyToClipboard(bccList, 'bcc')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-warm-100/60 hover:bg-warm-100 text-warm-600 transition-colors border border-warm-200/50"
                  >
                    {copied === 'bcc' ? (
                      <><IconCheck size={12} className="text-primary-600" /><span className="text-primary-600">Copied!</span></>
                    ) : (
                      <><IconCopy size={12} />Copy BCC List</>
                    )}
                  </Button>
                  {body.trim() && (
                    <Button variant="ghost"
                      onClick={() => copyToClipboard(body.trim(), 'body')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-warm-100/60 hover:bg-warm-100 text-warm-600 transition-colors border border-warm-200/50"
                    >
                      {copied === 'body' ? (
                        <><IconCheck size={12} className="text-primary-600" /><span className="text-primary-600">Copied!</span></>
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
                    <span className="text-warm-700 font-medium">
                      Sending {sendProgress.current} of {sendProgress.total}...
                    </span>
                    <span className="text-warm-500 text-xs">
                      {Math.round((sendProgress.current / sendProgress.total) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-warm-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full transition-all duration-500"
                      style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Personalizing Progress */}
              {personalizing && sendProgress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-violet-700 font-medium">
                      Personalizing {sendProgress.current} of {sendProgress.total}...
                    </span>
                    <span className="text-warm-500 text-xs">
                      {Math.round((sendProgress.current / sendProgress.total) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-violet-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all duration-500"
                      style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Helm Result Card */}
              {mode === 'helm' && helmResult && (
                <div className="rounded-xl border border-warm-200/50 overflow-hidden">
                  <div className="px-4 py-3 bg-white/60 flex items-center gap-4">
                    {helmResult.sent > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-sm font-medium text-green-700">{helmResult.sent} sent</span>
                      </div>
                    )}
                    {helmResult.skipped > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-sm font-medium text-amber-700">{helmResult.skipped} skipped</span>
                      </div>
                    )}
                    {helmResult.failed > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="text-sm font-medium text-red-700">{helmResult.failed} failed</span>
                      </div>
                    )}
                    {helmResult.details && helmResult.details.length > 0 && (
                      <Button variant="ghost"
                        onClick={() => setShowResultDetails(!showResultDetails)}
                        className="ml-auto text-xs text-warm-500 hover:text-warm-700 font-medium transition-colors"
                      >
                        {showResultDetails ? 'Hide details' : 'Show details'}
                      </Button>
                    )}
                  </div>
                  {showResultDetails && helmResult.details && (
                    <div className="border-t border-warm-100 max-h-40 overflow-y-auto">
                      {helmResult.details.map((d, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between px-4 py-2 text-xs border-b border-warm-50 last:border-b-0"
                        >
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              'w-1.5 h-1.5 rounded-full',
                              d.status === 'sent' && 'bg-green-500',
                              d.status === 'skipped' && 'bg-amber-500',
                              d.status === 'failed' && 'bg-red-500',
                            )} />
                            <span className="text-warm-700 font-medium">{d.name}</span>
                            <span className="text-warm-400">{d.email}</span>
                          </div>
                          <span className={cn(
                            'font-medium',
                            d.status === 'sent' && 'text-green-600',
                            d.status === 'skipped' && 'text-amber-600',
                            d.status === 'failed' && 'text-red-600',
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
            <div className="lg:w-[40%] lg:flex-none border-t lg:border-t-0 lg:border-l border-warm-100 bg-warm-50/50 overflow-y-auto">
              <div className="px-5 py-4">
                {/* Preview Header */}
                <div className="flex items-center gap-2 mb-4">
                  <IconEye size={16} className="text-warm-400" />
                  <span className="text-xs font-medium text-warm-600 uppercase tracking-wider">Preview</span>
                  {firstCoach && (
                    <span className="text-eyebrow text-warm-400 ml-auto">
                      Showing data for {firstCoach.name}
                    </span>
                  )}
                </div>

                {/* Email Preview Card — clean style */}
                {bodyFormat === 'html' ? (
                  /* HTML mode: render the body verbatim in a sandboxed iframe.
                     No greeting + signature wrapper — the template IS the email. */
                  <div className="bg-[#f5f5f4] rounded-xl border border-warm-200/60 shadow-sm overflow-hidden p-3">
                    <div className="flex items-center justify-between px-1 pb-2">
                      <span className="text-eyebrow uppercase tracking-wider font-semibold text-warm-500">
                        HTML Mockup
                      </span>
                      <span className="text-eyebrow text-warm-400">
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
                        className="w-full bg-white rounded-lg shadow-sm border-0"
                        style={{ minHeight: 720, height: '70vh' }}
                      />
                    ) : (
                      <div className="bg-white rounded-lg py-12 text-center">
                        <p className="text-sm text-warm-300 italic">
                          Paste HTML or pick an HTML template to preview...
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-[#f5f5f4] rounded-xl border border-warm-200/60 shadow-sm overflow-hidden p-3">
                    <div className="bg-white rounded-lg overflow-hidden shadow-sm" style={{ maxWidth: 600 }}>
                      {/* Greeting */}
                      <div className="px-5 pt-5">
                        {firstCoach ? (
                          <p className="text-sm font-semibold text-warm-900">
                            Coach {firstCoach.name.split(' ').length > 1 ? firstCoach.name.split(' ').slice(-1)[0] : firstCoach.name},
                          </p>
                        ) : (
                          <p className="text-sm text-warm-300 italic">
                            Coach &#123;last_name&#125;,
                          </p>
                        )}
                      </div>

                      {/* Body */}
                      <div className="px-5 pt-3 pb-5">
                        {body.trim() ? (
                          <div className="text-sm text-warm-600 whitespace-pre-wrap leading-relaxed">
                            {mode === 'helm' ? replaceMergeTags(body) : body}
                          </div>
                        ) : (
                          <div className="py-8 text-center">
                            <p className="text-sm text-warm-300 italic">
                              Start typing to see a preview...
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Signature */}
                      <div className="px-5 pb-5">
                        <div className="border-t border-warm-200 pt-4">
                          <div className="flex items-start gap-3">
                            <img src="https://helmsportslabs.com/helm-golf-logo-transparent.png" alt="GolfHelm" className="w-10 h-10 object-contain flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm text-warm-600">Best,</p>
                              <p className="text-sm font-semibold text-warm-900 mt-1">Leah Potter & Nick Rini</p>
                              <p className="text-xs text-warm-500">Co-Founders, Helm Sports Labs</p>
                              <div className="flex items-center gap-3 mt-1">
                                <a href="https://helmsportslabs.com" className="text-xs font-medium text-primary-600 no-underline hover:underline">
                                  helmsportslabs.com
                                </a>
                                <span className="text-warm-300">|</span>
                                <a href="mailto:admin@helmsportslabs.com" className="text-xs text-warm-500 no-underline hover:underline">
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
                  <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
                    <p className="text-xs text-amber-600">
                      No recipients with email addresses selected. Add recipients to see a personalized preview.
                    </p>
                  </div>
                )}

                {mode === 'gmail' && firstCoach && (
                  <p className="mt-3 text-eyebrow text-warm-400 text-center">
                    This preview shows what will be pre-filled in Gmail.
                    {'\n'}You can edit everything before sending.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-warm-100 bg-white/80">
            {/* Error banner — always visible in footer */}
            {error && (
              <div className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-red-50 text-red-700 border-b border-red-200/50">
                <IconAlertCircle size={16} className="shrink-0" />
                <span className="flex-1">{error}</span>
                <IconButton variant="default" aria-label="Close"
                  type="button"
                  onClick={() => setError(null)}
                  className="shrink-0 p-0.5 rounded hover:bg-red-100 transition-colors"
                >
                  <IconX size={14} />
                </IconButton>
              </div>
            )}
            <div className="flex items-center justify-between px-6 py-4">
            <Button variant="ghost"
              type="button"
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2 text-sm text-warm-600 hover:text-warm-800 font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </Button>

            {mode === 'gmail' ? (
              <Button variant="ghost"
                type="button"
                onClick={openInGmail}
                disabled={coachesWithEmail.length === 0}
                className={cn(
                  'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm',
                  'bg-blue-600 text-white hover:bg-blue-700',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <IconExternalLink size={16} />
                Open in Gmail ({coachesWithEmail.length} BCC)
              </Button>
            ) : (
              <Button variant="primary"
                type="button"
                onClick={handleSendViaHelm}
                disabled={sending || coachesWithEmail.length === 0 || !!helmResult}
                className={cn(
                  'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm',
                  'bg-primary-600 text-white hover:bg-primary-700',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {sending ? (
                  <>
                    <IconLoader size={16} className="animate-spin" />
                    Sending...
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
