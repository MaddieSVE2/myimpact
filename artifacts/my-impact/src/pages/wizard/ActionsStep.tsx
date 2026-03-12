import { useState } from "react";
import { useLocation } from "wouter";
import { useWizard } from "@/lib/wizard-context";
import { StepProgress } from "@/components/wizard/StepProgress";
import { motion } from "framer-motion";
import { ArrowRight, FileText } from "lucide-react";

export default function ActionsStep() {
  const [, setLocation] = useLocation();
  const { input, updateInput } = useWizard();
  const [desc, setDesc] = useState(input.description);

  const handleNext = () => {
    updateInput({ description: desc });
    setLocation("/wizard/activities");
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <StepProgress currentStep={1} />
      
      <motion.div 
        className="glass-card rounded-[2rem] p-8 md:p-12"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-6">
          <FileText className="w-8 h-8" />
        </div>
        
        <h2 className="text-3xl font-display font-bold mb-2">Tell us about yourself</h2>
        <p className="text-muted-foreground mb-8 text-lg">
          What kind of things do you do for others? A brief description helps contextualize your impact.
        </p>

        <div className="space-y-4 mb-10">
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="E.g., I regularly volunteer at the local food bank and help my elderly neighbors with their shopping..."
            className="w-full min-h-[150px] p-5 rounded-2xl bg-white border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all resize-none text-base"
          />
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleNext}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 hover:-translate-y-0.5 transition-all shadow-lg shadow-primary/25"
          >
            Next: Add Activities <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
