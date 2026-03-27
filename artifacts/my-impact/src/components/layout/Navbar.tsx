import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Sparkles, History, Lightbulb, PlusCircle, BookOpen, Award, Menu, X, LogIn, LogOut, MessageCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useSidekick } from "@/lib/sidekick-context";

const DARK = "#213547";

export function Navbar() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isLoggedIn, login, logout } = useAuth();
  const { setOpen: openSidekick } = useSidekick();

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
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <img src={`${import.meta.env.BASE_URL}images/myimpact.png`} alt="My Impact" className="h-14" />
        </Link>

        {/* Desktop nav — lg+ only, logged-in only */}
        {isLoggedIn && (
          <div className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.startsWith(item.href) && (item.href !== "/" || location === "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                    isActive
                      ? "text-white bg-white/10"
                      : "text-white/60 hover:text-white hover:bg-white/8"
                  )}
                >
                  <item.icon className="w-3.5 h-3.5 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}

        {/* Right-side controls */}
        <div className="flex items-center gap-2">
          {isLoggedIn ? (
            <>
              {/* CTA — lg+ only */}
              <Link
                href="/wizard/actions"
                className="hidden lg:inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold text-white transition-all hover:-translate-y-px whitespace-nowrap"
                style={{ background: "#F06127", boxShadow: "0 2px 12px #F0612740" }}
              >
                Calculate my impact →
              </Link>
              {/* Log out — lg+ only */}
              <button
                onClick={logout}
                className="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Log out
              </button>
            </>
          ) : (
            <>
              {/* Log in — lg+ only */}
              <button
                onClick={login}
                className="hidden lg:inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all hover:-translate-y-px"
                style={{ background: "rgba(255,255,255,0.1)", color: "white", border: "1px solid rgba(255,255,255,0.2)" }}
              >
                <LogIn className="w-3.5 h-3.5" />
                Log in
              </button>
              {/* CTA — lg+ only */}
              <Link
                href="/wizard/actions"
                className="hidden lg:inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold text-white transition-all hover:-translate-y-px whitespace-nowrap"
                style={{ background: "#F06127", boxShadow: "0 2px 12px #F0612740" }}
              >
                Calculate my impact →
              </Link>
            </>
          )}

          {/* Sidekick icon — below lg only */}
          <button
            className="lg:hidden p-2"
            style={{ color: "rgba(255,255,255,0.7)" }}
            onClick={() => { setMobileOpen(false); openSidekick(true); }}
            title="Open Sidekick AI"
          >
            <MessageCircle className="w-5 h-5" />
          </button>

          {/* Hamburger — below lg only */}
          <button
            className="lg:hidden p-2"
            style={{ color: "rgba(255,255,255,0.7)" }}
            onClick={() => setMobileOpen(o => !o)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile / tablet dropdown — below lg */}
      {mobileOpen && (
        <div
          className="lg:hidden border-t border-white/10 px-4 py-3 flex flex-col gap-1"
          style={{ background: DARK }}
        >
          {/* Nav links — logged-in only */}
          {isLoggedIn && navItems.map((item) => {
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

          {/* CTA */}
          <Link
            href="/wizard/actions"
            onClick={() => setMobileOpen(false)}
            className="mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white"
            style={{ background: "#F06127" }}
          >
            Calculate my impact →
          </Link>

          {/* Login / logout */}
          {isLoggedIn ? (
            <button
              onClick={() => { logout(); setMobileOpen(false); }}
              className="mt-1 flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          ) : (
            <button
              onClick={() => { login(); setMobileOpen(false); }}
              className="mt-1 flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Log in
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
