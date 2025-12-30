'use client'

import { motion, useInView } from 'framer-motion'
import { useRef, useEffect, useState } from 'react'

const stats = [
  { value: 500, label: 'Coaches', suffix: '+' },
  { value: 1200, label: 'Athletes', suffix: '+' },
  { value: 50, label: 'States', suffix: '+' },
]

// Bulletproof interval-based counter
function Counter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })
  const hasAnimated = useRef(false)

  useEffect(() => {
    if (!isInView || hasAnimated.current) return
    hasAnimated.current = true

    const duration = 2000 // 2 seconds
    const steps = 60 // 60 frames
    const increment = value / steps
    const stepDuration = duration / steps

    let currentStep = 0
    const interval = setInterval(() => {
      currentStep++
      const newValue = Math.min(Math.round(increment * currentStep), value)
      setDisplayValue(newValue)

      if (currentStep >= steps) {
        clearInterval(interval)
        setDisplayValue(value) // Ensure we end on exact value
      }
    }, stepDuration)

    return () => clearInterval(interval)
  }, [isInView, value])

  return (
    <span ref={ref}>
      {displayValue}
      {suffix}
    </span>
  )
}

export function SocialProof() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  return (
    <section ref={ref} className="py-32 bg-warm-stone relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-golden-100/50 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-3 gap-8 mb-20"
        >
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="text-center"
            >
              <div className="text-5xl md:text-6xl font-serif text-warm-900 mb-2">
                <Counter value={stat.value} suffix={stat.suffix} />
              </div>
              <div className="text-warm-600">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* Testimonial */}
        <motion.blockquote
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="max-w-4xl mx-auto text-center"
        >
          <p className="font-serif text-3xl md:text-4xl text-warm-900 leading-relaxed mb-8">
            "Helm changed how we recruit. We found three D1 commits
            last year through the platform."
          </p>
          <footer>
            <div className="font-semibold text-warm-900">Coach Mike Thompson</div>
            <div className="text-warm-600">Lincoln High School Baseball</div>
          </footer>
        </motion.blockquote>
      </div>
    </section>
  )
}
