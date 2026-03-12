import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Sparkles, History, Lightbulb, PlusCircle, BookOpen, Award, Menu, X } from "lucide-react";

const DARK = "#01343F";

export function Navbar() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { href: "/wizard/actions", label: "Calculate", icon: PlusCircle },
    { href: "/results", label: "My Impact", icon: Sparkles },
    { href: "/history", label: "History", icon: History },
    { href: "/badges", label: "Badges", icon: Award },
    { href: "/journal", label: "Journal", icon: BookOpen },
    { href: "/suggestions", label: "Ideas", icon: Lightbulb },
  ];

  return (
    <nav style={{ background: DARK }} className="sticky top-0 z-50 w-full border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <img src={`${import.meta.env.BASE_URL}images/logo.webp`} alt="My Impact" className="h-8" />
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = location.startsWith(item.href) && (item.href !== "/" || location === "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "text-white bg-white/10"
                    : "text-white/60 hover:text-white hover:bg-white/8"
                )}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* CTA button + mobile hamburger */}
        <div className="flex items-center gap-3">
          <Link
            href="/wizard/actions"
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold text-white transition-all hover:-translate-y-px"
            style={{ background: "#F06127", boxShadow: "0 2px 12px #F0612740" }}
          >
            Calculate my impact →
          </Link>

          <button
            className="md:hidden p-2"
            style={{ color: "rgba(255,255,255,0.7)" }}
            onClick={() => setMobileOpen(o => !o)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div
          className="md:hidden border-t border-white/10 px-4 py-3 flex flex-col gap-1"
          style={{ background: DARK }}
        >
          {navItems.map((item) => {
            const isActive = location.startsWith(item.href) && (item.href !== "/" || location === "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "text-white bg-white/10"
                    : "text-white/60 hover:text-white hover:bg-white/8"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/wizard/actions"
            onClick={() => setMobileOpen(false)}
            className="mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white"
            style={{ background: "#F06127" }}
          >
            Calculate my impact →
          </Link>
        </div>
      )}
    </nav>
  );
}
