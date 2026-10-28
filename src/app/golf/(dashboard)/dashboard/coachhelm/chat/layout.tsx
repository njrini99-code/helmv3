import { aliasId, aliasText, redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: the coach's chat is the Ask sub-tab of CoachHelm (`?view=ask`); a player has no chat, so theirs opens CoachHelm.
// An old link's conversation (`?c=`, id-shaped) and question (`?q=`, encoded) come along; nothing else of its query does.
export default async function CoachHelmChatLayout({ children }: { children: React.ReactNode }) {
  const toAsk = (q: URLSearchParams) => {
    const c = aliasId(q, 'c');
    const question = aliasText(q, 'q');
    return `/golf/dashboard/coachhelm?${new URLSearchParams({ view: 'ask', ...(c ? { c } : {}), ...(question ? { q: question } : {}) })}`;
  };
  await redirectToClubhouse({ coach: toAsk, player: '/golf/dashboard/coachhelm' });
  return children;
}
