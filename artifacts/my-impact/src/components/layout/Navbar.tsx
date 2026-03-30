import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Sparkles, History, Lightbulb, PlusCircle, BookOpen, Award,
  Menu, X, LogIn, LogOut, MessageCircle, Smartphone, Share,
  MoreVertical, User, ChevronDown, Eye, Building2, Settings, MessageSquare, ShieldCheck, NotebookPen, Gift,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useSidekick } from "@/lib/sidekick-context";
import { useTheme } from "@/lib/theme-context";
import { useFeedback } from "@/lib/feedback-context";
import { useQuery } from "@tanstack/react-query";
import InviteModal from "@/components/InviteModal";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

function useMyOrgMembership(enabled: boolean) {
  return useQuery<{ org: { id: string; name: string; type: string } | null }>({
    queryKey: ["my-org"],
    enabled,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/org/my`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    staleTime: 60_000,
  });
}

const DARK = "#213547";

function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setDeferredPrompt(e); };
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
              <Smartphone className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Add to home screen</p>
              <p className="text-xs text-muted-foreground">Quick access from your phone</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted/40 transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>

        {platform === "ios" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Follow these steps in Safari:</p>
            <div className="space-y-2.5">
              {[
                { step: "1", icon: <Share className="w-4 h-4" style={{ color: "#007AFF" }} aria-hidden="true" />, text: <>Tap the <strong>Share</strong> button at the bottom of your screen</> },
                { step: "2", icon: <span className="text-base leading-none" aria-hidden="true">＋</span>, text: <>Scroll down and tap <strong>Add to Home Screen</strong></> },
                { step: "3", icon: <span className="text-base leading-none" aria-hidden="true">✓</span>, text: <>Tap <strong>Add</strong> in the top right corner</> },
              ].map(({ step, icon, text }) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground mt-0.5">{step}</div>
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
                { step: "1", icon: <MoreVertical className="w-4 h-4 text-muted-foreground" aria-hidden="true" />, text: <>Tap the <strong>⋮ menu</strong> in the top-right corner of Chrome</> },
                { step: "2", icon: <span className="text-base leading-none" aria-hidden="true">＋</span>, text: <>Tap <strong>Add to Home screen</strong></> },
                { step: "3", icon: <span className="text-base leading-none" aria-hidden="true">✓</span>, text: <>Tap <strong>Add</strong> to confirm</> },
              ].map(({ step, icon, text }) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground mt-0.5">{step}</div>
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
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground mt-0.5">{step}</div>
                  <p className="text-xs text-foreground leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground pt-2 border-t border-border">
              For mobile: open this site on your phone's browser and use the Add to Home Screen option there.
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { isLoggedIn, user, logout } = useAuth();
  const isAdmin = ["maddie@socialvalueengine.com", "ivan.annibal@roseregeneration.co.uk"].includes(
    (user?.email ?? "").toLowerCase()
  );
  const { setOpen: openSidekick } = useSidekick();
  const { canInstall, triggerInstall } = useInstallPrompt();
  const { isHighContrast, toggleTheme } = useTheme();
  const { feedbackMode, toggleFeedbackMode } = useFeedback();
  const { data: orgData, isLoading: orgLoading } = useMyOrgMembership(isLoggedIn);
  const inOrg = !orgLoading && !!orgData?.org;

  const navItems = [
    { href: "/wizard/actions", label: "Calculate", icon: PlusCircle },
    { href: "/results", label: "My Impact", icon: Sparkles },
    { href: "/history", label: "History", icon: History },
    { href: "/milestones", label: "Milestones", icon: Award },
    { href: "/journal", label: "Journal", icon: BookOpen },
    { href: "/suggestions", label: "Ideas", icon: Lightbulb },
  ];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAddToHome = async () => {
    setUserMenuOpen(false);
    setMobileOpen(false);
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
          <Link
            href="/"
            className="flex items-center gap-2 shrink-0"
            onClick={() => window.scrollTo({ top: 0, behavior: "instant" })}
          >
            <img src={`${import.meta.env.BASE_URL}images/myimpact.png`} alt="My Impact" className="h-14" />
          </Link>

          {/* Desktop nav */}
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
                      isActive ? "text-white bg-white/10" : "text-white/60 hover:text-white hover:bg-white/8"
                    )}
                  >
                    <item.icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
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
                {/* CTA — desktop only */}
                <Link
                  href="/wizard/actions"
                  className="hidden lg:inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold text-white transition-all hover:-translate-y-px whitespace-nowrap"
                  style={{ background: "#F06127", boxShadow: "0 2px 12px #F0612740" }}
                >
                  Calculate my impact →
                </Link>

                {/* User menu — desktop only */}
                <div className="relative hidden lg:block" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(o => !o)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full transition-colors",
                      userMenuOpen ? "bg-white/15" : "hover:bg-white/10"
                    )}
                    aria-label="My account menu"
                    aria-expanded={userMenuOpen}
                  >
                    <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-white" aria-hidden="true" />
                    </div>
                    <ChevronDown
                      className={cn("w-3 h-3 text-white/60 transition-transform", userMenuOpen && "rotate-180")}
                      aria-hidden="true"
                    />
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-border overflow-hidden z-50">
                      <div className="px-4 py-3 border-b border-border">
                        <p className="text-xs font-semibold text-foreground">My account</p>
                        {user?.email && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{user.email}</p>
                        )}
                      </div>
                      <div className="py-1">
                        {/* Account */}
                        <Link
                          href="/profile"
                          onClick={() => setUserMenuOpen(false)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted/40 transition-colors text-left"
                        >
                          <User className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                          My profile
                        </Link>
                        <Link
                          href="/settings"
                          onClick={() => setUserMenuOpen(false)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted/40 transition-colors text-left"
                        >
                          <Settings className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                          Account settings
                        </Link>
                        <div className="my-1 border-t border-border" />
                        {/* Preferences */}
                        <button
                          onClick={() => { setUserMenuOpen(false); toggleTheme(); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted/40 transition-colors text-left"
                          aria-pressed={isHighContrast}
                        >
                          <Eye className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                          {isHighContrast ? "Standard contrast" : "High contrast"}
                        </button>
                        <button
                          onClick={handleAddToHome}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted/40 transition-colors text-left"
                        >
                          <Smartphone className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                          Add to home screen
                        </button>
                        <button
                          onClick={() => { setUserMenuOpen(false); setShowInvite(true); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted/40 transition-colors text-left"
                        >
                          <Gift className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                          Invite a friend
                        </button>
                        <div className="my-1 border-t border-border" />
                        {/* Feedback */}
                        <button
                          onClick={() => { setUserMenuOpen(false); toggleFeedbackMode(); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted/40 transition-colors text-left"
                          aria-pressed={feedbackMode}
                        >
                          <NotebookPen className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                          {feedbackMode ? "Exit feedback mode" : "Enter feedback mode"}
                        </button>
                        <Link
                          href="/feedback"
                          onClick={() => setUserMenuOpen(false)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted/40 transition-colors text-left"
                        >
                          <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                          Send feedback
                        </Link>
                        <div className="my-1 border-t border-border" />
                        {/* Organisation */}
                        {!orgLoading && (
                          <Link
                            href="/org"
                            onClick={() => setUserMenuOpen(false)}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted/40 transition-colors text-left"
                          >
                            <Building2 className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                            {inOrg ? "My organisation" : "Join my organisation"}
                          </Link>
                        )}
                        {isAdmin && (
                          <Link
                            href="/admin"
                            onClick={() => setUserMenuOpen(false)}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted/40 transition-colors text-left"
                          >
                            <ShieldCheck className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                            Admin panel
                          </Link>
                        )}
                        <div className="my-1 border-t border-border" />
                        <button
                          onClick={() => { setUserMenuOpen(false); logout(); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted/40 transition-colors text-left"
                        >
                          <LogOut className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                          Log out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* High contrast toggle — desktop, logged-out (icon only) */}
                <div className="relative hidden lg:block group">
                  <button
                    onClick={toggleTheme}
                    className="flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-white/10"
                    style={{ color: "white" }}
                    aria-pressed={isHighContrast}
                    aria-label={isHighContrast ? "Switch to standard contrast" : "Switch to high contrast"}
                  >
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity bg-foreground text-background shadow-md">
                    {isHighContrast ? "Standard contrast" : "High contrast mode"}
                  </div>
                </div>
                <Link
                  href={`/login?from=${encodeURIComponent(location)}`}
                  className="hidden lg:inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all hover:-translate-y-px"
                  style={{ background: "rgba(255,255,255,0.1)", color: "white", border: "1px solid rgba(255,255,255,0.2)" }}
                >
                  <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                  Log in
                </Link>
                <Link
                  href="/wizard/actions"
                  className="hidden lg:inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold text-white transition-all hover:-translate-y-px whitespace-nowrap"
                  style={{ background: "#F06127", boxShadow: "0 2px 12px #F0612740" }}
                >
                  Calculate my impact →
                </Link>
              </>
            )}

            {/* Sidekick icon — mobile only */}
            <button
              className="lg:hidden p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center"
              style={{ color: "rgba(255,255,255,0.7)" }}
              onClick={() => { setMobileOpen(false); openSidekick(true); }}
              aria-label="Open Sidekick AI"
            >
              <MessageCircle className="w-5 h-5" aria-hidden="true" />
            </button>

            {/* Hamburger — mobile only */}
            <button
              className="lg:hidden p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center"
              style={{ color: "rgba(255,255,255,0.7)" }}
              onClick={() => setMobileOpen(o => !o)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-white/10 px-4 py-3 flex flex-col gap-0.5" style={{ background: DARK }}>
            {isLoggedIn && navItems.map((item) => {
              const isActive = location.startsWith(item.href) && (item.href !== "/" || location === "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-3 rounded-md text-sm font-medium transition-colors min-h-[44px]",
                    isActive ? "text-white bg-white/10" : "text-white/60 hover:text-white hover:bg-white/8"
                  )}
                >
                  <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}

            <Link
              href="/wizard/actions"
              onClick={() => setMobileOpen(false)}
              className="mt-2 flex items-center justify-center gap-2 px-4 py-3 rounded-full text-sm font-bold text-white min-h-[44px]"
              style={{ background: "#F06127" }}
            >
              Calculate my impact →
            </Link>

            {/* Divider before account actions — only when logged in */}
            {isLoggedIn && <div className="my-1 border-t border-white/10" />}

            {/* Account */}
            {isLoggedIn && (
              <Link
                href="/profile"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 px-3 py-3 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors min-h-[44px]"
              >
                <User className="w-4 h-4 shrink-0" aria-hidden="true" />
                My profile
              </Link>
            )}

            {isLoggedIn && (
              <Link
                href="/settings"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 px-3 py-3 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors min-h-[44px]"
              >
                <Settings className="w-4 h-4 shrink-0" aria-hidden="true" />
                Account settings
              </Link>
            )}

            {/* Preferences */}
            <div className="my-1 border-t border-white/10" />

            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 px-3 py-3 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors min-h-[44px]"
              aria-pressed={isHighContrast}
            >
              <Eye className="w-4 h-4 shrink-0" aria-hidden="true" />
              {isHighContrast ? "Standard contrast" : "High contrast"}
            </button>

            <button
              onClick={handleAddToHome}
              className="flex items-center gap-2 px-3 py-3 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors min-h-[44px]"
            >
              <Smartphone className="w-4 h-4 shrink-0" aria-hidden="true" />
              Add to home screen
            </button>

            {isLoggedIn && (
              <button
                onClick={() => { setMobileOpen(false); setShowInvite(true); }}
                className="flex items-center gap-2 px-3 py-3 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors min-h-[44px]"
              >
                <Gift className="w-4 h-4 shrink-0" aria-hidden="true" />
                Invite a friend
              </button>
            )}

            {/* Feedback */}
            <div className="my-1 border-t border-white/10" />

            <button
              onClick={() => { setMobileOpen(false); toggleFeedbackMode(); }}
              className="flex items-center gap-2 px-3 py-3 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors min-h-[44px]"
              aria-pressed={feedbackMode}
            >
              <NotebookPen className="w-4 h-4 shrink-0" aria-hidden="true" />
              {feedbackMode ? "Exit feedback mode" : "Enter feedback mode"}
            </button>

            <Link
              href="/feedback"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 px-3 py-3 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors min-h-[44px]"
            >
              <MessageSquare className="w-4 h-4 shrink-0" aria-hidden="true" />
              Send feedback
            </Link>

            {/* Organisation — divider only when at least one item will show */}
            {isLoggedIn && (!orgLoading || isAdmin) && <div className="my-1 border-t border-white/10" />}

            {isLoggedIn && !orgLoading && (
              <Link
                href="/org"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 px-3 py-3 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors min-h-[44px]"
              >
                <Building2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                {inOrg ? "My organisation" : "Join my organisation"}
              </Link>
            )}

            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 px-3 py-3 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors min-h-[44px]"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                Admin panel
              </Link>
            )}

            {isLoggedIn ? (
              <>
                <div className="my-1 border-t border-white/10" />
                <button
                  onClick={() => { logout(); setMobileOpen(false); }}
                  className="flex items-center gap-2 px-3 py-3 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors min-h-[44px]"
                >
                  <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                  Log out
                </button>
              </>
            ) : (
              <Link
                href={`/login?from=${encodeURIComponent(location)}`}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 px-3 py-3 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors min-h-[44px]"
              >
                <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
                Log in
              </Link>
            )}
          </div>
        )}
      </nav>

      {showInstall && <AddToHomeModal onClose={() => setShowInstall(false)} />}
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </>
  );
}
