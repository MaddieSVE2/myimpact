import { Link, useLocation, useSearch } from "wouter";
import { scrollContentToTop } from "@/lib/scroll-utils";
import { Building2, GraduationCap, Heart, Landmark } from "lucide-react";
import { PageMeta } from "@/components/PageMeta";
import { ORG_DEMO_META } from "@/lib/page-metadata";
import OrgDemoDashboard from "./OrgDemoDashboard";
import OrgDemoEducationDashboard from "./OrgDemoEducationDashboard";

export type OrgType = "charity" | "education" | "corporate" | "public";

const ORG_TYPES: { type: OrgType; label: string; icon: React.FC<{ className?: string }> }[] = [
  { type: "charity", label: "Charity", icon: Heart },
  { type: "education", label: "Education", icon: GraduationCap },
  { type: "corporate", label: "Corporate", icon: Building2 },
  { type: "public", label: "Public Sector", icon: Landmark },
];

function isValidOrgType(type: string | null): type is OrgType {
  return !!type && ORG_TYPES.some(o => o.type === type);
}

export default function OrgDemoPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const rawType = new URLSearchParams(search).get("type");
  const selectedType: OrgType = isValidOrgType(rawType) ? rawType : "charity";

  function switchType(type: OrgType) {
    setLocation(`/org/demo?type=${type}`);
    scrollContentToTop();
  }

  return (
    <div>
      <PageMeta
        title={ORG_DEMO_META.title}
        description={ORG_DEMO_META.description}
        canonical={ORG_DEMO_META.canonical}
      />
      {/* Sticky type switcher bar, sits below the demo notice banner */}
      <div className="sticky top-0 z-20 bg-primary/10 border-b border-primary/20 px-4 py-2.5 text-center backdrop-blur-sm">
        <p className="text-xs font-semibold text-primary">
          This is example data for illustration. Your real dashboard populates as members log their activities.
        </p>
      </div>

      <div className="bg-white border-b border-border px-4 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-1 shrink-0">
            Viewing as:
          </span>
          {ORG_TYPES.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => switchType(type)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                selectedType === type
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
          <span className="hidden sm:inline text-xs text-muted-foreground ml-auto shrink-0">
            Example data only, not your real dashboard
          </span>
        </div>
      </div>

      {selectedType === "charity" && <OrgDemoDashboard hideBanner demoType="charity" />}
      {selectedType === "education" && <OrgDemoEducationDashboard hideBanner />}
      {selectedType === "corporate" && <OrgDemoDashboard hideBanner demoType="corporate" />}
      {selectedType === "public" && <OrgDemoDashboard hideBanner demoType="public" />}
    </div>
  );
}
