'use client';

// ============================================================================
// TemplateManager — in-app email template lifecycle (the headline surface)
// ============================================================================
// Premium management view for crm_email_templates: list (grouped by category,
// with format badge + usage count + default star), create / edit with a FORMAT
// selector + merge-tag helper + LIVE preview, plus Duplicate / Delete / Set-
// default / Send-test-to-myself. All mutations go through the admin-gated
// server actions in src/app/golf/actions/crm-templates.ts; previews run the
// shared mergeTags() against a sample coach so what you see is what sends.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { mergeTags, MERGE_TOKENS, type Recipient } from '@/lib/crm/merge-tags';
import {
  IconFileText,
  IconPlus,
  IconX,
  IconStar,
  IconStarFilled,
  IconCopy,
  IconTrash,
  IconPencil,
  IconSend,
  IconEye,
  IconSparkles,
  IconInfo,
  IconCheck,
} from '@/components/icons';
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
  setDefaultTemplate,
  sendTestTemplate,
  type CrmEmailTemplate,
  type TemplateCategory,
  type TemplateFormat,
} from '@/app/golf/actions/crm-templates';

// ── Category metadata (mirrors TemplatePicker's palette) ──
const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  intro: 'Intro',
  follow_up: 'Follow Up',
  demo_invite: 'Demo Invite',
  proposal: 'Proposal',
  check_in: 'Check In',
  general: 'General',
  cold_outreach: 'Cold Outreach',
  active_conversation: 'Active',
  re_engage: 'Re-Engage',
  close: 'Close',
  post_close: 'Post-Close',
};

const CATEGORY_COLORS: Record<TemplateCategory, { bg: string; text: string }> = {
  intro: { bg: 'bg-blue-50', text: 'text-blue-700' },
  follow_up: { bg: 'bg-amber-50', text: 'text-amber-700' },
  demo_invite: { bg: 'bg-primary-50', text: 'text-primary-700' },
  proposal: { bg: 'bg-violet-50', text: 'text-violet-700' },
  check_in: { bg: 'bg-teal-50', text: 'text-teal-700' },
  general: { bg: 'bg-warm-50', text: 'text-warm-700' },
  cold_outreach: { bg: 'bg-sky-50', text: 'text-sky-700' },
  active_conversation: { bg: 'bg-indigo-50', text: 'text-indigo-700' },
  re_engage: { bg: 'bg-orange-50', text: 'text-orange-700' },
  close: { bg: 'bg-rose-50', text: 'text-rose-700' },
  post_close: { bg: 'bg-lime-50', text: 'text-lime-700' },
};

const CATEGORY_ORDER: TemplateCategory[] = [
  'cold_outreach',
  'intro',
  'follow_up',
  'demo_invite',
  'proposal',
  'check_in',
  'active_conversation',
  're_engage',
  'close',
  'post_close',
  'general',
];

// ── Format metadata ──
const FORMAT_META: Record<
  TemplateFormat,
  { label: string; help: string; badge: string }
> = {
  text: {
    label: 'Plain text',
    help: 'True text/plain — no shell, no logo. Best for personal cold outreach that should land in Gmail Primary. The body must carry its own greeting + sign-off.',
    badge: 'bg-sky-900 text-white',
  },
  plain: {
    label: 'Branded shell',
    help: 'Your paragraph text wrapped in the standard Helm greeting + signature shell. Good for warm follow-ups.',
    badge: 'bg-warm-900 text-white',
  },
  html: {
    label: 'Full HTML',
    help: 'Your HTML is sent verbatim as the entire email document — it replaces the greeting + signature shell. For designed campaigns.',
    badge: 'bg-violet-900 text-white',
  },
};

const FORMAT_OPTIONS: TemplateFormat[] = ['text', 'plain', 'html'];

// A representative sample coach used for the live preview (mirrors the merge
// defaults the server action uses for a test send, so preview ≈ test).
const SAMPLE_RECIPIENT: Recipient = {
  id: 'preview',
  email: 'coach.sample@stateu.edu',
  name: 'Jordan Sample',
  title: 'Head Coach',
  school: 'State University',
  conference: 'Atlantic Coast',
  division: 'D1',
  program: 'mens',
  team_size: 10,
  current_software: 'spreadsheets',
};

function getCategoryColor(cat: TemplateCategory) {
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.general;
}

// ── Skeleton ──
function TemplateListSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      {[0, 1].map((g) => (
        <div key={g} className="space-y-2">
          <div className="h-4 w-32 bg-warm-100 rounded animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="bg-cream-50 rounded-2xl p-4 animate-pulse"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-24 h-5 bg-warm-100 rounded-full" />
                  <div className="w-16 h-5 bg-warm-100 rounded-full" />
                </div>
                <div className="w-3/4 h-3.5 bg-warm-50 rounded mb-2" />
                <div className="w-full h-3 bg-warm-50 rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Live preview pane ──
// Runs the shared mergeTags() against the sample coach. For HTML format we
// render the merged markup in a sandboxed iframe (srcDoc) so template HTML
// can't touch the admin app. For text/plain we render whitespace-preserved.
function PreviewPane({
  subject,
  body,
  format,
}: {
  subject: string;
  body: string;
  format: TemplateFormat;
}) {
  const mergedSubject = useMemo(() => mergeTags(subject, SAMPLE_RECIPIENT), [subject]);
  const mergedBody = useMemo(() => mergeTags(body, SAMPLE_RECIPIENT), [body]);

  return (
    <div className="rounded-2xl border border-warm-200/60 glass-standard overflow-clip">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-warm-200/60 bg-warm-50/40">
        <IconEye size={14} className="text-primary-500" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wider text-warm-600">
          Live preview
        </span>
        <span className="ml-auto text-eyebrow text-warm-400">
          rendered for {SAMPLE_RECIPIENT.name}
        </span>
      </div>
      <div className="px-4 py-3 border-b border-warm-100/80">
        <p className="text-eyebrow uppercase tracking-wider text-warm-400 mb-0.5">Subject</p>
        <p className="text-sm font-semibold text-warm-900 break-words">
          {mergedSubject || <span className="text-warm-300 italic">No subject</span>}
        </p>
      </div>
      <div className="p-4 max-h-72 overflow-auto bg-cream-100/40">
        {format === 'html' ? (
          mergedBody.trim() ? (
            <iframe
              title="HTML email preview"
              sandbox=""
              srcDoc={mergedBody}
              className="w-full min-h-[16rem] rounded-lg border border-warm-200 bg-cream-50"
            />
          ) : (
            <p className="text-sm text-warm-300 italic">No HTML body yet</p>
          )
        ) : mergedBody.trim() ? (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-warm-700">
            {mergedBody}
          </pre>
        ) : (
          <p className="text-sm text-warm-300 italic">No body yet</p>
        )}
      </div>
      {format !== 'html' && (
        <p className="px-4 py-2 text-eyebrow text-warm-400 border-t border-warm-100/80">
          {format === 'plain'
            ? 'On send, this gets wrapped in the branded greeting + signature shell.'
            : 'Sent as true text/plain — exactly as shown above.'}
        </p>
      )}
    </div>
  );
}

// ── Editor (create + edit share this form) ──
interface EditorState {
  id: string | null; // null = creating
  name: string;
  category: TemplateCategory;
  subject: string;
  body: string;
  format: TemplateFormat;
  merge_tags: string[];
  is_default: boolean;
}

function blankEditor(): EditorState {
  return {
    id: null,
    name: '',
    category: 'cold_outreach',
    subject: '',
    body: '',
    // New cold templates default to 'text' (Gmail-Primary deliverability).
    format: 'text',
    merge_tags: [],
    is_default: false,
  };
}

function TemplateEditor({
  initial,
  onSaved,
  onCancel,
}: {
  initial: EditorState;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<EditorState>(initial);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  // Track the last-focused body field so a clicked token inserts there.
  const [bodyEl, setBodyEl] = useState<HTMLTextAreaElement | null>(null);

  const isEditing = initial.id !== null;

  const insertToken = useCallback(
    (token: string) => {
      const snippet = `{${token}}`;
      setState((prev) => {
        // Insert at the textarea caret when we have it; else append.
        if (bodyEl) {
          const start = bodyEl.selectionStart ?? prev.body.length;
          const end = bodyEl.selectionEnd ?? prev.body.length;
          const next = prev.body.slice(0, start) + snippet + prev.body.slice(end);
          // Restore caret just after the inserted token on next tick.
          requestAnimationFrame(() => {
            bodyEl.focus();
            const caret = start + snippet.length;
            bodyEl.setSelectionRange(caret, caret);
          });
          return { ...prev, body: next };
        }
        return { ...prev, body: prev.body + snippet };
      });
    },
    [bodyEl],
  );

  // The merge_tags chip set = tokens actually present in subject OR body, so the
  // composer chips always reflect what this template will substitute (G14).
  const detectedTokens = useMemo(() => {
    const haystack = `${state.subject} ${state.body}`;
    return MERGE_TOKENS.filter((t) => haystack.includes(`{${t}}`));
  }, [state.subject, state.body]);

  const handleSave = async () => {
    if (!state.name.trim() || !state.subject.trim() || !state.body.trim()) {
      setError('Name, subject, and body are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (state.id) {
        await updateTemplate(state.id, {
          name: state.name,
          category: state.category,
          subject: state.subject,
          body: state.body,
          format: state.format,
          merge_tags: detectedTokens,
          is_default: state.is_default,
        });
        toast.success('Template updated');
      } else {
        await createTemplate({
          name: state.name,
          category: state.category,
          subject: state.subject,
          body: state.body,
          format: state.format,
          merge_tags: detectedTokens,
          is_default: state.is_default,
        });
        toast.success('Template created');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!state.id) {
      setError('Save the template before sending a test');
      return;
    }
    setTesting(true);
    setError('');
    try {
      const { to } = await sendTestTemplate({ id: state.id });
      toast.success(`Test sent to ${to}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send test';
      setError(msg);
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="glass-standard rounded-2xl border border-primary-200/70 shadow-glass p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-bold text-warm-900">
          <IconSparkles size={18} className="text-primary-500" aria-hidden />
          {isEditing ? 'Edit template' : 'Create template'}
        </h3>
        <IconButton
          variant="default"
          onClick={onCancel}
          aria-label="Close editor"
          className="p-1.5 rounded-xl text-warm-400 hover:text-warm-700 hover:bg-warm-100/60 transition-colors"
        >
          <IconX size={18} aria-hidden />
        </IconButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left column — form */}
        <div className="space-y-4">
          <div>
            <Input
              id="tpl-name"
              type="text"
              label="Name"
              value={state.name}
              onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
              placeholder="e.g. Founding 10 — First Touch"
            />
          </div>

          <div>
            <Select
              options={CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
              value={state.category}
              onChange={(v) => setState((s) => ({ ...s, category: v as TemplateCategory }))}
              label="Category"
            />
          </div>

          {/* Format selector */}
          <div>
            <span className="block text-xs font-semibold text-warm-700 mb-1.5">Format</span>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Email format">
              {FORMAT_OPTIONS.map((f) => {
                const active = state.format === f;
                return (
                  <Button
                    key={f}
                    type="button"
                    variant="ghost"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setState((s) => ({ ...s, format: f }))}
                    className={cn(
                      'flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl border text-left min-h-[44px] transition-all',
                      active
                        ? 'bg-primary-50 border-primary-300 ring-1 ring-primary-200 text-primary-800'
                        : 'glass-standard border-warm-200 text-warm-600 hover:bg-cream-100',
                    )}
                  >
                    <span className="text-xs font-bold">{FORMAT_META[f].label}</span>
                  </Button>
                );
              })}
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-eyebrow text-warm-500 leading-relaxed">
              <IconInfo size={13} className="mt-px flex-shrink-0 text-warm-400" aria-hidden />
              <span>{FORMAT_META[state.format].help}</span>
            </p>
          </div>

          <div>
            <Input
              id="tpl-subject"
              type="text"
              label="Subject"
              value={state.subject}
              onChange={(e) => setState((s) => ({ ...s, subject: e.target.value }))}
              placeholder="Subject line — merge tokens allowed"
            />
          </div>

          {/* Merge-tag helper */}
          <div>
            <span className="block text-xs font-semibold text-warm-700 mb-1.5">
              Merge tags
              <span className="ml-1.5 font-normal text-warm-400">— click to insert into the body</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {MERGE_TOKENS.map((token) => {
                const present = detectedTokens.includes(token);
                return (
                  <Button
                    key={token}
                    type="button"
                    variant="ghost"
                    onClick={() => insertToken(token)}
                    aria-label={`Insert ${token} merge tag`}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-mono font-medium border transition-colors min-h-0',
                      present
                        ? 'bg-primary-50 border-primary-200 text-primary-700'
                        : 'bg-warm-50 border-warm-200 text-warm-600 hover:bg-warm-100',
                    )}
                  >
                    {present && <IconCheck size={11} className="mr-1 text-primary-500" aria-hidden />}
                    {`{${token}}`}
                  </Button>
                );
              })}
            </div>
          </div>

          <div>
            <Textarea
              id="tpl-body"
              label="Body"
              ref={setBodyEl}
              value={state.body}
              onChange={(e) => setState((s) => ({ ...s, body: e.target.value }))}
              placeholder={
                state.format === 'html'
                  ? 'Full HTML document — sent verbatim.'
                  : 'Email body… include your own greeting + sign-off for plain text.'
              }
              rows={10}
              className="resize-y font-mono leading-relaxed"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={state.is_default}
              onChange={(e) => setState((s) => ({ ...s, is_default: e.target.checked }))}
              className="h-4 w-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500/30"
            />
            <span className="text-sm text-warm-700">
              Default for <span className="font-semibold">{CATEGORY_LABELS[state.category]}</span>
              <span className="ml-1 text-warm-400">(unsets the current default)</span>
            </span>
          </label>
        </div>

        {/* Right column — live preview */}
        <div className="space-y-3">
          <PreviewPane subject={state.subject} body={state.body} format={state.format} />
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-warm-100">
        {isEditing && (
          <Button
            type="button"
            variant="secondary"
            onClick={handleSendTest}
            isLoading={testing}
            leftIcon={!testing ? <IconSend size={15} aria-hidden /> : undefined}
            className="mr-auto"
          >
            Send test to myself
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={handleSave}
          isLoading={saving}
          leftIcon={!saving ? <IconCheck size={15} aria-hidden /> : undefined}
        >
          {isEditing ? 'Save changes' : 'Create template'}
        </Button>
      </div>
    </div>
  );
}

// ── Template card (list item) ──
function TemplateCard({
  template,
  busy,
  onEdit,
  onDuplicate,
  onDelete,
  onSetDefault,
  onSendTest,
}: {
  template: CrmEmailTemplate;
  busy: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onSendTest: () => void;
}) {
  const colors = getCategoryColor(template.category);
  const fmt = FORMAT_META[template.format];

  return (
    <div className="group relative glass-standard rounded-2xl shadow-glass-sm p-4 transition-all duration-200 hover:bg-cream-100 hover:shadow-card-hover">
      <div className="flex items-start gap-2 mb-1.5">
        <span className="font-semibold text-sm text-warm-900 truncate flex-1">{template.name}</span>
        {template.is_default && (
          <span
            className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-eyebrow font-bold uppercase tracking-wider bg-primary-50 text-primary-700"
            title="Default for this category"
          >
            <IconStarFilled size={10} className="text-primary-500" aria-hidden />
            Default
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className={cn('px-2 py-0.5 rounded-full text-eyebrow font-bold uppercase tracking-wider', colors.bg, colors.text)}>
          {CATEGORY_LABELS[template.category]}
        </span>
        <span className={cn('px-2 py-0.5 rounded-full text-eyebrow font-bold uppercase tracking-wider', fmt.badge)}>
          {fmt.label}
        </span>
        {template.usage_count > 0 ? (
          <span className="text-eyebrow text-warm-400">
            {template.usage_count} sent
            {template.last_used_at
              ? ` · last ${new Date(template.last_used_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
              : ''}
          </span>
        ) : (
          <span className="text-eyebrow text-warm-300">Never used</span>
        )}
      </div>

      <p className="text-sm text-warm-600 truncate leading-relaxed">{template.subject}</p>
      <p className="text-xs text-warm-400 line-clamp-2 mt-1 leading-relaxed">
        {template.format === 'html'
          ? 'Full HTML email — replaces the standard greeting + signature shell.'
          : template.body}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-warm-100">
        <Button
          type="button"
          variant="ghost"
          onClick={onEdit}
          disabled={busy}
          leftIcon={<IconPencil size={14} aria-hidden />}
          className="text-xs min-h-0 px-2.5 py-1.5"
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onSendTest}
          disabled={busy}
          leftIcon={<IconSend size={14} aria-hidden />}
          className="text-xs min-h-0 px-2.5 py-1.5"
        >
          Test
        </Button>
        <div className="ml-auto flex items-center gap-0.5">
          {!template.is_default && (
            <IconButton
              variant="default"
              onClick={onSetDefault}
              disabled={busy}
              aria-label="Set as default for this category"
              title="Set as default"
              className="p-1.5 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
            >
              <IconStar size={15} aria-hidden />
            </IconButton>
          )}
          <IconButton
            variant="default"
            onClick={onDuplicate}
            disabled={busy}
            aria-label="Duplicate template"
            title="Duplicate"
            className="p-1.5 rounded-lg text-warm-400 hover:text-warm-700 hover:bg-warm-100/60 transition-colors"
          >
            <IconCopy size={15} aria-hidden />
          </IconButton>
          <IconButton
            variant="default"
            onClick={onDelete}
            disabled={busy}
            aria-label="Delete template"
            title="Delete"
            className="p-1.5 rounded-lg text-warm-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <IconTrash size={15} aria-hidden />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TemplateManager — top-level surface
// ============================================================================
export function TemplateManager() {
  const [templates, setTemplates] = useState<CrmEmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  // id currently mutating (set-default / duplicate / delete) → disables its card.
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTemplates(await listTemplates());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Group templates by category in a stable display order.
  const grouped = useMemo(() => {
    const byCat = new Map<TemplateCategory, CrmEmailTemplate[]>();
    for (const t of templates) {
      const arr = byCat.get(t.category) ?? [];
      arr.push(t);
      byCat.set(t.category, arr);
    }
    const ordered: Array<{ category: TemplateCategory; items: CrmEmailTemplate[] }> = [];
    for (const cat of CATEGORY_ORDER) {
      const items = byCat.get(cat);
      if (items && items.length) ordered.push({ category: cat, items });
    }
    // Any category not in CATEGORY_ORDER (defensive) appended last.
    for (const [cat, items] of byCat) {
      if (!CATEGORY_ORDER.includes(cat)) ordered.push({ category: cat, items });
    }
    return ordered;
  }, [templates]);

  const startCreate = () => setEditor(blankEditor());
  const startEdit = (t: CrmEmailTemplate) =>
    setEditor({
      id: t.id,
      name: t.name,
      category: t.category,
      subject: t.subject,
      body: t.body,
      format: t.format,
      merge_tags: t.merge_tags ?? [],
      is_default: t.is_default,
    });

  const handleSetDefault = async (t: CrmEmailTemplate) => {
    setBusyId(t.id);
    try {
      await setDefaultTemplate(t.id, t.category);
      toast.success(`“${t.name}” is now the ${CATEGORY_LABELS[t.category]} default`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set default');
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicate = async (t: CrmEmailTemplate) => {
    setBusyId(t.id);
    try {
      await duplicateTemplate(t.id);
      toast.success('Template duplicated');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to duplicate');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (t: CrmEmailTemplate) => {
    if (!window.confirm(`Delete “${t.name}”? This cannot be undone.`)) return;
    setBusyId(t.id);
    try {
      await deleteTemplate(t.id);
      toast.success('Template deleted');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setBusyId(null);
    }
  };

  const handleSendTest = async (t: CrmEmailTemplate) => {
    setBusyId(t.id);
    try {
      const { to } = await sendTestTemplate({ id: t.id });
      toast.success(`Test sent to ${to}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send test');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center">
            <IconFileText size={18} className="text-primary-600" aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-bold text-warm-900">Email templates</h2>
            <p className="text-xs text-warm-500">
              {templates.length} template{templates.length === 1 ? '' : 's'} · author, preview & test in-app
            </p>
          </div>
        </div>
        {!editor && (
          <Button
            type="button"
            variant="primary"
            onClick={startCreate}
            leftIcon={<IconPlus size={16} aria-hidden />}
          >
            New template
          </Button>
        )}
      </div>

      {/* Editor (create / edit) */}
      {editor && (
        <TemplateEditor
          key={editor.id ?? 'new'}
          initial={editor}
          onSaved={() => {
            setEditor(null);
            refresh();
          }}
          onCancel={() => setEditor(null)}
        />
      )}

      {/* List */}
      {loading ? (
        <TemplateListSkeleton />
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-6 text-center">
          <p className="text-sm text-red-700 mb-3">{error}</p>
          <Button type="button" variant="secondary" onClick={refresh}>
            Try again
          </Button>
        </div>
      ) : templates.length === 0 && !editor ? (
        <div className="rounded-2xl border border-dashed border-warm-200/70 glass-subtle p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-warm-50 flex items-center justify-center mx-auto mb-3">
            <IconFileText size={22} className="text-warm-400" aria-hidden />
          </div>
          <p className="text-sm font-semibold text-warm-700 mb-1">No templates yet</p>
          <p className="text-xs text-warm-500 mb-4">
            Create your first reusable email — pick a format, add merge tags, preview, then test.
          </p>
          <Button
            type="button"
            variant="primary"
            onClick={startCreate}
            leftIcon={<IconPlus size={16} aria-hidden />}
          >
            Create template
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ category, items }) => {
            const colors = getCategoryColor(category);
            return (
              <section key={category} className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className={cn('px-2 py-0.5 rounded-full text-eyebrow font-bold uppercase tracking-wider', colors.bg, colors.text)}>
                    {CATEGORY_LABELS[category]}
                  </span>
                  <span className="text-eyebrow text-warm-400">
                    {items.length} template{items.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {items.map((t) => (
                    <TemplateCard
                      key={t.id}
                      template={t}
                      busy={busyId === t.id}
                      onEdit={() => startEdit(t)}
                      onDuplicate={() => handleDuplicate(t)}
                      onDelete={() => handleDelete(t)}
                      onSetDefault={() => handleSetDefault(t)}
                      onSendTest={() => handleSendTest(t)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
