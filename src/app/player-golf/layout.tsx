import { GolfNav } from '@/components/golf/GolfNav';

export default function GolfLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <GolfNav />
      {children}
    </div>
  );
}
