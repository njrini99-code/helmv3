'use client'

import { motion, useScroll, useTransform, useInView } from 'framer-motion'
import { useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Target, Users, Video, MessageCircle, Flag, BarChart3, Calendar } from 'lucide-react'

/**
 * CINEMATIC PRODUCT SHOWCASES
 * 
 * Two immersive, scroll-driven flyover experiences that replace the old ProductSplit.
 * Each product gets a full-screen cinematic moment with:
 * - Scroll-controlled camera flyover effect
 * - Premium glassmorphism panel (per UI skill guidelines)
 * - Dashboard preview
 * - Feature highlights
 * 
 * Architecture:
 * - 300vh container = scroll runway
 * - Sticky 100vh viewport = pinned during flyover
 * - useScroll + useTransform = scroll-linked animations
 */

const products = {
  baseball: {
    name: 'BaseballHelm',
    tagline: 'Connect with college coaches. Get seen.',
    description: 'The recruiting platform that puts high school players in front of college programs. Track interest, manage outreach, and showcase your talent.',
    features: [
      { icon: Target, label: 'Recruiting Pipeline', description: 'Visual kanban for every prospect' },
      { icon: Users, label: 'Player Profiles', description: 'Showcase stats, videos & academics' },
      { icon: Video, label: 'Video Library', description: 'Highlight reels that get noticed' },
      { icon: MessageCircle, label: 'Coach Network', description: 'Direct messaging with programs' },
    ],
    href: '/baseball',
    logo: '/helm-baseball-logo.png',
    bgImage: '/baseball-aerial.webp',
    accentColor: 'emerald',
  },
  golf: {
    name: 'GolfHelm',
    tagline: 'Manage your program from tee to green.',
    description: 'Complete team management for college golf. Track performance, plan practices, and develop your players with data-driven insights.',
    features: [
      { icon: Flag, label: 'Shot Tracking', description: 'Every shot, every round, analyzed' },
      { icon: Users, label: 'Team Roster', description: 'Manage your full roster' },
      { icon: BarChart3, label: 'Performance Stats', description: 'Strokes gained & trends' },
      { icon: Calendar, label: 'Practice Planning', description: 'Schedule & track development' },
    ],
    href: '/golf',
    logo: '/helm-golf-logo.png',
    bgImage: '/golf-course-aerial.webp', // Placeholder - user will provide
    accentColor: 'amber',
  },
}

/**
 * GlassmorphismPanel - Premium glass treatment per UI skill guidelines
 * 
 * From glass-materials.md:
 * - backdrop-blur-xl for prominent foreground layer
 * - bg-white/10-18 for translucency
 * - border border-white/20 for edge craft
 * - Subtle shadow for depth
 */
function GlassmorphismPanel({ 
  children, 
  className = '' 
}: { 
  children: React.ReactNode
  className?: string 
}) {
  return (
    <div className={`
      relative overflow-hidden
      backdrop-blur-xl bg-white/[0.12]
      border border-white/[0.18]
      rounded-3xl
      shadow-[0_8px_32px_rgba(0,0,0,0.12)]
      ${className}
    `}>
      {/* Top edge highlight - key premium detail */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      
      {/* Inner glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent pointer-events-none" />
      
      {children}
    </div>
  )
}

/**
 * ProductShowcase - Individual cinematic showcase for one product
 */
function ProductShowcase({ 
  product, 
  index 
}: { 
  product: typeof products.baseball
  index: number 
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(containerRef, { once: false, amount: 0.3 })
  
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })
  
  // Flyover effect: zoom in + vertical pan (flying closer to the field)
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.5])
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '-20%'])
  const imageOpacity = useTransform(scrollYProgress, [0, 0.1], [0.7, 1])
  
  // Panel animation: fade in and slide up
  const panelOpacity = useTransform(scrollYProgress, [0.1, 0.3], [0, 1])
  const panelY = useTransform(scrollYProgress, [0.1, 0.3], [60, 0])
  
  const isEmerald = product.accentColor === 'emerald'
  
  return (
    <div 
      ref={containerRef}
      className="relative"
      style={{ height: '300vh' }}
    >
      {/* Sticky viewport - stays pinned while scrolling through 300vh */}
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {/* Background image with flyover effect */}
        <motion.div 
          className="absolute inset-0"
          style={{ scale, y }}
        >
          <motion.div style={{ opacity: imageOpacity }} className="absolute inset-0">
            <Image
              src={product.bgImage}
              alt={`${product.name} background`}
              fill
              className="object-cover"
              priority={index === 0}
              unoptimized
            />
          </motion.div>
          
          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/40" />
          
          {/* Accent color gradient overlay */}
          <div className={`
            absolute inset-0 opacity-20
            ${isEmerald 
              ? 'bg-gradient-to-br from-emerald-900/50 to-transparent' 
              : 'bg-gradient-to-br from-amber-900/50 to-transparent'
            }
          `} />
        </motion.div>
        
        {/* Atmospheric fog overlay */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.3)_100%)]" />
        </div>
        
        {/* Content container */}
        <div className="relative h-full flex items-center justify-center px-6 py-20">
          <motion.div
            style={{ opacity: panelOpacity, y: panelY }}
            className="w-full max-w-6xl"
          >
            <GlassmorphismPanel className="p-8 md:p-12">
              <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
                {/* Left: Product info */}
                <div className="flex flex-col justify-center">
                  {/* Logo */}
                  <motion.div 
                    className="mb-6"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={isInView ? { opacity: 1, scale: 1 } : {}}
                    transition={{ duration: 0.5, delay: 0.2 }}
                  >
                    <div className="relative inline-block">
                      {/* Logo glow */}
                      <div className={`
                        absolute -inset-4 rounded-2xl blur-xl opacity-60
                        ${isEmerald 
                          ? 'bg-gradient-to-br from-emerald-400/40 to-teal-400/40' 
                          : 'bg-gradient-to-br from-amber-400/40 to-orange-400/40'
                        }
                      `} />
                      <Image
                        src={product.logo}
                        alt={product.name}
                        width={80}
                        height={80}
                        className="relative w-20 h-20"
                        style={{ boxShadow: '0px 4px 12px 0px rgba(0, 0, 0, 0.15)' }}
                      />
                    </div>
                  </motion.div>
                  
                  {/* Title */}
                  <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 tracking-tight">
                    {product.name}
                  </h2>
                  
                  {/* Tagline */}
                  <p className={`
                    text-xl md:text-2xl font-medium mb-4
                    ${isEmerald ? 'text-emerald-400' : 'text-amber-400'}
                  `}>
                    {product.tagline}
                  </p>
                  
                  {/* Description */}
                  <p className="text-lg text-white/70 mb-8 leading-relaxed max-w-lg">
                    {product.description}
                  </p>
                  
                  {/* Features grid */}
                  <div className="grid grid-cols-2 gap-4 mb-8">
                    {product.features.map((feature, i) => (
                      <motion.div
                        key={feature.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={isInView ? { opacity: 1, y: 0 } : {}}
                        transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
                        className="flex items-start gap-3"
                      >
                        <div className={`
                          flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
                          ${isEmerald 
                            ? 'bg-emerald-500/20 text-emerald-400' 
                            : 'bg-amber-500/20 text-amber-400'
                          }
                        `}>
                          <feature.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-white font-medium text-sm">{feature.label}</div>
                          <div className="text-white/50 text-xs">{feature.description}</div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  
                  {/* CTA */}
                  <Link href={product.href}>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`
                        inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white
                        transition-all duration-300 shadow-lg
                        ${isEmerald 
                          ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/25' 
                          : 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/25'
                        }
                      `}
                    >
                      Explore {product.name}
                      <ArrowRight className="w-5 h-5" />
                    </motion.button>
                  </Link>
                </div>
                
                {/* Right: Dashboard preview */}
                <div className="hidden lg:flex items-center justify-center">
                  <motion.div
                    initial={{ opacity: 0, x: 40 }}
                    animate={isInView ? { opacity: 1, x: 0 } : {}}
                    transition={{ duration: 0.6, delay: 0.4 }}
                    className="relative"
                  >
                    {/* Browser chrome */}
                    <div className="rounded-xl overflow-hidden shadow-2xl bg-stone-900 border border-white/10">
                      {/* Title bar */}
                      <div className="bg-stone-800 px-4 py-2.5 flex items-center gap-3 border-b border-stone-700/50">
                        <div className="flex gap-2">
                          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                        </div>
                        <div className="flex-1 flex justify-center">
                          <div className="bg-stone-700/60 rounded-lg px-4 py-1 flex items-center gap-2">
                            <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                            <span className="text-stone-400 text-sm">app.helmsportslabs.com</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Dashboard preview content */}
                      <div className="relative w-[400px] h-[280px] bg-gradient-to-br from-stone-900 via-stone-800 to-stone-900 p-4">
                        {/* Glow */}
                        <div className={`
                          absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 
                          w-48 h-48 rounded-full blur-[60px] opacity-30
                          ${isEmerald ? 'bg-emerald-500' : 'bg-amber-500'}
                        `} />
                        
                        {/* Mock dashboard elements */}
                        <div className="relative space-y-3">
                          {/* Header bar */}
                          <div className="flex items-center justify-between">
                            <div className="h-4 w-24 bg-white/10 rounded" />
                            <div className={`h-6 w-20 rounded-lg ${isEmerald ? 'bg-emerald-500/30' : 'bg-amber-500/30'}`} />
                          </div>
                          
                          {/* Stats row */}
                          <div className="grid grid-cols-3 gap-2">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="bg-white/5 rounded-lg p-3 border border-white/5">
                                <div className="h-3 w-12 bg-white/10 rounded mb-2" />
                                <div className={`h-5 w-8 rounded ${isEmerald ? 'bg-emerald-500/40' : 'bg-amber-500/40'}`} />
                              </div>
                            ))}
                          </div>
                          
                          {/* Chart area */}
                          <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                            <div className="flex items-end justify-between h-24 gap-2">
                              {[40, 65, 45, 80, 55, 70, 85, 60].map((h, i) => (
                                <div
                                  key={i}
                                  className={`flex-1 rounded-t ${isEmerald ? 'bg-emerald-500/60' : 'bg-amber-500/60'}`}
                                  style={{ height: `${h}%` }}
                                />
                              ))}
                            </div>
                          </div>
                          
                          {/* Table rows */}
                          <div className="space-y-1.5">
                            {[1, 2].map((i) => (
                              <div key={i} className="flex items-center gap-2 bg-white/5 rounded p-2">
                                <div className="w-6 h-6 rounded-full bg-white/10" />
                                <div className="flex-1 h-2 bg-white/10 rounded" />
                                <div className={`h-4 w-12 rounded ${isEmerald ? 'bg-emerald-500/30' : 'bg-amber-500/30'}`} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Floating stat card */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={isInView ? { opacity: 1, y: 0 } : {}}
                      transition={{ duration: 0.5, delay: 0.6 }}
                      className="absolute -bottom-6 -left-6 bg-white rounded-xl p-4 shadow-xl"
                    >
                      <div className="text-xs text-stone-500 mb-1">
                        {isEmerald ? 'Pipeline Growth' : 'Avg Score Improvement'}
                      </div>
                      <div className={`text-2xl font-bold ${isEmerald ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {isEmerald ? '+24%' : '-3.2'}
                      </div>
                      <div className={`text-xs ${isEmerald ? 'text-emerald-500' : 'text-amber-500'}`}>
                        ↑ this month
                      </div>
                    </motion.div>
                  </motion.div>
                </div>
              </div>
            </GlassmorphismPanel>
          </motion.div>
        </div>
        
        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <span className="text-white/60 text-sm">Keep scrolling</span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}

/**
 * ProductShowcases - Main exported component
 * Replaces ProductSplit with two cinematic flyover experiences
 */
export function ProductShowcases() {
  return (
    <section className="relative">
      {/* BaseballHelm Showcase */}
      <ProductShowcase product={products.baseball} index={0} />
      
      {/* GolfHelm Showcase */}
      <ProductShowcase product={products.golf} index={1} />
    </section>
  )
}
