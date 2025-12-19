'use client';

import { Header } from '@/components/layout/header';
import { PageLoading } from '@/components/ui/loading';
import { ProfileEditor } from '@/components/features/profile-editor';
import { useAuth } from '@/hooks/use-auth';
import { Player } from '@/types/database';

export default function ProfilePage() {
  const { user, player, loading, updatePlayer } = useAuth();

  if (loading) return <PageLoading />;

  if (user?.role !== 'player' || !player) {
    return <div className="p-8">This page is only available to players</div>;
  }

  const handleUpdate = async (updates: Partial<Player>) => {
    await updatePlayer(updates);
  };

  return (
    <>
      <Header title="Edit Profile" subtitle="Update your information and showcase your talents" />
      <div className="p-8 max-w-6xl mx-auto">
        <ProfileEditor player={player} onUpdate={handleUpdate} />
      </div>
    </>
  );
}
