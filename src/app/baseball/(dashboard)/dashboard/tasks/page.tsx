// SECURITY: this route was a whole-file 'use client' page with NO server-side
// auth check at all. Shared coach + player surface (TasksClient branches
// internally on role) — thin server wrapper just requires a signed-in
// baseball user, matching the repo's standard shape.
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth/session';
import TasksClient from './TasksClient';

export default async function TasksPage() {
  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');

  return <TasksClient />;
}
