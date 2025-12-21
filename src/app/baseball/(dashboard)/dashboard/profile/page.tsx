'use client';

import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';
import { ProfileEditor } from '@/components/features/profile-editor';
import { useAuth } from '@/hooks/use-auth';
import { IconGlobe } from '@/components/icons';
import { Player } from '@/lib/types';

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
      <Header title="Edit Profile" subtitle="Update your information and showcase your talents">
        <Link href={`/baseball/player/${player.id}`} target="_blank">
          <Button variant="secondary" size="sm" className="gap-2">
            <IconGlobe size={14} />
            View Public Profile
          </Button>
        </Link>
      </Header>
      <div className="p-8 max-w-6xl mx-auto">
        <ProfileEditor player={player} onUpdate={handleUpdate} />
      </div>
    </>
  );
}
