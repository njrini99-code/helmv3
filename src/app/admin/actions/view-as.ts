'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { logSecurityEvent } from '@/lib/admin-logger';
import { signViewAsToken, VIEW_AS_COOKIE, VIEW_AS_TTL_MS } from '@/lib/admin/view-as';

async function writeAudit(action: string, adminUserId: string, targetUserId: string) {
  try {
    const admin = createAdminClient();
    await admin.from('audit_log').insert({
      user_id: adminUserId,
      action,
      table_name: 'users',
      record_id: targetUserId,
      new_data: { target_user: targetUserId, ttl_ms: VIEW_AS_TTL_MS },
    });
  } catch {
    // Auditing is best-effort here; the RPC-side audit patterns cover writes.
  }
}

/**
 * Enter read-only view-as for a target user. Super-admin only (gated first
 * line). Mints a short-lived HMAC-signed marker cookie — NEVER a session for
 * the target user — writes an `audit_log` row, emits a `logSecurityEvent`,
 * then redirects to the gated read-only surface.
 */
export async function enterViewAs(targetUserId: string): Promise<void> {
  const admin = await requireSuperAdmin();
  const secret = process.env.ADMIN_IMPERSONATION_SECRET;
  if (!secret) throw new Error('View-as not configured (ADMIN_IMPERSONATION_SECRET missing)');

  const expiresAt = Date.now() + VIEW_AS_TTL_MS;
  const cookieStore = await cookies();
  cookieStore.set(VIEW_AS_COOKIE, signViewAsToken(targetUserId, expiresAt, secret), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/admin',
    maxAge: Math.floor(VIEW_AS_TTL_MS / 1000),
  });

  await writeAudit('admin.view_as.enter', admin.userId, targetUserId);
  logSecurityEvent(`Admin entered read-only view-as for user ${targetUserId}`, 'warning', {
    targetUserId,
    adminUserId: admin.userId,
    ttlMs: VIEW_AS_TTL_MS,
  }).catch(() => {});

  redirect(`/admin/users/${targetUserId}/view-as`);
}

/**
 * Exit view-as: clears the marker cookie, writes an `audit_log` row + a
 * `logSecurityEvent`, then redirects back to the directory. Best-effort
 * even if the cookie is already gone/expired — exit must never throw.
 */
export async function exitViewAs(): Promise<void> {
  const admin = await requireSuperAdmin();
  const cookieStore = await cookies();
  const existing = cookieStore.get(VIEW_AS_COOKIE)?.value ?? '';
  cookieStore.delete(VIEW_AS_COOKIE);

  // The token format is `targetUserId.expiresMs.hmac` (view-as.ts) — pull the
  // id straight off the cookie for audit bookkeeping. This is NOT an
  // authorization check (exit doesn't need the HMAC/TTL to still be valid to
  // know who was being viewed), just recovering who to attribute the exit to.
  const targetUserId = existing.split('.')[0] || 'unknown';

  await writeAudit('admin.view_as.exit', admin.userId, targetUserId);
  logSecurityEvent('Admin exited view-as', 'info', {
    targetUserId,
    adminUserId: admin.userId,
  }).catch(() => {});

  redirect('/admin/users');
}
