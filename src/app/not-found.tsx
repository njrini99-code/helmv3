import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="mb-8">
          <h1 className="text-8xl font-bold text-warm-200">404</h1>
          <h2 className="text-2xl font-semibold text-warm-900 mt-4">Page not found</h2>
          <p className="text-warm-500 mt-2">
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
          <Link href="/golf/dashboard">
            <Button variant="secondary">Golf Dashboard</Button>
          </Link>
        </div>

        <p className="text-sm text-warm-400 mt-8">
          Need help? <Link href="mailto:admin@helmsportslabs.com" className="text-primary-600 hover:underline">Contact support</Link>
        </p>
      </div>
    </div>
  );
}
