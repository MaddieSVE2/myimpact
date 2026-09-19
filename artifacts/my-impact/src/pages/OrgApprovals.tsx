import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertCircle, ClipboardCheck } from "lucide-react";
import { VerificationQueue } from "@/components/VerificationQueue";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface OrgInfo {
  id: string;
  name: string;
  role: string;
}

function useMyOrg() {
  return useQuery<{ org: OrgInfo | null }>({
    queryKey: ["my-org"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/my`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
}

export default function OrgApprovals() {
  const { data: orgData, isLoading, isError } = useMyOrg();

  if (isLoading) {
    return <div className="max-w-6xl mx-auto px-4 py-16 flex justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>;
  }

  if (isError) {
    return <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
      <p className="text-base font-semibold mb-1">Could not load your organisation</p>
      <p className="text-sm text-muted-foreground">Please refresh the page or try again in a moment.</p>
    </div>;
  }

  if (!orgData?.org) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <p className="text-base font-semibold mb-2">You're not in an organisation yet.</p>
      <Link href="/org" className="text-primary underline">Go to the organisation portal</Link>
    </div>;
  }

  if (orgData.org.role !== "manager") {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <p className="text-base font-semibold mb-2">Manager access required</p>
      <p className="text-sm text-muted-foreground">Approvals are only available to your organisation manager.</p>
    </div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8" data-testid="org-approvals-page">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold text-foreground inline-flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-primary" /> Organisation approvals
        </h1>
        <p className="text-sm text-muted-foreground">{orgData.org.name}</p>
      </div>
      <VerificationQueue orgName={orgData.org.name} />
    </div>
  );
}
