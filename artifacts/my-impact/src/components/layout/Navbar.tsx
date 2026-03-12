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
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <img src={`${import.meta.env.BASE_URL}images/logo.webp`} alt="My Impact" className="h-8" />
        </Link>

        <div className="hidden md:flex items-center gap-2">
          {navItems.map((item) => {
            const isActive = location.startsWith(item.href) && (item.href !== "/" || location === "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "text-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
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
           <Link href="/wizard/actions" className="text-sm font-medium text-primary">Start</Link>
        </div>
      </div>
    </nav>
  );
}
