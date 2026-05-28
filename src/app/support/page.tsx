import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Mail,
  Clock,
  LifeBuoy,
  BookOpen,
  Shield,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { SupportHeader } from './SupportHeader';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Support | Helm Sports Labs',
  description:
    'Get help with Helm Sports Labs — GolfHelm and BaseballHelm. Contact support, browse FAQs, and find resources for players, coaches, and teams.',
};

const faqs = [
  {
    q: 'I forgot my password. How do I reset it?',
    a: 'On the login screen, tap "Forgot Password" and enter the email associated with your account. We\'ll send you a secure reset link. If it doesn\'t arrive within a few minutes, check your spam folder or email us at admin@helmsportslabs.com.',
  },
  {
    q: 'How do I delete my account?',
    a: 'Open the app, go to Settings, and tap "Delete Account". This permanently removes your profile, stats, and personal data. You can also email admin@helmsportslabs.com and we\'ll process the deletion within 7 days.',
  },
  {
    q: 'Which devices are supported?',
    a: 'Helm Sports Labs runs on iPhone and iPad with iOS 13 or later. The web version works in any modern browser at helmsportslabs.com.',
  },
  {
    q: 'How is my data protected?',
    a: 'We take privacy seriously. Your data is encrypted in transit and at rest, stored on secure cloud infrastructure, and never sold to third parties. See our Privacy Policy for full details.',
  },
  {
    q: 'I\'m experiencing a bug or crash. What should I do?',
    a: 'Please email admin@helmsportslabs.com with a description of the issue, the device and iOS version you\'re using, and any screenshots. We typically respond within 1 business day.',
  },
  {
    q: 'Can I use the app without an internet connection?',
    a: 'Some features (like round entry in GolfHelm) support offline mode and sync when you reconnect. Most features require an internet connection.',
  },
];

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-cream-100">
      {/* Header */}
      <SupportHeader />

      <main className="max-w-4xl mx-auto px-6 py-12 md:py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-600/10 text-primary-600 mb-5">
            <LifeBuoy size={28} />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-warm-900 tracking-tight">
            How can we help?
          </h1>
          <p className="mt-4 text-lg text-warm-600 max-w-2xl mx-auto">
            We&apos;re here to help players, coaches, and teams get the most out
            of Helm Sports Labs. Find answers below or reach out to our support
            team directly.
          </p>
        </div>

        {/* Contact Cards */}
        <div className="grid md:grid-cols-2 gap-4 mb-12">
          <a href="mailto:admin@helmsportslabs.com" className="group block">
            <Card variant="overlay" padding="md">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-primary-600/10 text-primary-600 flex items-center justify-center flex-shrink-0">
                  <Mail size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-warm-900 mb-1">
                    Email Support
                  </h2>
                  <p className="text-sm text-warm-600 mb-2">
                    The fastest way to reach our team.
                  </p>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 group-hover:gap-2 transition-all">
                    admin@helmsportslabs.com
                    <ArrowRight size={14} />
                  </span>
                </div>
              </div>
            </Card>
          </a>

          <Card variant="overlay" hover={false} padding="md">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary-600/10 text-primary-600 flex items-center justify-center flex-shrink-0">
                <Clock size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-warm-900 mb-1">
                  Response Time
                </h2>
                <p className="text-sm text-warm-600">
                  We typically respond within{' '}
                  <span className="font-medium text-warm-900">
                    1 business day
                  </span>
                  , Monday through Friday.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* FAQ */}
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-6">
            <BookOpen size={20} className="text-primary-600" />
            <h2 className="text-2xl font-bold text-warm-900">
              Frequently Asked Questions
            </h2>
          </div>

          <Card variant="overlay" hover={false} padding="none" className="divide-y divide-warm-200/60">
            {faqs.map((item, i) => (
              <details key={i} className="group">
                <summary className="flex items-center justify-between cursor-pointer p-6 list-none">
                  <span className="font-medium text-warm-900 pr-4">
                    {item.q}
                  </span>
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-warm-100 text-warm-600 flex items-center justify-center text-lg leading-none group-open:rotate-45 transition-transform">
                    +
                  </span>
                </summary>
                <div className="px-6 pb-6 -mt-2">
                  <p className="text-warm-600 leading-relaxed">{item.a}</p>
                </div>
              </details>
            ))}
          </Card>
        </section>

        {/* Resources */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-warm-900 mb-6">
            More Resources
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Link href="/privacy" className="block">
              <Card variant="overlay" padding="sm" className="flex items-center gap-3 p-5">
                <Shield size={18} className="text-primary-600 flex-shrink-0" />
                <span className="font-medium text-warm-900">Privacy Policy</span>
              </Card>
            </Link>
            <Link href="/terms" className="block">
              <Card variant="overlay" padding="sm" className="flex items-center gap-3 p-5">
                <FileText size={18} className="text-primary-600 flex-shrink-0" />
                <span className="font-medium text-warm-900">Terms of Service</span>
              </Card>
            </Link>
          </div>
        </section>

        {/* Footer contact */}
        <div className="text-center text-sm text-warm-500 border-t border-warm-200/60 pt-8">
          <p>
            Helm Sports Labs &middot;{' '}
            <a
              href="mailto:admin@helmsportslabs.com"
              className="text-primary-600 hover:underline"
            >
              admin@helmsportslabs.com
            </a>
          </p>
          <p className="mt-2">
            &copy; {new Date().getFullYear()} Helm Sports Labs. All rights
            reserved.
          </p>
        </div>
      </main>
    </div>
  );
}
