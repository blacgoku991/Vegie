"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const account = await api.login(email.trim(), password);
      router.replace(account.role === "superadmin" ? "/admin" : "/");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <div className="auth-corner"><ThemeToggle /></div>
      <div className="auth-wrap">
        <img src="/smartsecure-icon.svg" alt="SmartSecure" width={40} height={40} className="brand-logo" style={{ borderRadius: 10 }} />
        <div className="auth-card">
          <form onSubmit={submit} className="stack" style={{ gap: 20 }}>
            <div>
              <h1>Connexion à SmartSecure</h1>
              <p className="sub">Identifiants fournis par votre établissement.</p>
            </div>
            <div className="field">
              <label htmlFor="email">E-mail professionnel</label>
              <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="password">Mot de passe</label>
              <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error ? (
              <p className="error" role="alert">
                <Icon name="alert" size={16} /> {error}
              </p>
            ) : null}
            <button className="btn big full" disabled={busy}>
              {busy ? "Connexion…" : "Se connecter"}
            </button>
          </form>
        </div>
        <p className="auth-foot">Espace réservé aux conseillers et responsables de banque.</p>
      </div>
    </main>
  );
}
