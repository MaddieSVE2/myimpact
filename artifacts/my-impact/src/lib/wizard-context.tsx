import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { ImpactInput, SelectedActivity, ImpactResult } from '@workspace/api-client-react';

interface WizardContextType {
  input: ImpactInput;
  updateInput: (updates: Partial<ImpactInput>) => void;
  addActivity: (activity: SelectedActivity) => void;
  removeActivity: (index: number) => void;
  result: ImpactResult | null;
  setResult: (result: ImpactResult) => void;
  reset: () => void;
}

const defaultInput: ImpactInput = {
  description: '',
  activities: [],
  donationsGBP: 0,
  additionalVolunteerHours: 0,
};

const WizardContext = createContext<WizardContextType | undefined>(undefined);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [input, setInput] = useState<ImpactInput>(defaultInput);
  const [result, setResult] = useState<ImpactResult | null>(null);

  const updateInput = (updates: Partial<ImpactInput>) => {
    setInput((prev) => ({ ...prev, ...updates }));
  };

  const addActivity = (activity: SelectedActivity) => {
    setInput((prev) => ({
      ...prev,
      activities: [...prev.activities, activity],
    }));
  };

  const removeActivity = (index: number) => {
    setInput((prev) => ({
      ...prev,
      activities: prev.activities.filter((_, i) => i !== index),
    }));
  };

  const reset = () => {
    setInput(defaultInput);
    setResult(null);
  };

  return (
    <WizardContext.Provider value={{ input, updateInput, addActivity, removeActivity, result, setResult, reset }}>
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const context = useContext(WizardContext);
  if (context === undefined) {
    throw new Error('useWizard must be used within a WizardProvider');
  }
  return context;
}
