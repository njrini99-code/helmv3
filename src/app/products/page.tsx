'use client';

import { IconUsers, IconChartBar, IconTarget } from "@/components/icons"
import Image from "next/image"
import Link from "next/link"
import { motion, useScroll, useTransform } from "framer-motion"
import { useRef } from "react"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SmoothScroll } from "@/components/landing/SmoothScroll"
import { DashboardMockup } from "@/components/products/DashboardMockup"
import { GolfHelmSection } from "@/components/products/GolfHelmSection"
import { BaseballHelmSection } from "@/components/products/BaseballHelmSection"
import { cn } from "@/lib/utils"

const features = [
  {
    icon: IconUsers,
    title: 'Team Management',
    description: 'Centralize rosters, schedules, and player development in one place',
    gradient: 'from-green-500 to-emerald-600',
    bgColor: 'bg-green-50',
    iconColor: 'text-green-600',
  },
  {
    icon: IconChartBar,
    title: 'Comprehensive Stats',
    description: 'Track performance metrics and progress with advanced analytics',
    gradient: 'from-slate-600 to-slate-800',
    bgColor: 'bg-slate-100',
    iconColor: 'text-slate-600',
  },
  {
    icon: IconTarget,
    title: 'Recruiting Planning',
    description: 'Streamline prospect identification and communication workflows',
    gradient: 'from-violet-500 to-purple-600',
    bgColor: 'bg-violet-50',
    iconColor: 'text-violet-600',
  },
];

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const }
  }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.15 }
  }
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }
  }
};

export default function ProductsPage() {
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  });

  const heroY = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const mockupScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.9]);
  const mockupY = useTransform(scrollYProgress, [0, 0.5], [0, 30]);

  return (
    <main className="min-h-screen bg-background overflow-x-hidden">
      <SmoothScroll />

      {/* Navigation */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <Navigation />
      </div>

      {/* Hero Section */}
      <motion.section
        ref={heroRef}
        className="relative pt-24 px-5 sm:px-6 py-16 md:py-24 max-w-7xl mx-auto"
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        {/* Decorative background elements */}
        <div className="absolute top-32 -left-20 w-96 h-96 bg-gradient-to-br from-green-200/30 to-emerald-100/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-64 right-0 w-72 h-72 bg-gradient-to-bl from-blue-100/20 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative grid md:grid-cols-2 gap-10 md:gap-12 items-center">
          {/* Text Content */}
          <motion.div style={{ y: heroY, opacity: heroOpacity }}>
            <motion.div
              variants={fadeInUp}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full
                       bg-white/80 backdrop-blur-sm border border-slate-200/60
                       shadow-[0_2px_12px_rgba(0,0,0,0.04)] mb-6"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs uppercase tracking-[0.12em] text-slate-600 font-semibold">
                Products
              </span>
            </motion.div>

            <motion.h1
              variants={fadeInUp}
              className="text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.1] text-foreground tracking-tight"
            >
              Take the{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 via-emerald-500 to-teal-500">
                Helm
              </span>
              <br />
              of your program
            </motion.h1>

            <motion.p
              variants={fadeInUp}
              className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-md leading-relaxed"
            >
              The ultimate platform to manage your team with precision and clarity.
            </motion.p>

            {/* Product Buttons */}
            <motion.div
              variants={fadeInUp}
              className="mt-8 flex flex-col sm:flex-row gap-3"
            >
              <Link href="#golfhelm" className="group">
                <motion.button
                  className={cn(
                    "w-full sm:w-auto",
                    "flex items-center justify-center sm:justify-start gap-3 px-6 py-4 sm:py-3.5 rounded-2xl",
                    "bg-white/80 backdrop-blur-xl border border-white/60",
                    "shadow-[0_4px_20px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]",
                    "transition-all duration-300"
                  )}
                  whileHover={{
                    y: -3,
                    boxShadow: "0 8px 30px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,1)"
                  }}
                  whileTap={{ scale: 0.98 }}
                >
                  <motion.div
                    className="w-10 h-10 relative flex-shrink-0"
                    whileHover={{ rotate: -10 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <Image
                      src="/helm-golf-logo-transparent.png"
                      alt="GolfHelm"
                      fill
                      className="object-contain"
                      sizes="40px"
                    />
                  </motion.div>
                  <div className="text-left">
                    <span className="font-semibold text-slate-900 block">GolfHelm</span>
                    <span className="text-xs text-slate-500">Team Management</span>
                  </div>
                </motion.button>
              </Link>

              <Link href="#baseballhelm" className="group">
                <motion.button
                  className={cn(
                    "w-full sm:w-auto",
                    "flex items-center justify-center sm:justify-start gap-3 px-6 py-4 sm:py-3.5 rounded-2xl",
                    "bg-white/80 backdrop-blur-xl border border-white/60",
                    "shadow-[0_4px_20px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]",
                    "transition-all duration-300"
                  )}
                  whileHover={{
                    y: -3,
                    boxShadow: "0 8px 30px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,1)"
                  }}
                  whileTap={{ scale: 0.98 }}
                >
                  <motion.div
                    className="w-10 h-10 relative flex-shrink-0"
                    whileHover={{ rotate: 10 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <Image
                      src="/helm-baseball-logo.png"
                      alt="BaseballHelm"
                      fill
                      className="object-contain"
                      sizes="40px"
                    />
                  </motion.div>
                  <div className="text-left">
                    <span className="font-semibold text-slate-900 block">BaseballHelm</span>
                    <span className="text-xs text-slate-500">Recruiting Platform</span>
                  </div>
                </motion.button>
              </Link>
            </motion.div>
          </motion.div>

          {/* Dashboard Mockup */}
          <motion.div
            className="relative"
            style={{ scale: mockupScale, y: mockupY }}
            variants={scaleIn}
          >
            {/* Enhanced gradient blur behind dashboard */}
            <motion.div
              className="absolute -top-8 -right-8 w-full h-full bg-gradient-to-br from-green-400/30 via-emerald-300/20 to-teal-300/10 rounded-3xl blur-2xl"
              animate={{
                scale: [1, 1.05, 1],
                opacity: [0.3, 0.4, 0.3],
              }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />

            {/* Dashboard Mockup with hover effect */}
            <motion.div
              className="relative z-10"
              whileHover={{ y: -5, rotateY: 2, rotateX: -1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              style={{ transformStyle: "preserve-3d" }}
            >
              <DashboardMockup />
            </motion.div>
          </motion.div>
        </div>

        {/* Features Grid */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mt-16 md:mt-20"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              variants={fadeInUp}
              whileHover={{ y: -6, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="group relative cursor-pointer"
            >
              {/* Glow effect on hover */}
              <div className={cn(
                "absolute inset-0 rounded-3xl blur-2xl opacity-0 group-hover:opacity-50 transition-opacity duration-500",
                feature.bgColor
              )} />

              <div className={cn(
                "relative py-7 px-6 md:py-8",
                "bg-white/70 backdrop-blur-sm rounded-2xl",
                "border border-slate-200/60",
                "group-hover:border-slate-300/80 group-hover:shadow-xl group-hover:bg-white/90",
                "transition-all duration-300",
                index === 1 && "md:border-x md:border-y-0 md:rounded-none md:bg-transparent group-hover:md:bg-white/70"
              )}>
                {/* Icon with gradient background */}
                <motion.div
                  className={cn(
                    "w-14 h-14 rounded-2xl mb-5 flex items-center justify-center shadow-lg",
                    `bg-gradient-to-br ${feature.gradient}`
                  )}
                  whileHover={{ rotate: -8, scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <feature.icon size={28} className="text-white" />
                </motion.div>

                <h3 className="text-xl font-semibold text-foreground mb-2 group-hover:text-green-700 transition-colors">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>

                {/* Subtle number indicator */}
                <span className="absolute top-6 right-6 text-5xl font-bold text-slate-100 group-hover:text-slate-200/80 transition-colors select-none">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      {/* GolfHelm Section */}
      <GolfHelmSection />

      {/* BaseballHelm Section */}
      <BaseballHelmSection />

      <Footer />
    </main>
  )
}
