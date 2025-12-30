import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'

export default function GolfLandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-950 via-amber-900 to-stone-900">
      {/* Simple nav */}
      <nav className="border-b border-white/10 bg-black/20 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/helm-golf-logo.png"
              alt="GolfHelm"
              width={48}
              height={48}
              className="h-12 w-auto"
            />
            <span className="text-xl font-semibold text-white">GolfHelm</span>
          </Link>
          <Link
            href="/golf/coach"
            className="px-5 py-2.5 rounded-xl bg-amber-600 text-white font-medium
                       hover:bg-amber-700 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-7xl mx-auto px-6 py-32 text-center">
        <div className="mb-8">
          <Image
            src="/helm-golf-logo.png"
            alt="GolfHelm"
            width={96}
            height={96}
            className="h-24 w-auto mx-auto mb-8"
          />
        </div>

        <h1 className="font-serif text-5xl md:text-7xl text-white mb-6">
          Manage your program<br />from tee to green.
        </h1>

        <p className="text-xl text-amber-200 max-w-2xl mx-auto mb-12">
          Team management and performance tracking for college golf.
          Track shots, manage rosters, and analyze performance.
        </p>

        <div className="flex flex-wrap gap-4 justify-center">
          <Link
            href="/golf/coach"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-amber-600 text-white font-medium
                       hover:bg-amber-700 transition-colors shadow-lg"
          >
            I'm a Coach
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link
            href="/golf/player"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl border-2 border-amber-400 text-amber-400 font-medium
                       hover:bg-amber-400 hover:text-white transition-colors"
          >
            I'm a Player
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-4 gap-6 mt-24 max-w-5xl mx-auto">
          {[
            'Shot Tracking',
            'Team Roster',
            'Performance Stats',
            'Practice Planning',
          ].map((feature) => (
            <div
              key={feature}
              className="p-6 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10"
            >
              <p className="text-amber-300 font-medium">{feature}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-32">
        <div className="max-w-7xl mx-auto px-6 py-8 text-center">
          <Link href="/" className="text-amber-400 hover:text-amber-300 transition-colors">
            ← Back to Helm Sports Labs
          </Link>
        </div>
      </footer>
    </div>
  )
}
