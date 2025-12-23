'use client';

import Link from 'next/link';
import { ArrowRight, Target, Users, Zap, Shield, Trophy, Heart } from 'lucide-react';

const values = [
  {
    icon: Target,
    title: 'Player-First',
    description: 'Every feature we build starts with one question: does this help athletes achieve their dreams?',
  },
  {
    icon: Users,
    title: 'Connection',
    description: 'We believe the right connection at the right time can change everything. We make those connections happen.',
  },
  {
    icon: Zap,
    title: 'Simplicity',
    description: 'Recruiting is complex enough. Our platform makes it simple, intuitive, and dare we say—enjoyable.',
  },
  {
    icon: Shield,
    title: 'Trust',
    description: 'Athletes and coaches trust us with their futures. We take that responsibility seriously.',
  },
];

const stats = [
  { value: '10,000+', label: 'Athletes' },
  { value: '500+', label: 'Programs' },
  { value: '1,000+', label: 'Commitments' },
  { value: '50', label: 'States' },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#FAF6F1]/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/helm-main-logo.png"
              alt="Helm Sports Lab"
              className="h-10 w-auto"
              style={{ mixBlendMode: 'multiply' }}
            />
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
          <h1 className="text-5xl md:text-6xl font-bold text-slate-900 tracking-tight mb-6">
            The Future of
            <span className="text-green-600"> Sports Recruiting</span>
          </h1>
          <p className="text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
            Helm Sports Lab is building the platform that connects talented athletes 
            with the programs where they&apos;ll thrive. No more missed opportunities. 
            No more guesswork. Just the right match.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Our Mission</h2>
              <p className="text-lg text-slate-600 leading-relaxed mb-6">
                Every year, thousands of talented athletes miss out on opportunities 
                because the recruiting process is broken. Coaches can&apos;t find the right 
                players. Players don&apos;t know which programs are interested.
              </p>
              <p className="text-lg text-slate-600 leading-relaxed mb-6">
                We started Helm to fix that. Our platform gives coaches powerful 
                discovery tools and gives athletes visibility they&apos;ve never had before. 
                The result? Better matches, more opportunities, and athletes playing 
                at programs where they belong.
              </p>
              <p className="text-lg text-slate-600 leading-relaxed">
                Whether you&apos;re a D1 program or a small-town high school player with 
                big dreams, Helm levels the playing field.
              </p>
            </div>
            <div className="relative">
              <div className="aspect-square rounded-3xl bg-gradient-to-br from-green-100 to-emerald-50 flex items-center justify-center">
                <Trophy size={120} className="text-green-600/30" />
              </div>
              <div className="absolute -bottom-6 -left-6 bg-white rounded-2xl shadow-xl p-6 border border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                    <Heart size={24} className="text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">Built with passion</p>
                    <p className="text-sm text-slate-500">By athletes, for athletes</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-6 bg-slate-900">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-4xl md:text-5xl font-bold text-white mb-2">
                  {stat.value}
                </p>
                <p className="text-slate-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">What We Believe</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              These principles guide everything we build
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value) => (
              <div
                key={value.title}
                className="bg-white rounded-2xl p-6 border border-slate-200 hover:border-green-200 hover:shadow-lg transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mb-4">
                  <value.icon size={24} className="text-green-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{value.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Built by Athletes</h2>
          <p className="text-lg text-slate-600 leading-relaxed mb-8">
            Our team includes former college athletes, coaches, and recruiting 
            coordinators who&apos;ve experienced the process firsthand. We know what&apos;s 
            broken because we&apos;ve lived it. And we&apos;re obsessed with making it better.
          </p>
          <div className="inline-flex items-center gap-4 px-6 py-3 bg-slate-100 rounded-full">
            <div className="flex -space-x-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 border-2 border-white"
                />
              ))}
            </div>
            <span className="text-slate-600">And the team keeps growing...</span>
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
                Join thousands of athletes and coaches already using Helm to 
                transform their recruiting journey.
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
              src="/helm-main-logo.png"
              alt="Helm Sports Lab"
              className="h-8 w-auto"
              style={{ mixBlendMode: 'multiply' }}
            />
          </div>
          <p className="text-slate-500 text-sm">
            © {new Date().getFullYear()} Helm Sports Lab. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
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
