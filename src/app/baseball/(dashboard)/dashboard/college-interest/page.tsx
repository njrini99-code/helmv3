import CollegeInterestClient from './CollegeInterestClient';
import { fairwayScope } from '@/lib/redesign/flag';

// Force dynamic rendering - requires Supabase auth at runtime
export const dynamic = 'force-dynamic';

export default function CollegeInterestPage() {
  return (
    <div className={fairwayScope('min-h-full')}>
      <CollegeInterestClient />
    </div>
  );
}
