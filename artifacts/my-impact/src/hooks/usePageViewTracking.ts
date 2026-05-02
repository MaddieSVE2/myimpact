import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { ANALYTICS_EVENTS, track } from "@/lib/analytics";

const PAGE_NAMES: Record<string, string> = {
  "/": "Home",
  "/wizard/actions": "Wizard",
  "/wizard/activities": "Wizard",
  "/wizard/contributions": "Wizard",
  "/results": "Results",
  "/suggestions": "Suggestions",
  "/history": "History",
  "/journal": "Journal",
  "/milestones": "Milestones",
  "/profile": "Profile",
  "/profile/setup": "Profile Setup",
  "/settings": "Settings",
  "/org": "Org Dashboard",
  "/org/register": "Org Register",
  "/about": "About",
  "/admin": "Admin",
};

function getPageName(path: string): string | null {
  if (PAGE_NAMES[path]) return PAGE_NAMES[path];
  for (const [pattern, name] of Object.entries(PAGE_NAMES)) {
    if (path.startsWith(pattern + "/")) return name;
  }
  return null;
}

export function usePageViewTracking() {
  const [location] = useLocation();
  const { isLoggedIn, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || !isLoggedIn) return;

    const pageName = getPageName(location);
    if (!pageName) return;

    // Org dashboard pages are tracked on the org surface so member-side
    // funnels stay clean.
    const surface = location === "/org" || location.startsWith("/org/") ? "org" : "member";

    track(ANALYTICS_EVENTS.PAGE_VIEW, { page: pageName, surface });
  }, [location, isLoggedIn, isLoading]);
}
