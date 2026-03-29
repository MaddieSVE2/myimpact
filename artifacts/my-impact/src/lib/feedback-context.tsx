import { createContext, useContext, useState, ReactNode } from "react";

interface FeedbackContextType {
  feedbackMode: boolean;
  toggleFeedbackMode: () => void;
  setFeedbackMode: (on: boolean) => void;
}

const FeedbackContext = createContext<FeedbackContextType>({
  feedbackMode: false,
  toggleFeedbackMode: () => {},
  setFeedbackMode: () => {},
});

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [feedbackMode, setFeedbackMode] = useState(false);

  const toggleFeedbackMode = () => setFeedbackMode(v => !v);

  return (
    <FeedbackContext.Provider value={{ feedbackMode, toggleFeedbackMode, setFeedbackMode }}>
      {children}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  return useContext(FeedbackContext);
}
