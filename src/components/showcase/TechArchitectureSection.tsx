'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import {
  Atom,
  BarChart3,
  Brain,
  Cloud,
  Database,
  Eye,
  FileCode,
  Globe,
  Layers,
  Lock,
  Plug,
  Radio,
  Server,
  Triangle,
  TrendingUp,
  Wind,
  Zap
} from 'lucide-react'

export function TechArchitectureSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-15%' })

  const stackLayers = [
    {
      name: 'Frontend',
      color: 'blue',
      technologies: [
        { name: 'React', icon: Atom },
        { name: 'TypeScript', icon: FileCode },
        { name: 'Tailwind', icon: Wind }
      ]
    },
    {
      name: 'API Layer',
      color: 'green',
      technologies: [
        { name: 'REST', icon: Plug },
        { name: 'WebSocket', icon: Radio },
        { name: 'Edge Functions', icon: Zap }
      ]
    },
    {
      name: 'Intelligence',
      color: 'purple',
      technologies: [
        { name: 'ML Models', icon: Brain },
        { name: 'Analytics', icon: BarChart3 },
        { name: 'Predictions', icon: TrendingUp }
      ]
    },
    {
      name: 'Data Layer',
      color: 'amber',
      technologies: [
        { name: 'PostgreSQL', icon: Database },
        { name: 'Redis', icon: Server },
        { name: 'S3', icon: Cloud }
      ]
    },
    {
      name: 'Infrastructure',
      color: 'red',
      technologies: [
        { name: 'Vercel', icon: Triangle },
        { name: 'CDN', icon: Globe },
        { name: 'Monitoring', icon: Eye }
      ]
    }
  ]

  const features = [
    {
      icon: Lock,
      title: 'Enterprise Security',
      description: 'End-to-end encryption. Role-based access control. SOC 2 compliant.'
    },
    {
      icon: Zap,
      title: 'Real-Time Sync',
      description: 'WebSocket connections keep all devices updated instantly. No refresh needed.'
    },
    {
      icon: Cloud,
      title: '99.9% Uptime',
      description: 'Redundant infrastructure. Automatic failover. Always available.'
    },
    {
      icon: Database,
      title: 'Your Data, Your Control',
      description: 'Export anytime. Delete anytime. Full data portability and ownership.'
    }
  ]

  return (
    <section ref={ref} className="py-20 md:py-32 bg-gradient-to-b from-stone-900 to-stone-950">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-20"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
            Built to{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-helm-green-400 to-blue-400">
              Scale
            </span>
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-white/50 max-w-2xl mx-auto">
            Enterprise-grade infrastructure that handles everything from a single team to an entire conference.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-5 gap-6 sm:gap-8 items-start">
          {/* Stack Visualization - 3 columns */}
          <div className="lg:col-span-3 relative">
            <div className="absolute -inset-8 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-3xl blur-3xl" />
            
            <div className="relative space-y-4">
              {stackLayers.map((layer, i) => (
                <motion.div
                  key={layer.name}
                  initial={{ opacity: 0, x: -50 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 0.1 + i * 0.1 }}
                  className={`relative p-5 rounded-xl border backdrop-blur-sm
                    ${layer.color === 'blue' ? 'bg-blue-500/5 border-blue-500/20' :
                      layer.color === 'green' ? 'bg-helm-green-500/5 border-helm-green-500/20' :
                      layer.color === 'purple' ? 'bg-purple-500/5 border-purple-500/20' :
                      layer.color === 'amber' ? 'bg-helm-amber-500/5 border-helm-amber-500/20' :
                      'bg-red-500/5 border-red-500/20'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center
                        ${layer.color === 'blue' ? 'bg-blue-500/20 text-blue-400' :
                          layer.color === 'green' ? 'bg-helm-green-500/20 text-helm-green-400' :
                          layer.color === 'purple' ? 'bg-purple-500/20 text-purple-400' :
                          layer.color === 'amber' ? 'bg-helm-amber-500/20 text-helm-amber-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                        <Layers className="w-5 h-5" />
                      </div>
                      <span className="text-white font-semibold">{layer.name}</span>
                    </div>
                    
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {layer.technologies.map((tech, j) => (
                        <motion.div
                          key={tech.name}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={isInView ? { opacity: 1, scale: 1 } : {}}
                          transition={{ delay: 0.3 + i * 0.1 + j * 0.05 }}
                          className="px-3 py-1.5 rounded-lg bg-white/[0.04] flex items-center gap-2"
                        >
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.05]">
                            <tech.icon className="w-3.5 h-3.5 text-white/70" />
                          </span>
                          <span className="text-white/60 text-sm">{tech.name}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* Connection line */}
                  {i < stackLayers.length - 1 && (
                    <motion.div
                      initial={{ scaleY: 0 }}
                      animate={isInView ? { scaleY: 1 } : {}}
                      transition={{ delay: 0.4 + i * 0.1 }}
                      className="absolute left-8 -bottom-4 w-px h-4 bg-gradient-to-b from-white/20 to-transparent origin-top"
                    />
                  )}
                </motion.div>
              ))}

              {/* Data flow particles */}
              <div className="absolute left-8 top-0 bottom-0 w-px">
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{
                      y: [0, 400],
                      opacity: [0, 1, 1, 0]
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 3,
                      delay: i * 0.6,
                      ease: 'linear'
                    }}
                    className="absolute w-2 h-2 -left-0.5 rounded-full bg-helm-green-500"
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Features - 2 columns */}
          <div className="lg:col-span-2 space-y-4">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: 50 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-helm-green-500/10 flex items-center justify-center flex-shrink-0">
                    <feature.icon className="w-6 h-6 text-helm-green-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-1">{feature.title}</h3>
                    <p className="text-white/50 text-sm leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
