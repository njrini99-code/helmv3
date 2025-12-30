'use client';

import { motion, AnimatePresence } from 'framer-motion';

export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm"
      >
        <p className="font-medium">{label}</p>
        {payload.map((entry: any, i: number) => (
          <p key={i} className="text-slate-300">
            {entry.name}:{' '}
            <span className="text-white font-medium">{entry.value}</span>
          </p>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}

// Usage in chart:
// <Tooltip content={<ChartTooltip />} />
