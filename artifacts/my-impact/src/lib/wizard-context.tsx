import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { ImpactInput, SelectedActivity, ImpactResult } from '@workspace/api-client-react';

export const INTEREST_OPTIONS = [
  { id: 'environment', label: 'The environment', emoji: '🌍', category: 'Environment' },
  { id: 'mental_health', label: 'Mental health', emoji: '🧠', category: 'Health' },
  { id: 'community', label: 'My community', emoji: '🤝', category: 'Community' },
  { id: 'education', label: 'Education', emoji: '📚', category: 'Education' },
  { id: 'physical_health', label: 'Physical health', emoji: '❤️', category: 'Health' },
  { id: 'fairness', label: 'Fairness & equality', emoji: '⚖️', category: 'Community' },
  { id: 'animal_welfare', label: 'Animal welfare', emoji: '🐾', category: 'Environment' },
  { id: 'children', label: 'Children & young people', emoji: '👦', category: 'Education' },
  { id: 'older_people', label: 'Older people', emoji: '👴', category: 'Community' },
  { id: 'poverty', label: 'Poverty & hunger', emoji: '🍽️', category: 'Community' },
  { id: 'arts', label: 'Arts & culture', emoji: '🎨', category: 'Community' },
  { id: 'sport', label: 'Sport & fitness', emoji: '🏃', category: 'Health' },
  { id: 'homelessness', label: 'Housing & homelessness', emoji: '🏠', category: 'Community' },
  { id: 'digital', label: 'Digital skills', emoji: '💻', category: 'Education' },
  { id: 'disability', label: 'Disability & accessibility', emoji: '♿', category: 'Community' },
  { id: 'international', label: 'International development', emoji: '🌐', category: 'Community' },
];

export interface CustomActivityDetail {
  activityId: string;
  name: string;
  quantity: number;
  hoursPerYear: number;
  valuePerUnit: number;
  unit: string;
  proxy: string;
  proxyYear: string;
  sdg: string;
  sdgColor: string;
}

interface WizardState {
  location: string;
  interests: string[];
  customInterest: string;
  input: ImpactInput;
  customActivities: CustomActivityDetail[];
  result: ImpactResult | null;
}

interface WizardContextType extends WizardState {
  setLocation: (location: string) => void;
  setCustomInterest: (val: string) => void;
  toggleInterest: (interestId: string) => void;
  updateInput: (updates: Partial<ImpactInput>) => void;
  addActivity: (activity: SelectedActivity) => void;
  removeActivity: (index: number) => void;
  addCustomActivity: (detail: CustomActivityDetail) => void;
  removeCustomActivity: (activityId: string) => void;
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
  const [location, setLocationState] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [customInterest, setCustomInterestState] = useState('');
  const [input, setInput] = useState<ImpactInput>(defaultInput);
  const [customActivities, setCustomActivities] = useState<CustomActivityDetail[]>([]);
  const [result, setResult] = useState<ImpactResult | null>(null);

  const setLocation = (loc: string) => setLocationState(loc);
  const setCustomInterest = (val: string) => setCustomInterestState(val);

  const toggleInterest = (interestId: string) => {
    setInterests(prev =>
      prev.includes(interestId) ? prev.filter(i => i !== interestId) : [...prev, interestId]
    );
  };

  const updateInput = (updates: Partial<ImpactInput>) => {
    setInput(prev => ({ ...prev, ...updates }));
  };

  const addActivity = (activity: SelectedActivity) => {
    setInput(prev => ({ ...prev, activities: [...prev.activities, activity] }));
  };

  const removeActivity = (index: number) => {
    setInput(prev => ({ ...prev, activities: prev.activities.filter((_, i) => i !== index) }));
  };

  const addCustomActivity = (detail: CustomActivityDetail) => {
    setCustomActivities(prev => [...prev, detail]);
  };

  const removeCustomActivity = (activityId: string) => {
    setCustomActivities(prev => prev.filter(a => a.activityId !== activityId));
  };

  const reset = () => {
    setLocationState('');
    setInterests([]);
    setCustomInterestState('');
    setInput(defaultInput);
    setCustomActivities([]);
    setResult(null);
  };

  return (
    <WizardContext.Provider value={{
      location, interests, customInterest, input, customActivities, result,
      setLocation, setCustomInterest, toggleInterest, updateInput,
      addActivity, removeActivity, addCustomActivity, removeCustomActivity, setResult, reset
    }}>
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const context = useContext(WizardContext);
  if (context === undefined) throw new Error('useWizard must be used within a WizardProvider');
  return context;
}
