import { Link, useLocation } from "wouter";
import {
  Building2, Users, Flag, ClipboardList, Download, Settings,
} from "lucide-react";

const ITEMS = [
  { href: "/org/dashboard",   label: "Dashboard",  icon: Building2,     testId: "subnav-dashboard" },
  { href: "/org/activities",  label: "Activities", icon: Users,         testId: "subnav-activities" },
  { href: "/org/challenges",  label: "Challenges", icon: Flag,          testId: "subnav-challenges" },
  { href: "/org/pulse",       label: "Pulse",      icon: ClipboardList, testId: "subnav-pulse" },
  { href: "/org/export",      label: "Export",     icon: Download,      testId: "subnav-export" },
  { href: "/org/settings",    label: "Settings",   icon: Settings,      testId: "subnav-settings" },
] as const;

export function OrgSubNav() {
  const [location] = useLocation();
  return (
    <div
      className="flex items-center gap-1 mb-5 border-b border-border overflow-x-auto"
      role="tablist"
      aria-label="Organisation navigation"
    >
      {ITEMS.map(item => {
        const active = location === item.href || location.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "px-3 py-2 text-xs font-semibold border-b-2 -mb-px whitespace-nowrap " +
              (active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border")
            }
            data-testid={item.testId}
          >
            <span className="inline-flex items-center gap-1.5">
              <item.icon className="w-3.5 h-3.5" /> {item.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
