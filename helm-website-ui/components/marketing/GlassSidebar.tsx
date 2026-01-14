import { Home, Flag, TrendingUp, Trophy, Calendar, BarChart2, BookOpen, MessageSquare, Users, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

export function GlassSidebar() {
  const navItems = [
    { icon: Home, label: 'Dashboard', active: true },
    { icon: Flag, label: 'My Rounds' },
    { icon: TrendingUp, label: 'My Development' },
    { icon: Trophy, label: 'My Qualifiers' },
    { icon: Calendar, label: 'Calendar' },
    { icon: BarChart2, label: 'My Stats' },
    { icon: BookOpen, label: 'Classes' },
    { icon: MessageSquare, label: 'Messages' }
  ]

  const teamItems = [
    { icon: Users, label: 'Team Info' },
    { icon: Settings, label: 'Settings' }
  ]

  return (
    <div className="absolute left-0 top-0 bottom-0 w-56 backdrop-blur-xl bg-white/70 dark:bg-black/70 border-r border-white/20 rounded-l-xl z-20 p-4 flex flex-col">
      {/* Profile Section */}
      <div className="mb-6 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#22c55e] to-[#16a34a] flex items-center justify-center text-white font-semibold text-sm shadow-lg">
            NC
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">Nick Rini</p>
            <p className="text-xs text-muted-foreground truncate">Coach</p>
          </div>
        </div>
      </div>
      
      {/* Logo */}
      <div className="flex items-center gap-2 mb-6 px-2">
        <div className="w-8 h-8 rounded-full bg-[#22c55e]" />
        <span className="font-semibold text-foreground">Helm</span>
      </div>
      
      {/* Navigation Items */}
      <nav className="space-y-1 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.label}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                item.active 
                  ? "bg-[#22c55e]/10 text-[#22c55e] font-medium" 
                  : "text-muted-foreground hover:bg-accent/50"
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </div>
          )
        })}
      </nav>
      
      {/* Team Section at bottom */}
      <div className="pt-4 border-t border-border/50 mt-auto">
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2 px-2">Team</div>
        <div className="space-y-1">
          {teamItems.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent/50 transition-colors"
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
