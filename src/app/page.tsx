'use client';

import React, { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Check,
  Globe,
  ShieldCheck,
} from "lucide-react";
import { GlassNav } from "@/components/ui/GlassNav";
import { HeroSection } from "@/components/hero/HeroSection";

/**
 * Helm Sports Lab — Landing Page
 * Cinematic hero with dark theme + product sections
 */

const LOGOS = {
  main: "/helm-main-logo.png",
  baseball: "/helm-baseball-logo.png",
  golf: "/helm-golf-logo.png",
};

/* ─────────────────────────────────────────────────────────────
   PRODUCT CARD - with large integrated logo
───────────────────────────────────────────────────────────── */
function ProductCard({
  variant,
  title,
  description,
  features,
  href,
}: {
  variant: "baseball" | "golf";
  title: string;
  description: string;
  features: string[];
  href: string;
}) {
  const logo = variant === "baseball" ? LOGOS.baseball : LOGOS.golf;

  return (
    <Link href={href} className="group block">
      <div className="relative p-8 sm:p-10 rounded-3xl bg-white border border-slate-100 hover:border-slate-200 hover:-translate-y-1 transition-all duration-300 shadow-sm hover:shadow-xl overflow-hidden min-h-[420px]">
        
        {/* LARGE BACKGROUND LOGO */}
        <div className="absolute -right-16 -bottom-16 w-72 h-72 sm:w-80 sm:h-80">
          <div 
            className="absolute inset-0 opacity-[0.06] group-hover:opacity-[0.10] transition-opacity duration-500"
            style={{
              background: `radial-gradient(circle, rgba(22, 163, 74, 0.3) 0%, transparent 70%)`,
            }}
          />
          <img 
            src={logo} 
            alt="" 
            className="w-full h-full object-contain opacity-[0.08] group-hover:opacity-[0.12] group-hover:scale-105 transition-all duration-500"
          />
        </div>
        
        <div className="relative z-10">
          {/* Small badge logo */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 mb-6">
            <img src={logo} alt="" className="h-5 w-5 object-contain" />
            <span className="text-xs font-medium text-slate-500">
              {variant === "baseball" ? "Recruiting Platform" : "Team Management"}
            </span>
          </div>

          {/* Title */}
          <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">{title}</h3>
          
          {/* Description */}
          <p className="text-slate-600 mb-8 leading-relaxed max-w-md">{description}</p>

          {/* Features */}
          <ul className="space-y-3 mb-8">
            {features.map((feature, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span className="text-slate-600">{feature}</span>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-green-600 group-hover:gap-3 transition-all">
            Explore {title}
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────
   FEATURE ROW
───────────────────────────────────────────────────────────── */
function FeatureRow({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-green-50 border border-green-100">
        <Icon className="h-5 w-5 text-green-600" />
      </div>
      <div>
        <h4 className="font-medium text-slate-900 mb-1">{title}</h4>
        <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────────────────────── */
export default function HomePage() {
  const [demoEmail, setDemoEmail] = useState('');
  const [demoSubmitted, setDemoSubmitted] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const handleDemoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!demoEmail) return;

    setDemoLoading(true);
    setDemoError(null);

    try {
      // For now, just log the demo request
      // TODO: Set up demo_requests table or integrate with external service
      console.log('Demo request:', { email: demoEmail, timestamp: new Date().toISOString() });

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));

      setDemoSubmitted(true);
    } catch (err) {
      console.error('Demo request error:', err);
      setDemoError('Unable to submit request. Please try again or contact us directly.');
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] overflow-hidden">
      {/* Glass Navigation */}
      <GlassNav />

      {/* Cinematic Hero Section */}
      <HeroSection />

      <main className="relative z-10 bg-[#FAF6F1]">

        {/* PRODUCTS */}
        <section id="baseball" className="px-4 sm:px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">Two sports. One platform.</h2>
              <p className="text-lg text-slate-500 max-w-xl mx-auto">
                Purpose-built tools for baseball recruiting and golf team management.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              <ProductCard
                variant="baseball"
                title="BaseballHelm"
                description="A staff-ready workflow for evaluation, contact, visits, and notes — without spreadsheet drift."
                features={[
                  "Pipeline from first eval to commit",
                  "Roster + development notes attached to athletes",
                  "Head coach visibility without the chaos",
                ]}
                href="/baseball/login"
              />
              <ProductCard
                variant="golf"
                title="GolfHelm"
                description="Discovery, fit, roster planning, and coach-ready profiles — built for college golf staffs."
                features={[
                  "Discovery by fit: scores, schedule, travel needs",
                  "Roster planning and lineup context",
                  "Coach-ready athlete profiles",
                ]}
                href="/golf/login"
              />
            </div>
          </div>
        </section>

        {/* WHY HELM */}
        <section id="golf" className="px-4 sm:px-6 py-20 relative">
          {/* Background logo for this section */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-[500px] h-[500px] pointer-events-none">
            <img 
              src={LOGOS.main} 
              alt="" 
              className="w-full h-full object-contain opacity-[0.03]"
              style={{ filter: 'grayscale(100%)' }}
            />
          </div>
          
          <div className="mx-auto max-w-6xl relative">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              <div>
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6 bg-green-50 border border-green-100 text-green-700">
                  Why Helm
                </span>
                <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-6 leading-tight">
                  Built by people who know recruiting
                </h2>
                <p className="text-slate-600 text-lg mb-8 leading-relaxed">
                  We&apos;ve watched staffs drown in spreadsheets, lose track of contacts, and scramble before visits. Helm fixes the workflow — not with more features, but with the right ones.
                </p>
                <div className="space-y-6">
                  <FeatureRow
                    icon={ShieldCheck}
                    title="Staff-ready permissions"
                    description="Control who sees what. Built for the way programs actually work."
                  />
                  <FeatureRow
                    icon={Calendar}
                    title="Travel-day tested"
                    description="Works on your phone, offline, between games. Not just at your desk."
                  />
                  <FeatureRow
                    icon={Globe}
                    title="Program continuity"
                    description="When staff changes, knowledge stays. No more starting over."
                  />
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { value: "500+", label: "Programs" },
                  { value: "10K+", label: "Athletes tracked" },
                  { value: "95%", label: "Renewal rate" },
                  { value: "48", label: "States" },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="p-6 rounded-2xl bg-white border border-slate-100 shadow-sm"
                  >
                    <div className="text-3xl sm:text-4xl font-bold mb-1 text-green-600">
                      {stat.value}
                    </div>
                    <div className="text-sm text-slate-500">{stat.label}</div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section id="demo" className="px-4 sm:px-6 py-20">
          <div className="mx-auto max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center p-8 sm:p-12 rounded-3xl bg-white border border-slate-100 shadow-lg relative overflow-hidden"
            >
              {/* Large watermark logo */}
              <div className="absolute right-0 bottom-0 w-64 h-64 translate-x-1/4 translate-y-1/4 pointer-events-none">
                <img 
                  src={LOGOS.main} 
                  alt="" 
                  className="w-full h-full object-contain opacity-[0.05]"
                />
              </div>
              
              <div className="relative">
                <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">Book a demo for your staff</h2>
                <p className="text-slate-600 text-lg mb-8 max-w-xl mx-auto">
                  We&apos;ll show you BaseballHelm or GolfHelm, then tailor it to how your program actually works.
                </p>

                <div className="flex flex-wrap justify-center gap-4 text-sm text-slate-500 mb-8">
                  <span className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-green-600" />
                    15-20 minutes
                  </span>
                  <span className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-green-600" />
                    Remote or on-campus
                  </span>
                </div>

                {demoSubmitted ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-6 max-w-md mx-auto">
                    <div className="flex items-center gap-3 text-green-700">
                      <Check className="h-5 w-5" />
                      <div className="text-left">
                        <p className="font-medium">Thanks! We'll be in touch soon.</p>
                        <p className="text-sm text-green-600">Check {demoEmail} for next steps.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 max-w-md mx-auto">
                    {demoError && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                        <p className="text-sm text-red-700">{demoError}</p>
                      </div>
                    )}
                    <form onSubmit={handleDemoSubmit} className="flex flex-col sm:flex-row gap-3 justify-center">
                      <input
                        type="email"
                        value={demoEmail}
                        onChange={(e) => setDemoEmail(e.target.value)}
                        placeholder="Enter your email"
                        required
                        className="flex-1 px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-green-300 focus:ring-2 focus:ring-green-100 transition-all"
                      />
                      <button
                        type="submit"
                        disabled={demoLoading}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-500 shadow-lg shadow-green-600/25 hover:shadow-xl hover:shadow-green-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {demoLoading ? 'Sending...' : 'Book a demo'}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-4 sm:px-6 py-8 border-t border-slate-200 bg-[#FAF6F1]">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img src={LOGOS.main} alt="Helm" className="h-10 w-auto" style={{ mixBlendMode: 'multiply' }} />
              <span className="text-sm text-slate-400">© {new Date().getFullYear()} Helm Sports Lab</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-500">
              <Link href="/about" className="hover:text-slate-700 transition-colors">
                About
              </Link>
              <a href="#baseball" className="hover:text-slate-700 transition-colors">
                Baseball
              </a>
              <a href="#golf" className="hover:text-slate-700 transition-colors">
                Golf
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
