'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { IconShield } from '@/components/icons';
import { isDevMode } from '@/lib/dev-mode';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.15,
    },
  },
};

export default function HomePage() {
  const showDevMode = isDevMode();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Dev Mode Banner */}
      {showDevMode && (
        <div className="bg-green-600 text-white py-2 px-8">
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

      {/* Main Content */}
      <motion.div
        className="max-w-4xl mx-auto px-6 py-20"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {/* Main HelmLabs Logo */}
        <motion.div
          variants={fadeInUp}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center mb-16"
        >
          <img
            src="/helm-main-logo.png"
            alt="HelmLabs"
            className="h-32 w-auto mb-6"
          />
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Welcome to HelmLabs
          </h1>
          <p className="text-lg text-slate-500">
            Choose your sport to get started
          </p>
        </motion.div>

        {/* Sport Selection Cards */}
        <motion.div
          variants={fadeInUp}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl mx-auto"
        >
          {/* Baseball Card */}
          <Link href="/baseball/login" className="group">
            <div className="bg-white rounded-2xl border border-slate-200 p-12 hover:shadow-xl hover:border-green-200 hover:scale-105 transition-all duration-300 flex items-center justify-center">
              <img
                src="/helm-baseball-logo.png"
                alt="BaseballHelm"
                className="h-28 w-auto"
              />
            </div>
          </Link>

          {/* Golf Card */}
          <Link href="/golf/login" className="group">
            <div className="bg-white rounded-2xl border border-slate-200 p-12 hover:shadow-xl hover:border-green-200 hover:scale-105 transition-all duration-300 flex items-center justify-center">
              <img
                src="/helm-golf-logo.png"
                alt="GolfHelm"
                className="h-28 w-auto"
              />
            </div>
          </Link>
        </motion.div>

        {/* Footer */}
        <motion.div
          variants={fadeInUp}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-20 text-center"
        >
          <p className="text-sm text-slate-400">
            © 2025 Helm Sports Labs. All rights reserved.
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
