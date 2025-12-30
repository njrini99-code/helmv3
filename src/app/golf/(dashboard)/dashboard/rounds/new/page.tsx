import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import NewRoundClient from './new-round-client';

export default async function NewRoundPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/golf/login');
  }

  return <NewRoundClient />;
}
