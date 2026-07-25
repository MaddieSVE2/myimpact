import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { Check, X, Sparkles, ArrowRight, Building2, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { PageMeta } from "@/components/PageMeta";
import { PRICING_META } from "@/lib/page-metadata";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type TierKey = "free" | "team" | "org" | "enterprise";

interface TierFeatures {
  memberCap: number | null;
  shareLinkCap: number | null;
  matchProgramme: boolean;
  brandedReports: boolean;
  regionalAnalytics: boolean;
  webhookApi: boolean;
  sso: boolean;
  prioritySupport: boolean;
}

interface Tier {
  key: TierKey;
  name: string;
  tagline: string;
  monthlyPriceGbp: number | null;
  highlights: string[];
  features: TierFeatures;
  checkoutAvailable: boolean;
}

interface TiersResponse {
  tiers: Tier[];
  pricingPublic: boolean;
  stripeConfigured: boolean;
}

const COMPARE_ROWS: Array<{ key: keyof TierFeatures; label: string; type: "bool" | "cap" }> = [
  { key: "memberCap", label: "Member cap", type: "cap" },
  { key: "shareLinkCap", label: "Funder share links", type: "cap" },
  { key: "matchProgramme", label: "Match programme", type: "bool" },
  { key: "regionalAnalytics", label: "Regional analytics", type: "bool" },
  { key: "brandedReports", label: "Branded PDF reports", type: "bool" },
  { key: "webhookApi", label: "Webhook & REST API", type: "bool" },
  { key: "sso", label: "SSO (Google + Entra)", type: "bool" },
  { key: "prioritySupport", label: "Priority support", type: "bool" },
];

function formatPrice(p: number | null): string {
  if (p === null) return "Custom";
  if (p === 0) return "£0";
  return `£${p}`;
}

function formatCap(v: number | null): string {
  return v === null ? "Unlimited" : v.toLocaleString("en-GB");
}

function TierCard({ tier, highlight, onPick, busyKey }: {
  tier: Tier;
  highlight: boolean;
  onPick: (tier: Tier) => void;
  busyKey: TierKey | null;
}) {
  const isFree = tier.key === "free";
  const isEnterprise = tier.key === "enterprise";
  const ctaDisabled = busyKey === tier.key;

  return (
    <motion.div
      className={`relative rounded-2xl border p-6 flex flex-col ${
        highlight ? "border-primary bg-white shadow-lg" : "border-border bg-white"
      }`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      data-testid={`tier-card-${tier.key}`}
    >
      {highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-white text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Most popular
        </div>
      )}
      <div className="mb-4">
        <h3 className="text-lg font-display font-bold text-foreground">{tier.name}</h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{tier.tagline}</p>
      </div>
      <div className="mb-5">
        <p className="text-3xl font-display font-bold text-foreground">{formatPrice(tier.monthlyPriceGbp)}</p>
        {tier.monthlyPriceGbp !== null && tier.monthlyPriceGbp > 0 && (
          <p className="text-xs text-muted-foreground">per month, billed monthly</p>
        )}
        {tier.monthlyPriceGbp === null && <p className="text-xs text-muted-foreground">tailored contract</p>}
        {tier.monthlyPriceGbp === 0 && <p className="text-xs text-muted-foreground">forever free</p>}
      </div>
      <ul className="space-y-2 mb-6 flex-1">
        {tier.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2 text-sm text-foreground">
            <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span>{h}</span>
          </li>
        ))}
      </ul>
      {isEnterprise ? (
        <a
          href="mailto:hello@myimpact.uk?subject=My Impact Enterprise enquiry"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-foreground text-white text-sm font-semibold hover:bg-foreground/90 transition-colors"
          data-testid={`cta-${tier.key}`}
        >
          Talk to sales <ArrowRight className="w-3.5 h-3.5" />
        </a>
      ) : isFree ? (
        <Link
          href="/org/register"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-border text-sm font-semibold text-foreground hover:bg-muted/30 transition-colors"
          data-testid={`cta-${tier.key}`}
        >
          Start free
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => onPick(tier)}
          disabled={ctaDisabled}
          className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 ${
            highlight
              ? "bg-primary text-white hover:bg-primary/90"
              : "border border-primary text-primary hover:bg-primary/5"
          }`}
          data-testid={`cta-${tier.key}`}
        >
          {ctaDisabled ? "Loading…" : tier.checkoutAvailable ? "Upgrade" : "Notify me"}
        </button>
      )}
      {!isFree && !isEnterprise && !tier.checkoutAvailable && (
        <p className="text-[11px] text-muted-foreground text-center mt-2">
          Checkout opens once Stripe pricing goes live.
        </p>
      )}
    </motion.div>
  );
}

export default function Pricing() {
  const { isLoggedIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<TiersResponse>({
    queryKey: ["billing-tiers"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/billing/tiers`);
      if (!res.ok) throw new Error("Failed to load pricing");
      return res.json();
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (tier: TierKey) => {
      const res = await fetch(`${BASE}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tier }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not start checkout");
      return json as { url: string };
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err: Error) => setError(err.message),
  });

  function handlePick(tier: Tier) {
    setError(null);
    if (!isLoggedIn) {
      window.location.href = `${BASE}/login?next=${encodeURIComponent("/pricing")}`;
      return;
    }
    if (!tier.checkoutAvailable) {
      // Mailto fallback while Stripe pricing is being set up.
      window.location.href = `mailto:hello@myimpact.uk?subject=Notify me when ${tier.name} is live`;
      return;
    }
    checkoutMutation.mutate(tier.key);
  }

  const tiers = data?.tiers ?? [];
  const isHidden = data && !data.pricingPublic;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <PageMeta
        title={PRICING_META.title}
        description={PRICING_META.description}
        canonical={PRICING_META.canonical}
      />
      <div className="text-center max-w-2xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-4">
          <Building2 className="w-3.5 h-3.5" /> For organisations
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-3">
          Simple pricing for measurable impact
        </h1>
        <p className="text-base text-muted-foreground leading-relaxed">
          Free for individuals, predictable plans for teams. No per-seat surprises, pick the tier that matches the size of your community.
        </p>
      </div>

      {isHidden && (
        <div className="max-w-2xl mx-auto mb-8 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs flex items-start gap-2">
          <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Pricing is in pre-launch preview. The page is not yet linked publicly, you can show this to design partners but the upgrade flow is still being wired into Stripe.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {tiers.map((t) => (
            <TierCard
              key={t.key}
              tier={t}
              highlight={t.key === "team"}
              onPick={handlePick}
              busyKey={checkoutMutation.isPending ? (checkoutMutation.variables ?? null) : null}
            />
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 text-center mb-6">{error}</p>
      )}

      {/* Comparison table */}
      {tiers.length > 0 && (
        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-base font-display font-semibold text-foreground">Compare features</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Feature</th>
                  {tiers.map((t) => (
                    <th key={t.key} className="text-center px-4 py-3 font-semibold">
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.key} className="border-t border-border">
                    <td className="px-5 py-3 text-foreground">{row.label}</td>
                    {tiers.map((t) => {
                      const v = t.features[row.key];
                      if (row.type === "cap") {
                        return (
                          <td key={t.key} className="text-center px-4 py-3 text-foreground font-medium">
                            {formatCap(v as number | null)}
                          </td>
                        );
                      }
                      return (
                        <td key={t.key} className="text-center px-4 py-3">
                          {v === true ? (
                            <Check className="w-4 h-4 text-primary inline" />
                          ) : (
                            <X className="w-4 h-4 text-muted-foreground/50 inline" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-10 text-center">
        <p className="text-xs text-muted-foreground">
          Prices in GBP. VAT added at checkout where applicable. Cancel any time from the billing portal.
        </p>
      </div>
    </div>
  );
}
