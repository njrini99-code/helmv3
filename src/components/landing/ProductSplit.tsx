'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'

const products = [
  {
    name: 'BaseballHelm',
    tagline: 'Connect with college coaches. Get seen.',
    description: 'Recruiting platform for high school players and college programs.',
    features: ['Recruiting Pipeline', 'Player Profiles', 'Video Library', 'Coach Network'],
    href: '/products#baseballhelm',
    accentColor: 'emerald',
    logo: '/helm-baseball-logo.png',
  },
  {
    name: 'GolfHelm',
    tagline: 'Manage your program from tee to green.',
    description: 'Team management and performance tracking for college golf.',
    features: ['Shot Tracking', 'Team Roster', 'Performance Stats', 'Practice Planning'],
    href: '/products#golfhelm',
    accentColor: 'amber',
    logo: '/helm-golf-logo.png',
  },
]

export function ProductSplit() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  return (
    <section ref={ref} className="py-32 relative overflow-hidden">
      {/* Rich gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-stone-900 via-stone-800 to-stone-900" />

      {/* Ambient glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-helm-primary-500/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-amber-500/20 rounded-full blur-[120px]" />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Section header */}
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-center font-serif text-4xl md:text-5xl text-white mb-4"
        >
          Two sports. One platform.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.35, delay: 0.06, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-center text-xl text-stone-400 mb-16"
        >
          Purpose-built for the sports you coach.
        </motion.p>

        {/* Product cards */}
        <div className="grid md:grid-cols-2 gap-8">
          {products.map((product, i) => {
            const isBaseball = product.accentColor === 'emerald'
            const accentClasses = isBaseball
              ? 'from-helm-primary-500/20 to-transparent group-hover:from-helm-primary-500/30'
              : 'from-amber-500/20 to-transparent group-hover:from-amber-500/30'
            const textAccentClasses = isBaseball ? 'text-helm-primary-400' : 'text-amber-400'
            const hoverTextClasses = isBaseball
              ? 'group-hover:text-helm-primary-400'
              : 'group-hover:text-amber-400'

            return (
              <motion.div
                key={product.name}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                transition={{ duration: 0.35, delay: 0.1 + i * 0.06, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <Link href={product.href}>
                  <motion.div
                    className="group relative rounded-2xl overflow-hidden cursor-pointer"
                    whileHover={{ scale: 1.02, y: -8 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                  >
                    {/* Layer 1: Very subtle white overlay */}
                    <div className="absolute inset-0 bg-white/[0.02]" />

                    {/* Layer 2: Main glass surface with backdrop-blur */}
                    <div className="absolute inset-0 bg-white/[0.08] backdrop-blur-xl" />

                    {/* Layer 3: Border */}
                    <div className="absolute inset-0 rounded-2xl border border-white/[0.15]" />

                    {/* Layer 4: Top edge highlight (key premium detail) */}
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

                    {/* Layer 5: Gradient accent on hover */}
                    <div
                      className={`absolute inset-0 bg-gradient-to-br ${accentClasses}
                                  opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                    />

                    {/* Animated border glow */}
                    <div
                      className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100
                                 transition-opacity duration-500 animate-shimmer"
                      style={{
                        background: isBaseball
                          ? 'linear-gradient(90deg, transparent, rgba(16,185,129,0.4), transparent)'
                          : 'linear-gradient(90deg, transparent, rgba(251,191,36,0.4), transparent)',
                        backgroundSize: '200% 100%',
                      }}
                    />

                    <div className="relative p-10">
                      {/* Product logo with ambient glow */}
                      <div className="relative mb-6 inline-block">
                        {/* Ambient glow matching product accent */}
                        <div className={`
                          absolute -inset-3 rounded-2xl blur-xl opacity-0
                          group-hover:opacity-100 transition-opacity duration-500
                          ${isBaseball
                            ? 'bg-gradient-to-br from-helm-primary-400/30 to-teal-400/30'
                            : 'bg-gradient-to-br from-amber-400/30 to-orange-400/30'
                          }
                        `} />

                        <Image
                          src={product.logo}
                          alt={product.name}
                          width={56}
                          height={56}
                          className="relative w-14 h-14"
                        />
                      </div>

                      <h3 className="text-3xl font-semibold text-white mb-3">{product.name}</h3>
                      <p className={`${textAccentClasses} font-medium text-lg mb-4`}>
                        {product.tagline}
                      </p>
                      <p className="text-stone-400 mb-8">{product.description}</p>

                      {/* Feature pills */}
                      <div className="flex flex-wrap gap-2 mb-8">
                        {product.features.map((f) => (
                          <span
                            key={f}
                            className="px-3 py-1.5 rounded-full bg-white/10 text-stone-300 text-sm
                                     border border-white/10 backdrop-blur-sm"
                          >
                            {f}
                          </span>
                        ))}
                      </div>

                      <div
                        className={`inline-flex items-center gap-2 text-white font-medium
                                    ${hoverTextClasses} transition-colors`}
                      >
                        Explore {product.name}
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
                      </div>
                    </div>
                  </motion.div>
                </Link>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
