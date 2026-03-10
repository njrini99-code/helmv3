"use client";

import { useAnimate, motion } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { DM_Sans } from "next/font/google";

const dmSans = DM_Sans({
  weight: ['700'],
  subsets: ['latin'],
  display: 'swap',
});

export default function HelmSplashAnimation() {
  const [scope, animate] = useAnimate();
  const [phase, setPhase] = useState<"initial" | "flip1" | "flip2" | "complete">("initial");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const words = ["Baseball", "Golf", "Coach"];
  const currentIndex = phase === "initial" ? 0 : phase === "flip1" ? 1 : phase === "flip2" ? 2 : 2;
  const currentPrefix = words[currentIndex] ?? "Baseball";

  // Check for prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Prevent scroll
  useEffect(() => {
    if ((phase === "flip1" || phase === "flip2") && !prefersReducedMotion) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [phase, prefersReducedMotion]);

  const handleReplay = useCallback(() => {
    setPhase("initial");
  }, []);

  // Animation sequence
  useEffect(() => {
    if (prefersReducedMotion && phase === "initial") {
      setPhase("complete");
      return;
    }

    if (phase === "initial") {
      animate(scope.current, { opacity: [0, 1], scale: [0.97, 1] }, { duration: 0.5 }).then(() => {
        setPhase("flip1");
      });
    } else if (phase === "flip1") {
      setTimeout(() => {
        setTimeout(() => {
          setPhase("flip2");
        }, 800);
      }, 600);
    } else if (phase === "flip2") {
      setTimeout(() => {
        setTimeout(() => {
          setPhase("complete");
        }, 800);
      }, 600);
    }
  }, [phase, animate, prefersReducedMotion]);

  return (
    <div
      className="min-h-screen bg-[#060B14] flex flex-col items-center justify-center relative overflow-hidden px-4"
      role="img"
      aria-label="Helm Sports Labs splash animation"
    >
      {/* Radial glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
        <div
          className="rounded-full opacity-20"
          style={{
            width: "800px",
            height: "800px",
            background: "radial-gradient(circle, rgba(22,163,74,0.15) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Main container */}
      <div ref={scope} className="relative z-10">
        {phase === "complete" ? (
          // Final lockup
          <motion.div
            className="text-center"
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.8, ease: "easeOut" }}
          >
            <div
              className={`font-bold tracking-tight mb-6 ${dmSans.className}`}
              style={{
                fontSize: "clamp(2.5rem, 10vw, 4rem)",
                fontWeight: 700,
                letterSpacing: "-0.03em",
              }}
            >
              <span style={{ color: "#16A34A" }}>Helm</span>
              <span style={{ color: "rgba(240, 244, 248, 0.45)" }}> Sports Labs</span>
            </div>

            <motion.div
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.5, duration: 0.5, ease: "easeOut" }}
              className={`text-sm tracking-widest uppercase ${dmSans.className}`}
              style={{
                color: "#16A34A",
                letterSpacing: "0.25em",
              }}
            >
              Take The Helm
            </motion.div>
          </motion.div>
        ) : (
          // Flip card - SIMPLE VERSION
          <div style={{ perspective: "1200px", maxWidth: "600px" }}>
            <div
              className="relative bg-gradient-to-b from-[#1a2236] to-[#111827] rounded-[10px] overflow-visible shadow-lg"
              style={{
                boxShadow: "0 4px 16px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
                padding: "2.5rem 2rem",
                minHeight: "200px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                className={`font-bold tracking-tight text-center ${dmSans.className}`}
                style={{
                  fontSize: "clamp(2rem, 6vw + 0.5rem, 3.5rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.05em",
                  whiteSpace: "nowrap",
                }}
              >
                {/* Flipping prefix */}
                <SimpleFlipper currentText={currentPrefix} isFlipping={phase === "flip1" || phase === "flip2"} />

                {/* Static "Helm" */}
                <span style={{ color: "#16A34A" }}>Helm</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Replay button */}
      <motion.button
        onClick={handleReplay}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleReplay();
          }
        }}
        className={`mt-16 px-8 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all duration-200 font-medium tracking-wide focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:ring-offset-2 ${dmSans.className}`}
        style={{
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Replay animation"
      >
        Replay Animation
      </motion.button>
    </div>
  );
}

function SimpleFlipper({ currentText, isFlipping }: { currentText: string; isFlipping: boolean }) {
  const [flipScope, animateFlip] = useAnimate();
  const [shadowScope, animateShadow] = useAnimate();

  const words = ["Baseball", "Golf", "Coach"];
  const currentIdx = words.indexOf(currentText);
  const nextText = words[(currentIdx + 1) % 3];

  useEffect(() => {
    if (!isFlipping) {
      // Reset to initial state
      animateFlip(flipScope.current, { rotateX: 0 }, { duration: 0 });
      animateShadow(shadowScope.current, { opacity: 0 }, { duration: 0 });
      return;
    }

    // Simple flip animation
    animateFlip(flipScope.current, {
      rotateX: [0, -180],
      transition: { duration: 0.6, ease: "easeInOut" },
    });

    animateShadow(shadowScope.current, {
      opacity: [0, 0.5, 0],
      transition: { duration: 0.6, ease: "easeInOut" },
    });
  }, [isFlipping, currentText]);

  return (
    <motion.div
      ref={flipScope}
      style={{
        perspective: "1200px",
        transformStyle: "preserve-3d",
        backfaceVisibility: "hidden",
        display: "inline-block",
        position: "relative",
      }}
    >
      {/* Front face - current text */}
      <span style={{ color: "#F0F4F8", display: "inline-block" }}>{currentText}</span>

      {/* Back face - next text (rotated 180) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          transformStyle: "preserve-3d",
          transform: "rotateX(180deg)",
          backfaceVisibility: "hidden",
        }}
      >
        <span style={{ color: "#F0F4F8", display: "inline-block" }}>{nextText}</span>
      </div>

      {/* Shadow overlay */}
      <motion.div
        ref={shadowScope}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          background: "rgba(0, 0, 0, 0.3)",
          opacity: 0,
          pointerEvents: "none",
        }}
      />
    </motion.div>
  );
}
