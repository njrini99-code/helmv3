'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  IconFileText,
  IconSearch,
  IconX,
  IconPlus,
  IconLoader,
} from '@/components/icons';

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
}

type TemplateCategory = 'intro' | 'follow_up' | 'demo_invite' | 'proposal' | 'check_in' | 'general' | 'cold_outreach' | 'active_conversation' | 're_engage' | 'close' | 'post_close';

interface TemplatePickerProps {
  onSelect: (template: { subject: string; body: string; id: string }) => void;
  coachData?: Record<string, string | undefined>;
}

// ── Category colors ──
const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  intro: { bg: 'bg-blue-50', text: 'text-blue-700' },
  follow_up: { bg: 'bg-amber-50', text: 'text-amber-700' },
  demo_invite: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  proposal: { bg: 'bg-violet-50', text: 'text-violet-700' },
  check_in: { bg: 'bg-teal-50', text: 'text-teal-700' },
  general: { bg: 'bg-warm-50', text: 'text-warm-700' },
  cold_outreach: { bg: 'bg-sky-50', text: 'text-sky-700' },
  active_conversation: { bg: 'bg-indigo-50', text: 'text-indigo-700' },
  re_engage: { bg: 'bg-orange-50', text: 'text-orange-700' },
  close: { bg: 'bg-rose-50', text: 'text-rose-700' },
  post_close: { bg: 'bg-lime-50', text: 'text-lime-700' },
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

function replaceMergeTags(text: string, data?: Record<string, string | undefined>): string {
  if (!data) return text;
  return text
    .replace(/\{name\}/g, data.name ?? '')
    .replace(/\{first_name\}/g, data.first_name ?? data.name?.split(' ')[0] ?? '')
    .replace(/\{last_name\}/g, data.last_name ?? data.name?.split(' ').slice(1).join(' ') ?? '')
    .replace(/\{school\}/g, data.school ?? '')
    .replace(/\{conference\}/g, data.conference ?? '')
    .replace(/\{title\}/g, data.title ?? '')
    .replace(/\{division\}/g, data.division ?? '')
    .replace(/\{program\}/g, data.program ?? '')
    .replace(/\{team_size\}/g, data.team_size ?? '')
    .replace(/\{current_software\}/g, data.current_software ?? '');
}

// ── Skeleton ──
function TemplateSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-white/60 rounded-xl border border-white/20 p-4 animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-20 h-5 bg-warm-100 rounded-full" />
            <div className="w-28 h-4 bg-warm-100 rounded" />
          </div>
          <div className="w-3/4 h-3.5 bg-warm-50 rounded mb-2" />
          <div className="w-full h-3 bg-warm-50 rounded mb-1" />
          <div className="w-2/3 h-3 bg-warm-50 rounded" />
        </div>
      ))}
    </div>
  );
}

// ── New Template Form ──
function NewTemplateForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('general');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
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
      const supabase = createClient();
      const { error: insertError } = await supabase
        .from('crm_email_templates')
        .insert({ name: name.trim(), category, subject: subject.trim(), body: body.trim() });
      if (insertError) throw insertError;
      onSave();
    } catch {
      setError('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-xl border border-primary-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-warm-800">Create Template</h4>
        <button onClick={onCancel} className="text-warm-400 hover:text-warm-600 transition-colors">
          <IconX size={16} />
        </button>
      </div>

      <div className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Template name"
          className="w-full px-3 py-2 bg-white/60 border border-warm-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 outline-none"
        />

        <select
          value={category}
          onChange={e => setCategory(e.target.value as TemplateCategory)}
          className="w-full px-3 py-2 bg-white/60 border border-warm-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 outline-none"
        >
          {CATEGORY_OPTIONS.filter(c => c.key !== 'all').map(c => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>

        <input
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Subject line"
          className="w-full px-3 py-2 bg-white/60 border border-warm-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 outline-none"
        />

        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Email body..."
          rows={4}
          className="w-full px-3 py-2 bg-white/60 border border-warm-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 outline-none resize-none"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-sm text-warm-600 hover:bg-warm-100 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {saving && <IconLoader size={14} className="animate-spin" />}
          Save Template
        </button>
      </div>
    </div>
  );
}

export function TemplatePicker({ onSelect, coachData }: TemplatePickerProps) {
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
        .select('id, name, subject, body, category, merge_tags, is_default, usage_count')
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
    onSelect({
      id: template.id,
      subject: replaceMergeTags(template.subject, coachData),
      body: replaceMergeTags(template.body, coachData),
    });
  };

  const handleNewTemplateSaved = () => {
    setShowNewForm(false);
    fetchTemplates();
  };

  return (
    <div className="space-y-4">
      {/* Header row: icon + search */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-warm-700">
          <IconFileText size={16} className="text-warm-500" />
          <span className="text-sm font-semibold">Templates</span>
        </div>
        <div className="relative flex-1 max-w-xs">
          <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full pl-9 pr-8 py-1.5 bg-white/60 border border-warm-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600 transition-colors"
            >
              <IconX size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Category filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {CATEGORY_OPTIONS.map(cat => {
          const colors = cat.key !== 'all' ? getCategoryColor(cat.key) : null;
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border',
                isActive && colors
                  ? `${colors.bg} ${colors.text} border-current/20`
                  : isActive
                    ? 'bg-warm-100 text-warm-700 border-warm-200'
                    : 'text-warm-500 hover:bg-warm-50 border-transparent'
              )}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Template card grid */}
      {loading ? (
        <TemplateSkeleton />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.length === 0 && !showNewForm ? (
            <div className="col-span-full py-8 text-center text-sm text-warm-400">
              {search ? 'No templates match your search' : 'No templates in this category'}
            </div>
          ) : (
            filtered.map(template => {
              const colors = getCategoryColor(template.category);
              const isSelected = selectedId === template.id;
              return (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className={cn(
                    'w-full text-left bg-white/60 rounded-xl border border-white/20 p-4 cursor-pointer transition-all duration-200 hover:bg-white/80 hover:shadow-sm',
                    isSelected && 'ring-2 ring-primary-500 border-primary-300'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-semibold text-sm text-warm-800 truncate">
                      {template.name}
                    </span>
                    <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider', colors?.bg, colors?.text)}>
                      {CATEGORY_LABELS[template.category] ?? template.category}
                    </span>
                  </div>
                  <p className="text-sm text-warm-500 truncate leading-relaxed">
                    {template.subject}
                  </p>
                  <p className="text-xs text-warm-400 line-clamp-2 mt-1 leading-relaxed">
                    {template.body}
                  </p>
                  <p className="text-[10px] text-warm-400 mt-2">
                    Used {template.usage_count ?? 0} times
                  </p>
                </button>
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
            <button
              onClick={() => setShowNewForm(true)}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-warm-200/50 p-4 cursor-pointer transition-all duration-200 hover:border-warm-300 hover:bg-warm-50/30 min-h-[120px]"
            >
              <IconPlus size={20} className="text-warm-400" />
              <span className="text-sm font-medium text-warm-500">Create Template</span>
            </button>
          )}
        </div>
      )}

      {/* Footer */}
      {!loading && filtered.length > 0 && (
        <p className="text-[10px] text-warm-400 text-center">
          {filtered.length} template{filtered.length !== 1 ? 's' : ''} &middot; Merge tags auto-filled on select
        </p>
      )}
    </div>
  );
}
