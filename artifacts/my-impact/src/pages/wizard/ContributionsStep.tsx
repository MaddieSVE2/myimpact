import { useState } from "react";
import { useLocation } from "wouter";
import { useWizard } from "@/lib/wizard-context";
import { StepProgress } from "@/components/wizard/StepProgress";
import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft, Heart, Sparkles, Loader2 } from "lucide-react";
import { useCalculateImpact } from "@workspace/api-client-react";

export default function ContributionsStep() {
  const [, setLocation] = useLocation();
  const { input, updateInput, setResult, customActivities } = useWizard();
  
  const [donations, setDonations] = useState<number>(input.donationsGBP || 0);
  const [hours, setHours] = useState<number>(input.additionalVolunteerHours || 0);

  const calculateMutation = useCalculateImpact();

  const handleFinish = async () => {
    const finalInput = {
      ...input,
      donationsGBP: donations,
      additionalVolunteerHours: hours,
      customActivities,
    };
    updateInput({ donationsGBP: donations, additionalVolunteerHours: hours });
    
    try {
      const res = await calculateMutation.mutateAsync({ data: finalInput as any });
      setResult(res);
      setLocation("/results");
    } catch (e) {
      console.error("Calculation failed", e);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <StepProgress currentStep={3} />
      
      <motion.div 
        className="bg-white border border-border shadow-sm rounded-xl p-6 md:p-8 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center text-foreground mb-6">
          <Heart className="w-6 h-6 text-primary" />
        </div>
        
        <h2 className="text-xl font-display font-semibold mb-2">Additional contributions</h2>
        <p className="text-muted-foreground mb-8 text-sm">
          Include any monetary donations or general volunteering hours not covered in your activities.
        </p>

        <div className="space-y-4">
          <div className="bg-background p-5 rounded-lg border border-border">
            <label className="block text-sm font-medium text-foreground mb-1">
              Charitable Donations (Annual)
            </label>
            <p className="text-xs text-muted-foreground mb-3">Total estimated amount you donate to charity per year.</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground font-medium">£</span>
              <input 
                type="number" min="0"
                value={donations}
                onChange={e => setDonations(Number(e.target.value))}
                className="w-full py-2.5 pl-8 pr-3 rounded-md bg-white border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
              />
            </div>
          </div>

          <div className="bg-background p-5 rounded-lg border border-border">
            <label className="block text-sm font-medium text-foreground mb-1">
              General Volunteering Hours (Annual)
            </label>
            <p className="text-xs text-muted-foreground mb-3">Any extra hours spent helping others not captured above — including unpaid caring, befriending, or informal support for a neighbour or family member.</p>
            <div className="relative">
              <input 
                type="number" min="0"
                value={hours}
                onChange={e => setHours(Number(e.target.value))}
                className="w-full py-2.5 px-3 rounded-md bg-white border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">hours</span>
            </div>
          </div>
        </div>

      </motion.div>

      <div className="flex justify-between items-center">
        <button
          onClick={() => setLocation("/wizard/activities")}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-white border border-border text-sm text-foreground font-medium hover:bg-secondary transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={handleFinish}
          disabled={calculateMutation.isPending}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-md bg-foreground text-white text-sm font-medium hover:bg-foreground/90 transition-all shadow-sm disabled:opacity-70"
        >
          {calculateMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Calculating...</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Reveal My Impact</>
          )}
        </button>
      </div>
    </div>
  );
}
