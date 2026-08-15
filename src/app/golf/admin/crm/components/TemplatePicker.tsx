'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createTemplate } from '@/app/golf/actions/crm-templates';
import { MERGE_TOKENS } from '@/lib/crm/merge-tags';
import {
  IconFileText,
  IconSearch,
  IconX,
  IconPlus,
  IconLoader,
} from '@/components/icons';
import {
  CRM_CHOICE_GROUP_CLASS,
  CRM_ICON_ACTION_CLASS,
  CRM_PRIMARY_ACTION_CLASS,
  CRM_TERTIARY_ACTION_CLASS,
  crmChoiceClass,
} from '../page-contracts';

// ── Types ──
interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: TemplateCategory;
  merge_tags: string[] | null;
  is_default: boolean;
  usage_count: number;
  format: TemplateFormat;
}

type TemplateCategory = 'intro' | 'follow_up' | 'demo_invite' | 'proposal' | 'check_in' | 'general' | 'cold_outreach' | 'active_conversation' | 're_engage' | 'close' | 'post_close';

/** plain = legacy paragraph text, wrapped in our greeting/signature shell.
 *  html  = full HTML document — replaces the entire email shell on send + preview. */
type TemplateFormat = 'plain' | 'html' | 'text';

interface TemplatePickerProps {
  onSelect: (template: { subject: string; body: string; id: string; format: TemplateFormat }) => void;
  coachData?: Record<string, string | undefined>;
}

// ── Category colors ──
const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  intro: { bg: 'bg-surface-tint', text: 'text-text-secondary' },
  follow_up: { bg: 'bg-fw-warning-bg', text: 'text-fw-warning-ink' },
  demo_invite: { bg: 'bg-accent-50', text: 'text-fw-success-ink' },
  proposal: { bg: 'bg-surface-tint', text: 'text-text-secondary' },
  check_in: { bg: 'bg-accent-50', text: 'text-fw-success-ink' },
  general: { bg: 'bg-surface-tint', text: 'text-text-secondary' },
  cold_outreach: { bg: 'bg-surface-tint', text: 'text-text-secondary' },
  active_conversation: { bg: 'bg-accent-50', text: 'text-fw-success-ink' },
  re_engage: { bg: 'bg-fw-warning-bg', text: 'text-fw-warning-ink' },
  close: { bg: 'bg-accent-50', text: 'text-fw-success-ink' },
  post_close: { bg: 'bg-fw-success-bg', text: 'text-fw-success-ink' },
};

const CATEGORY_LABELS: Record<string, string> = {
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

const CATEGORY_OPTIONS: { key: TemplateCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'intro', label: 'Intro' },
  { key: 'follow_up', label: 'Follow Up' },
  { key: 'demo_invite', label: 'Demo Invite' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'check_in', label: 'Check In' },
  { key: 'general', label: 'General' },
  { key: 'cold_outreach', label: 'Cold Outreach' },
  { key: 'active_conversation', label: 'Active' },
  { key: 're_engage', label: 'Re-Engage' },
  { key: 'close', label: 'Close' },
  { key: 'post_close', label: 'Post-Close' },
];

function getCategoryColor(cat: string) {
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.general;
}

// ── Skeleton ──
function TemplateSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="rounded-fw-md border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-4 animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-20 h-5 bg-surface-sunken rounded-full" />
            <div className="w-28 h-4 bg-surface-sunken rounded" />
          </div>
          <div className="w-3/4 h-3.5 bg-surface-sunken rounded mb-2" />
          <div className="w-full h-3 bg-surface-sunken rounded mb-1" />
          <div className="w-2/3 h-3 bg-surface-sunken rounded" />
        </div>
      ))}
    </div>
  );
}

// ── Format options (mirror the TemplateFormat union) ──
const FORMAT_OPTIONS: { key: TemplateFormat; label: string; help: string }[] = [
  { key: 'text', label: 'Plain text', help: 'True text/plain — no shell. Best for Gmail-Primary cold outreach (include your own greeting + sign-off).' },
  { key: 'plain', label: 'Branded shell', help: 'Wrapped in the standard greeting + signature shell.' },
  { key: 'html', label: 'Full HTML', help: 'Sent verbatim as the entire email document.' },
];

// ── New Template Form ──
// Now routes through the admin-gated `createTemplate` server action (supports
// `format`, closing G1) instead of a raw client-side .insert.
function NewTemplateForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('cold_outreach');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  // New cold templates default to 'text' for Gmail-Primary deliverability.
  const [format, setFormat] = useState<TemplateFormat>('text');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim() || !subject.trim() || !body.trim()) {
      setError('Name, subject, and body are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Auto-detect merge tokens present in subject/body so the new template
      // carries its own chip set (G14).
      const haystack = `${subject} ${body}`;
      const detected = MERGE_TOKENS.filter(t => haystack.includes(`{${t}}`));
      await createTemplate({
        name: name.trim(),
        category,
        subject: subject.trim(),
        body: body.trim(),
        format,
        merge_tags: detected,
      });
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-fw-md border border-accent-200 bg-surface [box-shadow:var(--fw-shadow-card)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-text-primary">Create Template</h4>
        <IconButton variant="default" onClick={onCancel} aria-label="Cancel" className={CRM_ICON_ACTION_CLASS}>
          <IconX size={16} aria-hidden="true" />
        </IconButton>
      </div>

      <div className="space-y-2">
        <Input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Template name"
          className="bg-surface/80"
        />

        <Select
          value={category}
          onChange={value => setCategory(value as TemplateCategory)}
          options={CATEGORY_OPTIONS.filter(c => c.key !== 'all').map(c => ({ value: c.key, label: c.label }))}
          className="bg-surface/80"
        />

        {/* Format selector — closes G1 (UI templates can be text/html/plain) */}
        <div className={CRM_CHOICE_GROUP_CLASS} role="radiogroup" aria-label="Email format">
          {FORMAT_OPTIONS.map(f => {
            const active = format === f.key;
            return (
              <Button
                key={f.key}
                type="button"
                variant="ghost"
                role="radio"
                aria-checked={active}
                onClick={() => setFormat(f.key)}
                className={crmChoiceClass(active)}
              >
                {f.label}
              </Button>
            );
          })}
        </div>
        <p className="text-eyebrow text-text-tertiary leading-relaxed">
          {FORMAT_OPTIONS.find(f => f.key === format)?.help}
        </p>

        <Input
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Subject line"
          className="bg-surface/80"
        />

        <Textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Email body..."
          rows={4}
          className="bg-surface/80 resize-none"
        />
      </div>

      {error && <p className="text-xs text-fw-danger-ink">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost"
          onClick={onCancel}
          className={CRM_TERTIARY_ACTION_CLASS}
        >
          Cancel
        </Button>
        <Button variant="primary"
          onClick={handleSave}
          disabled={saving}
          className={CRM_PRIMARY_ACTION_CLASS}
        >
          {saving && <IconLoader size={14} className="animate-spin" />}
          Save Template
        </Button>
      </div>
    </div>
  );
}

export function TemplatePicker({ onSelect }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('crm_email_templates')
        .select('id, name, subject, body, category, merge_tags, is_default, usage_count, format')
        .order('category')
        .order('usage_count', { ascending: false });
      setTemplates((data as EmailTemplate[] | null) ?? []);
    } catch {
      // silently fail — user can retry
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const filtered = templates.filter(t => {
    if (activeCategory !== 'all' && t.category !== activeCategory) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q);
    }
    return true;
  });

  const handleSelect = (template: EmailTemplate) => {
    setSelectedId(template.id);
    // Default to 'plain' if the column hasn't been backfilled yet — keeps
    // the picker tolerant of older rows in the wild.
    const format: TemplateFormat =
      template.format === 'html' ? 'html' : template.format === 'text' ? 'text' : 'plain';
    // Pass the RAW template (merge tokens intact). Per-recipient substitution
    // happens server-side in /api/admin/crm/send-email so every coach gets their
    // own {email}/{first_name} — critical for the demo CTA's ?ref= click tracking.
    // The modal preview substitutes a sample coach separately for display only.
    onSelect({
      id: template.id,
      subject: template.subject,
      body: template.body,
      format,
    });
  };

  const handleNewTemplateSaved = () => {
    setShowNewForm(false);
    fetchTemplates();
  };

  // The selected template (if any) drives the composer's merge-tag chip set.
  const selectedTemplate = selectedId
    ? templates.find(t => t.id === selectedId) ?? null
    : null;

  // Chips reflect the selected template's persisted merge_tags, falling back to
  // tokens actually present in its subject/body — never a hardcoded list (G14).
  const selectedMergeTags: string[] = selectedTemplate
    ? selectedTemplate.merge_tags && selectedTemplate.merge_tags.length > 0
      ? selectedTemplate.merge_tags
      : MERGE_TOKENS.filter(
          tok =>
            `${selectedTemplate.subject} ${selectedTemplate.body}`.includes(`{${tok}}`),
        )
    : [];

  return (
    <div className="space-y-4">
      {/* Header row: icon + search */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-text-secondary">
          <IconFileText size={16} className="text-text-tertiary" />
          <span className="text-sm font-semibold">Templates</span>
        </div>
        <div className="relative flex-1 max-w-xs">
          <Input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates..."
            leftIcon={<IconSearch size={14} />}
            clearable
            onClear={() => setSearch('')}
            className="min-h-11 bg-surface/80 py-1.5"
          />
        </div>
      </div>

      {/* Category filter tabs */}
      <div className={CRM_CHOICE_GROUP_CLASS}>
        {CATEGORY_OPTIONS.map(cat => {
          const isActive = activeCategory === cat.key;
          return (
            <Button variant="ghost"
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              aria-pressed={isActive}
              className={crmChoiceClass(isActive)}
            >
              {cat.label}
            </Button>
          );
        })}
      </div>

      {/* Template card grid */}
      {loading ? (
        <TemplateSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.length === 0 && !showNewForm ? (
            <div className="col-span-full py-8 text-center text-sm text-text-tertiary">
              {search ? 'No templates match your search' : 'No templates in this category'}
            </div>
          ) : (
            filtered.map(template => {
              const colors = getCategoryColor(template.category);
              const isSelected = selectedId === template.id;
              return (
                <Button variant="ghost"
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  aria-pressed={isSelected}
                  className={cn(
                    'w-full text-left rounded-fw-md border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-4 cursor-pointer transition-all duration-200 hover:bg-surface-tint hover:shadow-flat',
                    isSelected && 'border-accent-300 ring-2 ring-accent-500'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-semibold text-sm text-text-primary truncate">
                      {template.name}
                    </span>
                    <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-eyebrow font-bold uppercase tracking-wider', colors?.bg, colors?.text)}>
                      {CATEGORY_LABELS[template.category] ?? template.category}
                    </span>
                    {template.format === 'html' && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-eyebrow font-bold uppercase tracking-wider bg-nav-bg text-nav-text">
                        HTML
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-text-tertiary truncate leading-relaxed">
                    {template.subject}
                  </p>
                  <p className="text-xs text-text-tertiary line-clamp-2 mt-1 leading-relaxed">
                    {template.format === 'html' ? 'Full HTML email — replaces the standard greeting + signature shell.' : template.body}
                  </p>
                  <p className="text-eyebrow text-text-tertiary mt-2">
                    Used {template.usage_count ?? 0} times
                  </p>
                </Button>
              );
            })
          )}

          {/* New Template card */}
          {showNewForm ? (
            <div className="col-span-full">
              <NewTemplateForm
                onSave={handleNewTemplateSaved}
                onCancel={() => setShowNewForm(false)}
              />
            </div>
          ) : (
            <Button variant="ghost"
              onClick={() => setShowNewForm(true)}
              className="flex flex-col items-center justify-center gap-2 rounded-fw-md border-2 border-dashed border-border-subtle p-4 cursor-pointer transition-all duration-200 hover:border-border-strong hover:bg-surface-sunken/60 min-h-[120px]"
            >
              <IconPlus size={20} className="text-text-tertiary" />
              <span className="text-sm font-medium text-text-tertiary">Create Template</span>
            </Button>
          )}
        </div>
      )}

      {/* Selected template's merge-tag chip set — reflects what THIS template
          substitutes, sourced from its persisted merge_tags (not a fixed list). */}
      {selectedTemplate && selectedMergeTags.length > 0 && (
        <div className="rounded-fw-md border border-accent-200/60 bg-accent-50/40 p-3">
          <p className="text-eyebrow uppercase tracking-wider text-text-tertiary mb-2">
            Merge tags in “{selectedTemplate.name}”
          </p>
          <div className="flex flex-wrap gap-1.5">
            {selectedMergeTags.map(tag => (
              <span
                key={tag}
                className="px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-surface border border-accent-200 text-accent-700"
              >
                {`{${tag}}`}
              </span>
            ))}
          </div>
          <p className="text-eyebrow text-text-tertiary mt-2">
            Auto-filled per recipient on send.
          </p>
        </div>
      )}

      {/* Footer */}
      {!loading && filtered.length > 0 && (
        <p className="text-eyebrow text-text-tertiary text-center">
          {filtered.length} template{filtered.length !== 1 ? 's' : ''} &middot; Merge tags auto-filled on select
        </p>
      )}
    </div>
  );
}
