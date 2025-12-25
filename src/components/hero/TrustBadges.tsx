"use client";

import { motion } from "framer-motion";
import { ShieldCheck, Clock, Globe } from "lucide-react";

const badges = [
  { icon: ShieldCheck, label: "NCAA compliant" },
  { icon: Clock, label: "Fast onboarding" },
  { icon: Globe, label: "D1, D2, D3 programs" },
];

export function TrustBadges() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.7 }}
      className="flex flex-wrap items-center gap-4 sm:gap-6 mt-8 sm:mt-12"
    >
      {badges.map((badge) => {
        const Icon = badge.icon;
        return (
          <div key={badge.label} className="flex items-center gap-2 text-gray-500">
            <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-3 h-3 text-emerald-400" />
            </div>
            <span className="text-xs sm:text-sm whitespace-nowrap">{badge.label}</span>
          </div>
        );
      })}
    </motion.div>
  );
}
