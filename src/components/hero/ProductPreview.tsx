"use client";

import { useRef } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { useMousePosition } from "@/lib/hooks/useMousePosition";

export function ProductPreview() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { normalizedX, normalizedY } = useMousePosition(containerRef);

  // Smooth spring physics for rotation
  const springConfig = { stiffness: 150, damping: 20, mass: 0.5 };
  const rotateX = useSpring(useTransform(() => normalizedY * -8), springConfig);
  const rotateY = useSpring(useTransform(() => normalizedX * 12), springConfig);

  return (
    <motion.div
      ref={containerRef}
      className="relative"
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
      style={{ perspective: 1200 }}
    >
      {/* Main product frame with 3D rotation */}
      <motion.div
        className="relative glass-product p-1"
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
      >
        {/* Inner chrome bezel */}
        <div className="relative rounded-[20px] overflow-hidden bg-[#111] border border-white/5">
          {/* Browser chrome */}
          <div className="flex items-center gap-2 px-4 py-3 bg-[#0a0a0a] border-b border-white/5">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <div className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="px-4 py-1 rounded-md bg-white/5 text-xs text-gray-500">
                app.helmsportslabs.com
              </div>
            </div>
          </div>

          {/* Dashboard content */}
          <div className="relative aspect-[16/10] bg-gradient-to-br from-[#0f0f0f] to-[#0a0a0a]">
            {/* Sidebar */}
            <div className="absolute left-0 top-0 bottom-0 w-48 bg-[#0a0a0a] border-r border-white/5 p-4">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <div className="w-4 h-4 rounded bg-emerald-500" />
                </div>
                <span className="text-sm font-medium text-white">BaseballHelm</span>
              </div>

              <nav className="space-y-1">
                {["Dashboard", "Recruits", "Roster", "Schedule", "Analytics"].map((item, i) => (
                  <div
                    key={item}
                    className={`px-3 py-2 rounded-lg text-sm ${
                      i === 0
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "text-gray-500 hover:text-gray-400"
                    }`}
                  >
                    {item}
                  </div>
                ))}
              </nav>
            </div>

            {/* Main content area */}
            <div className="absolute left-48 right-0 top-0 bottom-0 p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-white">Recruiting Pipeline</h3>
                  <p className="text-sm text-gray-500">Fall 2025 class</p>
                </div>
                <div className="flex gap-2">
                  <div className="px-3 py-1.5 rounded-lg bg-white/5 text-sm text-gray-400">Filter</div>
                  <div className="px-3 py-1.5 rounded-lg bg-emerald-500 text-sm text-white">Add recruit</div>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: "Total Recruits", value: "148", change: "+12%" },
                  { label: "Contacted", value: "89", change: "+8%" },
                  { label: "Campus Visits", value: "34", change: "+24%" },
                  { label: "Committed", value: "12", change: "+3" },
                ].map((kpi) => (
                  <div key={kpi.label} className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <p className="text-xs text-gray-500 mb-1">{kpi.label}</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-semibold text-white">{kpi.value}</span>
                      <span className="text-xs text-emerald-400">{kpi.change}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Mini chart */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-gray-400">Pipeline Trend</span>
                  <span className="text-xs text-gray-500">Last 6 months</span>
                </div>
                <div className="h-24 flex items-end gap-1">
                  {[40, 55, 45, 60, 75, 65, 80, 70, 85, 90, 78, 95].map((height, i) => (
                    <motion.div
                      key={i}
                      className="flex-1 bg-gradient-to-t from-emerald-500/50 to-emerald-400/80 rounded-sm"
                      initial={{ height: 0 }}
                      animate={{ height: `${height}%` }}
                      transition={{ duration: 0.5, delay: 0.8 + i * 0.05 }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Reflection/glow underneath */}
        <div
          className="absolute -bottom-px left-[5%] right-[5%] h-[1px]"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(16, 185, 129, 0.3), transparent)",
          }}
        />
      </motion.div>

      {/* Shadow */}
      <motion.div
        className="absolute -bottom-8 left-[10%] right-[10%] h-[60px] rounded-[50%]"
        style={{
          background: "radial-gradient(ellipse, rgba(0,0,0,0.4) 0%, transparent 70%)",
          filter: "blur(20px)",
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
          translateZ: -50,
        }}
      />

      {/* Floating elements - adds depth */}
      <motion.div
        className="absolute -top-4 -right-4 w-20 h-20 rounded-2xl glass-panel p-3"
        style={{
          rotateX: useSpring(useTransform(() => normalizedY * -12), springConfig),
          rotateY: useSpring(useTransform(() => normalizedX * 16), springConfig),
          translateZ: 40,
        }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 1 }}
      >
        <div className="text-xs text-gray-500 mb-1">Commits</div>
        <div className="text-xl font-bold text-emerald-400">+3</div>
        <div className="text-[10px] text-gray-600">this week</div>
      </motion.div>

      <motion.div
        className="absolute -bottom-2 -left-6 w-24 h-16 rounded-xl glass-panel p-3"
        style={{
          rotateX: useSpring(useTransform(() => normalizedY * -10), springConfig),
          rotateY: useSpring(useTransform(() => normalizedX * 14), springConfig),
          translateZ: 30,
        }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 1.1 }}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <div className="text-[10px] text-gray-500">Visit booked</div>
            <div className="text-xs font-medium text-white">J. Smith</div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
