'use client';

import { useState, useMemo } from 'react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { IconUsers, IconSearch } from '@/components/icons';

interface Props {
  users: AdminDashboardData['userDirectory'];
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type SortKey = 'name' | 'role' | 'team' | 'lastActive' | 'rounds' | 'signup';
type SortDir = 'asc' | 'desc';

export function UserActivityTable({ users }: Props) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('signup');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const filtered = useMemo(() => {
    let result = users;

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((u) =>
        u.email.toLowerCase().includes(q) ||
        (u.firstName && u.firstName.toLowerCase().includes(q)) ||
        (u.lastName && u.lastName.toLowerCase().includes(q)) ||
        (u.teamName && u.teamName.toLowerCase().includes(q))
      );
    }

    // Role filter
    if (roleFilter !== 'all') {
      result = result.filter((u) => u.role === roleFilter);
    }

    // Sort
    result = [...result].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'name': {
          const nameA = `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim().toLowerCase();
          const nameB = `${b.firstName ?? ''} ${b.lastName ?? ''}`.trim().toLowerCase();
          return nameA.localeCompare(nameB) * dir;
        }
        case 'role':
          return (a.role ?? '').localeCompare(b.role ?? '') * dir;
        case 'team':
          return (a.teamName ?? '').localeCompare(b.teamName ?? '') * dir;
        case 'lastActive': {
          const dateA = a.lastRoundDate ? new Date(a.lastRoundDate).getTime() : 0;
          const dateB = b.lastRoundDate ? new Date(b.lastRoundDate).getTime() : 0;
          return (dateA - dateB) * dir;
        }
        case 'rounds':
          return (a.totalRounds - b.totalRounds) * dir;
        case 'signup': {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return (dateA - dateB) * dir;
        }
        default:
          return 0;
      }
    });

    return result;
  }, [users, search, roleFilter, sortKey, sortDir]);

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(0);
  }

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span className="ml-1 text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) {
      const r = u.role ?? 'unknown';
      counts[r] = (counts[r] ?? 0) + 1;
    }
    return counts;
  }, [users]);

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 transition-all duration-200 hover:bg-white/80 hover:shadow-card-hover">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-white/50 rounded-lg text-warm-500">
            <IconUsers size={18} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-warm-900">User Directory</h3>
            <p className="text-xs text-warm-400">{users.length} total users</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
          <input
            type="text"
            placeholder="Search name, email, team..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white/60 border border-white/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/30 text-warm-700 placeholder-warm-400"
          />
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => { setRoleFilter('all'); setPage(0); }}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              roleFilter === 'all' ? 'bg-warm-900 text-white' : 'bg-white/50 text-warm-500 hover:bg-white/70'
            )}
          >
            All ({users.length})
          </button>
          {Object.entries(roleCounts).sort(([a], [b]) => a.localeCompare(b)).map(([role, count]) => (
            <button
              key={role}
              onClick={() => { setRoleFilter(role); setPage(0); }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize',
                roleFilter === role ? 'bg-warm-900 text-white' : 'bg-white/50 text-warm-500 hover:bg-white/70'
              )}
            >
              {role}s ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-6 px-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-warm-100">
              {([
                { key: 'name' as SortKey, label: 'User' },
                { key: 'role' as SortKey, label: 'Role' },
                { key: 'team' as SortKey, label: 'Team' },
                { key: 'lastActive' as SortKey, label: 'Last Active' },
                { key: 'rounds' as SortKey, label: 'Rounds' },
                { key: 'signup' as SortKey, label: 'Signed Up' },
              ]).map((col) => (
                <th
                  key={col.key}
                  className="text-left py-2.5 px-2 text-xs font-medium text-warm-500 cursor-pointer hover:text-warm-700 select-none whitespace-nowrap"
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}{sortIcon(col.key)}
                </th>
              ))}
              <th className="text-left py-2.5 px-2 text-xs font-medium text-warm-500 whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((u) => {
              const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || '—';
              return (
                <tr key={u.id} className="border-b border-warm-50 hover:bg-white/40 transition-colors">
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                        <span className="text-xs font-medium text-primary-700">
                          {(u.firstName ?? u.email).charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-warm-800 font-medium truncate">{name}</p>
                        <p className="text-[11px] text-warm-400 truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-2">
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full font-medium capitalize',
                      u.role === 'coach' ? 'bg-blue-50 text-blue-600' :
                      u.role === 'player' ? 'bg-primary-50 text-primary-700' :
                      u.role === 'admin' ? 'bg-purple-50 text-purple-600' :
                      'bg-warm-100 text-warm-500'
                    )}>
                      {u.role ?? 'unknown'}
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    <span className="text-warm-700 text-sm">{u.teamName ?? '—'}</span>
                  </td>
                  <td className="py-2.5 px-2">
                    <span className={cn(
                      'text-sm tabular-nums',
                      u.lastRoundDate ? 'text-warm-700' : 'text-warm-300'
                    )}>
                      {timeAgo(u.lastRoundDate)}
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    <span className={cn(
                      'text-sm font-medium tabular-nums',
                      u.totalRounds > 0 ? 'text-warm-800' : 'text-warm-300'
                    )}>
                      {u.totalRounds}
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    <span className="text-xs text-warm-500 tabular-nums">{formatDate(u.createdAt)}</span>
                  </td>
                  <td className="py-2.5 px-2">
                    {u.onboardingCompleted ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        Onboarding
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-warm-100">
          <p className="text-xs text-warm-400">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs rounded-lg bg-white/50 text-warm-600 hover:bg-white/70 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
              disabled={page >= pageCount - 1}
              className="px-3 py-1.5 text-xs rounded-lg bg-white/50 text-warm-600 hover:bg-white/70 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
