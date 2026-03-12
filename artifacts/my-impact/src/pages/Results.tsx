import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useWizard } from "@/lib/wizard-context";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from "recharts";
import { 
  Trophy, TrendingUp, HandCoins, UserPlus, 
  ChevronDown, Save, ArrowRight, Info
} from "lucide-react";
import { useSaveImpact } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

// Simple accordion component inline for the explanations
function ExplanationAccordion({ title, content, icon: Icon }: { title: string, content: string, icon: any }) {
  return (
    <details className="group border border-border rounded-2xl bg-white overflow-hidden [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex items-center justify-between p-5 cursor-pointer font-bold select-none text-foreground hover:bg-secondary/30 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            <Icon className="w-5 h-5" />
          </div>
          {title}
        </div>
        <ChevronDown className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform" />
      </summary>
      <div className="p-5 pt-0 text-muted-foreground border-t border-border/50 bg-secondary/10 leading-relaxed">
        {content}
      </div>
    </details>
  );
}

export default function Results() {
  const [, setLocation] = useLocation();
  const { result, input } = useWizard();
  const saveMutation = useSaveImpact();
  const { toast } = useToast();

  useEffect(() => {
    if (!result) {
      setLocation("/wizard/actions");
    }
  }, [result, setLocation]);

  if (!result) return null;

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync({
        data: {
          userId: "user_demo_123", // In a real app, this comes from auth
          name: "My Impact Record",
          impactResult: result,
          activities: input.activities,
          donationsGBP: input.donationsGBP,
          additionalVolunteerHours: input.additionalVolunteerHours
        }
      });
      toast({
        title: "Impact Saved!",
        description: "Your record has been saved to your history.",
      });
    } catch (e) {
      toast({
        title: "Failed to save",
        description: "Something went wrong.",
        variant: "destructive"
      });
    }
  };

  const activityData = result.activityBreakdowns.map(a => ({
    name: a.activityName,
    value: a.impactValue,
    fill: a.sdgColor || '#F06127'
  }));

  const sdgData = result.sdgBreakdowns.map(s => ({
    name: `SDG ${s.sdg}`,
    value: s.value,
    fill: s.sdgColor
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 pb-24">
      <motion.div 
        className="text-center mb-12"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/20 text-accent-foreground font-bold text-sm mb-4">
          <Trophy className="w-4 h-4 text-accent" /> Your Social Value
        </div>
        <h1 className="text-6xl md:text-8xl font-black font-display text-foreground tracking-tighter mb-4">
          {formatCurrency(result.totalValue)}
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          That's the equivalent financial value of the good you've done for society over the last year.
        </p>
      </motion.div>

      {/* Primary Value Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
        <div className="glass-card p-6 rounded-3xl border-l-4 border-l-primary relative overflow-hidden group hover:-translate-y-1 transition-transform">
          <div className="text-primary mb-3"><TrendingUp className="w-8 h-8" /></div>
          <p className="text-sm font-bold text-muted-foreground mb-1">Direct Impact</p>
          <p className="text-3xl font-display font-black">{formatCurrency(result.impactValue)}</p>
        </div>
        <div className="glass-card p-6 rounded-3xl border-l-4 border-l-blue-500 hover:-translate-y-1 transition-transform">
          <div className="text-blue-500 mb-3"><UserPlus className="w-8 h-8" /></div>
          <p className="text-sm font-bold text-muted-foreground mb-1">Contribution</p>
          <p className="text-3xl font-display font-black">{formatCurrency(result.contributionValue)}</p>
        </div>
        <div className="glass-card p-6 rounded-3xl border-l-4 border-l-green-500 hover:-translate-y-1 transition-transform">
          <div className="text-green-500 mb-3"><HandCoins className="w-8 h-8" /></div>
          <p className="text-sm font-bold text-muted-foreground mb-1">Donations</p>
          <p className="text-3xl font-display font-black">{formatCurrency(result.donationsValue)}</p>
        </div>
        <div className="glass-card p-6 rounded-3xl border-l-4 border-l-accent hover:-translate-y-1 transition-transform">
          <div className="text-accent-foreground mb-3"><Trophy className="w-8 h-8 text-accent" /></div>
          <p className="text-sm font-bold text-muted-foreground mb-1">Personal Dev</p>
          <p className="text-3xl font-display font-black">{formatCurrency(result.personalDevelopmentValue)}</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        <div className="glass-card p-8 rounded-3xl">
          <h3 className="text-xl font-bold mb-6 font-display">Value by Activity</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={activityData}
                  cx="50%" cy="50%"
                  innerRadius={80} outerRadius={110}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {activityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card p-8 rounded-3xl">
          <h3 className="text-xl font-bold mb-6 font-display">SDG Alignment</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sdgData}
                  cx="50%" cy="50%"
                  innerRadius={80} outerRadius={110}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {sdgData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Explanations */}
      <div className="mb-16">
        <div className="flex items-center gap-2 mb-6">
          <Info className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-display font-bold">What do these numbers mean?</h2>
        </div>
        <div className="space-y-4">
          <ExplanationAccordion 
            icon={TrendingUp} title="Direct Impact" 
            content={result.explanations.impact} 
          />
          <ExplanationAccordion 
            icon={UserPlus} title="Contribution" 
            content={result.explanations.contribution} 
          />
          <ExplanationAccordion 
            icon={HandCoins} title="Donations" 
            content={result.explanations.donations} 
          />
          <ExplanationAccordion 
            icon={Trophy} title="Personal Development" 
            content={result.explanations.personalDevelopment} 
          />
        </div>
      </div>

      {/* Action Bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl bg-foreground/95 backdrop-blur-xl p-4 rounded-[2rem] shadow-2xl flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 z-40 border border-white/10">
        <button 
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors font-bold disabled:opacity-50"
        >
          <Save className="w-5 h-5" /> Save Record
        </button>
        <Link 
          href="/suggestions"
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-bold shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5 transition-all"
        >
          Get Activity Ideas <ArrowRight className="w-5 h-5" />
        </Link>
      </div>
    </div>
  );
}
