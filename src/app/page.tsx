'use client';

import Link from 'next/link';
import { motion, useScroll, useSpring } from 'framer-motion';
import { IconTrendingUp, IconUsers, IconVideo, IconTarget, IconChartBar, IconMapPin, IconCalendar, IconMessage, IconStar } from '@/components/icons';

const fadeInUp = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-100px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
};

const staggerContainer = {
  initial: {},
  whileInView: { transition: { staggerChildren: 0.1 } },
  viewport: { once: true }
};

export default function HomePage() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  return (
    <div className="min-h-screen bg-white">
      {/* Scroll Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-600 via-emerald-500 to-green-600 origin-left z-50"
        style={{ scaleX }}
      />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        {/* Animated background gradient blobs */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-green-600/20 rounded-full blur-3xl"
            animate={{
              scale: [1, 1.2, 1],
              x: [0, 100, 0],
              y: [0, 50, 0],
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-emerald-600/20 rounded-full blur-3xl"
            animate={{
              scale: [1.2, 1, 1.2],
              x: [0, -100, 0],
              y: [0, -50, 0],
            }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className="inline-block mb-6 px-4 py-2 rounded-full bg-white/10 backdrop-blur-xl border border-white/20"
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <span className="text-sm font-medium text-white/90">
                Trusted by 10,000+ athletes and coaches
              </span>
            </motion.div>

            <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight text-white mb-6">
              Elevate Your
              <br />
              <span className="bg-gradient-to-r from-green-400 via-emerald-400 to-green-500 bg-clip-text text-transparent">
                Athletic Journey
              </span>
            </h1>

            <p className="text-xl md:text-2xl leading-relaxed text-slate-300 mb-12 max-w-3xl mx-auto">
              The premium platform connecting athletes with opportunities. Track performance,
              showcase talent, and get discovered by top programs.
            </p>

            <motion.div
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <Link href="#sports" className="group relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl blur opacity-75 group-hover:opacity-100 transition duration-200" />
                <button className="relative px-8 py-4 bg-white text-slate-900 rounded-xl font-semibold text-lg hover:bg-slate-50 transition-all duration-200 active:scale-[0.97]">
                  Get Started Free
                </button>
              </Link>
              <Link href="#features">
                <button className="px-8 py-4 bg-white/10 backdrop-blur-xl text-white rounded-xl font-semibold text-lg border border-white/20 hover:bg-white/20 transition-all duration-200 active:scale-[0.97]">
                  Watch Demo
                </button>
              </Link>
            </motion.div>

            {/* Sport Logos */}
            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
            >
              <Link href="/baseball/login" className="group">
                <motion.div
                  className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-8 hover:bg-white/10 transition-all duration-300 cursor-pointer"
                  whileHover={{ scale: 1.02, y: -4 }}
                >
                  <img
                    src="/helm-baseball-logo.png"
                    alt="Baseball"
                    className="h-24 w-auto mx-auto group-hover:scale-110 transition-transform duration-300"
                  />
                  <p className="text-white/70 text-sm mt-4 font-medium">Baseball Recruiting →</p>
                </motion.div>
              </Link>
              <Link href="/golf/login" className="group">
                <motion.div
                  className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-8 hover:bg-white/10 transition-all duration-300 cursor-pointer"
                  whileHover={{ scale: 1.02, y: -4 }}
                >
                  <img
                    src="/helm-golf-logo.png"
                    alt="Golf"
                    className="h-24 w-auto mx-auto group-hover:scale-110 transition-transform duration-300"
                  />
                  <p className="text-white/70 text-sm mt-4 font-medium">Golf Performance →</p>
                </motion.div>
              </Link>
            </motion.div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="w-6 h-10 rounded-full border-2 border-white/30 flex items-start justify-center p-2">
            <motion.div
              className="w-1.5 h-1.5 bg-white rounded-full"
              animate={{ y: [0, 12, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </motion.div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-slate-50">
        <motion.div
          className="max-w-7xl mx-auto px-6"
          variants={staggerContainer}
          initial="initial"
          whileInView="whileInView"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { number: "10K+", label: "Active Athletes" },
              { number: "500+", label: "Partner Programs" },
              { number: "95%", label: "Success Rate" },
              { number: "50K+", label: "Connections Made" }
            ].map((stat, i) => (
              <motion.div key={i} variants={fadeInUp} className="text-center">
                <div className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-2">
                  {stat.number}
                </div>
                <div className="text-sm text-slate-600">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Features Section - Baseball */}
      <section className="py-32 bg-white" id="features">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            className="text-center mb-20"
            {...fadeInUp}
          >
            <div className="inline-block mb-4 px-4 py-2 rounded-full bg-green-100 text-green-700 text-sm font-medium">
              Baseball Recruiting
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
              Get Discovered by College Coaches
            </h2>
            <p className="text-xl leading-relaxed text-slate-600 max-w-2xl mx-auto">
              Everything you need to connect with college baseball programs and take your game to the next level.
            </p>
          </motion.div>

          <motion.div
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={staggerContainer}
            initial="initial"
            whileInView="whileInView"
          >
            {[
              {
                icon: IconUsers,
                title: "Coach Discovery",
                description: "Browse hundreds of college programs and connect directly with coaches actively recruiting."
              },
              {
                icon: IconVideo,
                title: "Video Showcase",
                description: "Upload highlight reels and game footage. Coaches can view your best moments anytime."
              },
              {
                icon: IconChartBar,
                title: "Stats & Analytics",
                description: "Track your performance metrics and showcase your improvement over time."
              },
              {
                icon: IconMapPin,
                title: "Journey Tracker",
                description: "Monitor interest from programs, track campus visits, and manage recruiting timeline."
              },
              {
                icon: IconMessage,
                title: "Direct Messaging",
                description: "Communicate with coaches in a professional, compliant messaging platform."
              },
              {
                icon: IconCalendar,
                title: "Camp Registration",
                description: "Find and register for showcases and camps to get in front of recruiters."
              }
            ].map((feature, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                className="group relative bg-white rounded-2xl border border-slate-200 p-8 hover:shadow-xl hover:border-green-200 transition-all duration-300"
                whileHover={{ y: -4 }}
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <feature.icon className="text-green-600" size={24} strokeWidth={1.5} />
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features Section - Golf */}
      <section className="py-32 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            className="text-center mb-20"
            {...fadeInUp}
          >
            <div className="inline-block mb-4 px-4 py-2 rounded-full bg-emerald-100 text-emerald-700 text-sm font-medium">
              Golf Performance
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
              Elevate Your Golf Game
            </h2>
            <p className="text-xl leading-relaxed text-slate-600 max-w-2xl mx-auto">
              Advanced shot tracking and analytics to understand your game like never before.
            </p>
          </motion.div>

          <motion.div
            className="grid md:grid-cols-2 gap-8"
            variants={staggerContainer}
            initial="initial"
            whileInView="whileInView"
          >
            {[
              {
                icon: IconTarget,
                title: "Shot-by-Shot Tracking",
                description: "Record every shot during your round. Track club selection, distance, lie, and result for comprehensive data.",
                features: ["Miss direction mapping", "Putting break/slope", "Strokes gained analysis"]
              },
              {
                icon: IconChartBar,
                title: "Performance Analytics",
                description: "Deep insights into your game with strokes gained breakdowns across all shot categories.",
                features: ["Driving accuracy", "GIR percentage", "Putting statistics"]
              },
              {
                icon: IconTrendingUp,
                title: "Improvement Tracking",
                description: "Watch your game improve over time with historical trends and pattern recognition.",
                features: ["Round-over-round comparison", "Weakness identification", "Goal tracking"]
              },
              {
                icon: IconCalendar,
                title: "Round Management",
                description: "Organize your golf activity with detailed round history and course tracking.",
                features: ["Course database", "Weather conditions", "Playing partners"]
              }
            ].map((feature, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                className="group bg-white rounded-2xl border border-slate-200 p-8 hover:shadow-xl hover:border-emerald-200 transition-all duration-300"
                whileHover={{ y: -4 }}
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-green-100 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                    <feature.icon className="text-emerald-600" size={24} strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight text-slate-900 mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-slate-600 mb-4">
                      {feature.description}
                    </p>
                  </div>
                </div>
                <ul className="space-y-2">
                  {feature.features.map((item, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm text-slate-700">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            className="text-center mb-20"
            {...fadeInUp}
          >
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
              Trusted by Athletes & Coaches
            </h2>
            <p className="text-xl leading-relaxed text-slate-600">
              See what our community has to say
            </p>
          </motion.div>

          <motion.div
            className="grid md:grid-cols-3 gap-8"
            variants={staggerContainer}
            initial="initial"
            whileInView="whileInView"
          >
            {[
              {
                quote: "HelmLabs completely changed my recruiting process. Within 3 months, I had offers from 5 D1 programs.",
                name: "Marcus Johnson",
                role: "Committed to Texas A&M",
                sport: "Baseball",
                avatar: "MJ"
              },
              {
                quote: "The analytics helped me identify weaknesses in my putting game. My scores dropped by 4 strokes in one season.",
                name: "Sarah Chen",
                role: "Division I Golfer",
                sport: "Golf",
                avatar: "SC"
              },
              {
                quote: "As a coach, HelmLabs streamlined our recruiting. We found 3 impact players who were flying under the radar.",
                name: "Coach Mike Davis",
                role: "Head Coach, SEC Program",
                sport: "Baseball",
                avatar: "MD"
              }
            ].map((testimonial, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                className="bg-slate-50 rounded-2xl p-8 border border-slate-100"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <IconStar key={i} size={16} className="text-yellow-500 fill-yellow-500" />
                  ))}
                </div>
                <p className="text-slate-700 leading-relaxed mb-6 italic">
                  "{testimonial.quote}"
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-600 to-emerald-600 flex items-center justify-center text-white font-semibold">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">{testimonial.name}</div>
                    <div className="text-sm text-slate-500">{testimonial.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" id="sports">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div {...fadeInUp}>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6">
              Ready to Elevate Your Game?
            </h2>
            <p className="text-xl leading-relaxed text-slate-300 mb-12">
              Join thousands of athletes already using HelmLabs. Choose your sport to get started.
            </p>

            <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
              <Link href="/baseball/login" className="group">
                <motion.div
                  className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-10 hover:bg-white/20 transition-all duration-300"
                  whileHover={{ scale: 1.02, y: -4 }}
                >
                  <img
                    src="/helm-baseball-logo.png"
                    alt="Baseball"
                    className="h-28 w-auto mx-auto mb-4 group-hover:scale-110 transition-transform duration-300"
                  />
                  <div className="text-white font-semibold text-lg mb-2">Baseball</div>
                  <div className="text-white/70 text-sm">Start recruiting journey →</div>
                </motion.div>
              </Link>

              <Link href="/golf/login" className="group">
                <motion.div
                  className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-10 hover:bg-white/20 transition-all duration-300"
                  whileHover={{ scale: 1.02, y: -4 }}
                >
                  <img
                    src="/helm-golf-logo.png"
                    alt="Golf"
                    className="h-28 w-auto mx-auto mb-4 group-hover:scale-110 transition-transform duration-300"
                  />
                  <div className="text-white font-semibold text-lg mb-2">Golf</div>
                  <div className="text-white/70 text-sm">Track performance →</div>
                </motion.div>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 text-white py-12">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <img
            src="/helm-main-logo.png"
            alt="HelmLabs"
            className="h-12 w-auto mx-auto mb-4 opacity-80"
          />
          <p className="text-sm leading-relaxed text-slate-400">
            © 2025 Helm Sports Labs. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
