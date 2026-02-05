import CompleteSignupClient from './CompleteSignupClient';

// Force dynamic rendering - requires Supabase auth at runtime
export const dynamic = 'force-dynamic';

export default function CompleteSignupPage() {
  return <CompleteSignupClient />;
}
