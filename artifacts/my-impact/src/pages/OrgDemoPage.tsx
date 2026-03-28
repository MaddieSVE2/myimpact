import { useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Building2, GraduationCap, Heart, Landmark } from "lucide-react";
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

function ComingSoonDashboard({ typeName }: { typeName: string }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="min-h-screen bg-muted/20 flex items-center justify-center px-4">
      <div className="max-w-md text-center py-24">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6" style={{ background: "rgba(232,99,58,0.10)" }}>
          <Building2 className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-display font-bold text-foreground mb-3">
          {typeName} example coming soon
        </h1>
        <p className="text-muted-foreground leading-relaxed mb-8">
          We're building a tailored demo for {typeName.toLowerCase()} organisations. In the meantime, the Charity example shows the same core features.
        </p>
        <Link
          href="/org/demo?type=charity"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
        >
          View Charity example instead
        </Link>
      </div>
    </div>
  );
}

export default function OrgDemoPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const rawType = new URLSearchParams(search).get("type");
  const selectedType: OrgType = isValidOrgType(rawType) ? rawType : "charity";

  function switchType(type: OrgType) {
    setLocation(`/org/demo?type=${type}`);
    window.scrollTo(0, 0);
  }

  return (
    <div>
      {/* Sticky type switcher bar — sits below the demo notice banner */}
      <div className="sticky top-0 z-20 bg-primary/10 border-b border-primary/20 px-4 py-2.5 text-center backdrop-blur-sm">
        <p className="text-xs font-semibold text-primary">
          This is example data for illustration. Your real dashboard populates as members log their activities.
        </p>
      </div>

      <div className="bg-white border-b border-border px-4 py-3">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-2 sm:gap-3">
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
            Example data only — not your real dashboard
          </span>
        </div>
      </div>

      {selectedType === "charity" && <OrgDemoDashboard hideBanner />}
      {selectedType === "education" && <OrgDemoEducationDashboard hideBanner />}
      {selectedType === "corporate" && <ComingSoonDashboard typeName="Corporate" />}
      {selectedType === "public" && <ComingSoonDashboard typeName="Public Sector" />}
    </div>
  );
}
