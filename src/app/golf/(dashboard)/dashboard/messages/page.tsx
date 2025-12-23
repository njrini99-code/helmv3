import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { IconMail } from '@/components/icons';

export default async function GolfMessagesPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Messages</h1>
          <p className="text-slate-500 mt-1">Team communication</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-12 shadow-sm text-center">
          <IconMail size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            Messages Coming Soon
          </h3>
          <p className="text-slate-500">
            Real-time team communication and messaging
          </p>
        </div>
      </div>
    </div>
  );
}
