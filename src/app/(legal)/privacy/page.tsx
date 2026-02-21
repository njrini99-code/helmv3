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
            <p className="text-sm text-slate-500">Last updated: January 1, 2025</p>
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
            <h2 className="text-2xl font-semibold text-slate-900">Data retention</h2>
            <p>
              We retain data only as long as necessary to provide the Services and meet legal
              obligations. When you delete your account, we remove or anonymize data as required.
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
