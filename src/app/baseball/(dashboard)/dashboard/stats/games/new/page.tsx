import { redirect } from 'next/navigation';
import { BASEBALL_STATS_GAME_CREATE_PATH } from '@/lib/baseball/stats-route-aliases';

/** Temporary redirect alias — canonical route is /stats/games/create (#378). */
export default function LegacyNewGameRedirect() {
  redirect(BASEBALL_STATS_GAME_CREATE_PATH);
}
