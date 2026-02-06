import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import NewRoundClient from './new-round-client';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';

export default async function NewRoundPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/golf/login');
  }

  return (
    <AnimatedPage>
      <AnimatedItem>
        <NewRoundClient />
      </AnimatedItem>
    </AnimatedPage>
  );
}
