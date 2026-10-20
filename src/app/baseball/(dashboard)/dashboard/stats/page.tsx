// SHIM — redirect-only page with NO next.config.mjs redirects() entry; add one, then retire this page
import { redirect } from 'next/navigation';

export default function StatsPage() {
  redirect('/baseball/dashboard/stats-center');
}
