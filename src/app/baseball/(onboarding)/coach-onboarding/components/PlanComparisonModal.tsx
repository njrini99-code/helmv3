'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';

interface PlanComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PlanComparisonModal({ isOpen, onClose }: PlanComparisonModalProps) {
  const features = [
    {
      category: 'Recruiting',
      items: [
        { name: 'Player discovery & search', free: true, elite: true },
        { name: 'View player profiles', free: true, elite: true },
        { name: 'Save to watchlist', free: true, elite: true },
        { name: 'Basic messaging', free: true, elite: false },
        { name: 'Unlimited messaging', free: false, elite: true },
        { name: 'Priority inbox', free: false, elite: true },
      ],
    },
    {
      category: 'Team Management',
      items: [
        { name: 'Full roster management', free: false, elite: true },
        { name: 'Player profiles', free: false, elite: true },
        { name: 'Attendance tracking', free: false, elite: true },
        { name: 'Injury reports', free: false, elite: true },
      ],
    },
    {
      category: 'Development',
      items: [
        { name: 'Practice plans', free: false, elite: true },
        { name: 'Workout planning', free: false, elite: true },
        { name: 'Player development tracking', free: false, elite: true },
        { name: 'Progress reports', free: false, elite: true },
      ],
    },
    {
      category: 'Analytics',
      items: [
        { name: 'Team statistics', free: false, elite: true },
        { name: 'Player analytics', free: false, elite: true },
        { name: 'Performance trends', free: false, elite: true },
        { name: 'Custom reports', free: false, elite: true },
      ],
    },
    {
      category: 'Administration',
      items: [
        { name: 'Compliance calendar', free: false, elite: true },
        { name: 'Document storage', free: false, elite: true },
        { name: 'Staff management', free: false, elite: true },
        { name: 'Priority support', free: false, elite: true },
      ],
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-onboarding-border-light">
                <h2 className="text-2xl font-semibold text-onboarding-text-primary font-sf-pro">
                  Compare Plans
                </h2>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={24} className="text-onboarding-text-secondary" />
                </button>
              </div>

              {/* Content */}
              <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
                {/* Plan Headers */}
                <div className="grid grid-cols-3 gap-4 p-6 border-b border-onboarding-border-light sticky top-0 bg-white z-10">
                  <div></div>
                  <div className="text-center">
                    <h3 className="text-lg font-semibold text-onboarding-text-primary">Free</h3>
                    <p className="text-sm text-onboarding-text-secondary mt-1">$0/month</p>
                  </div>
                  <div className="text-center">
                    <div className="inline-flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-onboarding-text-primary">Elite</h3>
                      <span className="text-xs bg-onboarding-kelly-green text-white px-2 py-0.5 rounded-full">
                        Recommended
                      </span>
                    </div>
                    <p className="text-sm text-onboarding-text-secondary mt-1">$200/month</p>
                  </div>
                </div>

                {/* Feature Comparison */}
                <div className="p-6 space-y-8">
                  {features.map((category) => (
                    <div key={category.category}>
                      <h4 className="text-sm font-semibold text-onboarding-text-secondary uppercase tracking-wider mb-4">
                        {category.category}
                      </h4>
                      <div className="space-y-3">
                        {category.items.map((item) => (
                          <div key={item.name} className="grid grid-cols-3 gap-4 items-center py-2">
                            <div className="text-sm text-onboarding-text-primary">{item.name}</div>
                            <div className="flex justify-center">
                              {item.free ? (
                                <Check size={20} className="text-onboarding-kelly-green" />
                              ) : (
                                <span className="text-onboarding-text-muted">—</span>
                              )}
                            </div>
                            <div className="flex justify-center">
                              {item.elite ? (
                                <Check size={20} className="text-onboarding-kelly-green" />
                              ) : (
                                <span className="text-onboarding-text-muted">—</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
