import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useWizard } from "@/lib/wizard-context";
import { formatCurrency } from "@/lib/utils";
import { computeBadges, getNextMilestone } from "@/lib/badges";
import { motion } from "framer-motion";
import {
  Trophy, TrendingUp, HandCoins, UserPlus, Save,
  ArrowRight, Info, Download, Share2, Twitter, Linkedin, Check,
  BookOpen, Award, ChevronDown, ChevronUp, FlaskConical,
  Clipboard, ClipboardCheck, MessageSquare
} from "lucide-react";
import { useSidekick } from "@/lib/sidekick-context";
import { useSaveImpact } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
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
        <Icon className="w-5 h-5 shrink-0" style={{ color: iconColour }} aria-hidden="true" />
      </div>
      <p className="text-2xl font-display font-bold" style={{ color: "#F06127" }}>
        {formatCurrency(value)}
      </p>
      <div className="flex items-center gap-1 mt-1">
        <p className="text-xs text-muted-foreground leading-snug">{subtitle}</p>
        <button
          onClick={() => setOpen(o => !o)}
          className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          aria-label="What's this?"
          aria-expanded={open}
        >
          <Info className="w-3 h-3" aria-hidden="true" />
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
        Calculate yours at myimpact.replit.com
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
  family_caring:       [{ emoji: "❤️", name: "Empathy" }, { emoji: "🗣️", name: "Advocacy" }, { emoji: "📋", name: "Organisation" }, { emoji: "🏃", name: "Emotional resilience" }, { emoji: "🤲", name: "Personal care" }],
  charity_books:       [{ emoji: "📋", name: "Organisation" }, { emoji: "🤝", name: "Teamwork" }],
  charity_shop_bags:   [{ emoji: "📋", name: "Organisation" }, { emoji: "🤝", name: "Teamwork" }],
  fundraising:         [{ emoji: "🗣️", name: "Communication" }, { emoji: "🎯", name: "Leadership" }, { emoji: "🤝", name: "Teamwork" }],
  helping_neighbours:  [{ emoji: "❤️", name: "Empathy" }, { emoji: "🤝", name: "Teamwork" }, { emoji: "🏃", name: "Resilience" }],
  befriending:         [{ emoji: "❤️", name: "Empathy" }, { emoji: "👂", name: "Active listening" }, { emoji: "🗣️", name: "Communication" }],
  dofe_bronze:         [{ emoji: "🎯", name: "Leadership" }, { emoji: "🤝", name: "Teamwork" }, { emoji: "🏃", name: "Resilience" }, { emoji: "💡", name: "Initiative" }],
  dofe_silver:         [{ emoji: "🎯", name: "Leadership" }, { emoji: "🤝", name: "Teamwork" }, { emoji: "🏃", name: "Resilience" }, { emoji: "💡", name: "Initiative" }],
  dofe_gold:           [{ emoji: "🎯", name: "Leadership" }, { emoji: "🤝", name: "Teamwork" }, { emoji: "🏃", name: "Resilience" }, { emoji: "💡", name: "Initiative" }, { emoji: "🗣️", name: "Communication" }],
  school_fundraising:  [{ emoji: "🗣️", name: "Communication" }, { emoji: "🎯", name: "Leadership" }, { emoji: "📋", name: "Organisation" }],
  job_club:            [{ emoji: "🎯", name: "Leadership" }, { emoji: "🗣️", name: "Communication" }, { emoji: "🤝", name: "Teamwork" }, { emoji: "💡", name: "Problem-solving" }],
  veterans_breakfast:  [{ emoji: "❤️", name: "Empathy" }, { emoji: "🗣️", name: "Communication" }, { emoji: "🤝", name: "Teamwork" }],
  wildlife_trust:      [{ emoji: "🌱", name: "Environmental awareness" }, { emoji: "🔬", name: "Research skills" }],
  // Military / Forces service activities
  military_community_reconstruction: [{ emoji: "🎯", name: "Leadership under pressure" }, { emoji: "🌍", name: "Cross-cultural communication" }, { emoji: "📋", name: "Logistics and planning" }],
  military_population_liaison:       [{ emoji: "🌍", name: "Cross-cultural communication" }, { emoji: "🗣️", name: "Communication" }, { emoji: "❤️", name: "Empathy" }],
  military_personnel_training:       [{ emoji: "📚", name: "Training and mentoring" }, { emoji: "🎯", name: "Leadership under pressure" }, { emoji: "🤝", name: "Teamwork" }],
  military_first_aid:                [{ emoji: "🚨", name: "Crisis management" }, { emoji: "🏃", name: "Resilience" }, { emoji: "🧠", name: "Decision-making" }],
  military_logistics:                [{ emoji: "📋", name: "Logistics and planning" }, { emoji: "🎯", name: "Leadership under pressure" }, { emoji: "💡", name: "Problem-solving" }],
  // Career break / Returning to work activities
  career_break_childcare:            [{ emoji: "📋", name: "Coordination" }, { emoji: "🗣️", name: "Negotiation" }, { emoji: "🏃", name: "Resilience" }],
  career_break_eldercare:            [{ emoji: "🗣️", name: "Advocacy" }, { emoji: "📋", name: "Coordination" }, { emoji: "💰", name: "Budget management" }],
  career_break_school_liaison:       [{ emoji: "🤝", name: "Multi-stakeholder management" }, { emoji: "🗣️", name: "Negotiation" }, { emoji: "📋", name: "Coordination" }],
  career_break_medical_coordination: [{ emoji: "🗣️", name: "Advocacy" }, { emoji: "📋", name: "Coordination" }, { emoji: "💡", name: "Problem-solving" }],
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

  const PERSONAL_DEV_RATE_PER_HOUR = 15; // £15/hr — NCVO Time Well Spent 2023

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
            <Trophy className="w-4 h-4 shrink-0" style={{ color: "#f59e0b" }} aria-hidden="true" />
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
          Based on the activities you do. These are transferable skills recognised by employers, universities, and training providers.
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
            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
          }
        </button>
        {open && (
          <div className="px-5 pb-5 space-y-3 border-t border-border bg-muted/10">
            <p className="text-xs text-muted-foreground leading-relaxed pt-3">
              Employers value volunteering experience at an average of <strong>£1,500 per year</strong> in salary premium for active volunteers, equivalent to <strong>£{PERSONAL_DEV_RATE_PER_HOUR}/hr</strong>. This figure reflects the transferable skills (communication, leadership, teamwork) that volunteering develops and that employers recognise.
            </p>
            <div className="bg-white border border-border rounded-lg p-3 space-y-1.5 font-mono text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Hours volunteered</span>
                <span className="font-semibold text-foreground">{Math.round(totalHours)} hrs</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Employer skills premium</span>
                <span className="font-semibold text-foreground">£{PERSONAL_DEV_RATE_PER_HOUR}/hr</span>
              </div>
              <div className="border-t border-border pt-1.5 flex justify-between">
                <span className="text-muted-foreground">Total skill value</span>
                <span className="font-bold" style={{ color: "#F06127" }}>{formatCurrency(value)}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Source: NCVO Time Well Spent (2023), national survey of volunteering in England.
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
          <FlaskConical className="w-4 h-4 shrink-0" style={{ color: "#7E8FAD" }} aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">How we calculated this</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {withProxy.length} SVE {withProxy.length === 1 ? "proxy" : "proxies"} used
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="border-t border-border">
          <div className="px-5 py-3 bg-muted/10">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Each activity is matched to a Social Value Engine proxy, a peer-reviewed financial value representing the societal benefit of that outcome. Values are sourced from government data and peer-reviewed academic research.
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

function generateCVText(result: any, interests: string[] = []): string {
  const skills = deriveSkills(result.activityBreakdowns);
  const activityNames: string[] = result.activityBreakdowns.map((b: any) => b.activityName);
  const hoursRounded = Math.round(result.totalHours);
  const valueFormatted = formatCurrency(result.totalValue);
  const skillNames = skills.slice(0, 5).map((s: { emoji: string; name: string }) => s.name);

  let actText = "";
  if (activityNames.length === 0) {
    actText = "a range of voluntary activities";
  } else if (activityNames.length === 1) {
    actText = activityNames[0].toLowerCase();
  } else if (activityNames.length === 2) {
    actText = `${activityNames[0].toLowerCase()} and ${activityNames[1].toLowerCase()}`;
  } else {
    const last = activityNames[activityNames.length - 1].toLowerCase();
    const rest = activityNames.slice(0, -1).map((n: string) => n.toLowerCase());
    actText = `${rest.join(", ")}, and ${last}`;
  }

  let skillText = "";
  if (skillNames.length === 0) {
    skillText = "communication, teamwork, and initiative";
  } else if (skillNames.length === 1) {
    skillText = skillNames[0];
  } else {
    const lastSkill = skillNames[skillNames.length - 1];
    const restSkills = skillNames.slice(0, -1);
    skillText = `${restSkills.join(", ")} and ${lastSkill}`;
  }

  const isCareerBreak = interests.includes('career_break');
  const isMilitary = interests.includes('military');

  if (isCareerBreak) {
    return `During my career break, I contributed ${hoursRounded} hours of unpaid time to ${actText}. This period of active contribution generated an estimated ${valueFormatted} in social value, calculated using Social Value Engine proxy metrics. The skills I developed, including ${skillText}, are directly transferable and reflect real, substantive work that I carried out to a high standard throughout this period.`;
  }

  if (isMilitary) {
    return `Through my service and subsequent community contributions, I have committed ${hoursRounded} hours to activities including ${actText}, generating an estimated ${valueFormatted} in social value based on Social Value Engine proxy metrics. This work has developed transferable skills including ${skillText}, which I apply in every environment I operate in.`;
  }

  return `Over the past year, I have contributed ${hoursRounded} hours of unpaid time to activities including ${actText}. This work has generated an estimated ${valueFormatted} in social value, calculated using Social Value Engine proxy metrics based on peer-reviewed research and UK government data. Through this experience I have developed transferable skills including ${skillText}, which I bring to everything I do.`;
}

const MILITARY_TRANSFERABLE_SKILLS = [
  { emoji: "🎯", name: "Leadership under pressure" },
  { emoji: "🚨", name: "Crisis management" },
  { emoji: "🌍", name: "Cross-cultural communication" },
  { emoji: "📋", name: "Logistics and planning" },
  { emoji: "📚", name: "Training and mentoring" },
  { emoji: "🏃", name: "Resilience" },
];

const CAREER_BREAK_TRANSFERABLE_SKILLS = [
  { emoji: "📋", name: "Coordination" },
  { emoji: "🗣️", name: "Advocacy" },
  { emoji: "💰", name: "Budget management" },
  { emoji: "🤝", name: "Negotiation" },
  { emoji: "👥", name: "Multi-stakeholder management" },
  { emoji: "🏃", name: "Resilience" },
];

function PersonaTransferableSkills({ interests }: { interests: string[] }) {
  const isMilitary = interests.includes('military');
  const isCareerBreak = interests.includes('career_break');
  if (!isMilitary && !isCareerBreak) return null;

  return (
    <>
      {isMilitary && (
        <motion.div
          className="mb-6 bg-white border border-border rounded-xl overflow-hidden"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.19 }}
        >
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base" aria-hidden="true">🎖️</span>
              <p className="text-xs text-muted-foreground font-medium">Forces service: transferable skills</p>
            </div>
            <p className="text-sm text-foreground font-medium mb-1">
              Your military experience builds skills that civilian employers value highly.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              The leadership, operational planning, and cross-cultural experience you gained in service translates directly into roles in management, logistics, emergency services, training, and public sector work, even if employers don't know military context.
            </p>
            <div className="flex flex-wrap gap-2">
              {MILITARY_TRANSFERABLE_SKILLS.map(s => (
                <span
                  key={s.name}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af" }}
                >
                  {s.emoji} {s.name}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      )}
      {isCareerBreak && (
        <motion.div
          className="mb-6 bg-white border border-border rounded-xl overflow-hidden"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base" aria-hidden="true">🔄</span>
              <p className="text-xs text-muted-foreground font-medium">Career break: transferable skills</p>
            </div>
            <p className="text-sm text-foreground font-medium mb-1">
              Your career break was a period of active contribution, not absence.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              Managing care, coordinating with schools and health services, and advocating for dependants builds real, employer-recognised skills. The Sidekick can help you frame this period on your CV and prepare answers to interview questions about the gap.
            </p>
            <div className="flex flex-wrap gap-2">
              {CAREER_BREAK_TRANSFERABLE_SKILLS.map(s => (
                <span
                  key={s.name}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d" }}
                >
                  {s.emoji} {s.name}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </>
  );
}

export default function Results() {
  const [, setLocation] = useLocation();
  const { result, input, locationMeta, interests } = useWizard();
  const saveMutation = useSaveImpact();
  const { toast } = useToast();
  const { isLoggedIn, user } = useAuth();
  const { setOpen: openSidekick } = useSidekick();
  const [exporting, setExporting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [chosenPeriod, setChosenPeriod] = useState("");
  const [customPeriod, setCustomPeriod] = useState("");
  const [statementCopied, setStatementCopied] = useState(false);

  // Compute period presets from today's date
  const now = new Date();
  const month = now.getMonth() + 1; // 1–12
  const year = now.getFullYear();
  const monthLabel = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const termLabel = month >= 9 ? `Autumn Term ${year}` : month >= 5 ? `Summer Term ${year}` : `Spring Term ${year}`;
  const academicYear = month >= 9 ? `${year}/${String(year + 1).slice(2)}` : `${year - 1}/${String(year).slice(2)}`;
  const PERIOD_PRESETS = [
    { label: "This month", value: monthLabel },
    { label: "Current term", value: termLabel },
    { label: "Academic year", value: `Academic Year ${academicYear}` },
  ];

  useEffect(() => {
    if (!result) setLocation("/wizard/actions");
  }, [result, setLocation]);

  if (!result) return null;

  const handleSave = async (period: string) => {
    if (!isLoggedIn) {
      setLocation("/login?from=/results");
      return;
    }
    try {
      await saveMutation.mutateAsync({
        data: {
          userId: user?.id ?? "",
          name: "My Impact Record",
          period: period || undefined,
          impactResult: result,
          activities: input.activities,
          donationsGBP: input.donationsGBP,
          additionalVolunteerHours: input.additionalVolunteerHours,
          ...(locationMeta ? {
            region: locationMeta.region,
            outwardCode: locationMeta.outwardCode,
            lat: locationMeta.lat,
            lng: locationMeta.lng,
          } : {}),
        },
      });
      setSaved(true);
      setShowSaveDialog(false);
      toast({ title: "Saved!", description: period ? `Your ${period} record has been saved.` : "Your impact record has been added to your history." });
    } catch {
      toast({ title: "Unable to save", description: "Something went wrong. Are you logged in?", variant: "destructive" });
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
  const shareUrl = "https://myimpact.replit.com";

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
              <Award className="w-3 h-3" aria-hidden="true" /> All badges
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
            <figure className="bg-white border border-border rounded-xl p-4 m-0">
              <figcaption className="text-xs font-semibold text-muted-foreground mb-3">By activity</figcaption>
              <div role="img" aria-label="Donut chart showing social value breakdown by activity">
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
              </div>
              <div className="space-y-1 mt-1">
                {result.activityBreakdowns.map((a: any) => (
                  <div key={a.activityId} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.sdgColor || "#F06127" }} aria-hidden="true" />
                    <span className="truncate flex-1">{a.activityName}</span>
                    <span className="font-medium text-foreground shrink-0">{formatCurrency(a.impactValue)}</span>
                  </div>
                ))}
              </div>
            </figure>
          )}

          {/* SDG donut */}
          {result.sdgBreakdowns.length > 0 && (
            <figure className="bg-white border border-border rounded-xl p-4 m-0">
              <figcaption className="text-xs font-semibold text-muted-foreground mb-3">By SDG</figcaption>
              <div role="img" aria-label="Donut chart showing social value breakdown by Sustainable Development Goal">
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
              </div>
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
            </figure>
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

      {/* Persona-specific transferable skills */}
      <PersonaTransferableSkills interests={interests} />

      {/* Use case sections */}
      <motion.div
        className="mb-4 space-y-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
      >
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Use your impact</p>

        {/* Impact Statement */}
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-4 h-4 shrink-0" style={{ color: "#C5192D" }} aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">Your Impact Statement</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              Use this in your UCAS personal statement, CV, or job application. Copy and adapt it to fit your context. It gives you a verified, specific number to stand behind.
            </p>
            <textarea
              readOnly
              value={generateCVText(result, interests)}
              rows={5}
              className="w-full px-3 py-2.5 rounded-lg border border-border text-sm text-foreground bg-muted/20 resize-none focus:outline-none leading-relaxed"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(generateCVText(result, interests)).then(() => {
                  setStatementCopied(true);
                  setTimeout(() => setStatementCopied(false), 2500);
                }).catch(() => {
                  toast({ title: "Could not copy", description: "Please select the text manually and copy it.", variant: "destructive" });
                });
              }}
              className="mt-2.5 flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted/30 transition-all"
            >
              {statementCopied
                ? <><ClipboardCheck className="w-3.5 h-3.5 text-green-600" aria-hidden="true" /> Copied!</>
                : <><Clipboard className="w-3.5 h-3.5" aria-hidden="true" /> Copy statement</>
              }
            </button>
          </div>
        </div>

        {/* Share Your Impact */}
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Share2 className="w-4 h-4 shrink-0" style={{ color: "#E8633A" }} aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">Share Your Impact</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              Download a shareable impact card or post to social media and show the world what your time and effort is worth.
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleExportPNG}
                disabled={exporting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted/30 transition-all disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                {exporting ? "Exporting…" : "Download PNG card"}
              </button>
              <button
                onClick={handleNativeShare}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted/30 transition-all"
              >
                <Share2 className="w-3.5 h-3.5" aria-hidden="true" /> Share
              </button>
            </div>
            {shareOpen && (
              <div className="mt-2 bg-white border border-border rounded-lg shadow-sm py-1 min-w-[160px] z-50 inline-block">
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                >
                  <Twitter className="w-3.5 h-3.5 text-sky-500" aria-hidden="true" /> Share on X
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}&summary=${encodeURIComponent(shareText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                >
                  <Linkedin className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" /> Share on LinkedIn
                </a>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Sidekick prompt */}
      <motion.div
        className="mb-6 rounded-xl border border-border overflow-hidden"
        style={{ background: "linear-gradient(135deg, #f0f9ff 0%, #fefce8 100%)" }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <div className="px-5 py-4 flex items-center gap-4">
          <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#F06127" }}>
            <MessageSquare className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground mb-0.5">Want help putting this into your own words?</p>
            <p className="text-xs text-muted-foreground leading-snug">Ask the sidekick to tailor your impact for a specific job, course, or statement.</p>
          </div>
          <button
            onClick={() => openSidekick(true)}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white transition-all hover:-translate-y-px"
            style={{ background: "#F06127", boxShadow: "0 2px 8px #F0612730" }}
          >
            Ask sidekick <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
      </motion.div>

      {/* Fixed action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border" style={{ background: "white", boxShadow: "0 -4px 24px rgba(0,0,0,0.10)" }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2.5 flex-wrap sm:flex-nowrap">

          {/* Save — primary action, always prominent */}
          <button
            onClick={() => !saved && setShowSaveDialog(true)}
            disabled={saveMutation.isPending || saved}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-60 shrink-0 hover:-translate-y-px"
            style={{
              background: saved ? "#22c55e" : "#213547",
              boxShadow: saved ? "0 2px 12px #22c55e40" : "0 2px 12px #21354740",
            }}
          >
            {saved ? <Check className="w-4 h-4" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
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
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            {exporting ? "Exporting…" : "Download PNG"}
          </button>

          <div className="relative shrink-0">
            <button
              onClick={handleNativeShare}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:border-foreground/40 hover:bg-muted/30 transition-all"
            >
              <Share2 className="w-3.5 h-3.5" aria-hidden="true" /> Share
            </button>
            {shareOpen && (
              <div className="absolute bottom-full mb-2 left-0 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[160px] z-50">
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                >
                  <Twitter className="w-3.5 h-3.5 text-sky-500" aria-hidden="true" /> Share on X
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}&summary=${encodeURIComponent(shareText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                >
                  <Linkedin className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" /> Share on LinkedIn
                </a>
              </div>
            )}
          </div>

          <Link
            href="/journal"
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:border-foreground/40 hover:bg-muted/30 transition-all shrink-0"
          >
            <BookOpen className="w-3.5 h-3.5" aria-hidden="true" /> Journal
          </Link>

          {/* Ideas CTA — grows to fill remaining space */}
          <Link
            href="/suggestions"
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white whitespace-nowrap transition-all hover:-translate-y-px"
            style={{ background: "#E8633A", boxShadow: "0 2px 12px #E8633A40" }}
          >
            Get personalised ideas <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>

        </div>
      </div>

      {/* Period picker dialog */}
      {showSaveDialog && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={() => setShowSaveDialog(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md mx-auto p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-foreground mb-1">What period does this cover?</h2>
            <p className="text-xs text-muted-foreground mb-5">
              Label this record so you can track progress across different periods over time.
            </p>

            {/* Preset chips */}
            <div className="flex flex-wrap gap-2 mb-4">
              {PERIOD_PRESETS.map(p => (
                <button
                  key={p.value}
                  onClick={() => { setChosenPeriod(p.value); setCustomPeriod(""); }}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
                  style={chosenPeriod === p.value
                    ? { background: "#213547", color: "white", borderColor: "#213547" }
                    : { background: "white", color: "hsl(var(--foreground))", borderColor: "hsl(var(--border))" }
                  }
                >
                  <span className="text-muted-foreground text-[10px] mr-1">{p.label}</span>
                  {p.value}
                </button>
              ))}
            </div>

            {/* Custom input */}
            <div className="mb-5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 block">
                Or enter a custom label
              </label>
              <input
                type="text"
                value={customPeriod}
                onChange={e => { setCustomPeriod(e.target.value); setChosenPeriod(""); }}
                placeholder='e.g. "Summer holiday 2026" or "Year 12"'
                className="w-full px-3 py-2 rounded-lg border border-border text-sm text-foreground bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/30 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSave(customPeriod || chosenPeriod)}
                disabled={saveMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-60"
                style={{ background: "#213547" }}
              >
                {saveMutation.isPending ? "Saving…" : "Save record"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
