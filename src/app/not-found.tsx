import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="mb-8">
          <h1 className="text-8xl font-bold text-slate-200">404</h1>
          <h2 className="text-2xl font-semibold text-slate-900 mt-4">Page not found</h2>
          <p className="text-slate-500 mt-2">
            Sorry, we couldn't find the page you're looking for.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/">
            <Button variant="secondary">Go to Home</Button>
          </Link>
          <Link href="/baseball/dashboard">
            <Button>Baseball Dashboard</Button>
          </Link>
        </div>

        <p className="text-sm text-slate-400 mt-8">
          Need help? <Link href="mailto:support@helmlab.com" className="text-green-600 hover:underline">Contact support</Link>
        </p>
      </div>
    </div>
  );
}
