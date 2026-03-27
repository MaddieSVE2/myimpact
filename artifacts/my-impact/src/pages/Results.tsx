import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useWizard } from "@/lib/wizard-context";
import { formatCurrency } from "@/lib/utils";
import { computeBadges, getNextMilestone } from "@/lib/badges";
import { motion } from "framer-motion";
import {
  Trophy, TrendingUp, HandCoins, UserPlus, Save,
  ArrowRight, Info, Download, Share2, Twitter, Linkedin, Check,
  BookOpen, Award, ChevronDown, ChevronUp, FlaskConical
} from "lucide-react";
import { useSaveImpact } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import html2canvas from "html2canvas";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer
} from "recharts";

// Metric tile — styled to match original My Impact design
function MetricTile({
  icon: Icon,
  iconColour,
  label,
  value,
  subtitle,
  explanation,
}: {
  icon: any;
  iconColour: string;
  label: string;
  value: number;
  subtitle: string;
  explanation: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className="w-5 h-5 shrink-0" style={{ color: iconColour }} />
      </div>
      <p className="text-2xl font-display font-bold" style={{ color: "#F06127" }}>
        {formatCurrency(value)}
      </p>
      <div className="flex items-center gap-1 mt-1">
        <p className="text-xs text-muted-foreground leading-snug">{subtitle}</p>
        <button
          onClick={() => setOpen(o => !o)}
          className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          title="What's this?"
        >
          <Info className="w-3 h-3" />
        </button>
      </div>
      {open && (
        <div className="mt-3 text-xs text-muted-foreground leading-relaxed border-t border-border pt-3">
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

// ── Personal Development ──────────────────────────────────────────────────────

const ACTIVITY_SKILLS: Record<string, { emoji: string; name: string }[]> = {
  // Specific activities
  food_bank:           [{ emoji: "📋", name: "Organisation" }, { emoji: "❤️", name: "Empathy" }, { emoji: "🤝", name: "Teamwork" }],
  elderly_visiting:    [{ emoji: "👂", name: "Active listening" }, { emoji: "❤️", name: "Empathy" }, { emoji: "🗣️", name: "Communication" }],
  literacy_support:    [{ emoji: "📚", name: "Mentoring" }, { emoji: "🗣️", name: "Communication" }, { emoji: "🎯", name: "Leadership" }],
  digital_coaching:    [{ emoji: "💻", name: "Digital literacy" }, { emoji: "📚", name: "Mentoring" }, { emoji: "💡", name: "Problem-solving" }],
  employability_coaching: [{ emoji: "🎯", name: "Leadership" }, { emoji: "🗣️", name: "Communication" }, { emoji: "📚", name: "Mentoring" }],
  youth_mentoring:     [{ emoji: "🎯", name: "Leadership" }, { emoji: "❤️", name: "Empathy" }, { emoji: "🗣️", name: "Communication" }],
  community_garden:    [{ emoji: "🌱", name: "Environmental awareness" }, { emoji: "🤝", name: "Teamwork" }, { emoji: "📋", name: "Organisation" }],
  arts_volunteering:   [{ emoji: "✍️", name: "Creative thinking" }, { emoji: "🗣️", name: "Communication" }, { emoji: "🤝", name: "Teamwork" }],
  tree_planting:       [{ emoji: "🌱", name: "Environmental awareness" }, { emoji: "💡", name: "Initiative" }, { emoji: "🏃", name: "Resilience" }],
  recycling:           [{ emoji: "🌱", name: "Environmental awareness" }, { emoji: "💡", name: "Initiative" }],
  food_waste:          [{ emoji: "🌱", name: "Environmental awareness" }, { emoji: "💡", name: "Initiative" }],
  eco_transport:       [{ emoji: "🌱", name: "Environmental awareness" }, { emoji: "🏃", name: "Resilience" }],
  litter_picking:      [{ emoji: "🌱", name: "Environmental awareness" }, { emoji: "💡", name: "Initiative" }, { emoji: "🤝", name: "Teamwork" }],
  blood_donation:      [{ emoji: "🏃", name: "Resilience" }, { emoji: "💡", name: "Initiative" }],
  charity_books:       [{ emoji: "📋", name: "Organisation" }, { emoji: "🤝", name: "Teamwork" }],
  charity_shop_bags:   [{ emoji: "📋", name: "Organisation" }, { emoji: "🤝", name: "Teamwork" }],
  fundraising:         [{ emoji: "🗣️", name: "Communication" }, { emoji: "🎯", name: "Leadership" }, { emoji: "🤝", name: "Teamwork" }],
  veterans_breakfast:  [{ emoji: "❤️", name: "Empathy" }, { emoji: "🗣️", name: "Communication" }, { emoji: "🤝", name: "Teamwork" }],
  wildlife_trust:      [{ emoji: "🌱", name: "Environmental awareness" }, { emoji: "🔬", name: "Research skills" }],
  // By category fallbacks
  Environment:  [{ emoji: "🌱", name: "Environmental awareness" }, { emoji: "💡", name: "Initiative" }, { emoji: "🏃", name: "Resilience" }],
  Health:       [{ emoji: "❤️", name: "Empathy" }, { emoji: "👂", name: "Active listening" }, { emoji: "🤝", name: "Teamwork" }],
  Community:    [{ emoji: "🗣️", name: "Communication" }, { emoji: "🤝", name: "Teamwork" }, { emoji: "🌍", name: "Cultural awareness" }],
  Education:    [{ emoji: "📚", name: "Mentoring" }, { emoji: "🎯", name: "Leadership" }, { emoji: "🗣️", name: "Communication" }],
  Custom:       [{ emoji: "🗣️", name: "Communication" }, { emoji: "🤝", name: "Teamwork" }, { emoji: "💡", name: "Initiative" }],
};

const DEFAULT_SKILLS: { emoji: string; name: string }[] = [
  { emoji: "🗣️", name: "Communication" },
  { emoji: "🤝", name: "Teamwork" },
  { emoji: "💡", name: "Initiative" },
];

function deriveSkills(breakdowns: any[]): { emoji: string; name: string }[] {
  const seen = new Map<string, { emoji: string; name: string }>();
  for (const b of breakdowns) {
    const skills = ACTIVITY_SKILLS[b.activityId] ?? ACTIVITY_SKILLS[b.category] ?? [];
    for (const s of skills) {
      if (!seen.has(s.name)) seen.set(s.name, s);
    }
  }
  for (const d of DEFAULT_SKILLS) {
    if (!seen.has(d.name)) seen.set(d.name, d);
  }
  return Array.from(seen.values()).slice(0, 9);
}

function PersonalDevelopmentDetail({
  value,
  totalHours,
  breakdowns,
}: {
  value: number;
  totalHours: number;
  breakdowns: any[];
}) {
  const [open, setOpen] = useState(false);
  const skills = deriveSkills(breakdowns);

  const VOLUNTEER_RATE = 12.21;
  const PERSONAL_DEV_RATE = 0.001333;
  const hourlySkillRate = totalHours * PERSONAL_DEV_RATE * VOLUNTEER_RATE;
  const roundedRate = Math.round(hourlySkillRate * 100) / 100;

  return (
    <motion.div
      className="mb-6 bg-white border border-border rounded-xl overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.17 }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between px-5 pt-5 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-4 h-4 shrink-0" style={{ color: "#f59e0b" }} />
            <p className="text-xs text-muted-foreground font-medium">Personal Development</p>
          </div>
          <p className="text-2xl font-display font-bold" style={{ color: "#F06127" }}>
            {formatCurrency(value)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Skill value gained from {Math.round(totalHours)} volunteer hours
          </p>
        </div>
      </div>

      {/* Skills developed */}
      <div className="border-t border-border px-5 py-4">
        <p className="text-xs font-semibold text-foreground mb-3">Skills you're developing</p>
        <div className="flex flex-wrap gap-2">
          {skills.map(s => (
            <span
              key={s.name}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: "#fefce8", border: "1px solid #fde68a", color: "#92400e" }}
            >
              {s.emoji} {s.name}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
          Based on the activities you do — these are transferable skills recognised by employers, universities, and training providers.
        </p>
      </div>

      {/* How it's calculated */}
      <div className="border-t border-border">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-muted/20 transition-colors"
        >
          <span className="text-xs font-medium text-muted-foreground">How this is calculated</span>
          {open
            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          }
        </button>
        {open && (
          <div className="px-5 pb-5 space-y-3 border-t border-border bg-muted/10">
            <p className="text-xs text-muted-foreground leading-relaxed pt-3">
              Skill value compounds with experience — the more hours you volunteer, the faster skills develop. We apply a rate of <strong>0.13% of the National Living Wage (£{VOLUNTEER_RATE}/hr)</strong> per hour volunteered, scaled by total hours.
            </p>
            <div className="bg-white border border-border rounded-lg p-3 space-y-1.5 font-mono text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Hours volunteered</span>
                <span className="font-semibold text-foreground">{Math.round(totalHours)} hrs</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Skill rate at this level</span>
                <span className="font-semibold text-foreground">£{roundedRate.toFixed(2)}/hr</span>
              </div>
              <div className="border-t border-border pt-1.5 flex justify-between">
                <span className="text-muted-foreground">Total skill value</span>
                <span className="font-bold" style={{ color: "#F06127" }}>{formatCurrency(value)}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Source: based on peer-reviewed research into informal learning and skill acquisition through volunteering.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Proxy methodology ─────────────────────────────────────────────────────────

function ProxyMethodology({ breakdowns }: {
  breakdowns: Array<{
    activityId: string;
    activityName: string;
    category: string;
    proxy: string;
    proxyYear: string;
    sdgColor: string;
    impactValue: number;
    hours: number;
  }>
}) {
  const [open, setOpen] = useState(false);
  const withProxy = breakdowns.filter(b => b.proxy);

  if (withProxy.length === 0) return null;

  return (
    <motion.div
      className="mb-8 bg-white border border-border rounded-xl overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <FlaskConical className="w-4 h-4 shrink-0" style={{ color: "#7E8FAD" }} />
          <div>
            <p className="text-sm font-semibold text-foreground">How we calculated this</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {withProxy.length} SVE {withProxy.length === 1 ? "proxy" : "proxies"} used
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-border">
          <div className="px-5 py-3 bg-muted/10">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Each activity is matched to a Social Value Engine proxy — a peer-reviewed financial value representing the societal benefit of that outcome. Values are sourced from government data and peer-reviewed academic research.
            </p>
          </div>
          <div className="divide-y divide-border">
            {withProxy.map(b => (
              <div key={b.activityId} className="flex items-start gap-3 px-5 py-3.5">
                <div
                  className="w-0.5 self-stretch rounded-full shrink-0 mt-0.5"
                  style={{ backgroundColor: b.sdgColor || "#7E8FAD", minHeight: 20 }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground leading-snug">{b.activityName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        <span className="font-medium text-foreground/70">Proxy: </span>
                        {b.proxy}
                        {b.proxyYear && (
                          <span className="text-muted-foreground/60"> ({b.proxyYear})</span>
                        )}
                      </p>
                    </div>
                    <p className="text-sm font-bold shrink-0" style={{ color: "#F06127" }}>
                      {formatCurrency(b.impactValue)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-muted/10 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Source: <span className="font-medium">Social Value Engine proxy library</span> · Values reflect wellbeing-adjusted social return on investment
            </p>
          </div>
        </div>
      )}
    </motion.div>
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

  const earnedBadges = computeBadges(
    { totalValue: result.totalValue, activityBreakdowns: result.activityBreakdowns },
    true
  ).filter(b => b.earned);

  const nextMilestone = getNextMilestone(result.totalValue);


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

      {/* Badges earned */}
      {earnedBadges.length > 0 && (
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Badges earned</p>
            <Link href="/badges" className="text-xs text-primary hover:underline flex items-center gap-1">
              <Award className="w-3 h-3" /> All badges
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {earnedBadges.map(badge => (
              <div
                key={badge.id}
                className="bg-white border border-border rounded-xl p-3.5 flex items-start gap-3"
              >
                <span className="text-xl shrink-0 mt-0.5">{badge.emoji}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground leading-snug">{badge.name}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{badge.description}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Milestone progress */}
      {nextMilestone && (
        <motion.div
          className="bg-white border border-border rounded-xl p-4 mb-6"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-muted-foreground">
              Next milestone: {nextMilestone.milestone.emoji} {nextMilestone.milestone.label}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(nextMilestone.milestone.threshold - result.totalValue)} to go
            </p>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${nextMilestone.progress}%`, backgroundColor: "#F06127" }}
            />
          </div>
        </motion.div>
      )}

      {/* Donut charts */}
      {(result.activityBreakdowns.length > 0 || result.sdgBreakdowns.length > 0) && (
        <motion.div
          className="mb-8 grid grid-cols-2 gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
        >
          {/* Activity donut */}
          {result.activityBreakdowns.length > 0 && (
            <div className="bg-white border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3">By activity</p>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={result.activityBreakdowns.map((a: any) => ({
                      name: a.activityName,
                      value: a.impactValue,
                      color: a.sdgColor || "#F06127",
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {result.activityBreakdowns.map((a: any, i: number) => (
                      <Cell key={i} fill={a.sdgColor || "#F06127"} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number) => formatCurrency(val)}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-1">
                {result.activityBreakdowns.map((a: any) => (
                  <div key={a.activityId} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.sdgColor || "#F06127" }} />
                    <span className="truncate flex-1">{a.activityName}</span>
                    <span className="font-medium text-foreground shrink-0">{formatCurrency(a.impactValue)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SDG donut */}
          {result.sdgBreakdowns.length > 0 && (
            <div className="bg-white border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3">By SDG</p>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={result.sdgBreakdowns.map((s: any) => ({
                      name: `SDG ${s.sdg}`,
                      value: s.value,
                      color: s.sdgColor,
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {result.sdgBreakdowns.map((s: any, i: number) => (
                      <Cell key={i} fill={s.sdgColor} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number) => formatCurrency(val)}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-1">
                {result.sdgBreakdowns.map((s: any) => (
                  <div key={s.sdg} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span
                      className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded shrink-0"
                      style={{ backgroundColor: s.sdgColor }}
                    >
                      {s.sdg}
                    </span>
                    <span className="truncate flex-1">{s.sdgName || `SDG ${s.sdg}`}</span>
                    <span className="font-medium text-foreground shrink-0">{formatCurrency(s.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
          icon={TrendingUp} iconColour="#F06127"
          label="Impact" value={result.impactValue}
          subtitle="The impact of your activities"
          explanation={result.explanations.impact}
        />
        <MetricTile
          icon={UserPlus} iconColour="#3b82f6"
          label="Contribution" value={result.contributionValue}
          subtitle={`Value of ${Math.round(result.totalHours)} hours contributed`}
          explanation={result.explanations.contribution}
        />
        <MetricTile
          icon={HandCoins} iconColour="#22c55e"
          label="Donations" value={result.donationsValue}
          subtitle="Money donated to good causes"
          explanation={result.explanations.donations}
        />
        <MetricTile
          icon={Trophy} iconColour="#f59e0b"
          label="Personal Development" value={result.personalDevelopmentValue}
          subtitle={`Skill development from ${Math.round(result.totalHours)} hrs`}
          explanation={result.explanations.personalDevelopment}
        />
      </motion.div>

      {/* Personal development detail */}
      <PersonalDevelopmentDetail
        value={result.personalDevelopmentValue}
        totalHours={result.totalHours}
        breakdowns={result.activityBreakdowns}
      />

      {/* Proxy methodology */}
      {result.activityBreakdowns.length > 0 && (
        <ProxyMethodology breakdowns={result.activityBreakdowns} />
      )}

      {/* Fixed action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border" style={{ background: "white", boxShadow: "0 -4px 24px rgba(0,0,0,0.10)" }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2.5 flex-wrap sm:flex-nowrap">

          {/* Save — primary action, always prominent */}
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending || saved}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-60 shrink-0 hover:-translate-y-px"
            style={{
              background: saved ? "#22c55e" : "#213547",
              boxShadow: saved ? "0 2px 12px #22c55e40" : "0 2px 12px #21354740",
            }}
          >
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saveMutation.isPending ? "Saving…" : saved ? "Saved!" : "Save progress"}
          </button>

          {/* Divider */}
          <div className="hidden sm:block w-px h-6 bg-border shrink-0" />

          {/* Secondary actions */}
          <button
            onClick={handleExportPNG}
            disabled={exporting}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:border-foreground/40 hover:bg-muted/30 transition-all disabled:opacity-50 shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? "Exporting…" : "Download PNG"}
          </button>

          <div className="relative shrink-0">
            <button
              onClick={handleNativeShare}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:border-foreground/40 hover:bg-muted/30 transition-all"
            >
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
            {shareOpen && (
              <div className="absolute bottom-full mb-2 left-0 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[160px] z-50">
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                >
                  <Twitter className="w-3.5 h-3.5 text-sky-500" /> Share on X
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}&summary=${encodeURIComponent(shareText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                >
                  <Linkedin className="w-3.5 h-3.5 text-blue-600" /> Share on LinkedIn
                </a>
              </div>
            )}
          </div>

          <Link
            href="/journal"
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:border-foreground/40 hover:bg-muted/30 transition-all shrink-0"
          >
            <BookOpen className="w-3.5 h-3.5" /> Journal
          </Link>

          {/* Ideas CTA — grows to fill remaining space */}
          <Link
            href="/suggestions"
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white whitespace-nowrap transition-all hover:-translate-y-px"
            style={{ background: "#E8633A", boxShadow: "0 2px 12px #E8633A40" }}
          >
            Get personalised ideas <ArrowRight className="w-3.5 h-3.5" />
          </Link>

        </div>
      </div>
    </div>
  );
}
