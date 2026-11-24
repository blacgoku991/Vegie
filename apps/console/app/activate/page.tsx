"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActivationInfo } from "@vigie/shared";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui";

const MIN = 12;

/** Activation d'un compte : le lien (à usage unique, 72 h) donne le droit de choisir son mot de passe. */
export default function ActivatePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<ActivationInfo | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (!t) {
      setInvalid(true);
      return;
    }
    setToken(t);
    api.activationInfo(t).then(setInfo).catch(() => setInvalid(true));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (password.length < MIN) return setError(`Le mot de passe doit faire au moins ${MIN} caractères.`);
    if (password !== confirm) return setError("Les deux mots de passe ne sont pas identiques.");
    setBusy(true);
    setError(null);
    try {
      const me = await api.activate(token, password);
      router.replace(me.role === "superadmin" ? "/admin" : "/");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <div className="auth-wrap">
        <img src="/smartsecure-icon.svg" alt="SmartSecure" width={40} height={40} className="brand-logo" style={{ borderRadius: 10 }} />
        <div className="auth-card">
          {invalid ? (
            <div className="stack" style={{ gap: 8 }}>
              <h1>Lien non valable</h1>
              <p className="soft">Ce lien d'activation a expiré ou a déjà été utilisé. Demandez-en un nouveau au responsable de votre banque.</p>
            </div>
          ) : !info ? (
            <p className="soft" role="status">Vérification du lien…</p>
          ) : (
            <form onSubmit={submit} className="stack" style={{ gap: 20 }}>
              <div>
                <h1>Bienvenue, {info.name}</h1>
                <p className="sub">
                  Choisissez le mot de passe de votre compte SmartSecure ({info.bankName}). Il sert avec l'e-mail <strong style={{ color: "var(--ink)" }}>{info.email}</strong>.
                </p>
              </div>
              <div className="field">
                <label htmlFor="pw">Mot de passe ({MIN} caractères minimum)</label>
                <input id="pw" className="input" type="password" autoComplete="new-password" minLength={MIN} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="pw2">Confirmez le mot de passe</label>
                <input id="pw2" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </div>
              {error ? (
                <p className="error" role="alert">
                  <Icon name="alert" size={16} /> {error}
                </p>
              ) : null}
              <button className="btn big full" disabled={busy}>
                Activer mon compte
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
