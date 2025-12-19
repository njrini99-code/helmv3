import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  suggestion?: string;
  className?: string;
  variant?: 'default' | 'card' | 'minimal';
}

export function EmptyState({ icon, title, description, action, suggestion, className, variant = 'default' }: EmptyStateProps) {
  if (variant === 'minimal') {
    return (
      <div className={cn('text-center py-8 px-4 animate-fade-in', className)}>
        <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
          {icon}
        </div>
        <p className="text-sm text-slate-500">{description}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className={cn('bg-white rounded-2xl border border-slate-200 p-8 text-center animate-fade-in', className)}>
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center text-green-600">
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-slate-900 tracking-tight mb-2">{title}</h3>
        <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto leading-relaxed">{description}</p>
        {suggestion && (
          <p className="text-xs text-slate-400 mb-4">{suggestion}</p>
        )}
        {action && <div className="mt-2">{action}</div>}
      </div>
    );
  }

  return (
    <div className={cn('text-center py-16 px-4 animate-fade-in', className)}>
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-green-100/50 to-emerald-100/50 animate-pulse" />
        <div className="relative w-full h-full rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
          {icon}
        </div>
      </div>
      <h3 className="text-lg font-semibold text-slate-900 tracking-tight mb-2">{title}</h3>
      <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto leading-relaxed">{description}</p>
      {suggestion && (
        <p className="text-xs text-slate-400 mb-4">
          {suggestion}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// Variant for search results
interface SearchEmptyStateProps {
  query?: string;
  filters?: string[];
  onClearFilters?: () => void;
}

export function SearchEmptyState({ query, filters, onClearFilters }: SearchEmptyStateProps) {
  return (
    <div className="text-center py-16 px-4 animate-fade-in">
      <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-slate-100 flex items-center justify-center">
        <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-slate-900 tracking-tight mb-2">
        No results found
      </h3>
      <p className="text-sm text-slate-500 mb-4 max-w-sm mx-auto">
        {query ? (
          <>No matches for &quot;{query}&quot;</>
        ) : (
          <>No items match your current filters</>
        )}
      </p>
      {filters && filters.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          {filters.map((filter, i) => (
            <span key={i} className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded-full">
              {filter}
            </span>
          ))}
        </div>
      )}
      {onClearFilters && (
        <button
          onClick={onClearFilters}
          className="text-sm text-slate-600 hover:text-slate-900 underline underline-offset-2"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}
