'use client';

import Link from 'next/link';
import { ArrowRight, Compass, Layers, Sparkles, Target } from 'lucide-react';

const ambitions = [
  {
    icon: Target,
    title: 'Make talent visible',
    description: 'Surface athletes on merit, not connections, with trusted performance data and real context.',
  },
  {
    icon: Compass,
    title: 'Guide better decisions',
    description: 'Give coaches a clear, unbiased view of fit, readiness, and trajectory across every level.',
  },
  {
    icon: Layers,
    title: 'Unify the workflow',
    description: 'Replace scattered tools with one system that connects recruiting, development, and communication.',
  },
];

const principles = [
  {
    icon: Sparkles,
    title: 'Clarity over noise',
    description: 'We focus on the signal that matters most to athletes and programs.',
  },
  {
    icon: Target,
    title: 'Athlete-centered',
    description: 'Every workflow should help players improve, get seen, and land in the right environment.',
  },
  {
    icon: Compass,
    title: 'Trust and accountability',
    description: 'We build with integrity, privacy, and long-term outcomes as the baseline.',
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#FAF6F1] supports-[backdrop-filter]:bg-[#FAF6F1]/80 supports-[backdrop-filter]:backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <img
              src="/Helm-Logo-New-Main.png"
              alt="Helm Sports Labs"
              className="h-9 w-auto"
              style={{ mixBlendMode: 'multiply' }}
            />
            <span className="font-semibold text-slate-900 text-base sm:text-lg">Helm Sports Labs</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/" className="text-slate-600 hover:text-slate-900 transition-colors">
              Home
            </Link>
            <Link href="/about" className="text-slate-900 font-medium">
              About
            </Link>
            <Link
              href="/baseball/login"
              className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-500 transition-colors"
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white/80 border border-slate-200 text-xs uppercase tracking-[0.2em] text-slate-500 mb-6">
            Why Helm Exists
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-slate-900 tracking-tight mb-6">
            Build a recruiting system
            <span className="text-green-600"> athletes can trust</span>
          </h1>
          <p className="text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
            Recruiting should reward talent, effort, and fit. We&apos;re creating the platform
            that gives athletes visibility and gives coaches the confidence to make the right call.
          </p>
        </div>
      </section>

      {/* Why */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Why</h2>
              <p className="text-lg text-slate-600 leading-relaxed mb-6">
                The recruiting process is fragmented. Athletes have to prove themselves
                across disconnected platforms, and coaches are forced to make decisions
                without a complete picture of performance or potential.
              </p>
              <p className="text-lg text-slate-600 leading-relaxed">
                Helm exists to bring transparency and structure to that journey, so the
                right athletes and programs can find each other with confidence.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-8 shadow-sm">
              <div className="flex items-center gap-4 mb-6">
                <img
                  src="/Helm-Logo-New-Main.png"
                  alt="Helm Sports Labs"
                  className="h-12 w-auto"
                  style={{ mixBlendMode: 'multiply' }}
                />
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Our Why</p>
                  <p className="text-lg font-semibold text-slate-900">Opportunity should be earned</p>
                </div>
              </div>
              <p className="text-slate-600 leading-relaxed">
                We&apos;re building a recruiting system that values consistency, growth, and fit,
                giving every athlete a real chance to be discovered.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What we want to accomplish */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">What we want to accomplish</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              A single, modern platform that aligns athlete development with recruiting outcomes.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {ambitions.map((item) => (
              <div
                key={item.title}
                className="bg-white rounded-2xl p-6 border border-slate-200 hover:border-green-200 hover:shadow-lg transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mb-4">
                  <item.icon size={22} className="text-green-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Principles */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">How we build</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Principles that keep us honest and focused on outcomes.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {principles.map((item) => (
              <div
                key={item.title}
                className="bg-[#FAF6F1] rounded-2xl p-6 border border-slate-200 hover:border-green-200 hover:shadow-lg transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center mb-4">
                  <item.icon size={22} className="text-green-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-12 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-green-500/10 rounded-full blur-3xl" />
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Ready to get started?
              </h2>
              <p className="text-slate-300 text-lg mb-8 max-w-xl mx-auto">
                Start building a clearer recruiting process for your program or your athletes.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/baseball/signup"
                  className="inline-flex items-center gap-2 px-8 py-4 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-500 transition-colors"
                >
                  Create Free Account
                  <ArrowRight size={20} />
                </Link>
                <Link
                  href="/#demo"
                  className="inline-flex items-center gap-2 px-8 py-4 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 transition-colors"
                >
                  Request Demo
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-slate-200">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img
              src="/Helm-Logo-New-Main.png"
              alt="Helm Sports Labs"
              className="h-8 w-auto"
              style={{ mixBlendMode: 'multiply' }}
            />
          </div>
          <p className="text-slate-500 text-sm">
            Copyright {new Date().getFullYear()} Helm Sports Labs. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-slate-600 hover:text-slate-900 text-sm">
              Privacy
            </Link>
            <Link href="/terms" className="text-slate-600 hover:text-slate-900 text-sm">
              Terms
            </Link>
            <Link href="/help" className="text-slate-600 hover:text-slate-900 text-sm">
              Help
            </Link>
            <a href="mailto:support@helmsportslab.com" className="text-slate-600 hover:text-slate-900 text-sm">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
