import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepProgressProps {
  currentStep: number;
}

export function StepProgress({ currentStep }: StepProgressProps) {
  const steps = [
    { id: 1, name: "About you" },
    { id: 2, name: "Activities" },
    { id: 3, name: "Contributions" },
  ];

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between relative">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
          />
        </div>
        
        {steps.map((step) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const isLast = step.id === steps.length;
          const isFirst = step.id === 1;
          
          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center gap-2">
              <div 
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center font-medium text-xs transition-all duration-300 shadow-sm",
                  isCompleted ? "bg-primary text-white border-primary" : 
                  isCurrent ? "bg-white border-2 border-primary text-primary" : 
                  "bg-white border-2 border-border text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : step.id}
              </div>
              <span className={cn(
                "text-[10px] font-medium absolute top-full mt-1 transition-colors leading-tight text-center",
                isFirst ? "left-0 translate-x-0" : isLast ? "right-0 translate-x-0" : "-translate-x-1/2 left-1/2",
                isCurrent ? "text-primary" : "text-muted-foreground"
              )}>
                {step.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
