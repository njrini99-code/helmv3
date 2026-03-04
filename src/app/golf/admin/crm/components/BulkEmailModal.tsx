'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { X, Mail, Send, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { Coach } from '../crm-config';

interface BulkEmailModalProps {
  coaches: Coach[];
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkEmailModal({ coaches, onClose, onSuccess }: BulkEmailModalProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const coachesWithEmail = coaches.filter(c => c.email);
  const coachesWithoutEmail = coaches.filter(c => !c.email);

  const handleSend = async () => {
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
          })),
          subject: subject.trim(),
          body: body.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({ success: false, message: data.error || 'Failed to send emails' });
      } else {
        setResult({ success: true, message: `Successfully sent ${data.sent} email${data.sent !== 1 ? 's' : ''}${data.failed > 0 ? ` (${data.failed} failed)` : ''}` });
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

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-[#FFFEF8] rounded-2xl shadow-2xl border border-warm-200/60 overflow-hidden"
          onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                <Mail size={18} className="text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-warm-900">Send Email</h2>
                <p className="text-xs text-warm-500">
                  From admin@helmsportslabs.com to {coachesWithEmail.length} recipient{coachesWithEmail.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-warm-50 text-warm-400 hover:text-warm-600 transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Recipient Summary */}
          <div className="px-6 py-3 border-b border-warm-100/50 bg-warm-50/30">
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {coachesWithEmail.map(c => (
                <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">
                  {c.name}
                </span>
              ))}
            </div>
            {coachesWithoutEmail.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600">
                <AlertCircle size={12} />
                <span>{coachesWithoutEmail.length} coach{coachesWithoutEmail.length !== 1 ? 'es' : ''} skipped (no email): {coachesWithoutEmail.map(c => c.name).join(', ')}</span>
              </div>
            )}
          </div>

          {/* Form */}
          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">Subject</label>
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
              <label className="block text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1.5">Message</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Write your email message here...&#10;&#10;You can use {name} to personalize with the coach's name."
                rows={8}
                className="w-full px-4 py-3 border border-warm-200/50 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white/70 leading-relaxed"
              />
              <p className="text-xs text-warm-400 mt-1">
                Use <code className="px-1 py-0.5 bg-warm-100 rounded text-warm-600">{'{name}'}</code> to insert each coach&apos;s name
              </p>
            </div>

            {/* Result */}
            {result && (
              <div className={cn(
                'flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium',
                result.success ? 'bg-primary-50 text-primary-700 border border-primary-200/50' : 'bg-red-50 text-red-700 border border-red-200/50'
              )}>
                {result.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                {result.message}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-warm-100 bg-white">
            <button onClick={onClose} className="px-4 py-2 text-sm text-warm-600 hover:text-warm-800 font-medium transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !subject.trim() || !body.trim() || coachesWithEmail.length === 0}
              className={cn(
                'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm',
                'bg-primary-600 text-white hover:bg-primary-700',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {sending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Send to {coachesWithEmail.length} Coach{coachesWithEmail.length !== 1 ? 'es' : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
