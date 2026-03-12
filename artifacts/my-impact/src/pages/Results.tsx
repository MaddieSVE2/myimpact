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
      <summary className="flex items-center justify-between p-4 cursor-pointer font-medium select-none text-foreground hover:bg-secondary/30 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-secondary text-foreground rounded-md">
            <Icon className="w-4 h-4" />
          </div>
          {title}
        </div>
        <ChevronDown className="w-4 h-4 text-muted-foreground group-open:rotate-180 transition-transform" />
      </summary>
      <div className="p-4 pt-0 text-sm text-muted-foreground border-t border-border/50 bg-background leading-relaxed">
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
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary text-foreground text-xs font-medium mb-3">
          <Trophy className="w-3.5 h-3.5 text-primary" /> Your Social Value
        </div>
        <h1 className="text-5xl md:text-6xl font-display font-bold text-foreground tracking-tight mb-3">
          {formatCurrency(result.totalValue)}
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          That's the equivalent financial value of the good you've done for society over the last year.
        </p>
      </motion.div>

      {/* Primary Value Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <div className="bg-white border border-border p-5 rounded-xl border-t-2 border-t-primary relative overflow-hidden group">
          <div className="text-primary mb-2"><TrendingUp className="w-5 h-5" /></div>
          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Direct Impact</p>
          <p className="text-2xl font-display font-semibold">{formatCurrency(result.impactValue)}</p>
        </div>
        <div className="bg-white border border-border p-5 rounded-xl border-t-2 border-t-blue-500">
          <div className="text-blue-500 mb-2"><UserPlus className="w-5 h-5" /></div>
          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Contribution</p>
          <p className="text-2xl font-display font-semibold">{formatCurrency(result.contributionValue)}</p>
        </div>
        <div className="bg-white border border-border p-5 rounded-xl border-t-2 border-t-green-500">
          <div className="text-green-500 mb-2"><HandCoins className="w-5 h-5" /></div>
          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Donations</p>
          <p className="text-2xl font-display font-semibold">{formatCurrency(result.donationsValue)}</p>
        </div>
        <div className="bg-white border border-border p-5 rounded-xl border-t-2 border-t-accent">
          <div className="text-foreground mb-2"><Trophy className="w-5 h-5" /></div>
          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Personal Dev</p>
          <p className="text-2xl font-display font-semibold">{formatCurrency(result.personalDevelopmentValue)}</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
        <div className="bg-white border border-border p-6 rounded-xl">
          <h3 className="text-lg font-semibold mb-4 font-display">Value by Activity</h3>
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

        <div className="bg-white border border-border p-6 rounded-xl">
          <h3 className="text-lg font-semibold mb-4 font-display">SDG Alignment</h3>
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
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-xl font-display font-semibold">What do these numbers mean?</h2>
        </div>
        <div className="space-y-3">
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
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-xl bg-white border border-border p-3 rounded-xl shadow-lg flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 z-40">
        <button 
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-secondary text-foreground hover:bg-secondary/70 transition-colors text-sm font-medium disabled:opacity-50"
        >
          <Save className="w-4 h-4" /> Save Record
        </button>
        <Link 
          href="/suggestions"
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-md bg-primary text-white text-sm font-medium shadow-sm hover:bg-primary/90 transition-all"
        >
          Get Activity Ideas <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
