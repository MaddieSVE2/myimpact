import { useState } from "react";
import { useLocation } from "wouter";
import { useWizard } from "@/lib/wizard-context";
import { StepProgress } from "@/components/wizard/StepProgress";
import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft, Heart, Sparkles, Loader2 } from "lucide-react";
import { useCalculateImpact } from "@workspace/api-client-react";

export default function ContributionsStep() {
  const [, setLocation] = useLocation();
  const { input, updateInput, setResult } = useWizard();
  
  const [donations, setDonations] = useState<number>(input.donationsGBP || 0);
  const [hours, setHours] = useState<number>(input.additionalVolunteerHours || 0);

  const calculateMutation = useCalculateImpact();

  const handleFinish = async () => {
    const finalInput = {
      ...input,
      donationsGBP: donations,
      additionalVolunteerHours: hours
    };
    updateInput({ donationsGBP: donations, additionalVolunteerHours: hours });
    
    try {
      const res = await calculateMutation.mutateAsync({ data: finalInput });
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
        className="glass-card rounded-[2rem] p-8 md:p-12 mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center text-accent-foreground mb-6">
          <Heart className="w-8 h-8 text-accent" />
        </div>
        
        <h2 className="text-3xl font-display font-bold mb-2">Additional Contributions</h2>
        <p className="text-muted-foreground mb-8 text-lg">
          Include any monetary donations or general volunteering hours not covered in the previous step.
        </p>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
            <label className="block text-base font-bold text-foreground mb-2">
              Charitable Donations (Annual)
            </label>
            <p className="text-sm text-muted-foreground mb-4">Total estimated amount you donate to charity per year.</p>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground font-bold">£</span>
              <input 
                type="number" min="0"
                value={donations}
                onChange={e => setDonations(Number(e.target.value))}
                className="w-full py-4 pl-10 pr-4 rounded-xl bg-secondary/50 border-2 border-border focus:border-primary focus:bg-white outline-none transition-all font-bold text-lg"
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
            <label className="block text-base font-bold text-foreground mb-2">
              General Volunteering Hours (Annual)
            </label>
            <p className="text-sm text-muted-foreground mb-4">Any extra hours spent helping others not captured in specific activities.</p>
            <div className="relative">
              <input 
                type="number" min="0"
                value={hours}
                onChange={e => setHours(Number(e.target.value))}
                className="w-full py-4 px-4 rounded-xl bg-secondary/50 border-2 border-border focus:border-primary focus:bg-white outline-none transition-all font-bold text-lg"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">hours</span>
            </div>
          </div>
        </div>

      </motion.div>

      <div className="flex justify-between items-center">
        <button
          onClick={() => setLocation("/wizard/activities")}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white border border-border text-foreground font-bold hover:bg-muted transition-all"
        >
          <ArrowLeft className="w-5 h-5" /> Back
        </button>
        <button
          onClick={handleFinish}
          disabled={calculateMutation.isPending}
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-foreground text-white font-bold hover:bg-foreground/90 hover:-translate-y-0.5 transition-all shadow-xl disabled:opacity-70"
        >
          {calculateMutation.isPending ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Calculating...</>
          ) : (
            <><Sparkles className="w-5 h-5 text-accent" /> Reveal My Impact</>
          )}
        </button>
      </div>
    </div>
  );
}
