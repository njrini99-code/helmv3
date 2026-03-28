'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
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

interface BulkEmailModalProps {
  coaches: Coach[];
  onClose: () => void;
  onSuccess: () => void;
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
  { label: '{school}', value: '{school}' },
  { label: '{conference}', value: '{conference}' },
] as const;

export function BulkEmailModal({ coaches, onClose, onSuccess }: BulkEmailModalProps) {
  const [mode, setMode] = useState<SendMode>('gmail');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number } | null>(null);
  const [helmResult, setHelmResult] = useState<HelmSendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'bcc' | 'body' | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showResultDetails, setShowResultDetails] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const cursorPosRef = useRef<number>(0);

  const coachesWithEmail = coaches.filter(c => c.email);
  const coachesWithoutEmail = coaches.filter(c => !c.email);
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
    return text
      .replace(/\{name\}/g, firstCoach.name || 'Coach Name')
      .replace(/\{school\}/g, firstCoach.school || 'University')
      .replace(/\{conference\}/g, firstCoach.conference || 'Conference');
  }, [firstCoach]);

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
    if (!subject.trim() || !body.trim() || coachesWithEmail.length === 0) return;

    setSending(true);
    setError(null);
    setHelmResult(null);
    setSendProgress({ current: 0, total: coachesWithEmail.length });

    try {
      const res = await fetch('/api/admin/crm/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: coachesWithEmail.map(c => ({
            id: c.id,
            email: c.email!,
            name: c.name,
            school: c.school,
            conference: c.conference,
          })),
          subject: subject.trim(),
          body: body.trim(),
          templateId: selectedTemplateId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send emails');
      } else {
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
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // ── Handle template selection ──
  const handleTemplateSelect = (template: { subject: string; body: string; id: string }) => {
    setSubject(template.subject);
    setBody(template.body);
    setSelectedTemplateId(template.id);
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
    ? { name: firstCoach.name, school: firstCoach.school, conference: firstCoach.conference }
    : undefined;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={sending ? undefined : onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/20 max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
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
            <button
              onClick={onClose}
              disabled={sending}
              className="p-2 rounded-xl hover:bg-warm-50 text-warm-400 hover:text-warm-600 transition-colors disabled:opacity-50"
            >
              <IconX size={18} />
            </button>
          </div>

          {/* Mode Tabs */}
          <div className="px-6 pt-4 pb-3 shrink-0">
            <div className="flex gap-2">
              <button
                onClick={() => { setMode('gmail'); setError(null); setHelmResult(null); }}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2',
                  mode === 'gmail'
                    ? 'bg-primary-500 text-white'
                    : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                )}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
                  <path d="M22 6L12 13L2 6V4L12 11L22 4V6Z" fill={mode === 'gmail' ? '#fff' : '#EA4335'} />
                  <path d="M2 6L2 18H6V10L12 14L18 10V18H22V6L12 13L2 6Z" fill={mode === 'gmail' ? '#fff' : '#4285F4'} />
                </svg>
                Gmail (BCC)
              </button>
              <button
                onClick={() => { setMode('helm'); setError(null); setHelmResult(null); }}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2',
                  mode === 'helm'
                    ? 'bg-primary-500 text-white'
                    : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                )}
              >
                <div className={cn(
                  'w-4 h-4 rounded flex items-center justify-center',
                  mode === 'helm' ? 'bg-white/20' : 'bg-gradient-to-br from-primary-500 to-primary-600'
                )}>
                  <span className={cn('text-[8px] font-bold leading-none', mode === 'helm' ? 'text-white' : 'text-white')}>H</span>
                </div>
                Send from Helm
              </button>
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
                      <span className="text-primary-400 ml-0.5 text-[10px]">{c.email}</span>
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
                      <button
                        onClick={() => {
                          setSelectedTemplateId(null);
                          setSubject('');
                          setBody('');
                        }}
                        className="ml-1 text-primary-400 hover:text-primary-600"
                      >
                        <IconX size={12} />
                      </button>
                    </span>
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
                  className="w-full bg-white/60 border border-warm-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-300 transition-all"
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
                      <button
                        key={tag.value}
                        type="button"
                        onClick={() => insertMergeTag(tag.value)}
                        className="px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 cursor-pointer transition-colors"
                      >
                        {tag.label}
                      </button>
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
                  className="w-full bg-white/60 border border-warm-200 rounded-xl px-4 py-2.5 text-sm font-mono min-h-[200px] resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-300 transition-all leading-relaxed"
                />
              </div>

              {/* Gmail Copy Buttons */}
              {mode === 'gmail' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => copyToClipboard(bccList, 'bcc')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-warm-100/60 hover:bg-warm-100 text-warm-600 transition-colors border border-warm-200/50"
                  >
                    {copied === 'bcc' ? (
                      <><IconCheck size={12} className="text-primary-600" /><span className="text-primary-600">Copied!</span></>
                    ) : (
                      <><IconCopy size={12} />Copy BCC List</>
                    )}
                  </button>
                  {body.trim() && (
                    <button
                      onClick={() => copyToClipboard(body.trim(), 'body')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-warm-100/60 hover:bg-warm-100 text-warm-600 transition-colors border border-warm-200/50"
                    >
                      {copied === 'body' ? (
                        <><IconCheck size={12} className="text-primary-600" /><span className="text-primary-600">Copied!</span></>
                      ) : (
                        <><IconCopy size={12} />Copy Body</>
                      )}
                    </button>
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
                      <button
                        onClick={() => setShowResultDetails(!showResultDetails)}
                        className="ml-auto text-xs text-warm-500 hover:text-warm-700 font-medium transition-colors"
                      >
                        {showResultDetails ? 'Hide details' : 'Show details'}
                      </button>
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

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-red-50 text-red-700 border border-red-200/50">
                  <IconAlertCircle size={16} />
                  {error}
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
                    <span className="text-[10px] text-warm-400 ml-auto">
                      Showing data for {firstCoach.name}
                    </span>
                  )}
                </div>

                {/* Email Preview Card */}
                <div className="bg-white rounded-xl border border-warm-200/60 shadow-sm overflow-hidden">
                  {/* Branded Header Bar */}
                  <div className="bg-[#16A34A] px-4 py-3 flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded bg-white/20 flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold leading-none">H</span>
                    </div>
                    <span className="text-white text-sm font-semibold tracking-wide">Helm Sports Labs</span>
                  </div>

                  {/* Email Content */}
                  <div className="px-4 py-4 space-y-3">
                    {/* Subject line */}
                    {subject.trim() ? (
                      <p className="text-sm font-semibold text-warm-900">
                        {mode === 'helm' ? replaceMergeTags(subject) : subject}
                      </p>
                    ) : (
                      <p className="text-sm text-warm-300 italic">No subject</p>
                    )}

                    <div className="border-t border-warm-100" />

                    {/* Greeting */}
                    {firstCoach ? (
                      <p className="text-sm text-warm-700">
                        Hi {firstCoach.name.split(' ')[0]},
                      </p>
                    ) : (
                      <p className="text-sm text-warm-300 italic">
                        Hi &#123;first_name&#125;,
                      </p>
                    )}

                    {/* Body */}
                    {body.trim() ? (
                      <div className="text-sm text-warm-700 whitespace-pre-wrap leading-relaxed">
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

                  {/* Footer */}
                  <div className="px-4 py-3 border-t border-warm-100 bg-warm-50/50">
                    <p className="text-[11px] text-warm-400 text-center">
                      Sent by Helm Sports Labs
                    </p>
                  </div>
                </div>

                {/* Preview info */}
                {!firstCoach && (
                  <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
                    <p className="text-xs text-amber-600">
                      No recipients with email addresses selected. Add recipients to see a personalized preview.
                    </p>
                  </div>
                )}

                {mode === 'gmail' && firstCoach && (
                  <p className="mt-3 text-[11px] text-warm-400 text-center">
                    This preview shows what will be pre-filled in Gmail.
                    {'\n'}You can edit everything before sending.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-warm-100 bg-white/80 shrink-0">
            <button
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2 text-sm text-warm-600 hover:text-warm-800 font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            {mode === 'gmail' ? (
              <button
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
              </button>
            ) : (
              <button
                onClick={handleSendViaHelm}
                disabled={
                  sending || !subject.trim() || !body.trim() || coachesWithEmail.length === 0 || !!helmResult
                }
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
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
