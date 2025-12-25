'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

interface CinematicIntroProps {
  onComplete: () => void;
}

export function CinematicIntro({ onComplete }: CinematicIntroProps) {
  const [phase, setPhase] = useState<'tagline' | 'logo-form' | 'transition' | 'complete'>('tagline');

  useEffect(() => {
    const taglineTimer = setTimeout(() => setPhase('logo-form'), 5500);
    const logoTimer = setTimeout(() => setPhase('transition'), 9500);
    const transitionTimer = setTimeout(() => {
      setPhase('complete');
      onComplete();
    }, 11000);

    return () => {
      clearTimeout(taglineTimer);
      clearTimeout(logoTimer);
      clearTimeout(transitionTimer);
    };
  }, [onComplete]);

  const isTagline = phase === 'tagline';
  const isLogoPhase = phase === 'logo-form' || phase === 'transition';
  const cinematicEase = [0.25, 0.1, 0.25, 1] as const;
  const slowRevealEase = [0.16, 1, 0.3, 1] as const;

  return (
    <div className="fixed inset-0 bg-black overflow-hidden" style={{ zIndex: 20 }}>
      
      {/* 
        CENTER POINT = where "Baseball" and "Helm" meet (no gap)
        - LEFT side: right edge at 50%
        - RIGHT side: left edge at 50%
      */}
      
      {/* ===== LEFT SIDE OF CENTER ===== */}
      <div 
        className="fixed top-1/2 right-1/2 flex items-center"
        style={{ transform: 'translateY(-50%)' }}
      >
        {/* "Take the" - fades out when transitioning to logo */}
        <motion.div
          className="flex items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: isTagline ? 1 : 0 }}
          transition={{ duration: isTagline ? 0 : 1.5, ease: cinematicEase }}
        >
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: isTagline ? 1 : 0, y: 0 }}
            transition={{ duration: 1.0, delay: isTagline ? 0 : 0, ease: cinematicEase }}
            className="text-4xl md:text-5xl font-semibold font-sf-pro whitespace-nowrap mr-4"
            style={{ letterSpacing: '-0.02em', color: '#FFFFFF' }}
          >
            Take
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: isTagline ? 1 : 0, y: 0 }}
            transition={{ duration: 1.0, delay: isTagline ? 0.6 : 0, ease: cinematicEase }}
            className="text-4xl md:text-5xl font-semibold font-sf-pro whitespace-nowrap mr-4"
            style={{ letterSpacing: '-0.02em', color: '#FFFFFF' }}
          >
            the
          </motion.span>
        </motion.div>

        {/* "Baseball" - RIGHT at the seam, no margin */}
        <motion.span
          className="text-4xl md:text-5xl font-semibold font-sf-pro whitespace-nowrap"
          style={{ letterSpacing: '-0.02em', color: '#FFFFFF' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: isLogoPhase ? 1 : 0 }}
          transition={{ 
            duration: 3.5,
            delay: isLogoPhase ? 0.3 : 0,
            ease: slowRevealEase,
          }}
        >
          Baseball
        </motion.span>
      </div>

      {/* ===== RIGHT SIDE OF CENTER ===== */}
      <div 
        className="fixed top-1/2 left-1/2 flex items-center"
        style={{ transform: 'translateY(-50%)' }}
      >
        {/* "Helm" - RIGHT at the seam, no margin */}
        <motion.span
          className="text-4xl md:text-5xl font-semibold font-sf-pro whitespace-nowrap"
          style={{ letterSpacing: '-0.02em', color: '#4ADE80' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.0, delay: 1.2, ease: cinematicEase }}
        >
          Helm
        </motion.span>

        {/* "of your program" - fades out when transitioning to logo */}
        <motion.div
          className="flex items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: isTagline ? 1 : 0 }}
          transition={{ duration: isTagline ? 0 : 1.5, ease: cinematicEase }}
        >
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: isTagline ? 1 : 0, y: 0 }}
            transition={{ duration: 1.0, delay: isTagline ? 1.8 : 0, ease: cinematicEase }}
            className="text-4xl md:text-5xl font-semibold font-sf-pro whitespace-nowrap ml-4"
            style={{ letterSpacing: '-0.02em', color: '#FFFFFF' }}
          >
            of
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: isTagline ? 1 : 0, y: 0 }}
            transition={{ duration: 1.0, delay: isTagline ? 2.4 : 0, ease: cinematicEase }}
            className="text-4xl md:text-5xl font-semibold font-sf-pro whitespace-nowrap ml-4"
            style={{ letterSpacing: '-0.02em', color: '#FFFFFF' }}
          >
            your
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: isTagline ? 1 : 0, y: 0 }}
            transition={{ duration: 1.0, delay: isTagline ? 3.0 : 0, ease: cinematicEase }}
            className="text-4xl md:text-5xl font-semibold font-sf-pro whitespace-nowrap ml-4"
            style={{ letterSpacing: '-0.02em', color: '#FFFFFF' }}
          >
            program
          </motion.span>
        </motion.div>
      </div>

      {/* "Let's get started" - below center */}
      <motion.p
        className="fixed left-1/2"
        style={{ 
          top: '58%',
          transform: 'translateX(-50%)',
        }}
        initial={{ opacity: 0, y: 15 }}
        animate={{ 
          opacity: phase === 'logo-form' ? 1 : 0,
          y: phase === 'logo-form' ? 0 : 15
        }}
        transition={{ 
          duration: 1.0, 
          delay: phase === 'logo-form' ? 3.0 : 0,
          ease: cinematicEase
        }}
      >
        <span className="text-2xl md:text-3xl font-semibold text-white font-sf-pro">
          Let's get started
        </span>
      </motion.p>

      {/* Background transition to cream */}
      {phase === 'transition' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
          className="fixed inset-0 bg-onboarding-cream pointer-events-none"
          style={{ zIndex: 200 }}
        />
      )}
    </div>
  );
}
