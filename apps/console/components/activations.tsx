"use client";

import { useEffect, useRef, useState } from "react";
import type { ActivationSent, ClientActivation } from "@vigie/shared";
import { ApiError, api } from "@/lib/api";
import { Badge, Icon, dateFr } from "@/components/ui";
import { QrCode } from "@/components/qr";

/** Lien d'activation (développement) : QR code à faire scanner en agence + bouton Copier. En production, seul le SMS porte le lien. */
function DevLink({ sent }: { sent: ActivationSent }) {
  const [copied, setCopied] = useState(false);
  if (!sent.link || !sent.webLink) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sent.webLink!);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="invite">
      <div className="stack">
        <span className="faint">Mode développement : le lien n'est affiché que hors production.</span>
        <code style={{ overflowWrap: "anywhere", fontSize: 13 }}>{sent.webLink}</code>
        <div>
          <button type="button" className="btn secondary" onClick={() => void copy()}>
            {copied ? "Lien copié" : "Copier le lien"}
          </button>
        </div>
      </div>
      <QrCode value={sent.link} label="QR code d'activation du compte client" size={132} />
    </div>
  );
}

/** « Nouveau client » : la banque crée le compte, le client reçoit un SMS avec un lien d'activation. */
export function NewClient({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [customerRef, setCustomerRef] = useState("");
  const [errors, setErrors] = useState<{ firstName?: string; phone?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<ActivationSent | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !sent) firstRef.current?.focus();
    if (sent) headingRef.current?.focus();
  }, [open, sent]);

  const clear = () => {
    setSent(null);
    setFirstName("");
    setPhone("");
    setCustomerRef("");
    setErrors({});
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!firstName.trim()) next.firstName = "Indiquez le prénom du client.";
    if (phone.replace(/\D/g, "").length < 10) next.phone = "Saisissez un numéro de portable à 10 chiffres.";
    setErrors(next);
    if (next.firstName) return firstRef.current?.focus();
    if (next.phone) return phoneRef.current?.focus();
    setBusy(true);
    try {
      setSent(await api.createCustomer({ firstName: firstName.trim(), phone: phone.trim(), customerRef: customerRef.trim() || undefined }));
      onCreated?.();
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 400) {
        setErrors({ phone: (err as Error).message });
        phoneRef.current?.focus();
      } else setErrors({ form: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="btn big" onClick={() => setOpen(true)}>
        <Icon name="plus" size={16} /> Nouveau client
      </button>
    );
  }

  return (
    <section className="stack" style={{ gap: 20, width: "100%" }} aria-label="Nouveau client">
      <div className="row between">
        <h3 ref={headingRef} tabIndex={-1}>{sent ? "Invitation envoyée" : "Nouveau client"}</h3>
        <button type="button" className="btn ghost" onClick={() => { clear(); setOpen(false); }}>
          <Icon name="close" size={16} /> Fermer
        </button>
      </div>
      {sent ? (
        <div className="stack" role="status">
          <p className="soft">SMS envoyé à {sent.maskedPhone}. Le client appuie sur le lien : son compte est créé et relié à votre banque, sans code à saisir. Le lien est valable 72 heures.</p>
          <DevLink sent={sent} />
          <div>
            <button type="button" className="btn secondary" onClick={clear}>Ajouter un autre client</button>
          </div>
        </div>
      ) : (
        <form className="stack" onSubmit={(e) => void submit(e)} noValidate>
          <p className="soft" style={{ fontSize: 15 }}>Le client reçoit un SMS avec un lien d'activation. Aucun code à recopier.</p>
          <div className="field">
            <label htmlFor="nc-first">Prénom</label>
            <input id="nc-first" ref={firstRef} className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={40} autoComplete="off" aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? "nc-first-err" : undefined} required />
            {errors.firstName ? <p id="nc-first-err" className="error" role="alert">{errors.firstName}</p> : null}
          </div>
          <div className="field">
            <label htmlFor="nc-phone">Numéro de portable</label>
            <input id="nc-phone" ref={phoneRef} className="input" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 12 34 56 78" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "nc-phone-err" : undefined} required />
            {errors.phone ? <p id="nc-phone-err" className="error" role="alert">{errors.phone}</p> : null}
          </div>
          <div className="field">
            <label htmlFor="nc-ref">Référence client (facultatif)</label>
            <input id="nc-ref" className="input" value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} placeholder="HZ-000000" maxLength={40} />
          </div>
          {errors.form ? <p className="error" role="alert"><Icon name="alert" size={16} /> {errors.form}</p> : null}
          <div>
            <button className="btn big" disabled={busy}>{busy ? "Envoi…" : "Envoyer l'invitation par SMS"}</button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Activations en attente : statut « Invitation envoyée », renvoyer (nouveau lien) ou annuler. */
export function PendingActivations({ items, onChange }: { items: ClientActivation[]; onChange: () => void }) {
  const [error, setError] = useState("");
  const [resent, setResent] = useState<ActivationSent | null>(null);
  if (items.length === 0 && !resent) return null;
  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      const r = await fn();
      setResent(r && typeof r === "object" && "activation" in r ? (r as ActivationSent) : null);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="section" aria-label="Invitations en attente">
      <div className="card flush">
        {error ? <p className="error" role="alert" style={{ padding: 20 }}>{error}</p> : null}
        {resent ? <div style={{ padding: 20 }}><p className="soft" role="status">Nouveau SMS envoyé à {resent.maskedPhone}. L'ancien lien ne fonctionne plus.</p><DevLink sent={resent} /></div> : null}
        <table>
          <caption className="visually-hidden">Invitations envoyées, en attente d'activation</caption>
          <thead><tr><th>Client</th><th>Téléphone</th><th>Statut</th><th>Envoyée</th><th className="num"><span className="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td><span className="cell-main">{a.firstName}</span><div className="cell-sub">{a.customerRef ?? "Sans référence"}</div></td>
                <td className="tabular">{a.phone}</td>
                <td>{a.status === "pending" ? <Badge tone="warning" icon="clock" label="Invitation envoyée" /> : <Badge tone="neutral" icon="clock" label="Lien expiré" />}</td>
                <td className="soft">{dateFr(a.createdAt)}</td>
                <td className="num">
                  <button className="btn secondary" onClick={() => void act(() => api.resendActivation(a.id))}>Renvoyer</button>{" "}
                  <button className="btn secondary" onClick={() => void act(() => api.cancelActivation(a.id))}>Annuler</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
