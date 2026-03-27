import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Sparkles, History, Lightbulb, PlusCircle, BookOpen, Award,
  Menu, X, LogIn, LogOut, MessageCircle, Smartphone, Share, MoreVertical,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useSidekick } from "@/lib/sidekick-context";

const DARK = "#213547";

function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const triggerInstall = async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return true;
  };

  return { canInstall: !!deferredPrompt, triggerInstall };
}

function detectPlatform() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function AddToHomeModal({ onClose }: { onClose: () => void }) {
  const platform = detectPlatform();

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm mx-auto p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#F06127" }}>
              <Smartphone className="w-4.5 h-4.5 text-white w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Add to home screen</p>
              <p className="text-xs text-muted-foreground">Quick access from your phone</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted/40 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {platform === "ios" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Follow these steps in Safari:</p>
            <div className="space-y-2.5">
              {[
                { step: "1", icon: <Share className="w-4 h-4" style={{ color: "#007AFF" }} />, text: <>Tap the <strong>Share</strong> button at the bottom of your screen</> },
                { step: "2", icon: <span className="text-base leading-none">＋</span>, text: <>Scroll down and tap <strong>Add to Home Screen</strong></> },
                { step: "3", icon: <span className="text-base leading-none">✓</span>, text: <>Tap <strong>Add</strong> in the top right corner</> },
              ].map(({ step, icon, text }) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground mt-0.5">
                    {step}
                  </div>
                  <div className="flex items-start gap-2 flex-1">
                    <span className="shrink-0 mt-0.5">{icon}</span>
                    <p className="text-xs text-foreground leading-relaxed">{text}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border">
              Works in Safari. If you're using Chrome on iPhone, switch to Safari for best results.
            </p>
          </div>
        )}

        {platform === "android" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Follow these steps in Chrome:</p>
            <div className="space-y-2.5">
              {[
                { step: "1", icon: <MoreVertical className="w-4 h-4 text-muted-foreground" />, text: <>Tap the <strong>⋮ menu</strong> in the top-right corner of Chrome</> },
                { step: "2", icon: <span className="text-base leading-none">＋</span>, text: <>Tap <strong>Add to Home screen</strong></> },
                { step: "3", icon: <span className="text-base leading-none">✓</span>, text: <>Tap <strong>Add</strong> to confirm</> },
              ].map(({ step, icon, text }) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground mt-0.5">
                    {step}
                  </div>
                  <div className="flex items-start gap-2 flex-1">
                    <span className="shrink-0 mt-0.5">{icon}</span>
                    <p className="text-xs text-foreground leading-relaxed">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {platform === "desktop" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">To access My Impact quickly from your desktop:</p>
            <div className="space-y-2.5">
              {[
                { step: "1", text: <>In Chrome, click the <strong>⋮ menu</strong> at the top right</> },
                { step: "2", text: <>Select <strong>Save and share → Create shortcut</strong></> },
                { step: "3", text: <>Check <strong>Open as window</strong> and click <strong>Create</strong></> },
              ].map(({ step, text }) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground mt-0.5">
                    {step}
                  </div>
                  <p className="text-xs text-foreground leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground pt-2 border-t border-border">
              For mobile: open this site on your phone's browser and follow the Add to Home Screen option there.
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-foreground border border-border hover:bg-muted/30 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

export function Navbar() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const { isLoggedIn, login, logout } = useAuth();
  const { setOpen: openSidekick } = useSidekick();
  const { canInstall, triggerInstall } = useInstallPrompt();

  const navItems = [
    { href: "/wizard/actions", label: "Calculate", icon: PlusCircle },
    { href: "/results", label: "My Impact", icon: Sparkles },
    { href: "/history", label: "History", icon: History },
    { href: "/badges", label: "Badges", icon: Award },
    { href: "/journal", label: "Journal", icon: BookOpen },
    { href: "/suggestions", label: "Ideas", icon: Lightbulb },
  ];

  const handleAddToHome = async () => {
    if (canInstall) {
      const installed = await triggerInstall();
      if (installed) return;
    }
    setShowInstall(true);
  };

  return (
    <>
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
                {/* Add to home screen — lg+ only */}
                <button
                  onClick={handleAddToHome}
                  className="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors"
                  title="Add to home screen"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  Add to phone
                </button>
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

            {/* Add to home screen */}
            <button
              onClick={() => { setMobileOpen(false); handleAddToHome(); }}
              className="mt-1 flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors"
            >
              <Smartphone className="w-4 h-4" />
              Add to home screen
            </button>

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

      {/* Add to home screen modal */}
      {showInstall && <AddToHomeModal onClose={() => setShowInstall(false)} />}
    </>
  );
}
