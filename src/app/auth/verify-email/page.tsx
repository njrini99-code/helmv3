import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function VerifyEmail() {
  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Check your email
          </h1>
          <p className="text-slate-500 mt-2">
            We sent you a verification link
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              To complete your registration, please click the verification link we sent to your email address.
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-medium text-slate-900 text-sm mb-2">What's next?</h3>
              <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside">
                <li>Open your email inbox</li>
                <li>Click the verification link</li>
                <li>You'll be redirected to your dashboard</li>
              </ol>
            </div>
            <p className="text-xs text-slate-500">
              Didn't receive the email? Check your spam folder or try signing up again.
            </p>
            <div className="pt-2">
              <Link href="/baseball/login">
                <Button variant="secondary" className="w-full">
                  Back to Login
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
