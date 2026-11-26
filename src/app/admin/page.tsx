import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';

/**
 * The Bridge's front door is Today (owner, 2026-11-26: the spaces are the admin, on the phone and the desk). Pulse,
 * which lived here, is at /admin/pulse and stays in the rail under Clubhouse.
 */
// Shown only for the instant before the redirect lands.
export const metadata: Metadata = { title: 'Today' };

export default async function AdminHome(): Promise<never> {
  await requireSuperAdmin();
  redirect('/admin/spaces/today');
}
