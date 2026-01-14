import { Users, BarChart3, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DashboardMockup } from "@/components/marketing/DashboardMockup"

export default function ProductsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="text-2xl font-bold text-foreground">Helm</div>
        <nav className="hidden md:flex items-center gap-10">
          <a href="#" className="text-foreground hover:text-foreground/80 font-medium">
            Features
          </a>
          <a href="#" className="text-foreground hover:text-foreground/80 font-medium">
            Pricing
          </a>
          <a href="#" className="text-foreground hover:text-foreground/80 font-medium">
            About
          </a>
        </nav>
        <Button className="bg-[#22c55e] hover:bg-[#16a34a] text-white px-6 rounded-md">Get Started</Button>
      </header>

      {/* Hero Section */}
      <section className="px-6 py-16 md:py-24 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-5xl md:text-6xl font-bold leading-tight text-foreground">
              Take the <span className="text-[#22c55e]">Helm</span>
              <br />
              of your program
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-md">
              The ultimate platform to manage your team with precision and clarity.
            </p>
          </div>
          <div className="relative">
            {/* Green gradient blur behind dashboard */}
            <div className="absolute -top-8 -right-8 w-full h-full bg-gradient-to-br from-[#22c55e]/30 to-[#22c55e]/10 rounded-3xl blur-2xl" />
            
            {/* Dashboard Mockup */}
            <div className="relative z-10">
              <DashboardMockup />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-6 py-12 max-w-7xl mx-auto border-t border-border">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Team Management */}
          <div className="py-8">
            <Users className="w-12 h-12 text-foreground mb-4" strokeWidth={1.5} />
            <h3 className="text-xl font-semibold text-foreground mb-2">Team Management</h3>
            <p className="text-muted-foreground">Centralize rosters, schedules, and player development in one place</p>
          </div>

          {/* Comprehensive Stats Insights */}
          <div className="py-8 md:border-x md:px-8 border-border">
            <BarChart3 className="w-12 h-12 text-foreground mb-4" strokeWidth={1.5} />
            <h3 className="text-xl font-semibold text-foreground mb-2">Comprehensive Stats Insights</h3>
            <p className="text-muted-foreground">Track performance metrics and progress with advanced analytics</p>
          </div>

          {/* Recruiting Planning */}
          <div className="py-8">
            <Target className="w-12 h-12 text-foreground mb-4" strokeWidth={1.5} />
            <h3 className="text-xl font-semibold text-foreground mb-2">Recruiting Planning</h3>
            <p className="text-muted-foreground">Streamline prospect identification and communication workflows</p>
          </div>
        </div>
      </section>
    </div>
  )
}
