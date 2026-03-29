import { createContext, useContext, useState, useEffect, ReactNode } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface User {
  id: string;
  email: string;
  displayName: string | null;
}

interface AuthContextType {
  isLoggedIn: boolean;
  user: User | null;
  isLoading: boolean;
  requestMagicLink: (email: string, returnTo?: string) => Promise<void>;
  demoLogin: (email: string) => Promise<User>;
  updateProfile: (fields: { displayName: string | null }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isLoggedIn: false,
  user: null,
  isLoading: true,
  requestMagicLink: async () => {},
  demoLogin: async () => { throw new Error("Not implemented"); },
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

  const requestMagicLink = async (email: string, returnTo?: string) => {
    const res = await fetch(`${BASE}/api/auth/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, returnTo: returnTo ?? null }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Failed to send magic link");
    }
  };

  const demoLogin = async (email: string): Promise<User> => {
    const res = await fetch(`${BASE}/api/auth/demo-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Demo login failed");
    }
    const u: User = { ...data.user, displayName: data.user.displayName ?? null };
    setUser(u);
    return u;
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
