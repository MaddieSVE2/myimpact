import { createContext, useContext, useState, useEffect, ReactNode } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface User {
  id: string;
  email: string;
  displayName: string | null;
  createdAt?: string;
  emailDigestOptIn?: boolean;
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
  requestMagicLink: (email: string, returnTo?: string) => Promise<MagicLinkResult>;
  demoLogin: (email: string) => Promise<DemoLoginResult>;
  updateProfile: (fields: { displayName?: string | null; emailDigestOptIn?: boolean }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isLoggedIn: false,
  user: null,
  isLoading: true,
  requestMagicLink: async () => ({ instantLogin: false }),
  demoLogin: async () => { throw new Error("Not implemented") as Error & { status: number }; },
  updateProfile: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/api/auth/me`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const requestMagicLink = async (email: string, returnTo?: string): Promise<MagicLinkResult> => {
    const res = await fetch(`${BASE}/api/auth/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, returnTo: returnTo ?? null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to send magic link");
    }
    if (data.instantLogin && data.user) {
      const u: User = { ...data.user, displayName: data.user.displayName ?? null };
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
    setUser(u);
    return { user: u, orgRedirect: !!data.orgRedirect };
  };

  const updateProfile = async (fields: { displayName: string | null }) => {
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
