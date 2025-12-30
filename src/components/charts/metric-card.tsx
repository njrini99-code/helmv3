'use client';

import { useEffect } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

interface MetricCardProps {
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
}

export function MetricCard({ value, label, prefix, suffix }: MetricCardProps) {
  const spring = useSpring(0, { stiffness: 100, damping: 30 });
  const display = useTransform(spring, (val) => Math.floor(val).toLocaleString());

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return (
    <div className="p-4 bg-white rounded-xl border border-slate-200 hover:shadow-md transition-shadow">
      <motion.span className="text-3xl font-bold text-slate-900 tabular-nums">
        {prefix}
        <motion.span>{display}</motion.span>
        {suffix}
      </motion.span>
      <p className="text-sm text-slate-500 mt-1">{label}</p>
    </div>
  );
}
