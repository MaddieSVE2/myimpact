import { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { useWizard } from "@/lib/wizard-context";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Trophy, TrendingUp, HandCoins, UserPlus, Save,
  ArrowRight, ChevronDown, Download, Share2, Twitter, Linkedin, Check
} from "lucide-react";
import { useSaveImpact } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import html2canvas from "html2canvas";

// Tile with integrated explanation
function MetricTile({
  icon: Icon,
  iconColour,
  borderColour,
  label,
  value,
  explanation,
}: {
  icon: any;
  iconColour: string;
  borderColour: string;
  label: string;
  value: number;
  explanation: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`bg-white border border-border rounded-xl overflow-hidden border-t-2 ${borderColour}`}>
      <div className="p-5">
        <div className={`mb-3 ${iconColour}`}><Icon className="w-4 h-4" /></div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
        <p className="text-2xl font-display font-bold text-foreground">{formatCurrency(value)}</p>
      </div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-2 text-[11px] text-muted-foreground border-t border-border hover:bg-muted/30 transition-colors"
      >
        What's this?
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-4 pt-2 text-xs text-muted-foreground leading-relaxed bg-muted/20 border-t border-border">
          {explanation}
        </div>
      )}
    </div>
  );
}

// Hidden share card captured by html2canvas
function ShareCard({ result, totalValue }: { result: any; totalValue: number }) {
  return (
    <div
      id="impact-share-card"
      style={{
        width: 600,
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)",
        padding: "48px",
        fontFamily: "'Inter', sans-serif",
        position: "absolute",
        left: "-9999px",
        top: 0,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 40 }}>
        <div>
          <span style={{ color: "#F06127", fontWeight: 800, fontSize: 18 }}>My</span>
          <span style={{ color: "#ffffff", fontWeight: 800, fontSize: 18 }}>Impact</span>
        </div>
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, letterSpacing: 2 }}>
          POWERED BY THE SOCIAL VALUE ENGINE
        </span>
      </div>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 8, letterSpacing: 1 }}>
        MY ANNUAL SOCIAL VALUE
      </p>
      <p style={{ color: "#ffffff", fontSize: 56, fontWeight: 800, margin: 0, lineHeight: 1.1 }}>
        {formatCurrency(totalValue)}
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginTop: 40,
          paddingTop: 32,
          borderTop: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        {[
          { label: "Direct Impact", value: result.impactValue, colour: "#F06127" },
          { label: "Contributions", value: result.contributionValue, colour: "#3b82f6" },
          { label: "Donations", value: result.donationsValue, colour: "#22c55e" },
          { label: "Personal Dev", value: result.personalDevelopmentValue, colour: "#f59e0b" },
        ].map(item => (
          <div key={item.label}>
            <p style={{ color: item.colour, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, marginBottom: 4 }}>
              {item.label.toUpperCase()}
            </p>
            <p style={{ color: "#ffffff", fontSize: 22, fontWeight: 700, margin: 0 }}>
              {formatCurrency(item.value)}
            </p>
          </div>
        ))}
      </div>
      <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 36, letterSpacing: 1 }}>
        Calculate yours at my-impact.org
      </p>
    </div>
  );
}

export default function Results() {
  const [, setLocation] = useLocation();
  const { result, input } = useWizard();
  const saveMutation = useSaveImpact();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!result) setLocation("/wizard/actions");
  }, [result, setLocation]);

  if (!result) return null;

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync({
        data: {
          userId: "user_demo_123",
          name: "My Impact Record",
          impactResult: result,
          activities: input.activities,
          donationsGBP: input.donationsGBP,
          additionalVolunteerHours: input.additionalVolunteerHours,
        },
      });
      setSaved(true);
      toast({ title: "Saved!", description: "Your impact record has been added to your history." });
    } catch {
      toast({ title: "Unable to save", description: "Something went wrong.", variant: "destructive" });
    }
  };

  const handleExportPNG = async () => {
    setExporting(true);
    try {
      const card = document.getElementById("impact-share-card");
      if (!card) return;
      const canvas = await html2canvas(card, { scale: 2, useCORS: true, backgroundColor: null });
      const link = document.createElement("a");
      link.download = "my-impact.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      toast({ title: "Export failed", description: "Could not generate the image.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const shareText = `I generated ${formatCurrency(result.totalValue)} in social value this year. Find out what yours is:`;
  const shareUrl = "https://my-impact.org";

  const handleNativeShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: "My Impact", text: shareText, url: shareUrl });
    } else {
      setShareOpen(o => !o);
    }
  };

  // Stacked bar data
  const total = result.totalValue || 1;
  const segments = [
    { label: "Direct Impact", value: result.impactValue, colour: "#F06127" },
    { label: "Contribution", value: result.contributionValue, colour: "#3b82f6" },
    { label: "Donations", value: result.donationsValue, colour: "#22c55e" },
    { label: "Personal Dev", value: result.personalDevelopmentValue, colour: "#f59e0b" },
  ].filter(s => s.value > 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 pb-28">
      {/* Hidden share card for export */}
      <ShareCard result={result} totalValue={result.totalValue} />

      {/* Hero */}
      <motion.div
        className="text-center mb-10"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Your annual social value</p>
        <h1 className="text-6xl md:text-7xl font-display font-bold text-foreground tracking-tight mb-3">
          {formatCurrency(result.totalValue)}
        </h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          That's the equivalent financial value of the positive difference you've made to society over the past year, calculated using globally recognised Social Value Engine proxies.
        </p>
      </motion.div>

      {/* Stacked proportion bar */}
      {segments.length > 1 && (
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="h-3 rounded-full overflow-hidden flex gap-0.5 bg-muted">
            {segments.map(s => (
              <div
                key={s.label}
                style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.colour }}
                className="rounded-full"
                title={`${s.label}: ${formatCurrency(s.value)}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {segments.map(s => (
              <div key={s.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.colour }} />
                {s.label}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Metric tiles */}
      <motion.div
        className="grid grid-cols-2 gap-3 mb-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <MetricTile
          icon={TrendingUp} iconColour="text-primary" borderColour="border-t-primary"
          label="Direct Impact" value={result.impactValue}
          explanation={result.explanations.impact}
        />
        <MetricTile
          icon={UserPlus} iconColour="text-blue-500" borderColour="border-t-blue-500"
          label="Contribution" value={result.contributionValue}
          explanation={result.explanations.contribution}
        />
        <MetricTile
          icon={HandCoins} iconColour="text-green-500" borderColour="border-t-green-500"
          label="Donations" value={result.donationsValue}
          explanation={result.explanations.donations}
        />
        <MetricTile
          icon={Trophy} iconColour="text-amber-500" borderColour="border-t-amber-500"
          label="Personal Development" value={result.personalDevelopmentValue}
          explanation={result.explanations.personalDevelopment}
        />
      </motion.div>

      {/* Activity breakdown */}
      {result.activityBreakdowns.length > 0 && (
        <motion.div
          className="mb-8 bg-white border border-border rounded-xl overflow-hidden"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Value by activity</h3>
          </div>
          <div className="divide-y divide-border">
            {result.activityBreakdowns.map((a: any) => (
              <div key={a.activityId} className="flex items-center gap-3 px-5 py-3">
                <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: a.sdgColor || "#F06127" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{a.activityName}</p>
                  <p className="text-xs text-muted-foreground">{a.sdg}</p>
                </div>
                <p className="text-sm font-semibold text-foreground shrink-0">{formatCurrency(a.impactValue)}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* SDG breakdown */}
      {result.sdgBreakdowns.length > 0 && (
        <motion.div
          className="mb-10 bg-white border border-border rounded-xl p-5"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">UN SDG alignment</h3>
          <div className="space-y-2.5">
            {result.sdgBreakdowns.map((s: any) => (
              <div key={s.sdg} className="flex items-center gap-3">
                <span
                  className="text-[10px] font-bold text-white px-2 py-0.5 rounded shrink-0"
                  style={{ backgroundColor: s.sdgColor }}
                >
                  SDG {s.sdg}
                </span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(100, (s.value / result.totalValue) * 100)}%`,
                      backgroundColor: s.sdgColor,
                    }}
                  />
                </div>
                <span className="text-xs font-medium text-foreground shrink-0">{formatCurrency(s.value)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Fixed action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending || saved}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-secondary text-foreground text-xs font-medium hover:bg-secondary/70 transition-colors disabled:opacity-50 shrink-0"
          >
            {saved ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? "Saved" : "Save"}
          </button>

          <button
            onClick={handleExportPNG}
            disabled={exporting}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-secondary text-foreground text-xs font-medium hover:bg-secondary/70 transition-colors disabled:opacity-50 shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? "Exporting…" : "Download PNG"}
          </button>

          <div className="relative shrink-0">
            <button
              onClick={handleNativeShare}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-secondary text-foreground text-xs font-medium hover:bg-secondary/70 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
            {shareOpen && (
              <div className="absolute bottom-full mb-2 left-0 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[140px] z-50">
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
                >
                  <Twitter className="w-3.5 h-3.5 text-sky-500" /> Share on X
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}&summary=${encodeURIComponent(shareText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
                >
                  <Linkedin className="w-3.5 h-3.5 text-blue-600" /> Share on LinkedIn
                </a>
              </div>
            )}
          </div>

          <Link
            href="/suggestions"
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
          >
            Get personalised ideas <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
