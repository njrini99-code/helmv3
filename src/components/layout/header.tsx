'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { NotificationCenter } from '@/components/features/notification-center';
import { useAuth } from '@/hooks/use-auth';
import { useNotifications } from '@/hooks/use-notifications';
import { getFullName, cn } from '@/lib/utils';
import {
  IconUser,
  IconSettings,
  IconLogOut,
  IconHelp,
  IconChevronDown,
  IconMenu,
  IconSearch,
  IconChevronLeft,
} from '@/components/icons';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  backHref?: string;
  onMenuClick?: () => void;
  showMobileMenu?: boolean;
}

export function Header({ title, subtitle, children, backHref, onMenuClick, showMobileMenu = true }: HeaderProps) {
  const router = useRouter();
  const { user, coach, player, signOut } = useAuth();
  const { notifications, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const name = coach?.full_name || getFullName(player?.first_name, player?.last_name);
  const email = user?.email || '';
  const avatarUrl = coach?.avatar_url || player?.avatar_url;
  const role = coach ? (coach.school_name || 'Coach') : (player ? `${player.primary_position} • ${player.grad_year}` : 'User');

  // Close user menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showUserMenu]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowUserMenu(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleSignOut = async () => {
    setShowUserMenu(false);
    await signOut();
    router.push('/baseball/login');
  };

  return (
    <header className="h-16 border-b border-slate-100 bg-white/80 backdrop-blur-xl sticky top-0 z-30">
      <div className="h-full px-4 lg:px-6 flex items-center justify-between gap-4">
        {/* Left: Mobile menu + Back + Title */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile menu button */}
          {showMobileMenu && onMenuClick && (
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 -ml-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <IconMenu size={20} />
            </button>
          )}

          {/* Back button */}
          {backHref && (
            <Link
              href={backHref}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-all duration-200 active:scale-95"
            >
              <IconChevronLeft size={20} />
            </Link>
          )}

          {/* Title */}
          {title && (
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-slate-900 tracking-tight truncate">{title}</h1>
              {subtitle && <p className="text-sm leading-relaxed text-slate-500 truncate">{subtitle}</p>}
            </div>
          )}
        </div>

        {/* Center: Command Palette Trigger (desktop) */}
        <button
          onClick={() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
          }}
          className="hidden md:flex items-center gap-3 px-4 py-2 text-sm text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-all duration-200 hover:border-slate-300 min-w-[200px] max-w-[280px]"
        >
          <IconSearch size={16} className="text-slate-400" />
          <span className="flex-1 text-left truncate">Search...</span>
          <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-medium text-slate-400 bg-white rounded border border-slate-200">
            ⌘K
          </kbd>
        </button>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {children}

          {/* Mobile search button */}
          <button
            onClick={() => {
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
            }}
            className="md:hidden p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <IconSearch size={20} />
          </button>

          {/* Notifications */}
          <NotificationCenter
            notifications={notifications}
            onMarkAsRead={markAsRead}
            onMarkAllAsRead={markAllAsRead}
            onDelete={deleteNotification}
          />

          {/* User Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className={cn(
                "flex items-center gap-2 p-1.5 rounded-xl transition-all duration-200",
                showUserMenu ? "bg-slate-100" : "hover:bg-slate-50"
              )}
            >
              <Avatar name={name} size="sm" src={avatarUrl} />
              <div className="hidden lg:block text-left max-w-[120px]">
                <div className="text-sm font-medium text-slate-900 truncate">{name || 'User'}</div>
                <div className="text-xs text-slate-500 truncate">{role}</div>
              </div>
              <IconChevronDown
                size={16}
                className={cn(
                  "hidden lg:block text-slate-400 transition-transform duration-200",
                  showUserMenu && "rotate-180"
                )}
              />
            </button>

            {/* User Dropdown */}
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50 animate-fade-in">
                {/* User info */}
                <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <Avatar name={name} size="md" src={avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900 truncate">{name || 'User'}</div>
                      <div className="text-sm leading-relaxed text-slate-500 truncate">{email}</div>
                    </div>
                  </div>
                </div>

                {/* Menu items */}
                <div className="p-2">
                  <UserMenuItem
                    href="/baseball/dashboard/profile"
                    icon={IconUser}
                    label="Your Profile"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <UserMenuItem
                    href="/baseball/dashboard/settings"
                    icon={IconSettings}
                    label="Settings"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <UserMenuItem
                    href="/help"
                    icon={IconHelp}
                    label="Help & Support"
                    onClick={() => setShowUserMenu(false)}
                  />
                </div>

                {/* Sign out */}
                <div className="p-2 border-t border-slate-100">
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <IconLogOut size={16} />
                    Sign out
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

function UserMenuItem({
  href,
  icon: Icon,
  label,
  onClick,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
    >
      <Icon size={16} className="text-slate-400" />
      {label}
    </Link>
  );
}
