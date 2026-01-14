import { Settings, BarChart3, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import Image from "next/image"

export default function HelmLandingPage() {
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
              The ultimate software to manage your programs with precision and clarity.
            </p>
          </div>
          <div className="relative">
            {/* Green gradient blur behind dashboard */}
            <div className="absolute -top-8 -right-8 w-full h-full bg-gradient-to-br from-[#22c55e]/30 to-[#22c55e]/10 rounded-3xl blur-2xl" />
            <div className="relative">
              <Image
                src="/images/screen.png"
                alt="Helm Dashboard"
                width={600}
                height={400}
                className="rounded-xl shadow-xl relative z-10"
                style={{
                  clipPath: "inset(17% 7% 28% 48%)",
                  transform: "scale(2.2) translateX(-10%) translateY(5%)",
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-6 py-12 max-w-7xl mx-auto border-t border-border">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Program Automation */}
          <div className="py-8">
            <Settings className="w-12 h-12 text-foreground mb-4" strokeWidth={1.5} />
            <h3 className="text-xl font-semibold text-foreground mb-2">Program Automation</h3>
            <p className="text-muted-foreground">Streamline workflows and save time.</p>
          </div>

          {/* Advanced Analytics */}
          <div className="py-8 md:border-x md:px-8 border-border">
            <BarChart3 className="w-12 h-12 text-foreground mb-4" strokeWidth={1.5} />
            <h3 className="text-xl font-semibold text-foreground mb-2">Advanced Analytics</h3>
            <p className="text-muted-foreground">Gain insights to make data-driven decisions.</p>
          </div>

          {/* Secure Collaboration */}
          <div className="py-8">
            <ShieldCheck className="w-12 h-12 text-foreground mb-4" strokeWidth={1.5} />
            <h3 className="text-xl font-semibold text-foreground mb-2">Secure Collaboration</h3>
            <p className="text-muted-foreground">Work seamlessly and securely with your team.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
