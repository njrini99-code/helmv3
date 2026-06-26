'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { ModeToggle, type Mode } from '@/components/layout/mode-toggle';

export function JUCOModeToggle() {
  const router = useRouter();
  const { coach, coachMode, setCoachMode } = useAuth();

  if (!coach || coach.coach_type !== 'juco') return null;

  const handleModeChange = (mode: Mode) => {
    setCoachMode(mode as 'recruiting' | 'team');
    if (mode === 'team') {
      router.push('/baseball/dashboard/command-center');
    } else {
      router.push('/baseball/dashboard/command-center');
    }
  };

  return (
    <ModeToggle currentMode={coachMode} onModeChange={handleModeChange} />
  );
}
