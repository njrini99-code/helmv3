'use client';

import { ChevronRightIcon, HomeIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface DarkBreadcrumbsProps {
  items?: BreadcrumbItem[];
  showHome?: boolean;
  homeHref?: string;
  className?: string;
  separator?: 'chevron' | 'slash';
}

// ============================================
// HELPER
// ============================================

function generateBreadcrumbsFromPath(pathname: string, homeHref: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean);

  const breadcrumbs: BreadcrumbItem[] = [
    {
      label: 'Home',
      href: homeHref,
      icon: HomeIcon,
    },
  ];

  let currentPath = '';

  segments.forEach((segment, index) => {
    currentPath += `/${segment}`;

    // Skip common route groups like (dashboard), (auth), etc.
    if (segment.startsWith('(') && segment.endsWith(')')) {
      return;
    }

    // Format segment: remove dashes, capitalize each word
    const label = segment
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    breadcrumbs.push({
      label,
      // Only make it a link if it's not the last item
      href: index < segments.length - 1 ? currentPath : undefined,
    });
  });

  return breadcrumbs;
}

// ============================================
// COMPONENT
// ============================================

export function DarkBreadcrumbs({
  items,
  showHome = true,
  homeHref = '/dashboard',
  className,
  separator = 'chevron',
}: DarkBreadcrumbsProps) {
  const pathname = usePathname();

  // Use provided items or auto-generate from pathname
  const breadcrumbItems = items || generateBreadcrumbsFromPath(pathname, homeHref);

  // Filter out home if showHome is false
  const displayItems = showHome
    ? breadcrumbItems
    : breadcrumbItems.filter((item) => item.href !== homeHref);

  const Separator = () => {
    if (separator === 'slash') {
      return <span className="text-warm-300 mx-2">/</span>;
    }
    return <ChevronRightIcon className="h-4 w-4 text-warm-300 flex-shrink-0" />;
  };

  return (
    <nav className={cn('flex items-center gap-2 min-w-0', className)} aria-label="Breadcrumb">
      <ol className="flex items-center gap-2 min-w-0">
        {displayItems.map((item, index) => {
          const isLast = index === displayItems.length - 1;
          const Icon = item.icon;

          return (
            <li key={index} className="flex items-center gap-2 min-w-0">
              {index > 0 && <Separator />}

              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="
                    flex items-center gap-1.5
                    text-sm font-medium text-warm-500
                    hover:text-warm-700
                    transition-colors
                    truncate
                  "
                >
                  {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
                  <span className="truncate">{item.label}</span>
                </Link>
              ) : (
                <span
                  className={cn(
                    'flex items-center gap-1.5 truncate',
                    isLast
                      ? 'text-sm font-semibold text-warm-900'
                      : 'text-sm font-medium text-warm-500'
                  )}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
                  <span className="truncate">{item.label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ============================================
// USAGE EXAMPLES
// ============================================

/*
// Example 1: Auto-generate from pathname
<DarkBreadcrumbs />

// Example 2: Custom items
<DarkBreadcrumbs
  items={[
    { label: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    { label: 'Players', href: '/dashboard/players' },
    { label: 'John Doe' },
  ]}
/>

// Example 3: Without home
<DarkBreadcrumbs showHome={false} />

// Example 4: With slash separator
<DarkBreadcrumbs separator="slash" />

// Example 5: Custom home href
<DarkBreadcrumbs homeHref="/baseball/dashboard" />
*/
