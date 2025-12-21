import Link from 'next/link';
import { cn } from '@/lib/utils';
import { IconHome, IconChevronRight } from '@/components/icons';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav className={cn('flex items-center gap-1 text-sm', className)}>
      <Link
        href="/baseball/dashboard"
        className="p-1 text-slate-400 hover:text-slate-600 transition-colors rounded-md hover:bg-slate-100"
      >
        <IconHome size={16} />
      </Link>

      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-1">
          <IconChevronRight size={14} className="text-slate-300" />
          {item.href ? (
            <Link
              href={item.href}
              className="px-1.5 py-0.5 text-slate-500 hover:text-slate-900 transition-colors rounded-md hover:bg-slate-100"
            >
              {item.label}
            </Link>
          ) : (
            <span className="px-1.5 py-0.5 text-slate-900 font-medium">
              {item.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
