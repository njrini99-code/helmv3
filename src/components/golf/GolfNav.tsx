'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconTarget, IconList, IconChartBar, IconHome } from '@/components/icons';

const navItems = [
  {
    href: '/golf/dashboard',
    label: 'Dashboard',
    icon: IconHome,
  },
  {
    href: '/golf/dashboard/rounds',
    label: 'My Rounds',
    icon: IconList,
  },
  {
    href: '/golf/dashboard/stats',
    label: 'Statistics',
    icon: IconChartBar,
  },
];

export function GolfNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/golf/dashboard') {
      return pathname === '/golf/dashboard';
    }
    return pathname?.startsWith(href);
  };

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <Link href="/golf/dashboard" className="flex items-center gap-2">
            <IconTarget size={24} className="text-green-600" />
            <span className="text-xl font-semibold text-slate-900">Golf Tracker</span>
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    isActive(item.href)
                      ? 'bg-green-50 text-green-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-3">
            <button className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
