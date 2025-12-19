'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useInView } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  IconUser,
  IconChart,
  IconMessage,
  IconVideo,
  IconTarget,
  IconGraduationCap,
  IconShield,
  IconChevronRight,
  IconChevronLeft,
  IconCheck,
  IconStar,
  IconArrowRight,
  IconUsers,
  IconChevronDown,
} from '@/components/icons';
import { isDevMode } from '@/lib/dev-mode';

// Animation Variants
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

// Stats Counter Hook
function useCountUp(end: number, duration: number = 2000) {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const animateCount = useCallback(() => {
    const startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(easeOut * end));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [end, duration]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !hasStarted) {
          setHasStarted(true);
          animateCount();
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [hasStarted, animateCount]);

  return { count, ref };
}

// Testimonials Data
const testimonials = [
  {
    quote: "Helm completely transformed how we recruit. We've connected with more quality prospects in 6 months than we did in the previous 2 years.",
    author: "Coach Mike Davis",
    role: "Head Coach, Texas State Baseball",
    initials: "MD",
  },
  {
    quote: "The pipeline tool alone is worth it. Being able to track every interaction with a recruit in one place has saved us countless hours.",
    author: "Sarah Martinez",
    role: "Recruiting Coordinator, UCLA",
    initials: "SM",
  },
  {
    quote: "As a player, Helm gave me visibility to programs I didn't even know existed. Got offers from 3 D2 schools within my first month.",
    author: "Jake Thompson",
    role: "Class of 2024, RHP",
    initials: "JT",
  },
];

// Pricing Data
const pricingPlans = [
  {
    name: 'Free',
    price: '$0',
    period: 'Forever free',
    features: ['Basic profile', '3 video uploads', '5 messages/month', 'Team dashboard access'],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$19',
    period: 'per month',
    features: ['Everything in Free', 'Unlimited videos', 'Unlimited messages', 'Analytics dashboard', 'Priority in search', 'Profile verification'],
    cta: 'Start Free Trial',
    highlighted: true,
    badge: 'MOST POPULAR',
  },
  {
    name: 'Coach',
    price: '$99',
    period: 'per month',
    features: ['Full player database', 'Advanced filters', 'Pipeline management', 'Team seats (5)', 'Bulk messaging', 'API access'],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

export default function HomePage() {
  const showDevMode = isDevMode();
  const [currentTestimonial, setCurrentTestimonial] = useState(0);

  // Auto-advance testimonials
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Stats with count-up
  const stat1 = useCountUp(12847);
  const stat2 = useCountUp(847);
  const stat3 = useCountUp(2341);
  const stat4 = useCountUp(98);

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
      {/* Dev Mode Banner */}
      {showDevMode && (
        <div className="bg-green-600 text-white py-2 px-8 relative z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-sm">
            <IconShield size={16} />
            <span className="font-medium">Dev Mode Active</span>
            <span className="opacity-75">•</span>
            <Link href="/dev" className="underline hover:no-underline">
              Quick Access to All Dashboards
            </Link>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-40 border-b border-white/5">
        <div className="bg-slate-950/80 backdrop-blur-xl">
          <div className="h-16 px-6 lg:px-8 flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-green-400 to-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-green-500/30">
                <span className="text-white font-bold text-sm">H</span>
              </div>
              <span className="text-lg font-semibold text-white">Helm Sports</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-slate-400 hover:text-white transition-colors">Features</a>
              <a href="#testimonials" className="text-sm text-slate-400 hover:text-white transition-colors">Testimonials</a>
              <a href="#pricing" className="text-sm text-slate-400 hover:text-white transition-colors">Pricing</a>
            </div>
            <div className="flex items-center gap-3">
              {showDevMode && (
                <Link href="/dev">
                  <Button variant="secondary" size="sm" className="gap-2 bg-white/10 border-white/10 text-white hover:bg-white/20">
                    <IconShield size={16} />
                    Dev
                  </Button>
                </Link>
              )}
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-white/10">
                  Log in
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm" className="bg-white text-slate-900 hover:bg-slate-100 shadow-lg">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
        {/* Aurora Background */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-green-500/30 rounded-full blur-[128px]"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          <motion.div
            className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-blue-500/20 rounded-full blur-[128px]"
            animate={{
              scale: [1.2, 1, 1.2],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 1,
            }}
          />
          <motion.div
            className="absolute bottom-1/4 left-1/3 w-[450px] h-[450px] bg-purple-500/20 rounded-full blur-[128px]"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.2, 0.3, 0.2],
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 2,
            }}
          />
        </div>

        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />

        {/* Content */}
        <motion.div
          className="relative z-10 max-w-5xl mx-auto px-6 lg:px-8 text-center"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {/* Overline */}
          <motion.div
            variants={fadeInUp}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <span className="text-green-400 uppercase tracking-wider text-sm font-medium">
              The Future of Baseball Recruiting
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={fadeInUp}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold text-white mb-2 tracking-tight"
          >
            Every Scout&apos;s Dream.
          </motion.h1>
          <motion.h1
            variants={fadeInUp}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-5xl md:text-7xl font-bold text-green-400 mb-8 tracking-tight"
          >
            Every Player&apos;s Chance.
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            variants={fadeInUp}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            The platform connecting high school athletes with college programs.
          </motion.p>

          {/* CTAs */}
          <motion.div
            variants={fadeInUp}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link href="/signup">
              <Button size="lg" className="bg-green-600 hover:bg-green-500 text-white shadow-2xl shadow-green-500/30 px-8 group text-base">
                Get Started Free
                <IconArrowRight size={18} className="ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href="#features">
              <Button variant="secondary" size="lg" className="border border-white/20 text-white hover:bg-white/10 px-8 text-base">
                Watch Demo
              </Button>
            </Link>
          </motion.div>

          {/* Scroll Indicator */}
          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2"
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <IconChevronDown size={28} className="text-white/40" />
          </motion.div>
        </motion.div>
      </section>

      {/* Social Proof / Logo Cloud */}
      <section className="py-16 bg-slate-900/50 border-y border-white/5">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center text-sm text-slate-500 mb-8"
          >
            Players committed to top programs
          </motion.p>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8"
          >
            {['Texas', 'LSU', 'UCLA', 'Arizona', 'Vanderbilt', 'Florida'].map((school, index) => (
              <motion.div
                key={school}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 0.6 }}
                viewport={{ once: true }}
                whileHover={{ opacity: 1 }}
                transition={{ delay: index * 0.1 }}
                className="text-xl font-semibold text-slate-400 grayscale hover:grayscale-0 hover:text-white transition-all cursor-default"
              >
                {school}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Bento Features Grid */}
      <section id="features" className="py-24 px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Everything you need to get recruited
            </h2>
          </motion.div>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Feature 1 - Large (spans 2 rows) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
              className="md:col-span-2 md:row-span-2 bg-slate-50 rounded-2xl p-8 transition-all duration-300"
            >
              <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center text-green-600 mb-6">
                <IconUser size={28} />
              </div>
              <h3 className="text-2xl font-semibold text-slate-900 mb-3">Player Profiles</h3>
              <p className="text-slate-600 leading-relaxed text-lg">
                Showcase everything college coaches want to see: video highlights, athletic stats, academic info, and your recruiting timeline. Build a profile that stands out and gets you noticed by the right programs.
              </p>
            </motion.div>

            {/* Feature 2 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
              className="bg-slate-50 rounded-2xl p-8 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center text-green-600 mb-4">
                <IconUsers size={22} />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Coach Discovery</h3>
              <p className="text-slate-600">
                Find and filter players by position, location, graduation year, and more.
              </p>
            </motion.div>

            {/* Feature 3 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
              className="bg-slate-50 rounded-2xl p-8 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center text-green-600 mb-4">
                <IconMessage size={22} />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Direct Messaging</h3>
              <p className="text-slate-600">
                Connect directly with coaches and players without middlemen.
              </p>
            </motion.div>

            {/* Feature 4 - Wide */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
              className="md:col-span-3 bg-slate-50 rounded-2xl p-8 transition-all duration-300"
            >
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center text-green-600 flex-shrink-0">
                  <IconTarget size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">Pipeline Management</h3>
                  <p className="text-slate-600">
                    Track recruiting progress with our intuitive pipeline. Drag-and-drop interface, custom stages, and detailed notes for every prospect. Never lose track of a recruit again.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Counter Section */}
      <section className="py-20 bg-slate-900">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <motion.div
              ref={stat1.ref}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <IconUsers size={24} className="text-green-400" />
              </div>
              <div className="text-4xl font-bold text-white mb-1 tabular-nums">
                {stat1.count.toLocaleString()}+
              </div>
              <div className="text-slate-400">Players</div>
            </motion.div>

            <motion.div
              ref={stat2.ref}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-center"
            >
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <IconGraduationCap size={24} className="text-green-400" />
              </div>
              <div className="text-4xl font-bold text-white mb-1 tabular-nums">
                {stat2.count.toLocaleString()}
              </div>
              <div className="text-slate-400">College Programs</div>
            </motion.div>

            <motion.div
              ref={stat3.ref}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-center"
            >
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <IconMessage size={24} className="text-green-400" />
              </div>
              <div className="text-4xl font-bold text-white mb-1 tabular-nums">
                {stat3.count.toLocaleString()}+
              </div>
              <div className="text-slate-400">Connections Made</div>
            </motion.div>

            <motion.div
              ref={stat4.ref}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="text-center"
            >
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <IconStar size={24} className="text-green-400" />
              </div>
              <div className="text-4xl font-bold text-white mb-1 tabular-nums">
                {stat4.count}%
              </div>
              <div className="text-slate-400">Satisfaction Rate</div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 px-6 lg:px-8 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Trusted by Coaches & Players Nationwide
            </h2>
          </motion.div>

          {/* Testimonial Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="bg-white rounded-3xl p-8 md:p-12 shadow-xl border border-slate-200">
              <IconStar className="text-green-500 mb-6" size={32} />
              <blockquote className="text-2xl text-slate-700 leading-relaxed mb-8 italic">
                &ldquo;{testimonials[currentTestimonial]?.quote}&rdquo;
              </blockquote>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-semibold text-lg">
                  {testimonials[currentTestimonial]?.initials}
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{testimonials[currentTestimonial]?.author}</div>
                  <div className="text-sm text-slate-500">{testimonials[currentTestimonial]?.role}</div>
                </div>
              </div>
            </div>

            {/* Navigation Dots */}
            <div className="flex items-center justify-center gap-2 mt-8">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentTestimonial(index)}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    index === currentTestimonial ? 'w-8 bg-green-500' : 'bg-slate-300 hover:bg-slate-400'
                  }`}
                />
              ))}
            </div>

            {/* Arrow Navigation */}
            <button
              onClick={() => setCurrentTestimonial((prev) => (prev - 1 + testimonials.length) % testimonials.length)}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 md:-translate-x-16 p-3 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors hidden md:block shadow-lg"
            >
              <IconChevronLeft size={20} />
            </button>
            <button
              onClick={() => setCurrentTestimonial((prev) => (prev + 1) % testimonials.length)}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 md:translate-x-16 p-3 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors hidden md:block shadow-lg"
            >
              <IconChevronRight size={20} />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-6 lg:px-8 bg-white">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-slate-500">
              Start free. Upgrade when you&apos;re ready.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pricingPlans.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`relative rounded-3xl p-8 transition-all duration-300 ${
                  plan.highlighted
                    ? 'bg-gradient-to-b from-green-600 to-green-700 text-white scale-105 shadow-2xl shadow-green-500/30'
                    : 'bg-slate-50 text-slate-900 border border-slate-200 hover:border-slate-300 hover:shadow-lg'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-white rounded-full text-sm font-medium text-green-600 shadow-lg">
                    {plan.badge}
                  </div>
                )}
                <div className={`font-medium mb-2 ${plan.highlighted ? 'text-green-100' : 'text-slate-500'}`}>
                  {plan.name}
                </div>
                <div className={`text-4xl font-bold mb-1 ${plan.highlighted ? 'text-white' : 'text-slate-900'}`}>
                  {plan.price}
                </div>
                <div className={`text-sm mb-6 ${plan.highlighted ? 'text-green-200' : 'text-slate-500'}`}>
                  {plan.period}
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className={`flex items-center gap-3 text-sm ${plan.highlighted ? 'text-green-50' : 'text-slate-600'}`}>
                      <IconCheck size={16} className={plan.highlighted ? 'text-white' : 'text-green-500'} />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link href={plan.name === 'Coach' ? '#' : `/signup${plan.name === 'Pro' ? '?plan=pro' : ''}`}>
                  <Button
                    className={`w-full ${
                      plan.highlighted
                        ? 'bg-white text-green-600 hover:bg-green-50'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-6 lg:px-8 bg-gradient-to-b from-slate-900 to-slate-950 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-t from-green-500/10 to-transparent" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative z-10 max-w-3xl mx-auto text-center"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to Get Recruited?
          </h2>
          <p className="text-xl text-slate-400 mb-10 max-w-xl mx-auto">
            Join thousands of players and coaches already on the platform.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup">
              <Button size="lg" className="bg-green-600 hover:bg-green-500 text-white shadow-2xl shadow-green-500/30 px-8 group">
                Create Free Account
                <IconArrowRight size={18} className="ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href="#">
              <Button variant="ghost" size="lg" className="text-white hover:bg-white/10 px-8">
                Schedule a Demo
                <IconArrowRight size={18} className="ml-2" />
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 lg:px-8 border-t border-slate-800 bg-slate-950">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-green-600 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold text-sm">H</span>
                </div>
                <span className="font-semibold text-white">Helm Sports</span>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                The modern platform for baseball recruiting and athletic development.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Guides</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
          </div>

          {/* Bottom row */}
          <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6 text-sm text-slate-500">
              <span>© 2025 Helm Sports Labs. All rights reserved.</span>
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
            </div>
            <div className="flex items-center gap-4">
              <a href="#" className="text-slate-500 hover:text-white transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              <a href="#" className="text-slate-500 hover:text-white transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"/>
                </svg>
              </a>
              <a href="#" className="text-slate-500 hover:text-white transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
