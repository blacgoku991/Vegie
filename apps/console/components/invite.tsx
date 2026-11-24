"use client";

import { useEffect, useState } from "react";
import type { ClientInvite } from "@vigie/shared";
import { ApiError, api } from "@/lib/api";
import { Icon } from "@/components/ui";
import { QrCode } from "@/components/qr";

const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** Code à 6 chiffres + QR code, avec le décompte de validité. */
export function InviteCard({ invite }: { invite: ClientInvite }) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.round((Date.parse(invite.expiresAt) - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [invite]);
  if (left <= 0) return <p className="error">Ce code a expiré.</p>;
  return (
    <div className="invite">
      <div>
        <span className="faint">Code à saisir dans l'application</span>
        <strong className="invite-code">{spaced(invite.code)}</strong>
        <span className="invite-timer">
          <Icon name="clock" size={14} />
          Valable encore {Math.floor(left / 60)} min {String(left % 60).padStart(2, "0")} s, pour un seul client
        </span>
      </div>
      <QrCode value={invite.link} label={`QR code d'invitation, code ${invite.code}`} size={132} />
    </div>
  );
}

/** « Inviter un client » : code à 6 chiffres + QR code, valables 15 minutes. */
export function InviteClient({ defaultOpen = false, onCreated }: { defaultOpen?: boolean; onCreated?: () => void }) {
  const [open, setOpen] = useState(defaultOpen);
  const [clientPhone, setClientPhone] = useState("");
  const [customerRef, setCustomerRef] = useState("");
  const [invite, setInvite] = useState<ClientInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      setInvite(await api.invite(clientPhone.trim(), customerRef.trim()));
      onCreated?.();
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(
        status === 429
          ? "Trop d'invitations ouvertes : attendez qu'elles expirent."
          : status === 400
            ? `Numéro invalide ou demande incomplète. ${(err as Error).message}`
            : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setOpen(false);
    setInvite(null);
    setCustomerRef("");
    setClientPhone("");
    setError(null);
  };

  if (!open) {
    return (
      <button className="btn big" onClick={() => setOpen(true)}>
        <Icon name="plus" size={16} /> Inviter un client
      </button>
    );
  }

  return (
    <section className="stack" style={{ gap: 20, width: "100%" }} aria-label="Inviter un client">
      <div className="row between">
        <h3>Code de liaison</h3>
        <button className="btn ghost" onClick={close}>
          <Icon name="close" size={16} /> Fermer
        </button>
      </div>
      {!invite ? (
        <div className="stack">
          <p className="soft" style={{ fontSize: 15 }}>Le client saisit le code (ou scanne le QR code) dans l'application SmartSecure : son compte est lié à votre banque aussitôt.</p>
          <div className="field">
            <label htmlFor="invite-phone">Numéro de téléphone du client</label>
            <input id="invite-phone" className="input" type="tel" inputMode="tel" autoComplete="off" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="06 12 34 56 78" required />
            <p className="faint">Le code ne fonctionne que depuis l'application de ce numéro.</p>
          </div>
          <div className="field">
            <label htmlFor="invite-ref">Référence client (facultatif)</label>
            <input id="invite-ref" className="input" value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} placeholder="HZ-000000" maxLength={40} />
          </div>
          <div>
            <button className="btn big" disabled={busy || clientPhone.replace(/\D/g, "").length < 10} onClick={create}>
              Générer le code
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <p className="soft">Invitation pour le {clientPhone}</p>
          <InviteCard invite={invite} />
          <div>
            <button className="btn secondary" onClick={() => setInvite(null)}>
              Préparer une invitation
            </button>
          </div>
        </div>
      )}
      {error ? (
        <p className="error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      ) : null}
    </section>
  );
}
