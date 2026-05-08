import { Link, useLocation } from "wouter";
import { PlusCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const HIDE_PREFIXES = [
  "/log",
  "/quick-log",
  "/wizard",
  "/login",
  "/auth/confirm",
  "/profile/setup",
];

export function QuickLogFab() {
  const { isLoggedIn, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading || !isLoggedIn) return null;
  if (HIDE_PREFIXES.some((p) => location === p || location.startsWith(p + "/"))) {
    return null;
  }

  const search = typeof window !== "undefined" ? window.location.search : "";
  const params = new URLSearchParams(search);
  const challenge = params.get("challenge");
  const href = challenge ? `/log?challenge=${encodeURIComponent(challenge)}` : "/log";

  return (
    <Link
      href={href}
      className="lg:hidden fixed bottom-20 right-5 z-40 inline-flex items-center gap-2 pl-4 pr-5 py-3 rounded-full text-sm font-semibold text-white shadow-lg transition-transform active:scale-95"
      style={{ background: "#F06127", boxShadow: "0 6px 20px rgba(240,97,39,0.45)" }}
      aria-label="Log activity"
      data-testid="fab-log-activity"
    >
      <PlusCircle className="w-5 h-5" aria-hidden="true" />
      Log activity
    </Link>
  );
}
