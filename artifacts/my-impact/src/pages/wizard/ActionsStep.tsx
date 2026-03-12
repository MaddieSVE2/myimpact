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
        className="bg-white border border-border shadow-sm rounded-xl p-6 md:p-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center text-primary mb-6">
          <FileText className="w-6 h-6" />
        </div>
        
        <h2 className="text-2xl font-display font-semibold mb-2">Tell us about yourself</h2>
        <p className="text-muted-foreground mb-6 text-base">
          What kind of things do you do for others? A brief description helps contextualize your impact.
        </p>

        <div className="space-y-4 mb-8">
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="E.g., I regularly volunteer at the local food bank and help my elderly neighbors with their shopping..."
            className="w-full min-h-[150px] p-4 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none text-sm"
          />
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleNext}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-md bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
          >
            Next: Add Activities <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
