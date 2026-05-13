import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | Helm Sports Labs',
  description: 'Terms of Service for Helm Sports Labs.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-warm-500">Legal</p>
            <h1 className="text-4xl md:text-5xl font-semibold text-warm-900 mt-2">Terms of Service</h1>
          </div>
          <Link href="/" className="text-sm text-warm-600 hover:text-warm-900 transition-colors">
            Back to home
          </Link>
        </div>

        <div className="space-y-10 text-warm-700 leading-relaxed">
          <section className="space-y-3">
            <p className="text-sm text-warm-500">Last updated: March 1, 2026</p>
            <p>
              These Terms of Service govern your access to and use of the Helm Sports Labs
              Services. By using the Services, you agree to these Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-warm-900">Eligibility</h2>
            <p>
              You must be at least 13 years old to use this Service. By creating an account, you
              represent and warrant that you are at least 13 years old. Users between 13 and 17 years
              old must have parental or guardian awareness and consent to use this Service.
            </p>
            <p>
              In compliance with the Children&apos;s Online Privacy Protection Act (COPPA), we do not
              knowingly collect personal information from children under 13. If we discover that a
              child under 13 has provided personal information, we will promptly delete such
              information.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-warm-900">Account responsibilities</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Provide accurate information and keep your account secure.</li>
              <li>Do not share login credentials or access other users&apos; accounts.</li>
              <li>You are responsible for all activity under your account.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-warm-900">Acceptable use</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Do not upload unlawful, harmful, or infringing content.</li>
              <li>Do not attempt to access data outside your authorized team or organization.</li>
              <li>Do not interfere with or disrupt platform operations.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-warm-900">Content and permissions</h2>
            <p>
              You retain ownership of the content you upload. By using the Services, you grant us
              a license to host, store, and display your content as needed to operate the platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-warm-900">Termination</h2>
            <p>
              You may delete your account at any time. We may suspend or terminate access if you
              violate these Terms or misuse the Services.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-warm-900">Disclaimer</h2>
            <p>
              The Services are provided &quot;as is&quot; without warranties of any kind. We do not
              guarantee recruiting outcomes or athletic performance results.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-warm-900">Contact us</h2>
            <p>
              Questions about these Terms? Email{' '}
              <a href="mailto:admin@helmsportslabs.com" className="text-primary-700 hover:text-primary-800">
                admin@helmsportslabs.com
              </a>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
