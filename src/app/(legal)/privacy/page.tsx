import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Helm Sports Labs',
  description: 'Privacy policy for Helm Sports Labs.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Legal</p>
            <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 mt-2">Privacy Policy</h1>
          </div>
          <Link href="/" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
            Back to home
          </Link>
        </div>

        <div className="space-y-10 text-slate-700 leading-relaxed">
          <section className="space-y-3">
            <p className="text-sm text-slate-500">Last updated: March 1, 2026</p>
            <p>
              This Privacy Policy explains how Helm Sports Labs collects, uses, and protects your
              information when you use our websites, products, and services (collectively, the
              &quot;Services&quot;).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-slate-900">Information we collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Account information such as name, email, role, and team details.</li>
              <li>Profile data you choose to provide, including performance and recruiting details.</li>
              <li>Usage data such as interactions, features used, and device information.</li>
              <li>Communications with support or within the platform.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-slate-900">How we use information</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Provide, maintain, and improve the Services.</li>
              <li>Personalize experiences for athletes, coaches, and organizations.</li>
              <li>Communicate product updates, security notices, and support responses.</li>
              <li>Protect the integrity and security of our platform.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-slate-900">How we share information</h2>
            <p>
              We do not sell personal data. We may share information with service providers who
              process data on our behalf, or when required by law. Team and recruiting data may be
              shared within authorized organizations based on your role and privacy settings.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-slate-900">Your choices</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Update profile and privacy settings from your account.</li>
              <li>Opt out of non-essential communications.</li>
              <li>Request account deletion through the settings page.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-slate-900">Children&apos;s privacy (COPPA)</h2>
            <p>
              The Services are not directed to children under the age of 13. You must be at least 13
              years old to create an account on Helm Sports Labs.
            </p>
            <p>
              We do not knowingly collect personal information from children under 13. If we become
              aware that we have inadvertently collected personal information from a child under 13,
              we will take steps to delete such information promptly.
            </p>
            <p>
              Users between the ages of 13 and 17 should use the Services with the awareness and
              consent of a parent or guardian. We encourage parents and guardians to monitor their
              children&apos;s online activity and to help enforce this policy.
            </p>
            <p>
              If you are a parent or guardian and believe your child under 13 has provided personal
              information to us, please contact us at{' '}
              <a href="mailto:support@helmsportslabs.com" className="text-primary-700 hover:text-primary-800">
                support@helmsportslabs.com
              </a>{' '}
              so we can take appropriate action.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-slate-900">Third-party services</h2>
            <p>
              We use the following third-party services to operate, monitor, and improve the
              Services. These providers may process data on our behalf in accordance with their own
              privacy policies:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Sentry</strong> &mdash; Error tracking and performance monitoring.</li>
              <li><strong>Datadog</strong> &mdash; Real user monitoring and analytics.</li>
              <li><strong>Vercel</strong> &mdash; Hosting and edge analytics.</li>
              <li><strong>Resend</strong> &mdash; Transactional email delivery.</li>
              <li><strong>Supabase</strong> &mdash; Database and authentication services.</li>
              <li><strong>Apple Push Notification service (APNs)</strong> &mdash; Push notifications on iOS.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-slate-900">Data retention</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Account data is retained as long as the account is active.</li>
              <li>
                Users can request account deletion by contacting{' '}
                <a href="mailto:support@helmsportslabs.com" className="text-primary-700 hover:text-primary-800">
                  support@helmsportslabs.com
                </a>.
              </li>
              <li>Deleted account data is purged within 30 days of the deletion request.</li>
              <li>Aggregated and anonymized analytics data may be retained indefinitely.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-slate-900">California privacy rights (CCPA)</h2>
            <p>
              If you are a California resident, you have the following rights under the California
              Consumer Privacy Act (CCPA):
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>The right to know what personal information is collected about you.</li>
              <li>The right to request deletion of your personal information.</li>
              <li>
                The right to opt out of the sale of your personal information. Note: we do not sell
                personal information.
              </li>
            </ul>
            <p>
              To exercise any of these rights, please contact us at{' '}
              <a href="mailto:support@helmsportslabs.com" className="text-primary-700 hover:text-primary-800">
                support@helmsportslabs.com
              </a>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-slate-900">Contact us</h2>
            <p>
              If you have questions about this policy, email us at{' '}
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
