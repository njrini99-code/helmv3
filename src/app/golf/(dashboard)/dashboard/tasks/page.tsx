import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { IconClipboardList } from '@/components/icons';

export default async function GolfTasksPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Tasks</h1>
            <p className="text-slate-500 mt-1">Assign and track player tasks</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-12 shadow-sm text-center">
          <IconClipboardList size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            Tasks Coming Soon
          </h3>
          <p className="text-slate-500">
            Assign and track completion of team tasks
          </p>
        </div>
      </div>
    </div>
  );
}
