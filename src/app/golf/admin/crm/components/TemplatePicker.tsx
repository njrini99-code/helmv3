'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  IconFileText,
  IconChevronDown,
  IconSearch,
  IconX,
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

type TemplateCategory = 'intro' | 'follow_up' | 'demo_invite' | 'proposal' | 'check_in' | 'general';

interface TemplatePickerProps {
  onSelect: (template: { subject: string; body: string; id: string }) => void;
  coachData?: { name: string; school: string; conference: string };
}

// ── Category config ──
const CATEGORIES: { key: TemplateCategory | 'all'; label: string; color: string; bg: string; border: string }[] = [
  { key: 'all', label: 'All', color: 'text-warm-700', bg: 'bg-warm-100', border: 'border-warm-200' },
  { key: 'intro', label: 'Intro', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  { key: 'follow_up', label: 'Follow Up', color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
  { key: 'demo_invite', label: 'Demo Invite', color: 'text-cyan-700', bg: 'bg-cyan-50', border: 'border-cyan-200' },
  { key: 'proposal', label: 'Proposal', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  { key: 'check_in', label: 'Check In', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { key: 'general', label: 'General', color: 'text-warm-600', bg: 'bg-warm-50', border: 'border-warm-200' },
];

function getCategoryConfig(cat: TemplateCategory) {
  return CATEGORIES.find(c => c.key === cat) ?? CATEGORIES[6]!;
}

function replaceMergeTags(text: string, data?: { name: string; school: string; conference: string }): string {
  if (!data) return text;
  return text
    .replace(/\{name\}/g, data.name)
    .replace(/\{school\}/g, data.school)
    .replace(/\{conference\}/g, data.conference);
}

// ── Skeleton ──
function TemplateSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map(i => (
        <div key={i} className="p-3 rounded-xl border border-warm-100 animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-14 h-5 bg-warm-100 rounded-full" />
            <div className="w-28 h-4 bg-warm-100 rounded" />
          </div>
          <div className="w-3/4 h-3.5 bg-warm-50 rounded" />
        </div>
      ))}
    </div>
  );
}

export function TemplatePicker({ onSelect, coachData }: TemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Fetch templates on first open
  useEffect(() => {
    if (!open || fetched) return;
    const fetchTemplates = async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('crm_email_templates' as 'crm_contact_log')
          .select('id, name, subject, body, category, merge_tags, is_default, usage_count')
          .order('category')
          .order('usage_count', { ascending: false }) as { data: EmailTemplate[] | null };
        setTemplates(data ?? []);
        setFetched(true);
      } catch {
        // silently fail — user can retry
      } finally {
        setLoading(false);
      }
    };
    fetchTemplates();
  }, [open, fetched]);

  const filtered = templates.filter(t => {
    if (activeCategory !== 'all' && t.category !== activeCategory) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q);
    }
    return true;
  });

  const handleSelect = (template: EmailTemplate) => {
    onSelect({
      id: template.id,
      subject: replaceMergeTags(template.subject, coachData),
      body: replaceMergeTags(template.body, coachData),
    });
    setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all',
          'bg-white/70 border border-warm-200/50 hover:bg-white hover:border-warm-300/60 hover:shadow-sm',
          'text-warm-700',
          open && 'bg-white border-warm-300/60 shadow-sm'
        )}
      >
        <IconFileText size={15} className="text-warm-500" />
        Use Template
        <IconChevronDown size={14} className={cn('text-warm-400 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 w-[420px] bg-white/95 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b border-warm-100/50">
            <div className="relative">
              <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="w-full pl-9 pr-8 py-2 bg-warm-50/50 border border-warm-200/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-300"
                autoFocus
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600"
                >
                  <IconX size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Category Tabs */}
          <div className="px-3 pt-2 pb-1 flex gap-1 overflow-x-auto scrollbar-hide">
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all',
                  activeCategory === cat.key
                    ? `${cat.bg} ${cat.color} border ${cat.border}`
                    : 'text-warm-500 hover:bg-warm-50 border border-transparent'
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Template List */}
          <div className="p-3 max-h-[320px] overflow-y-auto space-y-1.5">
            {loading ? (
              <TemplateSkeleton />
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-warm-400">
                {search ? 'No templates match your search' : 'No templates in this category'}
              </div>
            ) : (
              filtered.map(template => {
                const catConfig = getCategoryConfig(template.category)!;
                return (
                  <button
                    key={template.id}
                    onClick={() => handleSelect(template)}
                    className="w-full text-left p-3 rounded-xl border border-warm-100/50 hover:border-warm-200 hover:bg-warm-50/50 transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider', catConfig!.bg, catConfig!.color)}>
                        {catConfig!.label}
                      </span>
                      <span className="text-sm font-semibold text-warm-800 group-hover:text-warm-900 truncate">
                        {template.name}
                      </span>
                    </div>
                    <p className="text-xs text-warm-500 truncate leading-relaxed">
                      {template.subject}
                    </p>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          {!loading && filtered.length > 0 && (
            <div className="px-3 py-2 border-t border-warm-100/50 bg-warm-50/30">
              <p className="text-[10px] text-warm-400 text-center">
                {filtered.length} template{filtered.length !== 1 ? 's' : ''} &middot; Merge tags auto-filled on select
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
