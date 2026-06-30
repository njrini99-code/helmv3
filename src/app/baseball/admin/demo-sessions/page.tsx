import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getBaseballDemoSessions } from '@/app/baseball/actions/demo-tracking';
import { IconUsers, IconChevronRight, IconActivity } from '@/components/icons';

export const metadata = { title: 'Demo Sessions — BaseballHelm' };

// ── helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/** Shorten a user-agent string for display without truncating past a natural break */
function shortUA(ua: string | null): string {
  if (!ua) return '—';
  const match = ua.match(/^([A-Za-z/0-9.]+)\s*(\([^)]+\))?/);
  return match ? `${match[1]} ${match[2] ?? ''}`.trim() : ua.slice(0, 60);
}

// ── page ───────────────────────────────────────────────────────────────────

export default async function BaseballDemoSessionsPage() {
  let result: Awaited<ReturnType<typeof getBaseballDemoSessions>> | null = null;
  let fetchError: string | null = null;

  try {
    result = await getBaseballDemoSessions();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load demo sessions.';
    // Unauthenticated / non-admin visitors get bounced rather than shown an
    // error shell — this page has no dedicated admin layout guard yet (see
    // PR notes), so the action's own auth/role check is the enforcement
    // boundary; route them to login instead of leaking that the page exists.
    if (message === 'Unauthorized' || message === 'Forbidden') {
      redirect('/baseball/login');
    }
    fetchError = message;
  }

  const sessions = result?.sessions ?? [];
  const total = result?.total ?? 0;

  return (
    <div className="min-h-screen bg-[#FFFEFA] p-6 md:p-10">
      {/* ── Breadcrumb ─────────────────────────────────────────────────── */}
      {/* NOTE: BaseballHelm has no `/baseball/admin` index page yet (unlike
          GolfHelm's `/golf/admin`), so this links straight to the dashboard
          rather than a not-yet-built admin home. */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-warm-400 mb-8">
        <Link href="/baseball/dashboard" className="hover:text-warm-700 transition-colors">
          Dashboard
        </Link>
        <IconChevronRight className="w-3.5 h-3.5 text-warm-300" />
        <span className="text-warm-700 font-medium">Demo Sessions</span>
      </nav>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
            <IconActivity className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-warm-900 tracking-tight">Demo Sessions</h1>
            <p className="text-sm text-warm-500 mt-0.5">Coaches who explored the read-only live demo</p>
          </div>
        </div>

        {/* Summary badge */}
        {result && (
          <div className="flex items-center gap-2 bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass px-4 py-2.5 self-start sm:self-auto">
            <IconUsers className="w-4 h-4 text-primary-600" />
            <span className="text-sm font-semibold text-warm-900">
              {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
            </span>
            {total > 200 && (
              <span className="text-xs text-warm-400">(showing most recent 200)</span>
            )}
          </div>
        )}
      </div>

      {/* ── Error state ────────────────────────────────────────────────── */}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 text-sm">
          <strong className="font-semibold">Could not load sessions.</strong>
          <p className="mt-1 text-red-600">{fetchError}</p>
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {!fetchError && sessions.length === 0 && (
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-warm-50 flex items-center justify-center mb-4">
            <IconUsers className="w-7 h-7 text-warm-300" />
          </div>
          <p className="text-warm-700 font-medium text-lg">No demo sessions yet</p>
          <p className="text-warm-400 text-sm mt-2 max-w-xs">
            Sessions appear here once a coach completes the demo gate form and enters the live demo.
          </p>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────── */}
      {!fetchError && sessions.length > 0 && (
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass overflow-hidden">
          {/* Scrollable wrapper for narrow viewports */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/30 bg-white/40">
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-warm-500 uppercase tracking-wider whitespace-nowrap">
                    Name
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-warm-500 uppercase tracking-wider whitespace-nowrap">
                    Email
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-warm-500 uppercase tracking-wider whitespace-nowrap">
                    Program / Org
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-warm-500 uppercase tracking-wider whitespace-nowrap">
                    Entered
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-warm-500 uppercase tracking-wider whitespace-nowrap">
                    IP
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-warm-500 uppercase tracking-wider whitespace-nowrap">
                    Browser
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20">
                {sessions.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-white/40 transition-colors duration-100 group"
                  >
                    <td className="px-5 py-3.5 text-warm-900 font-medium whitespace-nowrap">
                      {s.name}
                    </td>
                    <td className="px-5 py-3.5 text-warm-700 whitespace-nowrap">
                      <a
                        href={`mailto:${s.email}`}
                        className="hover:text-primary-600 transition-colors underline underline-offset-2 decoration-warm-300 group-hover:decoration-primary-400"
                      >
                        {s.email}
                      </a>
                    </td>
                    <td className="px-5 py-3.5 text-warm-600 whitespace-nowrap">
                      {s.program ?? <span className="text-warm-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-warm-600 whitespace-nowrap tabular-nums">
                      {formatDate(s.entered_at)}
                    </td>
                    <td className="px-5 py-3.5 text-warm-500 font-mono text-xs whitespace-nowrap">
                      {s.ip ?? <span className="text-warm-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-warm-500 text-xs max-w-[220px] truncate" title={s.user_agent ?? undefined}>
                      {shortUA(s.user_agent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer note */}
          {total > 200 && (
            <div className="border-t border-white/20 px-5 py-3 text-xs text-warm-400 text-center">
              Showing the 200 most recent entries of {total.toLocaleString()} total.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
