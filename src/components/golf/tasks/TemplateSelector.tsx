'use client';

import { useState, useEffect, useTransition, useRef } from 'react';
import { cn } from '@/lib/utils';
import { getTeamTemplates, createTaskFromTemplate } from '@/app/golf/actions/task-templates';
import type { TaskTemplate, CreateTaskFromTemplate } from '@/lib/types/golf';

interface TemplateSelectorProps {
  teamId: string;
  onTaskCreated?: () => void;
  onSelectTemplate?: (template: TaskTemplate) => void;
  showQuickCreate?: boolean;
  className?: string;
}

export function TemplateSelector({
  teamId,
  onTaskCreated,
  onSelectTemplate,
  showQuickCreate = true,
  className,
}: TemplateSelectorProps) {
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<TaskTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      setLoading(true);
      const { data } = await getTeamTemplates(teamId);
      setTemplates(data || []);
      setFilteredTemplates(data || []);
      setLoading(false);
    };

    fetchTemplates();
  }, [teamId]);

  // Handle search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredTemplates(templates);
      setSelectedIndex(0);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = templates.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.category?.toLowerCase().includes(query)
    );
    setFilteredTemplates(filtered);
    setSelectedIndex(0);
  }, [searchQuery, templates]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredTemplates.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredTemplates[selectedIndex]) {
          handleSelectTemplate(filteredTemplates[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  // Handle template selection
  const handleSelectTemplate = (template: TaskTemplate) => {
    if (onSelectTemplate) {
      onSelectTemplate(template);
      setIsOpen(false);
      setSearchQuery('');
    } else if (showQuickCreate) {
      handleQuickCreate(template);
    }
  };

  // Handle quick create
  const handleQuickCreate = (template: TaskTemplate) => {
    setCreatingId(template.id);
    startTransition(async () => {
      const createData: CreateTaskFromTemplate = {
        template_id: template.id,
        team_id: teamId,
      };
      const { data, error } = await createTaskFromTemplate(createData);

      if (data) {
        onTaskCreated?.();
        setIsOpen(false);
        setSearchQuery('');
      } else {
        alert(error || 'Failed to create task');
      }
      setCreatingId(null);
    });
  };

  // Get category badge color
  const getCategoryColor = (category?: string | null): string => {
    const colors: { [key: string]: string } = {
      practice: 'bg-blue-50 text-blue-700',
      tournament: 'bg-purple-50 text-purple-700',
      academic: 'bg-amber-50 text-amber-700',
      equipment: 'bg-gray-50 text-gray-700',
      travel: 'bg-green-50 text-green-700',
      fitness: 'bg-cyan-50 text-cyan-700',
      mental: 'bg-purple-50 text-purple-700',
      administrative: 'bg-orange-50 text-orange-700',
      other: 'bg-slate-50 text-slate-700',
    };
    const key = category || 'other';
    const result = colors[key];
    return result !== undefined ? result : 'bg-slate-50 text-slate-700';
  };

  // Recent/favorite templates (first 3)
  const recentTemplates = templates.slice(0, 3);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger Button / Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gray-400"
          >
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <path d="M14 2v6h6M12 18v-6M9 15h6" />
          </svg>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search templates..."
          className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
        />
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery('');
              inputRef.current?.focus();
            }}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-80 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <svg className="animate-spin h-5 w-5 text-brand-600" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="py-6 px-4 text-center">
              <p className="text-sm text-gray-500">
                {searchQuery ? 'No templates match your search' : 'No templates available'}
              </p>
            </div>
          ) : (
            <div className="overflow-y-auto max-h-72">
              {/* Quick Access Section (when no search) */}
              {!searchQuery && recentTemplates.length > 0 && (
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-500 mb-2">Quick Access</p>
                  <div className="flex flex-wrap gap-1.5">
                    {recentTemplates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleSelectTemplate(template)}
                        disabled={isPending}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors disabled:opacity-50"
                      >
                        {creatingId === template.id ? (
                          <svg
                            className="animate-spin h-3 w-3"
                            viewBox="0 0 24 24"
                            fill="none"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            />
                          </svg>
                        ) : (
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        )}
                        {template.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* All Templates */}
              <div className="py-1">
                {filteredTemplates.map((template, index) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    disabled={isPending}
                    className={cn(
                      'w-full px-3 py-2.5 text-left flex items-start gap-3 transition-colors',
                      'disabled:opacity-50',
                      selectedIndex === index ? 'bg-brand-50' : 'hover:bg-gray-50'
                    )}
                  >
                    {/* Icon */}
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
                      {creatingId === template.id ? (
                        <svg
                          className="animate-spin h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                      ) : (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                          <path d="M14 2v6h6" />
                        </svg>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-900 truncate">
                          {template.name}
                        </span>
                        {template.is_active && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-brand-50 text-brand-600 flex-shrink-0">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{template.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {template.category && (
                          <span
                            className={cn(
                              'inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded',
                              getCategoryColor(template.category)
                            )}
                          >
                            {template.category}
                          </span>
                        )}
                        {template.default_due_days && (
                          <span className="text-[10px] text-gray-400">
                            {template.default_due_days}d
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Create button */}
                    {showQuickCreate && selectedIndex === index && (
                      <div className="flex-shrink-0 self-center">
                        <span className="text-xs text-brand-600 font-medium">
                          {onSelectTemplate ? 'Select' : 'Create'}
                        </span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Footer hint */}
          <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
            <p className="text-[10px] text-gray-500 flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-600">
                ↑↓
              </kbd>
              Navigate
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-600">
                ↵
              </kbd>
              Select
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-600">
                Esc
              </kbd>
              Close
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default TemplateSelector;
