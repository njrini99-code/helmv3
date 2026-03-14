'use client';

import { useState } from 'react';
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
} from '@/components/icons';
import type { Coach } from '../crm-config';
import { TemplatePicker } from './TemplatePicker';

interface BulkEmailModalProps {
  coaches: Coach[];
  onClose: () => void;
  onSuccess: () => void;
}

type SendMode = 'gmail' | 'helm';

export function BulkEmailModal({ coaches, onClose, onSuccess }: BulkEmailModalProps) {
  const [mode, setMode] = useState<SendMode>('gmail');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const coachesWithEmail = coaches.filter(c => c.email);
  const coachesWithoutEmail = coaches.filter(c => !c.email);
  const bccList = coachesWithEmail.map(c => c.email!).join(',');

  // Use first coach's data for merge tag preview
  const firstCoach = coachesWithEmail[0];
  const coachData = firstCoach
    ? { name: firstCoach.name, school: firstCoach.school, conference: firstCoach.conference }
    : undefined;

  // ── Open in Gmail with BCC ──
  const openInGmail = () => {
    const params = new URLSearchParams();
    params.set('view', 'cm');
    params.set('fs', '1');
    params.set('bcc', bccList);
    if (subject.trim()) params.set('su', subject.trim());
    if (body.trim()) params.set('body', body.trim());

    window.open(`https://mail.google.com/mail/?${params.toString()}`, '_blank');

    // Log the bulk contact in CRM for each coach
    logBulkContact();
  };

  // ── Copy BCC list to clipboard ──
  const copyBccList = async () => {
    try {
      await navigator.clipboard.writeText(bccList);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = bccList;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
    setResult(null);

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
        setResult({ success: false, message: data.error || 'Failed to send emails' });
      } else {
        const parts: string[] = [];
        parts.push(`Successfully sent ${data.sent} email${data.sent !== 1 ? 's' : ''}`);
        if (data.skipped > 0) parts.push(`${data.skipped} skipped (bounced)`);
        if (data.failed > 0) parts.push(`${data.failed} failed`);

        setResult({
          success: true,
          message: parts.join(' · '),
        });
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 2000);
      }
    } catch {
      setResult({ success: false, message: 'Network error. Please try again.' });
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

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-2xl bg-[#FFFEF8] rounded-2xl shadow-2xl border border-warm-200/60 overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                <IconMail size={18} className="text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-warm-900">Email Coaches</h2>
                <p className="text-xs text-warm-500">
                  {coachesWithEmail.length} recipient{coachesWithEmail.length !== 1 ? 's' : ''} selected
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-warm-50 text-warm-400 hover:text-warm-600 transition-colors"
            >
              <IconX size={18} />
            </button>
          </div>

          {/* Mode Tabs */}
          <div className="px-6 pt-4 pb-0">
            <div className="flex gap-1 p-1 bg-warm-100/50 rounded-xl">
              <button
                onClick={() => { setMode('gmail'); setResult(null); }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all',
                  mode === 'gmail'
                    ? 'bg-white text-warm-900 shadow-sm'
                    : 'text-warm-500 hover:text-warm-700'
                )}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
                  <path d="M22 6L12 13L2 6V4L12 11L22 4V6Z" fill="#EA4335"/>
                  <path d="M2 6L2 18H6V10L12 14L18 10V18H22V6L12 13L2 6Z" fill="#4285F4"/>
                  <rect x="2" y="16" width="4" height="2" fill="#34A853"/>
                  <rect x="18" y="16" width="4" height="2" fill="#FBBC05"/>
                </svg>
                Open in Gmail (BCC)
              </button>
              <button
                onClick={() => { setMode('helm'); setResult(null); }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all',
                  mode === 'helm'
                    ? 'bg-white text-warm-900 shadow-sm'
                    : 'text-warm-500 hover:text-warm-700'
                )}
              >
                <div className="w-4 h-4 rounded bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
                  <span className="text-white text-[8px] font-bold leading-none">H</span>
                </div>
                Send from Helm
              </button>
            </div>
          </div>

          {/* Recipient Summary + BCC Copy */}
          <div className="px-6 py-3 border-b border-warm-100/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-warm-500 uppercase tracking-wider">
                {mode === 'gmail' ? 'BCC Recipients' : 'Recipients'}
              </span>
              <button
                onClick={copyBccList}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-warm-100/50 hover:bg-warm-100 text-warm-600 transition-colors"
              >
                {copied ? (
                  <>
                    <IconCheck size={12} className="text-primary-600" />
                    <span className="text-primary-600">Copied!</span>
                  </>
                ) : (
                  <>
                    <IconCopy size={12} />
                    Copy email list
                  </>
                )}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {coachesWithEmail.map(c => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium"
                >
                  {c.name}
                  <span className="text-blue-400 ml-0.5">{c.email}</span>
                </span>
              ))}
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

          {/* ── Gmail Mode ── */}
          {mode === 'gmail' && (
            <>
              <div className="px-6 py-4 space-y-4">
                <div className="px-4 py-3 rounded-xl bg-blue-50/50 border border-blue-100">
                  <p className="text-sm text-blue-800">
                    Opens Gmail compose with all {coachesWithEmail.length} email{coachesWithEmail.length !== 1 ? 's' : ''} in the{' '}
                    <strong>BCC field</strong> — recipients won&apos;t see each other&apos;s addresses.
                    Make sure you&apos;re signed into <strong>admin@helmsportslabs.com</strong> in Gmail.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">
                    Subject <span className="text-warm-400 normal-case font-normal">(optional — edit in Gmail)</span>
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Pre-fill subject line..."
                    className="w-full px-4 py-2.5 border border-warm-200/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white/70"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">
                    Message <span className="text-warm-400 normal-case font-normal">(optional — edit in Gmail)</span>
                  </label>
                  <textarea
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    placeholder="Pre-fill message body (you can edit everything in Gmail)..."
                    rows={5}
                    className="w-full px-4 py-3 border border-warm-200/50 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white/70 leading-relaxed"
                  />
                </div>
              </div>

              {/* Gmail Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-warm-100 bg-white">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-warm-600 hover:text-warm-800 font-medium transition-colors"
                >
                  Cancel
                </button>
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
              </div>
            </>
          )}

          {/* ── Helm Mode (Resend — individual branded emails) ── */}
          {mode === 'helm' && (
            <>
              <div className="px-6 py-4 space-y-4">
                <div className="px-4 py-3 rounded-xl bg-primary-50/50 border border-primary-100">
                  <p className="text-sm text-primary-800">
                    Sends individual branded emails from <strong>admin@helmsportslabs.com</strong> via
                    Helm. Each coach gets their own email — use{' '}
                    <code className="px-1 py-0.5 bg-primary-100 rounded text-primary-700 text-xs">
                      {'{name}'}
                    </code>
                    ,{' '}
                    <code className="px-1 py-0.5 bg-primary-100 rounded text-primary-700 text-xs">
                      {'{school}'}
                    </code>
                    ,{' '}
                    <code className="px-1 py-0.5 bg-primary-100 rounded text-primary-700 text-xs">
                      {'{conference}'}
                    </code>{' '}
                    to personalize. Auto-logs in the CRM contact history.
                  </p>
                </div>

                {/* Template Picker */}
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

                <div>
                  <label className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">
                    Subject <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Email subject line..."
                    className="w-full px-4 py-2.5 border border-warm-200/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white/70"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">
                    Message <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    placeholder={
                      'Hi {name},\n\nWrite your email message here...\n\nBest,\nHelm Sports Labs'
                    }
                    rows={8}
                    className="w-full px-4 py-3 border border-warm-200/50 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white/70 leading-relaxed"
                  />
                  <p className="text-xs text-warm-400 mt-1">
                    Use{' '}
                    <code className="px-1 py-0.5 bg-warm-100 rounded text-warm-600">
                      {'{name}'}
                    </code>
                    ,{' '}
                    <code className="px-1 py-0.5 bg-warm-100 rounded text-warm-600">
                      {'{school}'}
                    </code>
                    ,{' '}
                    <code className="px-1 py-0.5 bg-warm-100 rounded text-warm-600">
                      {'{conference}'}
                    </code>{' '}
                    to personalize each email
                  </p>
                </div>

                {/* Result */}
                {result && (
                  <div
                    className={cn(
                      'flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium',
                      result.success
                        ? 'bg-primary-50 text-primary-700 border border-primary-200/50'
                        : 'bg-red-50 text-red-700 border border-red-200/50'
                    )}
                  >
                    {result.success ? <IconCheckCircle2 size={16} /> : <IconAlertCircle size={16} />}
                    {result.message}
                  </div>
                )}
              </div>

              {/* Helm Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-warm-100 bg-white">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-warm-600 hover:text-warm-800 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendViaHelm}
                  disabled={
                    sending || !subject.trim() || !body.trim() || coachesWithEmail.length === 0
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
                  ) : (
                    <>
                      <IconSend size={16} />
                      Send to {coachesWithEmail.length} Coach
                      {coachesWithEmail.length !== 1 ? 'es' : ''}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
