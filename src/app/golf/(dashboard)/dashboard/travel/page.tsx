import { createClient } from '@/lib/supabase/server';
import { ShineEffect } from '@/components/ui/shine-effect';
import { redirect } from 'next/navigation';
import { IconAirplane } from '@/components/icons';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Travel | Helm Sports',
  description: 'Track tournament travel, manage logistics, and coordinate team itineraries for your golf program.',
};

export default async function GolfTravelPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  return (
    <div className="min-h-screen">
      {/* Header Section */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Travel</h1>
          <p className="text-slate-500 mt-0.5">Tournament travel itineraries</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div
          className="relative glass-standard rounded-2xl overflow-hidden p-16 text-center"
          style={{
            animation: 'fadeInUp 0.4s ease-out forwards',
            opacity: 0,
          }}
        >
          <ShineEffect />
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <IconAirplane size={28} className="text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Travel Management</h3>
          <p className="text-slate-500 max-w-sm mx-auto">
            Track tournament travel, manage logistics, and coordinate team itineraries all in one place
          </p>
        </div>
      </div>

      {/* CSS Keyframes */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
