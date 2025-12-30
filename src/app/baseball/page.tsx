import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'BaseballHelm - Connect with College Coaches | Helm Sports',
  description: 'Recruiting platform for high school players and college programs. Build your profile, showcase your skills, and connect with coaches.',
}

export default function BaseballLandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-emerald-900 to-stone-900">
      {/* Simple nav */}
      <nav className="border-b border-white/10 bg-black/20 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/helm-baseball-logo.png"
              alt="BaseballHelm"
              width={48}
              height={48}
              className="h-12 w-auto"
              priority
            />
            <span className="text-xl font-semibold text-white">BaseballHelm</span>
          </Link>
          <Link
            href="/baseball/coach-onboarding"
            className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-medium
                       hover:bg-emerald-700 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-7xl mx-auto px-6 py-32 text-center">
        <div className="mb-8">
          <Image
            src="/helm-baseball-logo.png"
            alt="BaseballHelm"
            width={96}
            height={96}
            className="h-24 w-auto mx-auto mb-8"
            priority
          />
        </div>

        <h1 className="font-serif text-5xl md:text-7xl text-white mb-6">
          Connect with college coaches.<br />Get seen.
        </h1>

        <p className="text-xl text-emerald-200 max-w-2xl mx-auto mb-12">
          Recruiting platform for high school players and college programs.
          Build your profile, showcase your skills, and connect with coaches.
        </p>

        <div className="flex flex-wrap gap-4 justify-center">
          <Link
            href="/baseball/coach-onboarding"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-emerald-600 text-white font-medium
                       hover:bg-emerald-700 transition-colors shadow-lg"
          >
            I'm a Coach
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link
            href="/baseball/player"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl border-2 border-emerald-400 text-emerald-400 font-medium
                       hover:bg-emerald-400 hover:text-white transition-colors"
          >
            I'm a Player
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-4 gap-6 mt-24 max-w-5xl mx-auto">
          {['Recruiting Pipeline', 'Player Profiles', 'Video Library', 'Coach Network'].map((feature) => (
            <div
              key={feature}
              className="p-6 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10"
            >
              <p className="text-emerald-300 font-medium">{feature}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-32">
        <div className="max-w-7xl mx-auto px-6 py-8 text-center">
          <Link href="/" className="text-emerald-400 hover:text-emerald-300 transition-colors">
            ← Back to Helm Sports Labs
          </Link>
        </div>
      </footer>
    </div>
  )
}
