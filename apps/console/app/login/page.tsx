"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui";

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
      await api.login(email, password);
      router.replace("/");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <section className="login-art" aria-hidden="true">
        <div className="row">
          <div className="brand-mark" style={{ background: "rgba(255,255,255,0.16)" }}>
            <Icon name="shield" color="#fff" />
          </div>
          <strong style={{ fontSize: 22 }}>Vigie · Console conseiller</strong>
        </div>
        <div className="stack" style={{ gap: 20, maxWidth: 480, position: "relative", zIndex: 1 }}>
          <h1 style={{ fontSize: 52 }}>Vos clients savent que c'est bien vous.</h1>
          <p style={{ fontSize: 20, opacity: 0.9 }}>
            Annoncez chaque appel dans l'application de votre client. Les escrocs qui usurpent votre numéro sont démasqués.
          </p>
        </div>
        <p style={{ opacity: 0.75, fontSize: 16 }}>Données hébergées dans l'Union européenne.</p>
      </section>

      <section className="login-form">
        <form onSubmit={submit} className="stack" style={{ width: "100%", maxWidth: 420, gap: 24 }}>
          <div className="stack" style={{ gap: 8 }}>
            <h2>Connexion</h2>
            <p className="soft">Identifiants fournis par votre établissement.</p>
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
              <Icon name="alert" size={20} /> {error}
            </p>
          ) : null}
          <button className="btn big" disabled={busy}>
            {busy ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </section>
    </main>
  );
}
