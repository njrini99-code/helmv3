'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  SearchIcon,
  BellIcon,
  ChevronRightIcon,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
} from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { MobileMenuButton } from './mobile-menu-button';

// ============================================
// TYPES
// ============================================

interface DarkHeaderProps {
  onMobileMenuToggle?: () => void;
}

interface BreadcrumbItem {
  label: string;
  href?: string;
}

// ============================================
// BREADCRUMB HELPER
// ============================================

function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean);

  if (!segments.length) {
    return [{ label: 'Dashboard' }];
  }

  const breadcrumbs: BreadcrumbItem[] = [];
  let currentPath = '';

  segments.forEach((segment, index) => {
    currentPath += `/${segment}`;

    // Format segment: remove dashes, capitalize
    const label = segment
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    breadcrumbs.push({
      label,
      href: index < segments.length - 1 ? currentPath : undefined,
    });
  });

  return breadcrumbs;
}

// ============================================
// COMPONENT
// ============================================

export function DarkHeader({ onMobileMenuToggle }: DarkHeaderProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const breadcrumbs = getBreadcrumbs(pathname);
  const unreadCount = 3; // Mock - replace with actual count

  return (
    <header
      className="
        h-16
        sticky top-0 z-30
        bg-white/80 backdrop-blur-xl
        border-b border-warm-200/60
        shadow-sm
      "
    >
      <div className="h-full max-w-[2000px] mx-auto px-4 lg:px-6 flex items-center justify-between gap-4">
        {/* Left: Mobile Menu + Breadcrumbs */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Mobile Menu Button */}
          {onMobileMenuToggle && (
            <MobileMenuButton
              onClick={onMobileMenuToggle}
              theme="warm"
              mobileOnly
            />
          )}

          {/* Breadcrumbs */}
          <nav className="flex items-center gap-2 min-w-0" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, index) => (
              <div key={index} className="flex items-center gap-2">
                {index > 0 && (
                  <ChevronRightIcon className="h-4 w-4 text-warm-300 flex-shrink-0" />
                )}
                {crumb.href ? (
                  <a
                    href={crumb.href}
                    className="
                      text-sm font-medium text-warm-500
                      hover:text-warm-700
                      transition-colors
                      truncate
                    "
                  >
                    {crumb.label}
                  </a>
                ) : (
                  <span className="text-sm font-semibold text-warm-900 truncate">
                    {crumb.label}
                  </span>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Right: Search + Notifications + User */}
        <div className="flex items-center gap-2">
          {/* Search Button */}
          <button
            className="
              hidden sm:flex items-center gap-2
              px-3 py-2
              bg-warm-50 hover:bg-warm-100 active:bg-warm-200
              border border-warm-200
              rounded-lg
              text-sm text-warm-500
              transition-colors
            "
          >
            <SearchIcon className="h-4 w-4" />
            <span className="hidden md:inline">Search...</span>
            <kbd
              className="
                ml-2
                px-1.5 py-0.5
                bg-white rounded
                text-micro text-warm-400
                border border-warm-200
              "
            >
              ⌘K
            </kbd>
          </button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="
                relative
                p-2 rounded-lg
                text-warm-400 hover:text-warm-700 hover:bg-warm-100 active:bg-warm-200
                transition-colors
              "
              aria-label="Notifications"
            >
              <BellIcon className="h-5 w-5" />
              {unreadCount > 0 && (
                <span
                  className="
                    absolute top-1 right-1
                    w-2 h-2
                    bg-primary-600 rounded-full
                    ring-2 ring-white
                  "
                />
              )}
            </button>

            {/* Notifications Dropdown Menu */}
            {showNotifications && (
              <div
                className="
                  absolute right-0 top-full mt-2
                  w-80
                  bg-white rounded-xl
                  border border-warm-200
                  shadow-xl
                  overflow-hidden
                "
              >
                <div className="px-4 py-3 border-b border-warm-200">
                  <h3 className="text-sm font-semibold text-warm-900">
                    Notifications
                  </h3>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {/* Mock notifications */}
                  <div className="p-4 hover:bg-warm-50 border-b border-warm-100 transition-colors">
                    <p className="text-sm text-warm-700">
                      New player added to watchlist
                    </p>
                    <p className="text-xs text-warm-400 mt-1">2 hours ago</p>
                  </div>
                  <div className="p-4 hover:bg-warm-50 border-b border-warm-100 transition-colors">
                    <p className="text-sm text-warm-700">
                      Camp registration received
                    </p>
                    <p className="text-xs text-warm-400 mt-1">5 hours ago</p>
                  </div>
                  <div className="p-4 hover:bg-warm-50 transition-colors">
                    <p className="text-sm text-warm-700">
                      Profile view from Texas A&M
                    </p>
                    <p className="text-xs text-warm-400 mt-1">1 day ago</p>
                  </div>
                </div>
                <div className="px-4 py-3 border-t border-warm-200 text-center">
                  <a
                    href="/dashboard/notifications"
                    className="text-sm font-medium text-primary-600 hover:text-primary-700"
                  >
                    View all
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="
                flex items-center gap-2
                p-1.5 rounded-lg
                hover:bg-warm-100 active:bg-warm-200
                transition-colors
              "
              aria-label="User menu"
            >
              {/* Avatar */}
              <div
                className="
                  w-8 h-8 rounded-lg
                  bg-gradient-to-br from-primary-500 to-primary-600
                  flex items-center justify-center
                  text-white font-semibold text-sm
                "
              >
                {user?.user_metadata?.first_name?.[0] || user?.email?.[0] || 'U'}
                {user?.user_metadata?.last_name?.[0] || ''}
              </div>
              {/* Name (desktop only) */}
              <span className="hidden md:block text-sm font-medium text-warm-900">
                {user?.user_metadata?.first_name || 'User'}
              </span>
            </button>

            {/* User Dropdown Menu */}
            {showUserMenu && (
              <div
                className="
                  absolute right-0 top-full mt-2
                  w-56
                  bg-white rounded-xl
                  border border-warm-200
                  shadow-xl
                  overflow-hidden
                "
              >
                {/* User Info */}
                <div className="px-4 py-3 border-b border-warm-200">
                  <p className="text-sm font-semibold text-warm-900">
                    {user?.user_metadata?.first_name || 'User'}{' '}
                    {user?.user_metadata?.last_name || ''}
                  </p>
                  <p className="text-xs text-warm-500 mt-0.5 truncate">
                    {user?.email}
                  </p>
                </div>

                {/* Menu Items */}
                <div className="py-2">
                  <a
                    href="/dashboard/profile"
                    className="
                      flex items-center gap-3
                      px-4 py-2.5
                      text-sm text-warm-700
                      hover:bg-warm-50 active:bg-warm-100
                      transition-colors
                    "
                  >
                    <UserIcon className="h-4 w-4" />
                    <span>My Profile</span>
                  </a>
                  <a
                    href="/dashboard/settings"
                    className="
                      flex items-center gap-3
                      px-4 py-2.5
                      text-sm text-warm-700
                      hover:bg-warm-50 active:bg-warm-100
                      transition-colors
                    "
                  >
                    <SettingsIcon className="h-4 w-4" />
                    <span>Settings</span>
                  </a>
                </div>

                {/* Sign Out */}
                <div className="border-t border-warm-200 py-2">
                  <button
                    className="
                      w-full
                      flex items-center gap-3
                      px-4 py-2.5
                      text-sm text-red-600
                      hover:bg-red-50 active:bg-red-100
                      transition-colors
                    "
                  >
                    <LogOutIcon className="h-4 w-4" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
