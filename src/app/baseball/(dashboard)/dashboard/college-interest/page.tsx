import CollegeInterestClient from './CollegeInterestClient';

// Force dynamic rendering - requires Supabase auth at runtime
export const dynamic = 'force-dynamic';

export default function CollegeInterestPage() {
  return <CollegeInterestClient />;
}
