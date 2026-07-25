import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setSentryUser } from "@/lib/sentry";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type VoicePersona = "alloy" | "nova" | "shimmer" | "echo" | "fable" | "onyx";

interface User {
  id: string;
  email: string;
  displayName: string | null;
  createdAt?: string;
  emailDigestOptIn?: boolean;
  voiceEnabled?: boolean;
  voicePersona?: VoicePersona;
  preferredLocale?: "en" | "cy";
  gamificationEnabled?: boolean;
}

interface DemoLoginResult {
  user: User;
  orgRedirect: boolean;
}

interface MagicLinkResult {
  instantLogin: boolean;
  user?: User;
  orgRedirect?: boolean;
}

interface AuthContextType {
  isLoggedIn: boolean;
  user: User | null;
  isLoading: boolean;
  requestMagicLink: (
    email: string,
    returnTo?: string,
    options?: { marketingOptIn?: boolean; birthMonth?: number | null; birthYear?: number | null },
  ) => Promise<MagicLinkResult>;
  demoLogin: (email: string) => Promise<DemoLoginResult>;
  updateProfile: (fields: {
    displayName?: string | null;
    emailDigestOptIn?: boolean;
    voiceEnabled?: boolean;
    voicePersona?: VoicePersona;
    preferredLocale?: "en" | "cy";
    gamificationEnabled?: boolean;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isLoggedIn: false,
  user: null,
  isLoading: true,
  requestMagicLink: async (_e: string, _r?: string, _o?: { marketingOptIn?: boolean; birthMonth?: number | null; birthYear?: number | null }) => ({ instantLogin: false }),
  demoLogin: async () => { throw new Error("Not implemented") as Error & { status: number }; },
  updateProfile: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    fetch(`${BASE}/api/auth/me`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    setSentryUser(user ? { id: user.id } : null);
  }, [user]);

  const requestMagicLink = async (
    email: string,
    returnTo?: string,
    options?: { marketingOptIn?: boolean; birthMonth?: number | null; birthYear?: number | null },
  ): Promise<MagicLinkResult> => {
    const res = await fetch(`${BASE}/api/auth/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email,
        returnTo: returnTo ?? null,
        marketingOptIn: options?.marketingOptIn === true,
        birthMonth: options?.birthMonth ?? null,
        birthYear: options?.birthYear ?? null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to send magic link");
    }
    if (data.instantLogin && data.user) {
      const u: User = { ...data.user, displayName: data.user.displayName ?? null };
      // Clear cached queries before switching accounts so no data from a
      // previously signed-in user can leak into the new session.
      queryClient.clear();
      setUser(u);
      return { instantLogin: true, user: u, orgRedirect: !!data.orgRedirect };
    }
    return { instantLogin: false };
  };

  const demoLogin = async (email: string): Promise<DemoLoginResult> => {
    if (import.meta.env.VITE_ENABLE_DEMO_LOGIN !== "true") {
      const err = new Error("Demo login is not available") as Error & { status: number };
      err.status = 403;
      throw err;
    }
    const res = await fetch(`${BASE}/api/auth/demo-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error ?? "Demo login failed") as Error & { status: number };
      err.status = res.status;
      throw err;
    }
    const u: User = { ...data.user, displayName: data.user.displayName ?? null };
    // Clear cached queries before switching accounts so no data from a
    // previously signed-in user can leak into the new session.
    queryClient.clear();
    setUser(u);
    return { user: u, orgRedirect: !!data.orgRedirect };
  };

  const updateProfile = async (fields: {
    displayName?: string | null;
    emailDigestOptIn?: boolean;
    voiceEnabled?: boolean;
    voicePersona?: VoicePersona;
    preferredLocale?: "en" | "cy";
    gamificationEnabled?: boolean;
  }) => {
    const res = await fetch(`${BASE}/api/auth/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(fields),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to update profile");
    }
    setUser(data.user);
  };

  const logout = async () => {
    await fetch(`${BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
    setUser(null);
    // Drop all cached query data so the next account never sees the previous
    // account's organisation members, activities or stats.
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn: !!user, user, isLoading, requestMagicLink, demoLogin, updateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
