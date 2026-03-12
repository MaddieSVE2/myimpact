import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Sparkles, History, Lightbulb, PlusCircle } from "lucide-react";

export function Navbar() {
  const [location] = useLocation();

  const navItems = [
    { href: "/wizard/actions", label: "Calculate", icon: PlusCircle },
    { href: "/results", label: "My Impact", icon: Sparkles },
    { href: "/history", label: "History", icon: History },
    { href: "/suggestions", label: "Ideas", icon: Lightbulb },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/20 bg-white/60 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-display font-bold text-xl shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
            M
          </div>
          <span className="font-display font-bold text-xl tracking-tight text-foreground">
            My<span className="text-primary">Impact</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-1 bg-white/50 p-1 rounded-full border border-white/60 shadow-sm">
          {navItems.map((item) => {
            const isActive = location.startsWith(item.href) && (item.href !== "/" || location === "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-white text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/40"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Mobile Nav - simplified for bottom bar in a real app, but here inline */}
        <div className="md:hidden flex items-center gap-4">
           <Link href="/wizard/actions" className="text-sm font-bold text-primary">Start</Link>
        </div>
      </div>
    </nav>
  );
}
