import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Me } from "@vigie/shared";
import { API_URL, api, setApiToken } from "./api";
import { protection } from "./protection";
import { secure } from "./storage";

const TOKEN_KEY = "vigie.session";

interface AuthState {
  status: "loading" | "signedOut" | "signedIn";
  me: Me | null;
  signIn: (token: string, me: Me) => Promise<void>;
  signOut: () => Promise<void>;
  setMe: (me: Me) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    void (async () => {
      const token = await secure.get(TOKEN_KEY);
      if (!token) return setStatus("signedOut");
      setApiToken(token);
      try {
        setMe(await api.me());
        protection.setSession(API_URL, token);
        setStatus("signedIn");
      } catch (err) {
        // Hors ligne : on garde la session, l'écran d'accueil réessaiera.
        if ((err as { status?: number }).status === 401) {
          await secure.set(TOKEN_KEY, null);
          setApiToken(null);
          setStatus("signedOut");
        } else setStatus("signedIn");
      }
    })();
  }, []);

  const signIn = useCallback(async (token: string, user: Me) => {
    await secure.set(TOKEN_KEY, token);
    setApiToken(token);
    protection.setSession(API_URL, token);
    setMe(user);
    setStatus("signedIn");
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => {});
    await secure.set(TOKEN_KEY, null);
    setApiToken(null);
    protection.setSession(API_URL, null);
    setMe(null);
    setStatus("signedOut");
  }, []);

  const value = useMemo(() => ({ status, me, signIn, signOut, setMe }), [status, me, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth hors de AuthProvider");
  return ctx;
}
