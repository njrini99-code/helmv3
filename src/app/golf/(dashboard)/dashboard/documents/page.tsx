import { createClient } from '@/lib/supabase/server';
import { ShineEffect } from '@/components/ui/shine-effect';
import { redirect } from 'next/navigation';
import { IconFolder } from '@/components/icons';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documents | Helm Sports',
  description: 'Access and manage your team files, resources, and important documents',
};

export default async function GolfDocumentsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Documents</h1>
            <p className="text-slate-500 mt-1">Team files and resources</p>
          </div>
        </div>

        <div className="relative glass-standard rounded-2xl overflow-hidden p-12 text-center">
          <ShineEffect />
          <IconFolder size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            No Documents Yet
          </h3>
          <p className="text-slate-500 mb-4">
            Your team's files and resources will appear here
          </p>
          <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
            Upload Document
          </button>
        </div>
      </div>
    </div>
  );
}
