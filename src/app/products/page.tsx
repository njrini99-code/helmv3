import { Users, BarChart3, Target } from "lucide-react"
import Image from "next/image"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SmoothScroll } from "@/components/landing/SmoothScroll"
import { DashboardMockup } from "@/components/products/DashboardMockup"
import { GolfHelmSection } from "@/components/products/GolfHelmSection"
import { BaseballHelmSection } from "@/components/products/BaseballHelmSection"
import { cn } from "@/lib/utils"

export default function ProductsPage() {
  return (
    <main className="min-h-screen bg-background">
      <SmoothScroll />
      {/* Navigation */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <Navigation />
      </div>

      {/* Hero Section */}
      <section className="pt-24 px-6 py-16 md:py-24 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-5xl md:text-6xl font-bold leading-tight text-foreground">
              Take the <span className="text-primary-600">Helm</span>
              <br />
              of your program
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-md">
              The ultimate platform to manage your team with precision and clarity.
            </p>
            
            {/* Dual Product Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <a href="#golfhelm" className="group">
                <button className={cn(
                  "w-full sm:w-auto",
                  "flex items-center gap-3 px-6 py-3.5 rounded-full",
                  "bg-white/60 backdrop-blur-xl border border-white/40",
                  "hover:bg-white/80 hover:border-white/60",
                  "shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.8)]",
                  "transition-all duration-200",
                  "group-hover:shadow-[0_4px_16px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)]"
                )}>
                  <div className="w-8 h-8 relative flex-shrink-0">
                    <Image
                      src="/helm.transparent. golf-logo.png"
                      alt="GolfHelm"
                      fill
                      className="object-contain"
                      sizes="32px"
                    />
                  </div>
                  <span className="font-semibold text-slate-900">GolfHelm</span>
                </button>
              </a>

              <a href="#baseballhelm" className="group">
                <button className={cn(
                  "w-full sm:w-auto",
                  "flex items-center gap-3 px-6 py-3.5 rounded-full",
                  "bg-white/60 backdrop-blur-xl border border-white/40",
                  "hover:bg-white/80 hover:border-white/60",
                  "shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.8)]",
                  "transition-all duration-200",
                  "group-hover:shadow-[0_4px_16px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)]"
                )}>
                  <div className="w-8 h-8 relative flex-shrink-0">
                    <Image
                      src="/helm-baseball-logo.png"
                      alt="BaseballHelm"
                      fill
                      className="object-contain"
                      sizes="32px"
                    />
                  </div>
                  <span className="font-semibold text-slate-900">BaseballHelm</span>
                </button>
              </a>
            </div>
          </div>
          <div className="relative">
            {/* Green gradient blur behind dashboard */}
            <div className="absolute -top-8 -right-8 w-full h-full bg-gradient-to-br from-primary-500/30 to-primary-500/10 rounded-3xl blur-2xl" />
            
            {/* Dashboard Mockup */}
            <div className="relative z-10">
              <DashboardMockup />
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mt-16">
          {/* Team Management */}
          <div className="py-8">
            <div className={cn(
              "w-14 h-14 rounded-xl mb-4 flex items-center justify-center",
              "bg-primary-50 text-primary-600"
            )}>
              <Users className="w-7 h-7" strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">Team Management</h3>
            <p className="text-muted-foreground">Centralize rosters, schedules, and player development in one place</p>
          </div>

          {/* Comprehensive Stats Insights */}
          <div className="py-8 md:border-x md:px-8 border-border">
            <div className={cn(
              "w-14 h-14 rounded-xl mb-4 flex items-center justify-center",
              "bg-slate-100 text-slate-600"
            )}>
              <BarChart3 className="w-7 h-7" strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">Comprehensive Stats Insights</h3>
            <p className="text-muted-foreground">Track performance metrics and progress with advanced analytics</p>
          </div>

          {/* Recruiting Planning */}
          <div className="py-8">
            <div className={cn(
              "w-14 h-14 rounded-xl mb-4 flex items-center justify-center",
              "bg-violet-50 text-violet-600"
            )}>
              <Target className="w-7 h-7" strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">Recruiting Planning</h3>
            <p className="text-muted-foreground">Streamline prospect identification and communication workflows</p>
          </div>
        </div>
      </section>

      {/* GolfHelm Section */}
      <GolfHelmSection />

      {/* BaseballHelm Section */}
      <BaseballHelmSection />

      <Footer />
    </main>
  )
}
