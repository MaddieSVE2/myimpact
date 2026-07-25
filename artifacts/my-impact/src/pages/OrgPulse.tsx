import { Link } from "wouter";
import { ClipboardList, AlertCircle } from "lucide-react";
import { OrgPulseSummaryCard } from "@/components/OrgPulseSummaryCard";
import { PulseSurveysSection } from "@/components/PulseSurveysSection";
import { useMyOrg } from "@/lib/org-export";
import { useOrgPeriod } from "@/hooks/useOrgPeriod";
import { OrgPeriodNavigator } from "@/components/OrgPeriodNavigator";

export default function OrgPulse() {
  const { data: orgData, isLoading, isError } = useMyOrg();

  const isManager = orgData?.org?.role === "manager";
  const summaryYearStart = orgData?.org?.summaryYearStart ?? "01-01";
  const { periodOffset, setPeriodOffset, periodBounds, isCurrentPeriod } = useOrgPeriod(summaryYearStart, false);

  if (isLoading) {
    return <div className="max-w-6xl mx-auto px-4 py-16 flex justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>;
  }
  if (isError) {
    return <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
      <p className="text-base font-semibold">Could not load your organisation</p>
    </div>;
  }
  if (!orgData?.org) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <p className="text-base font-semibold mb-2">You're not in an organisation yet.</p>
      <Link href="/org" className="text-primary underline">Go to the organisation portal</Link>
    </div>;
  }
  if (!isManager) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <p className="text-base font-semibold mb-2">Manager access required</p>
    </div>;
  }

  return (
    <>
    <div className="max-w-6xl mx-auto px-4 py-8" data-testid="org-pulse-root">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-display font-semibold text-foreground">Pulse surveys</h1>
        </div>
        <OrgPeriodNavigator
          periodOffset={periodOffset}
          setPeriodOffset={setPeriodOffset}
          label={periodBounds.label}
          isCurrentPeriod={isCurrentPeriod}
        />
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Run short, anonymous check-ins with your members and see how they're feeling over time.
      </p>

      <OrgPulseSummaryCard />
      <PulseSurveysSection />
    </div>
    </>
  );
}
