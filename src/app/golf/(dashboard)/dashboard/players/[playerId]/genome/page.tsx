import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/utils/uuid';

// An old address: its layout sends each role to its Clubhouse screen (src/clubhouse/routes/alias.ts), and the Clubhouse
// frame shows a role it does not send on its coach-only state. Nothing renders here; a malformed id is still a 404,
// before anything reads it (src/test/golf/id-pages-validate-uuid.test.ts).
export default async function AliasPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  if (!isUuid(playerId)) notFound();
  return null;
}
