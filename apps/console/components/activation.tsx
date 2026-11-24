"use client";

import { useState } from "react";
import type { ActivationLink } from "@vigie/shared";
import { Icon } from "@/components/ui";

/** Lien d'activation copiable. En production, le lien part par e-mail et n'est pas affiché. */
export function ActivationBox({ who, activation, onClose }: { who: string; activation: ActivationLink; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const expires = new Date(activation.expiresAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="card flat stack" role="status">
      <strong>Lien d'activation pour {who}</strong>
      {activation.link ? (
        <>
          <input className="input" readOnly value={activation.link} aria-label="Lien d'activation" onFocus={(e) => e.currentTarget.select()} />
          {copyError ? <p className="soft">Sélectionnez le lien pour le copier manuellement.</p> : null}
          <div className="row">
            <button
              className="btn"
              onClick={async () => {
                try { await navigator.clipboard.writeText(activation.link!); setCopied(true); setCopyError(false); }
                catch { setCopyError(true); }
              }}
            >
              <Icon name="link" size={16} /> {copied ? "Lien copié" : "Copier le lien"}
            </button>
            <button className="btn secondary" onClick={onClose}>
              Fermer
            </button>
          </div>
        </>
      ) : (
        <p className="soft">Le service d’envoi des liens doit être configuré pour remettre cette invitation.</p>
      )}
      <p className="faint">Valable jusqu'au {expires}, à usage unique. Transmettez-le uniquement à cette personne.</p>
    </div>
  );
}
