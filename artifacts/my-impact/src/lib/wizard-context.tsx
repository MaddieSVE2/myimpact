import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
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
  { id: 'caring', label: 'Caring for family', emoji: '🤲', category: 'Health' },
  { id: 'military', label: 'Military / Forces service', emoji: '🎖️', category: 'Community' },
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

export interface LocationMeta {
  region: string;
  outwardCode: string;
  lat: number;
  lng: number;
}

export interface ActivitySelectionDraft {
  selectedIds: string[];
  quantities: Record<string, number>;
  hours: Record<string, number>;
  phase: 'select' | 'quantify';
  quantifyIndex: number;
}

interface WizardState {
  location: string;
  locationMeta: LocationMeta | null;
  interests: string[];
  customInterest: string;
  careerBreak: boolean;
  input: ImpactInput;
  customActivities: CustomActivityDetail[];
  result: ImpactResult | null;
  activitySelection: ActivitySelectionDraft;
}

interface WizardContextType extends WizardState {
  setLocation: (location: string) => void;
  setLocationMeta: (meta: LocationMeta | null) => void;
  setCustomInterest: (val: string) => void;
  toggleInterest: (interestId: string) => void;
  setCareerBreak: (val: boolean) => void;
  updateInput: (updates: Partial<ImpactInput>) => void;
  addActivity: (activity: SelectedActivity) => void;
  removeActivity: (index: number) => void;
  addCustomActivity: (detail: CustomActivityDetail) => void;
  removeCustomActivity: (activityId: string) => void;
  setResult: (result: ImpactResult) => void;
  reset: () => void;
  clearDraft: () => void;
  hasDraft: boolean;
  setActivitySelection: (sel: Partial<ActivitySelectionDraft>) => void;
}

const defaultInput: ImpactInput = {
  description: '',
  activities: [],
  donationsGBP: 0,
  additionalVolunteerHours: 0,
};

const defaultActivitySelection: ActivitySelectionDraft = {
  selectedIds: [],
  quantities: {},
  hours: {},
  phase: 'select',
  quantifyIndex: 0,
};

const defaultState: WizardState = {
  location: '',
  locationMeta: null,
  interests: [],
  customInterest: '',
  careerBreak: false,
  input: defaultInput,
  customActivities: [],
  result: null,
  activitySelection: defaultActivitySelection,
};

const DRAFT_KEY = 'wizard_draft_v1';

function loadDraft(): WizardState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as WizardState;
  } catch {
    return null;
  }
}

function saveDraft(state: WizardState) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

function removeDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

const WizardContext = createContext<WizardContextType | undefined>(undefined);

function getInitialState(): { state: WizardState; hasDraft: boolean } {
  const draft = loadDraft();
  if (draft) {
    const legacyInterests: string[] = draft.interests ?? [];
    const hadLegacyCareerBreak = legacyInterests.includes('career_break');
    const sanitizedInterests = legacyInterests.filter(id =>
      INTEREST_OPTIONS.some(o => o.id === id)
    );
    return {
      state: {
        location: draft.location ?? '',
        locationMeta: draft.locationMeta ?? null,
        interests: sanitizedInterests,
        customInterest: draft.customInterest ?? '',
        careerBreak: draft.careerBreak ?? hadLegacyCareerBreak,
        input: draft.input ?? defaultInput,
        customActivities: draft.customActivities ?? [],
        result: null,
        activitySelection: draft.activitySelection ?? defaultActivitySelection,
      },
      hasDraft: true,
    };
  }
  return { state: defaultState, hasDraft: false };
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const [{ state: initialState, hasDraft: initialHasDraft }] = useState(getInitialState);

  const [hasDraft, setHasDraft] = useState(initialHasDraft);
  const [location, setLocationState] = useState(initialState.location);
  const [locationMeta, setLocationMetaState] = useState<LocationMeta | null>(initialState.locationMeta);
  const [interests, setInterests] = useState<string[]>(initialState.interests);
  const [customInterest, setCustomInterestState] = useState(initialState.customInterest);
  const [careerBreak, setCareerBreakState] = useState<boolean>(initialState.careerBreak);
  const [input, setInput] = useState<ImpactInput>(initialState.input);
  const [customActivities, setCustomActivities] = useState<CustomActivityDetail[]>(initialState.customActivities);
  const [result, setResultState] = useState<ImpactResult | null>(null);
  const [activitySelection, setActivitySelectionState] = useState<ActivitySelectionDraft>(initialState.activitySelection);

  const setActivitySelection = useCallback((sel: Partial<ActivitySelectionDraft>) => {
    setActivitySelectionState(prev => ({ ...prev, ...sel }));
  }, []);

  useEffect(() => {
    if (result !== null) return;
    const hasProgress = !!(location || interests.length > 0 || customInterest || careerBreak ||
      input.activities.length > 0 || input.donationsGBP > 0 ||
      input.additionalVolunteerHours > 0 || customActivities.length > 0 ||
      activitySelection.selectedIds.length > 0);
    if (hasProgress) {
      saveDraft({ location, locationMeta, interests, customInterest, careerBreak, input, customActivities, result, activitySelection });
    } else {
      removeDraft();
      setHasDraft(false);
    }
  }, [location, locationMeta, interests, customInterest, careerBreak, input, customActivities, result, activitySelection]);

  const setLocation = (loc: string) => setLocationState(loc);
  const setLocationMeta = (meta: LocationMeta | null) => setLocationMetaState(meta);
  const setCustomInterest = (val: string) => setCustomInterestState(val);
  const setCareerBreak = (val: boolean) => setCareerBreakState(val);

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

  const setResult = (r: ImpactResult) => {
    setResultState(r);
    setActivitySelectionState(defaultActivitySelection);
    removeDraft();
    setHasDraft(false);
  };

  const reset = () => {
    setLocationState('');
    setLocationMetaState(null);
    setInterests([]);
    setCustomInterestState('');
    setCareerBreakState(false);
    setInput(defaultInput);
    setCustomActivities([]);
    setResultState(null);
    setActivitySelectionState(defaultActivitySelection);
    removeDraft();
    setHasDraft(false);
  };

  const clearDraft = useCallback(() => {
    setLocationState('');
    setLocationMetaState(null);
    setInterests([]);
    setCustomInterestState('');
    setCareerBreakState(false);
    setInput(defaultInput);
    setCustomActivities([]);
    setResultState(null);
    setActivitySelectionState(defaultActivitySelection);
    removeDraft();
    setHasDraft(false);
  }, []);

  return (
    <WizardContext.Provider value={{
      location, locationMeta, interests, customInterest, careerBreak, input, customActivities, result, activitySelection,
      setLocation, setLocationMeta, setCustomInterest, toggleInterest, setCareerBreak, updateInput,
      addActivity, removeActivity, addCustomActivity, removeCustomActivity, setResult, reset,
      clearDraft, hasDraft, setActivitySelection,
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
