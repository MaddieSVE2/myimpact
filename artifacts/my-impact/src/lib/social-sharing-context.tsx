import { createContext, useContext, useEffect, useState } from "react";

interface SocialSharingContextValue {
  socialSharingEnabled: boolean;
  toggleSocialSharing: () => void;
}

const SocialSharingContext = createContext<SocialSharingContextValue>({
  socialSharingEnabled: true,
  toggleSocialSharing: () => {},
});

export const SOCIAL_SHARING_STORAGE_KEY = "mi-social-sharing";
const STORAGE_KEY = SOCIAL_SHARING_STORAGE_KEY;

export function SocialSharingProvider({ children }: { children: React.ReactNode }) {
  const [socialSharingEnabled, setSocialSharingEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "false") return false;
    } catch {}
    return true;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(socialSharingEnabled));
    } catch {}
  }, [socialSharingEnabled]);

  const toggleSocialSharing = () => {
    setSocialSharingEnabled(v => !v);
  };

  return (
    <SocialSharingContext.Provider value={{ socialSharingEnabled, toggleSocialSharing }}>
      {children}
    </SocialSharingContext.Provider>
  );
}

export function useSocialSharing() {
  return useContext(SocialSharingContext);
}
