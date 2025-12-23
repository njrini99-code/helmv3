import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AuthCodeError() {
  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Email verification failed
          </h1>
          <p className="text-slate-500 mt-2">
            The verification link is invalid or has expired.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              This can happen if:
            </p>
            <ul className="text-sm text-slate-600 list-disc list-inside space-y-2">
              <li>The link has expired (links are valid for 24 hours)</li>
              <li>The link has already been used</li>
              <li>The link was copied incorrectly</li>
            </ul>
            <div className="pt-4 space-y-3">
              <Link href="/baseball/login">
                <Button className="w-full">
                  Try logging in
                </Button>
              </Link>
              <Link href="/baseball/signup">
                <Button variant="secondary" className="w-full">
                  Create a new account
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <p className="text-center text-sm text-slate-400 mt-6">
          Need help?{' '}
          <Link href="mailto:support@helmlab.com" className="text-green-600 hover:underline">
            Contact support
          </Link>
        </p>
      </div>
    </div>
  );
}
