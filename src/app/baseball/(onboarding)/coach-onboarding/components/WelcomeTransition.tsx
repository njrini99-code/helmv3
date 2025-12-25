'use client';

import { motion } from 'framer-motion';
import { useEffect } from 'react';

interface WelcomeTransitionProps {
  onComplete: () => void;
}

export function WelcomeTransition({ onComplete }: WelcomeTransitionProps) {
  useEffect(() => {
    // Show welcome message for 1.5 seconds, then complete
    const timer = setTimeout(() => {
      onComplete();
    }, 1500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 bg-onboarding-cream flex items-center justify-center"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="text-center space-y-4"
      >
        {/* Welcome message */}
        <motion.h1
          className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight font-sf-pro px-4"
          style={{ letterSpacing: '-0.02em' }}
        >
          <span className="text-onboarding-kelly-green">Welcome to </span>
          <span className="text-onboarding-rich-black">BaseballHelm</span>
        </motion.h1>

        {/* Subtle loading indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="flex items-center justify-center gap-2"
        >
          <motion.div
            className="w-2 h-2 rounded-full bg-onboarding-kelly-green"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: 0,
            }}
          />
          <motion.div
            className="w-2 h-2 rounded-full bg-onboarding-kelly-green"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: 0.2,
            }}
          />
          <motion.div
            className="w-2 h-2 rounded-full bg-onboarding-kelly-green"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: 0.4,
            }}
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
