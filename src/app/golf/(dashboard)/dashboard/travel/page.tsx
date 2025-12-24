import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { IconAirplane } from '@/components/icons';

export default async function GolfTravelPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  return (
    <div className="min-h-screen">
      {/* Header Section */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Travel</h1>
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-50 text-amber-700">
              Coming Soon
            </span>
          </div>
          <p className="text-slate-500 mt-0.5">Tournament travel itineraries</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div 
          className="bg-white rounded-2xl border border-slate-200/60 p-16 text-center"
          style={{
            animation: 'fadeInUp 0.4s ease-out forwards',
            opacity: 0,
          }}
        >
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <IconAirplane size={28} className="text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Travel Coming Soon</h3>
          <p className="text-slate-500 max-w-sm mx-auto">
            Create and manage tournament travel plans, itineraries, and logistics for your team
          </p>
          
          {/* Feature Preview */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
            {[
              { icon: '✈️', label: 'Flight Tracking', desc: 'Track team flights' },
              { icon: '🏨', label: 'Hotel Bookings', desc: 'Manage accommodations' },
              { icon: '📋', label: 'Itineraries', desc: 'Detailed schedules' },
            ].map((feature, i) => (
              <div 
                key={i} 
                className="p-4 rounded-xl bg-slate-50 border border-slate-100"
                style={{
                  animation: 'fadeInUp 0.4s ease-out forwards',
                  animationDelay: `${200 + i * 100}ms`,
                  opacity: 0,
                }}
              >
                <div className="text-2xl mb-2">{feature.icon}</div>
                <p className="font-medium text-slate-900 text-sm">{feature.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{feature.desc}</p>
              </div>
            ))}
          </div>
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
