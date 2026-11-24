import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Me } from "@vigie/shared";
import { API_URL, api, setApiToken } from "./api";
import { callState } from "./callState";
import { saveCallbacks } from "./callbacks";
import { protection } from "./protection";
import { secure } from "./storage";

const TOKEN_KEY = "vigie.session";

interface AuthState {
  status: "loading" | "signedOut" | "signedIn";
  me: Me | null;
  accountId: string | null;
  signIn: (token: string, me: Me) => Promise<void>;
  signOut: () => Promise<void>;
  setMe: (me: Me) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [me, setMe] = useState<Me | null>(null);

  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const token = await secure.get(TOKEN_KEY);
      if (!token) return setStatus("signedOut");
      const owner = await secure.get("smartsecure.owner");
      setAccountId(owner);
      setApiToken(token, owner);
      try {
        const user = await api.me();
        setMe(user);
        setAccountId(user.id);
        setApiToken(token, user.id);
        await secure.set("smartsecure.owner", user.id);
        protection.setSession(API_URL, token);
        setStatus("signedIn");
      } catch (err) {
        // Hors ligne : on garde la session, l'écran d'accueil réessaiera.
        if ((err as { status?: number }).status === 401) {
          await secure.set(TOKEN_KEY, null);
          if (owner) await saveCallbacks(owner, null);
          await secure.set("smartsecure.owner", null);
          setAccountId(null);
          protection.setSession(API_URL, null);
          protection.setExpectedCall(null);
          callState.set(null);
          setApiToken(null);
          setStatus("signedOut");
        } else setStatus("signedIn");
      }
    })();
  }, []);

  const signIn = useCallback(async (token: string, user: Me) => {
    await secure.set(TOKEN_KEY, token);
    await secure.set("smartsecure.owner", user.id);
    setAccountId(user.id);
    setApiToken(token, user.id);
    protection.setSession(API_URL, token);
    setMe(user);
    setStatus("signedIn");
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => {});
    await secure.set(TOKEN_KEY, null);
    setApiToken(null);
    if (accountId) await saveCallbacks(accountId, null);
    await secure.set("smartsecure.owner", null);
    setAccountId(null);
    callState.set(null);
    protection.setExpectedCall(null);
    protection.setAutoHangup(false);
    await protection.syncDirectory({ version: "", bankNumbers: [], reportedNumbers: [] }).catch(() => {});
    protection.setSession(API_URL, null);
    setMe(null);
    setStatus("signedOut");
  }, [accountId]);

  const value = useMemo(() => ({ status, me, accountId, signIn, signOut, setMe }), [status, me, accountId, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth hors de AuthProvider");
  return ctx;
}
